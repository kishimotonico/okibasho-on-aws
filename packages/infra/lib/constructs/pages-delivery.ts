import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Duration } from 'aws-cdk-lib';
import {
  AccessLevel,
  CachePolicy,
  Distribution,
  Function,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  GeoRestriction,
  PriceClass,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface PagesDeliveryProps {
  readonly bucket: IBucket;
  /** メールドメイン。CloudFront Function が user ローカル部を補完する */
  readonly emailDomain: string;
}

/**
 * untrusted pages を CloudFront + OAC 経由で配信する Distribution。
 */
export class PagesDelivery extends Construct {
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: PagesDeliveryProps) {
    super(scope, id);

    const routerSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../functions/pages-router.js'),
      'utf-8',
    ).replaceAll('__EMAIL_DOMAIN__', props.emailDomain);

    const routerFunction = new Function(this, 'RouterFunction', {
      code: FunctionCode.fromInline(routerSource),
      runtime: FunctionRuntime.JS_2_0,
      comment: 'pages: /<user>/<slug>/... を S3 キーへ rewrite',
    });

    const cachePolicy = new CachePolicy(this, 'CachePolicy', {
      comment: '同一キー上書きを早く反映するため defaultTtl を短くする',
      defaultTtl: Duration.seconds(60),
      minTtl: Duration.seconds(0),
      maxTtl: Duration.days(365),
    });

    const responseHeaders = new ResponseHeadersPolicy(this, 'ResponseHeaders', {
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        contentSecurityPolicy: {
          contentSecurityPolicy: "frame-ancestors 'none'",
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: 'Cross-Origin-Opener-Policy',
            override: true,
            value: 'same-origin',
          },
        ],
      },
    });

    const origin = S3BucketOrigin.withOriginAccessControl(props.bucket, {
      // 存在しないアセットに403ではなく404を返させる。Function が /pages/... へ rewrite するため originPath は付けない
      originAccessLevels: [AccessLevel.READ, AccessLevel.LIST],
    });

    this.distribution = new Distribution(this, 'Distribution', {
      comment: 'pages配信',
      priceClass: PriceClass.PRICE_CLASS_200,
      geoRestriction: GeoRestriction.allowlist('JP'),
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy,
        responseHeadersPolicy: responseHeaders,
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
