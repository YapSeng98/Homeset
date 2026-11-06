import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  add,
  computeWallFootprints,
  cross,
  dist,
  distanceToPolygonEdge,
  dot,
  labelPoint,
  normalize,
  openingSpans,
  perp,
  pointInPolygon,
  scale,
  signedArea,
  sub,
  wallPieces,
  type Level,
  type Opening,
  type Registry,
  type Room,
  type Vec2,
  type WallFootprint,
} from '@rumah3d/core';
import { flatPolygon, M, single, splitByMaterial, toWorld, wallPrism } from './geometry';
import { buildFurniture } from './furniture';
import type { MaterialLibrary } from './materials';

const EXTERIOR_WALL = '#e6e1d8';
const WALL_CAP = '#d2cdc5';
const FRAME = '#f2f0ec';

export interface RoomInfo {
  id: string;
  name: string;
  /** World XZ polygon (m). */
  polygon: Vec2[];
  /** Good standing point (m). */
  anchor: THREE.Vector3;
}

export interface BuiltLevel {
  group: THREE.Group;
  ceilings: THREE.Group;
  /** Plan-space blocking outlines (m) for walk-mode collision. */
  colliders: Vec2[][];
  /** Furniture footprints as circles (world XZ, m), used to pick clear standing spots. */
  obstacles: { x: number; z: number; r: number }[];
  rooms: RoomInfo[];
  bounds: THREE.Box3;
  /** Resolves when every furniture model file has loaded (HD photos wait for this). */
  ready: Promise<void>;
}

const gltfLoader = new GLTFLoader();

function roomAt(rooms: Room[], p: Vec2): Room | undefined {
  return rooms.find((r) => pointInPolygon(p, r.polygon));
}

export function buildLevel(level: Level, registry: Registry, mats: MaterialLibrary, onAssetLoaded: () => void = () => {}): BuiltLevel {
  const group = new THREE.Group();
  group.name = `level:${level.id}`;
  const ceilings = new THREE.Group();
  ceilings.name = 'ceilings';
  group.add(ceilings);
  const colliders: Vec2[][] = [];
  const elevation = level.elevation * M;
  group.position.y = elevation;

  const exterior = mats.color(EXTERIOR_WALL, 0.95);
  const cap = mats.color(WALL_CAP, 0.9);
  const wallMatFor = (room: Room | undefined) =>
    room ? mats.get(room.wallMaterial ?? level.defaultWallMaterial) : exterior;

  // Walls
  const footprints = computeWallFootprints(level.walls);
  for (const fp of footprints.values()) {
    const height = fp.frame.wall.height ?? level.height;
    for (const piece of wallPieces(fp, level.openings, height)) {
      const geom = wallPrism(piece.footprint, piece.bottom, piece.top, fp.frame.wall.a, fp.frame.dir);
      // Paint each face with the finish of the room it faces.
      const mid: Vec2 = [
        (piece.footprint[0][0] + piece.footprint[1][0] + piece.footprint[2][0] + piece.footprint[3][0]) / 4,
        (piece.footprint[0][1] + piece.footprint[1][1] + piece.footprint[2][1] + piece.footprint[3][1]) / 4,
      ];
      const probe = fp.frame.half + 60;
      const plusRoom = roomAt(level.rooms, add(mid, scale(fp.frame.normal, probe)));
      const minusRoom = roomAt(level.rooms, add(mid, scale(fp.frame.normal, -probe)));
      const faceMats = [wallMatFor(plusRoom), wallMatFor(minusRoom), cap];
      for (const [index, part] of splitByMaterial(geom)) {
        const mesh = new THREE.Mesh(part, faceMats[index]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = { kind: 'wall', id: fp.frame.wall.id };
        group.add(mesh);
      }
      geom.dispose();
      // Anything between knee and head height blocks walking.
      if (piece.bottom < 1700 && piece.top > 300) colliders.push(piece.footprint.map((p) => [p[0] * M, p[1] * M] as Vec2));
    }
    addOpenings(group, fp, level, height, mats);
  }

  // Floors, ceilings, skirting and lighting
  const roomInfos: RoomInfo[] = [];
  const ceilingMat = mats.ceiling();
  const doorGaps = doorwaySegments(footprints, level);
  for (const room of level.rooms) {
    addSkirting(group, room, doorGaps, mats);
    addRoomLighting(ceilings, room, level.height * M, mats);
    const floor = new THREE.Mesh(flatPolygon(room.polygon, 0.001), mats.get(room.floorMaterial ?? level.defaultFloorMaterial));
    floor.receiveShadow = true;
    floor.userData = { kind: 'floor', id: room.id };
    group.add(floor);
    const ceiling = new THREE.Mesh(flatPolygon(room.polygon, level.height * M), ceilingMat);
    ceiling.castShadow = true;
    ceilings.add(ceiling);
    const lp = labelPoint(room.polygon);
    roomInfos.push({
      id: room.id,
      name: room.name,
      polygon: room.polygon.map((p) => [p[0] * M, p[1] * M] as Vec2),
      anchor: toWorld(lp, elevation),
    });
  }

  // Furniture
  const pending: Promise<void>[] = [];
  const obstacles: BuiltLevel['obstacles'] = [];
  for (const item of level.items) {
    const def = registry.item(item.catalogId);
    if (!def) continue;
    const size = { w: item.width ?? def.size.w, d: item.depth ?? def.size.d, h: item.height ?? def.size.h };
    if (size.h > 100 && (item.elevation ?? 0) < 1500) {
      obstacles.push({ x: item.position[0] * M, z: item.position[1] * M, r: (Math.hypot(size.w, size.d) / 2) * M * 0.85 });
    }
    const holder = new THREE.Group();
    holder.position.copy(toWorld(item.position, (item.elevation ?? 0) * M));
    holder.rotation.y = -THREE.MathUtils.degToRad(item.rotation ?? 0);
    holder.userData = { kind: 'item', id: item.id };
    group.add(holder);
    if (def.model.kind === 'gltf') {
      pending.push(
        placeModel(holder, def.model.url, size).then(onAssetLoaded, () => {
          holder.add(withShadows(buildFurniture(def, size, mats))); // fallback if the file fails
          onAssetLoaded();
        }),
      );
    } else {
      holder.add(withShadows(buildFurniture(def, size, mats)));
    }
  }

  const bounds = new THREE.Box3().setFromObject(group);
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 3, 5));
  const ready = Promise.all(pending).then(() => undefined);
  return { group, ceilings, colliders, obstacles, rooms: roomInfos, bounds, ready };
}

