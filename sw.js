/* REPU chunk streamer.
 *
 * The player's payloads are split into 3 MB files so the build can be hosted
 * on services that cap individual uploads. This worker puts them back together:
 * when the page asks for Build/123.data.gz it fetches the parts in order,
 * pipes them through a gzip decoder and hands Unity one continuous stream.
 *
 * Nothing is buffered here, so streaming a 400 MB payload costs no extra
 * memory, and the browser decompresses it as it arrives.
 */
'use strict';

var SCOPE = self.registration.scope;
var MANIFEST_URL = new URL('Build/chunks/manifest.json', SCOPE).href;
var manifestPromise = null;

function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) {
        throw new Error('manifest ' + res.status);
      }
      return res.json();
    });
    manifestPromise.catch(function () {
      manifestPromise = null;
    });
  }
  return manifestPromise;
}

function relativePath(url) {
  var base = new URL(SCOPE).pathname;
  var pathname = new URL(url).pathname;
  if (pathname.indexOf(base) === 0) {
    pathname = pathname.slice(base.length);
  }
  return pathname.replace(/^\/+/, '');
}

/* A pull-driven source: one part is opened, read and released at a time, so
 * backpressure from the consumer (Unity) reaches the network. */
function chunkSource(entry) {
  var index = 0;
  var reader = null;
  return {
    pull: function (controller) {
      function step() {
        if (!reader) {
          if (index >= entry.parts.length) {
            controller.close();
            return;
          }
          var url = new URL(entry.parts[index++], SCOPE).href;
          return fetch(url, { cache: 'no-store' }).then(function (res) {
            if (!res.ok || !res.body) {
              throw new Error('part ' + url + ' -> ' + res.status);
            }
            reader = res.body.getReader();
            return next();
          });
        }
        return next();
      }

      function next() {
        return reader.read().then(function (r) {
          if (r.done) {
            reader = null;
            return step();
          }
          controller.enqueue(r.value);
          return undefined;
        });
      }

      return step().catch(function (err) {
        console.error('[repu] chunk stream failed:', err);
        controller.error(err);
      });
    },
    cancel: function (reason) {
      if (reader) {
        reader.cancel(reason).catch(function () {});
        reader = null;
      }
    }
  };
}

function respond(req) {
  return loadManifest().then(function (manifest) {
    var entry = manifest && manifest.files && manifest.files[relativePath(req.url)];
    if (!entry) {
      return fetch(req);
    }

    var headers = new Headers();
    headers.set('Content-Type', entry.type || 'application/octet-stream');
    headers.set('Cache-Control', 'no-cache');
    headers.set('X-Repu-Parts', String(entry.parts.length));
    // Unity sizes its download buffer from Content-Length, so give it the
    // decoded size rather than the on-disk one.
    if (entry.decoded) {
      headers.set('Content-Length', String(entry.decoded));
    }

    var stream = new ReadableStream(chunkSource(entry));
    if (entry.encoding === 'gzip') {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('this browser cannot decompress the chunked build (no DecompressionStream)');
      }
      stream = stream.pipeThrough(new DecompressionStream('gzip'));
    }
    return new Response(stream, { status: 200, statusText: 'OK', headers: headers });
  }).catch(function (err) {
    console.error('[repu] cannot serve ' + req.url + ':', err);
    return new Response('chunked payload unavailable: ' + err.message, {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  });
}

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') {
    return;
  }
  event.respondWith(respond(event.request));
});
