import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { AppDelivery } from './constructs/app-delivery.js';
import { Auth } from './constructs/auth.js';
import { PagesDelivery } from './constructs/pages-delivery.js';
import { PageMaintenance } from './constructs/page-maintenance.js';
import { PagesStorage } from './constructs/pages-storage.js';
import { PagesViewerAuth } from './constructs/pages-viewer-auth.js';
import { ServiceDomain, type ServiceDomainProps } from './constructs/service-domain.js';

export interface OkibashoStackProps extends StackProps {
  /** メールドメイン。CloudFront Function が URL の user を S3 キーへ展開するときに補う */
  readonly emailDomain: string;
  /** 未設定なら CloudFront のデフォルトドメインで構築する */
  readonly serviceDomain?: ServiceDomainProps;
  /** 未設定なら Google IdP を作らず、ローカルユーザーだけでログインする */
  readonly googleClientId?: string;
}

/**
 * 構築するリソース:
 *   - S3 (private, Public Access Block)
 *   - CloudFront x2 (app / pages) + OAC
 *   - Cognito User Pool + Identity Pool (Web/CLI の 2 App Client) + PreSignUp Lambda
 *     + Google IdP（googleClientId 設定時のみ）
 *   - CloudFront KeyValueStore + PageMaintenance Lambda（外部共有(/s/*)のエッジ投影に加え、
 *     期限切れページの削除も担う。別のcleanup Lambdaは作らない）
 *   - EventBridge Rule（毎時のcleanup + 日次のreconcile）+ S3通知（metadataの作成・削除で即時起動）
 *   - Route 53 の Alias レコード（serviceDomain 設定時のみ。証明書は CertificateStack）
 *   - /p/* の Signed Cookie 閲覧認証（Key Group + 発行 Lambda。serviceDomain 設定時のみ）
 */
export class OkibashoStack extends Stack {
  constructor(scope: Construct, id: string, props: OkibashoStackProps) {
    super(scope, id, props);

    const pagesStorage = new PagesStorage(this, 'PagesStorage');
    const pageMaintenance = new PageMaintenance(this, 'PageMaintenance', {
      pagesBucket: pagesStorage.bucket,
    });
    const serviceDomain =
      props.serviceDomain && new ServiceDomain(this, 'ServiceDomain', props.serviceDomain);
    const appDelivery = new AppDelivery(this, 'AppDelivery', {
      customDomain: serviceDomain?.app,
    });

    const auth = new Auth(this, 'Auth', {
      appDomainName: appDelivery.domainName,
      pagesBucket: pagesStorage.bucket,
      emailDomain: props.emailDomain,
      googleClientId: props.googleClientId,
    });

    // cloudfront.net には親ドメイン Cookie を置けないので、閲覧認証は独自ドメインがあるときだけ
    const pagesViewerAuth =
      serviceDomain &&
      new PagesViewerAuth(this, 'PagesViewerAuth', {
        userPool: auth.userPool,
        webClient: auth.webClient,
        pagesDomainName: serviceDomain.pages.domainName,
        appDelivery,
        pagesStorage,
      });

    const pagesDelivery = new PagesDelivery(this, 'PagesDelivery', {
      bucket: pagesStorage.bucket,
      emailDomain: props.emailDomain,
      shareKeyValueStore: pageMaintenance.keyValueStore,
      appOrigin: `https://${appDelivery.domainName}`,
      customDomain: serviceDomain?.pages,
      viewerAuth: pagesViewerAuth,
    });

    serviceDomain?.addAliasRecords({
      pages: pagesDelivery.distribution,
      app: appDelivery.distribution,
    });

    new CfnOutput(this, 'PagesBaseUrl', {
      value: `https://${pagesDelivery.domainName}`,
      description: 'pages 閲覧URLのベース（CLI / Web 設定用）',
    });

    new CfnOutput(this, 'PagesBucketName', {
      value: pagesStorage.bucket.bucketName,
      description: 'pages bucket名（手動テスト用）',
    });

    new CfnOutput(this, 'PagesAccessLogBucketName', {
      value: pagesDelivery.accessLogBucket.bucketName,
      description: 'pages のアクセスログ bucket名',
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
    pagesStorage.allowUploadsFrom([`https://${appDelivery.domainName}`, 'http://localhost:3000']);

    new CfnOutput(this, 'AppUrl', {
      value: `https://${appDelivery.domainName}/`,
      description: '管理アプリURL',
    });

    new CfnOutput(this, 'AppBucketName', {
      value: appDelivery.bucket.bucketName,
      description: 'UI用bucket名（ビルド成果物のアップロード先）',
    });

    new CfnOutput(this, 'AppDistributionId', {
      value: appDelivery.distribution.distributionId,
      description: 'UI配信CloudFrontのDistribution ID（invalidation用）',
    });
  }
}
