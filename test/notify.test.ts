import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notifyScript} from '../src/core/notify.ts';

test('notifyScript : échappe les guillemets et inclut le titre', () => {
	const s = notifyScript('Point "urgent"');
	assert.match(s, /^display notification "/);
	assert.match(s, /Point \\"urgent\\"/); // guillemets échappés pour AppleScript
	assert.match(s, /with title "brain 🧠"/);
});

test('notifyScript : titre avec retour à la ligne reste sur une seule ligne', () => {
	const s = notifyScript('Point\nurgent\r\nsuite');
	assert.equal(s.includes('\n'), false);
	assert.equal(s.includes('\r'), false);
	assert.match(s, /Point urgent suite/);
});