function withShadows<T extends THREE.Object3D>(obj: T): T {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return obj;
}

/** One download per model file; every placed copy shares its geometry and materials. */
const modelCache = new Map<string, Promise<{ scene: THREE.Group; box: THREE.Box3 }>>();

function loadModel(url: string) {
  let entry = modelCache.get(url);
  if (!entry) {
    entry = gltfLoader.loadAsync(url).then((gltf) => {
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) single(mesh.geometry).userData.shared = true;
      });
      withShadows(gltf.scene);
      return { scene: gltf.scene, box: new THREE.Box3().setFromObject(gltf.scene) };
    });
    entry.catch(() => modelCache.delete(url));
    modelCache.set(url, entry);
  }
  return entry;
}

/** Places a model scaled to the item's size (real-size catalog entries scale by ~1), standing on the floor. */
async function placeModel(holder: THREE.Group, url: string, size: { w: number; d: number; h: number }) {
  const { scene, box } = await loadModel(url);
  const s = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const sx = (size.w * M) / (s.x || 1);
  const sy = (size.h * M) / (s.y || 1);
  const sz = (size.d * M) / (s.z || 1);
  const copy = scene.clone(true);
  copy.scale.set(sx, sy, sz);
  copy.position.set(-c.x * sx, -box.min.y * sy, -c.z * sz);
  holder.add(copy);
}

interface DoorGap {
  a: Vec2;
  b: Vec2;
  half: number;
}

/** Floor-level openings (doors, archways) as centreline segments, so skirting can stop at them. */
function doorwaySegments(footprints: Map<string, WallFootprint>, level: Level): DoorGap[] {
  const gaps: DoorGap[] = [];
  for (const fp of footprints.values()) {
    const f = fp.frame;
    for (const span of openingSpans(f, level.openings, f.wall.height ?? level.height)) {
      if (span.bottom >= 1) continue;
      gaps.push({ a: add(f.wall.a, scale(f.dir, span.start)), b: add(f.wall.a, scale(f.dir, span.end)), half: f.half });
    }
  }
  return gaps;
}

const SKIRTING_H = 90;
const SKIRTING_T = 12;

