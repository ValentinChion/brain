---
name: sync-portfolio
description: Use whenever brain gains a user-visible change — a version bump/release, a new feature or command, a theme/palette change, a new keybinding, a changed data file — and the public showcase might now be stale. Also on "sync portfolio", "update the showcase", "le portfolio est-il à jour ?", "mettre à jour le portfolio". Checks the portfolio vitrine against brain's real state, then (if it drifted) runs the same design→spec→implement procedure used to build it.
---

# Synchroniser le showcase brain du portfolio

Le portfolio (site perso) contient une **vitrine de brain** qui décrit et met en scène l'outil : version, fonctions, palette, touches, modèle de données, et une **démo TUI animée**. Dès que brain évolue, cette vitrine dérive et vend un outil qui n'existe plus. Ce skill détecte la dérive et la corrige selon la même procédure que celle qui a construit la vitrine.

Repo portfolio : `~/src/theodo-try-projects/portfolio` (React 19 + Vite + Tailwind 4, bilingue EN/FR). Exemple de spec produit par ce skill : `docs/superpowers/specs/2026-07-16-brain-showcase-v0.3-design.md`.

## Invariants (à ne jamais casser)

- **Braise cohabite ; le corail reste l'identité du site.** La palette braise de brain ne touche QUE les surfaces propres à brain (démo TUI, cartes/keys de brain, libellés du modèle de données, îlot « $ brain » de la Home). L'accent global du site (`--accent: #d9635d`, dans `src/index.css`), la nav, les CTA et le badge vert « actif » `#2e9d5d` restent inchangés.
- **`src/braise.ts` est un miroir de `brain/src/core/theme.ts`.** C'est la source unique des tokens braise côté portfolio. Le premier point de contrôle de dérive = comparer ces deux fichiers.
- **Parité bilingue.** Toute chaîne éditée l'est dans `en` ET `fr`.
- **La démo ne déborde jamais.** Le bandeau agenda tient sur une ligne (colonne gauche tronquée + bloc droit épinglé) ; PR/tâches/notes sont des panneaux cadrés.
- **Certaines décisions sont celles de l'utilisateur, pas les tiennes.** Interroge-le (design-with-me / brainstorming) : le positionnement/copie du pitch, le nombre de cartes fonctionnalités, quelles nouveautés mettre en avant, la teinte d'un nouveau groupe de touches. Ne tranche pas seul.

## Procédure

1. **Ajouter le répertoire.** Si le portfolio n'est pas déjà un working directory de la session, l'ajouter (`/add-dir ~/src/theodo-try-projects/portfolio`) — sinon les Read/Edit échouent.

2. **Établir la vérité de brain** (sources) :
   - version + `engines.node` → `package.json`
   - palette + glyphes → `src/core/theme.ts`
   - fonctions livrées → `src/core/changelog.ts` (le plus récent d'abord)
   - touches / modes / commandes → `src/app.tsx`, `src/core/hints.ts`, `src/core/commands.ts`
   - fichiers de données → ce que brain écrit sous `~/.brain/` (voir `src/core/storage.ts`)
   - look du masthead / panneaux / bandeau agenda / miroir PR → les composants `src/components/**`

3. **Confronter aux surfaces du portfolio** et dresser un **rapport de dérive** (tableau). Correspondances :

   | Vérité brain | Surface portfolio à vérifier |
   |---|---|
   | `package.json` version + `engines.node` | `src/tools.ts` `version` ; `src/pages/Brain.tsx` chaîne `node:` ; badge du hero |
   | `src/core/theme.ts` (color, glyph) | `src/braise.ts` (miroir des tokens) ; couleurs de `src/components/BrainTUI.tsx` ; accents des cartes/libellés de `Brain.tsx` |
   | `src/core/changelog.ts` (fonctions) | cartes fonctionnalités de `Brain.tsx` ; `tagline`/`description` de `tools.ts` ; `lead` de `Home.tsx` |
   | `app.tsx` + `hints.ts` + `commands.ts` (touches, commandes, modes) | `keyGroups` de `tools.ts` ; hints de `BrainTUI.tsx` ; section clavier de `Brain.tsx` |
   | fichiers `~/.brain/*` | îlots du modèle de données dans `Brain.tsx` |
   | masthead / panneaux / bandeau agenda / miroir PR | layout + script d'animation de `BrainTUI.tsx` |

   **Si aucune dérive → s'arrêter là et le dire.** (C'est un résultat valide : rien à publier.)

