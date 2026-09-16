/**
 * デプロイ設定。環境ごとに変わる値はリポジトリに持たず、環境変数から読む。
 * `packages/infra/.env`（git 管理外）に書くか、シェルの環境変数で渡す。項目は `.env.example` を参照。
 */
export interface Config {
  /** メールドメイン。S3 キーと CloudFront Function のドメイン補完に使う */
  emailDomain: string;
  /** 未設定なら CloudFront のデフォルトドメインで構築する */
  serviceDomain?: ServiceDomainConfig;
  /** 未設定なら Google IdP を作らない。client secret は Secrets Manager に置く */
  googleClientId?: string;
}

export interface ServiceDomainConfig {
  /** pages を置くサービスドメイン (例: okibasho.example.com) */
  domainName: string;
  /** サービスドメインを含む同一アカウントの Hosted Zone。共用のゾーンでよい */
  hostedZone: { id: string; name: string };
}

/** app はサービスドメインの `app.` サブドメインに置く */
export function appDomainName(serviceDomainName: string): string {
  return `app.${serviceDomainName}`;
}

export function loadConfig(): Config {
  const {
    EMAIL_DOMAIN: emailDomain,
    SERVICE_DOMAIN: domainName,
    HOSTED_ZONE_ID: hostedZoneId,
    HOSTED_ZONE_NAME: hostedZoneName,
    GOOGLE_CLIENT_ID: googleClientId,
  } = process.env;

  if (!emailDomain) {
    throw new Error(
      'EMAIL_DOMAIN が未設定です。packages/infra/.env.example を .env にコピーして埋めてください',
    );
  }
  const config: Config = { emailDomain, googleClientId };
  if (!domainName && !hostedZoneId && !hostedZoneName) {
    return config;
  }
  if (!domainName || !hostedZoneId || !hostedZoneName) {
    throw new Error(
      'SERVICE_DOMAIN / HOSTED_ZONE_ID / HOSTED_ZONE_NAME は 3 つそろえて設定してください',
    );
  }

  return {
    ...config,
    serviceDomain: { domainName, hostedZone: { id: hostedZoneId, name: hostedZoneName } },
  };
}
