/**
 * CLIの127.0.0.1コールバックで使うポート。
 * packages/infra/lib/constructs/auth.ts の CLI_CALLBACK_PORTS と一致させること。
 */
export const CLI_CALLBACK_PORTS = [8976, 8977, 8978] as const;

export const CALLBACK_PATH = '/callback';
