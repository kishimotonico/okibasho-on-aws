import { Duration, Lazy, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { CfnIdentityPoolPrincipalTag } from 'aws-cdk-lib/aws-cognito';
import { IdentityPool, UserPoolAuthenticationProvider } from 'aws-cdk-lib/aws-cognito-identitypool';
import {
  AccountRecovery,
  Mfa,
  OAuthScope,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
  UserPoolDomain,
} from 'aws-cdk-lib/aws-cognito';
import { Effect, FederatedPrincipal, PolicyStatement, Role } from 'aws-cdk-lib/aws-iam';
import type { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * CLIの127.0.0.1コールバックで使うポート。
 * CognitoはコールバックURLをポートまで含めて完全一致で照合する。
 * 使用中なら CLI はフォールバックせず終了する。
 */
export const CLI_CALLBACK_PORTS = [8976, 8977, 8978] as const;

const WEB_LOCAL_CALLBACK_URL = 'http://localhost:3000/callback';
const WEB_LOCAL_LOGOUT_URL = 'http://localhost:3000';

export interface AuthProps {
  /** 管理UIのホスト名 (例: app.okibasho.example.com)。Hosted UI のコールバック登録に使う */
  readonly appDomainName: string;
  /** pages bucket。authenticated role の S3 ポリシーに使う */
  readonly pagesBucket: IBucket;
}

/**
 * Cognito User Pool + Identity Pool + Hosted UI。
 * 当面はローカルユーザー(管理者作成)で運用し、Google IdPは後付けする。
 */
export class Auth extends Construct {
  readonly userPool: UserPool;
  readonly webClient: UserPoolClient;
  readonly cliClient: UserPoolClient;
  readonly hostedUiDomain: UserPoolDomain;
  readonly identityPool: IdentityPool;
  readonly authenticatedRole: Role;
  /** Identity Pool の principal tag 設定に使う User Pool プロバイダ名 */
  readonly identityProviderName: string;

  constructor(scope: Construct, id: string, props: AuthProps) {
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
      // 使わなくなったときにスタックごと消せるようにする。作り直しは想定しない
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const oauthScopes = [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE];
    const tokenValidity = {
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      // CLIが毎回ブラウザログインしなくて済むようにする
      refreshTokenValidity: Duration.days(30),
    };

    const webCallbackUrls = [WEB_LOCAL_CALLBACK_URL, `https://${props.appDomainName}/callback`];
    const webLogoutUrls = [WEB_LOCAL_LOGOUT_URL, `https://${props.appDomainName}`];

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

    const cliCallbackUrls = CLI_CALLBACK_PORTS.map((port) => `http://127.0.0.1:${port}/callback`);

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

    const webPoolProvider = new UserPoolAuthenticationProvider({
      userPool: this.userPool,
      userPoolClient: this.webClient,
    });
    const cliPoolProvider = new UserPoolAuthenticationProvider({
      userPool: this.userPool,
      userPoolClient: this.cliClient,
    });

    let identityPoolId = '';

    this.authenticatedRole = new Role(this, 'AuthenticatedRole', {
      description: 'Identity Pool authenticated users',
      assumedBy: new FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': Lazy.string({ produce: () => identityPoolId }),
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
    });
    this.authenticatedRole.assumeRolePolicy?.addStatements(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [
          new FederatedPrincipal(
            'cognito-identity.amazonaws.com',
            {
              StringEquals: {
                'cognito-identity.amazonaws.com:aud': Lazy.string({
                  produce: () => identityPoolId,
                }),
              },
              'ForAnyValue:StringLike': {
                'cognito-identity.amazonaws.com:amr': 'authenticated',
              },
            },
            'sts:TagSession',
          ),
        ],
        actions: ['sts:TagSession'],
      }),
    );

    this.identityPool = new IdentityPool(this, 'IdentityPool', {
      allowUnauthenticatedIdentities: false,
      authenticatedRole: this.authenticatedRole,
      authenticationProviders: {
        userPools: [webPoolProvider, cliPoolProvider],
      },
    });
    identityPoolId = this.identityPool.identityPoolId;

    this.authenticatedRole.addToPolicy(
      new PolicyStatement({
        sid: 'ListOwnPages',
        effect: Effect.ALLOW,
        actions: ['s3:ListBucket'],
        resources: [props.pagesBucket.bucketArn],
        conditions: {
          StringLike: {
            's3:prefix': ['pages/${aws:PrincipalTag/email}/*', 'meta/${aws:PrincipalTag/email}/*'],
          },
        },
      }),
    );
    this.authenticatedRole.addToPolicy(
      new PolicyStatement({
        sid: 'ReadWriteOwnPages',
        effect: Effect.ALLOW,
        actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
        resources: [
          props.pagesBucket.arnForObjects('pages/${aws:PrincipalTag/email}/*'),
          props.pagesBucket.arnForObjects('meta/${aws:PrincipalTag/email}/*'),
        ],
      }),
    );

    const webProviderConfig = webPoolProvider.bind(this, this.identityPool);
    this.identityProviderName = webProviderConfig.providerName;

    new CfnIdentityPoolPrincipalTag(this, 'PrincipalTag', {
      identityPoolId: this.identityPool.identityPoolId,
      identityProviderName: webProviderConfig.providerName,
      principalTags: {
        email: 'email',
      },
      useDefaults: false,
    });

    const cliProviderConfig = cliPoolProvider.bind(this, this.identityPool);
    if (cliProviderConfig.providerName !== webProviderConfig.providerName) {
      new CfnIdentityPoolPrincipalTag(this, 'CliPrincipalTag', {
        identityPoolId: this.identityPool.identityPoolId,
        identityProviderName: cliProviderConfig.providerName,
        principalTags: {
          email: 'email',
        },
        useDefaults: false,
      });
    }

    // prefixはAWS全体で一意。アカウントIDを混ぜて他環境との衝突を避ける
    const domainPrefix = `okibasho-${Stack.of(this).account}`;

    this.hostedUiDomain = this.userPool.addDomain('HostedUiDomain', {
      cognitoDomain: {
        domainPrefix,
      },
    });
  }
}
