import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { BlockPublicAccess, Bucket } from 'aws-cdk-lib/aws-s3';
import { describe, expect, it } from 'vitest';
import { Auth, GOOGLE_CLIENT_SECRET_NAME } from '../lib/constructs/auth.js';

function synthAuth(googleClientId?: string): Template {
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new Stack(app, 'TestStack');
  const pagesBucket = new Bucket(stack, 'PagesBucket', {
    blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
  });
  new Auth(stack, 'Auth', {
    appDomainName: 'app.okibasho.example.com',
    pagesBucket,
    emailDomain: 'example.jp',
    googleClientId,
  });
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
  it('Webクライアントのコールバックはlocalhostと管理UIのホスト名', () => {
    const template = synthAuth();
    const clients = template.findResources('AWS::Cognito::UserPoolClient');
    const webClient = findClientByCallback(clients, 'http://localhost:3000/callback');

    expect(webClient?.Properties?.CallbackURLs).toEqual([
      'http://localhost:3000/callback',
      'https://app.okibasho.example.com/callback',
    ]);
    expect(webClient?.Properties?.LogoutURLs).toEqual([
      'http://localhost:3000',
      'https://app.okibasho.example.com',
    ]);
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

  it('PreSignUp トリガーは Google の有無に関係なく常に付き、メールドメインを渡す', () => {
    const template = synthAuth();

    template.hasResourceProperties('AWS::Cognito::UserPool', {
      LambdaConfig: { PreSignUp: Match.anyValue() },
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: { Variables: { EMAIL_DOMAIN: 'example.jp' } },
    });
  });

  it('GOOGLE_CLIENT_ID が無ければ Google IdP を作らず、App Client は COGNITO だけ', () => {
    const template = synthAuth();

    template.resourceCountIs('AWS::Cognito::UserPoolIdentityProvider', 0);
    template.allResourcesProperties('AWS::Cognito::UserPoolClient', {
      SupportedIdentityProviders: ['COGNITO'],
    });
  });

  it('GOOGLE_CLIENT_ID があれば Google IdP を作り、secret は Secrets Manager から参照する', () => {
    const template = synthAuth('google-client-id');

    template.hasResourceProperties('AWS::Cognito::UserPoolIdentityProvider', {
      ProviderName: 'Google',
      ProviderType: 'Google',
      ProviderDetails: {
        client_id: 'google-client-id',
        client_secret: `{{resolve:secretsmanager:${GOOGLE_CLIENT_SECRET_NAME}:SecretString:::}}`,
        authorize_scopes: 'openid email profile',
      },
      AttributeMapping: { email: 'email', email_verified: 'email_verified' },
    });

    const [providerId] = Object.keys(
      template.findResources('AWS::Cognito::UserPoolIdentityProvider'),
    );
    const clients = Object.values(template.findResources('AWS::Cognito::UserPoolClient'));
    expect(clients).toHaveLength(2);
    for (const client of clients) {
      expect(client.Properties?.SupportedIdentityProviders).toEqual(['COGNITO', 'Google']);
      expect(client.DependsOn).toContain(providerId);
    }
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
    const resources = readWrite?.Resource as Array<{ 'Fn::Join'?: [string, unknown[]] }>;
    const resourceSuffixes = resources.map((resource) => resource['Fn::Join']?.[1]?.[1]);
    expect(resourceSuffixes).toEqual([
      '/pages/${aws:PrincipalTag/email}/*',
      '/meta/${aws:PrincipalTag/email}/*',
    ]);
  });
});
