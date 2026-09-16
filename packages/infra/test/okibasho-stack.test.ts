import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import type { ServiceDomainConfig } from '../lib/config.js';
import { OkibashoStack } from '../lib/okibasho-stack.js';

const SERVICE_DOMAIN: ServiceDomainConfig = {
  domainName: 'okibasho.example.com',
  certificateArn:
    'arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000',
  hostedZone: { id: 'Z0123456789ABCDEFGHIJ', name: 'example.com' },
};

/**
 * スタック全体のsnapshot。
 *
 * env / serviceDomain が未設定でも synth が通ることを担保する意図もあるため、
 * .env や環境変数は読まず、env なし（region-agnostic）で合成する。
 */
function synth(serviceDomain?: ServiceDomainConfig): Template {
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new OkibashoStack(app, 'Okibasho', { emailDomain: 'example.jp', serviceDomain });
  return Template.fromStack(stack);
}

// テストでは bundling を飛ばすため、Lambda アセットのハッシュはリポジトリ直下の
// ソースハッシュになり、無関係なファイルの変化でも揺れる。snapshot からは外す
function normalizedJson(template: Template): unknown {
  return JSON.parse(
    JSON.stringify(template.toJSON()).replace(/[0-9a-f]{64}\.zip/g, '<asset-hash>.zip'),
  );
}

