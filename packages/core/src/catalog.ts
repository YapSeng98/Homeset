import { definePlugin, type CatalogItem, type MaterialDef } from './plugins';

// Prices are sample values for demos only; real prices come from supplier catalogs.

/** Photoscanned models served by the web app (apps/web/public/catalog). */
const scan = (id: string) => `/catalog/polyhaven/${id}/${id}.gltf`;

const items: CatalogItem[] = [
  // Living
  { id: 'sofa-3', name: { en: '3-Seater Sofa', ms: 'Sofa 3 Tempat Duduk', zh: '三人沙发' }, category: 'living', size: { w: 2100, d: 900, h: 820 }, model: { kind: 'procedural', builder: 'sofa', color: '#b7aa98' }, price: { MYR: 2800, SGD: 1200 } },
  { id: 'sofa-l', name: { en: 'L-Shaped Sofa', ms: 'Sofa Bentuk L', zh: 'L型沙发' }, category: 'living', size: { w: 2700, d: 1650, h: 820 }, model: { kind: 'procedural', builder: 'sofa-l', color: '#8d8a84' }, price: { MYR: 4200, SGD: 1900 } },
  { id: 'armchair', name: { en: 'Armchair', ms: 'Kerusi Berlengan', zh: '单人沙发' }, category: 'living', size: { w: 850, d: 850, h: 800 }, model: { kind: 'procedural', builder: 'armchair', color: '#a0643c' }, price: { MYR: 900, SGD: 450 } },
  { id: 'coffee-table', name: { en: 'Coffee Table', ms: 'Meja Kopi', zh: '茶几' }, category: 'living', size: { w: 1200, d: 600, h: 400 }, model: { kind: 'procedural', builder: 'table', color: '#8a6a4a' }, price: { MYR: 650, SGD: 280 } },
  { id: 'tv-console', name: { en: 'TV Console', ms: 'Kabinet TV', zh: '电视柜' }, category: 'living', size: { w: 1800, d: 400, h: 480 }, model: { kind: 'procedural', builder: 'cabinet', color: '#d8cfc2', accent: '#8a6a4a' }, price: { MYR: 1200, SGD: 500 } },
  { id: 'tv-65', name: { en: '65" TV (wall-mounted)', ms: 'TV 65" (dinding)', zh: '65寸电视（挂墙）' }, category: 'living', size: { w: 1450, d: 60, h: 840 }, model: { kind: 'procedural', builder: 'tv' }, placement: 'wall', defaultElevation: 900, price: { MYR: 3500, SGD: 1400 } },
  { id: 'rug', name: { en: 'Area Rug', ms: 'Permaidani', zh: '地毯' }, category: 'decor', size: { w: 2000, d: 1400, h: 10 }, model: { kind: 'procedural', builder: 'rug', color: '#d9cdb8' }, price: { MYR: 450, SGD: 180 } },
  { id: 'plant', name: { en: 'Indoor Plant', ms: 'Pokok Hiasan', zh: '室内植物' }, category: 'decor', size: { w: 500, d: 500, h: 1300 }, model: { kind: 'procedural', builder: 'plant' }, price: { MYR: 180, SGD: 80 } },
  { id: 'floor-lamp', name: { en: 'Floor Lamp', ms: 'Lampu Lantai', zh: '落地灯' }, category: 'decor', size: { w: 400, d: 400, h: 1600 }, model: { kind: 'procedural', builder: 'lamp' }, price: { MYR: 350, SGD: 150 } },
  { id: 'bookshelf', name: { en: 'Bookshelf', ms: 'Rak Buku', zh: '书架' }, category: 'study', size: { w: 900, d: 350, h: 1800 }, model: { kind: 'procedural', builder: 'shelf', color: '#c9b79c' }, price: { MYR: 550, SGD: 230 } },

  // Dining
  { id: 'dining-4', name: { en: 'Dining Set (4 seats)', ms: 'Set Makan (4 kerusi)', zh: '四人餐桌椅' }, category: 'dining', size: { w: 1200, d: 1400, h: 760 }, model: { kind: 'procedural', builder: 'dining-set', color: '#8a6a4a', options: { seats: 4 } }, price: { MYR: 1800, SGD: 750 } },
  { id: 'dining-6', name: { en: 'Dining Set (6 seats)', ms: 'Set Makan (6 kerusi)', zh: '六人餐桌椅' }, category: 'dining', size: { w: 1800, d: 1400, h: 760 }, model: { kind: 'procedural', builder: 'dining-set', color: '#6b4a33', options: { seats: 6 } }, price: { MYR: 2600, SGD: 1100 } },

  // Bedroom
  { id: 'bed-king', name: { en: 'King Bed', ms: 'Katil King', zh: '特大双人床' }, category: 'bedroom', size: { w: 1880, d: 2100, h: 1050 }, model: { kind: 'procedural', builder: 'bed', color: '#f1ede6', accent: '#7d6a58' }, price: { MYR: 3200, SGD: 1500 } },
  { id: 'bed-queen', name: { en: 'Queen Bed', ms: 'Katil Queen', zh: '双人床' }, category: 'bedroom', size: { w: 1580, d: 2050, h: 1000 }, model: { kind: 'procedural', builder: 'bed', color: '#f1ede6', accent: '#9a8775' }, price: { MYR: 2400, SGD: 1100 } },
  { id: 'bed-single', name: { en: 'Single Bed', ms: 'Katil Bujang', zh: '单人床' }, category: 'bedroom', size: { w: 960, d: 1960, h: 900 }, model: { kind: 'procedural', builder: 'bed', color: '#eef0f2', accent: '#8a9aa8' }, price: { MYR: 1100, SGD: 480 } },
  { id: 'bedside', name: { en: 'Bedside Table', ms: 'Meja Sisi Katil', zh: '床头柜' }, category: 'bedroom', size: { w: 450, d: 400, h: 500 }, model: { kind: 'procedural', builder: 'cabinet', color: '#c9b79c', accent: '#8a6a4a' }, price: { MYR: 250, SGD: 110 } },
  { id: 'wardrobe', name: { en: 'Wardrobe', ms: 'Almari Pakaian', zh: '衣柜' }, category: 'bedroom', size: { w: 1800, d: 600, h: 2400 }, model: { kind: 'procedural', builder: 'wardrobe', color: '#e9e4dc', accent: '#b0a596' }, price: { MYR: 3600, SGD: 1600 } },

  // Study
  { id: 'desk', name: { en: 'Study Desk', ms: 'Meja Belajar', zh: '书桌' }, category: 'study', size: { w: 1200, d: 600, h: 750 }, model: { kind: 'procedural', builder: 'desk', color: '#d8cfc2' }, price: { MYR: 600, SGD: 260 } },
  { id: 'chair', name: { en: 'Chair', ms: 'Kerusi', zh: '椅子' }, category: 'study', size: { w: 480, d: 520, h: 860 }, model: { kind: 'procedural', builder: 'chair', color: '#3c3c3c' }, price: { MYR: 280, SGD: 120 } },

  // Kitchen
  { id: 'kitchen-base', name: { en: 'Kitchen Base Cabinet (2.4 m)', ms: 'Kabinet Dapur Bawah (2.4 m)', zh: '厨房地柜（2.4米）' }, category: 'kitchen', size: { w: 2400, d: 600, h: 900 }, model: { kind: 'procedural', builder: 'kitchen-base', color: '#e9e4dc', accent: '#f4f3f0' }, price: { MYR: 4800, SGD: 2200 } },
  { id: 'kitchen-wall', name: { en: 'Kitchen Wall Cabinet (2.4 m)', ms: 'Kabinet Dapur Atas (2.4 m)', zh: '厨房吊柜（2.4米）' }, category: 'kitchen', size: { w: 2400, d: 350, h: 700 }, model: { kind: 'procedural', builder: 'cabinet', color: '#e9e4dc', accent: '#b0a596' }, placement: 'wall', defaultElevation: 1500, price: { MYR: 3200, SGD: 1500 } },
  { id: 'fridge', name: { en: 'Fridge', ms: 'Peti Sejuk', zh: '冰箱' }, category: 'kitchen', size: { w: 700, d: 700, h: 1800 }, model: { kind: 'procedural', builder: 'appliance', color: '#c9ccd0' }, price: { MYR: 2500, SGD: 1100 } },
  { id: 'washer', name: { en: 'Washing Machine', ms: 'Mesin Basuh', zh: '洗衣机' }, category: 'kitchen', size: { w: 600, d: 600, h: 850 }, model: { kind: 'procedural', builder: 'washer', color: '#f2f2f2' }, price: { MYR: 1500, SGD: 650 } },

  // Photoscanned models (Poly Haven, CC0). Sizes are the models' real dimensions.
  { id: 'sofa-leather', name: { en: 'Leather Sofa', ms: 'Sofa Kulit', zh: '真皮沙发' }, category: 'living', size: { w: 1810, d: 820, h: 710 }, model: { kind: 'gltf', url: scan('sofa_02') }, price: { MYR: 4500, SGD: 2000 }, tags: ['scan'] },
  { id: 'armchair-modern', name: { en: 'Modern Armchair', ms: 'Kerusi Berlengan Moden', zh: '现代扶手椅' }, category: 'living', size: { w: 820, d: 990, h: 1020 }, model: { kind: 'gltf', url: scan('modern_arm_chair_01') }, price: { MYR: 1600, SGD: 700 }, tags: ['scan'] },
  { id: 'lounge-chair', name: { en: 'Mid-century Lounge Chair', ms: 'Kerusi Rehat Klasik', zh: '中古休闲椅' }, category: 'living', size: { w: 1010, d: 1190, h: 1170 }, model: { kind: 'gltf', url: scan('mid_century_lounge_chair') }, price: { MYR: 2200, SGD: 950 }, tags: ['scan'] },
  { id: 'coffee-table-stone', name: { en: 'Coffee Table (stone top)', ms: 'Meja Kopi (atas batu)', zh: '石面茶几' }, category: 'living', size: { w: 1200, d: 600, h: 390 }, model: { kind: 'gltf', url: scan('modern_coffee_table_01') }, price: { MYR: 1100, SGD: 480 }, tags: ['scan'] },
  { id: 'coffee-table-round', name: { en: 'Round Marble Coffee Table', ms: 'Meja Kopi Bulat Marmar', zh: '圆形大理石茶几' }, category: 'living', size: { w: 1300, d: 1300, h: 490 }, model: { kind: 'gltf', url: scan('coffee_table_round_01') }, price: { MYR: 1500, SGD: 650 }, tags: ['scan'] },
  { id: 'sideboard', name: { en: 'Wooden Sideboard / TV Console', ms: 'Kabinet Kayu / Kabinet TV', zh: '实木边柜/电视柜' }, category: 'living', size: { w: 2440, d: 520, h: 680 }, model: { kind: 'gltf', url: scan('modern_wooden_cabinet') }, price: { MYR: 2600, SGD: 1150 }, tags: ['scan'] },
  { id: 'side-table', name: { en: 'Side Table', ms: 'Meja Sisi', zh: '边几' }, category: 'living', size: { w: 550, d: 450, h: 550 }, model: { kind: 'gltf', url: scan('side_table_01') }, price: { MYR: 350, SGD: 150 }, tags: ['scan'] },
  { id: 'dining-chair', name: { en: 'Dining Chair (leather)', ms: 'Kerusi Makan (kulit)', zh: '皮质餐椅' }, category: 'dining', size: { w: 435, d: 575, h: 975 }, model: { kind: 'gltf', url: scan('dining_chair_02') }, price: { MYR: 450, SGD: 200 }, tags: ['scan'] },
  { id: 'dining-table', name: { en: 'Dining Table', ms: 'Meja Makan', zh: '餐桌' }, category: 'dining', size: { w: 1600, d: 900, h: 750 }, model: { kind: 'procedural', builder: 'table', color: '#7a5a40' }, price: { MYR: 1400, SGD: 600 } },
  { id: 'drawer-shelf', name: { en: 'Shelf with Drawers', ms: 'Rak Berlaci', zh: '抽屉置物架' }, category: 'study', size: { w: 1140, d: 490, h: 1880 }, model: { kind: 'gltf', url: scan('drawer_cabinet') }, price: { MYR: 1300, SGD: 560 }, tags: ['scan'] },
  { id: 'display-shelf', name: { en: 'Display Shelf', ms: 'Rak Pameran', zh: '展示架' }, category: 'study', size: { w: 1080, d: 370, h: 1560 }, model: { kind: 'gltf', url: scan('wooden_display_shelves_01') }, price: { MYR: 600, SGD: 260 }, tags: ['scan'] },
  { id: 'vase-tall', name: { en: 'Tall Ceramic Vase', ms: 'Pasu Seramik Tinggi', zh: '高身陶瓷花瓶' }, category: 'decor', size: { w: 205, d: 205, h: 400 }, model: { kind: 'gltf', url: scan('ceramic_vase_01') }, price: { MYR: 120, SGD: 50 }, tags: ['scan'] },
  { id: 'vase-round', name: { en: 'Round Ceramic Vase', ms: 'Pasu Seramik Bulat', zh: '圆形陶瓷花瓶' }, category: 'decor', size: { w: 220, d: 220, h: 310 }, model: { kind: 'gltf', url: scan('ceramic_vase_02') }, price: { MYR: 110, SGD: 45 }, tags: ['scan'] },

  // Bathroom
  { id: 'wc', name: { en: 'Toilet (WC)', ms: 'Tandas', zh: '马桶' }, category: 'bathroom', size: { w: 400, d: 700, h: 760 }, model: { kind: 'procedural', builder: 'toilet' }, price: { MYR: 650, SGD: 300 } },
  { id: 'vanity', name: { en: 'Basin Vanity', ms: 'Sinki & Kabinet', zh: '洗手台' }, category: 'bathroom', size: { w: 800, d: 480, h: 850 }, model: { kind: 'procedural', builder: 'vanity', color: '#7d6a58' }, price: { MYR: 1200, SGD: 520 } },
  { id: 'shower', name: { en: 'Shower Screen', ms: 'Skrin Mandi', zh: '淋浴间' }, category: 'bathroom', size: { w: 900, d: 900, h: 2000 }, model: { kind: 'procedural', builder: 'shower' }, price: { MYR: 1400, SGD: 600 } },
];

