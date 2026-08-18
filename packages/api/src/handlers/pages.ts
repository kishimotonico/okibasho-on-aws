import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client } from '@aws-sdk/client-s3';
import { createPage, defaultCreatePageDeps } from '../create-page.js';
import { createPageStore } from '../page-store.js';

// Lambdaの実行環境は複数リクエストで使い回されるため、クライアントはモジュールスコープに置く。
// ハンドラ内で作ると毎回コネクションプールを作り直すことになる。
const s3 = new S3Client({});

/**
 * /api/pages 系のハンドラ。
 *
 * 実装対象:
 *   POST   /api/pages           ページ作成 + presigned PUT URL 発行
 *   GET    /api/pages           My Pages 一覧
 *   GET    /api/pages/{id}      ページ取得
 *   PATCH  /api/pages/{id}      slug / retention 変更
 *   DELETE /api/pages/{id}      削除
 *
 * JWT の検証は API Gateway の JWT Authorizer が行うので、
 * ここでは claims を信頼して owner 確認だけ行う。
 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method;

  if (method !== 'POST') {
    return jsonResponse(405, {
      error: {
        code: 'method_not_allowed',
        message: `${method} はサポートされていません`,
      },
    });
  }

  const claims = event.requestContext.authorizer.jwt.claims;
  const sub = claims['sub'];
  if (typeof sub !== 'string' || sub.length === 0) {
    console.log('page_create_failed', { errorCode: 'unauthorized' });
    return jsonResponse(401, {
      error: {
        code: 'unauthorized',
        message: '認証情報が不足しています',
      },
    });
  }

  const email = typeof claims['email'] === 'string' ? claims['email'] : '';

  let body: unknown;
  try {
    body = event.body ? JSON.parse(event.body) : null;
  } catch {
    console.log('page_create_failed', { errorCode: 'invalid_json', ownerSub: sub });
    return jsonResponse(400, {
      error: {
        code: 'invalid_json',
        message: 'リクエスト body は有効な JSON である必要があります',
      },
    });
  }

  const bucket = process.env['PAGES_BUCKET'];
  const pagesBaseUrl = process.env['PAGES_BASE_URL'];
  if (!bucket || !pagesBaseUrl) {
    console.log('page_create_failed', { errorCode: 'internal_error', ownerSub: sub });
    return jsonResponse(500, {
      error: {
        code: 'internal_error',
        message: 'サーバー設定が不完全です',
      },
    });
  }

  const result = await createPage({
    store: createPageStore(bucket, s3),
    pagesBaseUrl,
    ownerSub: sub,
    ownerEmail: email,
    body,
    now: () => new Date(),
    generateSlug: defaultCreatePageDeps.generateSlug,
  });

  return jsonResponse(result.status, result.body);
};

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}
