import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CatalogItem } from '@rumah3d/core';
import type { MaterialLibrary } from './materials';
import { single } from './geometry';

/**
 * Procedural furniture. Each builder returns a group sized w × h × d (metres),
 * centred on x/z with y = 0 at the floor. Local -z is the back, +z the front.
 * Register new builders with `registerFurnitureBuilder` (e.g. from a plugin).
 */
export type FurnitureBuilder = (ctx: BuildContext) => THREE.Object3D;

export interface BuildContext {
  w: number;
  d: number;
  h: number;
  color: string;
  accent: string;
  options: Record<string, number>;
  mats: MaterialLibrary;
}

const builders = new Map<string, FurnitureBuilder>();
export const registerFurnitureBuilder = (name: string, fn: FurnitureBuilder) => builders.set(name, fn);

// Shared unit geometries, scaled per mesh. Marked so scene disposal leaves them alone.
const boxGeom = single(new THREE.BoxGeometry(1, 1, 1));
const cylGeom = single(new THREE.CylinderGeometry(0.5, 0.5, 1, 20));
const sphereGeom = single(new THREE.IcosahedronGeometry(0.5, 1));
for (const g of [boxGeom, cylGeom, sphereGeom]) g.userData.shared = true;

function box(g: THREE.Group, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(boxGeom, mat);
  m.scale.set(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001));
  m.position.set(x, y + h / 2, z);
  g.add(m);
  return m;
}

const softCache = new Map<string, THREE.BufferGeometry>();

/** Box with rounded edges: cushions, mattresses, upholstery. Geometries are cached per size. */
function soft(g: THREE.Group, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, radius = 0.04): THREE.Mesh {
  const r = Math.max(0.002, Math.min(radius, w / 2.2, h / 2.2, d / 2.2));
  const key = [w, h, d, r].map((v) => v.toFixed(3)).join('|');
  let geom = softCache.get(key);
  if (!geom) {
    geom = single(new RoundedBoxGeometry(Math.max(w, 0.005), Math.max(h, 0.005), Math.max(d, 0.005), 3, r));
    geom.userData.shared = true;
    softCache.set(key, geom);
  }
  const m = new THREE.Mesh(geom, mat);
  m.position.set(x, y + h / 2, z);
  g.add(m);
  return m;
}

function cyl(g: THREE.Group, mat: THREE.Material, r: number, h: number, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(cylGeom, mat);
  m.scale.set(r * 2, h, r * 2);
  m.position.set(x, y + h / 2, z);
  g.add(m);
  return m;
}

function legs(g: THREE.Group, mat: THREE.Material, w: number, d: number, h: number, inset = 0.04, size = 0.035) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, mat, size, h, size, sx * (w / 2 - inset), 0, sz * (d / 2 - inset));
}

registerFurnitureBuilder('sofa', ({ w, d, h, color, mats }) => {
  const g = new THREE.Group();
  const fabric = mats.fabric(color);
  const cushion = mats.fabric(new THREE.Color(color).offsetHSL(0, 0, 0.04).getStyle());
  const arm = Math.min(0.2, w * 0.1);
  const legH = 0.08;
  legs(g, mats.wood('#3a2f27'), w, d, legH, 0.08);
  soft(g, fabric, w, 0.3, d, 0, legH, 0, 0.03);
  soft(g, fabric, w, h - legH, 0.22, 0, legH, -d / 2 + 0.11, 0.06);
  soft(g, fabric, arm, 0.62 - legH, d, -w / 2 + arm / 2, legH, 0, 0.07);
  soft(g, fabric, arm, 0.62 - legH, d, w / 2 - arm / 2, legH, 0, 0.07);
  const seats = Math.max(1, Math.round((w - 2 * arm) / 0.65));
  const sw = (w - 2 * arm) / seats;
  for (let i = 0; i < seats; i++) {
    const x = -w / 2 + arm + sw * (i + 0.5);
    soft(g, cushion, sw - 0.02, 0.15, d - 0.26, x, legH + 0.29, 0.1, 0.06);
    soft(g, cushion, sw - 0.04, 0.44, 0.16, x, legH + 0.4, -d / 2 + 0.29, 0.07).rotation.x = -0.12;
  }
  return g;
});

