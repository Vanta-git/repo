// Static server for the REPU WebGL build.
//   node serve.js [port]
// Then open http://localhost:8099
//
// Unity ships its payloads gzipped. The build asks the browser to decompress
// them natively, so any file that is actually gzip (magic bytes 1f 8b) is sent
// with Content-Encoding: gzip. That keeps the archive out of JS memory, which
// is what makes the build load in a browser tab at all.
//
// Payloads split into 3 MB parts under Build/chunks/ are the exception: part
// 000 happens to start with the gzip magic too, and tagging it would make the
// service worker hand back a single decoded chunk instead of the raw byte run
// it needs to concatenate. Those are always served verbatim.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 8099;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.unityweb': 'application/octet-stream',
  '.gz': 'application/octet-stream',
  '.br': 'application/octet-stream',
  '.bundle': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8'
};

function isChunkPart(pathname) {
  return /\/chunks\//.test(pathname) || path.extname(pathname).toLowerCase() === '.bin';
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch (e) {
    res.writeHead(400).end('bad request');
    return;
  }

  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }

  const filePath = path.join(ROOT, path.normalize(pathname).replace(/^([/\\])+/, ''));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  fs.open(filePath, 'r', (openErr, fd) => {
    if (openErr) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 Not Found');
      return;
    }

    // Sniff the two gzip magic bytes instead of trusting the extension.
    const magic = Buffer.alloc(2);
    fs.read(fd, magic, 0, 2, 0, (readErr) => {
      fs.fstat(fd, (statErr, stat) => {
        if (readErr || statErr || !stat.isFile()) {
          fs.close(fd, () => {});
          res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 Not Found');
          return;
        }

        const gzipped = !isChunkPart(pathname) && magic[0] === 0x1f && magic[1] === 0x8b;
        const headers = {
          'Content-Type': TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
          'Content-Length': stat.size,
          'Cache-Control': 'no-cache'
        };
        if (gzipped) headers['Content-Encoding'] = 'gzip';
        // Lets a service worker at the site root control pages in a subfolder.
        if (pathname === '/sw.js') headers['Service-Worker-Allowed'] = '/';

        const range = req.headers.range;
        if (range) {
          // 206 partial content; Content-Length must describe the body we send.
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          let start = m && m[1] ? parseInt(m[1], 10) : 0;
          let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
          if (isNaN(start) || start < 0) start = 0;
          if (isNaN(end) || end >= stat.size) end = stat.size - 1;
          if (start > end) {
            fs.close(fd, () => {});
            res.writeHead(416).end();
            return;
          }
          headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
          headers['Content-Length'] = end - start + 1;
          res.writeHead(206, headers);
          const stream = fs.createReadStream(null, { fd, start, end, autoClose: true });
          stream.pipe(res);
          return;
        }

        res.writeHead(200, headers);
        const stream = fs.createReadStream(null, { fd, start: 0, autoClose: true });
        stream.pipe(res);
      });
    });
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Usually a launcher that was already open; its server is serving this
    // same folder, so point at it instead of failing the command window.
    console.log('A server is already running at http://localhost:' + PORT);
    console.log('Open that address, or close the other window first.');
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('REPU WebGL  ->  http://localhost:' + PORT);
  console.log('Press Ctrl+C to stop.');
});
