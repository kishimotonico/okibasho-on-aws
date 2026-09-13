import { formatBytes } from './format-bytes';

/** ドロップ領域に出す、いま選んでいるファイルの説明 */
export function describeUploadSelection(
  files: readonly { path: string; file: { size: number } }[],
): string {
  if (files.length === 1) {
    return `${files[0]!.path} を選択しました`;
  }

  const total = files.reduce((sum, entry) => sum + entry.file.size, 0);
  return `${files.length} 件のファイルを選択しました（合計 ${formatBytes(total)}）`;
}