type DistributionResource = {
  Properties?: {
    DistributionConfig?: {
      Comment?: string;
      DefaultRootObject?: string;
      CustomErrorResponses?: unknown;
      IPV6Enabled?: boolean;
      HttpVersion?: string;
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
    expect(normalizedJson(synth())).toMatchSnapshot();
  });

  it('独自ドメインありのテンプレートが意図せず変化していない', () => {
    expect(normalizedJson(synth(SERVICE_DOMAIN))).toMatchSnapshot();
  });

  describe('ServiceDomain', () => {
    it('未設定なら alias・証明書・Route 53 レコードを作らない', () => {
      const template = synth();

      template.resourceCountIs('AWS::Route53::RecordSet', 0);
      for (const distribution of Object.values(
        template.findResources('AWS::CloudFront::Distribution'),
      )) {
        expect(distribution.Properties?.DistributionConfig?.Aliases).toBeUndefined();
        expect(distribution.Properties?.DistributionConfig?.ViewerCertificate).toBeUndefined();
      }
    });

    it('pages は apex、app は app. に alias と証明書を付ける', () => {
      const template = synth(SERVICE_DOMAIN);

      for (const [comment, alias] of [
        ['pages配信', 'okibasho.example.com'],
        ['trusted 管理UI配信', 'app.okibasho.example.com'],
      ] as const) {
        template.hasResourceProperties('AWS::CloudFront::Distribution', {
          DistributionConfig: Match.objectLike({
            Comment: comment,
            Aliases: [alias],
            ViewerCertificate: Match.objectLike({
              AcmCertificateArn: SERVICE_DOMAIN.certificateArn,
              SslSupportMethod: 'sni-only',
            }),
          }),
        });
      }
    });

    it('Alias レコードは pages に A、app に A と AAAA', () => {
      const template = synth(SERVICE_DOMAIN);

      const records = Object.values(template.findResources('AWS::Route53::RecordSet')).map(
        (record) => `${record.Properties?.Type} ${record.Properties?.Name}`,
      );
      expect(records.sort()).toEqual([
        'A app.okibasho.example.com.',
        'A okibasho.example.com.',
        'AAAA app.okibasho.example.com.',
      ]);
      template.allResourcesProperties('AWS::Route53::RecordSet', {
        HostedZoneId: SERVICE_DOMAIN.hostedZone!.id,
      });
    });

    it('URL の Output・CORS・Cognito コールバックは独自ドメインから組み立てる', () => {
      const template = synth(SERVICE_DOMAIN);

      template.hasOutput('PagesBaseUrl', { Value: 'https://okibasho.example.com' });
      template.hasOutput('AppUrl', { Value: 'https://app.okibasho.example.com/' });
      template.hasResourceProperties('AWS::S3::Bucket', {
        CorsConfiguration: {
          CorsRules: [
            Match.objectLike({
              AllowedOrigins: ['https://app.okibasho.example.com', 'http://localhost:3000'],
            }),
          ],
        },
      });
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        CallbackURLs: [
          'http://localhost:3000/callback',
          'https://app.okibasho.example.com/callback',
        ],
      });
    });
  });

  describe('PagesViewerAuth', () => {
    it('独自ドメインが無ければ Key Group・/auth/*・403 ページを作らない', () => {
      const template = synth();

      template.resourceCountIs('AWS::CloudFront::KeyGroup', 0);
      template.resourceCountIs('AWS::Lambda::Url', 0);
      const appDistribution = findDistributionByComment(template, 'trusted 管理UI配信');
      expect(
        appDistribution?.Properties?.DistributionConfig?.CacheBehaviors?.map((b) => b.PathPattern),
      ).not.toContain('/auth/*');
      const pagesDistribution = findDistributionByComment(template, 'pages配信');
      expect(
        (
          pagesDistribution?.Properties?.DistributionConfig?.DefaultCacheBehavior as Record<
            string,
            unknown
          >
        )?.TrustedKeyGroups,
      ).toBeUndefined();
    });

    it('/p/* だけに Key Group を付け、403 を /errors/403.html に差し替える', () => {
      const template = synth(SERVICE_DOMAIN);

      template.resourceCountIs('AWS::CloudFront::KeyGroup', 1);
      const config = findDistributionByComment(template, 'pages配信')?.Properties
        ?.DistributionConfig as Record<string, any>;
      expect(config.DefaultCacheBehavior.TrustedKeyGroups).toHaveLength(1);
      for (const behavior of config.CacheBehaviors) {
        expect(behavior.TrustedKeyGroups).toBeUndefined();
      }
      expect(config.CustomErrorResponses).toContainEqual({
        ErrorCode: 403,
        ResponseCode: 403,
        ResponsePagePath: '/errors/403.html',
        ErrorCachingMinTTL: 0,
      });
    });

    it('app の /auth/* に IAM 認証の Function URL を OAC で載せる', () => {
      const template = synth(SERVICE_DOMAIN);

      template.hasResourceProperties('AWS::Lambda::Url', { AuthType: 'AWS_IAM' });
      const config = findDistributionByComment(template, 'trusted 管理UI配信')?.Properties
        ?.DistributionConfig as Record<string, any>;
      const authBehavior = config.CacheBehaviors.find(
        (behavior: { PathPattern: string }) => behavior.PathPattern === '/auth/*',
      );
      expect(authBehavior.AllowedMethods).toContain('POST');
      expect(authBehavior.OriginRequestPolicyId).toBe('b689b0a8-53d0-40ab-baf2-68738e2966ac');
      const authOrigin = config.Origins.find(
        (origin: { Id: string }) => origin.Id === authBehavior.TargetOriginId,
      );
      expect(authOrigin.OriginAccessControlId).toBeDefined();
      template.hasResourceProperties('AWS::Lambda::Permission', {
        Action: 'lambda:InvokeFunctionUrl',
        Principal: 'cloudfront.amazonaws.com',
      });
      template.hasResourceProperties('AWS::Lambda::Permission', {
        Action: 'lambda:InvokeFunction',
        Principal: 'cloudfront.amazonaws.com',
      });
    });
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

      // pages/ に加えて errors/ (カスタムエラーページ) も読めるようになっている
      const getResource = denyGet?.NotResource as unknown[] | undefined;
      const listPrefixes = (denyList?.Condition as { StringNotLike?: { 's3:prefix'?: string[] } })
        ?.StringNotLike?.['s3:prefix'];
      expect(JSON.stringify(getResource)).toContain('errors/*');
      expect(listPrefixes).toEqual(expect.arrayContaining(['pages/*', 'errors/*']));
    });

    it('ErrorPagesDeploymentの配置ロールは errors/ 以外へ書き込めない', () => {
      const template = synth();

      const policies = Object.values(template.findResources('AWS::S3::BucketPolicy'));
      const statements = policies.flatMap(
        (p) => (p.Properties?.PolicyDocument?.Statement ?? []) as Array<Record<string, unknown>>,
      );

      const denyDeploy = statements.find(
        (st) => st.Sid === 'DenyErrorPagesDeploymentRoleOutsideErrorsPrefix',
      );
      expect(denyDeploy?.Effect).toBe('Deny');
      expect(denyDeploy?.Action).toEqual(
        expect.arrayContaining(['s3:PutObject*', 's3:DeleteObject*', 's3:Abort*']),
      );
      expect(JSON.stringify(denyDeploy?.NotResource)).toContain('errors/*');
      expect(denyDeploy?.Resource).toBeUndefined();
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
    it('pages Distribution + OAC + viewer request 関数。KVSは1つ、shared Distributionは無い', () => {
      const template = synth();

      template.resourceCountIs('AWS::CloudFront::KeyValueStore', 1);
      template.resourceCountIs('AWS::ApiGatewayV2::Api', 0);
      template.resourceCountIs('AWS::CloudFront::Distribution', 2);
      template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 2);

      const pagesDistribution = findDistributionByComment(template, 'pages配信');
      expect(pagesDistribution).toBeDefined();
      expect(
        pagesDistribution?.Properties?.DistributionConfig?.Origins?.[0]?.OriginPath,
      ).toBeUndefined();
      expect(pagesDistribution?.Properties?.DistributionConfig?.IPV6Enabled).toBe(false);

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

      // error-scrubberを廃止したのでviewer-responseの関連付けはもう無い
      const defaultFunctionAssociations =
        pagesDistribution?.Properties?.DistributionConfig?.DefaultCacheBehavior
          ?.FunctionAssociations;
      expect(defaultFunctionAssociations).toEqual(
        expect.not.arrayContaining([expect.objectContaining({ EventType: 'viewer-response' })]),
      );

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

    it('/s/* ビヘイビアはTrustedKeyGroupsを持たず、viewer-requestの関数だけを持つ(viewer-responseは無い)', () => {
      const template = synth();

      const pagesDistribution = findDistributionByComment(template, 'pages配信');
      const shareBehavior = pagesDistribution?.Properties?.DistributionConfig?.CacheBehaviors?.find(
        (behavior) => behavior.PathPattern === '/s/*',
      );
      expect(shareBehavior).toBeDefined();
      expect((shareBehavior as Record<string, unknown>)?.TrustedKeyGroups).toBeUndefined();
      expect((shareBehavior as Record<string, unknown>)?.TrustedSigners).toBeUndefined();

      const functionAssociations = (
        shareBehavior as { FunctionAssociations?: Array<{ EventType?: string }> }
      )?.FunctionAssociations;
      expect(functionAssociations).toEqual([
        expect.objectContaining({ EventType: 'viewer-request' }),
      ]);
    });

    it('/errors/* ビヘイビアを持ち、関数は付いていない(オリジンから固定ページを直接返す)', () => {
      const template = synth();

      const pagesDistribution = findDistributionByComment(template, 'pages配信');
      const errorsBehavior =
        pagesDistribution?.Properties?.DistributionConfig?.CacheBehaviors?.find(
          (behavior) => behavior.PathPattern === '/errors/*',
        );
      expect(errorsBehavior).toBeDefined();
      expect(
        (errorsBehavior as { FunctionAssociations?: unknown })?.FunctionAssociations,
      ).toBeUndefined();
    });

    it('CustomErrorResponsesで404を/errors/404.htmlに差し替える(403は設定しない)', () => {
      const template = synth();

      const pagesDistribution = findDistributionByComment(template, 'pages配信');
      const errorResponses = pagesDistribution?.Properties?.DistributionConfig
        ?.CustomErrorResponses as
        Array<{ ErrorCode?: number; ResponsePagePath?: string; ResponseCode?: number }> | undefined;
      expect(errorResponses).toEqual([
        expect.objectContaining({
          ErrorCode: 404,
          ResponseCode: 404,
          ResponsePagePath: '/errors/404.html',
        }),
      ]);
      expect(errorResponses?.some((r) => r.ErrorCode === 403)).toBe(false);
    });

    it('Response Headers PolicyにReferrer-PolicyとX-Robots-Tagを持つ', () => {
      const template = synth();

      template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
        ResponseHeadersPolicyConfig: Match.objectLike({
          SecurityHeadersConfig: Match.objectLike({
            ReferrerPolicy: Match.objectLike({
              ReferrerPolicy: 'no-referrer',
              Override: true,
            }),
          }),
          CustomHeadersConfig: Match.objectLike({
            Items: Match.arrayWith([
              Match.objectLike({
                Header: 'X-Robots-Tag',
                Value: 'noindex, nofollow',
              }),
            ]),
          }),
        }),
      });
    });
  });

  describe('PageMaintenance', () => {
    it('PageMaintenance LambdaはS3への読み取りがmeta/配下に絞られ、削除はpages/・meta/両方に、KVSへは必要な操作だけを許可する', () => {
      const template = synth();

      // PageMaintenance(share投影 + cleanup)本体Lambdaに加えて、S3通知配線用のCDK管理Lambda(BucketNotificationsHandler)が1つ増える
      template.resourceCountIs('AWS::Lambda::Function', 4);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs22.x',
        Architectures: ['arm64'],
        ReservedConcurrentExecutions: 1,
        MemorySize: 1024,
      });

      const policies = Object.values(template.findResources('AWS::IAM::Policy'));
      const statements = policies.flatMap(
        (p) => (p.Properties?.PolicyDocument?.Statement ?? []) as Array<Record<string, unknown>>,
      );

      const kvsStatement = statements.find(
        (st) =>
          Array.isArray(st.Action) &&
          (st.Action as string[]).some((a) => a.startsWith('cloudfront-keyvaluestore:')),
      );
      expect(kvsStatement?.Action).toEqual(
        expect.arrayContaining([
          'cloudfront-keyvaluestore:DescribeKeyValueStore',
          'cloudfront-keyvaluestore:ListKeys',
          'cloudfront-keyvaluestore:UpdateKeys',
          // 存在しないキーのdeleteがResourceNotFoundExceptionになったときの存在確認に使う
          'cloudfront-keyvaluestore:GetKey',
        ]),
      );
      // PutKey/DeleteKeyのような未使用の単発操作は要求しない
      expect(kvsStatement?.Action).not.toEqual(
        expect.arrayContaining(['cloudfront-keyvaluestore:PutKey']),
      );

      const s3GetStatement = statements.find(
        (st) =>
          st.Action === 's3:GetObject' ||
          (Array.isArray(st.Action) && st.Action.includes('s3:GetObject')),
      );
      const s3GetResource = s3GetStatement?.Resource as
        { 'Fn::Join'?: [string, unknown[]] } | undefined;
      // ページ成果物本体は読ませず、meta/ 配下だけに絞られている(GetObjectはpages/*を含まない)
      expect(s3GetResource?.['Fn::Join']?.[1]).toContain('/meta/*');
      expect(JSON.stringify(s3GetResource)).not.toContain('/pages/*');

      const s3DeleteStatement = statements.find(
        (st) =>
          st.Action === 's3:DeleteObject' ||
          (Array.isArray(st.Action) && st.Action.includes('s3:DeleteObject')),
      );
      // 期限切れ削除のため、削除だけはpages/*・meta/*の両方に許可する
      expect(JSON.stringify(s3DeleteStatement?.Resource)).toContain('/pages/*');
      expect(JSON.stringify(s3DeleteStatement?.Resource)).toContain('/meta/*');

      const s3ListStatement = statements.find(
        (st) =>
          st.Action === 's3:ListBucket' ||
          (Array.isArray(st.Action) && st.Action.includes('s3:ListBucket')),
      );
      expect(s3ListStatement?.Condition).toMatchObject({
        StringLike: { 's3:prefix': ['meta/*', 'pages/*'] },
      });
    });

    it('metadataの作成・削除のS3通知と、EventBridgeの1時間ごとのRule(安全網 + cleanup)の両方で起動する', () => {
      const template = synth();

      template.resourceCountIs('AWS::Events::Rule', 1);
      template.hasResourceProperties('AWS::Events::Rule', {
        ScheduleExpression: 'rate(1 hour)',
      });

      // pagesバケットのS3通知がprefix=meta/・suffix=.jsonのCreated/RemovedをPageMaintenanceへ流す
      const notifications = Object.values(template.findResources('Custom::S3BucketNotifications'));
      expect(notifications).toHaveLength(1);
      const notificationConfig = notifications[0]?.Properties?.NotificationConfiguration as
        { LambdaFunctionConfigurations?: Array<Record<string, unknown>> } | undefined;
      const lambdaConfigs = notificationConfig?.LambdaFunctionConfigurations ?? [];
      expect(lambdaConfigs).toHaveLength(2);
      const events = lambdaConfigs.map((c) => c.Events).sort();
      expect(events).toEqual([['s3:ObjectCreated:*'], ['s3:ObjectRemoved:*']]);
      for (const config of lambdaConfigs) {
        const rules = (
          config.Filter as { Key?: { FilterRules?: Array<{ Name: string; Value: string }> } }
        )?.Key?.FilterRules;
        expect(rules).toEqual(
          expect.arrayContaining([
            { Name: 'prefix', Value: 'meta/' },
            { Name: 'suffix', Value: '.json' },
          ]),
        );
      }
    });

    it('非同期呼び出しは5分で打ち切り、リトライは1回だけにする(古い呼び出しを溜め込まず安全網に任せる)', () => {
      const template = synth();

      template.hasResourceProperties('AWS::Lambda::EventInvokeConfig', {
        MaximumEventAgeInSeconds: 300,
        MaximumRetryAttempts: 1,
      });
    });

    it('通知先を運用しないためアラームは持たない', () => {
      const template = synth();

      template.resourceCountIs('AWS::CloudWatch::Alarm', 0);
      template.resourceCountIs('AWS::SNS::Topic', 0);
      template.resourceCountIs('AWS::SNS::Subscription', 0);
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

      expect(appDistribution?.Properties?.DistributionConfig?.HttpVersion).toBe('http2and3');

      // /assets/* はハッシュ付きファイル名なのでrouter関数は不要、長期キャッシュのヘッダだけ出し分ける
      const assetsBehavior = (
        appDistribution?.Properties?.DistributionConfig?.CacheBehaviors as
          Array<{ PathPattern?: string; FunctionAssociations?: unknown }> | undefined
      )?.find((behavior) => behavior.PathPattern === '/assets/*');
      expect(assetsBehavior).toBeDefined();
      expect(assetsBehavior?.FunctionAssociations).toBeUndefined();

      const responseHeadersPolicies = Object.values(
        template.findResources('AWS::CloudFront::ResponseHeadersPolicy'),
      );
      const cacheControlValues = responseHeadersPolicies
        .map(
          (policy) =>
            (
              policy.Properties?.ResponseHeadersPolicyConfig?.CustomHeadersConfig?.Items as
                Array<{ Header?: string; Value?: string }> | undefined
            )?.find((header) => header.Header === 'Cache-Control')?.Value,
        )
        .filter((value): value is string => value !== undefined);
      expect(cacheControlValues).toEqual(
        expect.arrayContaining(['no-cache', 'public, max-age=31536000, immutable']),
      );

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
