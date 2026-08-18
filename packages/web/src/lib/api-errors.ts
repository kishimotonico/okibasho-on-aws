import type { ApiErrorBody, ApiErrorResponse } from '@page-share/shared';

/** API エラーレスポンスの message を details 含め全件返す */
export function extractApiErrorMessages(body: ApiErrorResponse): string[] {
  const messages: string[] = [];

  function walk(error: ApiErrorBody): void {
    messages.push(error.message);
    if (error.details) {
      for (const detail of error.details) {
        walk(detail);
      }
    }
  }

  walk(body.error);
  return messages;
}
