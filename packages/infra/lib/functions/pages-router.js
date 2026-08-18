/**
 * pages Distribution 用 viewer request 関数。
 * /p/ 以外は404、/p/<rest> を /pages/<rest> にrewriteし、末尾 / なら index.html を補完する。
 */
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (!uri.startsWith('/p/')) {
    return {
      statusCode: 404,
      statusDescription: 'Not Found',
      body: 'Not Found',
    };
  }

  var rest = uri.substring(3);
  var rewrittenUri = '/pages/' + rest;

  // /p/<slug> のままHTMLを返すと相対パス ./assets/style.css が /p/assets/style.css に解決されて壊れる
  if (!uri.endsWith('/')) {
    var lastSlash = rest.lastIndexOf('/');
    var lastSegment = lastSlash === -1 ? rest : rest.substring(lastSlash + 1);
    if (lastSegment.indexOf('.') === -1) {
      var location = uri + '/';
      var qs = buildQueryString(request.querystring);
      if (qs.length > 0) {
        location = location + qs;
      }
      return {
        statusCode: 301,
        statusDescription: 'Moved Permanently',
        headers: {
          location: { value: location },
        },
      };
    }
  }

  if (rewrittenUri.endsWith('/')) {
    rewrittenUri = rewrittenUri + 'index.html';
  }

  request.uri = rewrittenUri;
  return request;
}

function buildQueryString(querystring) {
  if (!querystring) {
    return '';
  }
  var parts = [];
  for (var key in querystring) {
    var entry = querystring[key];
    if (entry.multiValue) {
      for (var i = 0; i < entry.multiValue.length; i++) {
        parts.push(key + '=' + entry.multiValue[i].value);
      }
    } else {
      parts.push(key + '=' + entry.value);
    }
  }
  if (parts.length === 0) {
    return '';
  }
  return '?' + parts.join('&');
}
