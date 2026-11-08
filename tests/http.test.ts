import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isSameOrigin, publicOrigin, sessionCookie} from '../lib/basar/http.ts';

test('A configured public origin supports HTTPS reverse proxies and rejects foreign origins', () => {
  const request = new Request('http://localhost:3000/api/basar', {headers: {origin: 'https://kasse.example.test', host: 'kasse.example.test'}});
  assert.equal(isSameOrigin(request, 'https://kasse.example.test'), true);
  assert.equal(isSameOrigin(request, 'https://other.example.test'), false);
  assert.equal(isSameOrigin(new Request('http://localhost:3000/api/basar'), 'https://kasse.example.test'), false);
});
test('Loopback requests preserve the actual host and port without trusting remote forwarded headers', () => {
  const request = new Request('http://localhost:3000/api/basar', {headers: {host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000'}});
  assert.equal(isSameOrigin(request, ''), true);
  const spoofed = new Request('http://localhost:3000/api/basar', {headers: {host: 'evil.example.test', origin: 'https://evil.example.test', 'x-forwarded-proto': 'https'}});
  assert.equal(isSameOrigin(spoofed, ''), false);
});
test('Configuration accepts only origins, not paths or embedded credentials', () => {
  const request = new Request('http://localhost:3000/api/basar');
  for (const invalid of ['https://kasse.example.test/path', 'https://user:pass@kasse.example.test', 'file:///tmp']) assert.throws(() => publicOrigin(request, invalid));
});
test('Session cookies use HTTPS and remain scoped to the demonstration path', () => {
  const oldOrigin = process.env.BASAR_PUBLIC_ORIGIN;
  const oldPath = process.env.NEXT_PUBLIC_BASE_PATH;
  try {
    process.env.BASAR_PUBLIC_ORIGIN = 'https://kasse.example.test';
    process.env.NEXT_PUBLIC_BASE_PATH = '/basarkasse';
    const request = new Request('http://localhost:3000/api/basar');
    assert.match(sessionCookie(request, 'test-token'), /Path=\/basarkasse; HttpOnly; SameSite=Strict; Max-Age=43200; Secure$/);
    assert.match(sessionCookie(request, null), /Max-Age=0; Secure$/);
  } finally {
    if (oldOrigin === undefined) delete process.env.BASAR_PUBLIC_ORIGIN; else process.env.BASAR_PUBLIC_ORIGIN = oldOrigin;
    if (oldPath === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH; else process.env.NEXT_PUBLIC_BASE_PATH = oldPath;
  }
});
