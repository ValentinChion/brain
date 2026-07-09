// Commandes de la barre de saisie : un texte est une commande seulement s'il
// commence par `/` ET que le premier mot est enregistré. Sinon → null (contenu
// normal), ce qui protège la capture de notes commençant par `/` (ex. /etc/hosts).

export type Command = {name: string; args: string[]};
export type CommandInfo = {name: string; description: string};

// Source de vérité unique : le menu (matchCommands) et le parseur (parseCommand)
// lisent la même liste.
export const COMMANDS: CommandInfo[] = [
	{name: 'gauth', description: "connecter l'agenda Google"},
	{name: 'debrief', description: 'debrief de la dernière réunion'},
	{name: 'azure', description: 'configurer Azure DevOps (org projet)'},
	{name: 'prs', description: 'rafraîchir les PRs'},
	{name: 'changelog', description: 'historique des versions'},
	{name: 'stats', description: 'dashboard des stats'},
];

const REGISTRY = new Set(COMMANDS.map(c => c.name));

export function parseCommand(text: string): Command | null {
	const trimmed = text.trim();
	if (!trimmed.startsWith('/')) return null;
	const parts = trimmed.slice(1).split(/\s+/);
	const name = (parts[0] ?? '').toLowerCase();
	if (!REGISTRY.has(name)) return null;
	return {name, args: parts.slice(1)};
}

// Menu : visible seulement pendant la frappe du nom (`/` en premier caractère,
// pas encore d'espace) et s'il reste au moins un préfixe qui matche.
// `/etc` → [] (le texte redevient du contenu normal), `/azure ` → [] (args).
export function matchCommands(draft: string): CommandInfo[] {
	if (!draft.startsWith('/')) return [];
	const q = draft.slice(1);
	if (/\s/.test(q)) return [];
	const lower = q.toLowerCase();
	return COMMANDS.filter(c => c.name.startsWith(lower));
}
