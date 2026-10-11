import { readConfig } from './config.js';
import { createStore } from './store.js';

const [action, identity] = process.argv.slice(2);
if (!['block', 'unblock', 'revoke'].includes(action) || !/^[0-9a-f-]{36}:[0-9a-f-]{36}$/i.test(identity || '')) {
  console.error('Usage: npm run admin -- block|unblock|revoke <tenant-id>:<object-id>');
  process.exitCode = 1;
} else {
  const store = await createStore(readConfig());
  try {
    const user = await store.getUser(identity.toLowerCase());
    if (!user) throw new Error('Identity not found.');
    if (action === 'revoke') await store.revokeSessions(user.id);
    else await store.setBlocked(user.id, action === 'block');
    console.log(JSON.stringify({event: 'administrative_access_change', action}));
  } finally { await store.close(); }
}
