import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  AccessLevel,
  CachePolicy,
  Distribution,
  Function,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  PriceClass,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * trusted 管理UIを CloudFront + OAC 経由で配信する Distribution。
 * untrusted な pages とは origin を分け、ここにはビルド成果物の静的ファイルだけを載せる。
 */
export class AppDelivery extends Construct {
  readonly bucket: Bucket;
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.bucket = new Bucket(this, 'Bucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // pages bucket はユーザー成果物のため RETAIN だが、ここはビルドし直せば復元できる管理UIの静的ファイルだけ
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const origin = S3BucketOrigin.withOriginAccessControl(this.bucket, {
      // 存在しないアセットに403ではなく404を返させる。取り違えたファイル名が
      // 「権限がない」に見えると原因を追いにくい
      originAccessLevels: [AccessLevel.READ, AccessLevel.LIST],
    });

    const routerFunction = new Function(this, 'RouterFunction', {
      code: FunctionCode.fromFile({
        filePath: join(dirname(fileURLToPath(import.meta.url)), '../functions/app-router.js'),
      }),
      runtime: FunctionRuntime.JS_2_0,
      comment: 'SPAのディープリンクを _shell.html へ寄せる',
    });

    const responseHeaders = new ResponseHeadersPolicy(this, 'ResponseHeaders', {
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        contentSecurityPolicy: {
          contentSecurityPolicy: "frame-ancestors 'none'",
          override: true,
        },
      },
    });

    this.distribution = new Distribution(this, 'Distribution', {
      comment: 'trusted 管理UI配信',
      defaultRootObject: '_shell.html',
      priceClass: PriceClass.PRICE_CLASS_200,
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: responseHeaders,
        // CustomErrorResponseはDistribution全体に効いてしまい、404まで
        // SPAシェル(200)に化ける。behaviorごとに掛けられる関数側で寄せる
        functionAssociations: [
          { function: routerFunction, eventType: FunctionEventType.VIEWER_REQUEST },
        ],
      },
    });
  }
}
