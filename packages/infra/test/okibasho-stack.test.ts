import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { OkibashoStack } from '../lib/okibasho-stack.js';

/**
 * スタック全体のsnapshot。
 *
 * env / domains が未設定でも synth が通ることを担保する意図もあるため、
 * .env や環境変数は読まず、env なし（region-agnostic）で合成する。
 */
function synth(): Template {
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new OkibashoStack(app, 'Okibasho', { emailDomain: 'example.jp' });
  return Template.fromStack(stack);
}

function synthJson(): Record<string, unknown> {
  return synth().toJSON() as Record<string, unknown>;
}

type DistributionResource = {
  Properties?: {
    DistributionConfig?: {
      Comment?: string;
      DefaultRootObject?: string;
      CustomErrorResponses?: unknown;
      Origins?: Array<{ OriginPath?: string }>;
      DefaultCacheBehavior?: {
        FunctionAssociations?: Array<{ EventType?: string }>;
        ResponseHeadersPolicyId?: unknown;
        CachePolicyId?: unknown;
      };
      CacheBehaviors?: Array<{
        PathPattern?: string;
        OriginRequestPolicyId?: unknown;
        FunctionAssociations?: unknown;
      }>;
    };
  };
};

function findDistributionByComment(
  template: Template,
  comment: string,
): DistributionResource | undefined {
  const distributions = template.findResources('AWS::CloudFront::Distribution');
  return Object.values(distributions).find(
    (distribution) => distribution.Properties?.DistributionConfig?.Comment === comment,
  );
}

