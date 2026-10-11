import { once } from 'node:events';
import { createStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { digest, memberIdentity, token } from '../server/security.js';

export const tenant = '11111111-1111-1111-1111-111111111111';
export const client = '22222222-2222-2222-2222-222222222222';
export const oid = '33333333-3333-3333-3333-333333333333';
export const otherOid = '44444444-4444-4444-4444-444444444444';
export function testConfig(extra = {}) {
  return {...readConfig({NODE_ENV: 'test', MICROSOFT_TENANT_ID: tenant, MICROSOFT_CLIENT_ID: client,
    MICROSOFT_CLIENT_SECRET: 'synthetic-test-credential', SESSION_SECRET: 'test-only-key-that-is-not-a-production-secret', SQLITE_PATH: ':memory:'}), ...extra};
}
export async function harness(extra = {}) {
  const config = testConfig(extra);
  const store = await createStore(config);
  await store.migrate();
  let clock = Date.now();
  const events = [], transactions = [];
  const entra = {
    async authorize(tx, silent) { transactions.push({...tx, silent}); return 'https://login.microsoftonline.com/example'; },
    async exchange(code, tx) {
      if (code === 'provider-error') throw new Error('sensitive provider detail');
      return memberIdentity({tid: tenant, oid: code === 'other' ? otherOid : oid, acct: code === 'guest' ? 1 : 0, nonce: tx.nonce, name: 'Cuenta de prueba', preferred_username: 'prueba@example.invalid'}, tenant, tx.nonce);
    },
    logoutUrl: () => 'https://login.microsoftonline.com/example/logout',
  };
  const app = await createApp({config, store, entra, now: () => clock, audit: event => events.push(event)});
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  return {
    config, store, origin, events, transactions,
    now: () => clock,
    advance: ms => { clock += ms; },
    request: (path, options = {}) => fetch(origin + path, {...options, redirect: 'manual'}),
    async session(objectId = oid, overrides = {}) {
      const user = await store.upsertUser({id: tenant + ':' + objectId, name: 'Cuenta de prueba', email: 'prueba@example.invalid'});
      const raw = token();
      const session = {id: digest(raw, config.sessionSecret), userId: user.id, csrf: token(), createdAt: clock,
        lastActive: clock, validatedAt: clock, expiresAt: clock + config.policy.idleMs, ...overrides};
      await store.saveSession(session);
      const name = config.production ? '__Host-planificador' : 'planificador-session';
      return {raw, session, cookie: name + '=' + raw, account: digest(user.id, config.sessionSecret)};
    },
    async close() {
      const closing = new Promise(resolve => server.close(resolve));
      server.closeAllConnections();
      await closing;
      await store.close();
    },
  };
}
