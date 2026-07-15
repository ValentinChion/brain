// src/theme.ts — jetons visuels (couleurs sémantiques + glyphes).
// Constantes pures, aucune logique → pas de test. Point unique de vérité pour le rendu.
// Palette « braise » : un seul dégradé rouge sombre → or pour toute l'app.
// Le chrome (bordures, filets) est neutre et chaud ; la couleur va aux données.

// La rampe braise, 5 paliers. Source unique : la heatmap /stats l'utilise telle
// quelle, et les jetons sémantiques ci-dessous s'y branchent.
export const statsPalette = [
	'#7f1d1d',
	'#c2410c',
	'#ea580c',
	'#f59e0b',
	'#fbbf24',
] as const;

const [deep, brick, ember, amber, gold] = statsPalette;

export const color = {
	// base
	fg: '#ece3d8', // texte par défaut
	dim: '#8a7d70', // secondaire : « · 2j », sources, agenda, rappels
	faint: '#6f5d4c', // tertiaire : hints, listes vides
	rule: '#4a3524', // filet chaud sous le masthead
	chrome: '#6f5d4c', // bordures de tous les panneaux (visible sur fond noir)
	track: '#3a2c20', // fond « absence de données » : cellule vide, jauge non remplie
	world: '#c9a15a', // libellé de monde sous le mot-marque

	// rampe braise, nommée
	deep, // palier bas de la heatmap
	brick, // famille danger
	ember, // accent primaire
	amber, // caret, curseur de saisie
	gold, // LE chaud : ce qui ressort, la série, les nombres clés

	// sémantique — deux noms peuvent partager un hex : c'est une intention,
	// pas une duplication (resurface = « ça revient », pinned = « c'est gardé »).
	task: ember, // monde tâches
	note: '#d99a2e', // monde notes : distinct, mais dans la famille chaude
	resurface: gold, // ce qui ressort aujourd'hui
	pinned: gold, // note épinglée
	danger: brick, // erreurs, CI rouge, changements demandés
	pr: ember, // accent de la section PRs
} as const;

export const glyph = {
	caret: '❯', // ligne sélectionnée (gouttière col. 1)
	pin: '◆', // épinglée — largeur 1, remplace 📌
	moreUp: '▲',
	moreDown: '▼',
	open: '▾', // groupe PR déplié
	stepLeft: '◀',
	stepRight: '▶',
	prompt: '›',
	editing: '✎',
	multiline: '↵', // « ↵ +N »
	rule: '─', // filet sous le masthead
	bullet: '·',
	prReview: '⇄', // PR à reviewer
	prCiFail: '✗', // CI rouge
	prChanges: '↺', // changements demandés
	prApproved: '✓', // approuvée, à merger
} as const;

export const worldColor = (world: 'tasks' | 'notes') =>
	world === 'tasks' ? color.task : color.note;

export const statsChrome = color.chrome; // bordures des panneaux /stats
