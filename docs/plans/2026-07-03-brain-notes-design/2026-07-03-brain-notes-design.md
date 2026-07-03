# `brain` — notes rapides (ajout à la v1)

**Date** : 2026-07-03
**Auteur** : Valentin Chion
**Statut** : spec — étend la [design v1](../2026-07-02-brain-design/2026-07-02-brain-design.md), ne la remplace pas.

## Problème

La v1 capture des **tâches / feedbacks** : des choses à *faire*, qui se cochent
et disparaissent. Mais il me manque un endroit pour les **notes** : tout ce que
je veux garder pour *plus tard* ou pour *me souvenir* — une commande, un lien,
une idée, un bout de doc. Ce ne sont pas des tâches : ça ne se « fait » pas, ça
n'a pas de rappel qui me harcèle. Ça se garde jusqu'à ce que ce soit périmé,
puis ça se jette.

Le vrai enjeu n'est pas de les *écrire* (la barre de capture v1 sait déjà) —
c'est de les **garder, organiser et supprimer sans que ça devienne pénible**.
Une liste de notes qui gonfle sans jamais se vider est exactement le piège à
éviter.

## Principe directeur

Même pari que la v1 : capture sans friction + présence permanente. On n'ajoute
**pas** un deuxième outil ni une deuxième discipline. On ajoute un « monde »
notes à côté du « monde » tâches, dans le **même panneau**, avec **un seul
geste** pour passer de l'un à l'autre.

Le fil rouge de tout ce qui suit : *ne jamais faire porter aux notes le coût
d'organisation que je ne paierai pas.* Les tâches se rangent toutes seules
(faites → cachées). Les notes doivent avoir le même genre de mécanisme
« ça se nettoie presque tout seul » — sinon je ne les nettoierai jamais.

## Ce qu'on ajoute (et ce qu'on n'ajoute pas)

**On ajoute** : les **notes rapides**. Une note = une ligne (parfois plusieurs),
qu'on garde pour référence.

**On n'ajoute pas** : les *réunions*. Envisagées au départ (une réunion comme
conteneur qui produit des tâches), volontairement écartées — pas le besoin
aujourd'hui. Si ça manque plus tard, ce sera une autre spec. (Hors périmètre,
cf. plus bas.)

## Modèle mental : deux mondes, un panneau, une touche

Le panneau a désormais deux **mondes** :

- **Monde TÂCHES** (défaut, celui de la v1) : la surface anti-oubli. Ce qui
  ressort aujourd'hui, les tâches en cours. C'est ce qu'on voit en permanence.
- **Monde NOTES** : la référence. On y va pour déposer une note ou en retrouver
  une.

**`Tab` bascule d'un monde à l'autre** — et il bascule *tout* en même temps :
la liste affichée **et** le mode de la barre de saisie. Un seul concept, un seul
raccourci.

```
  Monde TÂCHES  (défaut)             Monde NOTES        (après Tab)
  ────────────────────────           ────────────────────────
  — Ressort aujourd'hui —            📌 runbook staging
    ⏰ revoir archi paiement         📌 reset db : kubectl …
    acheter du café                  ── (non épinglées) ──
                                      lien vers la doc X
  [TÂCHE] › ____                     [NOTE] › ____
     ↑ Tab ⇄ ─────────────────────────────┘
```

Conséquence clé : **les notes ne peuvent jamais grignoter la place des tâches**
(et inversement). Chaque monde a le panneau pour lui quand on y est. C'est ce
qui rend le tout viable dans un petit split.

## Interactions

### Capture (barre du bas)

Identique à la v1, avec un axe en plus : la barre a un **type courant**,
`[TÂCHE]` ou `[NOTE]`, indiqué visuellement.

| Touche | Action |
|--------|--------|
| taper du texte + `Entrée` | Ajoute une ligne **dans le monde courant** (tâche ou note). La barre se vide, reste focus. |
| `Tab` | Bascule TÂCHE ⇄ NOTE (type de la barre **et** liste affichée). **Collant** : on reste en NOTE tant qu'on ne re-`Tab` pas → on enchaîne plusieurs notes d'affilée. |
| `↑` | Passe en mode navigation sur la liste du monde courant (draft conservé, comme en v1). |

Le défaut au lancement reste `[TÂCHE]` — la muscle memory v1 est intacte : on
ouvre `brain`, on tape, c'est une tâche.

### Notes multi-lignes (`Shift+Entrée`)

Une note est **une ligne par défaut**. Pour les cas où il en faut plus (un
snippet, un bout collé) : `Shift+Entrée` insère un retour à la ligne, `Entrée`
valide — comme un champ de chat.

