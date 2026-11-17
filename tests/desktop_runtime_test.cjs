'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStaticServer } = require('../desktop/static-server.cjs');
const { proxyRequest, validateTarget, cleanHeaders } = require('../desktop/provider-proxy.cjs');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

test('static server serves the built shell with security headers', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rev-static-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>ok</title>');
  fs.writeFileSync(path.join(root, 'editor.js'), 'console.log(1)');
  const server = createStaticServer({ root });
  const port = await listen(server);
  try {
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
    assert.match(await page.text(), /<title>ok<\/title>/);
    const script = await fetch(`http://127.0.0.1:${port}/editor.js`);
    assert.match(script.headers.get('content-type'), /javascript/);
    const head = await fetch(`http://127.0.0.1:${port}/editor.js`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  } finally {
    server.close();
  }
});

test('static server rejects traversal, unsupported methods and unknown files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rev-static-'));
  fs.writeFileSync(path.join(root, 'index.html'), 'ok');
  fs.writeFileSync(path.join(root, 'secret.txt'), 'secret');
  const server = createStaticServer({ root });
  const port = await listen(server);
  try {
    const traversal = await fetch(`http://127.0.0.1:${port}/%2e%2e/secret.txt`);
    assert.ok([403, 404].includes(traversal.status));
    const hidden = await fetch(`http://127.0.0.1:${port}/.env`);
    assert.equal(hidden.status, 404);
    const missing = await fetch(`http://127.0.0.1:${port}/missing.js`);
    assert.equal(missing.status, 404);
    const post = await fetch(`http://127.0.0.1:${port}/`, { method: 'POST' });
    assert.equal(post.status, 405);
  } finally {
    server.close();
  }
});

test('provider proxy accepts public HTTPS and local HTTP only', () => {
  assert.equal(validateTarget('https://gateway.example.com/v1').hostname, 'gateway.example.com');
  assert.equal(validateTarget('http://127.0.0.1:3000/v1').hostname, '127.0.0.1');
  assert.equal(validateTarget('http://localhost:8080').hostname, 'localhost');
  assert.throws(() => validateTarget('http://gateway.example.com/v1'), /localhost/);
  assert.throws(() => validateTarget('https://192.168.1.5/v1'), /privée/);
  assert.throws(() => validateTarget('https://user:pass@gateway.example.com'), /Identifiants/);
  assert.throws(() => validateTarget('file:///etc/passwd'), /HTTPS/);
});

test('provider proxy never forwards cookies or CRLF headers', () => {
  const headers = cleanHeaders({ Cookie: 'a=b', Authorization: 'Bearer k', 'X-Api-Key': 'k', 'X-Test\r\nInjected': 'x', Accept: 'application/json' });
  assert.deepEqual(headers, { authorization: 'Bearer k', 'x-api-key': 'k', accept: 'application/json' });
});

test('provider proxy returns JSON, binary data and strips credentials on cross-origin redirect', async () => {
  let receivedAuth = null;
  const target = http.createServer((req, res) => {
    receivedAuth = req.headers.authorization || null;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  const targetPort = await listen(target);
  const redirect = http.createServer((req, res) => {
    if (req.url === '/image') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.from([137, 80, 78, 71]));
      return;
    }
    res.writeHead(302, { Location: `http://127.0.0.1:${targetPort}/v1/chat/completions` });
    res.end();
  });
  const redirectPort = await listen(redirect);
  try {
    const json = await proxyRequest({ url: `http://127.0.0.1:${redirectPort}/`, method: 'POST', headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(json.status, 200);
    assert.equal(json.binary, false);
    assert.deepEqual(JSON.parse(json.text), { ok: true });
    assert.equal(receivedAuth, null);
    const image = await proxyRequest({ url: `http://127.0.0.1:${redirectPort}/image` });
    assert.equal(image.binary, true);
    assert.equal(image.mime, 'image/png');
    assert.deepEqual(Array.from(image.data), [137, 80, 78, 71]);
  } finally {
    redirect.close();
    target.close();
  }
});
