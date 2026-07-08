import React from 'react';
import {render} from 'ink';
import App from './app.tsx';

// Écran alternatif (pas de pollution du scrollback, restauré à la sortie) ;
// protocole kitty géré par Ink (push/pop + parsing des séquences CSI u).
// exitOnCtrlC désactivé : la détection interne d'Ink 7 ne reconnaît que l'octet
// brut \x03 (components/App.js), pas la forme kitty CSI 99;5u — et son
// interception avale la touche avant nos handlers. L'app gère Ctrl+C elle-même
// (isCtrlC dans app.tsx, qui couvre les deux formes).
render(<App />, {
	alternateScreen: true,
	kittyKeyboard: {mode: 'auto'},
	exitOnCtrlC: false,
});
