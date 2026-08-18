/**
 * app Distribution 用 viewer request 関数。
 *
 * SPAのディープリンク(/upload など)はS3上に存在しないので、シェルへ寄せる必要がある。
 * これをCloudFrontのCustomErrorResponse(404 → /_shell.html)でやると、
 * CustomErrorResponseがDistribution全体に効くため /api/* から返った404まで
 * SPAのHTML(200)に化けてしまう。behaviorごとに掛けられるviewer request関数で寄せる。
 *
 * 判定は「最終セグメントに . を含むか」だけ。アセットは必ず拡張子付き、
 * ルーティング用のパスは拡張子なし、という前提に乗っている。
 */
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  var lastSlash = uri.lastIndexOf('/');
  var lastSegment = uri.substring(lastSlash + 1);

  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/_shell.html';
  }

  return request;
}