registerFurnitureBuilder('sofa-l', (ctx) => {
  const { w, d, color, mats } = ctx;
  const g = new THREE.Group();
  const main = builders.get('sofa')!({ ...ctx, d: 0.92 });
  main.position.z = -d / 2 + 0.46;
  g.add(main);
  const fabric = mats.fabric(color);
  const cushion = mats.fabric(new THREE.Color(color).offsetHSL(0, 0, 0.04).getStyle());
  const chaiseW = 0.9;
  const chaiseD = d - 0.92;
  const cx = -w / 2 + chaiseW / 2;
  const cz = d / 2 - chaiseD / 2;
  soft(g, fabric, chaiseW, 0.38, chaiseD, cx, 0, cz, 0.03);
  soft(g, fabric, 0.2, 0.62, chaiseD, -w / 2 + 0.1, 0, cz, 0.07);
  soft(g, cushion, chaiseW - 0.22, 0.15, chaiseD - 0.02, cx + 0.1, 0.37, cz, 0.06);
  return g;
});

registerFurnitureBuilder('armchair', (ctx) => builders.get('sofa')!(ctx));

registerFurnitureBuilder('table', ({ w, d, h, color, mats }) => {
  const g = new THREE.Group();
  const wood = mats.wood(color);
  soft(g, wood, w, 0.04, d, 0, h - 0.04, 0, 0.012);
  legs(g, wood, w, d, h - 0.04, 0.06, 0.045);
  return g;
});

registerFurnitureBuilder('desk', ({ w, d, h, color, mats }) => {
  const g = new THREE.Group();
  const top = mats.wood(color);
  const frame = mats.color('#2f2f2f', 0.5, 0.3);
  box(g, top, w, 0.03, d, 0, h - 0.03, 0);
  for (const sx of [-1, 1]) box(g, frame, 0.04, h - 0.03, d - 0.08, sx * (w / 2 - 0.06), 0, 0);
  box(g, frame, w - 0.12, 0.05, 0.02, 0, h - 0.2, -d / 2 + 0.06);
  return g;
});

registerFurnitureBuilder('chair', ({ w, d, h, color, mats }) => {
  const g = new THREE.Group();
  const mat = mats.fabric(color);
  const seatH = 0.45;
  legs(g, mats.wood('#4a3b2f'), w, d, seatH - 0.04, 0.04, 0.03);
  soft(g, mat, w, 0.06, d, 0, seatH - 0.06, 0, 0.025);
  soft(g, mat, w, h - seatH, 0.05, 0, seatH, -d / 2 + 0.025, 0.02);
  return g;
});

registerFurnitureBuilder('dining-set', (ctx) => {
  const { w, d, h, color, mats, options } = ctx;
  const g = new THREE.Group();
  const tableD = Math.max(0.75, d - 0.6);
  const tableW = w;
  const table = builders.get('table')!({ ...ctx, w: tableW, d: tableD, h });
  g.add(table);
  const seats = options.seats ?? 4;
  const perSide = Math.max(1, Math.floor(seats / 2));
  const chairColor = new THREE.Color(color).offsetHSL(0, -0.1, 0.25).getStyle();
  for (let i = 0; i < perSide; i++) {
    const x = -tableW / 2 + (tableW / perSide) * (i + 0.5);
    for (const side of [-1, 1]) {
      const chair = builders.get('chair')!({ ...ctx, w: 0.45, d: 0.48, h: 0.86, color: chairColor });
      chair.position.set(x, 0, side * (tableD / 2 + 0.05));
      chair.rotation.y = side === 1 ? Math.PI : 0;
      g.add(chair);
    }
  }
  void mats;
  return g;
});

