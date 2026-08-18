/**
 * presigned PUT の署名対象には content-type / content-length が入っている。
 * しかし Content-Length はブラウザの禁止ヘッダのため fetch の headers に入れても無視される。
 * ブラウザが File/Blob のサイズから自動付与する値は署名と一致するので、
 * API が返した headers から content-length だけ除いて渡す。
 */
export function preparePresignedPutHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'content-length') {
      continue;
    }
    result[key] = value;
  }

  return result;
}
