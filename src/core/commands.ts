// Commandes de la barre de saisie : un texte est une commande seulement s'il
// commence par `/` ET que le premier mot est enregistré. Sinon → null (contenu
// normal), ce qui protège la capture de notes commençant par `/` (ex. /etc/hosts).

export type Command = {name: string; args: string[]};

const REGISTRY = new Set(['gauth', 'debrief', 'azure', 'prs']);

export function parseCommand(text: string): Command | null {
	const trimmed = text.trim();
	if (!trimmed.startsWith('/')) return null;
	const parts = trimmed.slice(1).split(/\s+/);
	const name = (parts[0] ?? '').toLowerCase();
	if (!REGISTRY.has(name)) return null;
	return {name, args: parts.slice(1)};
}
