import { defaultCatalogPlugin, Registry, type Plugin } from '@homeset/core';

/** Catalog models live in public/; prefix them when the app is served from a sub-path (e.g. /Homeset/ on GitHub Pages). */
const withBasePath = (plugin: Plugin): Plugin => ({
  ...plugin,
  catalogItems: plugin.catalogItems?.map((item) =>
    item.model.kind === 'gltf' && item.model.url.startsWith('/') ? { ...item, model: { ...item.model, url: import.meta.env.BASE_URL + item.model.url.slice(1) } } : item,
  ),
});

/**
 * Everything the app can place or paint comes from plugins.
 * Add supplier catalogs here (e.g. `registry.use(acmeTilesPlugin)`).
 */
export const registry = new Registry([withBasePath(defaultCatalogPlugin)]);
