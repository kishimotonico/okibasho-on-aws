/**
 * デプロイ設定。環境ごとに変わる値はリポジトリに持たず、環境変数から読む。
 * `packages/infra/.env`（git 管理外）に書くか、シェルの環境変数で渡す。項目は `.env.example` を参照。
 */
export interface Config {
  /** メールドメイン。S3 キーと CloudFront Function のドメイン補完に使う */
  emailDomain: string;
  /** 未設定なら CloudFront のデフォルトドメインで構築する */
  serviceDomain?: ServiceDomainConfig;
}

export interface ServiceDomainConfig {
  /** pages を置くサービスドメイン (例: okibasho.example.com)。app は `app.` を付けて導出する */
  domainName: string;
  /** us-east-1 の ACM 証明書。SAN に pages と app を含む */
  certificateArn: string;
  /** 渡したときだけ Alias レコードを作る。サービスドメインを含む共用のゾーンでよい */
  hostedZone?: { id: string; name: string };
}

export function loadConfig(): Config {
  const {
    EMAIL_DOMAIN: emailDomain,
    SERVICE_DOMAIN: domainName,
    CERTIFICATE_ARN: certificateArn,
    HOSTED_ZONE_ID: hostedZoneId,
    HOSTED_ZONE_NAME: hostedZoneName,
  } = process.env;

  if (!emailDomain) {
    throw new Error(
      'EMAIL_DOMAIN が未設定です。packages/infra/.env.example を .env にコピーして埋めてください',
    );
  }
  if (!domainName) {
    if (certificateArn || hostedZoneId || hostedZoneName) {
      throw new Error(
        'CERTIFICATE_ARN / HOSTED_ZONE_ID / HOSTED_ZONE_NAME は SERVICE_DOMAIN と一緒に設定してください',
      );
    }
    return { emailDomain };
  }
  if (!certificateArn) {
    throw new Error('SERVICE_DOMAIN を設定するときは CERTIFICATE_ARN も必要です');
  }
  if (Boolean(hostedZoneId) !== Boolean(hostedZoneName)) {
    throw new Error('HOSTED_ZONE_ID と HOSTED_ZONE_NAME は両方そろえて設定してください');
  }

  return {
    emailDomain,
    serviceDomain: {
      domainName,
      certificateArn,
      hostedZone:
        hostedZoneId && hostedZoneName ? { id: hostedZoneId, name: hostedZoneName } : undefined,
    },
  };
}
