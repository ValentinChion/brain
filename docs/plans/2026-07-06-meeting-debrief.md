# `brain` × Google Calendar — v2 : debrief de fin de réunion

**Date** : 2026-07-06
**Auteur** : Valentin Chion
**Statut** : conception validée (brainstorming) — prête pour plan d'implémentation
**Socle** : v1 (`docs/plans/2026-07-06-google-calendar-connect.md`) — connexion agenda déjà en place.

## Problème

Le vrai trou de `brain`, c'est la **reconnaissance** : après une réunion, je ne
réalise pas sur le moment qu'il y avait des actions/infos à garder — personne ne
me le demande. v1 sait lire mon agenda ; v2 s'en sert pour **me solliciter** à la
fin de chaque réunion et transformer mes réponses en tâches/notes.

## Périmètre v2

**Dans le périmètre** :

- **Détection de fin de réunion** : poll de l'agenda pendant que `brain` tourne
  + rattrapage au démarrage.
- **Notification macOS** quand une réunion se termine « en direct » (je suis
  ailleurs).
- **Modal de debrief** (bloquant, comme le ménage) : 2 questions guidées →
  tâches / notes, une réunion à la fois.
- **Filtre** « vraie réunion » + commande manuelle `/debrief`.
- **Étiquetage** des items capturés avec leur réunion (`source`).

**Hors périmètre** :

- **v3** — import du compte-rendu **Gemini** depuis Drive (scope `drive.readonly`).
- **Force-raise** de la fenêtre Ghostty (gardé en réserve ; v2 = notification seule).
- Réunions passées d'hier / multi-jours ; édition du filtre par l'utilisateur.

## Décisions clés (issues du brainstorming)

| Sujet | Décision |
|-------|----------|
| **Attirer l'attention** | **Notification macOS** (`osascript`, zéro dépendance). Clic → ne refocalise pas Ghostty de façon fiable (sans dépendance) : on ping, l'utilisateur revient, le modal l'attend. |
| **UX debrief** | **Modal bloquant** (famille `sweep-view`), 2 questions guidées : ✅ *Actions à faire ?* (lignes → tâches) puis 📝 *Infos à garder ?* (lignes → notes). Réponse vide = bucket sauté. Touche **skip** pour passer une réunion. |
| **Filtre** | **Vraie réunion** : timée (pas journée entière), **≥ 1 autre participant**, **non décliné** par moi, pas un bloc *focusTime* / *outOfOffice*. |
| **File d'attente** | **Une réunion à la fois**, dans l'ordre (comme le mode « revue » du ménage). |
| **Étiquetage** | Chaque item capturé porte un `source` = titre de la réunion, affiché *« · Sprint review »*. |
| **Manuel** | Commande **`/debrief`** — rejoue le debrief de la dernière réunion à la demande. |

## Architecture (règle d'or `standards/ink.md` : pur ≠ Ink)

**Modules purs, testés** (`src/core/`) :

- `agenda.ts` (étendu) — `shapeEvents` lit désormais `attendees`, `eventType` et
  le `responseStatus` du participant « self » pour calculer un booléen
  `debriefable` sur chaque `Meeting`.
