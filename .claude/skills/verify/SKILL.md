---
name: verify
description: Vérifier brain (TUI Ink) en le pilotant sous un vrai PTY — build/launch/drive/capture, sans tmux.
---

# Vérifier brain au runtime

Pas de build : `npm start` (tsx). Le TUI exige un TTY → utiliser `script(1)` (macOS) qui alloue un PTY, avec les frappes injectées par un sous-shell à délais :

```bash
D=$(mktemp -d)   # BRAIN_DIR isolé (tasks.json/notes.json/meta.json y vivent)
(sleep 4; printf 'n'; sleep 1; printf '/changelog'; sleep 0.5; printf '\r'; sleep 1; printf '\003') \
  | BRAIN_DIR=$D script -q /chemin/capture.out npm start >/dev/null 2>&1
```

Dépouiller la capture (frames ANSI) :

```bash
perl -pe 's/\e\[[0-9;?]*[a-zA-Z]//g; s/\e[()][B0]//g' capture.out | grep -v '^\s*$'
```

## Pièges

- **Envoyer chaque touche « action » dans son propre chunk.** `printf '/changelog\r'` arrive en un seul chunk → le `\r` est inséré comme du texte (chemin collage de MultilineInput) au lieu de soumettre. Toujours `printf '/changelog'; sleep 0.5; printf '\r'`.
- Attendre ~4 s après le lancement (tsx démarre lentement) avant la première touche.
- Au premier lancement sans token Google, le prompt agenda s'affiche d'abord : `n` pour le passer.
- Touches : `\r` Entrée · `\033` Échap · `\003` Ctrl-C (seule sortie propre).
- Vérifier aussi l'état disque après coup : `cat "$D"/*.json`.

## Parcours utiles

- Capture : taper du texte + Entrée → la ligne apparaît, présente dans `tasks.json`.
- Commandes barre : `/gauth /debrief /azure /prs /changelog` ; un `/xxx` non enregistré doit devenir du contenu.
- Takeover changelog : pré-écrire `{"lastSeenVersion":"0.0.1"}` dans `$D/meta.json` → écran NOUVEAUTÉS après le prompt agenda ; Entrée le ferme et réécrit la version courante.
