import { TITLE_MAX_LENGTH } from './metadata.js';

const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/;

/**
 * title は表示用の名前だけ。長さと制御文字だけを見る。
 * 空文字は許可する（クライアントが <title> を拾えなかったとき）。
 */
export function validateTitle(title: string): { code: 'invalid_title'; message: string } | null {
  if (CONTROL_CHAR_PATTERN.test(title)) {
    return {
      code: 'invalid_title',
      message: 'title に制御文字は使えません',
    };
  }
  if (title.length > TITLE_MAX_LENGTH) {
    return {
      code: 'invalid_title',
      message: `title は ${TITLE_MAX_LENGTH} 文字以内で指定してください`,
    };
  }
  return null;
}
