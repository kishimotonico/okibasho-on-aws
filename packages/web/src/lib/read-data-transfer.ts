import type { UploadFileEntry } from './collect-upload-files.js';

function readFileEntry(fileEntry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    fileEntry.file(resolve, reject);
  });
}

function readDirectoryEntries(
  directoryEntry: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    directoryEntry.readEntries(resolve, reject);
  });
}

async function readAllDirectoryEntries(
  directoryEntry: FileSystemDirectoryEntry,
): Promise<FileSystemEntry[]> {
  const reader = directoryEntry.createReader();
  const entries: FileSystemEntry[] = [];

  while (true) {
    const batch = await readDirectoryEntries(reader);
    if (batch.length === 0) {
      break;
    }
    entries.push(...batch);
  }

  return entries;
}

async function readEntryRecursively(
  entry: FileSystemEntry,
  pathPrefix: string,
): Promise<UploadFileEntry[]> {
  if (entry.isFile) {
    const file = await readFileEntry(entry as FileSystemFileEntry);
    const path = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
    return [{ path, file }];
  }

  if (!entry.isDirectory) {
    return [];
  }

  const children = await readAllDirectoryEntries(entry as FileSystemDirectoryEntry);
  const nextPrefix = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
  const nested: UploadFileEntry[] = [];

  for (const child of children) {
    nested.push(...(await readEntryRecursively(child, nextPrefix)));
  }

  return nested;
}

/** drop されたディレクトリは先頭階層をページルートとみなし、中身だけを相対パスにする */
async function readDroppedEntry(entry: FileSystemEntry): Promise<UploadFileEntry[]> {
  if (entry.isFile) {
    const file = await readFileEntry(entry as FileSystemFileEntry);
    return [{ path: entry.name, file }];
  }

  if (!entry.isDirectory) {
    return [];
  }

  const children = await readAllDirectoryEntries(entry as FileSystemDirectoryEntry);
  const nested: UploadFileEntry[] = [];

  for (const child of children) {
    nested.push(...(await readEntryRecursively(child, '')));
  }

  return nested;
}

/** DataTransfer から File 一覧とページ内パスを再帰的に収集する */
export async function collectFilesFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<UploadFileEntry[]> {
  const items = dataTransfer.items;
  if (!items) {
    return Array.from(dataTransfer.files).map((file) => ({ path: file.name, file }));
  }

  const entries: UploadFileEntry[] = [];

  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (!entry) {
      const file = item.getAsFile();
      if (file) {
        entries.push({ path: file.name, file });
      }
      continue;
    }

    entries.push(...(await readDroppedEntry(entry)));
  }

  return entries;
}
