import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { Auth } from '../lib/constructs/auth.js';

function synthAuth(props: { appDomain?: string; appDistributionDomain?: string } = {}): Template {
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  new Auth(stack, 'Auth', props);
  return Template.fromStack(stack);
}

function findClientByCallback(
  clients: Record<string, { Properties?: { CallbackURLs?: string[]; LogoutURLs?: string[] } }>,
  callbackUrl: string,
) {
  return Object.values(clients).find((client) =>
    client.Properties?.CallbackURLs?.includes(callbackUrl),
  );
}

describe('Auth', () => {
  it('appDomain未設定でもsynthが通る', () => {
    const template = synthAuth();

    template.resourceCountIs('AWS::Cognito::UserPool', 1);
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 2);
  });

  it('appDomain未設定のときWebクライアントのコールバックはlocalhostのみ', () => {
    const template = synthAuth();
    const clients = template.findResources('AWS::Cognito::UserPoolClient');
    const webClient = findClientByCallback(clients, 'http://localhost:3000/auth/callback');

    expect(webClient?.Properties?.CallbackURLs).toEqual(['http://localhost:3000/auth/callback']);
    expect(webClient?.Properties?.LogoutURLs).toEqual(['http://localhost:3000']);
  });

  it('appDomain指定時はWebクライアントのコールバックに本番URLが追加される', () => {
    const template = synthAuth({ appDomain: 'app.share.example.jp' });
    const clients = template.findResources('AWS::Cognito::UserPoolClient');
    const webClient = findClientByCallback(clients, 'http://localhost:3000/auth/callback');

    expect(webClient?.Properties?.CallbackURLs).toEqual(
      expect.arrayContaining([
        'http://localhost:3000/auth/callback',
        'https://app.share.example.jp/auth/callback',
      ]),
    );
    expect(webClient?.Properties?.LogoutURLs).toEqual(
      expect.arrayContaining(['http://localhost:3000', 'https://app.share.example.jp']),
    );
  });

  it('appDistributionDomain指定時はWebクライアントのコールバックにDistributionドメインが追加される', () => {
    const template = synthAuth({ appDistributionDomain: 'd111111abcdef8.cloudfront.net' });
    const clients = template.findResources('AWS::Cognito::UserPoolClient');
    const webClient = findClientByCallback(clients, 'http://localhost:3000/auth/callback');

    expect(webClient?.Properties?.CallbackURLs).toEqual(
      expect.arrayContaining([
        'http://localhost:3000/auth/callback',
        'https://d111111abcdef8.cloudfront.net/auth/callback',
      ]),
    );
    expect(webClient?.Properties?.LogoutURLs).toEqual(
      expect.arrayContaining(['http://localhost:3000', 'https://d111111abcdef8.cloudfront.net']),
    );
  });
});