> ⚠️ **Contrainte terminal à valider à l'implémentation — 3 pièces, une seule
> gratuite.** Dans un terminal « classique », `Entrée` et `Shift+Entrée`
> envoient le **même** octet (`CR`) : indistinguables. « Ghostty le supporte »
> ne suffit **pas** — c'est une pièce sur trois :
>
> 1. **Ghostty sait l'encoder** ✅ — via le *kitty keyboard protocol*. La seule
>    pièce gratuite.
> 2. **Le protocole doit être activé.** Par défaut le terminal envoie l'encodage
>    *legacy* (où `Shift+Entrée` = `Entrée`, même octet) pour ne pas casser les
>    vieilles apps. Le protocole kitty est **opt-in** : c'est l'appli qui doit
>    émettre la séquence d'échappement qui demande à Ghostty de basculer en mode
>    désambiguïsé. Si personne ne le demande, Ghostty reste en legacy et
>    `Shift+Entrée` redevient indistinguable — **même dans Ghostty**.
> 3. **L'appli doit décoder la séquence et agir** (insérer un `\n`). Et
>    `ink-text-input` est **mono-ligne** : il ne tiendra pas de buffer
>    multi-ligne quelle que soit la touche → petit champ maison nécessaire de
>    toute façon.
>
> **Question ouverte à trancher tôt (spike ~15 min) :** Ink 5 active-t-il et
> décode-t-il le protocole kitty tout seul (`useInput`) ? Si oui, la pièce #2
> est faite et il ne reste que le buffer multi-ligne. Sinon, on émet la séquence
> d'activation nous-mêmes. **Ne pas commencer le buffer avant d'avoir vérifié
> qu'une touche `Shift+Entrée` distincte arrive bien** — sinon rabbit hole.
>
> **Repli gracieux** (protocole absent / non activé) : `Shift+Entrée` = `Entrée`
> (valide au lieu d'insérer). Dégradé, pas cassé — les notes restent mono-ligne.
>
> À traiter comme une **amélioration dépendante du terminal**, à vérifier tôt,
> pas comme un acquis gratuit. Si c'est plus pénible que prévu → on garde
> mono-ligne et on documente l'échappatoire (éditer `~/.brain/notes.json` à la
> main / ouvrir `$EDITOR` plus tard). Alternative éprouvée si le kitty coince :
> ce que fait Claude Code — `Alt+Entrée` (arrive comme `ESC`+`CR`, distinct sans
> protocole) porte le multi-ligne, `Shift+Entrée` en bonus quand dispo.

### Mode navigation — monde NOTES

Comme en v1, mais avec les touches qui ont un sens pour une note (pas de
« cocher », pas de rappel) :

| Touche | Action |
|--------|--------|
| `↑` / `↓` | Déplacer la sélection |
| `p` | Épingler / désépingler la note sélectionnée |
| `e` | Éditer le texte (réutilise la barre, pré-remplie ; multi-ligne si besoin) |
| `d` | Supprimer la note sélectionnée |
| `Échap` (ou `↓` en bas de liste) | Revenir à la barre |

La note **sélectionnée** montre son **corps complet** (utile pour les
multi-lignes) ; les autres n'affichent que leur **première ligne** + un
indicateur s'il y a plus (ex. `↵ +2`). On garde la liste dense et lisible.

## Cycle de vie : garder / organiser / supprimer

C'est le cœur du problème. Trois mécanismes, pensés pour que je n'aie
**jamais** de session de ménage laborieuse.

### 1. Épingler ce qui compte (`p`)

