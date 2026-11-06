import type { Room, Vec2, Wall } from '../schema';
import { createId } from '../ids';
import { area, labelPoint, pointInPolygon, signedArea } from './polygon';
import { add, angle, closestPointOnSegment, cross, dist, lineIntersection, normalize, perp, scale, sub } from './vec';

interface GraphEdge {
  from: string;
  to: string;
  half: number;
}

const key = (p: Vec2) => `${Math.round(p[0])},${Math.round(p[1])}`;

/** Minimum inner room area to count as a room (0.25 m²). */
const MIN_ROOM_AREA = 250_000;

/**
 * Finds enclosed rooms from wall centrelines (planar graph faces),
 * then insets each face by the wall half-thickness to get the finished floor polygon.
 */
export function detectRoomPolygons(walls: Wall[]): Vec2[][] {
  const live = walls.filter((w) => dist(w.a, w.b) > 1);

  // 1. Split walls where other walls end on them or cross them.
  const points = new Map<string, Vec2>();
  const edges: GraphEdge[] = [];
  for (const w of live) {
    const cuts: number[] = [0, 1];
    for (const o of live) {
      if (o === w) continue;
      for (const p of [o.a, o.b]) {
        const c = closestPointOnSegment(p, w.a, w.b);
        if (c.distance <= 1 && c.t > 0 && c.t < 1) cuts.push(c.t);
      }
      const r = sub(w.b, w.a);
      const s = sub(o.b, o.a);
      const denom = cross(r, s);
      if (Math.abs(denom) > 1e-9) {
        const t = cross(sub(o.a, w.a), s) / denom;
        const u = cross(sub(o.a, w.a), r) / denom;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
      }
    }
    cuts.sort((p, q) => p - q);
    let prev: Vec2 | null = null;
    for (const t of cuts) {
      const p: Vec2 = [w.a[0] + (w.b[0] - w.a[0]) * t, w.a[1] + (w.b[1] - w.a[1]) * t];
      if (prev && dist(prev, p) > 1) {
        const k1 = key(prev);
        const k2 = key(p);
        if (k1 !== k2) {
          points.set(k1, points.get(k1) ?? prev);
          points.set(k2, points.get(k2) ?? p);
          edges.push({ from: k1, to: k2, half: w.thickness / 2 });
        }
      }
      if (!prev || dist(prev, p) > 1) prev = p;
    }
  }

  // 2. Deduplicate and build adjacency.
  const unique = new Map<string, GraphEdge>();
  for (const e of edges) {
    const k = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`;
    if (!unique.has(k)) unique.set(k, e);
  }
  const adj = new Map<string, Map<string, number>>();
  const link = (a: string, b: string, half: number) => {
    if (!adj.has(a)) adj.set(a, new Map());
    adj.get(a)!.set(b, half);
  };
  for (const e of unique.values()) {
    link(e.from, e.to, e.half);
    link(e.to, e.from, e.half);
  }

  // 3. Prune dangling walls (filaments) so they don't break face tracing.
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const [k, nbrs] of adj) {
      if (nbrs.size <= 1) {
        for (const n of nbrs.keys()) adj.get(n)?.delete(k);
        adj.delete(k);
        pruned = true;
      }
    }
  }

  // 4. Sort outgoing edges by angle and trace faces.
  const sorted = new Map<string, string[]>();
  for (const [k, nbrs] of adj) {
    const origin = points.get(k)!;
    sorted.set(
      k,
      [...nbrs.keys()].sort((p, q) => angle(sub(points.get(p)!, origin)) - angle(sub(points.get(q)!, origin))),
    );
  }
  const visited = new Set<string>();
  const faces: { nodes: string[] }[] = [];
  for (const [from, outs] of sorted) {
    for (const to of outs) {
      if (visited.has(`${from}>${to}`)) continue;
      const nodes: string[] = [];
      let u = from;
      let v = to;
      let guard = 0;
      while (!visited.has(`${u}>${v}`) && guard++ < 10_000) {
        visited.add(`${u}>${v}`);
        nodes.push(u);
        const around = sorted.get(v)!;
        const idx = around.indexOf(u);
        const next = around[(idx - 1 + around.length) % around.length]!;
        u = v;
        v = next;
      }
      faces.push({ nodes });
    }
  }

  // 5. Keep bounded faces (positive orientation) and inset by wall thickness.
  const result: Vec2[][] = [];
  for (const face of faces) {
    const centre = face.nodes.map((k) => points.get(k)!);
    if (centre.length < 3 || signedArea(centre) <= 0) continue;
    const halves = face.nodes.map((k, i) => adj.get(k)!.get(face.nodes[(i + 1) % face.nodes.length]!) ?? 0);
    const inner = simplify(inset(centre, halves));
    if (inner.length >= 3 && signedArea(inner) > MIN_ROOM_AREA) result.push(inner);
  }
  return result;
}

/** Offsets each edge of a CCW polygon inwards by its own distance. */
function inset(poly: Vec2[], halves: number[]): Vec2[] {
  const n = poly.length;
  const lines = poly.map((p, i) => {
    const d = normalize(sub(poly[(i + 1) % n]!, p));
    return { origin: add(p, scale(perp(d), halves[i]!)), dir: d };
  });
  return poly.map((p, i) => {
    const prev = lines[(i - 1 + n) % n]!;
    const cur = lines[i]!;
    return lineIntersection(prev.origin, prev.dir, cur.origin, cur.dir) ?? add(p, scale(perp(cur.dir), halves[i]!));
  });
}

/** Removes duplicate and collinear vertices. */
function simplify(poly: Vec2[]): Vec2[] {
  let pts = poly.filter((p, i) => dist(p, poly[(i + 1) % poly.length]!) > 0.5);
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length]!;
      const b = pts[i]!;
      const c = pts[(i + 1) % pts.length]!;
      const ab = normalize(sub(b, a));
      const bc = normalize(sub(c, b));
      if (Math.abs(cross(ab, bc)) < 1e-4) {
        pts = pts.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

/**
 * Re-detects rooms while keeping names, types and finishes of rooms that still exist.
 * A previous room is matched when its label point falls inside a newly detected polygon.
 */
export function syncRooms(previous: Room[], walls: Wall[]): Room[] {
  const polygons = detectRoomPolygons(walls);
  const used = new Set<string>();
  let counter = previous.length;
  return polygons.map((polygon) => {
    const match = previous.find((r) => !used.has(r.id) && pointInPolygon(labelPoint(r.polygon), polygon));
    if (match) {
      used.add(match.id);
      return { ...match, polygon };
    }
    counter += 1;
    return { id: createId('room'), name: `Room ${counter}`, type: 'other', polygon };
  });
}

export const roomArea = (room: Room): number => area(room.polygon);
