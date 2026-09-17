import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REQUIRED_FIELDS } from '../packages/web/src/config/env.ts';

const root = join(import.meta.dirname, '..');

function run(command: string, args: string[]): void {
  execFileSync(command, args, { cwd: root, stdio: 'inherit' });
}

// web のビルドには Output の値が要る。BucketDeployment に寄せると cdk synth が web のビルドに
// 依存するため、アップロードは CDK の外で行う
const outputsFile = join(mkdtempSync(join(tmpdir(), 'okibasho-deploy-')), 'outputs.json');

run('pnpm', [
  '--filter',
  '@okibasho/infra',
  'exec',
  'cdk',
  'deploy',
  '--all',
  '--outputs-file',
  outputsFile,
  ...process.argv.slice(2),
]);

const outputs: Record<string, string> & { AppBucketName: string; AppDistributionId: string } =
  JSON.parse(readFileSync(outputsFile, 'utf8')).Okibasho;

for (const field of REQUIRED_FIELDS) {
  process.env[field.envVar] = outputs[field.cfnOutput];
}
run('pnpm', ['--filter', '@okibasho/web', 'build']);

// Cache-Control は付けない。CloudFront の Response Headers Policy が /assets/* を長期キャッシュ、
// それ以外を no-cache にするので、invalidation だけで足りる
run('aws', ['s3', 'sync', 'packages/web/dist/client', `s3://${outputs.AppBucketName}`, '--delete']);

run('aws', [
  'cloudfront',
  'create-invalidation',
  '--distribution-id',
  outputs.AppDistributionId,
  '--paths',
  '/*',
]);
