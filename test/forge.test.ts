import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
	shapePullRequests,
	ageDays,
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

test('ma PR sans vote ni CI rouge → exclue (rien à faire)', () => {
	const raw = [
		pr({
			createdBy: {id: ME, displayName: 'Moi'},
			reviewers: [{id: 'b', vote: 0}],
		}),
	];
	assert.equal(shapePullRequests(raw, ME).length, 0);
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
