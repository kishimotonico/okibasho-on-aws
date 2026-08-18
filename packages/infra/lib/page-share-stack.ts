import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

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

    // TODO: 要件確定後に実装する
  }
}
