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

## Données

Fichier local `~/.brain/tasks.json` (éditable à la main). Les tâches faites
sont masquées mais conservées (pour d'éventuelles stats).
