import cf from 'cloudfront';
const kvsHandle = cf.kvs();
const NAMESPACE = '__NAMESPACE__';
const SENTINEL_URI = '/__missing__/index.html';

async function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri.indexOf('%2f') !== -1 || uri.indexOf('%2F') !== -1) {
    return notFound();
  }

  var parts = uri.split('/');
  if (parts[0] !== '') {
    return notFound();
  }

  for (var i = 1; i < parts.length; i++) {
    if (parts[i] === '.' || parts[i] === '..') {
      return notFound();
    }
    if (parts[i] === '' && i < parts.length - 1) {
      return notFound();
    }
  }

  if (parts.length < 2) {
    return notFound();
  }

  var slug = parts[1];
  if (!slug || slug.length !== 16 || !/^[a-z0-9]{16}$/.test(slug)) {
    return notFound();
  }

  if (parts.length === 2) {
    var location = '/' + slug + '/';
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

  var rest = parts.slice(2).join('/');
  var kvsKey = NAMESPACE + '/' + slug;

  try {
    var raw = await kvsHandle.get(kvsKey);
    if (!raw) {
      console.log('kvs missing key: ' + kvsKey);
      return rewriteSentinel(request);
    }

    var alias = JSON.parse(raw);
    var versionId = alias.v;
    if (!versionId || typeof versionId !== 'string') {
      console.log('kvs invalid value for key: ' + kvsKey);
      return rewriteSentinel(request);
    }

    if (alias.e !== undefined && alias.e !== null) {
      var now = Math.floor(Date.now() / 1000);
      if (typeof alias.e === 'number' && alias.e <= now) {
        console.log('kvs expired key: ' + kvsKey);
        return rewriteSentinel(request);
      }
    }

    var rewrittenUri = '/' + slug + '/' + versionId + '/' + rest;
    if (rewrittenUri.endsWith('/')) {
      rewrittenUri = rewrittenUri + 'index.html';
    }
    request.uri = rewrittenUri;
    return request;
  } catch (error) {
    console.log('kvs error for key: ' + kvsKey + ' error: ' + error);
    return rewriteSentinel(request);
  }
}

function rewriteSentinel(request) {
  request.uri = SENTINEL_URI;
  return request;
}

function notFound() {
  return {
    statusCode: 404,
    statusDescription: 'Not Found',
    body: 'Not Found',
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
