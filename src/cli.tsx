import React from 'react';
import {render} from 'ink';
import App from './app.tsx';

// Écran alternatif (pas de pollution du scrollback, restauré à la sortie) ;
// protocole kitty géré par Ink (push/pop + parsing des séquences CSI u).
// mode 'enabled' (pas 'auto') : 'auto' interroge le terminal (CSI ? u) avant
// que useInput n'ait activé le raw mode — la réponse de Ghostty (CSI ? 0 u)
// est alors échoée à l'écran ou livrée après coup dans le champ de saisie
// (« ^[[?0u »). 'enabled' pousse les flags sans interroger ; les terminaux
// sans kitty ignorent la séquence.
// exitOnCtrlC désactivé : la détection interne d'Ink 7 ne reconnaît que l'octet
// brut \x03 (components/App.js), pas la forme kitty CSI 99;5u — et son
// interception avale la touche avant nos handlers. L'app gère Ctrl+C elle-même
// (isCtrlC dans app.tsx, qui couvre les deux formes).
render(<App />, {
	alternateScreen: true,
	kittyKeyboard: {mode: 'enabled'},
	exitOnCtrlC: false,
});
