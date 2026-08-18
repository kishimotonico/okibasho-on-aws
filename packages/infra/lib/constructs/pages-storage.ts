import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods } from 'aws-cdk-lib/aws-s3';
import { DEFAULT_RETENTION_DAYS, PAGES_PREFIX } from '@page-share/shared';
import { Construct } from 'constructs';

/** Lifecycleの対象を選ぶObject Tag。APIが付ける値と一致している必要がある */
const RETENTION_TAG = { key: 'retention', value: 'temporary' };

/**
 * 論理期限を過ぎてから物理削除するまでの猶予。
 *
 * 論理期限(createdAt + 30日)ちょうどで消すと、期限切れに気付いて permanent へ
 * 変えようとしたときには実体が無い、ということが起きる。1週間の猶予を置いて
 * 救える窓を作っておく。Lifecycle自体も即時ではなく最大で数十時間ずれる。
 */
const PHYSICAL_DELETE_GRACE_DAYS = 7;

/**
 * pages/ meta/ users/ を格納する S3 bucket。
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
          // 同じ pages/ 配下にいてもタグが外れるので対象から外れる
          tagFilters: { [RETENTION_TAG.key]: RETENTION_TAG.value },
          expiration: Duration.days(DEFAULT_RETENTION_DAYS + PHYSICAL_DELETE_GRACE_DAYS),
        },
      ],
    });

    this.denyCloudFrontOutsidePagesPrefix();
  }

  /**
   * CloudFront から読めるのを pages/ 配下だけに制限する。
   *
   * 「配信されるのは pages/ だけ」という不変条件は、これまで CloudFront Function の
   * URL書き換え1枚だけが守っていた。関数のバグやCloudFront側のパス正規化の隙が
   * そのまま meta/ の閲覧（ownerのメールアドレス）につながる形だったので、
   * 同じ境界を bucket policy にも書いて2枚にする。
   *
   * Lambda はこの bucket policy の対象外（サービスプリンシパルが違う）ため、
   * meta/ と users/ の読み書きには影響しない。
   */
  private denyCloudFrontOutsidePagesPrefix(): void {
    const cloudFront = new ServicePrincipal('cloudfront.amazonaws.com');

    this.bucket.addToResourcePolicy(
      new PolicyStatement({
        sid: 'DenyCloudFrontGetOutsidePagesPrefix',
        effect: Effect.DENY,
        principals: [cloudFront],
        actions: ['s3:GetObject'],
        notResources: [this.bucket.arnForObjects(`${PAGES_PREFIX}*`)],
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
          StringNotLike: { 's3:prefix': [`${PAGES_PREFIX}*`] },
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
