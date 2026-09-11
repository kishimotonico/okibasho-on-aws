import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { AppDelivery } from './constructs/app-delivery.js';
import { Auth } from './constructs/auth.js';
import { PagesDelivery } from './constructs/pages-delivery.js';
import { PagesStorage } from './constructs/pages-storage.js';
import type { DomainsConfig } from './config.js';

export interface OkibashoStackProps extends StackProps {
  /** メールドメイン。CloudFront Function が URL の user を S3 キーへ展開するときに補う */
  readonly emailDomain: string;
  /** 独自ドメイン設定。未設定ならデフォルトドメインで構築する */
  readonly domains?: DomainsConfig;
}

/**
 * 構築するリソース:
 *   - S3 (private, Public Access Block)
 *   - CloudFront x2 (app / pages) + OAC
 *   - Cognito User Pool + Identity Pool (Web/CLI の 2 App Client)
 *   - Route 53 / ACM（domains 設定時のみ）
 *
 * リソースが増えたら lib/ 配下を用途ごとに分割する。
 */
export class OkibashoStack extends Stack {
  constructor(scope: Construct, id: string, props: OkibashoStackProps) {
    super(scope, id, props);

    const pagesStorage = new PagesStorage(this, 'PagesStorage');
    const pagesDelivery = new PagesDelivery(this, 'PagesDelivery', {
      bucket: pagesStorage.bucket,
      emailDomain: props.emailDomain,
    });
    const appDelivery = new AppDelivery(this, 'AppDelivery');

    const auth = new Auth(this, 'Auth', {
      appDomain: props.domains?.app,
      appDistributionDomain: appDelivery.distribution.distributionDomainName,
      pagesBucket: pagesStorage.bucket,
    });

    new CfnOutput(this, 'PagesBaseUrl', {
      value: `https://${pagesDelivery.distribution.distributionDomainName}`,
      description: 'pages 閲覧URLのベース（CLI / Web 設定用）',
    });

    new CfnOutput(this, 'PagesBucketName', {
      value: pagesStorage.bucket.bucketName,
      description: 'pages bucket名（手動テスト用）',
    });

    new CfnOutput(this, 'UserPoolId', {
      value: auth.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new CfnOutput(this, 'WebAppClientId', {
      value: auth.webClient.userPoolClientId,
      description: 'Web用 App Client ID',
    });

    new CfnOutput(this, 'CliAppClientId', {
      value: auth.cliClient.userPoolClientId,
      description: 'CLI用 App Client ID',
    });

    new CfnOutput(this, 'HostedUiBaseUrl', {
      value: auth.hostedUiDomain.baseUrl(),
      description: 'Cognito Hosted UIのベースURL',
    });

    new CfnOutput(this, 'OidcIssuerUrl', {
      value: auth.userPool.userPoolProviderUrl,
      description: 'OIDC issuer URL',
    });

    new CfnOutput(this, 'IdentityPoolId', {
      value: auth.identityPool.identityPoolId,
      description: 'Cognito Identity Pool ID',
    });

    new CfnOutput(this, 'IdentityPoolProviderName', {
      value: auth.identityProviderName,
      description: 'Identity Pool の User Pool プロバイダ名（Logins キー用）',
    });

    new CfnOutput(this, 'Region', {
      value: Stack.of(this).region,
      description: 'デプロイ先 AWS リージョン',
    });

    // ブラウザから Identity Pool クレデンシャルで S3 を直接操作するため CORS を許可する。
    // localhost:3000 は開発サーバー用
    pagesStorage.allowUploadsFrom([
      `https://${appDelivery.distribution.distributionDomainName}`,
      'http://localhost:3000',
    ]);

    new CfnOutput(this, 'AppUrl', {
      value: `https://${appDelivery.distribution.distributionDomainName}/`,
      description: '管理アプリURL',
    });

    new CfnOutput(this, 'AppBucketName', {
      value: appDelivery.bucket.bucketName,
      description: 'UI用bucket名（ビルド成果物のアップロード先）',
    });
  }
}
