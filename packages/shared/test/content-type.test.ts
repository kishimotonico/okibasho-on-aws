import { describe, expect, it } from 'vitest';
import { contentTypeFromPath } from '../src/content-type.js';

describe('contentTypeFromPath', () => {
  it.each([
    ['index.html', 'text/html'],
    ['assets/style.css', 'text/css'],
    ['app.js', 'text/javascript'],
    ['logo.png', 'image/png'],
    ['icon.svg', 'image/svg+xml'],
    ['data.json', 'application/json'],
  ])('%s → %s', (path, expected) => {
    expect(contentTypeFromPath(path)).toBe(expected);
  });

  it('未知の拡張子は application/octet-stream', () => {
    expect(contentTypeFromPath('file.xyzunknown')).toBe('application/octet-stream');
  });

  it('拡張子なしは application/octet-stream', () => {
    expect(contentTypeFromPath('README')).toBe('application/octet-stream');
  });
});
