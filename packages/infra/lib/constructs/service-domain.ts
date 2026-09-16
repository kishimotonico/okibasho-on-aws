import type { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import type { IDistribution } from 'aws-cdk-lib/aws-cloudfront';
import {
  AaaaRecord,
  ARecord,
  HostedZone,
  type IHostedZone,
  RecordTarget,
} from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import { appDomainName, type ServiceDomainConfig } from '../config.js';

/** Distribution に付ける独自ドメイン */
export interface CustomDomain {
  readonly domainName: string;
  readonly certificate: ICertificate;
}

export interface ServiceDomainProps extends ServiceDomainConfig {
  /** us-east-1 の証明書。SAN に pages と app を含む */
  readonly certificate: ICertificate;
}

/**
 * 独自ドメイン。pages はサービスドメインそのもの、app は `app.` サブドメインに置く。
 * Hosted Zone は参照するだけで、作るのは Alias レコードだけ
 */
export class ServiceDomain extends Construct {
  readonly pages: CustomDomain;
  readonly app: CustomDomain;
  private readonly hostedZone: IHostedZone;

  constructor(scope: Construct, id: string, props: ServiceDomainProps) {
    super(scope, id);

    this.pages = { domainName: props.domainName, certificate: props.certificate };
    this.app = { domainName: appDomainName(props.domainName), certificate: props.certificate };
    this.hostedZone = HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: props.hostedZone.id,
      zoneName: props.hostedZone.name,
    });
  }

  addAliasRecords(distributions: { pages: IDistribution; app: IDistribution }): void {
    const zone = this.hostedZone;

    // pages は IPv6 を無効にしているので A だけ
    new ARecord(this, 'PagesAliasRecord', {
      zone,
      recordName: this.pages.domainName,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distributions.pages)),
    });

    const appTarget = RecordTarget.fromAlias(new CloudFrontTarget(distributions.app));
    new ARecord(this, 'AppAliasRecord', {
      zone,
      recordName: this.app.domainName,
      target: appTarget,
    });
    new AaaaRecord(this, 'AppAliasRecordIpv6', {
      zone,
      recordName: this.app.domainName,
      target: appTarget,
    });
  }
}
