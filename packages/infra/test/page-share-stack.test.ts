import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { PageShareStack } from '../lib/page-share-stack.js';

/**
 * NodejsFunction のバンドル成果物は S3Key / SourceHash などに 64 桁の asset hash が載る。
 * packages/api を変えるたびに snapshot が壊れるのを防ぐため、合成結果から hash だけ固定文字列に置換する。
 */
function normalizeAssetHashes(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\b[a-f0-9]{64}\b/g, 'ASSET_HASH_PLACEHOLDER');
  }
  if (Array.isArray(value)) {
    return value.map(normalizeAssetHashes);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeAssetHashes(entry)]),
    );
  }
  return value;
}

/**
 * スタック全体のsnapshot。
 *
 * config.env / config.domains が未設定でも synth が通ることを担保する意図もあるため、
 * ここでは config を読まず env なし（region-agnostic）で合成する。
 */
function synth(): Template {
  // aws:cdk:bundling-stacks を空にすると、CDKはasset bundlingを実行せずに合成する。
  // テストで確かめたいのはテンプレートの形であってesbuildの出力ではないので、
  // バンドルの実行時間と、ローカルのesbuild解決に左右される不安定さを持ち込まない。
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new PageShareStack(app, 'PageShare');
  return Template.fromStack(stack);
}

function synthJson(): Record<string, unknown> {
  return normalizeAssetHashes(synth().toJSON()) as Record<string, unknown>;
}

describe('PageShareStack', () => {
  it('テンプレートが意図せず変化していない', () => {
    expect(synthJson()).toMatchSnapshot();
  });

  describe('PagesStorage', () => {
    it('bucketは完全privateでHTTPS必須、Website Hostingは使わない', () => {
      const template = synth();

      template.resourceCountIs('AWS::S3::Bucket', 1);
      template.resourceCountIs('AWS::S3::BucketPolicy', 1);

      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });

      const buckets = template.findResources('AWS::S3::Bucket');
      const bucket = Object.values(buckets)[0];
      expect(bucket?.Properties?.WebsiteConfiguration).toBeUndefined();

      template.hasResourceProperties('AWS::S3::BucketPolicy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Deny',
              Condition: {
                Bool: {
                  'aws:SecureTransport': 'false',
                },
              },
            }),
          ]),
        },
      });
    });
  });

  describe('PagesDelivery', () => {
    it('CloudFront Distribution + OAC、ListBucket許可、viewer request関数が付く', () => {
      const template = synth();

      template.resourceCountIs('AWS::CloudFront::Distribution', 1);
      template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);

      template.hasResourceProperties('AWS::S3::BucketPolicy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: Match.arrayWith(['s3:ListBucket']),
            }),
          ]),
        },
      });

      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          DefaultCacheBehavior: Match.objectLike({
            FunctionAssociations: Match.arrayWith([
              Match.objectLike({
                EventType: 'viewer-request',
              }),
            ]),
          }),
        },
      });
    });
  });

  describe('Auth', () => {
    it('User Poolは管理者作成のみ、App Clientは2つ(secretなし)、CLIコールバックは3ポート、パスワード最低12文字', () => {
      const template = synth();

      template.resourceCountIs('AWS::Cognito::UserPool', 1);
      template.resourceCountIs('AWS::Cognito::UserPoolClient', 2);

      template.hasResourceProperties('AWS::Cognito::UserPool', {
        AdminCreateUserConfig: {
          AllowAdminCreateUserOnly: true,
        },
        Policies: {
          PasswordPolicy: {
            MinimumLength: 12,
          },
        },
      });

      const clients = Object.values(template.findResources('AWS::Cognito::UserPoolClient'));
      expect(clients).toHaveLength(2);
      for (const client of clients) {
        expect(client.Properties?.GenerateSecret).not.toBe(true);
      }

      const cliClient = Object.values(template.findResources('AWS::Cognito::UserPoolClient')).find(
        (client) => client.Properties?.CallbackURLs?.includes('http://localhost:8976/callback'),
      );
      expect(cliClient?.Properties?.CallbackURLs).toEqual(
        expect.arrayContaining([
          'http://localhost:8976/callback',
          'http://localhost:8977/callback',
          'http://localhost:8978/callback',
        ]),
      );
    });
  });

  describe('PagesApi', () => {
    it('HTTP API + JWT Authorizer + POST /api/pages + Lambda環境変数とS3 Put権限', () => {
      const template = synth();

      template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
      template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
        ProtocolType: 'HTTP',
      });

      template.resourceCountIs('AWS::ApiGatewayV2::Authorizer', 1);
      template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
        AuthorizerType: 'JWT',
        IdentitySource: ['$request.header.Authorization'],
      });

      const authorizer = Object.values(template.findResources('AWS::ApiGatewayV2::Authorizer'))[0];
      const audience = authorizer?.Properties?.JwtConfiguration?.Audience as
        Array<{ Ref: string }> | undefined;
      expect(audience).toHaveLength(2);

      const clientLogicalIds = Object.keys(template.findResources('AWS::Cognito::UserPoolClient'));
      expect(audience?.map((item) => item.Ref)).toEqual(expect.arrayContaining(clientLogicalIds));

      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: 'POST /api/pages',
        AuthorizationType: 'JWT',
      });

      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            PAGES_BUCKET: Match.anyValue(),
            PAGES_BASE_URL: Match.anyValue(),
          }),
        },
      });

      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['s3:PutObject']),
            }),
          ]),
        },
      });
    });
  });
});
