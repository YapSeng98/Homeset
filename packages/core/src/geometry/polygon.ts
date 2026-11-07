import type { Vec2 } from '../schema';
import { closestPointOnSegment } from './vec';

/** Signed area (shoelace). Positive for counter-clockwise in a y-up frame. */
export function signedArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s / 2;
}

export const area = (poly: Vec2[]): number => Math.abs(signedArea(poly));

/** Width and depth of a rectangular room (its bounding box), or null for L-shapes and other outlines. */
export function rectangleSize(poly: Vec2[]): [number, number] | null {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const d = Math.max(...ys) - Math.min(...ys);
  return w > 0 && d > 0 && area(poly) / (w * d) > 0.97 ? [w, d] : null;
}

export function centroid(poly: Vec2[]): Vec2 {
  const a = signedArea(poly);
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f;
    cy += (p[1] + q[1]) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

export function pointInPolygon(pt: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function distanceToPolygonEdge(pt: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const d = closestPointOnSegment(pt, poly[i]!, poly[(i + 1) % poly.length]!).distance;
    if (d < best) best = d;
  }
  return best;
}

/**
 * A good point to place a label: inside the polygon and far from its edges.
 * Coarse grid search; plenty for room-sized polygons.
 */
export function labelPoint(poly: Vec2[]): Vec2 {
  const c = centroid(poly);
  let best: Vec2 = c;
  let bestScore = pointInPolygon(c, poly) ? distanceToPolygonEdge(c, poly) : -Infinity;
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const steps = 16;
  for (let i = 1; i < steps; i++) {
    for (let j = 1; j < steps; j++) {
      const p: Vec2 = [minX + ((maxX - minX) * i) / steps, minY + ((maxY - minY) * j) / steps];
      if (!pointInPolygon(p, poly)) continue;
      const score = distanceToPolygonEdge(p, poly);
      if (score > bestScore * 1.25) {
        best = p;
        bestScore = score;
      }
    }
  }
  return best;
}

export function bounds(points: Vec2[]): { min: Vec2; max: Vec2 } | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { min: [minX, minY], max: [maxX, maxY] };
}
