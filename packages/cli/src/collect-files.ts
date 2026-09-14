import { readdir, stat } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { validateUploadPath } from '@okibasho/core';

export interface CollectedFile {
  /** ページ内の相対パス（常に `/` 区切り） */
  path: string;
  /** ローカルファイルの絶対パス */
  absolutePath: string;
  size: number;
}

export interface CollectFilesResult {
  files: CollectedFile[];
  /** dotfile など validateUploadPath で弾かれた件数 */
  skippedInvalidPath: number;
  /** ディレクトリ走査で無視したシンボリックリンクの件数 */
  skippedSymlinks: number;
}

export class SingleFileNotHtmlError extends Error {
  constructor(filePath: string) {
    super(
      `単一ファイルをアップロードする場合は .html / .htm を指定してください: ${filePath}\n` +
        'ページ直下に index.html が必要です。',
    );
    this.name = 'SingleFileNotHtmlError';
  }
}

export class CollectFilesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectFilesError';
  }
}

function isHtmlExtension(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return ext === '.html' || ext === '.htm';
}

function toPageRelativePath(rootDir: string, absolutePath: string): string {
  return relative(rootDir, absolutePath).split(sep).join('/');
}

async function collectFromDirectory(rootDir: string): Promise<CollectFilesResult> {
  const files: CollectedFile[] = [];
  let skippedInvalidPath = 0;
  let skippedSymlinks = 0;

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(currentDir, entry.name);

      if (entry.isSymbolicLink()) {
        skippedSymlinks++;
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const pagePath = toPageRelativePath(rootDir, fullPath);
      const pathResult = validateUploadPath(pagePath);
      if (!pathResult.ok) {
        skippedInvalidPath++;
        continue;
      }

      const fileStat = await stat(fullPath);
      files.push({
        path: pathResult.path,
        absolutePath: fullPath,
        size: fileStat.size,
      });
    }
  }

  await walk(rootDir);
  return { files, skippedInvalidPath, skippedSymlinks };
}

async function collectSingleFile(absolutePath: string): Promise<CollectFilesResult> {
  if (!isHtmlExtension(absolutePath)) {
    throw new SingleFileNotHtmlError(absolutePath);
  }

  const fileStat = await stat(absolutePath);
  return {
    files: [
      {
        path: 'index.html',
        absolutePath,
        size: fileStat.size,
      },
    ],
    skippedInvalidPath: 0,
    skippedSymlinks: 0,
  };
}

/**
 * 指定パスからアップロード対象ファイルを収集する。
 * ディレクトリは再帰走査し、単一ファイルは index.html として扱う。
 */
export async function collectFiles(inputPath: string): Promise<CollectFilesResult> {
  const absolutePath = resolve(inputPath);
  let entryStat;
  try {
    // 引数で明示的に指定されたパスは symlink でも辿る。
    // symlinkを無視するのはディレクトリ走査中に勝手に拾ったものが対象で、
    // ここで lstat を使うと ./dist が symlink のときに「単一ファイル」と誤判定される
    entryStat = await stat(absolutePath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new CollectFilesError(`パスが見つかりません: ${inputPath}`);
    }
    throw err;
  }

  if (entryStat.isDirectory()) {
    return collectFromDirectory(absolutePath);
  }

  if (entryStat.isFile()) {
    return collectSingleFile(absolutePath);
  }

  throw new CollectFilesError(`ファイルまたはディレクトリを指定してください: ${inputPath}`);
}
