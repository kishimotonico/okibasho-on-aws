/**
 * CLIのlocalhostコールバックで使うポート。
 * packages/infra/lib/constructs/auth.ts の CLI_CALLBACK_PORTS と一致させること。
 */
export const CLI_CALLBACK_PORTS = [8976] as const;

export const CALLBACK_PATH = '/callback';