Une note épinglée :
- **remonte en tête** du monde NOTES (les épinglées d'abord, puis les autres) ;
- **n'expire jamais** (immunisée contre le balayage ci-dessous).

C'est le mécanisme « je veux garder ça » explicite. Le runbook, la commande que
je réutilise tout le temps : `p`, et elles restent.

### 2. Péremption (dérivée, pas d'action requise)

Une note est **périmée** si elle est **non épinglée** ET **date de plus d'une
semaine** (7 jours, à partir de `createdAt`). Rien ne se passe automatiquement à
cet instant — la péremption ne fait que *rendre la note candidate* au balayage.

Pas d'action de ma part, pas d'horloge à surveiller : le simple fait de ne pas
avoir épinglé une note en fait, une semaine plus tard, une candidate au ménage.

### 3. Balayage au démarrage (le seul moment de ménage)

**Au lancement de `brain`**, s'il existe des notes périmées, le panneau les
montre et **demande avant de supprimer**. S'il n'y en a pas → démarrage normal,
aucun prompt.

Prompt **groupé, coup d'œil-et-go** :

```
5 notes de plus d'une semaine :
  · old kubectl cmd
  · lien périmé
  · idée de bouquin
  · …
[d] tout supprimer   [k] tout garder   [r] passer en revue une par une
```

- `d` : supprime les périmées (chemin par défaut, 2 frappes en tout) ;
- `k` : on garde tout cette fois (elles restent candidates au prochain boot) ;
- `r` : revue une-par-une (garder / supprimer / épingler) pour qui veut le
  contrôle fin — pas le défaut.

Comme je ne relance pas `brain` souvent (il tourne en continu), ce balayage
tombe ~1×/jour : la bonne fréquence pour un point de ménage, jamais un chore
permanent.

**Suppression = suppression réelle** (retrait du fichier). Le prompt de
démarrage *est* le filet de sécurité — pas d'archive ni d'undo en v1 (YAGNI ;
si un jour je regrette une suppression, on ajoutera un flag `deleted` au lieu du
retrait dur).

## Affichage (monde NOTES)

- **Épinglées en tête** (📌), puis les autres, chaque groupe en **ordre
  anti-chronologique** (la plus récente en haut — la plus susceptible d'être
  encore utile).
- Note sélectionnée = corps complet ; sinon première ligne + `↵ +N`.
- Débordement : même scroll à fenêtre glissante que la v1 (`windowView`),
  barre collée en bas, indicateurs `▲/▼`.
- Liste vide : message d'invite (« Aucune note. Tab pour revenir aux tâches. »).

Le monde TÂCHES est **inchangé** par rapport à la v1.

## Modèle de données

Une note **n'est pas** un `Item`. Elle n'a ni `done`/`doneAt` ni `remindOn` ;
elle a un `pinned` et son texte peut être multi-ligne. Plutôt que gonfler
`Item` d'un champ `kind` et truffer toute la logique tâches de filtres
`kind === "task"`, on garde **deux types et deux piles parallèles**, chacune
avec ses modules purs. C'est plus *lazy*, pas moins : aucun code tâche ne change.

```ts
// src/types.ts (ajout)
export type Note = {
  id: string;        // crypto.randomUUID()
  text: string;      // peut contenir des "\n"
  createdAt: string; // ISO 8601 — sert de base à la péremption
  pinned: boolean;
};
```

La péremption est **dérivée** (jamais stockée) : `isStale(note, today)` =
`!note.pinned && ymd(note.createdAt) ≤ today − 7j`. Un champ de moins à tenir à
jour.

## Stockage

Deuxième fichier local, à côté de l'existant : **`~/.brain/notes.json`**
(tableau de `Note`). Mêmes garanties que la v1 :

- écriture **atomique** (temp + rename) ;
- fichier corrompu → ne **jamais** écraser, repartir vide en mémoire + message ;
- absent → liste vide.

Implémentation : on **généralise** `storage.ts` pour prendre un nom de fichier
(`load(file)` / `save(file, data)`) plutôt que dupliquer la logique atomique.
`BRAIN_DIR` reste la surcharge de test.

## Gestion des erreurs

- `notes.json` illisible : même politique que `tasks.json` (message, pile vide
  en mémoire, pas de réécriture destructrice).
- Rien d'autre de neuf : les notes n'ont pas de saisie à valider (pas de date).

## Tests (logique pure, `node:test`)

Nouveau module `src/notes.ts` (pur) → couvert par `test/notes.test.ts` :

- `sortNotes` : épinglées d'abord, puis anti-chronologique, sans muter l'entrée.
- `isStale` : non épinglée + >7j = périmée ; épinglée = jamais ; <7j = non.
- `togglePin` / `addNote` / `editNote` / `removeNote` : renvoient un nouveau
  tableau, ne mutent pas.
- `staleNotes(notes, today)` : renvoie exactement les candidates au balayage.
- `storage` généralisé : aller-retour `notes.json` + corrompu-non-écrasé.

La couche Ink (le monde NOTES dans `app.tsx`, la bascule `Tab`, le prompt de
balayage, le champ multi-ligne) n'est **pas** testée automatiquement — validée
au parcours manuel, comme la v1.

## Hors périmètre (v1 notes)

- **Réunions** (le conteneur-qui-produit-des-tâches) — écarté explicitement.
- Recherche / filtre dans les notes (on scanne à l'œil ; à ajouter si la pile
  épinglée devient trop grande).
- Tags, dossiers, priorités sur les notes.
- Archive / corbeille / undo de suppression.
- Éditeur `$EDITOR` pour les gros corps (échappatoire = éditer le JSON).
- Rappels sur une note (par définition, une note ne harcèle pas).

## Points décidés en votre absence — à valider

Défauts que j'ai tranchés faute de réponse ; dites si l'un vous gêne, c'est
réversible :

1. **Deux fichiers / deux types** (`notes.json` + `Note`) plutôt qu'un champ
   `kind` sur `Item`. → plus propre ici, aucun code tâche touché.
2. **Suppression réelle** au balayage (pas d'archive/undo). Le prompt de boot
   est le filet.
3. **Tri notes** : épinglées d'abord, puis la plus récente en haut.
4. **Affichage** : note sélectionnée = corps complet ; autres = 1ʳᵉ ligne + `↵ +N`.
5. **Touches monde NOTES** : `p` épingler, `e` éditer, `d` supprimer (pas de
   `Espace`/`r` — sans objet pour une note).
6. **`Tab` collant** et bascule *liste + barre* ensemble (un seul concept).

## Le pari (mis à jour)

Capture inchangée (barre toujours prête ; `Tab` pour viser le bon monde).
Rappel des tâches inchangé. **Le seul risque neuf, c'est l'accumulation des
notes** — adressé par : épingler ce qui compte + tout le reste devient candidat
à la suppression après une semaine + un unique prompt groupé au démarrage. Si ça
ne suffit pas dans la vraie vie, le premier ajustement à envisager est la
**recherche dans les notes** (pour retrouver dans une grosse pile épinglée),
pas un système de dossiers.