describe('OkibashoStack', () => {
  it('テンプレートが意図せず変化していない', () => {
    expect(synthJson()).toMatchSnapshot();
  });

  describe('PagesStorage', () => {
    it('bucketは完全privateでHTTPS必須、Website Hostingは使わない', () => {
      const template = synth();

      template.resourceCountIs('AWS::S3::Bucket', 2);
      template.resourceCountIs('AWS::S3::BucketPolicy', 2);

      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });

      const buckets = template.findResources('AWS::S3::Bucket');
      for (const bucket of Object.values(buckets)) {
        expect(bucket.Properties?.WebsiteConfiguration).toBeUndefined();
        expect(bucket.Properties?.LifecycleConfiguration).toBeUndefined();
      }

      template.hasResource('AWS::S3::Bucket', {
        DeletionPolicy: 'Retain',
        UpdateReplacePolicy: 'Retain',
      });

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

    it('CloudFrontから読めるのは pages/ だけに絞られている', () => {
      const template = synth();

      const policies = Object.values(template.findResources('AWS::S3::BucketPolicy'));
      const statements = policies.flatMap(
        (p) => (p.Properties?.PolicyDocument?.Statement ?? []) as Array<Record<string, unknown>>,
      );

      const denyGet = statements.find((st) => st.Sid === 'DenyCloudFrontGetOutsidePagesPrefix');
      expect(denyGet?.Effect).toBe('Deny');
      expect(denyGet?.Action).toBe('s3:GetObject');
      expect(denyGet?.NotResource).toBeDefined();
      expect(denyGet?.Resource).toBeUndefined();

      const denyList = statements.find((st) => st.Sid === 'DenyCloudFrontListOutsidePagesPrefix');
      expect(denyList?.Effect).toBe('Deny');
      expect(denyList?.Condition).toMatchObject({ Null: { 's3:prefix': 'false' } });
    });

    it('ブラウザからの直接 S3 アクセス用に CORS で GET/PUT/POST/DELETE/HEAD を許可する', () => {
      const template = synth();

      const withCors = Object.values(template.findResources('AWS::S3::Bucket')).filter(
        (bucket) => bucket.Properties?.CorsConfiguration !== undefined,
      );
      expect(withCors).toHaveLength(1);

      const rules = withCors[0]?.Properties?.CorsConfiguration?.CorsRules as
        | Array<{
            AllowedMethods?: string[];
            AllowedOrigins?: unknown[];
            ExposedHeaders?: string[];
          }>
        | undefined;
      expect(rules).toHaveLength(1);
      expect(rules?.[0]?.AllowedMethods).toEqual(
        expect.arrayContaining(['GET', 'PUT', 'POST', 'DELETE', 'HEAD']),
      );
      expect(rules?.[0]?.AllowedOrigins).toContain('http://localhost:3000');
      expect(rules?.[0]?.ExposedHeaders).toEqual(['ETag']);
    });
  });

  describe('PagesDelivery', () => {
    it('pages Distribution + OAC + viewer request 関数。KVS と shared Distribution は無い', () => {
      const template = synth();

      template.resourceCountIs('AWS::CloudFront::KeyValueStore', 0);
      template.resourceCountIs('AWS::ApiGatewayV2::Api', 0);
      template.resourceCountIs('AWS::CloudFront::Distribution', 2);
      template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 2);

      const pagesDistribution = findDistributionByComment(template, 'pages配信');
      expect(pagesDistribution).toBeDefined();
      expect(
        pagesDistribution?.Properties?.DistributionConfig?.Origins?.[0]?.OriginPath,
      ).toBeUndefined();

      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: Match.objectLike({
          Comment: 'pages配信',
          DefaultCacheBehavior: Match.objectLike({
            FunctionAssociations: Match.arrayWith([
              Match.objectLike({
                EventType: 'viewer-request',
              }),
            ]),
            ResponseHeadersPolicyId: Match.anyValue(),
            CachePolicyId: Match.anyValue(),
          }),
        }),
      });

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
    });
  });

  describe('AppDelivery', () => {
    it('管理UI用Distribution、SPAシェル、HSTS/CSP Response Headers', () => {
      const template = synth();

      const appDistribution = findDistributionByComment(template, 'trusted 管理UI配信');
      expect(appDistribution).toBeDefined();

      expect(appDistribution?.Properties?.DistributionConfig?.DefaultRootObject).toBe(
        '_shell.html',
      );

      expect(appDistribution?.Properties?.DistributionConfig?.CustomErrorResponses).toBeUndefined();
      expect(
        appDistribution?.Properties?.DistributionConfig?.DefaultCacheBehavior?.FunctionAssociations,
      ).toEqual(expect.arrayContaining([expect.objectContaining({ EventType: 'viewer-request' })]));
      expect(
        appDistribution?.Properties?.DistributionConfig?.DefaultCacheBehavior
          ?.ResponseHeadersPolicyId,
      ).toBeDefined();

      expect(appDistribution?.Properties?.DistributionConfig?.CacheBehaviors).toBeUndefined();

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
    });
  });

  describe('Auth', () => {
    it('User Poolは管理者作成のみ、App Clientは2つ(secretなし)、CLIコールバックは3ポート、パスワード最低12文字', () => {
      const template = synth();

      template.resourceCountIs('AWS::Cognito::UserPool', 1);
      template.resourceCountIs('AWS::Cognito::UserPoolClient', 2);
      template.resourceCountIs('AWS::Cognito::IdentityPool', 1);

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
      template.hasResource('AWS::Cognito::UserPool', {
        DeletionPolicy: 'Delete',
        UpdateReplacePolicy: 'Delete',
      });

      const clients = Object.values(template.findResources('AWS::Cognito::UserPoolClient'));
      expect(clients).toHaveLength(2);
      for (const client of clients) {
        expect(client.Properties?.GenerateSecret).not.toBe(true);
      }

      const cliClient = Object.values(template.findResources('AWS::Cognito::UserPoolClient')).find(
        (client) => client.Properties?.CallbackURLs?.includes('http://127.0.0.1:8976/callback'),
      );
      expect(cliClient?.Properties?.CallbackURLs).toEqual([
        'http://127.0.0.1:8976/callback',
        'http://127.0.0.1:8977/callback',
        'http://127.0.0.1:8978/callback',
      ]);

      const webClient = Object.values(template.findResources('AWS::Cognito::UserPoolClient')).find(
        (client) => client.Properties?.CallbackURLs?.includes('http://localhost:3000/callback'),
      );
      const callbackUrls = webClient?.Properties?.CallbackURLs as unknown[] | undefined;
      expect(callbackUrls).toEqual(expect.arrayContaining(['http://localhost:3000/callback']));

      const distributionCallback = callbackUrls?.find(
        (url): url is { 'Fn::Join': [string, unknown[]] } =>
          typeof url === 'object' && url !== null && 'Fn::Join' in url,
      );
      expect(distributionCallback).toBeDefined();
      const joinParts = distributionCallback!['Fn::Join'];
      expect(joinParts[0]).toBe('');
      expect(joinParts[1]).toEqual(expect.arrayContaining(['https://', '/callback']));
      const getAtt = (joinParts[1] as unknown[]).find(
        (part) => typeof part === 'object' && part !== null && 'Fn::GetAtt' in part,
      ) as { 'Fn::GetAtt': [string, string] } | undefined;
      expect(getAtt?.['Fn::GetAtt'][0]).toMatch(/AppDeliveryDistribution/);
      expect(getAtt?.['Fn::GetAtt'][1]).toBe('DomainName');
    });
  });
});
