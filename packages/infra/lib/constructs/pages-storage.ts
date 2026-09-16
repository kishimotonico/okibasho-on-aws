import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RemovalPolicy } from 'aws-cdk-lib';
import { Effect, type IRole, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods } from 'aws-cdk-lib/aws-s3';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';
import { LOG_GROUP_OPTIONS } from '../log-retention.js';

/** ページオブジェクトの S3 prefix。owner 単位のキー空間のルート */
export const PAGES_PREFIX = 'pages/';

/** カスタムエラーページ(404.htmlなど)を置く S3 prefix */
export const ERRORS_PREFIX = 'errors/';

/**
 * pages/ 配下にページ成果物を格納する S3 bucket。
 * 配信は CloudFront + OAC 経由に限定するため、公開アクセスはすべてブロックする。
 */
export class PagesStorage extends Construct {
  readonly bucket: Bucket;
  private readonly errorPagesDeployment: BucketDeployment;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.bucket = new Bucket(this, 'Bucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      // 30人規模のチーム向けツールでは KMS の運用コストに見合わない
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // ユーザー成果物はスタック削除後も残す。中身の自動削除はしない
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.restrictCloudFrontToPagesPrefix();
    this.errorPagesDeployment = this.deployErrorPages();
  }

  /** カスタムエラーレスポンス(404)用の固定ページを errors/ prefix にだけ配置する */
  private deployErrorPages(): BucketDeployment {
    const deployment = new BucketDeployment(this, 'ErrorPagesDeployment', {
      sources: [
        Source.asset(join(dirname(fileURLToPath(import.meta.url)), '../static/errors'), {
          // URL を埋め込むテンプレート。使う側が addErrorPage で置く
          exclude: ['403.html'],
        }),
      ],
      destinationBucket: this.bucket,
      destinationKeyPrefix: ERRORS_PREFIX,
      logGroup: new LogGroup(this, 'ErrorPagesDeploymentLogs', LOG_GROUP_OPTIONS),
    });
    this.denyDeploymentRoleOutsideErrors(deployment.handlerRole);
    return deployment;
  }

  /** デプロイ時に中身を組み立てるエラーページを errors/ に足す */
  addErrorPage(fileName: string, html: string): void {
    this.errorPagesDeployment.addSource(Source.data(fileName, html));
  }

  /**
   * 配置ロールが errors/ 以外へ書き込むのをDenyする。
   * BucketDeployment はdestinationバケット全体への書き込みをgrantするため、bucket policy側で閉じ込める
   */
  private denyDeploymentRoleOutsideErrors(handlerRole: IRole): void {
    this.bucket.addToResourcePolicy(
      new PolicyStatement({
        sid: 'DenyErrorPagesDeploymentRoleOutsideErrorsPrefix',
        effect: Effect.DENY,
        principals: [handlerRole],
        actions: ['s3:PutObject*', 's3:DeleteObject*', 's3:Abort*'],
        notResources: [this.bucket.arnForObjects(`${ERRORS_PREFIX}*`)],
      }),
    );
  }

  /**
   * CloudFront から読めるのを pages/ と errors/ だけに制限する。
   *
   * errors/ はカスタムエラーページ(404.html)専用。それ以外は pages/ 配下と同じく
   * CloudFront Function の URL 書き換えと同じ境界を bucket policy にも書いて二重化する。
   */
  private restrictCloudFrontToPagesPrefix(): void {
    const cloudFront = new ServicePrincipal('cloudfront.amazonaws.com');
    const allowedObjectArns = [
      this.bucket.arnForObjects(`${PAGES_PREFIX}*`),
      this.bucket.arnForObjects(`${ERRORS_PREFIX}*`),
    ];

    this.bucket.addToResourcePolicy(
      new PolicyStatement({
        sid: 'DenyCloudFrontGetOutsidePagesPrefix',
        effect: Effect.DENY,
        principals: [cloudFront],
        actions: ['s3:GetObject'],
        notResources: allowedObjectArns,
      }),
    );

    this.bucket.addToResourcePolicy(
      new PolicyStatement({
        sid: 'DenyCloudFrontListOutsidePagesPrefix',
        effect: Effect.DENY,
        principals: [cloudFront],
        actions: ['s3:ListBucket'],
        resources: [this.bucket.bucketArn],
        conditions: {
          StringNotLike: {
            's3:prefix': [`${PAGES_PREFIX}*`, `${ERRORS_PREFIX}*`],
          },
          // s3:prefix が付いているリクエストにだけ効かせる。
          // 存在しないkeyへのGETで S3 が 403 ではなく 404 を返すかの判定にも
          // ListBucket 権限が使われるが、そこには s3:prefix が無い。
          // この Null 条件が無いと、その判定まで Deny に巻き込んで
          // 「存在しないslugが404」という狙いが静かに壊れる
          Null: { 's3:prefix': 'false' },
        },
      }),
    );
  }

  /**
   * ブラウザからの直接 S3 アクセス用 CORS ルールを足す。
   *
   * Identity Pool クレデンシャルで PUT / LIST / DELETE するため、
   * app origin からの cross-origin リクエストを許可する必要がある。
   *
   * app Distributionのドメインは AppDelivery を作ってからでないと分からないため、
   * bucketの定義時ではなく後から足す形にしている。
   */
  allowUploadsFrom(origins: string[]): void {
    this.bucket.addCorsRule({
      allowedOrigins: origins,
      allowedMethods: [
        HttpMethods.GET,
        HttpMethods.PUT,
        HttpMethods.POST,
        HttpMethods.DELETE,
        HttpMethods.HEAD,
      ],
      allowedHeaders: ['*'],
      // ブラウザ側でアップロード結果を確認できるようにETagだけ露出する
      exposedHeaders: ['ETag'],
      maxAge: 3000,
    });
  }
}
