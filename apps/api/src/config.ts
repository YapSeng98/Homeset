import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export interface Config {
  port: number;
  host: string;
  /** SQLite file and uploads live here. */
  dataDir: string;
  /** Built web app to serve in production (apps/web/dist). */
  webDist: string;
  maxUploadBytes: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? '127.0.0.1',
    dataDir: path.resolve(env.DATA_DIR ?? path.join(root, 'data')),
    webDist: path.resolve(env.WEB_DIST ?? path.join(root, 'apps/web/dist')),
    maxUploadBytes: Number(env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024,
  };
}