registerFurnitureBuilder('bed', ({ w, d, h, color, accent, mats }) => {
  const g = new THREE.Group();
  const frame = mats.fabric(accent);
  const linen = mats.fabric(color);
  const throwMat = mats.fabric(new THREE.Color(accent).offsetHSL(0, 0, 0.15).getStyle());
  soft(g, frame, w, 0.3, d - 0.06, 0, 0, 0.03, 0.03);
  soft(g, frame, w, h, 0.09, 0, 0, -d / 2 + 0.045, 0.04);
  soft(g, linen, w - 0.06, 0.24, d - 0.16, 0, 0.3, 0.05, 0.08);
  soft(g, throwMat, w - 0.01, 0.05, (d - 0.16) * 0.32, 0, 0.51, d / 2 - (d - 0.16) * 0.16 - 0.03, 0.025);
  const pillows = w > 1.2 ? 2 : 1;
  const pw = (w - 0.2) / pillows;
  for (let i = 0; i < pillows; i++) {
    soft(g, mats.fabric('#fbfaf7'), pw - 0.06, 0.14, 0.42, -w / 2 + 0.1 + pw * (i + 0.5), 0.52, -d / 2 + 0.34, 0.07).rotation.x = -0.15;
  }
  return g;
});

registerFurnitureBuilder('cabinet', ({ w, d, h, color, accent, mats }) => {
  const g = new THREE.Group();
  const body = mats.color(color, 0.6);
  const handle = mats.color(accent, 0.4, 0.4);
  box(g, body, w, h, d, 0, 0, 0);
  const doors = Math.max(1, Math.round(w / 0.5));
  const dw = w / doors;
  for (let i = 1; i < doors; i++) box(g, handle, 0.006, h - 0.04, 0.004, -w / 2 + dw * i, 0.02, d / 2 + 0.002);
  for (let i = 0; i < doors; i++) box(g, handle, 0.12, 0.012, 0.015, -w / 2 + dw * (i + 0.5), h - 0.08, d / 2 + 0.008);
  return g;
});

registerFurnitureBuilder('wardrobe', ({ w, d, h, color, accent, mats }) => {
  const g = new THREE.Group();
  const body = mats.color(color, 0.55);
  const line = mats.color(accent, 0.5);
  box(g, body, w, h, d, 0, 0, 0);
  const doors = Math.max(2, Math.round(w / 0.45));
  const dw = w / doors;
  for (let i = 1; i < doors; i++) box(g, line, 0.006, h - 0.04, 0.004, -w / 2 + dw * i, 0.02, d / 2 + 0.002);
  for (let i = 0; i < doors; i++) {
    const hx = -w / 2 + dw * i + (i % 2 === 0 ? dw - 0.05 : 0.05);
    box(g, line, 0.014, 0.35, 0.02, hx, h * 0.45, d / 2 + 0.01);
  }
  return g;
});

registerFurnitureBuilder('shelf', ({ w, d, h, color, mats }) => {
  const g = new THREE.Group();
  const wood = mats.wood(color);
  const t = 0.022;
  box(g, wood, t, h, d, -w / 2 + t / 2, 0, 0);
  box(g, wood, t, h, d, w / 2 - t / 2, 0, 0);
  box(g, wood, w, h, 0.008, 0, 0, -d / 2 + 0.004);
  const rows = Math.max(2, Math.round(h / 0.36));
  const bookColors = ['#7b4b3a', '#2f4a5f', '#b39d74', '#56624a', '#8c8c8c'];
  for (let i = 0; i <= rows; i++) {
    const y = (h - t) * (i / rows);
    box(g, wood, w - 2 * t, t, d, 0, y, 0);
    if (i < rows && i % 2 === 0) {
      let x = -w / 2 + t + 0.03;
      let k = i;
      while (x < w / 2 - 0.25) {
        const bw = 0.025 + ((k * 7) % 5) * 0.006;
        box(g, mats.color(bookColors[k % bookColors.length]!, 0.8), bw, 0.22 + ((k * 3) % 4) * 0.015, d * 0.7, x + bw / 2, y + t, 0);
        x += bw + 0.002;
        k++;
      }
    }
  }
  return g;
});

