const EMAIL_DOMAIN = '__EMAIL_DOMAIN__';

function handler(event) {
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

  var match = uri.match(/^\/p\/([^/]+)\/([^/]+)(\/.*)?$/);
  if (!match) {
    return notFound();
  }

  var user = match[1];
  if (user.indexOf('@') !== -1) {
    return notFound();
  }

  var slug = match[2];
  var rest = match[3];

  if (rest === undefined) {
    var location = '/p/' + user + '/' + slug + '/';
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

  var lastSlash = rest.lastIndexOf('/');
  var lastSegment = rest.substring(lastSlash + 1);
  if (lastSegment === '.metadata.json') {
    return notFound();
  }

  if (rest.endsWith('/')) {
    rest += 'index.html';
  }

  request.uri = '/pages/' + user + '@' + EMAIL_DOMAIN + '/' + slug + rest;
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
