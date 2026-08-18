import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { PageShareStack } from '../lib/page-share-stack.js';

/**
 * スタック全体のsnapshot。
 *
 * config.env / config.domains が未設定でも synth が通ることを担保する意図もあるため、
 * ここでは config を読まず env なし（region-agnostic）で合成する。
 */
function synth(): Template {
  const app = new App();
  const stack = new PageShareStack(app, 'PageShare');
  return Template.fromStack(stack);
}

describe('PageShareStack', () => {
  it('テンプレートが意図せず変化していない', () => {
    expect(synth().toJSON()).toMatchSnapshot();
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
});