registerFurnitureBuilder('tv', ({ w, d, h, mats }) => {
  const g = new THREE.Group();
  box(g, mats.color('#111111', 0.3, 0.4), w, h, d, 0, 0, 0);
  box(g, mats.color('#1d2733', 0.15, 0.1), w - 0.02, h - 0.02, 0.002, 0, 0.01, d / 2 + 0.001);
  return g;
});

registerFurnitureBuilder('rug', ({ w, d, h, color, mats }) => {
  const g = new THREE.Group();
  box(g, mats.fabric(color), w, h, d, 0, 0, 0);
  box(g, mats.fabric(new THREE.Color(color).offsetHSL(0, 0, -0.12).getStyle()), w - 0.16, h + 0.001, d - 0.16, 0, 0, 0);
  box(g, mats.fabric(color), w - 0.24, h + 0.002, d - 0.24, 0, 0, 0);
  return g;
});

registerFurnitureBuilder('plant', ({ w, h, mats }) => {
  const g = new THREE.Group();
  cyl(g, mats.color('#d8d2c8', 0.8), w * 0.32, 0.36, 0, 0, 0);
  const leaf = mats.color('#4f6b3a', 0.85);
  const leaf2 = mats.color('#6a8a4a', 0.85);
  const blobs: [number, number, number, number][] = [
    [0, 0.62, 0, 0.42], [0.12, 0.85, 0.05, 0.36], [-0.1, 0.95, -0.06, 0.34], [0.03, 1.12, 0.02, 0.3],
  ];
  blobs.forEach(([x, y, z, s], i) => {
    const m = new THREE.Mesh(sphereGeom, i % 2 ? leaf : leaf2);
    m.scale.setScalar(s * w * 1.6);
    m.position.set(x * w * 2, Math.min(y, h - 0.15), z * w * 2);
    g.add(m);
  });
  return g;
});

registerFurnitureBuilder('lamp', ({ h, mats }) => {
  const g = new THREE.Group();
  const metal = mats.color('#3a3836', 0.4, 0.6);
  cyl(g, metal, 0.14, 0.025, 0, 0, 0);
  cyl(g, metal, 0.012, h - 0.3, 0, 0.025, 0);
  const shade = new THREE.Mesh(
    single(new THREE.CylinderGeometry(0.14, 0.2, 0.3, 24, 1, true)),
    mats.custom(
      'lamp-shade',
      () => new THREE.MeshStandardMaterial({ color: '#f4ead8', emissive: '#ffdca8', emissiveIntensity: 0.6, side: THREE.DoubleSide }),
    ),
  );
  shade.position.y = h - 0.15;
  g.add(shade);
  return g;
});

registerFurnitureBuilder('kitchen-base', ({ w, d, h, color, accent, mats }) => {
  const g = new THREE.Group();
  const carcass = mats.color(color, 0.55);
  const top = mats.color(accent, 0.25);
  box(g, mats.color('#3b3b3b', 0.8), w - 0.02, 0.1, d - 0.08, 0, 0, -0.03);
  box(g, carcass, w, h - 0.14, d - 0.02, 0, 0.1, -0.01);
  box(g, top, w, 0.04, d + 0.02, 0, h - 0.04, 0);
  const doors = Math.max(1, Math.round(w / 0.6));
  const dw = w / doors;
  for (let i = 1; i < doors; i++) box(g, mats.color('#b0a596', 0.5), 0.005, h - 0.18, 0.004, -w / 2 + dw * i, 0.12, d / 2 - 0.018);
  // Sink and hob
  box(g, mats.color('#b9bcbf', 0.25, 0.8), 0.6, 0.005, 0.42, -w / 4, h, 0);
  box(g, mats.color('#141414', 0.2, 0.2), 0.6, 0.005, 0.5, w / 4, h, 0);
  const tap = mats.color('#c8cacc', 0.2, 0.9);
  cyl(g, tap, 0.015, 0.28, -w / 4, h, -0.22);
  return g;
});

