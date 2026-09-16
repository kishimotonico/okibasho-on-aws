import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { type LogGroupProps, RetentionDays } from 'aws-cdk-lib/aws-logs';

/** ログの保持期間。Lambda のログも外部共有のアクセスログもこの期間で揃える */
export const LOG_RETENTION = RetentionDays.THREE_MONTHS;

/** S3 のライフサイクルに渡す、LOG_RETENTION と同じ長さ */
export const LOG_RETENTION_DURATION = Duration.days(LOG_RETENTION);

/**
 * このスタックが作るロググループの共通設定。
 * ログは作り直せるので、スタックを消したら一緒に消す。
 */
export const LOG_GROUP_OPTIONS: LogGroupProps = {
  retention: LOG_RETENTION,
  removalPolicy: RemovalPolicy.DESTROY,
};
