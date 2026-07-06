// src/core/hints.ts — texte d'aide contextuel (pur, testable). Aucun import Ink.

type World = 'tasks' | 'notes';
type Mode = 'input' | 'nav' | 'reminder';

export function hint(world: World, mode: Mode): string {
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
