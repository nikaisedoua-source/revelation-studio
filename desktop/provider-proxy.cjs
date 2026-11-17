'use strict';
const net = require('node:net');

const MAX_BYTES = 512 * 1024 * 1024;
const TIMEOUT_MS = 180000;
const REDIRECTS = 5;
const SAFE_HEADERS = new Set([
  'accept',
  'content-type',
  'authorization',
  'x-api-key',
  'xi-api-key',
  'x-goog-api-key',
  'anthropic-version',
  'anthropic-dangerous-direct-browser-access',
  'openai-beta',
]);
const SENSITIVE_HEADERS = ['authorization', 'x-api-key', 'xi-api-key', 'x-goog-api-key'];

function loopback(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function privateLiteral(hostname) {
  if (!net.isIP(hostname)) return false;
  const low = hostname.toLowerCase();
  if (low === '::1' || low.startsWith('fe80:') || low.startsWith('fc') || low.startsWith('fd')) return true;
  const parts = low.split('.').map(Number);
  if (parts.length !== 4) return true;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
}

function validateTarget(raw) {
  let url;
  try { url = new URL(String(raw)); } catch { throw new Error('Adresse réseau invalide.'); }
  if (url.username || url.password) throw new Error('Identifiants inclus dans l’URL refusés.');
  if (url.protocol === 'http:') {
    if (!loopback(url.hostname)) throw new Error('HTTP sans TLS est réservé à localhost.');
  } else if (url.protocol !== 'https:') {
    throw new Error('Seules les adresses HTTPS publiques sont autorisées.');
  }
  if (!url.hostname) throw new Error('Adresse réseau sans hôte.');
  if (!loopback(url.hostname) && privateLiteral(url.hostname)) throw new Error('Adresse réseau privée refusée.');
  return url;
}

function cleanHeaders(headers = {}) {
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    const key = String(name).toLowerCase();
    if (!SAFE_HEADERS.has(key) || typeof value !== 'string' || /[\r\n]/.test(value)) continue;
    out[key] = value;
  }
  return out;
}

function stripSecrets(headers) {
  const out = { ...headers };
  for (const name of SENSITIVE_HEADERS) delete out[name];
  return out;
}

function textLike(contentType = '') {
  return /json|text|xml|javascript|event-stream/i.test(contentType);
}

async function proxyRequest(payload = {}) {
  let method = String(payload.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(method)) throw new Error('Méthode réseau refusée.');
  let url = validateTarget(payload.url);
  let headers = cleanHeaders(payload.headers);
  let body = method === 'GET' || method === 'HEAD' ? undefined : payload.body;
  if (body !== undefined && typeof body !== 'string') throw new Error('Corps de requête invalide.');
  if (body && body.length > 64 * 1024 * 1024) throw new Error('Requête fournisseur trop volumineuse.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Number(payload.timeoutMs) || TIMEOUT_MS, 600000));
  try {
    for (let hop = 0; hop <= REDIRECTS; hop++) {
      const response = await fetch(url, { method, headers, body, redirect: 'manual', signal: controller.signal });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('Redirection du fournisseur sans destination.');
        if (hop === REDIRECTS) throw new Error('Trop de redirections du fournisseur.');
        const next = validateTarget(new URL(location, url).href);
        if (next.origin !== url.origin) headers = stripSecrets(headers);
        if (response.status === 303 || (response.status === 302 && method === 'POST')) {
          method = 'GET';
          body = undefined;
        }
        url = next;
        continue;
      }
      const length = Number(response.headers.get('content-length') || 0);
      if (length > MAX_BYTES) throw new Error('Réponse fournisseur trop volumineuse.');
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > MAX_BYTES) throw new Error('Réponse fournisseur trop volumineuse.');
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const output = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        mime: contentType,
        url: url.href,
        binary: !textLike(contentType),
      };
      if (output.binary) output.data = buffer;
      else output.text = buffer.toString('utf8');
      return output;
    }
    throw new Error('Trop de redirections du fournisseur.');
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('Délai fournisseur dépassé.');
    if (error instanceof TypeError) throw new Error('Connexion fournisseur impossible. Vérifier le réseau et l’URL.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { proxyRequest, validateTarget, cleanHeaders, MAX_BYTES, SAFE_HEADERS };
