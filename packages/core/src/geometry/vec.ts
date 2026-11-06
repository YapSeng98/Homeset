import type { Vec2 } from '../schema';

export const EPS = 1e-6;

export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const scale = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s];
export const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
export const cross = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0];
export const len = (a: Vec2): number => Math.hypot(a[0], a[1]);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const equals = (a: Vec2, b: Vec2, tol = 0.5): boolean => dist(a, b) <= tol;

export function normalize(a: Vec2): Vec2 {
  const l = len(a);
  return l < EPS ? [0, 0] : [a[0] / l, a[1] / l];
}

/** Rotate +90° (counter-clockwise in a y-up frame). */
export const perp = (a: Vec2): Vec2 => [-a[1], a[0]];

export const angle = (a: Vec2): number => Math.atan2(a[1], a[0]);

export function rotate(p: Vec2, radians: number, origin: Vec2 = [0, 0]): Vec2 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const x = p[0] - origin[0];
  const y = p[1] - origin[1];
  return [origin[0] + x * c - y * s, origin[1] + x * s + y * c];
}

/** Intersection of two infinite lines p + t*r and q + u*s. Returns null if parallel. */
export function lineIntersection(p: Vec2, r: Vec2, q: Vec2, s: Vec2): Vec2 | null {
  const denom = cross(r, s);
  if (Math.abs(denom) < EPS) return null;
  const t = cross(sub(q, p), s) / denom;
  return add(p, scale(r, t));
}

/** Intersection of segments ab and cd (excluding pure overlaps). Returns params along each. */
export function segmentIntersection(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  d: Vec2,
): { point: Vec2; t: number; u: number } | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const denom = cross(r, s);
  if (Math.abs(denom) < EPS) return null;
  const qp = sub(c, a);
  const t = cross(qp, s) / denom;
  const u = cross(qp, r) / denom;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { point: add(a, scale(r, t)), t, u };
}

/** Closest point on segment ab to p, with its parameter t in [0,1]. */
export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number; distance: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  const point = add(a, scale(ab, t));
  return { point, t, distance: dist(p, point) };
}
