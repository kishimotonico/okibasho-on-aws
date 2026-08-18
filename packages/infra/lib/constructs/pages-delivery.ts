import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AccessLevel,
  CachePolicy,
  Distribution,
  Function,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  PriceClass,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface PagesDeliveryProps {
  readonly bucket: IBucket;
}

/**
 * untrusted pages を CloudFront + OAC 経由で配信する Distribution。
 * 管理アプリとは origin を分け、ここには閲覧用の静的コンテンツだけを載せる。
 */
export class PagesDelivery extends Construct {
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: PagesDeliveryProps) {
    super(scope, id);

    const routerFunction = new Function(this, 'RouterFunction', {
      code: FunctionCode.fromFile({
        filePath: join(dirname(fileURLToPath(import.meta.url)), '../functions/pages-router.js'),
      }),
      runtime: FunctionRuntime.JS_2_0,
      comment: '/p/ URL空間のrewriteとindex.html補完',
    });

    const origin = S3BucketOrigin.withOriginAccessControl(props.bucket, {
      // 存在しないkeyを403ではなく404にするため。Phase 3の閲覧認証で403を未認可の意味に使う
      originAccessLevels: [AccessLevel.READ, AccessLevel.LIST],
    });

    this.distribution = new Distribution(this, 'Distribution', {
      comment: 'untrusted pages配信',
      priceClass: PriceClass.PRICE_CLASS_200,
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        // slugは一意で再アップロードはAPI側で弾くため、内容は実質不変
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [
          {
            function: routerFunction,
            eventType: FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
    });
  }
}
