import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CHANGELOG, changelogLines} from '../src/core/changelog.ts';

test('changelogLines : en-tête version + puces, ligne vide entre versions', () => {
	const lines = changelogLines([
		{version: '0.2.0', date: '2026-07-10', entries: ['a', 'b']},
		{version: '0.1.0', date: '2026-07-08', entries: ['c']},
	]);
	assert.deepEqual(lines, [
		'v0.2.0 — 2026-07-10',
		'  · a',
		'  · b',
		'',
		'v0.1.0 — 2026-07-08',
		'  · c',
	]);
});

test('garde-fou : CHANGELOG[0].version === version du package', () => {
	const pkg = JSON.parse(
		readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
	) as {version: string};
	assert.equal(CHANGELOG[0].version, pkg.version);
});
