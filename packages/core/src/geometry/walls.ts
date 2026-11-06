import type { Opening, Vec2, Wall } from '../schema';
import {
  add,
  angle,
  closestPointOnSegment,
  dist,
  dot,
  lineIntersection,
  normalize,
  perp,
  scale,
  segmentIntersection,
  sub,
} from './vec';

/** Local frame of a wall. "plus" side is along `normal` = perp(dir). */
export interface WallFrame {
  wall: Wall;
  length: number;
  dir: Vec2;
  normal: Vec2;
  half: number;
}

/** Wall outline after corner joins, as a quad. */
export interface WallFootprint {
  frame: WallFrame;
  startPlus: Vec2;
  endPlus: Vec2;
  endMinus: Vec2;
  startMinus: Vec2;
}

export type WallPieceKind = 'solid' | 'below' | 'above';

/** A vertical prism of wall: full height between openings, or the part below/above an opening. */
export interface WallPiece {
  wallId: string;
  kind: WallPieceKind;
  openingId?: string;
  /** Ordered: start-plus, end-plus, end-minus, start-minus. */
  footprint: [Vec2, Vec2, Vec2, Vec2];
  bottom: number;
  top: number;
}

const MITER_LIMIT = 4;

export function wallFrame(wall: Wall): WallFrame {
  const v = sub(wall.b, wall.a);
  const dir = normalize(v);
  return { wall, length: Math.hypot(v[0], v[1]), dir, normal: perp(dir), half: wall.thickness / 2 };
}

const nodeKey = (p: Vec2) => `${Math.round(p[0])},${Math.round(p[1])}`;

interface Incident {
  frame: WallFrame;
  end: 'a' | 'b';
  node: Vec2;
  /** Direction pointing away from the node along the wall. */
  out: Vec2;
  /** perp(out). */
  side: Vec2;
  half: number;
  plusCorner?: Vec2;
  minusCorner?: Vec2;
}

/**
 * Computes mitered wall outlines.
 * - Walls sharing an endpoint are joined (any number of walls per node).
 * - A wall ending on the middle of another wall (T-junction) is trimmed to that wall's face.
 * - A free end is squared off.
 */
export function computeWallFootprints(walls: Wall[]): Map<string, WallFootprint> {
  const frames = walls.filter((w) => dist(w.a, w.b) > 1).map(wallFrame);
  const nodes = new Map<string, Incident[]>();

  for (const frame of frames) {
    for (const end of ['a', 'b'] as const) {
      const node = frame.wall[end];
      const out = end === 'a' ? frame.dir : scale(frame.dir, -1);
      const inc: Incident = { frame, end, node, out, side: perp(out), half: frame.half };
      const key = nodeKey(node);
      const list = nodes.get(key);
      if (list) list.push(inc);
      else nodes.set(key, [inc]);
    }
  }

  for (const list of nodes.values()) {
    if (list.length === 1) {
      joinFreeOrTee(list[0]!, frames);
      continue;
    }
    list.sort((p, q) => angle(p.out) - angle(q.out));
    for (let i = 0; i < list.length; i++) {
      const cur = list[i]!;
      const next = list[(i + 1) % list.length]!;
      // Region between `cur` and `next` (sweeping by increasing angle):
      // bounded by cur's plus edge and next's minus edge.
      const curEdgeStart = add(cur.node, scale(cur.side, cur.half));
      const nextEdgeStart = sub(next.node, scale(next.side, next.half));
      const hit = lineIntersection(curEdgeStart, cur.out, nextEdgeStart, next.out);
      const limit = MITER_LIMIT * Math.max(cur.half, next.half);
      if (hit && dist(hit, cur.node) <= limit) {
        cur.plusCorner = hit;
        next.minusCorner = hit;
      } else {
        cur.plusCorner = curEdgeStart;
        next.minusCorner = nextEdgeStart;
      }
    }
  }

  const result = new Map<string, WallFootprint>();
  for (const frame of frames) {
    const { a, b } = frame.wall;
    const n = frame.normal;
    const h = frame.half;
    const fp: WallFootprint = {
      frame,
      startPlus: add(a, scale(n, h)),
      startMinus: sub(a, scale(n, h)),
      endPlus: add(b, scale(n, h)),
      endMinus: sub(b, scale(n, h)),
    };
    result.set(frame.wall.id, fp);
  }
  for (const list of nodes.values()) {
    for (const inc of list) {
      const fp = result.get(inc.frame.wall.id)!;
      if (inc.end === 'a') {
        // At the start, out == dir so the incident's plus side is the wall's plus side.
        if (inc.plusCorner) fp.startPlus = inc.plusCorner;
        if (inc.minusCorner) fp.startMinus = inc.minusCorner;
      } else {
        // At the end, out == -dir so the sides swap.
        if (inc.plusCorner) fp.endMinus = inc.plusCorner;
        if (inc.minusCorner) fp.endPlus = inc.minusCorner;
      }
    }
  }
  return result;
}