function addSkirting(group: THREE.Group, room: Room, gaps: DoorGap[], mats: MaterialLibrary) {
  const poly = room.polygon;
  const inwardSign = signedArea(poly) > 0 ? 1 : -1;
  const mat = mats.color('#f4f2ee', 0.45);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const L = dist(p, q);
    if (L < 60) continue;
    const d = normalize(sub(q, p));
    let parts: [number, number][] = [[0, L]];
    for (const gap of gaps) {
      const gd = normalize(sub(gap.b, gap.a));
      if (Math.abs(cross(d, gd)) > 0.02) continue;
      if (Math.abs(cross(d, sub(gap.a, p))) > gap.half + 40) continue;
      const t0 = dot(sub(gap.a, p), d);
      const t1 = dot(sub(gap.b, p), d);
      const lo = Math.min(t0, t1) - 10;
      const hi = Math.max(t0, t1) + 10;
      const next: [number, number][] = [];
      for (const [s0, s1] of parts) {
        if (hi <= s0 || lo >= s1) {
          next.push([s0, s1]);
          continue;
        }
        if (lo - s0 > 1) next.push([s0, lo]);
        if (s1 - hi > 1) next.push([hi, s1]);
      }
      parts = next;
    }
    const inward = scale(perp(d), inwardSign * (SKIRTING_T / 2));
    for (const [s0, s1] of parts) {
      if (s1 - s0 < 50) continue;
      const mid = add(add(p, scale(d, (s0 + s1) / 2)), inward);
      const mesh = new THREE.Mesh(single(new THREE.BoxGeometry((s1 - s0) * M, SKIRTING_H * M, SKIRTING_T * M)), mat);
      mesh.position.copy(toWorld(mid, (SKIRTING_H / 2) * M));
      mesh.rotation.y = -Math.atan2(d[1], d[0]);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
}

const downlightGeom = new THREE.CircleGeometry(0.045, 20).rotateX(Math.PI / 2);
downlightGeom.userData.shared = true;

/** A warm ceiling light per room plus visible recessed downlights (shown with the ceilings in walk mode). */
function addRoomLighting(ceilings: THREE.Group, room: Room, ceilingY: number, mats: MaterialLibrary) {
  const poly = room.polygon.map((p) => [p[0] * M, p[1] * M] as Vec2);
  const areaM2 = Math.abs(signedArea(poly));
  const centre = labelPoint(poly);
  // Neutral-warm (~4000K), the most common LED choice in MY/SG homes and kind to listing photos.
  const light = new THREE.PointLight('#fff0dc', Math.min(9, 2 + areaM2 * 0.3), 0, 2);
  light.position.set(centre[0], ceilingY - 0.3, centre[1]);
  ceilings.add(light);

  const xs = poly.map((p) => p[0]);
  const zs = poly.map((p) => p[1]);
  const spacing = areaM2 < 6 ? 1.1 : 1.6;
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  const nx = Math.max(1, Math.round((Math.max(...xs) - minX) / spacing));
  const nz = Math.max(1, Math.round((Math.max(...zs) - minZ) / spacing));
  const stepX = (Math.max(...xs) - minX) / nx;
  const stepZ = (Math.max(...zs) - minZ) / nz;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const p: Vec2 = [minX + stepX * (i + 0.5), minZ + stepZ * (j + 0.5)];
      if (!pointInPolygon(p, poly) || distanceToPolygonEdge(p, poly) < 0.35) continue;
      const lens = new THREE.Mesh(downlightGeom, mats.glow());
      lens.position.set(p[0], ceilingY - 0.003, p[1]);
      ceilings.add(lens);
    }
  }
}

const CURTAIN_ROOMS = new Set(['living', 'dining', 'master', 'bedroom', 'study']);

/** Floor-to-ceiling curtains on the room side of larger windows. */
function addCurtains(holder: THREE.Group, width: number, side: 1 | -1, wallHalf: number, ceilingY: number, mats: MaterialLibrary) {
  const mat = mats.custom(
    'curtain',
    () => new THREE.MeshPhysicalMaterial({ color: '#ebe4d8', roughness: 0.95, sheen: 0.6, sheenRoughness: 0.8, sheenColor: '#ffffff', side: THREE.DoubleSide }),
  );
  const panelW = width * 0.26 + 0.25;
  const height = ceilingY - 0.12;
  const z = side * (wallHalf + 0.1);
  for (const end of [-1, 1]) {
    const geom = new THREE.PlaneGeometry(panelW, height, 36, 1);
    const pos = geom.attributes.position!;
    const folds = Math.max(3, Math.round(panelW / 0.12));
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, Math.sin(((x + panelW / 2) / panelW) * Math.PI * 2 * folds) * 0.028);
    }
    geom.computeVertexNormals();
    const panel = new THREE.Mesh(geom, mat);
    panel.position.set(end * (width / 2 + 0.2 - panelW / 2), 0.04 + height / 2, z);
    panel.castShadow = true;
    panel.receiveShadow = true;
    holder.add(panel);
  }
  const rod = new THREE.Mesh(single(new THREE.CylinderGeometry(0.012, 0.012, width + 0.5, 12)), mats.color('#8c8579', 0.35, 0.7));
  rod.rotation.z = Math.PI / 2;
  rod.position.set(0, ceilingY - 0.06, z);
  holder.add(rod);
}

