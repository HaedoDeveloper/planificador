import { readConfig } from './config.js';
import { createStore } from './store.js';

const store = await createStore(readConfig());
try { await store.migrate(); console.log('Schema version 1 ready.'); }
finally { await store.close(); }
