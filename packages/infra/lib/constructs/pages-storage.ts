import { RemovalPolicy } from 'aws-cdk-lib';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
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
}
