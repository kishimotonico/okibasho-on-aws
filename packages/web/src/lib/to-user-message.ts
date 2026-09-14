import { messages } from '~/lib/messages';

const NETWORK_MESSAGE = 'つながりません。接続を確かめて、もう一度どうぞ。';

/**
 * S3 呼び出しの失敗を画面に出す日本語にする。
 * fetch のネットワークエラーは操作によらず同じ案内、それ以外は操作ごとの fallback。
 * 生のエラーメッセージ（AccessDenied など）は画面に出さない。
 */
export function toUserMessage(error: unknown, fallback: string = messages.uploadFailed): string {
  return isNetworkFailure(rawErrorText(error)) ? NETWORK_MESSAGE : fallback;
}

function rawErrorText(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error) {
    return error;
  }

  return '不明なエラー';
}

function isNetworkFailure(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    message === 'Failed to fetch' ||
    message === 'Load failed' ||
    message === 'NetworkError when attempting to fetch resource.' ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('failed to fetch')
  );
}
