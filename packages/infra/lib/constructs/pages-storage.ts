import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import {
  DEFAULT_RETENTION_DAYS,
  INTERNAL_PAGES_PREFIX,
  SHARED_PAGES_PREFIX,
} from '@page-share/shared';
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/** Lifecycleの対象を選ぶObject Tag。APIが付ける値と一致している必要がある */
const RETENTION_TAG = { key: 'retention', value: 'temporary' };

/**
 * 論理期限を過ぎてから物理削除するまでの猶予。
 *
 * 論理期限(contentUpdatedAt + 30日)ちょうどで消すと、期限切れに気付いて permanent へ
 * 変えようとしたときには実体が無い、ということが起きる。1週間の猶予を置いて
 * 救える窓を作っておく。Lifecycle自体も即時ではなく最大で数十時間ずれる。
 */
const PHYSICAL_DELETE_GRACE_DAYS = 7;

/**
 * internal-pages/ shared-pages/ meta/ users/ を格納する S3 bucket。
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
      lifecycleRules: [
        {
          id: 'expire-temporary-pages',
          enabled: true,
          // prefixではなくタグで絞る。permanentに変えたページは
          // 同じ配信 prefix 配下にいてもタグが外れるので対象から外れる
          tagFilters: { [RETENTION_TAG.key]: RETENTION_TAG.value },
          expiration: Duration.days(DEFAULT_RETENTION_DAYS + PHYSICAL_DELETE_GRACE_DAYS),
        },
      ],
    });

    this.denyCloudFrontOutsideDeliveryPrefixes();
  }

  /**
   * CloudFront から読めるのを internal-pages/ と shared-pages/ だけに制限する。
   *
   * meta/ users/ は Lambda 専用。CloudFront Function の URL 書き換えと
   * 同じ境界を bucket policy にも書いて二重化する。
   */
  private denyCloudFrontOutsideDeliveryPrefixes(): void {
    const cloudFront = new ServicePrincipal('cloudfront.amazonaws.com');
    const allowedObjectArns = [
      this.bucket.arnForObjects(`${INTERNAL_PAGES_PREFIX}*`),
      this.bucket.arnForObjects(`${SHARED_PAGES_PREFIX}*`),
    ];

    this.bucket.addToResourcePolicy(
      new PolicyStatement({
        sid: 'DenyCloudFrontGetOutsideDeliveryPrefixes',
        effect: Effect.DENY,
        principals: [cloudFront],
        actions: ['s3:GetObject'],
        notResources: allowedObjectArns,
      }),
    );

    this.bucket.addToResourcePolicy(
      new PolicyStatement({
        sid: 'DenyCloudFrontListOutsideDeliveryPrefixes',
        effect: Effect.DENY,
        principals: [cloudFront],
        actions: ['s3:ListBucket'],
        resources: [this.bucket.bucketArn],
        conditions: {
          StringNotLike: {
            's3:prefix': [`${INTERNAL_PAGES_PREFIX}*`, `${SHARED_PAGES_PREFIX}*`],
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
   * 特定の Distribution が読める prefix をさらに絞る。
   * Internal は internal-pages/ だけ、Shared は shared-pages/ だけ。
   */
  restrictDistributionRead(distributionArn: string, prefix: string): void {
    const cloudFront = new ServicePrincipal('cloudfront.amazonaws.com');
    const sidSuffix = prefix.replace(/\/$/, '').replace(/-/g, '');

    this.bucket.addToResourcePolicy(
      new PolicyStatement({
        sid: `DenyDistributionGetOutside${sidSuffix}`,
        effect: Effect.DENY,
        principals: [cloudFront],
        actions: ['s3:GetObject'],
        notResources: [this.bucket.arnForObjects(`${prefix}*`)],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': distributionArn,
          },
        },
      }),
    );

    this.bucket.addToResourcePolicy(
      new PolicyStatement({
        sid: `DenyDistributionListOutside${sidSuffix}`,
        effect: Effect.DENY,
        principals: [cloudFront],
        actions: ['s3:ListBucket'],
        resources: [this.bucket.bucketArn],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': distributionArn,
          },
          StringNotLike: {
            's3:prefix': [`${prefix}*`],
          },
          Null: { 's3:prefix': 'false' },
        },
      }),
    );
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
