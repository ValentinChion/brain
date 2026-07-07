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

const rank = (k: PrKind): number => (k === 'review-requested' ? 0 : 1);

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
