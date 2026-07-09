# `brain` — notifications macOS sur PR actionnable

## Problème

Le miroir PRs affiche les bonnes lignes, mais il faut regarder le panneau pour les voir. Quand on est plongé dans un autre écran, une demande de review ou une CI rouge peut attendre des heures. Le rappel doit venir à moi (même principe que la notification de fin de réunion).

## Principe

**Une bannière macOS quand une PR entre dans la section actionnable.** Aucune nouvelle source de données : le poll existant (5 min) détecte déjà tout ; on ajoute seulement la comparaison entre deux polls et le `display notification`.

Une ligne est « nouvelle » si sa paire `(id, kind)` n'existait pas au poll précédent. Un changement de `kind` re-notifie (ma PR qui passe d'`approved` à `changes-requested` mérite un ping) ; une ligne inchangée reste silencieuse ; une ligne qui disparaît ne dit rien.

## Décisions actées (interview)

- **Bannière « bête »** : pas cliquable (limite `osascript`). Son rôle est « regarde ton panneau » ; `o`/Entrée sur la ligne fait l'ouverture. Pas de dépendance (`terminal-notifier`…) pour du click-to-open.
- **Tous les kinds notifient** : `review-requested`, `ci-failed`, `changes-requested`, `approved`. Une seule règle, pas de config par kind.
- **Démarrage silencieux** : le premier poll réussi amorce la mémoire sans notifier — lancer brain, c'est déjà regarder le panneau. Pas de rafale au lancement du matin.
- **`/prs` manuel = même chemin** : un rafraîchissement manuel qui découvre du nouveau notifie aussi. Redondance rare et inoffensive ; pas de flag `silent`.
- **Rafale > 3 : bannière résumé** : 1 à 3 nouveautés → une bannière chacune ; au-delà → une seule (« N PRs attendent une action », compte brut sans détail par kind — le panneau fait mieux).
- **One-shot, pas de relance** : une ligne notifie une fois puis vieillit visiblement dans le panneau (`· 2j`, tri plus anciennes d'abord). Un nag quotidien exigerait de la persistance — à reconsidérer avec de l'usage réel si les reviews traînent encore.
- **Son « Glass »** : signature sonore distinctive = « c'est brain ». Appliqué aussi à la bannière de fin de réunion existante pour la cohérence.

## Modules

- `src/core/forge.ts` — **pur, testé.** `freshPrs(prev: readonly PrItem[], next: readonly PrItem[]): PrItem[]` : les items de `next` dont la paire `(id, kind)` est absente de `prev`.
- `src/core/notify.ts` — **builders purs testés, spawn non testé.** Généraliser le spawn existant (`notify(script)` interne) ; `notifyMeetingEnded` garde son comportement (+ son Glass). Nouveaux builders réutilisant `escapeAppleScript` :
  - `review demandée · {title} ({author})`
  - `CI rouge · {title}`
  - `changements demandés · {title}`
  - `approuvée — à merger · {title}`
  - résumé : `{n} PRs attendent une action`
  - tous avec `sound name "Glass"`.
- `src/app.tsx` — câblage dans `refreshPrs` : une ref `prevPrs: PrItem[] | null` (null = jamais pollé → amorçage silencieux). Fetch réussi : `fresh = freshPrs(prev, next)` ; 1–3 → une bannière par item, sinon résumé ; mettre à jour la ref. Fetch en échec : ref intacte → aucun faux ping à la reprise.

## Gestion des erreurs

- `osascript` absent : déjà avalé (spawn `error` ignoré) — le panneau ne plante jamais.
- Permission notifications macOS coupée : la bannière ne s'affiche pas, aucun échec côté brain (vérifié à la main sur la machine cible).

## Tests

`node:test` sur :

- `freshPrs` : nouvel id, transition de kind, disparition, aucun changement, `prev` vide ;
- les builders de message : libellé par kind, résumé, échappement des guillemets dans un titre de PR.

Pas de test Ink : le câblage tient en quelques lignes dans un handler existant, vérification manuelle via le harnais PTY.

## Hors périmètre (YAGNI)

- Bannière cliquable (dépendance requise).
- Relance/nag sur ligne qui traîne (exigerait de la persistance — approche B rejetée).
- Notification quand une ligne disparaît (PR mergée) — zéro bruit.
- Deux instances de brain en parallèle → doubles bannières (ne pas faire ça).
- Persistance de l'état notifié (`~/.brain/pr-notified.json`) — brain vit en split permanent, ce qui est raté en son absence reste visible dans le panneau.
