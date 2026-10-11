import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../server/config.js';
import { harness } from './helpers.js';

async function fixture(t, extra = {}) {
  const h = await harness({authConfigured: false, developmentLoginEnabled: true, ...extra});
  h.config.origin = h.origin;
  t.after(() => h.close());
  return h;
}
async function form(h) {
  const page = await h.request('/login');
  const html = await page.text();
  return {cookie: page.headers.get('set-cookie')?.split(';')[0], token: html.match(/name="token" value="([^"]+)"/)?.[1], html};
}
function submit(h, entry, extra = {}) {
  return h.request('/auth/dev-login', {method: 'POST', headers: {
    cookie: entry.cookie, origin: h.origin, 'content-type': 'application/x-www-form-urlencoded', ...extra,
  }, body: new URLSearchParams({token: entry.token}).toString()});
}

test('temporary login is opt-in, local, development-only and disappears after Entra configuration', () => {
  const local = {NODE_ENV: 'development', DEV_LOGIN_ENABLED: 'true'};
  assert.equal(readConfig(local).developmentLoginEnabled, true);
  assert.equal(readConfig({}).developmentLoginEnabled, false);
  assert.equal(readConfig({...local, NODE_ENV: 'test'}).developmentLoginEnabled, false);
  assert.equal(readConfig({...local, TRUST_PROXY: 'true'}).developmentLoginEnabled, false);
  assert.equal(readConfig({...local, APP_ORIGIN: 'https://planificador.frh.utn.edu.ar'}).developmentLoginEnabled, false);
  const configured = {...local, MICROSOFT_TENANT_ID: '11111111-1111-1111-1111-111111111111',
    MICROSOFT_CLIENT_ID: '22222222-2222-2222-2222-222222222222', MICROSOFT_CLIENT_SECRET: 'test-only', SESSION_SECRET: 's'.repeat(48)};
  assert.equal(readConfig(configured).developmentLoginEnabled, false);
  assert.equal(readConfig({...configured, NODE_ENV: 'production', APP_ORIGIN: 'https://planificador.frh.utn.edu.ar', DATABASE_URL: 'postgresql://test.invalid/test'}).developmentLoginEnabled, false);
});

test('temporary login issues a regular session and persists a plan under a separate local identity', async t => {
  const h = await fixture(t), entry = await form(h);
  assert.match(entry.html, /Ingresar para pruebas/);
  const response = await submit(h, entry);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/');
  const cookie = response.headers.getSetCookie().find(x => x.startsWith('planificador-session=')).split(';')[0];
  const auth = await (await h.request('/api/session', {headers: {cookie}})).json();
  assert.equal(auth.user.name, 'Cuenta de prueba local');
  const saved = await h.request('/api/plans/mecanica', {method: 'PUT', headers: {
    cookie, origin: h.origin, 'x-csrf-token': auth.csrf, 'x-portal-account': auth.user.account, 'content-type': 'application/json',
  }, body: JSON.stringify({revision: 0, data: {version: 1, estados: {1: 'aprobada'}}})});
  assert.equal(saved.status, 200);
  assert.equal((await h.store.getPlan('development:local-preview', 'mecanica')).data.estados[1], 'aprobada');
  h.advance(h.config.policy.revalidateMs);
  const stale = await h.request('/api/session', {headers: {cookie}});
  assert.equal(stale.status, 401);
  assert.equal((await stale.json()).login, '/login?expired=1');
});

test('temporary login rejects cross-origin, forged tokens and proxied requests', async t => {
  const h = await fixture(t), entry = await form(h);
  assert.equal((await submit(h, entry, {origin: 'https://other.invalid'})).status, 403);
  assert.equal((await submit(h, {...entry, token: 'invalid'})).status, 403);
  assert.equal((await submit(h, entry, {'x-forwarded-for': '203.0.113.1'})).status, 403);
  const page = await h.request('/login', {headers: {'x-forwarded-proto': 'https'}});
  assert.ok(!(await page.text()).includes('Ingresar para pruebas'));
});

test('production rejects both the temporary endpoint and a previously issued development session', async t => {
  const h = await fixture(t, {production: true, authConfigured: true});
  assert.ok(!(await (await h.request('/login')).text()).includes('Ingresar para pruebas'));
  assert.equal((await h.request('/auth/dev-login', {method: 'POST'})).status, 404);
  const user = await h.session(undefined, {authMethod: 'development'});
  assert.equal((await h.request('/api/session', {headers: {cookie: user.cookie}})).status, 401);
});
