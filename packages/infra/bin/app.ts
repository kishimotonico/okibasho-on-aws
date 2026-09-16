import { existsSync } from 'node:fs';
import { App } from 'aws-cdk-lib';
import { CertificateStack } from '../lib/certificate-stack.js';
import { loadConfig } from '../lib/config.js';
import { OkibashoStack } from '../lib/okibasho-stack.js';

// シェルで設定済みの環境変数は .env より優先される
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const config = loadConfig();
const app = new App();
const account = process.env['CDK_DEPLOY_ACCOUNT'] ?? process.env['CDK_DEFAULT_ACCOUNT'];

const certificateStack =
  config.serviceDomain &&
  new CertificateStack(app, 'OkibashoCertificate', {
    env: { account, region: 'us-east-1' },
    serviceDomain: config.serviceDomain,
  });

const okibasho = new OkibashoStack(app, 'Okibasho', {
  env: {
    account,
    region: process.env['CDK_DEPLOY_REGION'] ?? process.env['CDK_DEFAULT_REGION'],
  },
  emailDomain: config.emailDomain,
  serviceDomain: certificateStack?.serviceDomain,
  googleClientId: config.googleClientId,
});
if (certificateStack) {
  okibasho.addStackDependency(certificateStack);
}
