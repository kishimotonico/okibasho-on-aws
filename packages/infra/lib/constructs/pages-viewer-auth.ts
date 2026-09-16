import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Duration } from 'aws-cdk-lib';
import { KeyGroup, PublicKey } from 'aws-cdk-lib/aws-cloudfront';
import type { UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { Architecture, FunctionUrlAuthType, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import type { AppDelivery } from './app-delivery.js';
import type { PagesStorage } from './pages-storage.js';

// 鍵ペアは手で作って置く。名前は README の手順と揃える
const PUBLIC_KEY_PARAMETER = '/okibasho/pages-signing/public-key';
const PRIVATE_KEY_PARAMETER = '/okibasho/pages-signing/private-key';

export interface PagesViewerAuthProps {
  readonly userPool: UserPool;
  readonly webClient: UserPoolClient;
  /** pages のホスト名。Cookie の Domain と署名する Resource になる */
  readonly pagesDomainName: string;
  /** /auth/* を足す先 */
  readonly appDelivery: AppDelivery;
  /** 403.html を置く先 */
  readonly pagesStorage: PagesStorage;
}

/**
 * 内部ページ(/p/*)を Signed Cookie で閉じる。親ドメイン Cookie が要るので独自ドメイン設定時だけ作る。
 * Key Group は PagesDelivery のデフォルトビヘイビアに渡す。
 */
export class PagesViewerAuth extends Construct {
  readonly keyGroup: KeyGroup;

  constructor(scope: Construct, id: string, props: PagesViewerAuthProps) {
    super(scope, id);
    const here = dirname(fileURLToPath(import.meta.url));

    const publicKey = new PublicKey(this, 'PublicKey', {
      encodedKey: StringParameter.valueForStringParameter(this, PUBLIC_KEY_PARAMETER),
      comment: '内部ページの Signed Cookie 検証用',
    });
    this.keyGroup = new KeyGroup(this, 'KeyGroup', { items: [publicKey] });

    const issuer = new NodejsFunction(this, 'CookieIssuerFunction', {
      entry: join(here, '../lambda/pages-cookie/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(10),
      memorySize: 512,
      environment: {
        USER_POOL_ID: props.userPool.userPoolId,
        WEB_CLIENT_ID: props.webClient.userPoolClientId,
        PAGES_DOMAIN: props.pagesDomainName,
        KEY_PAIR_ID: publicKey.publicKeyId,
        PRIVATE_KEY_PARAMETER,
      },
      bundling: {
        externalModules: [],
        // PageMaintenance と同じく、リポジトリ直下から esbuild が見えるようにする
        environment: {
          PATH: `${join(here, '../../node_modules/.bin')}:${process.env.PATH ?? ''}`,
        },
      },
      description: 'pages: id_token を検証して /p/* の Signed Cookie を発行する',
    });
    StringParameter.fromSecureStringParameterAttributes(this, 'PrivateKey', {
      parameterName: PRIVATE_KEY_PARAMETER,
    }).grantRead(issuer);

    // CloudFront 経由でしか呼べないよう IAM 認証にし、app Distribution の OAC で署名させる
    const issuerUrl = issuer.addFunctionUrl({ authType: FunctionUrlAuthType.AWS_IAM });
    props.appDelivery.addCookieIssuer(issuerUrl);

    const appOrigin = `https://${props.appDelivery.domainName}`;
    props.pagesStorage.addErrorPage(
      '403.html',
      readFileSync(join(here, '../static/errors/403.html'), 'utf-8').replaceAll(
        '__APP_ORIGIN__',
        appOrigin,
      ),
    );
  }
}
