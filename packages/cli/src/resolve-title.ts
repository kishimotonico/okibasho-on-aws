import { readFile, stat } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import type { CollectedFile } from './collect-files.js';

const TITLE_PATTERN = /<title[^>]*>([^<]*)<\/title>/i;

/**
 * ページ表示名を決める。明示指定 → index.html の <title> → パス名の順。
 */
export async function resolveTitle(
  inputPath: string,
  collectedFiles: CollectedFile[],
  readFileFn: typeof readFile = readFile,
): Promise<string> {
  const indexFile = collectedFiles.find((file) => file.path === 'index.html');
  if (indexFile) {
    const html = await readFileFn(indexFile.absolutePath, 'utf8');
    const match = html.match(TITLE_PATTERN);
    const fromHtml = match?.[1]?.trim();
    if (fromHtml) {
      return fromHtml;
    }
  }

  const absolutePath = resolve(inputPath);
  const entryStat = await stat(absolutePath);
  if (entryStat.isDirectory()) {
    return basename(absolutePath);
  }

  return basename(absolutePath, extname(absolutePath));
}
