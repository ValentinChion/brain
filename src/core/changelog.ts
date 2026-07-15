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
		version: '0.3.0',
		date: '2026-07-15',
		entries: [
			'Refonte visuelle « braise » : une seule palette chaude (rouge sombre → or) sur toute l’app, panneaux cadrés pour les tâches, les notes et les PRs',
			'Écran /stats : série, flux sur 7 jours, activité et records (commande /stats)',
			'Miroir PRs repensé : compteurs en mots (à voir / à corriger / CI / à merger), un genre « en cours » pour tes PRs en attente de review, Entrée déplie un groupe pour le triage',
			'Bandeau agenda repensé : prochaine réunion avec compte à rebours et mèche qui se consume ; états « en cours », « journée dégagée », « terminé »',
			'Menu de commandes : tape « / » en début de saisie pour lister et lancer les commandes (navigable aux flèches)',
			'Maj+↑/↓ : saut direct entre sections (PRs ↔ tâches ↔ saisie)',
			'Azure DevOps : /azure accepte les noms de projet avec espaces et se connecte sur le tenant de l’organisation (invités B2B)',
			'Corrections : un aléa réseau ne déconnecte plus l’agenda ; saisie fiable sous Ghostty (protocole kitty)',
		],
	},
	{
		version: '0.2.0',
		date: '2026-07-08',
		entries: [
			'Miroir des PRs Azure DevOps : /azure connecte, /prs rafraîchit, navigation aux flèches',
			'Changelog intégré : nouveautés après mise à jour + commande /changelog',
			'Rendu calé sur la hauteur du terminal (plus de débordement en petit split)',
			"Tab n'abandonne plus silencieusement le stepper de rappel",
			'Démarrage plus réactif (une seule lecture disque au montage)',
			'Base technique : Ink 7 + React 19 (Node ≥ 22 requis)',
		],
	},
	{
		version: '0.1.0',
		date: '2026-07-07',
		entries: [
			'Capture de tâches/feedbacks avec rappels (stepper aux flèches)',
			'Notes épinglables + ménage hebdomadaire des notes périmées',
			'Agenda Google : réunions du jour + débrief de fin de réunion',
			'Commandes : /gauth /debrief',
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
