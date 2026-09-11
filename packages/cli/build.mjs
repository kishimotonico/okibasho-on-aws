import * as esbuild from 'esbuild';
import { chmod } from 'node:fs/promises';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/okiba.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  banner: {
    // AWS SDK (CJS) をESMに束ねると内部の require() が残るため、createRequire で補う
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as __bannerCreateRequire } from 'node:module';",
      'const require = __bannerCreateRequire(import.meta.url);',
    ].join('\n'),
  },
});

await chmod('dist/okiba.js', 0o755);
