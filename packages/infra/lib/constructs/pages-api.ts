import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Duration } from 'aws-cdk-lib';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import type { IUserPoolClient, UserPool } from 'aws-cdk-lib/aws-cognito';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface PagesApiProps {
  readonly bucket: IBucket;
  /** Internal Pages Distribution のベース URL */
  readonly pagesBaseUrl: string;
  /** Shared Pages Distribution のベース URL */
  readonly shareBaseUrl: string;
  readonly keyValueStoreArn: string;
  readonly userPool: UserPool;
  readonly webClient: IUserPoolClient;
  readonly cliClient: IUserPoolClient;
}

/**
 * ページ管理API (HTTP API + JWT Authorizer + Lambda)。
 * ハンドラは packages/api を NodejsFunction でバンドルする。
 */
export class PagesApi extends Construct {
  readonly httpApi: HttpApi;

  constructor(scope: Construct, id: string, props: PagesApiProps) {
    super(scope, id);

    const handler = new NodejsFunction(this, 'PagesHandler', {
      entry: join(dirname(fileURLToPath(import.meta.url)), '../../../api/src/handlers/pages.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      // complete の HeadObject 並列用
      timeout: Duration.seconds(29),
      logGroup: new LogGroup(this, 'PagesHandlerLogGroup', {
        retention: RetentionDays.ONE_MONTH,
      }),
      environment: {
        PAGES_BUCKET: props.bucket.bucketName,
        PAGES_BASE_URL: props.pagesBaseUrl,
        SHARE_BASE_URL: props.shareBaseUrl,
        KVS_ARN: props.keyValueStoreArn,
      },
      bundling: {
        sourceMap: false,
        // @aws-sdk/s3-request-presigner は Lambda ランタイム同梱 SDK に含まれる保証がない。
        // ランタイム更新で欠けると本番だけ動かなくなるため、サイズより確実性を優先してバンドルする。
        externalModules: [],
      },
    });

    props.bucket.grantReadWrite(handler);

    handler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['cloudfront-keyvaluestore:DescribeKeyValueStore', 'cloudfront-keyvaluestore:UpdateKeys'],
        resources: [props.keyValueStoreArn],
      }),
    );

    // IDトークンを送る前提。アクセストークンには email クレームが無く、
    // Lambda が sub/email/email_verified を使う設計と噛み合わない。aud は App Client ID なので JWT Authorizer の audience と一致する。
    const authorizer = new HttpJwtAuthorizer('JwtAuthorizer', props.userPool.userPoolProviderUrl, {
      jwtAudience: [props.webClient.userPoolClientId, props.cliClient.userPoolClientId],
    });

    const integration = new HttpLambdaIntegration('PagesIntegration', handler);

    // Web UI は将来 app の CloudFront 経由で同一 origin の /api/* から叩くため CORS は不要
    this.httpApi = new HttpApi(this, 'HttpApi', {
      defaultAuthorizer: authorizer,
    });

    this.httpApi.addRoutes({
      path: '/api/pages',
      methods: [HttpMethod.POST, HttpMethod.GET],
      integration,
    });

    this.httpApi.addRoutes({
      path: '/api/pages/{slug}',
      methods: [HttpMethod.GET, HttpMethod.PATCH, HttpMethod.DELETE, HttpMethod.PUT],
      integration,
    });

    this.httpApi.addRoutes({
      path: '/api/pages/{slug}/complete',
      methods: [HttpMethod.POST],
      integration,
    });
  }
}
