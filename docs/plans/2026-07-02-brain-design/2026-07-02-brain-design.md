# `brain` — panneau todo TUI toujours ouvert

**Date** : 2026-07-02
**Auteur** : Valentin Chion

## Problème

Je perds des choses depuis le début de ma carrière :
- Des **tâches** qui me passent par la tête et que je ne note pas → j'oublie de les organiser dans ma journée.
- Des **feedbacks / infos de réunion** à garder pour plus tard.

Les outils que j'ai essayés n'ont rien changé : rien ne m'obligeait à les utiliser. Le seul truc qui a à peu près marché, c'est de m'envoyer des DMs Slack à moi-même — parce que c'était visible en permanence, là où je bossais déjà, sans friction.

## Principe directeur

Rejouer ce qui a marché en Slack, mais taillé pour mon setup :
- **Capture sans friction** : ajouter une tâche prend 2 secondes, sans quitter le terminal.
- **Rappel qui vient à moi** : l'outil est *toujours sous mes yeux*. Sa présence permanente remplace la discipline.

Concrètement : un petit TUI que je lance une fois dans un split Ghostty et qui reste ouvert toute la journée. Je vis dans Ghostty (splits + tabs), donc un panneau toujours visible est le mécanisme anti-oubli le plus naturel pour moi.

## Ce qu'on construit

`brain` : une application terminal (TUI) en **Node/TS + Ink**, lancée en continu dans un split Ghostty.

Ink est choisi parce que c'est mon terrain (JS/TS) et donc facile à bidouiller après — c'est aussi ce qui fait tourner Claude Code.

## Interactions

Modèle façon Claude Code : une **barre de saisie toujours présente en bas, focus par défaut**. Quand une tâche/feedback me vient, je navigue vers le split `brain` et je tape directement — c'est le seul point de capture (pas de commande one-shot séparée, volontairement). Je ne « sors » de la barre que pour agir sur des lignes existantes.

**Mode saisie (par défaut)** — le focus est sur la barre en bas :

| Touche | Action |
|--------|--------|
| taper du texte + `Entrée` | Ajoute une nouvelle ligne. La barre se vide, reste focus → capture en continu |
| `↑` | Passe en mode navigation (sélectionne la dernière ligne active). Un texte en cours de frappe est **conservé** dans la barre — on le retrouve en revenant (`Échap`/`↓`) |

**Mode navigation** — le focus est dans la liste :

| Touche | Action |
|--------|--------|
| `↑` / `↓` | Déplacer la sélection |
| `Espace` | Cocher / décocher la ligne sélectionnée |
| `r` | Saisir (ou effacer) une date de rappel sur la ligne sélectionnée |
| `e` | Éditer le texte (réutilise la barre de saisie, pré-remplie) |
| `d` | Supprimer la ligne sélectionnée |
| `Échap` (ou `↓` en bas de liste) | Revenir à la barre de saisie |

L'app tourne en continu : pas de « quitter » au quotidien (on peut la fermer avec `Ctrl-C`, elle relit son fichier au démarrage).

### Saisie de la date de rappel (`r`)

Un champ texte qui accepte au minimum une date `AAAA-MM-JJ`. Support de quelques raccourcis simples si c'est trivial (`demain`, `vendredi`) — sinon la date absolue suffit pour la v1. Champ vide = pas de rappel.

## Affichage

- **En haut, surligné** : les lignes dont la date de rappel est **≤ aujourd'hui** (« ce qui ressort aujourd'hui »). C'est là que réapparaissent les feedbacks datés. Dans cette section, **le plus en retard remonte en tête** (tri par date de rappel croissante) — ce qui traîne depuis le plus longtemps est le plus visible.
- **Ensuite** : les tâches en cours (non faites, sans rappel dû), dans l'ordre de création.
- Les lignes **faites** disparaissent de la vue principale, mais restent dans le fichier (marquées `done` + `doneAt`) — on garde la donnée pour d'éventuelles stats plus tard.

Une ligne affiche : son texte, et sa date de rappel si elle en a une.

**Débordement** : si la liste dépasse la hauteur du split, la vue **scrolle** (fenêtre glissante qui suit la sélection en mode navigation), avec un indicateur `▲/▼` quand il y a du contenu masqué au-dessus / en dessous. La barre de saisie reste **collée en bas**, toujours visible — c'est la promesse anti-oubli, elle ne doit jamais sortir de l'écran.

**Une seule instance** : `brain` n'est pas prévu pour tourner dans deux splits en même temps (les deux écraseraient le fichier à tour de rôle). Un seul panneau ouvert.

## Modèle de données

Un feedback et une tâche sont **le même objet** : une ligne, avec éventuellement une date de rappel. Pas deux listes séparées.

```ts
type Item = {
  id: string;          // identifiant stable
  text: string;
  createdAt: string;   // ISO
  remindOn: string | null;  // "AAAA-MM-JJ" ou null
  done: boolean;
  doneAt: string | null;    // ISO, quand cochée
};
```

## Stockage

Un fichier local unique : `~/.brain/tasks.json` (tableau d'`Item`).

- Pas de serveur, pas de compte, pas de cloud.
- Éditable à la main en cas de besoin.
- Écriture atomique (écrire dans un fichier temporaire puis renommer) pour ne pas corrompre le fichier si l'app est tuée en plein milieu.
- Au démarrage : si le fichier ou le dossier n'existe pas, le créer avec une liste vide.

## Gestion des erreurs

- Fichier JSON illisible/corrompu : ne pas planter ni écraser. Afficher un message dans le panneau et repartir d'une liste vide en mémoire jusqu'à correction manuelle (ne pas réécrire par-dessus le fichier existant tant que l'utilisateur n'a pas agi).
- Date de rappel invalide à la saisie : refuser, garder le champ ouvert, indiquer le format attendu.

## Tests

Ponytail : une vérif runnable sur la logique non triviale, pas de framework lourd.
- Un self-check (`assert`) sur la logique de tri/filtrage de l'affichage : items à rappel dû en premier, faits exclus, non-faits ensuite.
- Un self-check sur le parsing de la date de rappel (date valide acceptée, invalide rejetée).

La couche Ink (rendu) n'est pas testée automatiquement en v1.

## Hors périmètre (YAGNI — on ajoutera si ça manque vraiment)

- Notification macOS planifiée.
- Commande quick-add `brain "..."` depuis n'importe quel terminal.
- Projets, tags, priorités.
- Sync multi-machine, appli mobile.
- Intégration Slack.

## Le pari

Capture = aller dans le panneau et taper (2 s). Rappel = le panneau est toujours visible dans un split + surlignage de ce qui ressort aujourd'hui. Si ça ne colle pas dans la vraie vie, le premier ajustement à envisager est la commande quick-add et/ou la notif filet (les deux premiers items du hors-périmètre).
