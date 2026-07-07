import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notifyScript} from '../src/core/notify.ts';

test('notifyScript : échappe les guillemets et inclut le titre', () => {
	const s = notifyScript('Point "urgent"');
	assert.match(s, /^display notification "/);
	assert.match(s, /Point \\"urgent\\"/); // guillemets échappés pour AppleScript
	assert.match(s, /with title "brain 🧠"/);
});
