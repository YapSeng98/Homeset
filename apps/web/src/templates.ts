import {
  createEmptyModel,
  createId,
  FLOOR_BY_ROOM_TYPE,
  pointInPolygon,
  syncRooms,
  type HomeModel,
  type Item,
  type Opening,
  type Region,
  type RoomType,
  type Vec2,
  type Wall,
} from '@homeset/core';

const EXT = 200;
const INT = 120;

/**
 * A generic ~1,100 sq ft 3-bedroom apartment for demos and first-time users.
 * Later: a library of real layouts (HDB flat types, popular condo layouts).
 */
export function sampleApartment(name: string, region: Region): HomeModel {
  const model = createEmptyModel(name, region);
  const level = model.levels[0]!;

  const w = (id: string, a: Vec2, b: Vec2, thickness: number, height?: number): Wall => ({ id, a, b, thickness, ...(height ? { height } : {}) });
  level.walls = [
    w('e-top', [0, 0], [12000, 0], EXT),
    w('e-right', [12000, 0], [12000, 8400], EXT),
    w('e-bottom', [12000, 8400], [0, 8400], EXT),
    w('e-left', [0, 8400], [0, 0], EXT),
    w('i-row', [0, 3600], [12000, 3600], INT),
    w('i-kitchen', [3000, 0], [3000, 3600], INT),
    w('i-bed2', [6500, 0], [6500, 3600], INT),
    w('i-ensuite', [9800, 0], [9800, 2400], INT),
    w('i-ensuite-b', [9800, 2400], [12000, 2400], INT),
    w('i-living', [8000, 3600], [8000, 8400], INT),
    w('i-bed3', [8000, 5600], [12000, 5600], INT),
    w('i-store', [10000, 3600], [10000, 5600], INT),
    w('b-left', [1000, 8400], [1000, 9900], 150, 1100),
    w('b-front', [1000, 9900], [6000, 9900], 150, 1100),
    w('b-right', [6000, 9900], [6000, 8400], 150, 1100),
  ];

  const o = (wallId: string, kind: Opening['kind'], offset: number, width: number, extra: Partial<Opening> = {}): Opening => {
    const base = kind === 'window' ? { height: 1200, sill: 900 } : { height: 2100, sill: 0 };
    return { id: createId('op'), wallId, kind, offset, width, ...base, ...extra };
  };
  level.openings = [
    o('i-row', 'opening', 1500, 1600),
    o('i-row', 'door', 4200, 900),
    o('i-row', 'door', 7250, 900),
    o('i-ensuite', 'door', 1800, 800, { flip: true }),
    o('i-living', 'door', 1000, 800, { flip: true }),
    o('i-living', 'door', 2700, 900, { flip: true }),
    o('i-bed3', 'door', 3000, 800),
    o('e-left', 'door', 2400, 1000, { flip: true }),
    o('e-top', 'window', 1500, 1200),
    o('e-top', 'window', 4750, 1500),
    o('e-top', 'window', 8150, 1800),
    o('e-right', 'window', 1200, 600, { sill: 1500, height: 600 }),
    o('e-right', 'window', 7000, 1500),
    o('e-bottom', 'window', 2000, 1500),
    o('e-bottom', 'window', 5000, 1500),
    o('e-bottom', 'sliding-door', 8500, 2400),
  ];

  const names: [Vec2, string, RoomType][] = [
    [[1500, 1800], 'Kitchen', 'kitchen'],
    [[4750, 1800], 'Bedroom 2', 'bedroom'],
    [[8000, 1800], 'Master Bedroom', 'master'],
    [[10900, 1200], 'Master Bath', 'bathroom'],
    [[4000, 6000], 'Living & Dining', 'living'],
    [[9000, 4600], 'Common Bath', 'bathroom'],
    [[11000, 4600], 'Store', 'utility'],
    [[10000, 7000], 'Bedroom 3', 'bedroom'],
    [[3500, 9150], 'Balcony', 'balcony'],
  ];
  level.rooms = syncRooms([], level.walls).map((room) => {
    const hit = names.find(([p]) => pointInPolygon(p, room.polygon));
    if (!hit) return room;
    const type = hit[2];
    return { ...room, name: hit[1], type, floorMaterial: FLOOR_BY_ROOM_TYPE[type] ?? 'floor-tile-cream', ...(type === 'master' ? { wallMaterial: 'paint-greige' } : {}), ...(type === 'living' ? { wallMaterial: 'paint-warm' } : {}) };
  });

  const it = (catalogId: string, position: Vec2, rotation = 0, elevation = 0, size: Partial<Pick<Item, 'width' | 'depth' | 'height'>> = {}): Item => ({
    id: createId('itm'),
    catalogId,
    position,
    rotation,
    elevation,
    ...size,
  });
  level.items = [
    // Living & dining (photoscanned furniture where available)
    it('sideboard', [5700, 3920], 0, 0, { width: 2100 }),
    it('tv-65', [5700, 3700], 0, 1000),
    it('vase-tall', [6500, 3900], 0, 680),
    it('rug', [5700, 5650]),
    it('sofa-leather', [5700, 6750], 180),
    it('side-table', [4500, 6850], 180),
    it('coffee-table-stone', [5700, 5500]),
    it('vase-round', [5950, 5500], 0, 390),
    it('armchair-modern', [7300, 5450], 90),
    it('dining-table', [2300, 6200]),
    ...[1780, 2300, 2820].flatMap((x) => [it('dining-chair', [x, 5580]), it('dining-chair', [x, 6820], 180)]),
    it('plant', [500, 7950]),
    it('floor-lamp', [7400, 7900]),
    // Kitchen
    it('kitchen-base', [1500, 400]),
    it('fridge', [2590, 2900], 90),
    it('washer', [400, 2900], 270),
    // Bedroom 2
    it('bed-queen', [5415, 1800], 90),
    it('wardrobe', [3360, 1600], 270),
    it('bedside', [6215, 760], 90),
    it('desk', [4750, 360]),
    it('chair', [4750, 950], 180),
    // Master
    it('bed-king', [7610, 1800], 270),
    it('bedside', [6760, 610], 270),
    it('bedside', [6760, 2990], 270),
    it('wardrobe', [8900, 3240], 180),
    // Master bath
    it('wc', [10300, 410]),
    it('vanity', [11300, 340]),
    it('shower', [11450, 1850]),
    // Common bath
    it('wc', [9590, 4100], 90),
    it('vanity', [8700, 3900]),
    it('shower', [9450, 5050]),
    // Bedroom 3
    it('bed-queen', [9300, 6685]),
    it('bedside', [8270, 5880]),
    it('desk', [11000, 8040], 180),
    it('chair', [11000, 7500]),
    // Store and balcony
    it('display-shelf', [11715, 4600], 90),
    it('lounge-chair', [2300, 9120]),
    it('plant', [5500, 9450]),
  ];
  return model;
}
