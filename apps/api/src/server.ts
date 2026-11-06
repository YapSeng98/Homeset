import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from './app';
import { loadConfig } from './config';
import { SqliteStore } from './store/sqlite';

const config = loadConfig();
fs.mkdirSync(config.dataDir, { recursive: true });
const store = new SqliteStore(path.join(config.dataDir, 'rumah3d.db'));
const app = await buildApp(store, config);

const shutdown = async () => {
  await app.close();
  store.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.port, host: config.host });
