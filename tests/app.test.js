import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, otherOid } from './helpers.js';

async function fixture(t, extra) { const h = await harness(extra); t.after(() => h.close()); return h; }
const payload = {version: 1, estados: {1: 'aprobada'}};
const headers = (h, auth) => ({cookie: auth.cookie, origin: h.config.origin, 'x-csrf-token': auth.session.csrf, 'x-portal-account': auth.account, 'content-type': 'application/json'});

test('anonymous requests cannot read HTML, API, repository files or the legacy app', async t => {
  const h = await fixture(t);
  assert.equal((await h.request('/')).status, 302);
  assert.equal((await h.request('/api/plans/mecanica')).status, 401);
  for (const path of ['/.env', '/server/config.js', '/legacy/index.html']) assert.equal((await h.request(path)).status, 404);
  const sw = await (await h.request('/sw.js')).text();
  assert.ok(!sw.includes("addEventListener('fetch'"));
});
test('unconfigured development fails closed and explains configuration status', async t => {
  const h = await fixture(t, {authConfigured: false});
  assert.equal((await h.request('/health/ready')).status, 503);
  assert.match(await (await h.request('/login')).text(), /configuración.*pendiente/);
  assert.equal((await h.request('/auth/login')).headers.get('location'), '/login');
});
test('plans are isolated per institutional identity and career and use atomic revisions', async t => {
  const h = await fixture(t), a = await h.session(), b = await h.session(otherOid);
  const write = () => h.request('/api/plans/mecanica', {method: 'PUT', headers: headers(h, a), body: JSON.stringify({revision: 0, data: payload})});
  const writes = await Promise.all([write(), write()]);
  assert.deepEqual(writes.map(x => x.status).sort(), [200, 409]);
  const own = await (await h.request('/api/plans/mecanica', {headers: headers(h, a)})).json();
  assert.deepEqual(own.data, payload);
  assert.equal((await (await h.request('/api/plans/mecanica', {headers: headers(h, b)})).json()).data, null);
  assert.equal((await (await h.request('/api/plans/industrial', {headers: headers(h, a)})).json()).data, null);
  assert.equal((await h.request('/api/plans/no-existe', {headers: headers(h, a)})).status, 404);
});
test('mutations require both same origin and the session CSRF token', async t => {
  const h = await fixture(t), a = await h.session();
  for (const extra of [{origin: 'https://other.invalid'}, {'x-csrf-token': 'wrong'}]) {
    const response = await h.request('/api/plans/mecanica', {method: 'PUT', headers: {...headers(h, a), ...extra}, body: JSON.stringify({revision: 0, data: payload})});
    assert.equal(response.status, 403);
  }
});
test('background reads do not extend idle time; activity does not extend absolute lifetime', async t => {
  const h = await fixture(t), a = await h.session();
  h.advance(5 * 60_000);
  await h.request('/api/session', {headers: {cookie: a.cookie}});
  await h.request('/', {headers: {cookie: a.cookie}});
  assert.equal((await h.store.getSession(a.session.id)).lastActive, a.session.lastActive);
  await h.request('/api/activity', {method: 'POST', headers: headers(h, a), body: '{}'});
  assert.equal((await h.store.getSession(a.session.id)).lastActive, h.now());
  h.advance(10 * 60_000);
  const expired = await h.request('/api/session', {headers: {cookie: a.cookie}});
  assert.equal(expired.status, 401);
  assert.equal((await expired.json()).code, 'reauth_required');
});
test('idle expiry, blocking and logout revoke the server session', async t => {
  const h = await fixture(t), a = await h.session();
  await h.store.setBlocked(a.session.userId, true);
  assert.equal((await h.request('/api/session', {headers: {cookie: a.cookie}})).status, 401);
  await h.store.setBlocked(a.session.userId, false);
  const b = await h.session();
  const logout = await h.request('/auth/logout', {method: 'POST', headers: headers(h, b), body: '{}'});
  assert.equal(logout.status, 200);
  assert.equal(await h.store.getSession(b.session.id), null);
  await h.store.updateSession(b.session);
  assert.equal(await h.store.getSession(b.session.id), null);
  const c = await h.session();
  h.advance(h.config.policy.idleMs);
  assert.equal((await h.request('/api/session', {headers: {cookie: c.cookie}})).status, 401);
});
test('OIDC callbacks bind to the browser, consume state once and rotate session cookies', async t => {
  const h = await fixture(t);
  const start = await h.request('/auth/login');
  const flow = start.headers.get('set-cookie').split(';')[0];
  const tx = h.transactions.at(-1);
  const success = await h.request('/auth/callback?state=' + tx.state + '&code=member', {headers: {cookie: flow}});
  assert.equal(success.headers.get('location'), '/');
  assert.match(success.headers.get('set-cookie'), /HttpOnly/);
  assert.match(success.headers.get('set-cookie'), /SameSite=Lax/);
  const replay = await h.request('/auth/callback?state=' + tx.state + '&code=member', {headers: {cookie: flow}});
  assert.equal(replay.headers.get('location'), '/login?error=authorization');
  await h.request('/auth/login');
  const wrongBrowser = await h.request('/auth/callback?state=' + h.transactions.at(-1).state + '&code=member');
  assert.equal(wrongBrowser.headers.get('location'), '/login?error=authorization');
});
test('guest callbacks and provider errors expose no provider details or credentials', async t => {
  const h = await fixture(t);
  for (const code of ['guest', 'provider-error']) {
    const start = await h.request('/auth/login');
    const response = await h.request('/auth/callback?state=' + h.transactions.at(-1).state + '&code=' + code, {headers: {cookie: start.headers.get('set-cookie').split(';')[0]}});
    assert.equal(response.headers.get('location'), '/login?error=authorization');
  }
  assert.ok(!JSON.stringify(h.events).includes('sensitive provider detail'));
  assert.ok(!JSON.stringify(h.events).includes('synthetic-test-credential'));
});
test('production cookies are Secure, HttpOnly, SameSite and host-only', async t => {
  const h = await fixture(t, {production: true, origin: 'https://planificador.frh.utn.edu.ar'});
  const start = await h.request('/auth/login');
  assert.match(start.headers.get('set-cookie'), /__Host-planificador-flow=/);
  assert.match(start.headers.get('set-cookie'), /Secure/);
  assert.ok(!start.headers.get('set-cookie').includes('Domain='));
});

