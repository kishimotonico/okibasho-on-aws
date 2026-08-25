import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  AccountRecovery,
  Mfa,
  OAuthScope,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
  UserPoolDomain,
} from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

/**
 * CLIのlocalhostコールバックで使うポート。
 * CognitoはコールバックURLをポートまで含めて完全一致で照合する。
 * 使用中なら CLI はフォールバックせず終了する。
 */
export const CLI_CALLBACK_PORTS = [8976] as const;

const WEB_LOCAL_CALLBACK_URL = 'http://localhost:3000/auth/callback';
const WEB_LOCAL_LOGOUT_URL = 'http://localhost:3000';

export interface AuthProps {
  /** 管理アプリのドメイン (例: app.share.example.jp)。未設定ならlocalhostのみ */
  readonly appDomain?: string;
  /** 管理UI用 CloudFront のデフォルトドメイン。Hosted UI のコールバック登録に使う */
  readonly appDistributionDomain?: string;
}

/**
 * Cognito User Pool + Hosted UI。
 * 当面はローカルユーザー(管理者作成)で運用し、Google IdPは後付けする。
 */
export class Auth extends Construct {
  readonly userPool: UserPool;
  readonly webClient: UserPoolClient;
  readonly cliClient: UserPoolClient;
  readonly hostedUiDomain: UserPoolDomain;

  constructor(scope: Construct, id: string, props: AuthProps = {}) {
    super(scope, id);

    this.userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      // 当面のローカルユーザーは繋ぎ。本来の認証はGoogle IdPに寄せる予定のためMFAは無効
      mfa: Mfa.OFF,
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      // スタック削除でユーザーが消えると作り直しになる
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const oauthScopes = [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE];
    const tokenValidity = {
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      // CLIが毎回ブラウザログインしなくて済むようにする
      refreshTokenValidity: Duration.days(30),
    };

    const webCallbackUrls = [WEB_LOCAL_CALLBACK_URL];
    const webLogoutUrls = [WEB_LOCAL_LOGOUT_URL];
    if (props.appDomain) {
      webCallbackUrls.push(`https://${props.appDomain}/auth/callback`);
      webLogoutUrls.push(`https://${props.appDomain}`);
    }
    if (props.appDistributionDomain) {
      webCallbackUrls.push(`https://${props.appDistributionDomain}/auth/callback`);
      webLogoutUrls.push(`https://${props.appDistributionDomain}`);
    }

    this.webClient = this.userPool.addClient('WebClient', {
      generateSecret: false,
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
        },
        scopes: oauthScopes,
        callbackUrls: webCallbackUrls,
        logoutUrls: webLogoutUrls,
      },
      ...tokenValidity,
    });

    const cliCallbackUrls = CLI_CALLBACK_PORTS.map((port) => `http://localhost:${port}/callback`);

    this.cliClient = this.userPool.addClient('CliClient', {
      generateSecret: false,
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
        },
        scopes: oauthScopes,
        callbackUrls: cliCallbackUrls,
      },
      ...tokenValidity,
    });

    // prefixはAWS全体で一意。アカウントIDを混ぜて他環境との衝突を避ける
    const domainPrefix = `page-share-${Stack.of(this).account}`;

    this.hostedUiDomain = this.userPool.addDomain('HostedUiDomain', {
      cognitoDomain: {
        domainPrefix,
      },
    });
  }
}
