# `brain` × Google Calendar — v1 : brancher l'agenda

**Date** : 2026-07-06
**Auteur** : Valentin Chion
**Statut** : conception validée (design-with-me) — prêt pour plan d'implémentation

## Problème

`brain` capture bien ce que je pense **à noter**, mais mon vrai trou, c'est la
**reconnaissance** : après une réunion, je ne réalise pas sur le moment qu'il y
avait des actions/infos à garder — personne ne me le demande. La cible à terme :
`brain` sait quand une réunion se termine et **me sollicite** (debrief), puis, si
un compte-rendu Gemini existe, en importe les actions.

Tout ça repose sur une fondation : **`brain` doit connaître mon agenda**. C'est
le seul objet de cette v1.

## Périmètre v1

**Dans le périmètre** :

- Authentification Google (OAuth 2.0, flux « installed app » PKCE + redirection
  loopback), faite depuis le TUI.
- Stockage local du refresh token, rafraîchissement transparent de l'access token.
- Lecture des événements du jour via la **Google Calendar API**.
- **Preuve que ça marche** : une ligne de statut *« 🗓 3 réunions aujourd'hui ·
  prochaine 14:00 Sprint review »*.

**Hors périmètre (versions suivantes)** :

- v2 — détection de fin de réunion + **debrief** (questions → tâches/notes).
- v3 — import du **compte-rendu Gemini** depuis Drive (ajoute le scope
  `drive.readonly` sur le même consentement).
- Piste **parallèle & découplée** (portfolio) — domaine perso + page de
  confidentialité + homepage + **revue de vérification Google**. N'impacte pas le
  code : le même `client_id` cesse simplement d'afficher l'avertissement « appli
  non vérifiée » une fois approuvé. Ne bloque rien.
- Écriture dans l'agenda, multi-agendas, notifications.

## Décisions clés (issues du design-with-me)

| Sujet | Décision | Pourquoi |
|-------|----------|----------|
| **Credentials** | Client OAuth **« Desktop » partagé, committé au repo** (option B), publié en **Production non vérifiée** | Clone-and-go sur toutes mes machines + pour d'autres. Secret d'un client Desktop = non confidentiel (doc Google). Conséquence assumée : sur repo public, d'autres pourraient utiliser mon `client_id` (mon quota, mon écran de consentement) — corrigé par la piste vérification. |
| **Vérification** | **Découplée**, piste parallèle | Le code est identique vérifié ou non ; seul l'avertissement de consentement change. Ne pas bloquer la feature sur une revue de plusieurs semaines. En dev/prod : un clic « Avancé → continuer » une fois par machine. |
| **Flux OAuth** | **Codé à la main, zéro nouvelle dépendance** | `node:http` (loopback), `node:crypto` (PKCE), `fetch` global, `open` (macOS) suffisent. Fidèle à l'ADN « pas de nouvelle dépendance », et bonne démo portfolio. |
| **Scope** | `calendar.events.readonly` | Le plus étroit qui lit les événements. |
| **Stockage token** | `~/.brain/google-token.json`, `chmod 600`, écriture atomique | Réutilise le pattern de `storage.ts`. |
| **Déclencheur** | **Prompt modal au démarrage** (comme le ménage) + commande **`/gauth`** | « Me demander » = le prompt. Rejouable ensuite via `/gauth`. Pas de raccourci clavier (collision avec la barre de saisie). |
| **Commandes `/`** | Barre de saisie : un texte commençant par `/` **et** correspondant à une commande enregistrée est une action, sinon c'est du contenu normal | Protège le monde notes, fait pour stocker des commandes shell / chemins (`/etc/hosts`, `/deploy…`). |

## Architecture (règle d'or `standards/ink.md` : pur ≠ Ink)

**Modules purs, testés** (`src/core/`) :

