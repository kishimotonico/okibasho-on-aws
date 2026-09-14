import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { isValidSlug } from '@okibasho/core';
import { runList } from './commands/list.js';
import { runLogin } from './commands/login.js';
import { runLogout } from './commands/logout.js';
import { runRm } from './commands/rm.js';
import { runUpload } from './commands/upload.js';
import { ConfigError } from './config.js';
import { PortsInUseError } from './port.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const HELP_TEXT = `okiba — ちょっとしたHTML・アーティファクトを共有するためのCLI

使い方:
  okiba login              ブラウザでログイン (OAuth PKCE)
  okiba logout             保存したトークンを削除
  okiba list               アップロード済みページ一覧
  okiba rm <slug>          ページを削除
  okiba <path>             HTMLをアップロード
  okiba --help, -h         このヘルプを表示
  okiba --version          バージョンを表示

アップロード:
  okiba <path> [--name <slug>] [--permanent] [--dry-run]
    <path>        単一ファイル (.html/.htm) またはディレクトリ
    --name        ページ slug (省略時はディレクトリ/ファイル名から生成)
    --permanent   無期限保存 (省略時は 30 日)
    --dry-run     ネットワークにアクセスせず送信内容だけ表示

接続先の設定 (環境変数は設定ファイルより優先):
  OKIBA_ISSUER             OIDC issuer URL (CfnOutput: OidcIssuerUrl)
  OKIBA_CLIENT_ID          CLI用 App Client ID (CfnOutput: CliAppClientId)
  OKIBA_IDENTITY_POOL_ID   Identity Pool ID (CfnOutput: IdentityPoolId)
  OKIBA_USER_POOL_ID       User Pool ID (CfnOutput: UserPoolId)
  OKIBA_REGION             AWS リージョン (CfnOutput: Region)
  OKIBA_BUCKET             pages バケット名 (CfnOutput: PagesBucketName)
  OKIBA_PAGES_BASE_URL     公開 URL のベース (CfnOutput: PagesBaseUrl)

設定ファイル: ~/.config/okibasho/config.json
  (XDG_CONFIG_HOME が設定されていれば $XDG_CONFIG_HOME/okibasho/config.json)
`;

export interface CliResult {
  exitCode: number;
}

function printHelp(): void {
  console.log(HELP_TEXT.trimEnd());
}

function printVersion(): void {
  console.log(version);
}

function formatCliError(err: unknown): string {
  if (err instanceof ConfigError || err instanceof PortsInUseError) {
    return err.message;
  }
  if (err instanceof Error) {
    if (err.message.startsWith('Unknown option')) {
      return `${err.message}\nokiba --help で使い方を確認できます。`;
    }
    return err.message;
  }
  return '予期しないエラーが発生しました。';
}

/**
 * 引数を解釈してサブコマンドを実行する。テストから argv を渡せるようにする。
 */
export async function runCli(argv: string[]): Promise<CliResult> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean' },
        name: { type: 'string' },
        permanent: { type: 'boolean' },
        'dry-run': { type: 'boolean' },
      },
      allowPositionals: true,
      strict: true,
    });
  } catch (err) {
    console.error(formatCliError(err));
    return { exitCode: 1 };
  }

  const { values, positionals } = parsed;

  if (values.help) {
    printHelp();
    return { exitCode: 0 };
  }

  if (values.version) {
    printVersion();
    return { exitCode: 0 };
  }

  if (positionals.length === 0) {
    console.error('サブコマンドまたはアップロードするパスを指定してください。');
    console.error('okiba --help で使い方を確認できます。');
    return { exitCode: 1 };
  }

  const [command, ...rest] = positionals;

  if (command === 'login') {
    if (rest.length > 0) {
      console.error('login サブコマンドに余分な引数は指定できません。');
      return { exitCode: 1 };
    }
    await runLogin();
    const code = process.exitCode;
    return { exitCode: typeof code === 'number' ? code : 0 };
  }

  if (command === 'logout') {
    if (rest.length > 0) {
      console.error('logout サブコマンドに余分な引数は指定できません。');
      return { exitCode: 1 };
    }
    try {
      await runLogout();
      return { exitCode: 0 };
    } catch (err) {
      console.error(formatCliError(err));
      return { exitCode: 1 };
    }
  }

  if (command === 'list') {
    if (rest.length > 0) {
      console.error('list サブコマンドに余分な引数は指定できません。');
      return { exitCode: 1 };
    }
    return runList();
  }

  if (command === 'rm') {
    const slug = rest[0];
    if (!slug || rest.length > 1) {
      console.error('okiba rm <slug>');
      return { exitCode: 1 };
    }
    if (!isValidSlug(slug)) {
      console.error(`無効な slug です: ${slug}`);
      return { exitCode: 1 };
    }
    return runRm(slug);
  }

  // それ以外の先頭引数はアップロード対象のパスとみなす
  if (rest.length > 0) {
    console.error('不明なサブコマンドです。okiba --help で使い方を確認できます。');
    return { exitCode: 1 };
  }

  if (!command) {
    console.error('サブコマンドまたはアップロードするパスを指定してください。');
    return { exitCode: 1 };
  }

  const name = typeof values.name === 'string' ? values.name : undefined;
  const permanent = values.permanent === true;
  const dryRun = values['dry-run'] === true;

  return runUpload(command, {
    name,
    permanent,
    dryRun,
  });
}