test('stale tabs cannot read or write with another account cookie', async t => {
  const h = await fixture(t), a = await h.session(), b = await h.session(otherOid);
  const response = await h.request('/api/plans/mecanica', {headers: {...headers(h, b), 'x-portal-account': a.account}});
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'account_changed');
  const write = await h.request('/api/plans/mecanica', {method: 'PUT', headers: {...headers(h, b), 'x-portal-account': a.account}, body: JSON.stringify({revision: 0, data: payload})});
  assert.equal(write.status, 409);
  assert.equal(await h.store.getPlan(b.session.userId, 'mecanica'), null);
});

test('reauthorization rotates the cookie without extending idle or absolute age', async t => {
  const h = await fixture(t), a = await h.session();
  h.advance(h.config.policy.revalidateMs);
  const start = await h.request('/auth/login?renew=1', {headers: {cookie: a.cookie}});
  const tx = h.transactions.at(-1);
  assert.equal(tx.silent, true);
  const flow = start.headers.get('set-cookie').split(';')[0];
  const response = await h.request('/auth/callback?state=' + tx.state + '&code=member', {headers: {cookie: a.cookie + '; ' + flow}});
  assert.equal(response.headers.get('location'), '/');
  assert.equal(await h.store.getSession(a.session.id), null);
  const sessionCookie = response.headers.getSetCookie().find(x => x.startsWith('planificador-session=')).split(';')[0];
  const current = await (await h.request('/api/session', {headers: {cookie: sessionCookie}})).json();
  assert.equal(current.expiresAt, a.session.expiresAt);
  assert.equal(current.revalidateAt, h.now() + h.config.policy.revalidateMs);
  assert.notEqual(current.csrf, a.session.csrf);
});

test('reauthorization cannot substitute a different institutional identity', async t => {
  const h = await fixture(t), a = await h.session();
  h.advance(h.config.policy.revalidateMs);
  const start = await h.request('/auth/login?renew=1', {headers: {cookie: a.cookie}});
  const tx = h.transactions.at(-1), flow = start.headers.get('set-cookie').split(';')[0];
  const response = await h.request('/auth/callback?state=' + tx.state + '&code=other', {headers: {cookie: a.cookie + '; ' + flow}});
  assert.equal(response.headers.get('location'), '/login?error=authorization');
  assert.equal((await h.request('/api/session', {headers: {cookie: a.cookie}})).status, 401);
});
