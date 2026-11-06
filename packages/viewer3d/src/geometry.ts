import * as THREE from 'three';
import type { Vec2 } from '@homeset/core';

export const M = 0.001; // mm → metres

/**
 * Removes per-face material groups (BoxGeometry, CylinderGeometry… add them) from geometry that
 * is drawn with a single material. The real-time renderer ignores them, but the path tracer
 * would map each group to a different material in the scene.
 */
export function single<T extends THREE.BufferGeometry>(geom: T): T {
  geom.clearGroups();
  return geom;
}

/** Plan point (mm) → world XZ (m). Plan y maps to world +z. */
export const toWorld = (p: Vec2, y = 0): THREE.Vector3 => new THREE.Vector3(p[0] * M, y, p[1] * M);

/**
 * Vertical prism from a wall-piece quad [startPlus, endPlus, endMinus, startMinus].
 * Material groups: 0 = plus face, 1 = minus face, 2 = ends/top/bottom.
 * UVs are in metres (u along the wall, v up) so textures tile at real-world scale.
 */
export function wallPrism(
  quad: [Vec2, Vec2, Vec2, Vec2],
  bottom: number,
  top: number,
  wallStart: Vec2,
  wallDir: Vec2,
): THREE.BufferGeometry {
  const [sp, ep, em, sm] = quad;
  const y0 = bottom * M;
  const y1 = top * M;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const along = (p: Vec2) => ((p[0] - wallStart[0]) * wallDir[0] + (p[1] - wallStart[1]) * wallDir[1]) * M;
  const geom = new THREE.BufferGeometry();
  let start = 0;

  // Vertical rectangle a→b. Counter-clockwise winding (seen from outside) gives an
  // outward normal of (-(b.z-a.z), 0, b.x-a.x), i.e. to the left of a→b in world XZ.
  const side = (a: Vec2, b: Vec2, group: number) => {
    const ax = a[0] * M, az = a[1] * M, bx = b[0] * M, bz = b[1] * M;
    const ua = along(a), ub = along(b);
    positions.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
    uvs.push(ua, y0, ub, y0, ub, y1, ua, y0, ub, y1, ua, y1);
    const n = new THREE.Vector3(-(bz - az), 0, bx - ax).normalize();
    for (let i = 0; i < 6; i++) normals.push(n.x, n.y, n.z);
    geom.addGroup(start, 6, group);
    start += 6;
  };
  // sp→ep→em is counter-clockwise seen from above, so it faces up.
  const cap = (y: number, pts: Vec2[], ny: number) => {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const p = pts[i]!;
      positions.push(p[0] * M, y, p[1] * M);
      normals.push(0, ny, 0);
      uvs.push(p[0] * M, p[1] * M);
    }
    geom.addGroup(start, 6, 2);
    start += 6;
  };

  side(sp, ep, 0); // plus face
  side(em, sm, 1); // minus face
  side(ep, em, 2); // end
  side(sm, sp, 2); // start
  cap(y1, [sp, ep, em, sm], 1);
  cap(y0, [sm, em, ep, sp], -1);

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geom;
}

/**
 * Splits a non-indexed geometry into one geometry per material index.
 * Keeps every mesh single-material, which the path tracer requires for correct materials.
 */
export function splitByMaterial(geom: THREE.BufferGeometry): Map<number, THREE.BufferGeometry> {
  const ranges = new Map<number, [number, number][]>();
  for (const g of geom.groups) {
    const list = ranges.get(g.materialIndex ?? 0) ?? [];
    list.push([g.start, g.count]);
    ranges.set(g.materialIndex ?? 0, list);
  }
  const out = new Map<number, THREE.BufferGeometry>();
  for (const [materialIndex, list] of ranges) {
    const part = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(geom.attributes)) {
      const src = attr.array as Float32Array;
      const size = attr.itemSize;
      const total = list.reduce((n, [, count]) => n + count, 0);
      const data = new Float32Array(total * size);
      let offset = 0;
      for (const [start, count] of list) {
        data.set(src.subarray(start * size, (start + count) * size), offset);
        offset += count * size;
      }
      part.setAttribute(name, new THREE.BufferAttribute(data, size));
    }
    out.set(materialIndex, part);
  }
  return out;
}

/**
 * Up-facing horizontal polygon at height y (m). UVs in metres.
 * For ceilings use the same geometry with a BackSide material: visible from below,
 * invisible from above (so the dollhouse view sees straight in).
 */
export function flatPolygon(poly: Vec2[], y: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p[0] * M, -p[1] * M)));
  const geom = new THREE.ShapeGeometry(shape);
  geom.rotateX(-Math.PI / 2); // shape (x, -y) → world (x, 0, y), normal +Y
  geom.translate(0, y, 0);
  return geom;
}
