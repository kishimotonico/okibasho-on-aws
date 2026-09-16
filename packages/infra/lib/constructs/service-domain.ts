import { Certificate, type ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
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
import type { ServiceDomainConfig } from '../config.js';

/** Distribution に付ける独自ドメイン */
export interface CustomDomain {
  readonly domainName: string;
  readonly certificate: ICertificate;
}

/**
 * 独自ドメイン。pages はサービスドメインそのもの、app は `app.` サブドメインに置く。
 * 証明書と Hosted Zone は手で用意したものを参照するだけで、ここでは作らない。
 */
export class ServiceDomain extends Construct {
  readonly pages: CustomDomain;
  readonly app: CustomDomain;
  private readonly hostedZone?: IHostedZone;

  constructor(scope: Construct, id: string, props: ServiceDomainConfig) {
    super(scope, id);

    const certificate = Certificate.fromCertificateArn(this, 'Certificate', props.certificateArn);
    this.pages = { domainName: props.domainName, certificate };
    this.app = { domainName: `app.${props.domainName}`, certificate };

    if (props.hostedZone) {
      this.hostedZone = HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
        hostedZoneId: props.hostedZone.id,
        zoneName: props.hostedZone.name,
      });
    }
  }

  /** Hosted Zone が無ければ何もしない。レコードは外部 DNS に手で置く */
  addAliasRecords(distributions: { pages: IDistribution; app: IDistribution }): void {
    if (!this.hostedZone) {
      return;
    }
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
