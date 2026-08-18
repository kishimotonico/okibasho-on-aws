import { validateUploadPath } from '@page-share/shared';

export interface UploadFileEntry {
  path: string;
  file: File;
}

export interface CollectUploadFilesResult {
  files: UploadFileEntry[];
  /** validateUploadPath で弾かれた件数 */
  skippedInvalidPath: number;
  /** 単一ファイル選択で HTML 以外が指定された */
  singleFileNotHtml?: boolean;
}

export function isHtmlFileName(fileName: string): boolean {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) {
    return false;
  }
  const ext = fileName.slice(dot).toLowerCase();
  return ext === '.html' || ext === '.htm';
}

/** webkitdirectory の webkitRelativePath 先頭ディレクトリを1階層落とす */
export function stripTopDirectoryFromRelativePath(relativePath: string): string {
  const slashIndex = relativePath.indexOf('/');
  if (slashIndex === -1) {
    return relativePath;
  }
  return relativePath.slice(slashIndex + 1);
}

function detectFileListMode(files: readonly File[]): 'single' | 'directory' | 'flat' {
  if (files.length === 1) {
    const relativePath = files[0]?.webkitRelativePath ?? '';
    if (!relativePath.includes('/')) {
      return 'single';
    }
  }

  const hasNestedRelativePath = files.some((file) => file.webkitRelativePath.includes('/'));
  return hasNestedRelativePath ? 'directory' : 'flat';
}

function pagePathFromFile(file: File, mode: 'directory' | 'flat'): string {
  if (mode === 'directory') {
    const relativePath = file.webkitRelativePath || file.name;
    return stripTopDirectoryFromRelativePath(relativePath);
  }
  return file.name;
}

function collectValidatedEntries(entries: readonly UploadFileEntry[]): CollectUploadFilesResult {
  const files: UploadFileEntry[] = [];
  let skippedInvalidPath = 0;

  for (const entry of entries) {
    const pathResult = validateUploadPath(entry.path);
    if (!pathResult.ok) {
      skippedInvalidPath++;
      continue;
    }

    files.push({
      path: pathResult.path,
      file: entry.file,
    });
  }

  return { files, skippedInvalidPath };
}

/**
 * `<input type="file">` / `webkitdirectory` から得た File 一覧をページ内パス付きに変換する。
 * CLI の collect-files.ts と同じ判断（単一 HTML → index.html、ディレクトリは先頭階層を除去）。
 */
export function collectUploadFilesFromFileList(files: readonly File[]): CollectUploadFilesResult {
  if (files.length === 0) {
    return { files: [], skippedInvalidPath: 0 };
  }

  const mode = detectFileListMode(files);

  if (mode === 'single') {
    const file = files[0]!;
    if (!isHtmlFileName(file.name)) {
      return { files: [], skippedInvalidPath: 0, singleFileNotHtml: true };
    }
    return collectValidatedEntries([{ path: 'index.html', file }]);
  }

  const entries = files.map((file) => ({
    path: pagePathFromFile(file, mode),
    file,
  }));

  return collectValidatedEntries(entries);
}

/** drag & drop 走査など、パスが既に決まっているエントリを検証してまとめる */
export function collectUploadFilesFromPathEntries(
  entries: readonly UploadFileEntry[],
): CollectUploadFilesResult {
  if (entries.length === 1 && !entries[0]!.path.includes('/')) {
    const entry = entries[0]!;
    if (isHtmlFileName(entry.file.name)) {
      return collectValidatedEntries([{ path: 'index.html', file: entry.file }]);
    }
    return { files: [], skippedInvalidPath: 0, singleFileNotHtml: true };
  }

  return collectValidatedEntries(entries);
}
