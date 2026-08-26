/**
 * デプロイ設定。環境ごとに変わる値はここに集約する。
 *
 * 未設定の項目があってもsynthは通る形を保つこと。
 *
 * domains はオプショナル。未設定の間はCloudFrontのデフォルトドメインで構築し、
 * 証明書・Route 53・Signed Cookie閲覧認証は作らない。
 * ドメインを用意したらここを埋めるだけで有効化される想定。
 * 分岐はドメイン関連リソースの有無の1箇所に閉じ込め、他の構成には波及させないこと。
 */
export interface Config {
  /** デプロイ先。未設定なら CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION にフォールバック */
  env?: {
    account: string;
    region: string;
  };
  /** メールドメイン。S3 キーと CloudFront Function のドメイン補完に使う */
  emailDomain: string;
  /** 独自ドメイン設定。未設定ならデフォルトドメインで構築する */
  domains?: {
    /** Route 53 hosted zoneのドメイン (例: example.com)。Signed Cookieの発行スコープにもなる */
    root: string;
    /** 管理アプリ (例: app.example.com) */
    app: string;
    /** 社内限定閲覧 (例: pages.example.com) */
    pages: string;
  };
}

export const config: Config = {
  emailDomain: 'example.jp',
  // env: { account: '123456789012', region: 'ap-northeast-1' },
  // domains: {
  //   root: 'example.com',
  //   app: 'app.example.com',
  //   pages: 'pages.example.com',
  // },
};
