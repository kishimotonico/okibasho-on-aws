export type FormattedUploadError = {
  message: string;
  detail: string | null;
};

const NETWORK_MESSAGE = 'つながりません。接続を確かめて、もう一度どうぞ。';

/**
 * アップロード失敗を画面用の日本語にする。
 * fetch のネットワークエラーは定型文、それ以外は概要 + 元のメッセージ。
 */
export function formatUploadError(error: unknown): FormattedUploadError {
  const detail = rawErrorText(error);

  if (isNetworkFailure(detail)) {
    return {
      message: NETWORK_MESSAGE,
      detail: detail === 'Failed to fetch' ? null : detail,
    };
  }

  return {
    message: '送れませんでした。もう一度どうぞ。',
    detail,
  };
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
