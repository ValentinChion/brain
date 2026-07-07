// Bundle brain into a single self-contained dist/cli.js (zéro dépendance runtime).
// - tout inliné (Ink, React, yoga) → l'app ne dépend plus que de `node`
// - react-devtools-core (dev only) remplacé par un stub vide
// - bannière createRequire : permet aux deps CJS un `require()` dynamique en ESM
import {chmodSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'dist', 'cli.js');

await build({
	entryPoints: [join(here, '..', 'src', 'cli.tsx')],
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node20',
	outfile: out,
	alias: {'react-devtools-core': join(here, 'devtools-stub.mjs')},
	banner: {
		js:
			'#!/usr/bin/env node\n' +
			'import{createRequire as __cr}from"node:module";const require=__cr(import.meta.url);',
	},
});

chmodSync(out, 0o755);
console.log('built', out);
