import { DEFAULT_RETENTION_DAYS } from '@page-share/shared';
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

type DistributionResource = {
  Properties?: {
    DistributionConfig?: {
      Comment?: string;
      DefaultRootObject?: string;
      CustomErrorResponses?: unknown;
      DefaultCacheBehavior?: {
        FunctionAssociations?: Array<{ EventType?: string }>;
      };
      CacheBehaviors?: Array<{
        PathPattern?: string;
        OriginRequestPolicyId?: string;
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

describe('PageShareStack', () => {
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
      }

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

    it('CloudFrontから読めるのは pages/ 配下だけに絞られている', () => {
      const template = synth();

      const policies = Object.values(template.findResources('AWS::S3::BucketPolicy'));
      const statements = policies.flatMap(
        (p) => (p.Properties?.PolicyDocument?.Statement ?? []) as Array<Record<string, unknown>>,
      );

      const denyGet = statements.find((st) => st.Sid === 'DenyCloudFrontGetOutsidePagesPrefix');
      expect(denyGet?.Effect).toBe('Deny');
      expect(denyGet?.Action).toBe('s3:GetObject');
      // NotResource で pages/ 以外を落とす。Resource側で許可を絞るとCDKの自動生成policyと噛み合わない
      expect(denyGet?.NotResource).toBeDefined();
      expect(denyGet?.Resource).toBeUndefined();

      const denyList = statements.find((st) => st.Sid === 'DenyCloudFrontListOutsidePagesPrefix');
      expect(denyList?.Effect).toBe('Deny');
      // s3:prefix が無いリクエスト(存在しないkeyの404判定)まで巻き込まないための Null 条件
      expect(denyList?.Condition).toMatchObject({ Null: { 's3:prefix': 'false' } });
    });

    it('temporaryタグの付いたオブジェクトだけをLifecycleで物理削除する', () => {
      const template = synth();

      const withLifecycle = Object.values(template.findResources('AWS::S3::Bucket')).filter(
        (bucket) => bucket.Properties?.LifecycleConfiguration !== undefined,
      );
      // Lifecycleを持つのはユーザー成果物が入るpages bucketだけ
      expect(withLifecycle).toHaveLength(1);

      const rules = withLifecycle[0]?.Properties?.LifecycleConfiguration?.Rules as
        | Array<{
            Status?: string;
            ExpirationInDays?: number;
            TagFilters?: Array<{ Key?: string; Value?: string }>;
            Prefix?: string;
          }>
        | undefined;
      expect(rules).toHaveLength(1);
      expect(rules?.[0]?.Status).toBe('Enabled');
      expect(rules?.[0]?.TagFilters).toEqual([{ Key: 'retention', Value: 'temporary' }]);
      // prefixで絞ると permanent に変えたページまで巻き込むので、絞りはタグだけ
      expect(rules?.[0]?.Prefix).toBeUndefined();
      // 論理期限(30日)より後であること。猶予を潰すと期限切れページを救えなくなる
      expect(rules?.[0]?.ExpirationInDays).toBeGreaterThan(DEFAULT_RETENTION_DAYS);
    });

    it('Web UIからのpresigned PUTのためにCORSでPUTだけ許可する', () => {
      const template = synth();

      const withCors = Object.values(template.findResources('AWS::S3::Bucket')).filter(
        (bucket) => bucket.Properties?.CorsConfiguration !== undefined,
      );
      // CORSを許すのはアップロード先のpages bucketだけ。UI用bucketには要らない
      expect(withCors).toHaveLength(1);

      const rules = withCors[0]?.Properties?.CorsConfiguration?.CorsRules as
        Array<{ AllowedMethods?: string[]; AllowedOrigins?: unknown[] }> | undefined;
      expect(rules).toHaveLength(1);
      expect(rules?.[0]?.AllowedMethods).toEqual(['PUT']);
      expect(rules?.[0]?.AllowedOrigins).toContain('http://localhost:3000');
    });
  });

  describe('PagesDelivery', () => {
    it('CloudFront Distribution + OAC、ListBucket許可、viewer request関数が付く', () => {
      const template = synth();

      template.resourceCountIs('AWS::CloudFront::Distribution', 2);
      template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 2);

      const pagesDistribution = findDistributionByComment(template, 'untrusted pages配信');
      expect(pagesDistribution).toBeDefined();

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
        DistributionConfig: Match.objectLike({
          Comment: 'untrusted pages配信',
          DefaultCacheBehavior: Match.objectLike({
            FunctionAssociations: Match.arrayWith([
              Match.objectLike({
                EventType: 'viewer-request',
              }),
            ]),
          }),
        }),
      });
    });
  });

  describe('AppDelivery', () => {
    it('管理UI用Distribution、SPAシェル、/api/* behavior、ListBucket許可', () => {
      const template = synth();

      const appDistribution = findDistributionByComment(template, 'trusted 管理UI配信');
      expect(appDistribution).toBeDefined();

      expect(appDistribution?.Properties?.DistributionConfig?.DefaultRootObject).toBe(
        '_shell.html',
      );

      // SPAのディープリンクはviewer request関数で寄せる。CustomErrorResponseは
      // Distribution全体に効き、/api/* の404までSPAシェル(200)に化けるため使わない
      expect(appDistribution?.Properties?.DistributionConfig?.CustomErrorResponses).toBeUndefined();
      expect(
        appDistribution?.Properties?.DistributionConfig?.DefaultCacheBehavior?.FunctionAssociations,
      ).toEqual(expect.arrayContaining([expect.objectContaining({ EventType: 'viewer-request' })]));

      const apiBehavior = appDistribution?.Properties?.DistributionConfig?.CacheBehaviors?.find(
        (behavior) => behavior.PathPattern === '/api/*',
      );
      expect(apiBehavior?.OriginRequestPolicyId).toBeDefined();
      // /api/* にSPA寄せの関数が掛かっていないこと
      expect(apiBehavior?.FunctionAssociations).toBeUndefined();

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

      const webClient = Object.values(template.findResources('AWS::Cognito::UserPoolClient')).find(
        (client) =>
          client.Properties?.CallbackURLs?.includes('http://localhost:3000/auth/callback'),
      );
      const callbackUrls = webClient?.Properties?.CallbackURLs as unknown[] | undefined;
      expect(callbackUrls).toEqual(expect.arrayContaining(['http://localhost:3000/auth/callback']));

      const distributionCallback = callbackUrls?.find(
        (url): url is { 'Fn::Join': [string, unknown[]] } =>
          typeof url === 'object' && url !== null && 'Fn::Join' in url,
      );
      expect(distributionCallback).toBeDefined();
      const joinParts = distributionCallback!['Fn::Join'];
      expect(joinParts[0]).toBe('');
      expect(joinParts[1]).toEqual(expect.arrayContaining(['https://', '/auth/callback']));
      const getAtt = (joinParts[1] as unknown[]).find(
        (part) => typeof part === 'object' && part !== null && 'Fn::GetAtt' in part,
      ) as { 'Fn::GetAtt': [string, string] } | undefined;
      expect(getAtt?.['Fn::GetAtt'][0]).toMatch(/AppDeliveryDistribution/);
      expect(getAtt?.['Fn::GetAtt'][1]).toBe('DomainName');
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

      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: 'GET /api/pages',
        AuthorizationType: 'JWT',
      });

      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: 'GET /api/pages/{slug}',
        AuthorizationType: 'JWT',
      });

      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: 'PATCH /api/pages/{slug}',
        AuthorizationType: 'JWT',
      });

      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: 'DELETE /api/pages/{slug}',
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
              Action: Match.arrayWith(['s3:DeleteObject*', 's3:PutObject', 's3:PutObjectTagging']),
            }),
          ]),
        },
      });
    });
  });
});