registerFurnitureBuilder('appliance', ({ w, d, h, color, mats }) => {
  const g = new THREE.Group();
  const body = mats.color(color, 0.3, 0.6);
  box(g, body, w, h, d, 0, 0, 0);
  box(g, mats.color('#8c9095', 0.3, 0.6), w - 0.01, 0.006, 0.004, 0, h * 0.62, d / 2 + 0.002);
  box(g, mats.color('#5d6166', 0.3, 0.7), 0.02, 0.4, 0.03, w / 2 - 0.06, h * 0.68, d / 2 + 0.015);
  return g;
});

registerFurnitureBuilder('washer', ({ w, d, h, color, mats }) => {
  const g = new THREE.Group();
  box(g, mats.color(color, 0.4), w, h, d, 0, 0, 0);
  const door = cyl(g, mats.color('#3d4650', 0.15, 0.4), w * 0.3, 0.02, 0, 0, 0);
  door.rotation.x = Math.PI / 2;
  door.position.set(0, h * 0.45, d / 2 + 0.01);
  return g;
});

registerFurnitureBuilder('toilet', ({ w, d, mats }) => {
  const g = new THREE.Group();
  const ceramic = mats.color('#f7f7f5', 0.15);
  box(g, ceramic, w * 0.9, 0.75, 0.18, 0, 0, -d / 2 + 0.09);
  const bowl = cyl(g, ceramic, w * 0.5, 0.4, 0, 0, 0.08);
  bowl.scale.z = d * 0.75;
  box(g, ceramic, w * 0.95, 0.03, d * 0.72, 0, 0.4, 0.06);
  return g;
});

registerFurnitureBuilder('vanity', ({ w, d, h, color, mats }) => {
  const g = new THREE.Group();
  box(g, mats.color(color, 0.6), w, h - 0.35, d, 0, 0.3, 0);
  box(g, mats.color('#f7f7f5', 0.15), w, 0.05, d, 0, h - 0.05, 0);
  box(g, mats.color('#dfe4e6', 0.05, 0.9), w * 0.9, 0.7, 0.01, 0, h + 0.25, -d / 2 + 0.01);
  cyl(g, mats.color('#c8cacc', 0.2, 0.9), 0.013, 0.2, 0, h, -d / 2 + 0.07);
  return g;
});

registerFurnitureBuilder('shower', ({ w, d, h, mats }) => {
  const g = new THREE.Group();
  box(g, mats.color('#eceeee', 0.3), w, 0.04, d, 0, 0, 0);
  const glass = mats.glass();
  box(g, glass, w, h - 0.04, 0.01, 0, 0.04, d / 2);
  box(g, glass, 0.01, h - 0.04, d, w / 2, 0.04, 0);
  const metal = mats.color('#c8cacc', 0.2, 0.9);
  cyl(g, metal, 0.012, 1.95, -w / 2 + 0.08, 0, -d / 2 + 0.08);
  cyl(g, metal, 0.11, 0.015, -w / 2 + 0.2, 1.95, -d / 2 + 0.2);
  return g;
});

/** Builds the 3D object for a catalog item at the given size (mm). */
export function buildFurniture(item: CatalogItem, size: { w: number; d: number; h: number }, mats: MaterialLibrary): THREE.Object3D {
  const ctx: BuildContext = {
    w: size.w / 1000,
    d: size.d / 1000,
    h: size.h / 1000,
    color: item.model.kind === 'procedural' ? (item.model.color ?? '#bfb6aa') : '#bfb6aa',
    accent: item.model.kind === 'procedural' ? (item.model.accent ?? '#8a6a4a') : '#8a6a4a',
    options: item.model.kind === 'procedural' ? (item.model.options ?? {}) : {},
    mats,
  };
  const builder = item.model.kind === 'procedural' ? builders.get(item.model.builder) : undefined;
  if (builder) return builder(ctx);
  // Fallback (also the placeholder while a glTF loads).
  const g = new THREE.Group();
  box(g, mats.color(ctx.color, 0.8), ctx.w, ctx.h, ctx.d, 0, 0, 0);
  return g;
}
