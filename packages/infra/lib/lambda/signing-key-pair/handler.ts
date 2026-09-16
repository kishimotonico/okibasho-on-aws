import { generateKeyPairSync } from 'node:crypto';
import type { CdkCustomResourceEvent, CdkCustomResourceResponse } from 'aws-lambda';

export interface KeyPairParameters {
  put(name: string, value: string, secure: boolean): Promise<void>;
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
 * PhysicalResourceId はパラメータ名のプレフィックス。鍵の値はログに出さない
 */
export function createHandler(
  parameters: KeyPairParameters,
  generate: () => KeyPair = generateRsaKeyPair,
) {
  return async (event: CdkCustomResourceEvent): Promise<CdkCustomResourceResponse> => {
    const prefix = String(event.ResourceProperties['ParameterPrefix']);
    const publicKeyName = `${prefix}/public-key`;
    const privateKeyName = `${prefix}/private-key`;
    console.log(JSON.stringify({ requestType: event.RequestType, prefix }));

    switch (event.RequestType) {
      case 'Create':
        return issue();
      case 'Update': {
        const old = event.OldResourceProperties;
        // プレフィックスが変わると PhysicalResourceId も変わり、古い方は CloudFormation が Delete する
        if (
          old['ParameterPrefix'] !== event.ResourceProperties['ParameterPrefix'] ||
          old['Generation'] !== event.ResourceProperties['Generation']
        ) {
          return issue();
        }
        return {
          PhysicalResourceId: prefix,
          Data: { PublicKeyPem: await parameters.get(publicKeyName) },
        };
      }
      case 'Delete': {
        const deleting = String(event.PhysicalResourceId);
        await Promise.all(
          [`${deleting}/public-key`, `${deleting}/private-key`].map((name) =>
            parameters.delete(name).catch((error: unknown) => {
              if (!(error instanceof Error && error.name === 'ParameterNotFound')) {
                throw error;
              }
            }),
          ),
        );
        return { PhysicalResourceId: deleting };
      }
    }

    async function issue(): Promise<CdkCustomResourceResponse> {
      const keyPair = generate();
      await parameters.put(privateKeyName, keyPair.privateKeyPem, true);
      await parameters.put(publicKeyName, keyPair.publicKeyPem, false);
      return { PhysicalResourceId: prefix, Data: { PublicKeyPem: keyPair.publicKeyPem } };
    }
  };
}
