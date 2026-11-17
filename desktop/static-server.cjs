'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: http://127.0.0.1:* http://localhost:*",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function createStaticServer(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '..', 'web-online', 'dist'));
  const csp = options.csp === false ? null : (options.csp || CSP);
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end('Method not allowed');
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    } catch {
      res.writeHead(400);
      return res.end('Bad request');
    }
    if (pathname.includes('\0')) {
      res.writeHead(400);
      return res.end('Bad request');
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = path.resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    const ext = path.extname(file).toLowerCase();
    if (!MIME[ext] || path.basename(file).startsWith('.')) {
      res.writeHead(404);
      return res.end('Not found');
    }
    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404);
        return res.end('Not found');
      }
      const headers = {
        'Content-Type': MIME[ext],
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Cross-Origin-Resource-Policy': 'same-origin',
      };
      if (csp) headers['Content-Security-Policy'] = csp;
      res.writeHead(200, headers);
      if (req.method === 'HEAD') return res.end();
      const stream = fs.createReadStream(file);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    });
  });
  server.root = root;
  return server;
}

module.exports = { createStaticServer, MIME, CSP };
