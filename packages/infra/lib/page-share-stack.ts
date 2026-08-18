import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { PagesDelivery } from './constructs/pages-delivery.js';
import { PagesStorage } from './constructs/pages-storage.js';

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

    new CfnOutput(this, 'PagesViewUrl', {
      value: `https://${pagesDelivery.distribution.distributionDomainName}/p/`,
      description: 'pages閲覧URLのベース',
    });

    new CfnOutput(this, 'PagesBucketName', {
      value: pagesStorage.bucket.bucketName,
      description: 'pages bucket名（手動テスト用）',
    });

    // TODO: Cognito, API Gateway, Lambda, Route 53 / ACM
  }
}
