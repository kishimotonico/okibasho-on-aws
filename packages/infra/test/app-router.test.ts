import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

type CloudFrontRequest = { uri: string };

const functionPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../lib/functions/app-router.js',
);

function loadHandler(): (event: { request: CloudFrontRequest }) => CloudFrontRequest {
  const sandbox: { handler?: (event: { request: CloudFrontRequest }) => CloudFrontRequest } = {};
  runInNewContext(readFileSync(functionPath, 'utf-8'), sandbox);
  if (!sandbox.handler) {
    throw new Error('handler が定義されていません');
  }
  return sandbox.handler;
}

describe('app-router', () => {
  const handler = loadHandler();
  const rewrite = (uri: string) => handler({ request: { uri } }).uri;

  it('拡張子の無いパスはSPAシェルへ寄せる', () => {
    expect(rewrite('/')).toBe('/_shell.html');
    expect(rewrite('/upload')).toBe('/_shell.html');
    expect(rewrite('/my-pages/abc')).toBe('/_shell.html');
  });

  it('拡張子付きのアセットはそのまま通す', () => {
    expect(rewrite('/assets/index-abc123.js')).toBe('/assets/index-abc123.js');
    expect(rewrite('/assets/app.css')).toBe('/assets/app.css');
    expect(rewrite('/_shell.html')).toBe('/_shell.html');
  });
});