- `debrief.ts` (nouveau) —
  - `pendingDebriefs(meetings, nowISO, handledIds)` → réunions `debriefable` dont
    la fin est passée et non traitées, triées par fin croissante (la plus
    ancienne d'abord).
  - `linesToItems(text)` → découpe une réponse multi-ligne en items (trim, sans
    vides).
  - `pruneHandled(handledIds, todaysIds)` → borne le fichier des ids traités.

**I/O isolée** :

- `google-client.ts` — `fetchTodaysEvents` (existe déjà, sert au poll).
- `notify.ts` (nouveau) — `notifyMeetingEnded(title)` : `osascript -e 'display
  notification …'` ; erreur avalée (best-effort).
- `storage.ts` (étendu) — `loadHandled()` / `saveHandled(ids)` pour
  `.brain/debriefed.json` (tableau d'ids, `chmod` par défaut suffit).

**Couche Ink** :

- `components/organisms/debrief-view.tsx` (nouveau) — le stepper 2 questions
  (réutilise `MultilineInput`), affiche la réunion courante + progression
  (« Réunion 2/3 »).
- `app.tsx` — état de file de debrief (`debriefQueue`, index, phase
  `actions | infos`) ; `useEffect` de poll (`setInterval` ~5 min + cleanup) ;
  rattrapage au démarrage ; gating du rendu comme `sweep` / `connect`.
- `components/atoms/{row,note-row}.tsx` — affichent le `source` s'il est présent.

## Flux

### Détection
1. **Au démarrage** (après connexion agenda + premier `fetchTodaysEvents`) :
   `pendingDebriefs(meetings, now, handled)` → remplit `debriefQueue`. Pas de
   notification (l'utilisateur est déjà là).
2. **En continu** : `setInterval` ~5 min → `fetchTodaysEvents` → nouvelles
   réunions pending. Pour chaque **nouvelle** détectée en direct :
   `notifyMeetingEnded(title)` puis ajout à la file.
3. `handled` (ids) est chargé au démarrage et **élagué** aux réunions du jour ;
   une réunion traitée (debriefée **ou** skippée) y est ajoutée et persistée →
   pas de re-déclenchement (poll suivant, redémarrage).

### Debrief (modal bloquant)
Pour la réunion en tête de file :
1. Phase `actions` → `MultilineInput` : *« ✅ Actions à faire ? — <titre> »*. À la
   validation : `linesToItems` → `addItem(text, source=titre)` pour chaque ligne.
2. Phase `infos` → *« 📝 Infos à garder ? »*. `linesToItems` → `addNote(text,
   source=titre)`.
3. **Skip** (touche dédiée) à tout moment → marque la réunion `handled`, passe à
   la suivante.
4. Fin de réunion → `markHandled(id)`, dépile ; file vide → retour à la vue normale.

### Manuel
`/debrief` (commande, cf. `commands.ts`) → repousse la dernière réunion
`debriefable` du jour en tête de file, même si déjà traitée.

## Modèle de données

`Item` et `Note` gagnent un champ optionnel `source?: string` (titre de la
réunion d'origine). Rétro-compatible : les données existantes n'ont pas le champ.

`addItem` / `addNote` (`items.ts` / `notes.ts`) acceptent un `source` optionnel.

## Gestion des erreurs

- **Réseau indisponible au poll** → échec silencieux, réessai au prochain tick ;
  l'app reste utilisable.
- **`osascript` absent / échoue** → avalé (la notification est un bonus, pas un
  bloquant ; le modal reste la source de vérité).
- **`debriefed.json` corrompu** → traité comme vide (repart propre), sans planter.
- **Réunion qui déborde** : la notification peut arriver à l'heure de fin prévue
  alors qu'on est encore dedans — accepté (skip d'un geste).

## Tests (`node:test`, logique pure)

- `agenda` : `shapeEvents` calcule `debriefable` (≥1 autre participant + non
  décliné + `eventType==='default'` ; faux pour focus/OOO/solo/décliné).
- `debrief` : `pendingDebriefs` (fin passée + debriefable + non traité, tri par
  fin ; exclut traités et futurs) ; `linesToItems` (trim, lignes vides ignorées,
  multi-ligne) ; `pruneHandled` (ne garde que les ids du jour).
- `items` / `notes` : `addItem` / `addNote` posent bien `source` quand fourni.

## Vérification (bout en bout)

1. `npm test` — vert, avec les nouveaux tests purs.
2. `npm start` dans **Ghostty**, agenda connecté :
   - Forcer un cas : une réunion `debriefable` du jour déjà terminée →
     **rattrapage au démarrage** ouvre le modal ; répondre aux 2 questions →
     les tâches/notes apparaissent, étiquetées `· <réunion>`.
   - Skip d'une réunion → passe à la suivante, plus jamais reproposée.
   - `/debrief` → rejoue la dernière réunion.
   - (Notif live : difficile à provoquer à la demande ; vérifier au fil d'une
     vraie réunion, ou en abaissant temporairement l'intervalle de poll.)
3. `debriefed.json` bien écrit dans `<repo>/.brain/`, ids élagués au jour.

## Suite

- **v3** — quand une réunion a un **compte-rendu Gemini** (Drive), l'importer :
  proposer les actions déjà extraites par Gemini en plus (ou à la place) des
  questions manuelles. Ajoute le scope `drive.readonly` au même consentement.
