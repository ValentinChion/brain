// Normalisation des PRs de la forge (Azure DevOps) → PrItem[]. Pur et testé.
// Le type PrItem est neutre : ajouter GitHub/GitLab = une fonction shape de plus.

export type PrKind =
	| 'review-requested'
	| 'ci-failed'
	| 'changes-requested'
	| 'approved';

export type PrItem = {
	id: number;
	title: string;
	author: string;
	url: string;
	createdAt: string; // ISO 8601
	kind: PrKind;
};

export type RawPullRequest = {
	pullRequestId?: number;
	title?: string;
	isDraft?: boolean;
	creationDate?: string;
	createdBy?: {id?: string; displayName?: string};
	reviewers?: Array<{id?: string; vote?: number}>;
	repository?: {webUrl?: string; project?: {id?: string}};
};

// votes Azure : 10 approuvé, 5 approuvé avec suggestions, 0 pas de vote,
// -5 waiting for author, -10 rejeté.
function myPrKind(pr: RawPullRequest, ciFailed: boolean): PrKind | null {
	if (ciFailed) return 'ci-failed';
	const votes = (pr.reviewers ?? []).map(r => r.vote ?? 0);
	if (votes.some(v => v < 0)) return 'changes-requested';
	if (votes.some(v => v >= 5)) return 'approved';
	return null; // rien d'actionnable → pas affichée
}

function kindOf(
	pr: RawPullRequest,
	myId: string,
	ciFailed: boolean,
): PrKind | null {
	if (pr.isDraft) return null;
	if (pr.createdBy?.id === myId) return myPrKind(pr, ciFailed);
	const me = (pr.reviewers ?? []).find(r => r.id === myId);
	return me && (me.vote ?? 0) === 0 ? 'review-requested' : null;
}

// Ordre d'affichage du panneau PR. Source unique : le tri de shapePullRequests
// et le groupement de groupPrs lisent le même tableau.
const ORDER: readonly PrKind[] = [
	'review-requested',
	'changes-requested',
	'ci-failed',
	'approved',
];

const rank = (k: PrKind): number => ORDER.indexOf(k);

export function shapePullRequests(
	raw: readonly RawPullRequest[],
	myId: string,
	ciFailedIds: readonly number[] = [],
): PrItem[] {
	const failed = new Set(ciFailedIds);
	return raw
		.map(pr => {
			const id = pr.pullRequestId ?? 0;
			const kind = kindOf(pr, myId, failed.has(id));
			if (!kind) return null;
			return {
				id,
				title: pr.title ?? '(sans titre)',
				author: pr.createdBy?.displayName ?? '?',
				url: pr.repository?.webUrl
					? `${pr.repository.webUrl}/pullrequest/${id}`
					: '',
				createdAt: pr.creationDate ?? '',
				kind,
			};
		})
		.filter((p): p is PrItem => p !== null)
		.sort(
			(a, b) =>
				rank(a.kind) - rank(b.kind) || a.createdAt.localeCompare(b.createdAt),
		);
}

export function ageDays(createdAt: string, nowISO: string): number {
	const ms = new Date(nowISO).getTime() - new Date(createdAt).getTime();
	return Math.max(0, Math.floor(ms / 86_400_000));
}

export type PrGroup = {kind: PrKind; items: PrItem[]};

// Regroupement stable par genre, dans l'ordre du panneau. Les genres sans PR
// sont omis : un compteur à zéro n'a rien à dire. L'identité d'un groupe est
// son `kind` (jamais son index) — un sondage peut en faire disparaître un.
export function groupPrs(prs: readonly PrItem[]): PrGroup[] {
	return ORDER.map(kind => ({
		kind,
		items: prs.filter(p => p.kind === kind),
	})).filter(g => g.items.length > 0);
}
