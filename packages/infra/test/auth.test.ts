import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { describe, expect, it } from 'vitest';
import { Auth } from '../lib/constructs/auth.js';

function synthAuth(props: { appDomain?: string; appDistributionDomain?: string } = {}): Template {
  const app = new App();
  const stack = new Stack(app, 'TestStack');
  const pagesBucket = new Bucket(stack, 'PagesBucket', {
    blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
  });
  new Auth(stack, 'Auth', { ...props, pagesBucket });
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
    template.resourceCountIs('AWS::Cognito::IdentityPool', 1);
  });

  it('appDomain未設定のときWebクライアントのコールバックはlocalhostのみ', () => {
    const template = synthAuth();
    const clients = template.findResources('AWS::Cognito::UserPoolClient');
    const webClient = findClientByCallback(clients, 'http://localhost:3000/callback');

    expect(webClient?.Properties?.CallbackURLs).toEqual(['http://localhost:3000/callback']);
    expect(webClient?.Properties?.LogoutURLs).toEqual(['http://localhost:3000']);
  });

  it('appDomain指定時はWebクライアントのコールバックに本番URLが追加される', () => {
    const template = synthAuth({ appDomain: 'app.share.example.jp' });
    const clients = template.findResources('AWS::Cognito::UserPoolClient');
    const webClient = findClientByCallback(clients, 'http://localhost:3000/callback');

    expect(webClient?.Properties?.CallbackURLs).toEqual(
      expect.arrayContaining([
        'http://localhost:3000/callback',
        'https://app.share.example.jp/callback',
      ]),
    );
    expect(webClient?.Properties?.LogoutURLs).toEqual(
      expect.arrayContaining(['http://localhost:3000', 'https://app.share.example.jp']),
    );
  });

  it('appDistributionDomain指定時はWebクライアントのコールバックにDistributionドメインが追加される', () => {
    const template = synthAuth({ appDistributionDomain: 'd111111abcdef8.cloudfront.net' });
    const clients = template.findResources('AWS::Cognito::UserPoolClient');
    const webClient = findClientByCallback(clients, 'http://localhost:3000/callback');

    expect(webClient?.Properties?.CallbackURLs).toEqual(
      expect.arrayContaining([
        'http://localhost:3000/callback',
        'https://d111111abcdef8.cloudfront.net/callback',
      ]),
    );
    expect(webClient?.Properties?.LogoutURLs).toEqual(
      expect.arrayContaining(['http://localhost:3000', 'https://d111111abcdef8.cloudfront.net']),
    );
  });

  it('CLIコールバックは127.0.0.1の3ポート', () => {
    const template = synthAuth();
    const cliClient = Object.values(template.findResources('AWS::Cognito::UserPoolClient')).find(
      (client) => client.Properties?.CallbackURLs?.includes('http://127.0.0.1:8976/callback'),
    );

    expect(cliClient?.Properties?.CallbackURLs).toEqual([
      'http://127.0.0.1:8976/callback',
      'http://127.0.0.1:8977/callback',
      'http://127.0.0.1:8978/callback',
    ]);
  });

  it('Identity Pool は unauthenticated を無効にし、authenticated role に TagSession と pages prefix ポリシーがある', () => {
    const template = synthAuth();

    template.hasResourceProperties('AWS::Cognito::IdentityPool', {
      AllowUnauthenticatedIdentities: false,
    });

    template.hasResourceProperties('AWS::Cognito::IdentityPoolPrincipalTag', {
      PrincipalTags: {
        email: 'email',
      },
    });

    const roles = template.findResources('AWS::IAM::Role');
    const authenticatedRole = Object.values(roles).find((role) =>
      role.Properties?.AssumeRolePolicyDocument?.Statement?.some(
        (statement: { Action?: string | string[] }) => {
          const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
          return actions.includes('sts:AssumeRoleWithWebIdentity');
        },
      ),
    );
    expect(authenticatedRole).toBeDefined();

    const trustStatements = authenticatedRole?.Properties?.AssumeRolePolicyDocument
      ?.Statement as Array<{ Action?: string | string[] }>;
    const tagSessionStatement = trustStatements.find((statement) => {
      const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
      return actions.includes('sts:TagSession');
    });
    expect(tagSessionStatement).toBeDefined();

    const policies = Object.values(template.findResources('AWS::IAM::Policy'));
    const statements = policies.flatMap(
      (policy) =>
        (policy.Properties?.PolicyDocument?.Statement ?? []) as Array<Record<string, unknown>>,
    );
    const readWrite = statements.find((statement) => statement.Sid === 'ReadWriteOwnPages');
    expect(readWrite).toMatchObject({
      Effect: 'Allow',
      Action: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
    });
    const resourceJoin = readWrite?.Resource as { 'Fn::Join'?: [string, unknown[]] } | undefined;
    expect(resourceJoin?.['Fn::Join']?.[1]?.[1]).toBe('/pages/${aws:PrincipalTag/email}/*');
  });
});
