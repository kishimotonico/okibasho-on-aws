import { RemovalPolicy } from 'aws-cdk-lib';
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * pages/ と users/ を格納する S3 bucket。
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
      // スタック削除でユーザー成果物が消えないようにする
      removalPolicy: RemovalPolicy.RETAIN,
    });
  }

  /**
   * Web UIからのpresigned PUTを許可するCORSルールを足す。
   *
   * ブラウザはpresigned URLでS3へ直接PUTする(Lambdaを経由させない設計のため)。
   * これはapp originからS3へのcross-originリクエストなので、bucket側にCORSが無いと
   * preflightで弾かれてアップロードが一切通らない。
   *
   * app Distributionのドメインは AppDelivery を作ってからでないと分からないため、
   * bucketの定義時ではなく後から足す形にしている。
   * GETを許可しないのは、閲覧はCloudFront経由だけで、S3を直接読む必要がないため。
   */
  allowUploadsFrom(origins: string[]): void {
    this.bucket.addCorsRule({
      allowedOrigins: origins,
      allowedMethods: [HttpMethods.PUT],
      allowedHeaders: ['*'],
      // ブラウザ側でアップロード結果を確認できるようにETagだけ露出する
      exposedHeaders: ['ETag'],
      maxAge: 3000,
    });
  }
}
