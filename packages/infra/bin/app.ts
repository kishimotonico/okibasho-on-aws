import { App } from 'aws-cdk-lib';
import { config } from '../lib/config.js';
import { PageShareStack } from '../lib/page-share-stack.js';

const app = new App();

new PageShareStack(app, 'PageShare', {
  env: config.env ?? {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'],
  },
});
