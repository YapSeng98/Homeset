import { defaultCatalogPlugin, Registry } from '@rumah3d/core';

/**
 * Everything the app can place or paint comes from plugins.
 * Add supplier catalogs here (e.g. `registry.use(acmeTilesPlugin)`).
 */
export const registry = new Registry([defaultCatalogPlugin]);
