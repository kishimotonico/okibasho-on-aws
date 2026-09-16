import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ArnFormat, CustomResource, Duration, Stack } from 'aws-cdk-lib';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export interface SigningKeyPairProps {
  /** SSM パラメータ名のプレフィックス。`/` で始める */
  readonly parameterPrefix: string;
  /** 鍵ペアの世代。値を変えると CloudFormation がこのリソースを置き換え、新しい鍵ペアを作って古い世代を消す */
  readonly generation: number;
}

/**
 * CloudFront の Signed Cookie 用 RSA 鍵ペア。AWS に生成するリソースが無いのでカスタムリソースで作る。
 * 秘密鍵は SSM の SecureString にだけ置き、公開鍵 PEM を属性で返す
 */
export class SigningKeyPair extends Construct {
  readonly publicKeyPem: string;
  readonly privateKeyParameterName: string;

  constructor(scope: Construct, id: string, props: SigningKeyPairProps) {
    super(scope, id);
    const here = dirname(fileURLToPath(import.meta.url));

    const onEvent = new NodejsFunction(this, 'Function', {
      entry: join(here, '../lambda/signing-key-pair/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(30),
      bundling: {
        externalModules: [],
        // PageMaintenance と同じく、リポジトリ直下から esbuild が見えるようにする
        environment: {
          PATH: `${join(here, '../../node_modules/.bin')}:${process.env.PATH ?? ''}`,
        },
      },
      description: 'pages: Signed Cookie の鍵ペアを生成して SSM に置く',
    });
    onEvent.addToRolePolicy(
      new PolicyStatement({
        actions: ['ssm:PutParameter', 'ssm:GetParameter', 'ssm:DeleteParameter'],
        resources: [
          Stack.of(this).formatArn({
            service: 'ssm',
            resource: 'parameter',
            resourceName: `${props.parameterPrefix.replace(/^\//, '')}/*`,
            arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
          }),
        ],
      }),
    );

    // generation ごとに別のパラメータにし、作った鍵ペアは書き換えない
    const generationPrefix = `${props.parameterPrefix}/${props.generation}`;
    const provider = new Provider(this, 'Provider', { onEventHandler: onEvent });
    const resource = new CustomResource(this, 'Resource', {
      serviceToken: provider.serviceToken,
      resourceType: 'Custom::SigningKeyPair',
      properties: { ParameterPrefix: generationPrefix },
    });

    this.publicKeyPem = resource.getAttString('PublicKeyPem');
    this.privateKeyParameterName = `${generationPrefix}/private-key`;
  }
}
