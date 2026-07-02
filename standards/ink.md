# Standard de code Ink

Conventions pour écrire des apps terminal en [Ink](https://github.com/vadimdemedes/ink) (React pour le CLI). Basé sur la doc officielle Ink 5 + patterns éprouvés. S'applique au projet `brain` et à tout futur TUI.

## 1. Règle d'or : logique pure ≠ couche Ink

La leçon la plus rentable. Le composant Ink ne doit faire que **afficher** et **câbler le clavier**. Toute la logique métier (calculs, tri, dates, I/O, transformations d'état) vit dans des modules purs, sans import d'Ink ni de React.

- **Pur** = fonctions déterministes `(entrée) => sortie`, sans effet de bord caché, testables avec `node:test`.
- **Ink** = `useState` + `useInput` + JSX qui appelle ces fonctions pures.

```
src/
  types.ts     # types partagés
  date.ts      # pur — testé
  view.ts      # pur — testé
  items.ts     # pur — testé
  storage.ts   # I/O isolée — testé
  app.tsx      # Ink : état + clavier + rendu (non testé unitairement)
  cli.tsx      # point d'entrée : render(<App/>)
```

Pourquoi : le rendu terminal est pénible à tester ; les fonctions pures ne le sont pas. Si tu as besoin d'un test pour une logique, c'est qu'elle ne doit pas être dans le `.tsx`.

## 2. Configuration TypeScript

`jsx: "react-jsx"` (nouvelle transform, pas besoin d'importer React pour le JSX seul — mais garde l'import si tu utilises `React.xxx`). Config minimale qui marche avec `tsx` :

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

Exécuter sans build avec `tsx` (`tsx src/cli.tsx`). Pas de step de compilation en dev.

## 3. Layout : `<Box>` et `<Text>` uniquement

- **Tout texte** doit être dans un `<Text>`. Une string nue en dehors d'un `<Text>` casse le rendu.
- **`<Box>`** = conteneur Flexbox (comme une `<div>` en `display: flex`). Utilise `flexDirection`, `gap`, `padding`, `marginTop`, etc. — pas de CSS, tout en props.
- Ne mets **pas** de `<Box>` à l'intérieur d'un `<Text>` (le texte ne contient que du texte / d'autres `<Text>`).

```tsx
<Box flexDirection="column" padding={1}>
  <Text bold>Titre</Text>
  <Box marginTop={1}>
    <Text color="green">› </Text>
    <Text>ligne</Text>
  </Box>
</Box>
```

Styles utiles sur `<Text>` : `color`, `backgroundColor`, `bold`, `dimColor`, `inverse` (surlignage sélection), `strikethrough`.

## 4. Clavier : `useInput`

Le hook central. `useInput((input, key) => …)`.

- `input` = le caractère tapé (string). `key` = booléens (`upArrow`, `downArrow`, `return`, `escape`, `ctrl`, `tab`, `backspace`…).
- **Un seul `useInput` actif à la fois par zone de responsabilité.** Quand plusieurs coexistent (ex : une barre de saisie + un mode navigation), désactive ceux qui ne doivent pas répondre avec l'option `isActive` :

```tsx
useInput(handleNav, { isActive: mode === "nav" });
```

- Ne mets **pas** de logique lourde dans le handler : il calcule l'action et appelle une fonction pure, puis `setState`.
- Le handler est recréé à chaque render : il voit toujours l'état courant via closure. Pas besoin de `useCallback` sauf perf mesurée.

### Saisie de texte : ne réinvente pas

Pour un champ de saisie (curseur, backspace, coller), utilise `ink-text-input` plutôt que de gérer les touches à la main :

```tsx
<TextInput value={draft} onChange={setDraft} onSubmit={submit} focus={mode === "input"} />
```

`focus={false}` empêche le champ de capter les touches quand un autre mode a la main — indispensable pour cohabiter avec un `useInput` de navigation.

## 5. Focus entre plusieurs composants

Pour un formulaire à plusieurs champs, utilise le système de focus intégré plutôt qu'un état maison :

- `useFocus({ id })` → `{ isFocused, focus }` par composant.
- `useFocusManager()` → `focusNext`, `focusPrevious`, `focus(id)` global (souvent câblé sur `Tab`).

Pour un TUI simple à un seul champ + une liste (comme `brain`), un `mode: "input" | "nav"` en `useState` suffit — n'importe pas la machinerie de focus si tu n'en as pas besoin (YAGNI).

## 6. Cycle de vie et sortie

- `const { exit } = useApp()` pour quitter proprement (démonte l'app, restaure le terminal). **Préfère `exit()` à `process.exit()`** : `process.exit()` coupe brutalement et peut laisser le terminal dans un état sale.
- Par défaut Ink quitte sur `Ctrl-C`. Désactive avec `render(<App/>, { exitOnCtrlC: false })` seulement si tu gères la sortie toi-même.
- `waitUntilExit()` (retour de `render`) pour attendre la fin de l'app côté script appelant.
- Effets asynchrones (I/O, timers) : toujours dans `useEffect` avec cleanup (`clearInterval`, annulation) pour ne pas fuiter après démontage.

## 7. Sortie permanente : `<Static>`

Pour des logs / un flux d'événements qui s'accumulent au-dessus de l'UI dynamique (build, tests, activité), utilise `<Static>` : Ink le rend **une seule fois** et ne le redessine plus, ce qui évite de recomposer tout l'historique à chaque frame.

```tsx
<Static items={logs}>{(line, i) => <Text key={i}>{line}</Text>}</Static>
```

À réserver au contenu figé. Le contenu qui change reste hors `<Static>`.

## 8. Performance

- Le rendu terminal est cher : **minimise la surface qui change**. Découpe en sous-composants pour que React ne re-render que ce qui bouge.
- Historique volumineux → `<Static>` (cf. §7), pas une grande liste re-rendue en boucle.
- Animations / timers via `useEffect` + `setInterval`, ou le hook `useAnimation` d'Ink ; jamais de boucle qui `setState` sans borne.
- Ne recalcule pas de gros dérivés à chaque render sans raison — mais ne sur-optimise pas non plus (`useMemo` seulement si un profil le justifie).

## 9. Tests

Ligne de partage :

- **Logique pure (§1)** → `node:test` + `node:assert`, aucun framework. C'est là que se concentre la couverture.
- **Composants Ink** → `ink-testing-library` seulement pour les interactions clés, pas pour tout pixel.

```tsx
import { render } from "ink-testing-library";

const { lastFrame, stdin, rerender, unmount } = render(<App />);
lastFrame();                 // string du dernier rendu → assertions
stdin.write("bonjour\r");    // simule la frappe (\r = Entrée)
stdin.write("[A");     // flèche haut (séquence ANSI)
```

Séquences utiles : `\r` Entrée · `` Échap · `[A/B/C/D` flèches haut/bas/droite/gauche · `` Ctrl-C.

Garde ces tests UI rares et ciblés (un parcours nominal, un cas d'erreur) : ils sont plus fragiles que les tests de logique pure.

## 10. Pièges fréquents

| Piège | Correctif |
|-------|-----------|
| String hors `<Text>` | Toujours envelopper dans `<Text>`. |
| Deux `useInput` qui répondent en même temps | Un seul actif via `isActive`. |
| Champ texte qui vole les touches de navigation | `focus={false}` sur `<TextInput>` hors mode saisie. |
| `process.exit()` qui salit le terminal | Utiliser `useApp().exit()`. |
| Grande liste re-rendue en continu | `<Static>` pour la partie figée. |
| Logique métier dans le `.tsx` | La sortir dans un module pur testé. |
| `key` manquante dans une liste | Clé stable (l'`id` du modèle), jamais l'index si l'ordre change. |
| Timer/effet sans cleanup | `return () => clearInterval(...)` dans le `useEffect`. |

---

**En une phrase :** garde tout le cerveau dans des fonctions pures testées, et traite le `.tsx` comme une fine couche d'affichage clavier — c'est ce qui rend un TUI Ink lisible, testable et modifiable.
