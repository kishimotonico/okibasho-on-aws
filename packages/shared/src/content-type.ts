import mime from 'mime';

/**
 * 拡張子から Content-Type を決める。クライアント申告値は信用しない。
 * 未知の拡張子は octet-stream に倒し、表示よりダウンロード扱いに留める。
 */
export function contentTypeFromPath(path: string): string {
  return mime.getType(path) ?? 'application/octet-stream';
}
