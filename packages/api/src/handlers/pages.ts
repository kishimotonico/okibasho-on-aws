import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client } from '@aws-sdk/client-s3';
import { createPage, defaultCreatePageDeps } from '../create-page.js';
import { deletePage } from '../delete-page.js';
import { getPage } from '../get-page.js';
import { listPages } from '../list-pages.js';
import { createPageStore } from '../page-store.js';
import { updatePage } from '../update-page.js';

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
  const path = event.requestContext.http.path;

  const claims = event.requestContext.authorizer.jwt.claims;
  const sub = claims['sub'];
  if (typeof sub !== 'string' || sub.length === 0) {
    console.log('api_unauthorized', { errorCode: 'unauthorized', path, method });
    return jsonResponse(401, {
      error: {
        code: 'unauthorized',
        message: '認証情報が不足しています',
      },
    });
  }

  const bucket = process.env['PAGES_BUCKET'];
  const pagesBaseUrl = process.env['PAGES_BASE_URL'];
  if (!bucket || !pagesBaseUrl) {
    console.log('api_failed', { errorCode: 'internal_error', ownerSub: sub, path, method });
    return jsonResponse(500, {
      error: {
        code: 'internal_error',
        message: 'サーバー設定が不完全です',
      },
    });
  }

  const store = createPageStore(bucket, s3);

  if (path === '/api/pages') {
    if (method === 'GET') {
      const result = await listPages({
        store,
        pagesBaseUrl,
        ownerSub: sub,
      });
      return jsonResponse(result.status, result.body);
    }

    if (method === 'POST') {
      return handleCreatePage(event, store, pagesBaseUrl, sub, claims);
    }

    return methodNotAllowed(method);
  }

  const slug = event.pathParameters?.['slug'];
  if (slug !== undefined) {
    if (method === 'GET') {
      const result = await getPage({
        store,
        pagesBaseUrl,
        ownerSub: sub,
        slug,
        now: () => new Date(),
      });
      return jsonResponse(result.status, result.body);
    }

    if (method === 'PATCH') {
      return handlePatchPage(event, store, pagesBaseUrl, sub, slug);
    }

    if (method === 'DELETE') {
      const result = await deletePage({
        store,
        ownerSub: sub,
        slug,
      });
      if (result.ok) {
        return emptyResponse(204);
      }
      return jsonResponse(result.status, result.body);
    }

    return methodNotAllowed(method);
  }

  return jsonResponse(404, {
    error: {
      code: 'page_not_found',
      message: 'リソースが見つかりません',
    },
  });
};

async function handleCreatePage(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  store: ReturnType<typeof createPageStore>,
  pagesBaseUrl: string,
  sub: string,
  claims: Record<string, unknown>,
): Promise<APIGatewayProxyResultV2> {
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

  const result = await createPage({
    store,
    pagesBaseUrl,
    ownerSub: sub,
    ownerEmail: email,
    body,
    now: () => new Date(),
    generateSlug: defaultCreatePageDeps.generateSlug,
  });

  return jsonResponse(result.status, result.body);
}

async function handlePatchPage(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  store: ReturnType<typeof createPageStore>,
  pagesBaseUrl: string,
  sub: string,
  slug: string,
): Promise<APIGatewayProxyResultV2> {
  let body: unknown;
  try {
    body = event.body ? JSON.parse(event.body) : null;
  } catch {
    console.log('page_update_failed', { errorCode: 'invalid_json', ownerSub: sub, slug });
    return jsonResponse(400, {
      error: {
        code: 'invalid_json',
        message: 'リクエスト body は有効な JSON である必要があります',
      },
    });
  }

  const result = await updatePage({
    store,
    pagesBaseUrl,
    ownerSub: sub,
    slug,
    body,
  });

  return jsonResponse(result.status, result.body);
}

function methodNotAllowed(method: string): APIGatewayProxyResultV2 {
  return jsonResponse(405, {
    error: {
      code: 'method_not_allowed',
      message: `${method} はサポートされていません`,
    },
  });
}

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function emptyResponse(statusCode: number): APIGatewayProxyResultV2 {
  return {
    statusCode,
  };
}