- `google-auth.ts` — `pkcePair()` (verifier + challenge S256), `buildAuthUrl(...)`,
  `buildTokenExchangeBody(...)`, `buildRefreshBody(...)`, `parseTokenResponse(json, nowISO)`
  → `GoogleToken`, `isExpired(token, nowISO)`. Aucune I/O.
- `agenda.ts` — `shapeEvents(rawEvents, nowISO)` → `Meeting[]` (filtre les
  journées entières, trie par début), `nextMeeting(meetings, nowISO)`,
  `summary(meetings)` (compte + prochaine).
- `commands.ts` — `parseCommand(text)` → `{name, args} | null` ; ne renvoie une
  commande que si le premier token ∈ registre (`['gauth']`), sinon `null`.
- `google-config.ts` (committé) — `CLIENT_ID`, `CLIENT_SECRET` (à remplir une
  fois), `SCOPES`, `AUTH_ENDPOINT`, `TOKEN_ENDPOINT`, `CALENDAR_ENDPOINT`.

**I/O isolée** (`src/core/`) :

- `google-client.ts` — orchestre les effets : `connect()` (pkce → serveur
  loopback → `open` navigateur → attend le code → échange → sauvegarde),
  `ensureAccessToken()` (rafraîchit si `isExpired`), `fetchTodaysEvents()`.
  S'appuie sur les fonctions pures de `google-auth.ts` + le stockage.
- `storage.ts` (étendu) — `loadToken()` / `saveToken(token)` (chmod 600, atomique).

**Couche Ink** (`src/components/`, `app.tsx`) :

- `components/organisms/connect-prompt.tsx` — modal de démarrage (même famille
  que `sweep-view.tsx`) : *« Connecter ton agenda Google ? [o] oui · [n] plus tard »*.
- `components/molecules/agenda-status.tsx` — la ligne de statut (résumé réunions
  ou *« agenda non connecté · /gauth »*).
- `app.tsx` — état de connexion (`disconnected | prompting | connecting | connected | error`),
  gate du prompt au démarrage, dispatch des commandes à la soumission.

## Flux OAuth (codé à la main)

1. `pkcePair()` : `code_verifier` aléatoire (`crypto.randomBytes`), `code_challenge`
   = base64url(SHA-256(verifier)). Générer aussi un `state` (anti-CSRF).
