# 🧠 brain

Panneau todo TUI qui reste ouvert dans un split, pour ne plus rien oublier.
Capture sans friction (barre de saisie toujours prête) ; rappel par présence
permanente + surlignage de ce qui « ressort » aujourd'hui.

## Lancer

```bash
npm install
npm start
```

## Installer la commande `brain` (globale)

```bash
npm link      # rend `brain` disponible dans le PATH
brain
```

## Usage dans Ghostty

Ouvrir un split dédié et y lancer `brain` — le laisser ouvert toute la journée :

- **Cmd-D** (split vertical) ou **Cmd-Shift-D** (horizontal) dans Ghostty
- dans le nouveau pane : `brain`

> Un seul panneau à la fois : ne lance pas `brain` dans deux splits en même temps, ils
> écraseraient le même fichier (last-writer-wins).

## Raccourcis

- Barre du bas (par défaut) : taper + `Entrée` pour capturer. `↑` pour naviguer.
- En navigation : `↑/↓` bouger · `Espace` fait · `r` rappel · `e` éditer · `d` supprimer · `Échap` retour saisie.
- Rappel (`r`) : curseur de date aux flèches — `←/→` ±1 jour · `↑/↓` ±1 semaine · `⌫` retirer · `↵` valider · `Échap` annuler. Plancher : aujourd'hui (pas de rappel dans le passé).

## Notes

`brain` a deux « mondes » dans le même panneau. **`Tab`** bascule de l'un à
l'autre (la liste **et** la barre de saisie) :

- **Tâches** (défaut) : ce qui précède.
- **Notes** : ce que tu veux garder pour plus tard (une commande, un lien, une
  idée) — pas une tâche, ça ne se coche pas.

Dans le monde notes :

- Barre du bas : taper + `Entrée` pour capturer. `Shift+Entrée` insère un saut
  de ligne (note multi-ligne). `↑` pour naviguer.
- En navigation : `↑/↓` bouger · `p` épingler · `e` éditer · `d` supprimer ·
  `Échap` retour saisie · `Tab` revenir aux tâches.

> `Shift+Entrée` s'appuie sur le _kitty keyboard protocol_ de **Ghostty**.
> Ailleurs, il se comporte comme `Entrée` (note mono-ligne) — dégradé, pas cassé.

### Garder / nettoyer sans corvée

- **Épingler** (`p`) : la note remonte en tête (📌) et **n'expire jamais**.
- Une note non épinglée de **plus d'une semaine** devient candidate au ménage.
- **Au démarrage**, s'il y a des candidates, `brain` les liste et demande :
  `[d]` tout supprimer · `[k]` tout garder · `[r]` passer en revue une par une.
  Rien à faire au quotidien.

## Agenda Google (v1)

`brain` peut lire ton agenda Google pour afficher les réunions du jour — socle
des futures relances de fin de réunion.

**Prérequis** — un client OAuth « Application de bureau » (Google Cloud Console,
API Calendar activée, scope `calendar.events.readonly`). Dépose ses identifiants
dans `~/.brain/google-config.json` (hors dépôt, jamais committé) :

```json
{"clientId": "…", "clientSecret": "…"}
```

(ou via les variables d'env `BRAIN_GOOGLE_CLIENT_ID` / `BRAIN_GOOGLE_CLIENT_SECRET`.)

**Connexion** — au démarrage, si non connecté, `brain` propose `[o]` pour lancer
l'autorisation (ouvre le navigateur). Rejouable à tout moment en tapant **`/gauth`**
dans la barre de saisie (n'importe quel monde) — utile pour reconnecter / changer
de compte. Le refresh token est stocké dans `~/.brain/google-token.json`
(permissions `600`). Une ligne de statut affiche les réunions du jour.

> Les commandes commencent par `/` : `brain` n'exécute que les commandes connues
> (`/gauth`). Un texte comme `/etc/hosts` reste une note normale.

## Données

Fichiers locaux `~/.brain/tasks.json` et `~/.brain/notes.json` (éditables à la
main). Les tâches faites sont masquées mais conservées (pour d'éventuelles
stats) ; les notes supprimées au ménage sont retirées pour de bon.
