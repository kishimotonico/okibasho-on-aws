import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { Auth } from './constructs/auth.js';
import { PagesApi } from './constructs/pages-api.js';
import { PagesDelivery } from './constructs/pages-delivery.js';
import { PagesStorage } from './constructs/pages-storage.js';
import { config } from './config.js';

/**
 * 構築するリソース:
 *   - S3 (private, Public Access Block)
 *   - CloudFront x2 (app / pages) + OAC
 *   - Cognito User Pool (Google federation, Web/CLI の 2 App Client)
 *   - API Gateway HTTP API + JWT Authorizer
 *   - Lambda (NodejsFunction で packages/api をバンドル)
 *   - Route 53 / ACM
 *
 * リソースが増えたら lib/ 配下を用途ごとに分割する。
 */
export class PageShareStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const pagesStorage = new PagesStorage(this, 'PagesStorage');
    const pagesDelivery = new PagesDelivery(this, 'PagesDelivery', {
      bucket: pagesStorage.bucket,
    });

    const auth = new Auth(this, 'Auth', {
      appDomain: config.domains?.app,
    });

    new CfnOutput(this, 'PagesViewUrl', {
      value: `https://${pagesDelivery.distribution.distributionDomainName}/p/`,
      description: 'pages閲覧URLのベース',
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
      description: 'OIDC issuer URL (JWT Authorizer用)',
    });

    const pagesApi = new PagesApi(this, 'PagesApi', {
      bucket: pagesStorage.bucket,
      pagesBaseUrl: `https://${pagesDelivery.distribution.distributionDomainName}`,
      userPool: auth.userPool,
      webClient: auth.webClient,
      cliClient: auth.cliClient,
    });

    new CfnOutput(this, 'ApiEndpointUrl', {
      value: pagesApi.httpApi.apiEndpoint,
      description: 'API Gateway HTTP APIのエンドポイントURL（CLI設定用）',
    });

    // TODO: Route 53 / ACM, app Distribution
  }
}
