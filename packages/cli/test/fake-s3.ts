export { FakeS3Store } from '../../core/test/fake-s3.js';

export function makeIdToken(email: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ email })).toString('base64url');
  return `${header}.${payload}.sig`;
}

export const TEST_CONFIG = {
  issuer: 'https://issuer.example.test',
  clientId: 'cli-client',
  identityPoolId: 'ap-northeast-1:pool-id',
  userPoolId: 'ap-northeast-1_pool',
  region: 'ap-northeast-1',
  bucket: 'pages-bucket',
  pagesBaseUrl: 'https://pages.example.test',
} as const;

export const TEST_EMAIL = 'tanaka@example.jp';
