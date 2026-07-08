// Nouveautés de brain — source de vérité du changelog (bundlée par esbuild,
// pas de CHANGELOG.md à résoudre à l'exécution). Plus récent en premier ;
// la « version courante » de l'app est CHANGELOG[0].version (un test garde-fou
// vérifie l'égalité avec package.json).

export type ChangelogEntry = {
	version: string;
	date: string; // YYYY-MM-DD
	entries: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.1.0',
		date: '2026-07-08',
		entries: [
			'Capture de tâches/feedbacks avec rappels (stepper aux flèches)',
			'Notes épinglables + ménage hebdomadaire des notes périmées',
			'Agenda Google : réunions du jour + débrief de fin de réunion',
			'Miroir des PRs Azure DevOps (lecture seule)',
			'Commandes : /gauth /debrief /azure /prs /changelog',
		],
	},
];

// Lignes prêtes à afficher (la vue ne fait que les rendre + fenêtrer).
export function changelogLines(log: ChangelogEntry[]): string[] {
	return log.flatMap((entry, i) => [
		...(i > 0 ? [''] : []),
		`v${entry.version} — ${entry.date}`,
		...entry.entries.map(text => `  · ${text}`),
	]);
}
