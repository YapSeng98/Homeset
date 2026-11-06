import type { Currency, Lang } from './region';

export type LocalizedText = { en: string } & Partial<Record<Exclude<Lang, 'en'>, string>>;

export const localize = (text: LocalizedText, lang: Lang): string => text[lang] ?? text.en;

export type CatalogCategory = 'living' | 'dining' | 'bedroom' | 'study' | 'kitchen' | 'bathroom' | 'decor';

export type ItemModel =
  /** Built from code by a named builder in @rumah3d/viewer3d (fast, tiny, no assets). */
  | { kind: 'procedural'; builder: string; color?: string; accent?: string; options?: Record<string, number> }
  /** A glTF/GLB file, scaled to the item size. */
  | { kind: 'gltf'; url: string };

export interface CatalogItem {
  id: string;
  name: LocalizedText;
  category: CatalogCategory;
  /** Width (x), depth (y in plan), height, in mm. */
  size: { w: number; d: number; h: number };
  model: ItemModel;
  placement?: 'floor' | 'wall';
  defaultElevation?: number;
  price?: Partial<Record<Currency, number>>;
  tags?: string[];
}

export type MaterialPattern = 'plain' | 'planks' | 'tiles' | 'marble' | 'concrete';

export interface MaterialDef {
  id: string;
  name: LocalizedText;
  usage: ('floor' | 'wall')[];
  color: string;
  roughness: number;
  pattern: MaterialPattern;
  /** Plank width or tile size in mm. */
  tileSize?: number;
  /** Plank length or tile height in mm (defaults to tileSize). */
  tileLength?: number;
  accentColor?: string;
  pricePerSqm?: Partial<Record<Currency, number>>;
}

/**
 * A plugin adds content (and later tools, panels, exporters) without touching core code.
 * The built-in catalog is itself a plugin; supplier catalogs can be added the same way.
 */
export interface Plugin {
  id: string;
  name: string;
  catalogItems?: CatalogItem[];
  materials?: MaterialDef[];
}

export const definePlugin = (plugin: Plugin): Plugin => plugin;

export class Registry {
  readonly items = new Map<string, CatalogItem>();
  readonly materials = new Map<string, MaterialDef>();
  readonly plugins: Plugin[] = [];

  constructor(plugins: Plugin[] = []) {
    plugins.forEach((p) => this.use(p));
  }

  use(plugin: Plugin): this {
    this.plugins.push(plugin);
    plugin.catalogItems?.forEach((i) => this.items.set(i.id, i));
    plugin.materials?.forEach((m) => this.materials.set(m.id, m));
    return this;
  }

  item(id: string): CatalogItem | undefined {
    return this.items.get(id);
  }

  material(id: string | undefined): MaterialDef | undefined {
    return id ? this.materials.get(id) : undefined;
  }

  materialsFor(usage: 'floor' | 'wall'): MaterialDef[] {
    return [...this.materials.values()].filter((m) => m.usage.includes(usage));
  }

  itemsByCategory(): Map<CatalogCategory, CatalogItem[]> {
    const out = new Map<CatalogCategory, CatalogItem[]>();
    for (const item of this.items.values()) {
      const list = out.get(item.category) ?? [];
      list.push(item);
      out.set(item.category, list);
    }
    return out;
  }
}
