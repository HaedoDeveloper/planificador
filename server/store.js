import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const schema = `
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, profile TEXT NOT NULL, blocked INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), payload TEXT NOT NULL, expires_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS auth_transactions (id TEXT PRIMARY KEY, payload TEXT NOT NULL, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS plans (user_id TEXT NOT NULL REFERENCES users(id), career TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(user_id, career));
CREATE TABLE IF NOT EXISTS schedule_catalog (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
INSERT INTO schema_version(version) VALUES (1) ON CONFLICT DO NOTHING;
INSERT INTO schema_version(version) VALUES (2) ON CONFLICT DO NOTHING;
`;

export async function createStore(config, suppliedPool) {
  let query, close, kind;
  if (config.databaseUrl || suppliedPool) {
    const { Pool } = await import('pg');
    const pool = suppliedPool || new Pool({connectionString: config.databaseUrl, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000});
    pool.on('error', () => console.error(JSON.stringify({event: 'database_pool_error'})));
    query = async (sql, args = []) => (await pool.query(sql, args)).rows;
    close = () => pool.end();
    kind = 'postgres';
  } else {
    const { DatabaseSync } = await import('node:sqlite');
    const path = config.sqlitePath === ':memory:' ? ':memory:' : resolve(config.sqlitePath);
    if (path !== ':memory:') await mkdir(dirname(path), {recursive: true});
    const db = new DatabaseSync(path);
    db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    query = async (sql, args = []) => {
      if (!args.length && sql.includes(';')) { db.exec(sql); return []; }
      const params = [];
      const sqliteSql = sql.replace(/\$(\d+)/g, (_, n) => { params.push(args[Number(n) - 1]); return '?'; });
      return db.prepare(sqliteSql).all(...params);
    };
    close = async () => db.close();
    kind = 'sqlite';
  }
  const unpack = row => row ? JSON.parse(row.payload) : null;
  return {
    kind, close,
    migrate: () => query(schema),
    healthy: () => query('SELECT 1 AS ok'),
    async getSchedules() { return unpack((await query('SELECT payload FROM schedule_catalog WHERE id=1'))[0]); },
    async putSchedules(catalog) {
      await query('INSERT INTO schedule_catalog(id,payload) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload', [JSON.stringify(catalog)]);
    },
    async upsertUser(profile) {
      await query('INSERT INTO users(id,profile) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET profile=excluded.profile', [profile.id, JSON.stringify(profile)]);
      return this.getUser(profile.id);
    },
    async getUser(id) {
      const [row] = await query('SELECT profile,blocked FROM users WHERE id=$1', [id]);
      return row ? {...JSON.parse(row.profile), blocked: !!row.blocked} : null;
    },
    async setBlocked(id, blocked) {
      const rows = await query('UPDATE users SET blocked=$2 WHERE id=$1 RETURNING id', [id, blocked ? 1 : 0]);
      if (blocked) await query('DELETE FROM sessions WHERE user_id=$1', [id]);
      return rows.length > 0;
    },
    async saveSession(session) {
      await query('INSERT INTO sessions(id,user_id,payload,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at',
        [session.id, session.userId, JSON.stringify(session), session.expiresAt]);
    },
    async updateSession(session) {
      await query('UPDATE sessions SET payload=$2,expires_at=$3 WHERE id=$1', [session.id, JSON.stringify(session), session.expiresAt]);
    },
    async getSession(id) { return unpack((await query('SELECT payload FROM sessions WHERE id=$1', [id]))[0]); },
    async deleteSession(id) { await query('DELETE FROM sessions WHERE id=$1', [id]); },
    async revokeSessions(userId) { await query('DELETE FROM sessions WHERE user_id=$1', [userId]); },
    async saveTransaction(tx) { await query('INSERT INTO auth_transactions(id,payload,expires_at) VALUES($1,$2,$3)', [tx.id, JSON.stringify(tx), tx.expiresAt]); },
    async takeTransaction(id) { return unpack((await query('DELETE FROM auth_transactions WHERE id=$1 RETURNING payload', [id]))[0]); },
    async getPlan(userId, career) { return unpack((await query('SELECT payload FROM plans WHERE user_id=$1 AND career=$2', [userId, career]))[0]); },
    async putPlan(userId, career, expected, data, now) {
      const revision = expected + 1;
      const record = {revision, data, updatedAt: new Date(now).toISOString()};
      let rows;
      if (expected === 0) {
        rows = await query('INSERT INTO plans(user_id,career,revision,payload) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,career) DO NOTHING RETURNING revision', [userId, career, revision, JSON.stringify(record)]);
      } else {
        rows = await query('UPDATE plans SET revision=$3,payload=$4 WHERE user_id=$1 AND career=$2 AND revision=$5 RETURNING revision', [userId, career, revision, JSON.stringify(record), expected]);
      }
      return rows.length ? record : null;
    },
    async cleanup(now) {
      await query('DELETE FROM sessions WHERE expires_at <= $1', [now]);
      await query('DELETE FROM auth_transactions WHERE expires_at <= $1', [now]);
    },
  };
}
