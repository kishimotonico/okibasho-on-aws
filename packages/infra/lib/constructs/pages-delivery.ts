import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RemovalPolicy } from 'aws-cdk-lib';
import {
  AccessLevel,
  CachePolicy,
  Distribution,
  Function,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  HeadersReferrerPolicy,
  KeyValueStore,
  PriceClass,
  ResponseHeadersPolicy,
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
 * 社内限定 (internal) と URL共有 (shared) を別 Distribution に分ける。
 */
export class PagesDelivery extends Construct {
  readonly internalDistribution: Distribution;
  readonly sharedDistribution: Distribution;
  readonly keyValueStore: KeyValueStore;

  constructor(scope: Construct, id: string, props: PagesDeliveryProps) {
    super(scope, id);

    this.keyValueStore = new KeyValueStore(this, 'KeyValueStore', {
      comment: 'slug → active version alias',
    });
    this.keyValueStore.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const routerSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../functions/pages-router.js'),
      'utf-8',
    );

    const internalRouterFunction = new Function(this, 'InternalRouterFunction', {
      code: FunctionCode.fromInline(routerSource.replaceAll('__NAMESPACE__', 'internal')),
      runtime: FunctionRuntime.JS_2_0,
      keyValueStore: this.keyValueStore,
      comment: 'internal pages: URL rewrite + KVS alias',
    });

    const sharedRouterFunction = new Function(this, 'SharedRouterFunction', {
      code: FunctionCode.fromInline(routerSource.replaceAll('__NAMESPACE__', 'shared')),
      runtime: FunctionRuntime.JS_2_0,
      keyValueStore: this.keyValueStore,
      comment: 'shared pages: URL rewrite + KVS alias',
    });

  // architecture.md の制約: すべての behavior に KVS 関連付け済み Function を付ける。
  // Function 無しの behavior が1つでもあると、その経路だけ期限判定が抜ける。
    const internalResponseHeaders = new ResponseHeadersPolicy(this, 'InternalResponseHeaders', {
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: 'Cross-Origin-Resource-Policy',
            override: true,
            value: 'same-origin',
          },
        ],
      },
    });

    const sharedResponseHeaders = new ResponseHeadersPolicy(this, 'SharedResponseHeaders', {
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        referrerPolicy: {
          override: true,
          referrerPolicy: HeadersReferrerPolicy.NO_REFERRER,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: 'X-Robots-Tag',
            override: true,
            value: 'noindex, nofollow',
          },
        ],
      },
    });

    const internalOrigin = S3BucketOrigin.withOriginAccessControl(props.bucket, {
      originPath: '/internal-pages',
      originAccessLevels: [AccessLevel.READ, AccessLevel.LIST],
    });

    const sharedOrigin = S3BucketOrigin.withOriginAccessControl(props.bucket, {
      originPath: '/shared-pages',
      originAccessLevels: [AccessLevel.READ, AccessLevel.LIST],
    });

    this.internalDistribution = new Distribution(this, 'InternalDistribution', {
      comment: 'internal pages配信',
      priceClass: PriceClass.PRICE_CLASS_200,
      defaultBehavior: {
        origin: internalOrigin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        // slug は KVS エイリアスで切り替わる。rewrite 後 URI がキャッシュキー
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: internalResponseHeaders,
        functionAssociations: [
          {
            function: internalRouterFunction,
            eventType: FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
    });

    this.sharedDistribution = new Distribution(this, 'SharedDistribution', {
      comment: 'shared pages配信',
      priceClass: PriceClass.PRICE_CLASS_200,
      defaultBehavior: {
        origin: sharedOrigin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: sharedResponseHeaders,
        functionAssociations: [
          {
            function: sharedRouterFunction,
            eventType: FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
    });
  }
}
