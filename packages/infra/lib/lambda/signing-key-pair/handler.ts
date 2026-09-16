import { generateKeyPairSync } from 'node:crypto';
import type { CdkCustomResourceEvent, CdkCustomResourceResponse } from 'aws-lambda';

export interface KeyPairParameters {
  /** 既にあれば失敗する（上書きしない） */
  put(name: string, value: string, secure: boolean): Promise<void>;
  /** 無ければ name が ParameterNotFound の例外 */
  get(name: string): Promise<string>;
  /** 無ければ name が ParameterNotFound の例外 */
  delete(name: string): Promise<void>;
}

export interface KeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
}

export function generateRsaKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

/**
 * CloudFront の Signed Cookie 用の鍵ペアを SSM に置き、公開鍵だけを返す。
 * 鍵ペアは generation ごとに不変で、PhysicalResourceId はその generation のプレフィックス。
 * generation が変わると PhysicalResourceId が変わり、古い方は CloudFormation が Delete を送る。
 * 鍵の値はログに出さない
 */
export function createHandler(
  parameters: KeyPairParameters,
  generate: () => KeyPair = generateRsaKeyPair,
) {
  return async (event: CdkCustomResourceEvent): Promise<CdkCustomResourceResponse> => {
    console.log(
      JSON.stringify({
        requestType: event.RequestType,
        prefix: event.ResourceProperties['ParameterPrefix'],
      }),
    );

    if (event.RequestType === 'Delete') {
      const prefix = String(event.PhysicalResourceId);
      await Promise.all(
        [`${prefix}/public-key`, `${prefix}/private-key`].map((name) =>
          parameters.delete(name).catch(ignoreNotFound),
        ),
      );
      return { PhysicalResourceId: prefix };
    }
    // Create も Update も同じ。同じ generation やロールバックで戻った generation は、置いてある鍵をそのまま返す
    return existingOrIssue(String(event.ResourceProperties['ParameterPrefix']));
  };

  async function existingOrIssue(prefix: string): Promise<CdkCustomResourceResponse> {
    const publicKeyPem = await parameters.get(`${prefix}/public-key`).catch(ignoreNotFound);
    return publicKeyPem
      ? { PhysicalResourceId: prefix, Data: { PublicKeyPem: publicKeyPem } }
      : issue(prefix);
  }

  async function issue(prefix: string): Promise<CdkCustomResourceResponse> {
    const keyPair = generate();
    // 公開鍵があれば秘密鍵もある、と言えるよう秘密鍵を先に置く
    await parameters.put(`${prefix}/private-key`, keyPair.privateKeyPem, true);
    await parameters.put(`${prefix}/public-key`, keyPair.publicKeyPem, false);
    return { PhysicalResourceId: prefix, Data: { PublicKeyPem: keyPair.publicKeyPem } };
  }
}

function ignoreNotFound(error: unknown): undefined {
  if (error instanceof Error && error.name === 'ParameterNotFound') {
    return undefined;
  }
  throw error;
}
