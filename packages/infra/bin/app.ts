import { existsSync } from 'node:fs';
import { App } from 'aws-cdk-lib';
import { loadConfig } from '../lib/config.js';
import { PageShareStack } from '../lib/page-share-stack.js';

// シェルで設定済みの環境変数は .env より優先される
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const config = loadConfig();
const app = new App();

new PageShareStack(app, 'PageShare', {
  env: {
    account: process.env['CDK_DEPLOY_ACCOUNT'] ?? process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEPLOY_REGION'] ?? process.env['CDK_DEFAULT_REGION'],
  },
  emailDomain: config.emailDomain,
  domains: config.domains,
});
