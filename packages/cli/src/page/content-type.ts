import mime from 'mime';

export function contentTypeFromPath(path: string): string {
  return mime.getType(path) ?? 'application/octet-stream';
}
