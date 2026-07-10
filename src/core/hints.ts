// src/core/hints.ts — texte d'aide contextuel (pur, testable). Aucun import Ink.

type World = 'tasks' | 'notes';
type Mode = 'input' | 'nav' | 'reminder' | 'prnav';

export function hint(
	world: World,
	mode: Mode,
	menuOpen = false,
	prExpanded = false,
): string {
	if (menuOpen) {
		return '↑/↓ choisir · Entrée: exécuter · Tab: compléter · Échap: annuler';
	}

	// Le panneau PR n'a pas de ligne de hints à lui : ses deux états sont dits ici.
	if (mode === 'prnav') {
		return prExpanded
			? '↑/↓ PR · ←/→ groupe · o/Entrée: ouvrir · Échap: replier'
			: '←/→ groupe · Entrée: déplier · ↓ tâches · Échap: saisie';
	}

	if (world === 'tasks') {
		if (mode === 'input') return 'Entrée: ajouter · ↑: naviguer · Tab: notes';
		if (mode === 'nav') {
			return '↑/↓ · Espace: fait · r: rappel · e: éditer · d: suppr · Échap: saisie';
		}

		return '';
	}

	if (mode === 'input') {
		return 'Entrée: ajouter · Shift+Entrée: ligne · ↑: naviguer · Tab: tâches';
	}

	return '↑/↓ · p: épingler · e: éditer · d: suppr · Échap: saisie · Tab: tâches';
}
