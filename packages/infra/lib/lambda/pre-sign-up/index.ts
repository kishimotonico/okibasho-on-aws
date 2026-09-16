import { createHandler } from './handler.js';

const EMAIL_DOMAIN = process.env['EMAIL_DOMAIN'];
if (!EMAIL_DOMAIN) {
  throw new Error('環境変数 EMAIL_DOMAIN が未設定です');
}

export const handler = createHandler(EMAIL_DOMAIN);