4. **Concevoir la mise à jour.** Pour toute dérive non triviale, dérouler `brainstorming` (et `design-with-me` pour vérifier le spec) afin de trancher AVEC l'utilisateur les décisions qui lui reviennent (cf. invariants). Recommander une réponse par défaut à chaque question.

5. **Écrire le spec** dans `~/src/theodo-try-projects/portfolio/docs/superpowers/specs/AAAA-MM-JJ-<sujet>-design.md` : décisions verrouillées, décisions par défaut à confirmer, table de recoloration ancien→nouveau, changements fichier par fichier, non-objectifs, vérification. Le commiter. Demander à l'utilisateur de le relire avant d'implémenter.

6. **Implémenter** selon le spec (mettre à jour `braise.ts` d'abord si les tokens ont bougé, puis `tools.ts`, `BrainTUI.tsx`, `Brain.tsx`, `Home.tsx`).

7. **Vérifier** (le portfolio n'a pas de tests unitaires — seulement `oxlint`) :
   - `pnpm build` (tsc + vite) passe ; `pnpm lint` propre.
   - `pnpm dev` puis captures navigateur en **EN et FR** ; confirmer les beats de la démo (mèche agenda qui bouge, dépli PR, entête ▦, épingle gold). Le pilotage navigateur passe par le MCP Playwright (`browser_navigate`/`browser_take_screenshot`) — l'extension Chrome peut être absente. La bascule de langue est un `<button>` de nom accessible `en`/`fr`.
   - Commiter côté portfolio.

8. **Déployer en prod.** Le portfolio est un **Cloudflare Pages connecté au repo GitHub `tools-portfolio`** (`origin`) : aucune config de déploiement dans le repo (pas de `wrangler.toml`, pas de CI) — Cloudflare surveille la branche `main`, et **un push sur `main` déclenche le build (`pnpm build` → `dist/`) et met la prod à jour tout seul.** Donc, une fois la vérif de l'étape 7 **au vert** :
   - **Demander confirmation à l'utilisateur** — pousser publie l'historique local ET déploie en production ; ne jamais pousser une vérif rouge ni sans accord.
   - `git push origin main`.
   - Suivre le build sur le dashboard Cloudflare Pages ; la prod se rafraîchit à la fin du build.

## Pièges

- **Ne pas recolorer le chrome du site.** Ember `#ea580c` et corail `#d9635d` sont voisins : la tentation d'« unifier » casse l'invariant. La démo est braise ; le site reste corail.
- **Le répertoire d'abord.** Sans `/add-dir`, tout Read/Edit sur le portfolio échoue silencieusement au premier appel.
- **Nettoyer les captures.** Playwright dépose les PNG dans le cwd (souvent le repo brain, pas le portfolio) et un dossier `.playwright-mcp/`. Les supprimer avant de committer, et couper le serveur `vite` (`pkill -f vite`).
- **Parité EN/FR ou le rendu casse.** `t = T[lang]` : une clé présente d'un seul côté passe `tsc` mais rend `undefined` dans l'autre langue. Toujours éditer les deux.
- **Décisions ≠ défauts silencieux.** Si l'utilisateur s'absente, retenir le défaut recommandé MAIS le signaler explicitement dans le spec (« à confirmer »), ne pas le présenter comme acté.
- **`push main` = mise en prod.** Il n'y a pas d'étape de staging : le push déploie directement via Cloudflare Pages. Toujours après une vérif verte et un accord explicite ; jamais en réflexe de fin de tâche.
