import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';

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
  const claims = event.requestContext.authorizer.jwt.claims;
  console.log('request', {
    method: event.requestContext.http.method,
    path: event.requestContext.http.path,
    sub: claims['sub'],
  });

  return {
    statusCode: 501,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error: { code: 'not_implemented', message: 'TODO' } }),
  };
};
