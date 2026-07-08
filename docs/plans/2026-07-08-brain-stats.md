# brain — écran `/stats` (design)

Un tableau de bord néon convoqué par `/stats` dans la barre de saisie : flex ambiant + dopamine (heatmap d'activité, streak, records). Il reste affiché jusqu'à `Échap`. Esthétique volontairement en rupture avec la sobriété de l'app — la convoquer doit faire événement.

## Décisions actées (interview 2026-07-08)

| Sujet | Décision |
|---|---|
| Invocation | `/stats` (registre `commands.ts`), plein écran, reste jusqu'à `Échap` |
| Écran trop petit | message centré « terminal trop petit » sous un minimum calculé (~22 lignes, via `useWindowSize`) |
| Esthétique | néon true-color (violet profond → magenta → cyan électrique), palette `statsPalette` dans `theme.ts` ; la bande « mondes » garde les couleurs sémantiques existantes |
| Métrique heatmap + streak | **captures par jour** (tâches + notes) |
| Heatmap étagée | < 4 semaines de données → bande jour-par-jour ; 4–12 sem. → grille 4 semaines ; 12+ → grille 12 semaines. Étage déterminé par la plus vieille date du journal |
| Streak | grâce du jour : compte à rebours depuis aujourd'hui **ou** hier ; ne casse qu'à minuit |
| Jauge de flux | fenêtre glissante 7 jours, captées vs finies (`done` − `undone`, borné ≥ 0) |
| Historique | **journal append-only** (voir ci-dessous) — immunisé contre le ménage des notes et la touche `d` |
| Durée de vie + « plus vieille close » | calculées depuis `tasks.json` (le journal n'a pas d'identité de tâche) ; érosion acceptée si suppression |

## Journal append-only — `~/.brain/journal.jsonl`

Une ligne JSON par événement : `{t: 'task'|'note'|'done'|'undone', d: 'AAAA-MM-JJ'}`.

- Appendé par la couche storage à chaque capture (tâche/note) et chaque bascule done/undone.
- **Backfill** : au démarrage de l'app, si `journal.jsonl` n'existe pas, génération depuis `tasks.json` (`createdAt` → événements `task`, `doneAt` → événements `done`) pour préserver l'historique existant. (Au démarrage, pas au premier `/stats` : sinon des captures appendées avant le premier `/stats` créeraient un journal partiel qui bloquerait le backfill.)
- Append O(1) (pas de réécriture du fichier), lecture au moment d'ouvrir `/stats`.

## Les 7 zones (haut → bas)

1. **Bannière** — cadre en blocs `▛▀▜`, « B R A I N ⚡ S T A T S » espacé, dégradé true-color.
2. **Héros** — 🔥 streak + compteurs : captées / finies / ouvertes.
3. **Heatmap** — étagée (voir tableau) ; intensité = captures/jour sur 5 paliers du dégradé néon ; cellules vides en points estompés.
4. **Flux** — barres opposées captées vs finies sur 7 jours glissants + delta (▲/▼) : le backlog gonfle ou dégonfle.
5. **Digestion** — durée de vie médiane capture → done (`doneAt` − `createdAt`).
6. **Records** — meilleur jour (captures, journal), plus longue série (journal), plus vieille tâche close (tasks.json).
7. **Mondes** — une ligne : tâches ouvertes · notes (épinglées) · PRs — chacun dans sa couleur sémantique ; segment PRs omis si Azure non connecté.

## Architecture (standards/ink.md)

- `src/core/stats.ts` — **pur, testé** : `computeStats(journalEvents, items, notes, todayYmd) → Stats`. Tout le numérique : grille heatmap + étage, streak (grâce), totaux, flux 7 j, médiane, records. Aucun import Ink.
- `src/core/storage.ts` — `appendJournal`, `readJournal`, backfill. Testé.
- `src/components/templates/stats-screen.tsx` — rendu muet de `Stats` → `<Box>/<Text>` ; garde de hauteur + message centré.
- `src/core/commands.ts` — `'stats'` ajouté au registre (une ligne).
- `src/app.tsx` — booléen `showStats` ; tous les autres `useInput` désactivés via `isActive` ; `Échap` referme. Stats calculées à l'ouverture (état mémoire + lecture journal).

## Cas limites

- Données vides (installation fraîche) : zéros, heatmap estompée, digestion/records → `—`.
- `undone` : les décomptes « finies » nettent done − undone par jour, bornés à 0.
- Fuseau : bucketing par jour local via `date.ts` (`todayYMD`).

## Tests

- `node:test` sur `stats.ts` : bornes de streak (grâce aujourd'hui/hier), seuils d'étage heatmap, bucketing par jour, médiane, netting du flux, données vides.
- `node:test` sur le journal : append, lecture, backfill idempotent.
- Un smoke `ink-testing-library` : `/stats` ouvre l'écran, `Échap` restaure.
