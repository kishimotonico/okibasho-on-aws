import * as esbuild from 'esbuild';
import { chmod } from 'node:fs/promises';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/share-html.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  banner: {
    js: '#!/usr/bin/env node',
  },
});

await chmod('dist/share-html.js', 0o755);
