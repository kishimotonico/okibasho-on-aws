import { RemovalPolicy } from 'aws-cdk-lib';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/** ページオブジェクトの S3 prefix。owner 単位のキー空間のルート */
export const PAGES_PREFIX = 'pages/';

/**
 * pages/ 配下にページ成果物を格納する S3 bucket。
 * 配信は CloudFront + OAC 経由に限定するため、公開アクセスはすべてブロックする。
 */
export class PagesStorage extends Construct {
  readonly bucket: Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.bucket = new Bucket(this, 'Bucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      // 30人規模の社内ツールでは KMS の運用コストに見合わない
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // ユーザー成果物はスタック削除後も残す。中身の自動削除はしない
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.restrictCloudFrontToPagesPrefix();
  }

  /**
   * CloudFront から読めるのを pages/ だけに制限する。
   *
   * CloudFront Function の URL 書き換えと同じ境界を bucket policy にも書いて二重化する。
   */
  private restrictCloudFrontToPagesPrefix(): void {
    const cloudFront = new ServicePrincipal('cloudfront.amazonaws.com');
    const allowedObjectArns = [this.bucket.arnForObjects(`${PAGES_PREFIX}*`)];

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
            's3:prefix': [`${PAGES_PREFIX}*`],
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
