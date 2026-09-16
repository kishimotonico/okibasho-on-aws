import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Duration } from 'aws-cdk-lib';
import { KeyValueStore } from 'aws-cdk-lib/aws-cloudfront';
import { Rule, RuleTargetInput, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { S3EventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { EventType, type Bucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import type { ScheduledTask } from '../lambda/page-maintenance/dispatch.js';
import { LOG_GROUP_OPTIONS } from '../log-retention.js';

export interface PageMaintenanceProps {
  /** pages bucket。Lambdaがmeta/配下のmetadataを読み、期限切れのpages/配下を削除する */
  readonly pagesBucket: Bucket;
}

/**
 * share-id → S3 prefix の投影(CloudFront KVS)と、期限切れページの削除を担うLambda。
 * 正本はmeta/配下のmetadataのshareフィールドとexpiresAtで、KVSはそこからの投影にすぎない。
 *
 * 外部共有のエッジ側(share-router.js と /s/* ビヘイビア)は PagesDelivery が持つ。
 * このConstructはKVSへの書き込み経路とページのお掃除(定期処理とそのトリガー)だけを担う。
 *
 * Lambdaはmetadataの作成・削除のS3イベントと、2本のスケジュールから起動する。
 * S3イベントは該当ページだけを投影する(ページ単位でUpdateKeysを呼ぶ)。スケジュールは
 * cleanup(期限切れページの削除)とreconcile(meta/全件とKVS全件の突き合わせ)で、どちらも冪等。
 * KVSのキーはprefixから決まるtagのため、イベントの順序・重複には依存しない。
 */
export class PageMaintenance extends Construct {
  readonly keyValueStore: KeyValueStore;
  readonly maintenanceFunction: NodejsFunction;

  constructor(scope: Construct, id: string, props: PageMaintenanceProps) {
    super(scope, id);

    this.keyValueStore = new KeyValueStore(this, 'ShareKeyValueStore', {
      comment:
        '/s/<tag><share-id>/ -> pages S3キーの投影(正本はmeta/配下のmetadataのshareフィールド)',
    });

    this.maintenanceFunction = new NodejsFunction(this, 'MaintenanceFunction', {
      entry: join(dirname(fileURLToPath(import.meta.url)), '../lambda/page-maintenance/index.ts'),
      handler: 'handler',
      logGroup: new LogGroup(this, 'MaintenanceFunctionLogs', LOG_GROUP_OPTIONS),
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
        'page maintenance: meta/配下のmetadataのshareフィールドをCloudFront KVSへ投影し、' +
        '期限切れページの削除も行う',
    });

    // 同時実行1で詰まった古い非同期呼び出しを溜め込まない。5分より古い呼び出しは
    // 捨て、追従は安全網のスケジュールに任せる(reconcileは冪等なので再実行で壊れない)
    this.maintenanceFunction.configureAsyncInvoke({
      maxEventAge: Duration.minutes(5),
      retryAttempts: 1,
    });

    this.grantLeastPrivilege(props.pagesBucket);
    this.wireTriggers(props.pagesBucket);
  }

  private grantLeastPrivilege(pagesBucket: Bucket): void {
    this.maintenanceFunction.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:GetObject'],
        // 読むのは meta/ 配下のmetadataだけ。ページ成果物本体は読ませない
        resources: [pagesBucket.arnForObjects('meta/*')],
      }),
    );

    this.maintenanceFunction.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:DeleteObject'],
        // 期限切れページの削除用。ページ成果物(pages/*)とmetadata(meta/*)の両方が対象
        resources: [pagesBucket.arnForObjects('pages/*'), pagesBucket.arnForObjects('meta/*')],
      }),
    );

    this.maintenanceFunction.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:ListBucket'],
        resources: [pagesBucket.bucketArn],
        conditions: {
          // meta/* は投影・reconcile用、pages/* は期限切れページの削除で対象prefixを列挙する用
          StringLike: { 's3:prefix': ['meta/*', 'pages/*'] },
        },
      }),
    );

    this.maintenanceFunction.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'cloudfront-keyvaluestore:DescribeKeyValueStore',
          'cloudfront-keyvaluestore:ListKeys',
          'cloudfront-keyvaluestore:UpdateKeys',
          // deleteの前にキーの有無を見るのと、存在しないキーのdeleteが
          // ResourceNotFoundExceptionになったときの確認に使う
          'cloudfront-keyvaluestore:GetKey',
        ],
        resources: [this.keyValueStore.keyValueStoreArn],
      }),
    );
  }

  /**
   * metadataの作成・削除で即時に起動し、2本のスケジュールを重ねる。
   *
   * cleanupはS3だけで完結するので毎時回す(期限切れから実際に消えるまで最大1時間)。
   * reconcileはKVS全件を読むぶん呼び出し回数が多く、即時反映はS3イベントが担っているので
   * 日次で足りる。取りこぼしの回復は最大1日になる
   */
  private wireTriggers(pagesBucket: Bucket): void {
    this.maintenanceFunction.addEventSource(
      new S3EventSource(pagesBucket, {
        events: [EventType.OBJECT_CREATED, EventType.OBJECT_REMOVED],
        filters: [{ prefix: 'meta/', suffix: '.json' }],
      }),
    );

    this.addScheduledTask({
      id: 'Cleanup',
      task: 'cleanup',
      schedule: Schedule.rate(Duration.hours(1)),
      description: '期限切れページの削除',
    });
    this.addScheduledTask({
      id: 'Reconcile',
      task: 'reconcile',
      schedule: Schedule.rate(Duration.days(1)),
      description: 'meta/全件とKVS全件の突き合わせ',
    });
  }

  /** タスク名をinputで渡すEventBridge Ruleを1本足す。taskの値はhandlerが解釈する */
  private addScheduledTask(props: {
    readonly id: string;
    readonly task: ScheduledTask;
    readonly schedule: Schedule;
    readonly description: string;
  }): void {
    new Rule(this, `${props.id}Rule`, {
      schedule: props.schedule,
      targets: [
        new LambdaFunction(this.maintenanceFunction, {
          event: RuleTargetInput.fromObject({ task: props.task }),
        }),
      ],
      description: props.description,
    });
  }
}
