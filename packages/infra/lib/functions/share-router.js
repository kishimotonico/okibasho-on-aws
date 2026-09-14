import crypto from 'crypto';
import cf from 'cloudfront';

// このKVSはPagesDeliveryが/s/*ビヘイビアに関連付ける。値はshare projectorが投影する
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

  // IP制限
  if (Array.isArray(entry.c) && entry.c.length > 0) {
    var clientIp = event.viewer.ip;
    if (!ipAllowed(clientIp, entry.c)) {
      return forbidden();
    }
  }

  // Basic認証
  if (typeof entry.b === 'string') {
    var authHeader = request.headers.authorization && request.headers.authorization.value;
    if (!basicAuthOk(authHeader, entry.b)) {
      return unauthorized();
    }
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

function ipAllowed(ip, cidrs) {
  var ipInt = ipv4ToUint32(ip);
  if (ipInt === null) {
    return false;
  }
  for (var i = 0; i < cidrs.length; i++) {
    if (ipInCidr(ipInt, cidrs[i])) {
      return true;
    }
  }
  return false;
}

/** "a.b.c.d" を符号なし32bit整数に変換する。不正な形式ならnull */
function ipv4ToUint32(ip) {
  if (typeof ip !== 'string') {
    return null;
  }
  var octets = ip.split('.');
  if (octets.length !== 4) {
    return null;
  }
  var n = 0;
  for (var i = 0; i < 4; i++) {
    if (!/^\d{1,3}$/.test(octets[i])) {
      return null;
    }
    var value = Number(octets[i]);
    if (value > 255) {
      return null;
    }
    n = n * 256 + value;
  }
  return n >>> 0;
}

/** IPv4 CIDR判定。prefixは0〜32を想定し、0は無条件一致として特別扱いする(左シフト32は仕様上0シフト相当になるため) */
function ipInCidr(ipInt, cidr) {
  var slash = cidr.lastIndexOf('/');
  if (slash === -1) {
    return false;
  }
  var baseInt = ipv4ToUint32(cidr.slice(0, slash));
  var prefix = Number(cidr.slice(slash + 1));
  if (baseInt === null || !(prefix >= 0 && prefix <= 32) || !Number.isInteger(prefix)) {
    return false;
  }
  if (prefix === 0) {
    return true;
  }
  var mask = (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) >>> 0 === (baseInt & mask) >>> 0;
}

function basicAuthOk(authHeaderValue, bField) {
  if (typeof authHeaderValue !== 'string') {
    return false;
  }
  var prefix = 'Basic ';
  if (authHeaderValue.slice(0, prefix.length) !== prefix) {
    return false;
  }

  var decoded;
  try {
    decoded = Buffer.from(authHeaderValue.slice(prefix.length), 'base64').toString('utf-8');
  } catch (e) {
    return false;
  }

  var colon = decoded.indexOf(':');
  if (colon === -1) {
    return false;
  }
  var username = decoded.slice(0, colon);
  var password = decoded.slice(colon + 1);

  var sep = bField.indexOf(':');
  if (sep === -1) {
    return false;
  }
  var salt = bField.slice(0, sep);
  var expectedHash = bField.slice(sep + 1);

  var actualHash = crypto
    .createHash('sha256')
    .update(salt + ':' + username + ':' + password)
    .digest('hex');

  return constantTimeEquals(actualHash, expectedHash);
}

/** タイミング攻撃を避けるための定数時間比較 */
function constantTimeEquals(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
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
