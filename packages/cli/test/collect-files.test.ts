import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectFiles, CollectFilesError, SingleFileNotHtmlError } from '../src/collect-files.js';

describe('collectFiles', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    tempDirs.length = 0;
  });

  async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'okibasho-collect-'));
    tempDirs.push(dir);
    return dir;
  }

  it('ディレクトリ内のネストしたファイルを / 区切りの相対パスで収集する', async () => {
    const root = await createTempDir();
    await writeFile(join(root, 'index.html'), '<html></html>');
    await mkdir(join(root, 'assets'), { recursive: true });
    await writeFile(join(root, 'assets', 'app.css'), 'body {}');

    const result = await collectFiles(root);
    expect(result.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'index.html' }),
        expect.objectContaining({ path: 'assets/app.css' }),
      ]),
    );
    expect(result.files).toHaveLength(2);
    expect(result.skippedInvalidPath).toBe(0);
    expect(result.skippedSymlinks).toBe(0);
  });

  it('dotfile をスキップする', async () => {
    const root = await createTempDir();
    await writeFile(join(root, 'index.html'), '<html></html>');
    await writeFile(join(root, '.hidden'), 'secret');

    const result = await collectFiles(root);
    expect(result.files.map((f) => f.path)).toEqual(['index.html']);
    expect(result.skippedInvalidPath).toBe(1);
  });

  it('シンボリックリンクを無視する', async () => {
    const root = await createTempDir();
    await writeFile(join(root, 'index.html'), '<html></html>');
    const outsideTarget = join(tmpdir(), `outside-${Date.now()}.html`);
    await writeFile(outsideTarget, '<html></html>');
    await symlink(outsideTarget, join(root, 'link.html'));

    const result = await collectFiles(root);
    expect(result.files.map((f) => f.path)).toEqual(['index.html']);
    expect(result.skippedSymlinks).toBe(1);
  });

  it('単一 .html ファイルを index.html として収集する', async () => {
    const root = await createTempDir();
    const filePath = join(root, 'report.html');
    await writeFile(filePath, '<html></html>');

    const result = await collectFiles(filePath);
    expect(result.files).toEqual([
      expect.objectContaining({ path: 'index.html', absolutePath: filePath }),
    ]);
  });

  it('単一 .htm ファイルを index.html として収集する', async () => {
    const root = await createTempDir();
    const filePath = join(root, 'report.htm');
    await writeFile(filePath, '<html></html>');

    const result = await collectFiles(filePath);
    expect(result.files[0]?.path).toBe('index.html');
  });

  it('単一の非HTMLファイルはエラーになる', async () => {
    const root = await createTempDir();
    const filePath = join(root, 'data.txt');
    await writeFile(filePath, 'text');

    await expect(collectFiles(filePath)).rejects.toBeInstanceOf(SingleFileNotHtmlError);
    await expect(collectFiles(filePath)).rejects.toThrow('index.html が必要');
  });

  it('存在しないパスはエラーになる', async () => {
    await expect(collectFiles('/no/such/path')).rejects.toBeInstanceOf(CollectFilesError);
  });
});
