const DRIVE_LETTER_PATTERN = /^[a-zA-Z]:/;
const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/;

export type UploadPathValidationResult = { ok: true; path: string } | { ok: false };

/**
 * ページ内相対パスを検証し、区切りを `/` に統一した形で返す。
 * `.` で始まるセグメントは拒否する。
 */
export function validateUploadPath(raw: string): UploadPathValidationResult {
  if (raw === '') {
    return { ok: false };
  }
  if (raw.startsWith('/')) {
    return { ok: false };
  }
  if (raw.endsWith('/')) {
    return { ok: false };
  }
  if (raw.includes('\\')) {
    return { ok: false };
  }
  if (DRIVE_LETTER_PATTERN.test(raw)) {
    return { ok: false };
  }
  if (CONTROL_CHAR_PATTERN.test(raw)) {
    return { ok: false };
  }

  const segments = raw.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '..' || segment.startsWith('.')) {
      return { ok: false };
    }
  }

  return { ok: true, path: segments.join('/') };
}
