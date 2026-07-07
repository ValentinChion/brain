# `brain` — miroir des PRs (Azure DevOps d'abord)

## Problème

Les PRs qui attendent une action de ma part vivent dans la forge (Azure DevOps aujourd'hui), pas sous mes yeux. Résultat : les demandes de review traînent, et mes propres PRs restent bloquées (CI rouge, changements demandés, approuvées mais pas mergées) sans que je le voie.

## Principe

Même logique que l'agenda Google Calendar : **le rappel vient à moi**. La forge est la source de vérité — brain ne fait que **refléter** son état. Aucune PR n'est copiée dans `tasks.json` : une ligne apparaît quand une action m'attend, et disparaît toute seule au poll suivant quand la forge dit que c'est réglé (vote posé, CI verte, PR mergée/abandonnée). Zéro logique de synchronisation, zéro copie périmée.

## Ce qu'on affiche

Une section « PRs » sous la ligne d'agenda, en deux groupes :

- **À reviewer** — PRs où je suis reviewer demandé et n'ai pas encore voté.
- **Mes PRs** — mes PRs ouvertes dans un état actionnable :
  - CI en échec ;
  - changements demandés (un reviewer a voté « waiting for author » ou rejeté) ;
  - approuvée et pas encore mergée (« approuvée » = au moins un vote d'approbation et aucun vote bloquant — rejet ou « waiting for author »).

Exemples de lignes : `⇄ à reviewer · Add payment retry (alice) · 2j` · `✗ CI rouge · fix webhook timeout`. Couleur par type via `theme.ts`. Tri : reviews d'abord, puis les plus anciennes en premier.

La section est **absente** si non configurée ou vide — zéro bruit si on ne s'en sert pas. Les brouillons (drafts) sont exclus.

## Interactions

- Poll toutes les ~5 min (même cadence que l'agenda).
- `/prs` — rafraîchit immédiatement.
- `/azure` — lance la connexion (device-code, voir plus bas).
- `o` / Entrée sur une ligne PR focusée — ouvre l'URL dans le navigateur.

## Authentification : device-code OAuth (Entra ID)

Le plus simple pour l'utilisateur — même UX que la connexion Google déjà en place :

1. `/azure` dans brain → brain POST l'endpoint devicecode Entra et affiche « va sur microsoft.com/devicelogin, entre le code XXXX-XXXX ».
2. Brain poll l'endpoint token jusqu'à validation.
3. Access + refresh tokens stockés dans `~/.brain/azure-token.json` (chmod 600), rafraîchis silencieusement sur 401.

Pas d'enregistrement d'application : on utilise le client ID public bien connu de Visual Studio (`872cd9fa-d31f-45e0-9eab-6e460a02d1f1`), comme Git Credential Manager. Pas de PAT, rien à faire expirer ni à recopier.

L'organisation et le projet Azure DevOps sont demandés une fois à la première connexion et sauvés dans `~/.brain/azure-config.json` (`{organization, project}` — aucun secret dedans).

## Modules (même découpage que Google Calendar)

- `src/core/forge.ts` — **pur, testé.** `shapePullRequests(raw, myId): PrItem[]` : normalise les payloads Azure (PRs + votes reviewers + statut de build) en `PrItem` `{id, title, author, url, kind}` avec `kind: 'review-requested' | 'ci-failed' | 'changes-requested' | 'approved'`. Filtre au « action requise », exclut drafts et PRs où j'ai déjà voté, trie. Le type `PrItem` est neutre vis-à-vis de la forge : ajouter GitHub ou GitLab plus tard = une fonction fetch + une fonction shape, pas d'abstraction client tant qu'il n'y a qu'une forge.
- `src/core/azure-client.ts` — I/O fine : liste des PRs actives (`/pullrequests?searchCriteria.status=active`) du projet configuré, votes par PR, dernier statut de build. Token Entra en header.
- `src/core/azure-auth.ts` — device-code flow (demande de code, poll du token, stockage, refresh). Miroir de `google-auth.ts`.
- `src/core/azure-config.ts` — `{organization, project}` : variables d'env (`BRAIN_AZURE_ORG`, `BRAIN_AZURE_PROJECT`) puis `~/.brain/azure-config.json`. Message d'erreur clair sinon. Même patron que `google-config.ts`.
- `app.tsx` — un `useEffect` de poll (miroir de celui de l'agenda) + un composant `PrSection`. Commandes `/prs` et `/azure` enregistrées dans `commands.ts`.

## Gestion des erreurs

- Forge injoignable / 401 après refresh : ligne de statut discrète dans la section (`azure : token invalide`), on garde en mémoire les dernières données valides, le panneau ne plante jamais.
- Pas de config : section absente, aucun message.
- Réponse inattendue de l'API : la fonction de shape ignore les entrées malformées plutôt que de jeter.

## Tests

`node:test` sur `forge.ts` uniquement, avec des payloads Azure en fixtures :

- j'ai déjà voté ⇒ la PR sort de « à reviewer » ;
- draft ⇒ exclue ;
- CI en échec / changements demandés / approuvée ⇒ classée dans le bon `kind` ;
- tri : reviews avant mes PRs, plus anciennes d'abord ;
- correspondance `myId` (reviewer demandé = moi, auteur = moi).

Pas de test sur le client HTTP ni la couche Ink, conformément à `standards/ink.md` §9.

## Hors périmètre (YAGNI)

- Clients GitHub / GitLab (le shape `PrItem` est prêt ; on les ajoute quand le besoin arrive).
- Snooze / masquage d'une ligne PR.
- Agir sur une PR depuis brain (approuver, merger, commenter).
- Work items / issues.
- Notification macOS sur nouvelle demande de review.
