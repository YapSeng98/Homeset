import { describe, expect, it } from 'vitest';
import type { Opening, Vec2, Wall } from '../schema';
import { area } from './polygon';
import { detectRoomPolygons, syncRooms } from './rooms';
import { computeWallFootprints, lineOfSight, wallPieces } from './walls';

const wall = (id: string, a: Vec2, b: Vec2, thickness = 200): Wall => ({ id, a, b, thickness });

/** 6m x 4m box, drawn clockwise in screen coordinates. */
const box = (): Wall[] => [
  wall('top', [0, 0], [6000, 0]),
  wall('right', [6000, 0], [6000, 4000]),
  wall('bottom', [6000, 4000], [0, 4000]),
  wall('left', [0, 4000], [0, 0]),
];

const close = (p: Vec2, q: Vec2) => {
  expect(p[0]).toBeCloseTo(q[0], 3);
  expect(p[1]).toBeCloseTo(q[1], 3);
};

describe('computeWallFootprints', () => {
  it('miters an L corner so outer and inner corners meet exactly', () => {
    const fps = computeWallFootprints([wall('h', [0, 0], [4000, 0]), wall('v', [4000, 0], [4000, 3000])]);
    const h = fps.get('h')!;
    const v = fps.get('v')!;
    // h: dir (1,0), plus side is +y. Corner at (4000,0): inner (3900,100), outer (4100,-100).
    close(h.endPlus, [3900, 100]);
    close(h.endMinus, [4100, -100]);
    // v starts at the same node; its plus side is -x.
    close(v.startPlus, [3900, 100]);
    close(v.startMinus, [4100, -100]);
  });

  it('squares off free ends', () => {
    const fp = computeWallFootprints([wall('w', [0, 0], [3000, 0], 100)]).get('w')!;
    close(fp.startPlus, [0, 50]);
    close(fp.startMinus, [0, -50]);
    close(fp.endPlus, [3000, 50]);
    close(fp.endMinus, [3000, -50]);
  });

  it('trims a T-junction wall to the face of the wall it meets', () => {
    const fps = computeWallFootprints([
      wall('host', [0, 0], [6000, 0], 200),
      wall('stem', [3000, 0], [3000, 3000], 100),
    ]);
    const stem = fps.get('stem')!;
    expect(stem.startPlus[1]).toBeCloseTo(100, 3);
    expect(stem.startMinus[1]).toBeCloseTo(100, 3);
  });
});

describe('wallPieces', () => {
  const w = wall('w', [0, 0], [5000, 0], 200);
  const fp = computeWallFootprints([w]).get('w')!;

  it('cuts a door as a gap with a lintel above', () => {
    const door: Opening = { id: 'd', wallId: 'w', kind: 'door', offset: 2500, width: 900, height: 2100, sill: 0 };
    const pieces = wallPieces(fp, [door], 2800);
    expect(pieces.map((p) => p.kind)).toEqual(['solid', 'above', 'solid']);
    const above = pieces[1]!;
    expect(above.bottom).toBe(2100);
    expect(above.top).toBe(2800);
    close(above.footprint[0], [2050, 100]);
    close(above.footprint[1], [2950, 100]);
  });

  it('cuts a window with wall below and above', () => {
    const win: Opening = { id: 'x', wallId: 'w', kind: 'window', offset: 1000, width: 1200, height: 1200, sill: 900 };
    const kinds = wallPieces(fp, [win], 2800).map((p) => `${p.kind}:${p.bottom}-${p.top}`);
    expect(kinds).toEqual(['solid:0-2800', 'below:0-900', 'above:2100-2800', 'solid:0-2800']);
  });

  it('returns one solid piece when there are no openings', () => {
    expect(wallPieces(fp, [], 2800)).toHaveLength(1);
  });
});

describe('detectRoomPolygons', () => {
  it('finds a single room and insets it by half the wall thickness', () => {
    const rooms = detectRoomPolygons(box());
    expect(rooms).toHaveLength(1);
    // (6000-200) x (4000-200)
    expect(area(rooms[0]!)).toBeCloseTo(5800 * 3800, 0);
  });

  it('splits a box into two rooms with a partition ending on the outer walls (T-junctions)', () => {
    const rooms = detectRoomPolygons([...box(), wall('mid', [3000, 0], [3000, 4000], 100)]);
    expect(rooms).toHaveLength(2);
    const areas = rooms.map(area).sort((a, b) => a - b);
    // Left: x 100..2950, right: x 3050..5900; y 100..3900
    expect(areas[0]).toBeCloseTo(2850 * 3800, 0);
    expect(areas[1]).toBeCloseTo(2850 * 3800, 0);
  });

  it('ignores dangling walls that do not enclose anything', () => {
    const rooms = detectRoomPolygons([...box(), wall('stub', [1000, 0], [1000, 1500], 100)]);
    expect(rooms).toHaveLength(1);
  });

  it('works regardless of drawing direction', () => {
    const reversed = box().map((w) => ({ ...w, a: w.b, b: w.a }));
    expect(detectRoomPolygons(reversed)).toHaveLength(1);
  });
});

describe('lineOfSight', () => {
  // Two rooms split at x=3000, with a door centred at y=1000 in the partition.
  const walls = [...box(), wall('mid', [3000, 0], [3000, 4000], 100)];
  const door: Opening = { id: 'd', wallId: 'mid', kind: 'door', offset: 1000, width: 900, height: 2100, sill: 0 };
  const win: Opening = { id: 'w', wallId: 'right', kind: 'window', offset: 2000, width: 1200, height: 1200, sill: 900 };

  it('sees through a doorway', () => {
    expect(lineOfSight([1500, 1000], [4500, 1000], walls, [door], 2800)).toBe(true);
  });

  it('is blocked by a solid wall', () => {
    expect(lineOfSight([1500, 3000], [4500, 3000], walls, [door], 2800)).toBe(false);
  });

  it('sees out through a window but not through the wall beside it', () => {
    expect(lineOfSight([4500, 2000], [7000, 2000], walls, [door, win], 2800)).toBe(true);
    expect(lineOfSight([4500, 500], [7000, 500], walls, [door, win], 2800)).toBe(false);
  });
});

describe('syncRooms', () => {
  it('keeps names and finishes when walls change', () => {
    const first = syncRooms([], box());
    const named = first.map((r) => ({ ...r, name: 'Living', type: 'living' as const, floorMaterial: 'floor-oak' }));
    const moved = box().map((w) => (w.id === 'right' ? { ...w, a: [6500, 0] as Vec2, b: [6500, 4000] as Vec2 } : w));
    moved[0] = { ...moved[0]!, b: [6500, 0] };
    moved[2] = { ...moved[2]!, a: [6500, 4000] };
    const second = syncRooms(named, moved);
    expect(second).toHaveLength(1);
    expect(second[0]!.id).toBe(named[0]!.id);
    expect(second[0]!.name).toBe('Living');
    expect(second[0]!.floorMaterial).toBe('floor-oak');
    expect(area(second[0]!.polygon)).toBeCloseTo(6300 * 3800, 0);
  });
});
