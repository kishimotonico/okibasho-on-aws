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
  /** 独自ドメイン設定。未設定ならデフォルトドメインで構築する */
  domains?: {
    /** Route 53 hosted zoneのドメイン (例: share.example.jp)。Signed Cookieの発行スコープにもなる */
    root: string;
    /** 管理アプリ (例: app.share.example.jp) */
    app: string;
    /** 閲覧ページ (例: pages.share.example.jp) */
    pages: string;
  };
}

export const config: Config = {
  // env: { account: '123456789012', region: 'ap-northeast-1' },
  // domains: {
  //   root: 'share.example.jp',
  //   app: 'app.share.example.jp',
  //   pages: 'pages.share.example.jp',
  // },
};
