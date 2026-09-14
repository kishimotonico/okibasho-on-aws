import cf from 'cloudfront';

// このKVSはPagesDeliveryが/s/*ビヘイビアに関連付ける。値はPageMaintenance Lambdaが投影する
var kvsHandle = cf.kvs();

var ERROR_BODY = 'Not Found';
var FORBIDDEN_BODY = 'Forbidden';
var UNAUTHORIZED_BODY = 'Unauthorized';

async function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // /s/<id> のみ(末尾スラッシュ無し) -> 末尾スラッシュ付きへ301。パス検査より先に判定する
  var match = uri.match(/^\/s\/([^/]+)(\/.*)?$/);
  if (!match) {
    return notFound();
  }

  var id = match[1];
  var rest = match[2];

  if (rest === undefined) {
    var location = '/s/' + id + '/';
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

  // pages-router と同じパス検査
  if (uri.indexOf('%2f') !== -1 || uri.indexOf('%2F') !== -1) {
    return notFound();
  }

  var parts = uri.split('/');
  for (var i = 1; i < parts.length; i++) {
    if (parts[i] === '.' || parts[i] === '..') {
      return notFound();
    }
    if (parts[i] === '' && i < parts.length - 1) {
      return notFound();
    }
  }

  // id形式(tag11文字+share-id22文字の33文字)・KVS参照
  if (!/^[A-Za-z0-9_-]{33}$/.test(id)) {
    return notFound();
  }

  var tag = id.slice(0, 11);
  var shareId = id.slice(11);

  var entry;
  try {
    var raw = await kvsHandle.get(tag);
    entry = JSON.parse(raw);
  } catch (e) {
    return notFound();
  }

  if (!entry || typeof entry.p !== 'string' || entry.id !== shareId) {
    return notFound();
  }

  // IP制限。完全一致リストにclientIpが無ければ弾く
  if (Array.isArray(entry.ips) && entry.ips.length > 0) {
    var clientIp = event.viewer.ip;
    if (entry.ips.indexOf(clientIp) === -1) {
      return forbidden();
    }
  }

  // Basic認証。パスワードは常に設定されているため、entry.bとの文字列比較だけで判定できる
  var authHeader = request.headers.authorization && request.headers.authorization.value;
  if (authHeader !== 'Basic ' + entry.b) {
    return unauthorized();
  }

  // URIをprefix + restへrewrite。Authorizationは転送しない
  if (rest.endsWith('/')) {
    rest += 'index.html';
  }

  var prefix = entry.p.endsWith('/') ? entry.p.slice(0, -1) : entry.p;
  request.uri = '/' + prefix + rest;
  delete request.headers.authorization;
  return request;
}

function notFound() {
  return {
    statusCode: 404,
    statusDescription: 'Not Found',
    body: ERROR_BODY,
  };
}

function forbidden() {
  return {
    statusCode: 403,
    statusDescription: 'Forbidden',
    body: FORBIDDEN_BODY,
  };
}

function unauthorized() {
  return {
    statusCode: 401,
    statusDescription: 'Unauthorized',
    headers: {
      'www-authenticate': { value: 'Basic realm="okibasho", charset="UTF-8"' },
    },
    body: UNAUTHORIZED_BODY,
  };
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
