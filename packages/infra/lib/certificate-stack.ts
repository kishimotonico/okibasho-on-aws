import { Stack, type StackProps } from 'aws-cdk-lib';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import type { Construct } from 'constructs';
import { appDomainName, type ServiceDomainConfig } from './config.js';
import type { ServiceDomainProps } from './constructs/service-domain.js';

export interface CertificateStackProps extends StackProps {
  readonly serviceDomain: ServiceDomainConfig;
}

/**
 * CloudFront の証明書は us-east-1 にしか置けないので、証明書だけをこのスタックに分ける。
 * メインスタックへは弱参照（Fn::GetStackOutput）で渡る
 */
export class CertificateStack extends Stack {
  /** 証明書を付けた、ServiceDomain にそのまま渡せる設定 */
  readonly serviceDomain: ServiceDomainProps;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    const { domainName, hostedZone } = props.serviceDomain;
    const zone = HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: hostedZone.id,
      zoneName: hostedZone.name,
    });
    const certificate = new Certificate(this, 'Certificate', {
      domainName,
      subjectAlternativeNames: [appDomainName(domainName)],
      validation: CertificateValidation.fromDns(zone),
    });

    this.serviceDomain = { ...props.serviceDomain, certificate };
  }
}
