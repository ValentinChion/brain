import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
	shapePullRequests,
	groupPrs,
	ageDays,
	type PrItem,
	type RawPullRequest,
} from '../src/core/forge.ts';

const ME = 'me-id';

const pr = (over: Partial<RawPullRequest>): RawPullRequest => ({
	pullRequestId: 1,
	title: 'T',
	isDraft: false,
	creationDate: '2026-07-01T00:00:00Z',
	createdBy: {id: 'alice-id', displayName: 'Alice'},
	reviewers: [],
	repository: {webUrl: 'https://dev.azure.com/org/proj/_git/repo'},
	...over,
});

test('reviewer demandé sans vote → review-requested', () => {
	const raw = [pr({reviewers: [{id: ME, vote: 0}]})];
	const out = shapePullRequests(raw, ME);
	assert.equal(out.length, 1);
	assert.equal(out[0].kind, 'review-requested');
	assert.equal(out[0].author, 'Alice');
	assert.equal(
		out[0].url,
		'https://dev.azure.com/org/proj/_git/repo/pullrequest/1',
	);
});

test("j'ai déjà voté → la PR sort de la liste", () => {
	const raw = [pr({reviewers: [{id: ME, vote: 10}]})];
	assert.equal(shapePullRequests(raw, ME).length, 0);
});

test('draft → exclue, même si je suis reviewer', () => {
	const raw = [pr({isDraft: true, reviewers: [{id: ME, vote: 0}]})];
	assert.equal(shapePullRequests(raw, ME).length, 0);
});

test("PR d'un autre où je ne suis pas reviewer → exclue", () => {
	const raw = [pr({reviewers: [{id: 'bob-id', vote: 0}]})];
	assert.equal(shapePullRequests(raw, ME).length, 0);
});

test('ma PR, CI en échec → ci-failed (prioritaire sur les votes)', () => {
	const raw = [
		pr({
			createdBy: {id: ME, displayName: 'Moi'},
			reviewers: [{id: 'b', vote: -5}],
		}),
	];
	const out = shapePullRequests(raw, ME, [1]);
	assert.equal(out[0].kind, 'ci-failed');
});

test('ma PR, un vote négatif → changes-requested', () => {
	const raw = [
		pr({
			createdBy: {id: ME, displayName: 'Moi'},
			reviewers: [{id: 'b', vote: -5}],
		}),
	];
	assert.equal(shapePullRequests(raw, ME)[0].kind, 'changes-requested');
});

test('ma PR, ≥1 approbation et aucun vote bloquant → approved', () => {
	const raw = [
		pr({
			createdBy: {id: ME, displayName: 'Moi'},
			reviewers: [
				{id: 'b', vote: 5},
				{id: 'c', vote: 0},
			],
		}),
	];
	assert.equal(shapePullRequests(raw, ME)[0].kind, 'approved');
});

test('ma PR sans vote ni CI rouge → « en cours » (affichée, informative)', () => {
	const raw = [
		pr({
			createdBy: {id: ME, displayName: 'Moi'},
			reviewers: [{id: 'b', vote: 0}],
		}),
	];
	const out = shapePullRequests(raw, ME);
	assert.equal(out.length, 1);
	assert.equal(out[0].kind, 'mine');
});

test('tri : reviews avant mes PRs, puis plus anciennes en premier', () => {
	const raw = [
		pr({
			pullRequestId: 1,
			creationDate: '2026-07-03T00:00:00Z',
			createdBy: {id: ME, displayName: 'Moi'},
			reviewers: [{id: 'b', vote: -5}],
		}),
		pr({
			pullRequestId: 2,
			creationDate: '2026-07-02T00:00:00Z',
			reviewers: [{id: ME, vote: 0}],
		}),
		pr({
			pullRequestId: 3,
			creationDate: '2026-07-01T00:00:00Z',
			reviewers: [{id: ME, vote: 0}],
		}),
	];
	assert.deepEqual(
		shapePullRequests(raw, ME).map(p => p.id),
		[3, 2, 1],
	);
});

test('entrée malformée (champs absents) → ignorée sans jeter', () => {
	const malformed: RawPullRequest = {};
	const out = shapePullRequests([malformed], ME);
	assert.deepEqual(out, []);
});

test('ageDays : jours entiers écoulés, jamais négatif', () => {
	assert.equal(ageDays('2026-07-01T00:00:00Z', '2026-07-03T12:00:00Z'), 2);
	assert.equal(ageDays('2026-07-05T00:00:00Z', '2026-07-03T00:00:00Z'), 0);
});

const item = (id: number, kind: PrItem['kind']): PrItem => ({
	id,
	title: `T${id}`,
	author: 'A',
	url: '',
	createdAt: '2026-07-01T00:00:00Z',
	kind,
});

test('groupPrs : groupe par genre, dans l’ordre du panneau, sans groupe vide', () => {
	const groups = groupPrs([
		item(1, 'approved'),
		item(2, 'review-requested'),
		item(3, 'ci-failed'),
		item(4, 'review-requested'),
	]);
	assert.deepEqual(
		groups.map(g => g.kind),
		['review-requested', 'ci-failed', 'approved'],
	);
	// l'ordre d'entrée est préservé dans chaque groupe
	assert.deepEqual(
		groups[0].items.map(p => p.id),
		[2, 4],
	);
	assert.equal(groups[1].items.length, 1);
});

test('groupPrs : liste vide → aucun groupe', () => {
	assert.deepEqual(groupPrs([]), []);
});

test('shapePullRequests : les 4 genres sortent dans l’ordre du panneau', () => {
	const raw = [
		pr({
			pullRequestId: 1,
			createdBy: {id: ME},
			reviewers: [{id: 'b', vote: 10}],
		}), // approved
		pr({pullRequestId: 2, reviewers: [{id: ME, vote: 0}]}), // review-requested
		pr({
			pullRequestId: 3,
			createdBy: {id: ME},
			reviewers: [{id: 'b', vote: -5}],
		}), // changes-requested
		pr({pullRequestId: 4, createdBy: {id: ME}, reviewers: []}), // ci-failed
	];
	assert.deepEqual(
		shapePullRequests(raw, ME, [4]).map(p => p.kind),
		['review-requested', 'changes-requested', 'ci-failed', 'approved'],
	);
});

test('ma PR ouverte sans vote → « mine » (en cours), au lieu de null', () => {
	const raw = [pr({createdBy: {id: ME}, reviewers: []})];
	const out = shapePullRequests(raw, ME);
	assert.equal(out.length, 1);
	assert.equal(out[0].kind, 'mine');
});

test('ma PR draft reste masquée, même « en cours »', () => {
	const raw = [pr({isDraft: true, createdBy: {id: ME}, reviewers: []})];
	assert.deepEqual(shapePullRequests(raw, ME), []);
});

test('« mine » se trie en dernier, après approved', () => {
	const raw = [
		pr({pullRequestId: 1, createdBy: {id: ME}, reviewers: []}), // mine
		pr({pullRequestId: 2, reviewers: [{id: ME, vote: 0}]}), // review-requested
		pr({
			pullRequestId: 3,
			createdBy: {id: ME},
			reviewers: [{id: 'b', vote: 10}],
		}), // approved
	];
	assert.deepEqual(
		shapePullRequests(raw, ME).map(p => p.kind),
		['review-requested', 'approved', 'mine'],
	);
});