function addOpenings(group: THREE.Group, fp: WallFootprint, level: Level, wallHeight: number, mats: MaterialLibrary) {
  const { frame } = fp;
  const thickness = frame.wall.thickness * M;
  const frameMat = mats.color(FRAME, 0.5);
  const yaw = -Math.atan2(frame.dir[1], frame.dir[0]);
  for (const span of openingSpans(frame, level.openings, wallHeight)) {
    const o = span.opening;
    const width = (span.end - span.start) * M;
    const bottom = span.bottom * M;
    const height = (span.top - span.bottom) * M;
    const centre = add(frame.wall.a, scale(frame.dir, (span.start + span.end) / 2));
    // Local frame: x along the wall, z across it (towards the plus side), y up.
    const holder = new THREE.Group();
    holder.position.copy(toWorld(centre));
    holder.rotation.y = yaw;
    holder.userData = { kind: 'opening', id: o.id };
    group.add(holder);
    const part = (mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(single(new THREE.BoxGeometry(w, h, d)), mat);
      m.position.set(x, y + h / 2, z);
      m.castShadow = true;
      holder.add(m);
      return m;
    };
    if (span.bottom < 1) {
      // Floor threshold through the wall, in the finish of the room on either side.
      const h = frame.half;
      const at = (s: number, sign: number) => add(add(frame.wall.a, scale(frame.dir, s)), scale(frame.normal, h * sign));
      const probe = h + 60;
      const room =
        roomAt(level.rooms, add(centre, scale(frame.normal, probe))) ??
        roomAt(level.rooms, add(centre, scale(frame.normal, -probe)));
      const sill = new THREE.Mesh(
        flatPolygon([at(span.start, 1), at(span.end, 1), at(span.end, -1), at(span.start, -1)], 0.001),
        mats.get(room?.floorMaterial ?? level.defaultFloorMaterial),
      );
      sill.receiveShadow = true;
      group.add(sill);
    }
    if (o.kind === 'opening') continue;
    const t = 0.045;
    // Frame (jambs + head)
    part(frameMat, t, height, thickness + 0.02, -width / 2 + t / 2, bottom, 0);
    part(frameMat, t, height, thickness + 0.02, width / 2 - t / 2, bottom, 0);
    part(frameMat, width, t, thickness + 0.02, 0, bottom + height - t, 0);
    if (o.kind === 'window' || o.kind === 'sliding-door') {
      // Curtains go on the side of a living room or bedroom, when the other side is outdoors.
      const probe = frame.half + 60;
      const plus = roomAt(level.rooms, add(centre, scale(frame.normal, probe)));
      const minus = roomAt(level.rooms, add(centre, scale(frame.normal, -probe)));
      const inside = plus && !minus ? plus : minus && !plus ? minus : undefined;
      if (inside && CURTAIN_ROOMS.has(inside.type) && width >= 0.9) {
        addCurtains(holder, width, inside === plus ? 1 : -1, thickness / 2, level.height * M, mats);
      }
    }
    if (o.kind === 'window') {
      part(frameMat, width, t, thickness + 0.02, 0, bottom, 0);
      part(frameMat, t * 0.7, height, 0.05, 0, bottom, 0);
      part(mats.glass(), width - 2 * t, height - 2 * t, 0.008, 0, bottom + t, 0);
    } else if (o.kind === 'sliding-door') {
      const panelW = (width - 2 * t) / 2 + 0.03;
      const glassMat = mats.glass();
      const rail = mats.color('#9a9a9a', 0.4, 0.6);
      part(glassMat, panelW, height - t, 0.01, -width / 4 + 0.15, bottom, -0.02);
      part(rail, 0.03, height - t, 0.04, -width / 4 + 0.15 + panelW / 2, bottom, -0.02);
      part(glassMat, panelW, height - t, 0.01, width / 4, bottom, 0.02);
      part(rail, 0.03, height - t, 0.04, width / 4 - panelW / 2, bottom, 0.02);
    } else {
      // Swing door, shown open at 90° so walkthroughs can pass.
      addDoorLeaf(holder, o, width, height, bottom, t, mats);
    }
  }
}

function addDoorLeaf(holder: THREE.Group, o: Opening, width: number, height: number, bottom: number, t: number, mats: MaterialLibrary) {
  const leafW = width - 2 * t;
  const hingeX = (o.mirror ? 1 : -1) * (width / 2 - t);
  const side = o.flip ? -1 : 1;
  const pivot = new THREE.Group();
  pivot.position.set(hingeX, bottom, 0);
  pivot.rotation.y = (o.mirror ? 1 : -1) * side * (Math.PI / 2);
  holder.add(pivot);
  const leaf = new THREE.Mesh(single(new THREE.BoxGeometry(leafW, height - t, 0.04)), mats.color('#d9cbb8', 0.55));
  leaf.position.set((o.mirror ? -1 : 1) * (leafW / 2), (height - t) / 2, 0);
  leaf.castShadow = true;
  pivot.add(leaf);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), mats.color('#9a8f80', 0.3, 0.8));
  knob.position.set((o.mirror ? -1 : 1) * (leafW - 0.08), 1.0, 0.04);
  pivot.add(knob);
}

