import { getSignedCookies } from '@aws-sdk/cloudfront-signer';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { createHandler } from './handler.js';

const USER_POOL_ID = requireEnv('USER_POOL_ID');
const WEB_CLIENT_ID = requireEnv('WEB_CLIENT_ID');
const PAGES_DOMAIN = requireEnv('PAGES_DOMAIN');
const KEY_PAIR_ID = requireEnv('KEY_PAIR_ID');
const PRIVATE_KEY_PARAMETER = requireEnv('PRIVATE_KEY_PARAMETER');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が未設定です`);
  }
  return value;
}

const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: 'id',
  clientId: WEB_CLIENT_ID,
});

let privateKey: Promise<string> | undefined;

// 失敗したら次の呼び出しで読み直す
function loadPrivateKey(): Promise<string> {
  privateKey ??= new SSMClient({})
    .send(new GetParameterCommand({ Name: PRIVATE_KEY_PARAMETER, WithDecryption: true }))
    .then((output) => {
      const value = output.Parameter?.Value;
      if (!value) {
        throw new Error(`${PRIVATE_KEY_PARAMETER} が空です`);
      }
      return value;
    })
    .catch((error: unknown) => {
      privateKey = undefined;
      throw error;
    });
  return privateKey;
}

export const handler = createHandler({
  pagesDomain: PAGES_DOMAIN,
  verifyIdToken: async (idToken) => {
    const payload = await verifier.verify(idToken);
    return { email: String(payload.email ?? '') };
  },
  signCookies: async (policy) => {
    const cookies = getSignedCookies({
      keyPairId: KEY_PAIR_ID,
      privateKey: await loadPrivateKey(),
      policy,
    });
    return {
      'CloudFront-Policy': cookies['CloudFront-Policy'] ?? '',
      'CloudFront-Signature': cookies['CloudFront-Signature'],
      'CloudFront-Key-Pair-Id': cookies['CloudFront-Key-Pair-Id'],
    };
  },
});