2. Démarrer un serveur `node:http` sur `127.0.0.1:0` (port éphémère) →
   `redirect_uri = http://127.0.0.1:<port>`. (Clients Desktop : loopback sur
   n'importe quel port, **sans pré-enregistrement**.)
3. `open` le navigateur sur l'URL d'autorisation (`scope=calendar.events.readonly`,
   `access_type=offline`, `prompt=consent`, `code_challenge`, `state`).
4. Le serveur capte `GET /?code=…&state=…`, vérifie le `state`, répond une page
   *« Tu peux fermer cet onglet »*.
5. `POST` sur `TOKEN_ENDPOINT` (`code` + `code_verifier` + `client_id` +
   `client_secret` + `redirect_uri`) → refresh token + access token + `expires_in`.
6. `parseTokenResponse` → `GoogleToken` ; `saveToken` (chmod 600) ; fermer le serveur.
7. Rafraîchissement : quand `isExpired(token, now)`, `POST` `grant_type=refresh_token`.

Lecture : `GET CALENDAR_ENDPOINT` (`/calendars/primary/events?timeMin=…&timeMax=…&singleEvents=true&orderBy=startTime`)
avec `Authorization: Bearer <access>`.

## Modèle de données

```ts
type GoogleToken = {
  refreshToken: string;
  accessToken: string;
  expiresAt: string; // ISO 8601
};

type Meeting = {
  id: string;
  title: string;
  start: string; // ISO
  end: string;   // ISO
};
```

## UX

- **Démarrage, pas de token** → `connect-prompt` modal. `o`/`Entrée` lance le flux ;
  `n`/`Échap` ferme et rend la main à la capture (pas de relance dans la session).
  Si le **ménage des notes** doit aussi s'afficher au démarrage, il passe **en
  premier** ; le `connect-prompt` vient après (pas deux modals empilés).
- **`/gauth`** dans la barre (n'importe quel monde) → (re)lance le flux, **même si
  déjà connecté** (reconnexion / changement de compte / consentement après révocation).
- **Pendant** : statut *« ouverture du navigateur… en attente d'autorisation »*.
- **Connecté** : `agenda-status` affiche *« 🗓 N réunions aujourd'hui · prochaine
  HH:MM Titre »* ; sinon *« agenda non connecté · /gauth »*.
- Soumission : `parseCommand(value)` d'abord → si commande, dispatch ; sinon
  `addItem`/`addNote` comme aujourd'hui.

## Gestion des erreurs

- **Pas de token** → prompt / statut « non connecté ». App pleinement utilisable.
- **Refresh échoue (révoqué/expiré)** → statut *« reconnecte via /gauth »*, on
  efface le token périmé, on ne plante pas.
- **Réseau indisponible** → erreur discrète dans le statut, capture inchangée.
- **Port occupé / navigateur non ouvrable** → message, retour à la normale.
- **Token file corrompu** → traité comme « non connecté », **ni crash ni écrasement**
  (même philosophie que `storage.ts` pour les JSON corrompus).
- **Consentement annulé / onglet fermé** → timeout du serveur loopback (~2 min),
  retour à la normale.

## Sécurité

- `state` (anti-CSRF) + PKCE S256.
- Token file en `chmod 600`.
- `client_secret` committé : non confidentiel pour un client Desktop (doc Google).
  Sur repo public, conséquence assumée (cf. décisions) ; la piste vérification
  apportera l'écran de consentement de marque.

## Setup GCP (une fois, manuel — documenté pour reproduction)

1. [console.cloud.google.com](https://console.cloud.google.com) → nouveau projet `brain`.
2. **Activer** l'API *Google Calendar*.
3. **Écran de consentement OAuth** : External → infos appli → ajouter le scope
   `calendar.events.readonly` → **Publier en Production** (non vérifiée).
4. **Identifiants** → Créer un ID client OAuth → **Application de bureau** →
   copier `client_id` + `client_secret` dans `src/core/google-config.ts`.

## Tests (`node:test`, logique pure)

- `google-auth` : `code_challenge` = base64url(SHA-256(verifier)) ;
  `parseTokenResponse` mappe les champs + calcule `expiresAt` ; `isExpired` à la
  borne (`now === expiresAt`).
- `agenda` : `shapeEvents` filtre les journées entières et trie ; `nextMeeting`
  prend le prochain à venir ; liste vide → `null`.
- `commands` : `/gauth` → `{name:'gauth'}` ; `/etc/hosts` → `null` (→ contenu) ;
  `acheter du pain` → `null` ; `/gauth foo` → `{name:'gauth', args:['foo']}`.

## Vérification (bout en bout)

1. `npm test` — prettier + xo + `node:test` verts, tests purs ci-dessus inclus.
2. `npm start` dans **Ghostty** → prompt au démarrage → `o` → consentement
   navigateur → la ligne de statut affiche les réunions du jour.
3. `Ctrl-C` puis relance → toujours connecté (token persisté, access token
   rafraîchi en silence).
4. `/gauth` relance le flux même connecté.
5. Taper une note `/etc/hosts` → enregistrée comme **note** (non interceptée).

## Suite

- **v2** — détection de fin de réunion (poll agenda) + debrief : à la fin d'une
  réunion, `brain` demande *« Réunion 'X' terminée — actions ? infos ? »* → tâches/notes.
- **v3** — import du compte-rendu Gemini depuis Drive (scope `drive.readonly` ajouté
  au même consentement ; parser la section « actions » déjà extraite par Gemini,
  sans LLM maison en premier jet).
- **Piste portfolio (parallèle)** — domaine, page de confidentialité, homepage,
  revue de vérification Google → consentement sans avertissement, clone-and-go public.
