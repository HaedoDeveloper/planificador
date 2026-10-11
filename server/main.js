import { readConfig } from './config.js';
import { createStore } from './store.js';
import { createEntra } from './entra.js';
import { createApp } from './app.js';
import { token } from './security.js';
import { createSchedules } from './schedules.js';

const config = readConfig();
config.sessionSecret ||= token();
const store = await createStore(config);
await store.migrate();
const entra = config.authConfigured ? createEntra(config) : null;
const schedules = await createSchedules({store, intervalMs: config.scheduleRefreshMs});
const app = await createApp({config, store, entra, schedules});
const server = app.listen(config.port, config.host, () => {
  console.log(JSON.stringify({event: 'started', origin: config.origin, storage: store.kind, authConfigured: config.authConfigured}));
});
server.requestTimeout = 30_000;
server.headersTimeout = 15_000;
const cleanup = setInterval(() => store.cleanup(Date.now()).catch(() => console.error(JSON.stringify({event: 'cleanup_failed'}))), 60_000);
cleanup.unref();
schedules.start();
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(cleanup);
  const timeout = setTimeout(() => process.exit(1), 10_000);
  timeout.unref();
  server.close(async () => { await schedules.stop(); await store.close(); clearTimeout(timeout); });
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
