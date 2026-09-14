import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Duration } from 'aws-cdk-lib';
import { KeyValueStore } from 'aws-cdk-lib/aws-cloudfront';
import { ComparisonOperator, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Bucket } from 'aws-cdk-lib/aws-s3';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export interface ExternalShareProps {
  /** pages bucket。projectorがここから.metadata.jsonを読む */
  readonly pagesBucket: Bucket;
  /** projectorのErrorsアラーム通知先。未設定ならアラームは作るがSNS通知はしない */
  readonly alertEmail?: string;
}

/**
 * 社外共有(/s/*)のエッジ投影を担う一式。
 *
 * .metadata.json の share フィールドが正本で、KVSはエッジで参照するための投影に過ぎない。
 * S3イベントには依存せず、5分ごとの全件reconcileだけでKVSを追従させる
 * (CloudFront FunctionはKVSしか見ないため、反映まで最大5分程度の遅延が生じる)。
 */
export class ExternalShare extends Construct {
  readonly keyValueStore: KeyValueStore;
  readonly projector: NodejsFunction;

  constructor(scope: Construct, id: string, props: ExternalShareProps) {
    super(scope, id);

    this.keyValueStore = new KeyValueStore(this, 'ShareKeyValueStore', {
      comment: '/s/<share-id>/ -> pages S3キーの投影(正本は.metadata.jsonのshareフィールド)',
    });

    this.projector = new NodejsFunction(this, 'ProjectorFunction', {
      entry: join(dirname(fileURLToPath(import.meta.url)), '../lambda/share-projector/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(1),
      memorySize: 256,
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
      description: 'share projector: .metadata.jsonのshareフィールドをCloudFront KVSへ投影する',
    });

    this.grantLeastPrivilege(props.pagesBucket);
    this.wireReconcileRule();
    this.wireErrorAlarm(props.alertEmail);
  }

  private grantLeastPrivilege(pagesBucket: Bucket): void {
    this.projector.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:GetObject'],
        resources: [pagesBucket.arnForObjects('pages/*')],
      }),
    );

    this.projector.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:ListBucket'],
        resources: [pagesBucket.bucketArn],
        conditions: {
          StringLike: { 's3:prefix': ['pages/*'] },
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
        ],
        resources: [this.keyValueStore.keyValueStoreArn],
      }),
    );
  }

  /** S3イベントは使わず、5分ごとの全件reconcileだけでKVSを追従させる */
  private wireReconcileRule(): void {
    new Rule(this, 'ReconcileRule', {
      schedule: Schedule.rate(Duration.minutes(5)),
      targets: [new LambdaFunction(this.projector)],
      description: 'share projector の全件reconcile(5分毎)',
    });
  }

  /** projectorが失敗し続けているのに誰も気づけない事態を避けるためのアラーム */
  private wireErrorAlarm(alertEmail: string | undefined): void {
    const alarm = this.projector
      .metricErrors({ period: Duration.minutes(5) })
      .createAlarm(this, 'ProjectorErrorsAlarm', {
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        // 実行が無い(=呼ばれていない)ことをエラー扱いにはしない
        treatMissingData: TreatMissingData.NOT_BREACHING,
        alarmDescription: 'share projectorが5分間隔のreconcileで失敗している',
      });

    if (!alertEmail) {
      return;
    }

    const topic = new Topic(this, 'AlertTopic', {
      displayName: 'okibasho share projector alerts',
    });
    topic.addSubscription(new EmailSubscription(alertEmail));
    alarm.addAlarmAction(new SnsAction(topic));
  }
}
