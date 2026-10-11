import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createStore } from '../server/store.js';
import { testConfig, tenant, oid } from './helpers.js';

test('SQLite preserves plans across restarts and migrations are idempotent', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'planificador-test-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const config = testConfig({sqlitePath: join(directory, 'test.sqlite')});
  let store = await createStore(config);
  await store.migrate(); await store.migrate();
  const id = tenant + ':' + oid;
  await store.upsertUser({id, name: 'Prueba'});
  await store.putPlan(id, 'mecanica', 0, {version: 1, estados: {}}, Date.now());
  await store.putSchedules({cycle: '2026', careers: {mecanica: []}, hash: 'test-snapshot'});
  await store.close();
  store = await createStore(config);
  try {
    assert.equal((await store.getPlan(id, 'mecanica')).revision, 1);
    assert.equal((await store.getSchedules()).hash, 'test-snapshot');
  }
  finally { await store.close(); }
});
test('PostgreSQL adapter exercises schema, revisions, single-use state and revocation', async () => {
  const db = new PGlite();
  const pool = {
    on() {},
    async query(sql, args = []) {
      if (!args.length && sql.includes(';')) { await db.exec(sql); return {rows: []}; }
      return db.query(sql, args);
    },
    end: () => db.close(),
  };
  const store = await createStore(testConfig(), pool);
  try {
    await store.migrate(); await store.migrate();
    await store.putSchedules({cycle: '2026', hash: 'first'});
    await store.putSchedules({cycle: '2027', hash: 'second'});
    assert.equal((await store.getSchedules()).hash, 'second');
    const id = tenant + ':' + oid;
    await store.upsertUser({id, name: 'Prueba'});
    assert.equal((await store.putPlan(id, 'mecanica', 0, {version: 1, estados: {}}, Date.now())).revision, 1);
    assert.equal(await store.putPlan(id, 'mecanica', 0, {version: 1, estados: {}}, Date.now()), null);
    await store.saveTransaction({id: 'transaction', expiresAt: Date.now() + 1000});
    assert.equal((await store.takeTransaction('transaction')).id, 'transaction');
    assert.equal(await store.takeTransaction('transaction'), null);
    await store.saveSession({id: 'session', userId: id, expiresAt: Date.now() + 1000});
    await store.setBlocked(id, true);
    assert.equal(await store.getSession('session'), null);
    assert.equal((await store.getUser(id)).blocked, true);
  } finally { await store.close(); }
});