function joinFreeOrTee(inc: Incident, frames: WallFrame[]): void {
  const plus = add(inc.node, scale(inc.side, inc.half));
  const minus = sub(inc.node, scale(inc.side, inc.half));
  inc.plusCorner = plus;
  inc.minusCorner = minus;

  for (const host of frames) {
    if (host === inc.frame) continue;
    const c = closestPointOnSegment(inc.node, host.wall.a, host.wall.b);
    const along = c.t * host.length;
    if (c.distance > 1 || along < 1 || along > host.length - 1) continue;
    const side = dot(inc.out, host.normal);
    if (Math.abs(side) < 0.05) continue; // running along the host wall; nothing to trim to
    const faceOrigin = add(host.wall.a, scale(host.normal, host.half * Math.sign(side)));
    const p = lineIntersection(plus, inc.out, faceOrigin, host.dir);
    const m = lineIntersection(minus, inc.out, faceOrigin, host.dir);
    if (p && m) {
      inc.plusCorner = p;
      inc.minusCorner = m;
    }
    return;
  }
}

export interface OpeningSpan {
  opening: Opening;
  start: number;
  end: number;
  bottom: number;
  top: number;
}

/** Opening extents along the wall axis, clamped to the wall and sorted. */
export function openingSpans(frame: WallFrame, openings: Opening[], wallHeight: number): OpeningSpan[] {
  const spans: OpeningSpan[] = [];
  for (const o of openings) {
    if (o.wallId !== frame.wall.id) continue;
    const start = Math.max(0, o.offset - o.width / 2);
    const end = Math.min(frame.length, o.offset + o.width / 2);
    if (end - start < 1) continue;
    const bottom = Math.max(0, Math.min(o.sill, wallHeight));
    const top = Math.max(bottom, Math.min(o.sill + o.height, wallHeight));
    spans.push({ opening: o, start, end, bottom, top });
  }
  spans.sort((p, q) => p.start - q.start);
  let cursor = 0;
  for (const s of spans) {
    if (s.start < cursor) s.start = cursor;
    if (s.end < s.start) s.end = s.start;
    cursor = s.end;
  }
  return spans.filter((s) => s.end - s.start >= 1);
}

/** Splits a wall into prisms around its openings. */
export function wallPieces(fp: WallFootprint, openings: Opening[], wallHeight: number): WallPiece[] {
  const { frame } = fp;
  const L = frame.length;
  const id = frame.wall.id;
  const edgePoint = (s: number, sign: 1 | -1): Vec2 => {
    if (s <= 0.01) return sign === 1 ? fp.startPlus : fp.startMinus;
    if (s >= L - 0.01) return sign === 1 ? fp.endPlus : fp.endMinus;
    return add(add(frame.wall.a, scale(frame.dir, s)), scale(frame.normal, frame.half * sign));
  };
  const quad = (s0: number, s1: number): WallPiece['footprint'] => [
    edgePoint(s0, 1),
    edgePoint(s1, 1),
    edgePoint(s1, -1),
    edgePoint(s0, -1),
  ];

  const pieces: WallPiece[] = [];
  let cursor = 0;
  for (const span of openingSpans(frame, openings, wallHeight)) {
    if (span.start > cursor + 0.5) {
      pieces.push({ wallId: id, kind: 'solid', footprint: quad(cursor, span.start), bottom: 0, top: wallHeight });
    }
    if (span.bottom > 0.5) {
      pieces.push({
        wallId: id,
        kind: 'below',
        openingId: span.opening.id,
        footprint: quad(span.start, span.end),
        bottom: 0,
        top: span.bottom,
      });
    }
    if (span.top < wallHeight - 0.5) {
      pieces.push({
        wallId: id,
        kind: 'above',
        openingId: span.opening.id,
        footprint: quad(span.start, span.end),
        bottom: span.top,
        top: wallHeight,
      });
    }
    cursor = span.end;
  }
  if (cursor < L - 0.5 || pieces.length === 0) {
    pieces.push({ wallId: id, kind: 'solid', footprint: quad(cursor, L), bottom: 0, top: wallHeight });
  }
  return pieces;
}

/**
 * Whether two plan points can see each other at eye height: walls block,
 * doorways and windows (gaps at that height) do not, nor do low walls like balcony parapets.
 */
export function lineOfSight(a: Vec2, b: Vec2, walls: Wall[], openings: Opening[], levelHeight: number, eye = 1500): boolean {
  for (const fp of computeWallFootprints(walls).values()) {
    for (const piece of wallPieces(fp, openings, fp.frame.wall.height ?? levelHeight)) {
      if (piece.bottom > eye || piece.top < eye) continue;
      const q = piece.footprint;
      for (let i = 0; i < 4; i++) {
        if (segmentIntersection(a, b, q[i]!, q[(i + 1) % 4]!)) return false;
      }
    }
  }
  return true;
}

/** Point on a wall's centreline at distance `s` from its start. */
export function pointAlongWall(wall: Wall, s: number): Vec2 {
  const f = wallFrame(wall);
  return add(wall.a, scale(f.dir, s));
}

/** Projects a plan point onto a wall; returns distance along the wall and from the centreline. */
export function projectOntoWall(wall: Wall, p: Vec2): { along: number; distance: number; point: Vec2 } {
  const c = closestPointOnSegment(p, wall.a, wall.b);
  return { along: c.t * dist(wall.a, wall.b), distance: c.distance, point: c.point };
}
