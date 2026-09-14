import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Duration } from 'aws-cdk-lib';
import { KeyValueStore } from 'aws-cdk-lib/aws-cloudfront';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { S3EventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { EventType, type Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface ShareProjectionProps {
  /** pages bucket。projectorがここからmeta/配下のmetadataを読む */
  readonly pagesBucket: Bucket;
}

/**
 * share-id → S3 prefix の投影(CloudFront KVS)と、それを正本(meta/配下のmetadataの
 * share フィールド)から作り直す projector Lambda。
 *
 * 外部共有のエッジ側(share-router.js と /s/* ビヘイビア)は PagesDelivery が持つ。
 * このConstructはKVSへの書き込み経路(projectorとそのトリガー)だけを担う。
 *
 * projectorはmetadataの作成・削除のS3イベントと15分ごとの安全網スケジュールの両方から起動する。
 * S3イベントは該当ページだけを投影し(ページ単位でUpdateKeysを呼ぶ)、スケジュールだけが
 * meta/全件とKVS全件を突き合わせる冪等なreconcileを行う。KVSのキーはprefixから決まるtagのため、
 * イベントの順序・重複には依存しない(取りこぼしだけは安全網のスケジュールが拾う)。
 */
export class ShareProjection extends Construct {
  readonly keyValueStore: KeyValueStore;
  readonly projector: NodejsFunction;

  constructor(scope: Construct, id: string, props: ShareProjectionProps) {
    super(scope, id);

    this.keyValueStore = new KeyValueStore(this, 'ShareKeyValueStore', {
      comment: '/s/<share-id>/ -> pages S3キーの投影(正本はmeta/配下のmetadataのshareフィールド)',
    });

    this.projector = new NodejsFunction(this, 'ProjectorFunction', {
      entry: join(dirname(fileURLToPath(import.meta.url)), '../lambda/share-projector/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(1),
      // 起動頻度が低くコールドスタートが支配的なため、初期化を速くする目的で上げる
      memorySize: 1024,
      // 同時実行を1に絞り、KVSのUpdateKeys競合(ConflictException)を実質起こさせない
      reservedConcurrentExecutions: 1,
      environment: {
        KVS_ARN: this.keyValueStore.keyValueStoreArn,
        PAGES_BUCKET: props.pagesBucket.bucketName,
      },
      bundling: {
        // @aws-sdk/client-cloudfront-keyvaluestore と @aws-sdk/signature-v4a は
        // Lambda Node.js ランタイムに同梱されていないため、externalize せず束ねる
        externalModules: [],
        // pnpm workspace(単一lockfile)ではNodejsFunctionのprojectRootがリポジトリ直下になり、
        // ローカルbundlingがそこを cwd にして `pnpm exec esbuild` を実行する。
        // esbuildはpackages/infraのdevDependencyでしかインストールされておらず
        // リポジトリ直下からは見えないため、PATHに絶対パスで足しておく
        environment: {
          PATH: `${join(dirname(fileURLToPath(import.meta.url)), '../../node_modules/.bin')}:${process.env.PATH ?? ''}`,
        },
      },
      description:
        'share projector: meta/配下のmetadataのshareフィールドをCloudFront KVSへ投影する',
    });

    // 同時実行1で詰まった古い非同期呼び出しを溜め込まない。5分より古い呼び出しは
    // 捨て、追従は安全網のスケジュールに任せる(reconcileは冪等なので再実行で壊れない)
    this.projector.configureAsyncInvoke({
      maxEventAge: Duration.minutes(5),
      retryAttempts: 1,
    });

    this.grantLeastPrivilege(props.pagesBucket);
    this.wireTriggers(props.pagesBucket);
  }

  private grantLeastPrivilege(pagesBucket: Bucket): void {
    this.projector.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:GetObject'],
        // projectorが読むのは meta/ 配下のmetadataだけ。ページ成果物本体は読ませない
        resources: [pagesBucket.arnForObjects('meta/*')],
      }),
    );

    this.projector.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:ListBucket'],
        resources: [pagesBucket.bucketArn],
        conditions: {
          StringLike: { 's3:prefix': ['meta/*'] },
        },
      }),
    );

    this.projector.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'cloudfront-keyvaluestore:DescribeKeyValueStore',
          'cloudfront-keyvaluestore:ListKeys',
          'cloudfront-keyvaluestore:UpdateKeys',
          // 存在しないキーのdeleteがResourceNotFoundExceptionになったときだけ、
          // GetKeyでそのキーが実際に無いことを確かめるために使う
          'cloudfront-keyvaluestore:GetKey',
        ],
        resources: [this.keyValueStore.keyValueStoreArn],
      }),
    );
  }

  /** metadataの作成・削除で即時に起動し、15分ごとのスケジュールを安全網として重ねる */
  private wireTriggers(pagesBucket: Bucket): void {
    this.projector.addEventSource(
      new S3EventSource(pagesBucket, {
        events: [EventType.OBJECT_CREATED, EventType.OBJECT_REMOVED],
        filters: [{ prefix: 'meta/', suffix: '.json' }],
      }),
    );

    new Rule(this, 'SafetyNetRule', {
      schedule: Schedule.rate(Duration.minutes(15)),
      targets: [new LambdaFunction(this.projector)],
      description: 'S3イベントの取りこぼしを拾う安全網(15分毎)',
    });
  }
}
