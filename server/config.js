export const SESSION_POLICY = Object.freeze({
  idleMs: 30 * 60_000,
  absoluteMs: 8 * 60 * 60_000,
  revalidateMs: 15 * 60_000,
  transactionMs: 5 * 60_000,
});

export function readConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const origin = new URL(env.APP_ORIGIN || 'http://localhost:3000');
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('APP_ORIGIN must use HTTP or HTTPS.');
  if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
    throw new Error('APP_ORIGIN must contain only the origin.');
  }
  if (production && origin.protocol !== 'https:') throw new Error('Production requires HTTPS.');
  if (!production && origin.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(origin.hostname)) {
    throw new Error('HTTP development is restricted to loopback.');
  }
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const tenantId = (env.MICROSOFT_TENANT_ID || '').toLowerCase();
  const clientId = (env.MICROSOFT_CLIENT_ID || '').toLowerCase();
  for (const value of [tenantId, clientId]) {
    if (value && !guid.test(value)) throw new Error('Microsoft identifiers must be GUIDs.');
  }
  const secret = env.SESSION_SECRET || '';
  if (secret && Buffer.byteLength(secret) < 32) throw new Error('SESSION_SECRET requires at least 32 bytes.');
  if (production && !secret) throw new Error('Production requires SESSION_SECRET.');
  if (production && !env.DATABASE_URL) throw new Error('Production requires PostgreSQL DATABASE_URL.');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  const host = env.HOST || '127.0.0.1';
  const scheduleRefreshMinutes = Number(env.SCHEDULE_REFRESH_MINUTES || 360);
  if (!Number.isInteger(scheduleRefreshMinutes) || scheduleRefreshMinutes < 15 || scheduleRefreshMinutes > 1440) {
    throw new Error('SCHEDULE_REFRESH_MINUTES must be between 15 and 1440.');
  }
  if (!['127.0.0.1', '::1'].includes(host)) throw new Error('The application must bind to loopback.');
  const authConfigured = !!(tenantId && clientId && env.MICROSOFT_CLIENT_SECRET && secret);
  const developmentLoginEnabled = (env.NODE_ENV || 'development') === 'development' &&
    env.DEV_LOGIN_ENABLED === 'true' && !authConfigured && env.TRUST_PROXY !== 'true' &&
    ['localhost', '127.0.0.1'].includes(origin.hostname);
  return {
    production, origin: origin.origin, host, port, tenantId, clientId,
    clientSecret: env.MICROSOFT_CLIENT_SECRET || '', sessionSecret: secret,
    databaseUrl: env.DATABASE_URL || '', sqlitePath: env.SQLITE_PATH || '.data/planificador.sqlite',
    trustProxy: env.TRUST_PROXY === 'true', policy: SESSION_POLICY,
    authConfigured, developmentLoginEnabled,
    scheduleRefreshMs: scheduleRefreshMinutes * 60_000,
  };
}
