import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Annotations, Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  AccessLevel,
  AllowedMethods,
  CachePolicy,
  Distribution,
  Function,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  HttpVersion,
  OriginRequestPolicy,
  PriceClass,
  ResponseHeadersPolicy,
  type ResponseHeadersPolicyProps,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { FunctionUrlOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { CfnPermission, type IFunctionUrl } from 'aws-cdk-lib/aws-lambda';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import type { CustomDomain } from './service-domain.js';

export interface AppDeliveryProps {
  /** 未指定なら CloudFront のデフォルトドメインで配信する */
  readonly customDomain?: CustomDomain;
}

/**
 * trusted 管理UIを CloudFront + OAC 経由で配信する Distribution。
 * untrusted な pages とは origin を分け、ここにはビルド成果物の静的ファイルだけを載せる。
 */
export class AppDelivery extends Construct {
  readonly bucket: Bucket;
  readonly distribution: Distribution;
  /** 管理UIのホスト名。独自ドメインか Distribution のデフォルトドメイン */
  readonly domainName: string;

  constructor(scope: Construct, id: string, props: AppDeliveryProps = {}) {
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

    // HSTS・CSPはbehavior間で共有し、Cache-Controlだけ出し分ける
    const securityHeadersBehavior: ResponseHeadersPolicyProps['securityHeadersBehavior'] = {
      strictTransportSecurity: {
        accessControlMaxAge: Duration.days(365),
        includeSubdomains: true,
        override: true,
      },
      contentSecurityPolicy: {
        contentSecurityPolicy: "frame-ancestors 'none'",
        override: true,
      },
    };

    // _shell.html はビルドのたびに中身が変わるので、S3側にCache-Controlを付けずCloudFront側で毎回再検証させる
    const shellResponseHeaders = new ResponseHeadersPolicy(this, 'ResponseHeaders', {
      securityHeadersBehavior,
      customHeadersBehavior: {
        customHeaders: [{ header: 'Cache-Control', value: 'no-cache', override: true }],
      },
    });

    // /assets/* はファイル名にハッシュが入るため、同じ名前で中身が変わることはない
    const assetsResponseHeaders = new ResponseHeadersPolicy(this, 'AssetsResponseHeaders', {
      securityHeadersBehavior,
      customHeadersBehavior: {
        customHeaders: [
          { header: 'Cache-Control', value: 'public, max-age=31536000, immutable', override: true },
        ],
      },
    });

    this.distribution = new Distribution(this, 'Distribution', {
      comment: 'trusted 管理UI配信',
      defaultRootObject: '_shell.html',
      priceClass: PriceClass.PRICE_CLASS_200,
      httpVersion: HttpVersion.HTTP2_AND_3,
      ...(props.customDomain && {
        domainNames: [props.customDomain.domainName],
        certificate: props.customDomain.certificate,
      }),
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: shellResponseHeaders,
        // CustomErrorResponseはDistribution全体に効いてしまい、404まで
        // SPAシェル(200)に化ける。behaviorごとに掛けられる関数側で寄せる
        functionAssociations: [
          { function: routerFunction, eventType: FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        // ハッシュ付きで拡張子も必ず付くので、シェルへ寄せるrouter関数は不要
        '/assets/*': {
          origin,
          viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy: assetsResponseHeaders,
        },
      },
    });
    // LIST 付き origin への一律の警告。"/" は defaultRootObject と router 関数で _shell.html に
    // 寄せるので、バケットの一覧は返らない
    Annotations.of(this.distribution).acknowledgeWarning(
      '@aws-cdk/aws-cloudfront-origins:listBucketSecurityRisk',
    );
    this.domainName = props.customDomain?.domainName ?? this.distribution.distributionDomainName;
  }

  /** Signed Cookie の発行 Lambda を /auth/* に載せる。同じ origin の SPA から呼ぶので CORS は要らない */
  addCookieIssuer(functionUrl: IFunctionUrl): void {
    this.distribution.addBehavior(
      '/auth/*',
      FunctionUrlOrigin.withOriginAccessControl(functionUrl),
      {
        viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
        allowedMethods: AllowedMethods.ALLOW_ALL,
        cachePolicy: CachePolicy.CACHING_DISABLED,
        // Host は Function URL のものでないと OAC の署名が合わない。x-amz-content-sha256 はここで通す
        originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
    );
    // withOriginAccessControl が付けるのは lambda:InvokeFunctionUrl だけ。
    // 新しい Function URL は lambda:InvokeFunction も要る
    new CfnPermission(this, 'CookieIssuerInvokeFunction', {
      principal: 'cloudfront.amazonaws.com',
      action: 'lambda:InvokeFunction',
      functionName: functionUrl.functionArn,
      sourceArn: this.distribution.distributionArn,
    });
  }
}
