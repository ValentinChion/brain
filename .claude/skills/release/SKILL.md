---
name: release
description: Use when publishing a new version of brain to npm — the user says "release", "publie", "nouvelle version", "bump", or asks to update the changelog for a release.
---

# Release brain (changelog + bump + tag + npm publish)

Le changelog est **in-app** : `src/core/changelog.ts` (pas de CHANGELOG.md). Un test garde-fou (`test/changelog.test.ts`) impose `CHANGELOG[0].version === package.json version`.

## Procédure

1. **Périmètre** : `git describe --tags --abbrev=0` → dernier tag `vX.Y.Z` ; scope = `git log <tag>..HEAD --oneline`. Vide → rien à publier, stop.
2. **Version** : Conventional Commits — au moins un `feat` → minor ; seulement `fix`/`perf`/`build` → patch (pré-1.0).
3. **Entrée changelog** : préfixer le tableau `CHANGELOG` de `{version, date: aujourd'hui, entries: [...]}`. Puces **en français, orientées utilisateur** : regrouper les commits par fonctionnalité (0.2.0 = 20 commits → 6 puces), pas de dump 1:1 ; nommer les commandes (`/azure`, `/prs`…) ; mentionner les changements d'exigences (ex. Node ≥ 22).
4. **Bump** : `npm version X.Y.Z --no-git-tag-version`.
5. **Vérifier** : `npm test` (le garde-fou valide la synchro) puis `npm pack --dry-run` (`dist/cli.js` présent — `prepack` lance esbuild).
6. **Commit + tag** : `git add package.json package-lock.json src/core/changelog.ts` ; message `release: X.Y.Z (<résumé 3-4 mots>)` ; `git tag vX.Y.Z` (léger, sur le commit de release).
7. **Publier** : `npm publish`. **2FA : aucun prompt OTP interactif ne fonctionne ici** — en cas d'`EOTP`/`E404`, demander à l'utilisateur de taper `! npm publish --otp=<code>` lui-même (ou de donner le code, qui expire en ~30 s). `E404` sur PUT = presque toujours auth (`npm whoami` pour confirmer).
8. **Vérifier la registry** : `npm view brain-tui version` → nouvelle version en `latest`.
9. **Push** : proposer `git push origin main --tags` — demander avant (ça publie l'historique local).

## Pièges

- Oublier l'entrée changelog ou le bump → le garde-fou casse `npm test` (voulu).
- Les puces décrivent ce que l'utilisateur voit, pas la plomberie interne.
- Ne jamais précharger `--otp` soi-même sans code frais de l'utilisateur.
