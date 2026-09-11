/**
 * デプロイ設定。環境ごとに変わる値はリポジトリに持たず、環境変数から読む。
 * `packages/infra/.env`（git 管理外）に書くか、シェルの環境変数で渡す。項目は `.env.example` を参照。
 *
 * domains はオプショナル。未設定の間はCloudFrontのデフォルトドメインで構築し、
 * 証明書・Route 53・Signed Cookie閲覧認証は作らない。
 * ドメインを用意したら環境変数を埋めるだけで有効化される想定。
 * 分岐はドメイン関連リソースの有無の1箇所に閉じ込め、他の構成には波及させないこと。
 */
export interface Config {
  /** メールドメイン。S3 キーと CloudFront Function のドメイン補完に使う */
  emailDomain: string;
  /** 独自ドメイン設定。未設定ならデフォルトドメインで構築する */
  domains?: DomainsConfig;
}

export interface DomainsConfig {
  /** Route 53 hosted zoneのドメイン (例: example.com)。Signed Cookieの発行スコープにもなる */
  root: string;
  /** 管理アプリ (例: app.example.com) */
  app: string;
  /** 社内限定閲覧 (例: pages.example.com) */
  pages: string;
}

export function loadConfig(): Config {
  const {
    EMAIL_DOMAIN: emailDomain,
    ROOT_DOMAIN: root,
    APP_DOMAIN: app,
    PAGES_DOMAIN: pages,
  } = process.env;

  if (!emailDomain) {
    throw new Error(
      'EMAIL_DOMAIN が未設定です。packages/infra/.env.example を .env にコピーして埋めてください',
    );
  }

  return {
    emailDomain,
    domains: root && app && pages ? { root, app, pages } : undefined,
  };
}
