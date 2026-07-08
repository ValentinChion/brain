import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import React from 'react';
import {render} from 'ink-testing-library';

const tick = async () =>
	new Promise(resolve => {
		setTimeout(resolve, 30);
	});

// Smoke UI (unique, ciblé — standards/ink.md §9) : /stats ouvre l'écran, Échap restaure.
test('/stats ouvre l’écran néon, Échap restaure l’app', async () => {
	process.env.BRAIN_DIR = mkdtempSync(join(tmpdir(), 'brain-'));
	try {
		const {default: App} = await import('../src/app.tsx');
		const {lastFrame, stdin, unmount} = render(React.createElement(App));
		await tick();
		stdin.write('n'); // ferme le prompt de connexion agenda
		await tick();
		stdin.write('/stats');
		await tick();
		stdin.write('\r');
		await tick();
		assert.match(lastFrame() ?? '', /S T A T S/);
		stdin.write(''); // Échap
		await tick();
		const frame = lastFrame() ?? '';
		assert.doesNotMatch(frame, /S T A T S/);
		assert.match(frame, /TÂCHES/);
		unmount();
	} finally {
		delete process.env.BRAIN_DIR;
	}
});
