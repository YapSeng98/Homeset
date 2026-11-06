import { createId } from './ids';
import { DEFAULTS, HomeModelSchema, SCHEMA_VERSION, type HomeModel, type Region } from './schema';
import { DEFAULT_FLOOR_MATERIAL, DEFAULT_WALL_MATERIAL } from './catalog';

export function createEmptyModel(name: string, region: Region): HomeModel {
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    region,
    northBearing: 0,
    levels: [
      {
        id: createId('lvl'),
        name: 'Ground floor',
        elevation: 0,
        height: DEFAULTS.levelHeight,
        defaultFloorMaterial: DEFAULT_FLOOR_MATERIAL,
        defaultWallMaterial: DEFAULT_WALL_MATERIAL,
        walls: [],
        openings: [],
        rooms: [],
        items: [],
      },
    ],
  };
}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * Upgrades stored models to the current schema.
 * Add an entry keyed by the version it upgrades FROM, e.g. `1: (m) => ({ ...m, schemaVersion: 2, ... })`.
 */
const MIGRATIONS: Record<number, Migration> = {};

export function migrateModel(raw: unknown): HomeModel {
  let data = (raw ?? {}) as Record<string, unknown>;
  let version = typeof data.schemaVersion === 'number' ? data.schemaVersion : SCHEMA_VERSION;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`No migration from schema version ${version}`);
    data = step(data);
    version += 1;
  }
  return HomeModelSchema.parse(data);
}
