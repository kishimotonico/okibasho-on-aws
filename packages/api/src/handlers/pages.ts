import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client } from '@aws-sdk/client-s3';
import { createAliasStore } from '../alias-store.js';
import { completePage } from '../complete-page.js';
import { createPage, defaultCreatePageDeps } from '../create-page.js';
import { deletePage } from '../delete-page.js';
import { getPage } from '../get-page.js';
import { listPages } from '../list-pages.js';
import { createPageStore } from '../page-store.js';
import { defaultRedeclarePageDeps, redeclarePage } from '../redeclare-page.js';
import { updatePage } from '../update-page.js';

const s3 = new S3Client({});

/**
 * /api/pages 系のハンドラ。
 *
 * 実装対象:
 *   POST   /api/pages                  新規宣言 + presigned PUT URL 発行
 *   PUT    /api/pages/{slug}           再アップロード宣言
 *   POST   /api/pages/{slug}/complete  アップロード完了
 *   GET    /api/pages                  My Pages 一覧
 *   GET    /api/pages/{slug}           ページ取得
 *   PATCH  /api/pages/{slug}         title / retention 変更
 *   DELETE /api/pages/{slug}          削除
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
  const shareBaseUrl = process.env['SHARE_BASE_URL'];
  const kvsArn = process.env['KVS_ARN'];
  if (!bucket || !pagesBaseUrl || !shareBaseUrl || !kvsArn) {
    console.log('api_failed', { errorCode: 'internal_error', ownerSub: sub, path, method });
    return jsonResponse(500, {
      error: {
        code: 'internal_error',
        message: 'サーバー設定が不完全です',
      },
    });
  }

  const store = createPageStore(bucket, s3);
  const aliasStore = createAliasStore(kvsArn);

  if (path === '/api/pages') {
    if (method === 'GET') {
      const result = await listPages({
        store,
        pagesBaseUrl,
        shareBaseUrl,
        ownerSub: sub,
      });
      return jsonResponse(result.status, result.body);
    }

    if (method === 'POST') {
      return handleCreatePage(event, store, pagesBaseUrl, shareBaseUrl, sub);
    }

    return methodNotAllowed(method);
  }

  const completeMatch = path.match(/^\/api\/pages\/([^/]+)\/complete$/);
  if (completeMatch !== null) {
    const slug = completeMatch[1]!;
    if (method === 'POST') {
      return handleCompletePage(event, store, aliasStore, pagesBaseUrl, shareBaseUrl, sub, claims, slug);
    }
    return methodNotAllowed(method);
  }

  const slug = event.pathParameters?.['slug'];
  if (slug !== undefined) {
    if (method === 'GET') {
      const result = await getPage({
        store,
        pagesBaseUrl,
        shareBaseUrl,
        ownerSub: sub,
        slug,
      });
      return jsonResponse(result.status, result.body);
    }

    if (method === 'PUT') {
      return handleRedeclarePage(event, store, pagesBaseUrl, shareBaseUrl, sub, slug);
    }

    if (method === 'PATCH') {
      return handlePatchPage(event, store, aliasStore, pagesBaseUrl, shareBaseUrl, sub, slug);
    }

    if (method === 'DELETE') {
      const result = await deletePage({
        store,
        aliasStore,
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
  shareBaseUrl: string,
  sub: string,
): Promise<APIGatewayProxyResultV2> {
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
    shareBaseUrl,
    ownerSub: sub,
    body,
    generateSlug: defaultCreatePageDeps.generateSlug,
    generateVersionId: defaultCreatePageDeps.generateVersionId,
  });

  return jsonResponse(result.status, result.body);
}

async function handleRedeclarePage(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  store: ReturnType<typeof createPageStore>,
  pagesBaseUrl: string,
  shareBaseUrl: string,
  sub: string,
  slug: string,
): Promise<APIGatewayProxyResultV2> {
  let body: unknown;
  try {
    body = event.body ? JSON.parse(event.body) : null;
  } catch {
    return jsonResponse(400, {
      error: {
        code: 'invalid_json',
        message: 'リクエスト body は有効な JSON である必要があります',
      },
    });
  }

  const result = await redeclarePage({
    store,
    pagesBaseUrl,
    shareBaseUrl,
    ownerSub: sub,
    slug,
    body,
    generateVersionId: defaultRedeclarePageDeps.generateVersionId,
  });

  return jsonResponse(result.status, result.body);
}

async function handleCompletePage(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  store: ReturnType<typeof createPageStore>,
  aliasStore: ReturnType<typeof createAliasStore>,
  pagesBaseUrl: string,
  shareBaseUrl: string,
  sub: string,
  claims: Record<string, unknown>,
  slug: string,
): Promise<APIGatewayProxyResultV2> {
  const email = typeof claims['email'] === 'string' ? claims['email'] : '';

  let body: unknown;
  try {
    body = event.body ? JSON.parse(event.body) : null;
  } catch {
    return jsonResponse(400, {
      error: {
        code: 'invalid_json',
        message: 'リクエスト body は有効な JSON である必要があります',
      },
    });
  }

  const result = await completePage({
    store,
    aliasStore,
    pagesBaseUrl,
    shareBaseUrl,
    ownerSub: sub,
    ownerEmail: email,
    slug,
    body,
    now: () => new Date(),
  });

  return jsonResponse(result.status, result.body);
}

async function handlePatchPage(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  store: ReturnType<typeof createPageStore>,
  aliasStore: ReturnType<typeof createAliasStore>,
  pagesBaseUrl: string,
  shareBaseUrl: string,
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
    aliasStore,
    pagesBaseUrl,
    shareBaseUrl,
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
