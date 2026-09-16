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
  } = process.env;

  if (!emailDomain) {
    throw new Error(
      'EMAIL_DOMAIN が未設定です。packages/infra/.env.example を .env にコピーして埋めてください',
    );
  }
  if (!domainName && !hostedZoneId && !hostedZoneName) {
    return { emailDomain };
  }
  if (!domainName || !hostedZoneId || !hostedZoneName) {
    throw new Error(
      'SERVICE_DOMAIN / HOSTED_ZONE_ID / HOSTED_ZONE_NAME は 3 つそろえて設定してください',
    );
  }

  return {
    emailDomain,
    serviceDomain: { domainName, hostedZone: { id: hostedZoneId, name: hostedZoneName } },
  };
}