const materials: MaterialDef[] = [
  // Floors
  { id: 'floor-oak', name: { en: 'Light Oak', ms: 'Kayu Oak Cerah', zh: '浅橡木' }, usage: ['floor'], color: '#c9a37b', roughness: 0.6, pattern: 'planks', tileSize: 190, tileLength: 1200, pricePerSqm: { MYR: 120, SGD: 60 } },
  { id: 'floor-walnut', name: { en: 'Walnut', ms: 'Kayu Walnut', zh: '胡桃木' }, usage: ['floor'], color: '#74523a', roughness: 0.55, pattern: 'planks', tileSize: 190, tileLength: 1200, pricePerSqm: { MYR: 160, SGD: 80 } },
  { id: 'floor-vinyl-grey', name: { en: 'Grey Oak Vinyl', ms: 'Vinil Oak Kelabu', zh: '灰橡木地板' }, usage: ['floor'], color: '#a59c90', roughness: 0.7, pattern: 'planks', tileSize: 180, tileLength: 1220, pricePerSqm: { MYR: 70, SGD: 35 } },
  { id: 'floor-tile-cream', name: { en: 'Cream Porcelain 600', ms: 'Jubin Porselin Krim 600', zh: '米色瓷砖600' }, usage: ['floor'], color: '#ddd6ca', roughness: 0.35, pattern: 'tiles', tileSize: 600, accentColor: '#c4bcae', pricePerSqm: { MYR: 80, SGD: 45 } },
  { id: 'floor-tile-grey', name: { en: 'Grey Porcelain 600', ms: 'Jubin Porselin Kelabu 600', zh: '灰色瓷砖600' }, usage: ['floor'], color: '#9b9a96', roughness: 0.4, pattern: 'tiles', tileSize: 600, accentColor: '#868580', pricePerSqm: { MYR: 80, SGD: 45 } },
  { id: 'floor-marble', name: { en: 'White Marble', ms: 'Marmar Putih', zh: '白色大理石' }, usage: ['floor', 'wall'], color: '#ece8e1', roughness: 0.2, pattern: 'marble', tileSize: 800, accentColor: '#b8b2a8', pricePerSqm: { MYR: 350, SGD: 180 } },
  { id: 'floor-cement', name: { en: 'Cement Screed', ms: 'Simen Licin', zh: '水泥地' }, usage: ['floor', 'wall'], color: '#9c9994', roughness: 0.8, pattern: 'concrete', pricePerSqm: { MYR: 90, SGD: 50 } },
  { id: 'floor-tile-bath', name: { en: 'Bathroom Tile 300', ms: 'Jubin Bilik Air 300', zh: '浴室砖300' }, usage: ['floor', 'wall'], color: '#e3e7e8', roughness: 0.3, pattern: 'tiles', tileSize: 300, accentColor: '#c9cfd1', pricePerSqm: { MYR: 70, SGD: 40 } },

  // Walls
  { id: 'paint-white', name: { en: 'Pure White', ms: 'Putih', zh: '纯白' }, usage: ['wall'], color: '#f3f1ec', roughness: 0.9, pattern: 'plain', pricePerSqm: { MYR: 12, SGD: 6 } },
  { id: 'paint-warm', name: { en: 'Warm White', ms: 'Putih Hangat', zh: '暖白' }, usage: ['wall'], color: '#eee4d4', roughness: 0.9, pattern: 'plain', pricePerSqm: { MYR: 12, SGD: 6 } },
  { id: 'paint-beige', name: { en: 'Sand Beige', ms: 'Kuning Pasir', zh: '沙色' }, usage: ['wall'], color: '#ddcdb4', roughness: 0.9, pattern: 'plain', pricePerSqm: { MYR: 12, SGD: 6 } },
  { id: 'paint-greige', name: { en: 'Greige', ms: 'Kelabu Krim', zh: '灰米色' }, usage: ['wall'], color: '#cbc3b7', roughness: 0.9, pattern: 'plain', pricePerSqm: { MYR: 12, SGD: 6 } },
  { id: 'paint-sage', name: { en: 'Sage Green', ms: 'Hijau Sage', zh: '鼠尾草绿' }, usage: ['wall'], color: '#b4c0a7', roughness: 0.9, pattern: 'plain', pricePerSqm: { MYR: 14, SGD: 7 } },
  { id: 'paint-grey', name: { en: 'Soft Grey', ms: 'Kelabu Lembut', zh: '浅灰' }, usage: ['wall'], color: '#c6c8c9', roughness: 0.9, pattern: 'plain', pricePerSqm: { MYR: 12, SGD: 6 } },
  { id: 'paint-navy', name: { en: 'Navy Accent', ms: 'Biru Tua', zh: '海军蓝' }, usage: ['wall'], color: '#2f3d55', roughness: 0.9, pattern: 'plain', pricePerSqm: { MYR: 16, SGD: 8 } },
  { id: 'paint-terracotta', name: { en: 'Terracotta', ms: 'Terakota', zh: '陶土色' }, usage: ['wall'], color: '#c07a5a', roughness: 0.9, pattern: 'plain', pricePerSqm: { MYR: 16, SGD: 8 } },
];

export const defaultCatalogPlugin = definePlugin({
  id: 'rumah3d.default-catalog',
  name: 'Default catalog',
  catalogItems: items,
  materials,
});

export const DEFAULT_FLOOR_MATERIAL = 'floor-tile-cream';
export const DEFAULT_WALL_MATERIAL = 'paint-white';

/** Sensible floor finish per room type for new rooms. */
export const FLOOR_BY_ROOM_TYPE: Partial<Record<string, string>> = {
  bathroom: 'floor-tile-bath',
  kitchen: 'floor-tile-grey',
  balcony: 'floor-tile-grey',
  utility: 'floor-tile-grey',
  bedroom: 'floor-vinyl-grey',
  master: 'floor-oak',
  study: 'floor-oak',
};
