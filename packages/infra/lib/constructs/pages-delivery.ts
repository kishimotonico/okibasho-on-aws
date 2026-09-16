import { readFileSync } from 'node:fs';
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
  GeoRestriction,
  HeadersReferrerPolicy,
  type IKeyGroup,
  type IKeyValueStore,
  PriceClass,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  type IBucket,
  ObjectOwnership,
} from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { LOG_RETENTION_DURATION } from '../log-retention.js';
import type { CustomDomain } from './service-domain.js';

export interface PagesDeliveryProps {
  readonly bucket: IBucket;
  /** メールドメイン。CloudFront Function が user ローカル部を補完する */
  readonly emailDomain: string;
  /** 外部共有(/s/*)のエッジ投影先KVS。share-router.jsがここを参照する */
  readonly shareKeyValueStore: IKeyValueStore;
  /** 管理UIの origin (例: https://app.okibasho.example.com)。`/` をここへ飛ばす */
  readonly appOrigin: string;
  /** 未指定なら CloudFront のデフォルトドメインで配信する */
  readonly customDomain?: CustomDomain;
  /** 指定すると /p/* を Signed Cookie 必須にし、403 を app へのログイン導線に差し替える */
  readonly viewerAuth?: { readonly keyGroup: IKeyGroup };
}

/**
 * untrusted pages を CloudFront + OAC 経由で配信する Distribution。
 */
export class PagesDelivery extends Construct {
  readonly distribution: Distribution;
  /** pages のホスト名。独自ドメインか Distribution のデフォルトドメイン */
  readonly domainName: string;
  /** 外部共有の閲覧を後から追うためのアクセスログの置き場 */
  readonly accessLogBucket: Bucket;

  constructor(scope: Construct, id: string, props: PagesDeliveryProps) {
    super(scope, id);

    const routerSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../functions/pages-router.js'),
      'utf-8',
    )
      .replaceAll('__EMAIL_DOMAIN__', props.emailDomain)
      .replaceAll('__APP_ORIGIN__', props.appOrigin);

    const routerFunction = new Function(this, 'RouterFunction', {
      code: FunctionCode.fromInline(routerSource),
      runtime: FunctionRuntime.JS_2_0,
      comment: 'pages: /p/<user>/<slug>/... を S3 キーへ rewrite',
    });

    const shareRouterFunction = new Function(this, 'ShareRouterFunction', {
      code: FunctionCode.fromFile({
        filePath: join(dirname(fileURLToPath(import.meta.url)), '../functions/share-router.js'),
      }),
      runtime: FunctionRuntime.JS_2_0,
      comment: 'share: /s/<tag><share-id>/... をKVSで検証しS3キーへrewrite',
      keyValueStore: props.shareKeyValueStore,
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
        referrerPolicy: {
          referrerPolicy: HeadersReferrerPolicy.NO_REFERRER,
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
          {
            header: 'X-Robots-Tag',
            override: true,
            value: 'noindex, nofollow',
          },
        ],
      },
    });

    const origin = S3BucketOrigin.withOriginAccessControl(props.bucket, {
      // 存在しないアセットに403ではなく404を返させる。Function が /pages/... へ rewrite するため originPath は付けない
      originAccessLevels: [AccessLevel.READ, AccessLevel.LIST],
    });

    // /s/* のパスに share-id がそのまま残るため、ログはデプロイ権限を持つ人しか読めない置き場にする。
    // Signed Cookie を残さないよう logIncludesCookies は既定の false のままにする
    this.accessLogBucket = new Bucket(this, 'AccessLogBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // CloudFront の標準ログは ACL で書き込むため、ACL を有効にしたバケットしか受け付けない
      objectOwnership: ObjectOwnership.OBJECT_WRITER,
      lifecycleRules: [{ id: 'ExpireAccessLogs', expiration: LOG_RETENTION_DURATION }],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    this.distribution = new Distribution(this, 'Distribution', {
      comment: 'pages配信',
      enableLogging: true,
      logBucket: this.accessLogBucket,
      priceClass: PriceClass.PRICE_CLASS_200,
      geoRestriction: GeoRestriction.allowlist('JP'),
      // IPv4完全一致でのIP制限(share-router.js)を確実に効かせるためIPv6は無効化する
      enableIpv6: false,
      ...(props.customDomain && {
        domainNames: [props.customDomain.domainName],
        certificate: props.customDomain.certificate,
      }),
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy,
        responseHeadersPolicy: responseHeaders,
        ...(props.viewerAuth && { trustedKeyGroups: [props.viewerAuth.keyGroup] }),
        functionAssociations: [
          {
            function: routerFunction,
            eventType: FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      additionalBehaviors: {
        '/s/*': {
          origin,
          // Signed Cookieによる内部限定の閲覧はデフォルトビヘイビアだけの機能にする。
          // ここにTrusted Key Groupは今後も付けない
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy,
          responseHeadersPolicy: responseHeaders,
          functionAssociations: [
            {
              function: shareRouterFunction,
              eventType: FunctionEventType.VIEWER_REQUEST,
            },
          ],
        },
        // カスタムエラーレスポンス(404 -> errors/404.html)がオリジンとして参照するprefix。
        // 関数は付けない(オリジンから直接返す固定ページ)
        '/errors/*': {
          origin,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy,
          responseHeadersPolicy: responseHeaders,
        },
      },
      // CloudFront Functionが返したレスポンス(share-router/pages-routerの401/403/404)には
      // 適用されない(オリジン由来の400以上にしか効かない)。S3のNoSuchKeyなどにS3キーが
      // 漏れるのを防ぐのが目的で、errors/404.htmlはowner/URLの情報を含まない固定文言にしてある
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: '/errors/404.html',
          ttl: Duration.seconds(60),
        },
        // Cookie を受け取った直後に同じ URL を開き直すので、403 は覚えさせない
        ...(props.viewerAuth
          ? [
              {
                httpStatus: 403,
                responseHttpStatus: 403,
                responsePagePath: '/errors/403.html',
                ttl: Duration.seconds(0),
              },
            ]
          : []),
      ],
    });
    this.domainName = props.customDomain?.domainName ?? this.distribution.distributionDomainName;
  }
}
