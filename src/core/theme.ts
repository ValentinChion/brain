// src/theme.ts — jetons visuels (couleurs sémantiques + glyphes).
// Constantes pures, aucune logique → pas de test. Point unique de vérité pour le rendu.

export const color = {
	task: 'cyan', // monde tâches (badge + prompt + entête stepper)
	note: 'blue', // monde notes (badge + prompt + ménage)
	resurface: 'yellow', // LE chaud, réservé à « ce qui ressort aujourd'hui »
	pinned: 'green', // note épinglée = gardée
	danger: 'red', // erreur de chargement
	pr: 'magenta', // section PRs (miroir de la forge)
} as const;

export const glyph = {
	caret: '❯', // ligne sélectionnée (gouttière col. 1)
	pin: '◆', // épinglée — largeur 1, remplace 📌
	moreUp: '▲',
	moreDown: '▼',
	stepLeft: '◀',
	stepRight: '▶',
	prompt: '›',
	editing: '✎',
	multiline: '↵', // « ↵ +N »
	rule: '─', // filet de la bannière resurgissement
	bullet: '·',
	prReview: '⇄', // PR à reviewer
	prCiFail: '✗', // CI rouge
	prChanges: '↺', // changements demandés
	prApproved: '✓', // approuvée, à merger
} as const;

export const worldColor = (world: 'tasks' | 'notes') =>
	world === 'tasks' ? color.task : color.note;
