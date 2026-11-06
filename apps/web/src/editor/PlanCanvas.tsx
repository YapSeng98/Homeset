import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import {
  add,
  area,
  closestPointOnSegment,
  computeWallFootprints,
  createId,
  cross,
  DEFAULTS,
  dist,
  dot,
  formatArea,
  formatLength,
  labelPoint,
  localize,
  normalize,
  openingSpans,
  scale,
  sub,
  wallFrame,
  wallPieces,
  type Item,
  type Opening,
  type RoomType,
  type Vec2,
  type Wall,
} from '@homeset/core';
import { useI18n } from '../i18n';
import { registry } from '../registry';
import { useEditor, type EditorStore } from './store';

interface Xf {
  k: number;
  x: number;
  y: number;
}

type Drag =
  | { type: 'pan'; sx: number; sy: number; x: number; y: number }
  | { type: 'vertex'; from: Vec2 }
  | { type: 'item'; id: string; offset: Vec2 }
  | { type: 'opening'; id: string };

const ROOM_FILL: Record<RoomType, string> = {
  living: '#f3ead9',
  dining: '#f3ead9',
  kitchen: '#e8eef0',
  master: '#efe6f0',
  bedroom: '#e9eef6',
  bathroom: '#e1eef0',
  study: '#eef0e3',
  balcony: '#e6efe2',
  utility: '#ecebe8',
  corridor: '#f1efe9',
  other: '#f1efe9',
};

const OPENING_DEFAULTS = {
  door: DEFAULTS.door,
  'sliding-door': DEFAULTS.slidingDoor,
  window: DEFAULTS.window,
  opening: DEFAULTS.opening,
} as const;

const SNAP_PX = 12;
const round10 = (v: number) => Math.round(v / 10) * 10;

interface SnapResult {
  p: Vec2;
  guides: [Vec2, Vec2][];
  snapped: boolean;
}

/** Endpoint → on-wall → orthogonal → alignment → 10 mm grid. */
function snapPoint(raw: Vec2, walls: Wall[], k: number, opts: { from?: Vec2; free?: boolean; exclude?: Vec2 }): SnapResult {
  const tol = SNAP_PX / k;
  const ends: Vec2[] = [];
  for (const w of walls) for (const e of [w.a, w.b]) if (!opts.exclude || dist(e, opts.exclude) > 0.5) ends.push(e);

  let best: Vec2 | null = null;
  let bestD = tol;
  for (const e of ends) {
    const d = dist(e, raw);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  if (best) return { p: [best[0], best[1]], guides: [], snapped: true };

  const p: Vec2 = [raw[0], raw[1]];
  let lockX = false;
  let lockY = false;
  if (opts.from && !opts.free) {
    const dx = Math.abs(p[0] - opts.from[0]);
    const dy = Math.abs(p[1] - opts.from[1]);
    if (dy <= dx * 0.14) {
      p[1] = opts.from[1];
      lockY = true;
    } else if (dx <= dy * 0.14) {
      p[0] = opts.from[0];
      lockX = true;
    }
  }

  for (const w of walls) {
    if (opts.exclude && (dist(w.a, opts.exclude) < 0.5 || dist(w.b, opts.exclude) < 0.5)) continue;
    const c = closestPointOnSegment(p, w.a, w.b);
    if (c.distance > tol) continue;
    if (lockY && Math.abs(w.b[1] - w.a[1]) > 1) {
      const t = (p[1] - w.a[1]) / (w.b[1] - w.a[1]);
      if (t >= 0 && t <= 1) return { p: [w.a[0] + t * (w.b[0] - w.a[0]), p[1]], guides: [], snapped: true };
    } else if (lockX && Math.abs(w.b[0] - w.a[0]) > 1) {
      const t = (p[0] - w.a[0]) / (w.b[0] - w.a[0]);
      if (t >= 0 && t <= 1) return { p: [p[0], w.a[1] + t * (w.b[1] - w.a[1])], guides: [], snapped: true };
    } else if (!lockX && !lockY) {
      return { p: c.point, guides: [], snapped: true };
    }
  }

  const guides: [Vec2, Vec2][] = [];
  let alignedX = lockX;
  let alignedY = lockY;
  for (const e of ends) {
    if (!alignedX && Math.abs(p[0] - e[0]) < tol) {
      p[0] = e[0];
      alignedX = true;
      guides.push([e, p]);
    }
    if (!alignedY && Math.abs(p[1] - e[1]) < tol) {
      p[1] = e[1];
      alignedY = true;
      guides.push([e, p]);
    }
  }
  if (!alignedX) p[0] = round10(p[0]);
  if (!alignedY) p[1] = round10(p[1]);
  return { p, guides, snapped: false };
}

function wallAt(p: Vec2, walls: Wall[], k: number): { wall: Wall; along: number } | null {
  let best: { wall: Wall; along: number } | null = null;
  let bestD = Infinity;
  for (const w of walls) {
    const c = closestPointOnSegment(p, w.a, w.b);
    const limit = Math.max(w.thickness / 2 + 8 / k, 18 / k);
    if (c.distance < limit && c.distance < bestD) {
      bestD = c.distance;
      best = { wall: w, along: c.t * dist(w.a, w.b) };
    }
  }
  return best;
}

/** Puts an item's back against the nearest wall, facing into the room. */
function snapItemToWall(p: Vec2, depth: number, walls: Wall[]): { position: Vec2; rotation: number } | null {
  let best: { position: Vec2; rotation: number } | null = null;
  let bestD = Infinity;
  for (const w of walls) {
    const f = wallFrame(w);
    const c = closestPointOnSegment(p, w.a, w.b);
    const gap = c.distance - f.half - depth / 2;
    if (gap > 350 || c.t <= 0 || c.t >= 1 || c.distance >= bestD) continue;
    const s = Math.sign(dot(sub(p, w.a), f.normal)) || 1;
    const facing = scale(f.normal, s);
    bestD = c.distance;
    best = {
      position: add(c.point, scale(facing, f.half + depth / 2 + 5)).map(Math.round) as Vec2,
      rotation: ((Math.round((Math.atan2(-facing[0], facing[1]) * 180) / Math.PI) % 360) + 360) % 360,
    };
  }
  return best;
}

function itemSize(item: Pick<Item, 'catalogId' | 'width' | 'depth'>) {
  const def = registry.item(item.catalogId);
  return { w: item.width ?? def?.size.w ?? 600, d: item.depth ?? def?.size.d ?? 600 };
}

export function PlanCanvas({ store }: { store: EditorStore }) {
  const state = useEditor(store);
  const { t, lang } = useI18n();
  const level = state.model.levels.find((l) => l.id === state.levelId)!;
  const svgRef = useRef<SVGSVGElement>(null);
  const [xf, setXf] = useState<Xf>({ k: 0.05, x: 80, y: 80 });
  const xfRef = useRef(xf);
  xfRef.current = xf;
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [guides, setGuides] = useState<[Vec2, Vec2][]>([]);
  const [draft, setDraft] = useState<Vec2[]>([]);
  const [typed, setTyped] = useState('');
  const [calib, setCalib] = useState<{ a: Vec2; b?: Vec2; length: string } | null>(null);
  const [ghost, setGhost] = useState<{ position: Vec2; rotation: number } | null>(null);
  const [ghostRotation, setGhostRotation] = useState(0);
  const drag = useRef<Drag | null>(null);
  const spaceDown = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; cx: number; cy: number; xf: Xf } | null>(null);

  const footprints = useMemo(() => computeWallFootprints(level.walls), [level.walls]);
  const isOpeningTool = state.tool === 'door' || state.tool === 'sliding-door' || state.tool === 'window' || state.tool === 'opening';

  // ---------- View ----------
  const fit = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const W = svg.clientWidth;
    const H = svg.clientHeight;
    const pts: Vec2[] = level.walls.flatMap((w) => [w.a, w.b]);
    const u = level.underlay;
    if (u && u.visible) {
      pts.push(u.offset, [u.offset[0] + u.pixelWidth * u.mmPerPixel, u.offset[1] + u.pixelHeight * u.mmPerPixel]);
    }
    if (pts.length === 0) pts.push([0, 0], [12000, 9000]);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs) - 1500;
    const maxX = Math.max(...xs) + 1500;
    const minY = Math.min(...ys) - 1500;
    const maxY = Math.max(...ys) + 1500;
    const k = Math.min(W / (maxX - minX), H / (maxY - minY));
    setXf({ k, x: (W - (maxX - minX) * k) / 2 - minX * k, y: (H - (maxY - minY) * k) / 2 - minY * k });
  }, [level.walls, level.underlay]);

  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.fitRequest]);

  useEffect(() => {
    const svg = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const cur = xfRef.current;
      const k = Math.min(1, Math.max(0.004, cur.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
      const wx = (sx - cur.x) / cur.k;
      const wy = (sy - cur.y) / cur.k;
      setXf({ k, x: sx - wx * k, y: sy - wy * k });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const toWorld = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = svgRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left - xf.x) / xf.k, (e.clientY - r.top - xf.y) / xf.k];
  };

  // ---------- Actions ----------
  const addWall = (a: Vec2, b: Vec2) => {
    if (dist(a, b) < 50) return false;
    store.dispatch({ type: 'wall/add', levelId: level.id, wall: { id: createId('wall'), a, b, thickness: state.wallThickness } });
    return true;
  };

  const addPoint = (p: Vec2) => {
    if (draft.length === 0) return setDraft([p]);
    const last = draft[draft.length - 1]!;
    if (!addWall(last, p)) return;
    if (dist(p, draft[0]!) < 1) setDraft([]);
    else setDraft([...draft, p]);
  };

  const finishChain = () => {
    setDraft([]);
    setTyped('');
  };

  const placeOpening = (p: Vec2) => {
    if (!isOpeningTool) return;
    const hit = wallAt(p, level.walls, xf.k);
    if (!hit) return;
    const kind = state.tool as Opening['kind'];
    const def = OPENING_DEFAULTS[kind];
    const L = dist(hit.wall.a, hit.wall.b);
    if (L < def.width + 100) return;
    const offset = Math.round(Math.min(L - def.width / 2 - 50, Math.max(def.width / 2 + 50, hit.along)));
    const opening: Opening = { id: createId('op'), wallId: hit.wall.id, kind, offset, width: def.width, height: def.height, sill: def.sill };
    store.dispatch({ type: 'opening/add', levelId: level.id, opening });
  };

  const placeItem = (e: { shiftKey: boolean }) => {
    if (!state.placing || !ghost) return;
    const id = createId('itm');
    const def = registry.item(state.placing);
    store.dispatch({
      type: 'item/add',
      levelId: level.id,
      item: { id, catalogId: state.placing, position: ghost.position, rotation: ghost.rotation, elevation: def?.defaultElevation ?? 0 },
    });
    if (!e.shiftKey) {
      store.setPlacing(null);
      store.select({ kind: 'item', id });
    }
  };

  const applyCalibration = () => {
    if (!calib?.b || !level.underlay) return;
    const real = Number(calib.length);
    const measured = dist(calib.a, calib.b);
    if (!(real > 0) || measured < 1) return;
    const u = level.underlay;
    const ratio = real / measured;
    // Keep point A fixed while rescaling the image around it.
    const offset: Vec2 = [calib.a[0] - (calib.a[0] - u.offset[0]) * ratio, calib.a[1] - (calib.a[1] - u.offset[1]) * ratio];
    store.dispatch({ type: 'underlay/update', levelId: level.id, patch: { mmPerPixel: u.mmPerPixel * ratio, offset } });
    setCalib(null);
    store.setTool('wall');
    store.requestFit();
  };

  const rotateSelected = (deg: number) => {
    if (state.placing) return setGhostRotation((r) => (r + deg + 360) % 360);
    const sel = state.selection;
    if (sel?.kind !== 'item') return;
    const item = level.items.find((i) => i.id === sel.id);
    if (item) store.dispatch({ type: 'item/update', levelId: level.id, id: item.id, patch: { rotation: (item.rotation + deg + 360) % 360 } });
  };

  // ---------- Keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if (e.code === 'Space') {
        spaceDown.current = e.type === 'keydown';
        return;
      }
      if (e.type !== 'keydown' || e.metaKey || e.ctrlKey) return;
      if (state.tool === 'wall' && draft.length > 0) {
        if (/^[0-9]$/.test(e.key)) return setTyped((s) => (s + e.key).slice(0, 6));
        if (e.key === 'Backspace' && typed) return setTyped((s) => s.slice(0, -1));
        if (e.key === 'Enter') {
          if (typed && cursor) {
            const last = draft[draft.length - 1]!;
            let dir = normalize(sub(cursor, last));
            if (dir[0] === 0 && dir[1] === 0) dir = [1, 0];
            addPoint(add(last, scale(dir, Number(typed))).map(Math.round) as Vec2);
            setTyped('');
          } else finishChain();
          return;
        }
      }
      switch (e.key) {
        case 'Escape':
          if (draft.length) finishChain();
          else if (calib) setCalib(null);
          else if (state.placing) store.setPlacing(null);
          else {
            store.select(null);
            store.setTool('select');
          }
          break;
        case 'Delete':
        case 'Backspace':
          store.deleteSelection();
          break;
        case 'r':
        case 'R':
          rotateSelected(e.shiftKey ? -90 : 90);
          break;
        case 'v':
          store.setTool('select');
          break;
        case 'w':
          store.setTool('wall');
          break;
        case 'd':
          store.setTool('door');
          break;
        case 'n':
          store.setTool('window');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  });

  useEffect(() => {
    if (state.tool !== 'wall') finishChain();
    if (state.tool !== 'calibrate') setCalib(null);
  }, [state.tool]);

  // ---------- Pointer ----------
  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    svgRef.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinch.current = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2, xf };
      drag.current = null;
      return;
    }
    const w = toWorld(e);
    const panStart = { type: 'pan' as const, sx: e.clientX, sy: e.clientY, x: xf.x, y: xf.y };
    if (e.button === 1 || e.button === 2 || spaceDown.current) {
      drag.current = panStart;
      return;
    }
    if (state.placing) return placeItem(e);
    if (state.tool === 'wall') {
      const s = snapPoint(w, level.walls, xf.k, { from: draft[draft.length - 1], free: e.shiftKey });
      return addPoint(s.p);
    }
    if (isOpeningTool) return placeOpening(w);
    if (state.tool === 'calibrate') {
      if (!level.underlay) return;
      if (!calib || calib.b) setCalib({ a: w, length: '' });
      else setCalib({ ...calib, b: w });
      return;
    }
    // Select tool
    const el = (e.target as Element).closest('[data-kind]') as SVGElement | null;
    const kind = el?.dataset.kind;
    const id = el?.dataset.id ?? '';
    if (kind === 'handle') {
      const [x, y] = (el!.dataset.point ?? '0,0').split(',').map(Number) as [number, number];
      drag.current = { type: 'vertex', from: [x, y] };
    } else if (kind === 'item') {
      const item = level.items.find((i) => i.id === id)!;
      store.select({ kind: 'item', id });
      drag.current = { type: 'item', id, offset: sub(w, item.position) };
    } else if (kind === 'opening') {
      store.select({ kind: 'opening', id });
      drag.current = { type: 'opening', id };
    } else if (kind === 'wall' || kind === 'room') {
      store.select({ kind, id });
      drag.current = panStart;
    } else {
      store.select(null);
      drag.current = panStart;
    }
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [p1, p2] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const r = svgRef.current!.getBoundingClientRect();
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const cx = (p1.x + p2.x) / 2;
      const cy = (p1.y + p2.y) / 2;
      const s = pinch.current;
      const k = Math.min(1, Math.max(0.004, s.xf.k * (d / s.d)));
      const wx = (s.cx - r.left - s.xf.x) / s.xf.k;
      const wy = (s.cy - r.top - s.xf.y) / s.xf.k;
      setXf({ k, x: cx - r.left - wx * k, y: cy - r.top - wy * k });
      return;
    }
    const w = toWorld(e);
    const d = drag.current;
    if (d?.type === 'pan') {
      setXf({ k: xf.k, x: d.x + e.clientX - d.sx, y: d.y + e.clientY - d.sy });
      return;
    }
    if (d?.type === 'vertex') {
      const s = snapPoint(w, level.walls, xf.k, { exclude: d.from });
      if (dist(s.p, d.from) > 0.5) {
        store.dispatch({ type: 'vertex/move', levelId: level.id, from: d.from, to: s.p }, { mergeKey: 'vertex' });
        d.from = s.p;
      }
      setGuides(s.guides);
      return;
    }
    if (d?.type === 'item') {
      const item = level.items.find((i) => i.id === d.id);
      if (!item) return;
      const raw = sub(w, d.offset).map(Math.round) as Vec2;
      const snap = e.altKey ? null : snapItemToWall(raw, itemSize(item).d, level.walls);
      store.dispatch(
        { type: 'item/update', levelId: level.id, id: d.id, patch: snap ? { position: snap.position, rotation: snap.rotation } : { position: raw } },
        { mergeKey: `item:${d.id}` },
      );
      return;
    }
    if (d?.type === 'opening') {
      const o = level.openings.find((x) => x.id === d.id);
      const wall = o && level.walls.find((x) => x.id === o.wallId);
      if (!o || !wall) return;
      const L = dist(wall.a, wall.b);
      const along = closestPointOnSegment(w, wall.a, wall.b).t * L;
      const offset = Math.round(Math.min(L - o.width / 2, Math.max(o.width / 2, along)) / 10) * 10;
      if (offset !== o.offset) store.dispatch({ type: 'opening/update', levelId: level.id, id: o.id, patch: { offset } }, { mergeKey: `op:${o.id}` });
      return;
    }

    // Hover feedback
    if (state.tool === 'wall') {
      const s = snapPoint(w, level.walls, xf.k, { from: draft[draft.length - 1], free: e.shiftKey });
      setCursor(s.p);
      setGuides(s.guides);
    } else if (state.placing) {
      const def = registry.item(state.placing);
      const raw = w.map(Math.round) as Vec2;
      const snap = e.altKey || !def ? null : snapItemToWall(raw, def.size.d, level.walls);
      setGhost(snap ?? { position: raw, rotation: ghostRotation });
      setCursor(w);
    } else {
      setCursor(w);
      setGuides([]);
    }
  };

  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    drag.current = null;
    setGuides([]);
    store.seal();
  };

  // ---------- Render helpers ----------
  const k = xf.k;
  const px = (n: number) => n / k; // screen px → world mm
  const pts = (poly: Vec2[]) => poly.map((p) => `${p[0]},${p[1]}`).join(' ');
  const sel = state.selection;
  const u = level.underlay;

  const hoverOpening = useMemo(() => {
    if (!isOpeningTool || !cursor) return null;
    const hit = wallAt(cursor, level.walls, k);
    if (!hit) return null;
    const def = OPENING_DEFAULTS[state.tool as Opening['kind']];
    const f = wallFrame(hit.wall);
    if (f.length < def.width + 100) return null;
    const along = Math.min(f.length - def.width / 2 - 50, Math.max(def.width / 2 + 50, hit.along));
    const at = (s: number, side: number) => add(add(hit.wall.a, scale(f.dir, s)), scale(f.normal, f.half * side * 1.4));
    return [at(along - def.width / 2, 1), at(along + def.width / 2, 1), at(along + def.width / 2, -1), at(along - def.width / 2, -1)];
  }, [cursor, isOpeningTool, level.walls, k, state.tool]);

  const lastDraft = draft[draft.length - 1];
  const previewEnd =
    lastDraft && cursor && typed
      ? add(lastDraft, scale(normalize(sub(cursor, lastDraft)), Number(typed)))
      : cursor;

  return (
    <>
      <svg
        ref={svgRef}
        className="plan"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setCursor(null)}
        onDoubleClick={() => state.tool === 'wall' && finishChain()}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: drag.current?.type === 'pan' ? 'grabbing' : state.tool === 'select' && !state.placing ? 'default' : 'crosshair' }}
      >
        <defs>
          <pattern id="grid" width={1000} height={1000} patternUnits="userSpaceOnUse">
            <path d="M 500 0 L 500 1000 M 0 500 L 1000 500" stroke="#e7e4dd" strokeWidth={px(1)} fill="none" />
            <path d="M 0 0 L 1000 0 M 0 0 L 0 1000" stroke="#dcd8cf" strokeWidth={px(1)} fill="none" />
          </pattern>
        </defs>
        <g transform={`translate(${xf.x} ${xf.y}) scale(${k})`}>
          <rect x={-200000} y={-200000} width={400000} height={400000} fill="url(#grid)" />

          {u && u.visible && (
            <image
              href={u.url}
              x={u.offset[0]}
              y={u.offset[1]}
              width={u.pixelWidth * u.mmPerPixel}
              height={u.pixelHeight * u.mmPerPixel}
              opacity={u.opacity}
              preserveAspectRatio="none"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {level.rooms.map((r) => (
            <polygon
              key={r.id}
              data-kind="room"
              data-id={r.id}
              points={pts(r.polygon)}
              fill={ROOM_FILL[r.type]}
              fillOpacity={u?.visible ? 0.45 : 1}
              stroke={sel?.kind === 'room' && sel.id === r.id ? 'var(--brand)' : 'none'}
              strokeWidth={px(2)}
            />
          ))}

          {level.items.map((item) => {
            const def = registry.item(item.catalogId);
            const { w, d } = itemSize(item);
            const selected = sel?.kind === 'item' && sel.id === item.id;
            const label = def ? localize(def.name, lang) : item.catalogId;
            return (
              <g key={item.id} data-kind="item" data-id={item.id} transform={`translate(${item.position[0]} ${item.position[1]}) rotate(${item.rotation})`} style={{ cursor: 'move' }}>
                <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={px(3)} fill="#ffffff" fillOpacity={0.92} stroke={selected ? 'var(--brand)' : '#8e8a82'} strokeWidth={px(selected ? 2 : 1)} />
                <line x1={-w / 2 + px(3)} x2={w / 2 - px(3)} y1={d / 2 - px(3)} y2={d / 2 - px(3)} stroke="#c9c3b8" strokeWidth={px(2)} />
                {w * k > 44 && d * k > 16 && (
                  <text textAnchor="middle" dominantBaseline="central" fontSize={px(10)} fill="#5b625f" transform={`rotate(${-item.rotation})`} style={{ pointerEvents: 'none' }}>
                    {label.length > 18 ? `${label.slice(0, 16)}…` : label}
                  </text>
                )}
              </g>
            );
          })}

          {[...footprints.values()].map((fp) => {
            const wall = fp.frame.wall;
            const height = wall.height ?? level.height;
            const low = height < 1300;
            return wallPieces(fp, level.openings, height)
              .filter((p) => p.kind === 'solid')
              .map((piece, i) => (
                <polygon key={`${wall.id}:${i}`} data-kind="wall" data-id={wall.id} points={pts(piece.footprint)} fill={low ? '#8d918e' : wall.structural ? '#5a2f2b' : 'var(--wall)'} />
              ));
          })}

          {[...footprints.values()].flatMap((fp) => {
            const f = fp.frame;
            const height = f.wall.height ?? level.height;
            return openingSpans(f, level.openings, height).map((span) => {
              const o = span.opening;
              const at = (s: number, side: number): Vec2 => add(add(f.wall.a, scale(f.dir, s)), scale(f.normal, f.half * side));
              const quad = [at(span.start, 1), at(span.end, 1), at(span.end, -1), at(span.start, -1)];
              const selected = sel?.kind === 'opening' && sel.id === o.id;
              const stroke = selected ? 'var(--brand)' : '#2b2f2d';
              const sw = px(selected ? 2 : 1.2);
              let symbol = null;
              if (o.kind === 'door') {
                const hingeS = o.mirror ? span.end : span.start;
                const otherS = o.mirror ? span.start : span.end;
                const side = o.flip ? -1 : 1;
                const hinge = at(hingeS, 0);
                const leafLen = span.end - span.start;
                const leafEnd = add(hinge, scale(f.normal, side * leafLen));
                const jamb = at(otherS, 0);
                const sweep = cross(sub(leafEnd, hinge), sub(jamb, hinge)) > 0 ? 1 : 0;
                symbol = (
                  <path d={`M ${hinge[0]} ${hinge[1]} L ${leafEnd[0]} ${leafEnd[1]} A ${leafLen} ${leafLen} 0 0 ${sweep} ${jamb[0]} ${jamb[1]}`} fill="none" stroke={stroke} strokeWidth={sw} />
                );
              } else if (o.kind === 'sliding-door') {
                const mid = (span.start + span.end) / 2;
                const a1 = at(span.start, 0.35), b1 = at(mid + 60, 0.35), a2 = at(mid - 60, -0.35), b2 = at(span.end, -0.35);
                symbol = (
                  <path d={`M ${a1[0]} ${a1[1]} L ${b1[0]} ${b1[1]} M ${a2[0]} ${a2[1]} L ${b2[0]} ${b2[1]}`} stroke={stroke} strokeWidth={sw * 1.6} />
                );
              } else if (o.kind === 'window') {
                const a1 = at(span.start, 0.3), b1 = at(span.end, 0.3), a2 = at(span.start, -0.3), b2 = at(span.end, -0.3);
                symbol = <path d={`M ${a1[0]} ${a1[1]} L ${b1[0]} ${b1[1]} M ${a2[0]} ${a2[1]} L ${b2[0]} ${b2[1]}`} stroke={stroke} strokeWidth={sw} />;
              }
              return (
                <g key={o.id} data-kind="opening" data-id={o.id} style={{ cursor: 'ew-resize' }}>
                  <polygon points={pts(quad)} fill={o.kind === 'window' ? '#ffffff' : '#f7f6f2'} stroke={o.kind === 'opening' ? 'none' : stroke} strokeWidth={sw} strokeDasharray={o.kind === 'opening' ? `${px(4)} ${px(3)}` : undefined} />
                  {symbol}
                </g>
              );
            });
          })}

          {level.rooms.map((r) => {
            const lp = labelPoint(r.polygon);
            return (
              <g key={`label:${r.id}`} style={{ pointerEvents: 'none' }} paintOrder="stroke" stroke="#ffffff" strokeWidth={px(3)} strokeLinejoin="round">
                <text x={lp[0]} y={lp[1] - px(7)} textAnchor="middle" fontSize={px(12)} fontWeight={600} fill="#2b2f2d">
                  {r.name}
                </text>
                <text x={lp[0]} y={lp[1] + px(9)} textAnchor="middle" fontSize={px(10.5)} fill="#5b625f">
                  {formatArea(area(r.polygon))}
                </text>
              </g>
            );
          })}

          {sel?.kind === 'wall' &&
            (() => {
              const fp = footprints.get(sel.id);
              if (!fp) return null;
              const wall = fp.frame.wall;
              const mid: Vec2 = [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2];
              const off = add(mid, scale(fp.frame.normal, fp.frame.half + px(14)));
              return (
                <g>
                  <polygon points={pts([fp.startPlus, fp.endPlus, fp.endMinus, fp.startMinus])} fill="none" stroke="var(--brand)" strokeWidth={px(2.5)} style={{ pointerEvents: 'none' }} />
                  <text x={off[0]} y={off[1]} textAnchor="middle" dominantBaseline="central" fontSize={px(11)} fill="var(--brand-strong)" fontWeight={600} style={{ pointerEvents: 'none' }}>
                    {formatLength(fp.frame.length)}
                  </text>
                  {[wall.a, wall.b].map((p, i) => (
                    <circle key={i} data-kind="handle" data-point={`${p[0]},${p[1]}`} cx={p[0]} cy={p[1]} r={px(7)} fill="#fff" stroke="var(--brand)" strokeWidth={px(2)} style={{ cursor: 'move' }} />
                  ))}
                </g>
              );
            })()}

          {state.tool === 'wall' &&
            level.walls.flatMap((w) => [w.a, w.b]).map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={px(3)} fill="var(--brand)" opacity={0.5} style={{ pointerEvents: 'none' }} />)}

          {guides.map(([a, b], i) => (
            <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--brand)" strokeWidth={px(1)} strokeDasharray={`${px(4)} ${px(4)}`} style={{ pointerEvents: 'none' }} />
          ))}

          {state.tool === 'wall' && draft.length > 0 && previewEnd && (
            <g style={{ pointerEvents: 'none' }}>
              {draft.length > 1 && <polyline points={pts(draft)} fill="none" stroke="var(--brand)" strokeWidth={px(2)} />}
              <line x1={lastDraft![0]} y1={lastDraft![1]} x2={previewEnd[0]} y2={previewEnd[1]} stroke="var(--brand)" strokeWidth={state.wallThickness} strokeOpacity={0.35} />
              <line x1={lastDraft![0]} y1={lastDraft![1]} x2={previewEnd[0]} y2={previewEnd[1]} stroke="var(--brand)" strokeWidth={px(1.5)} />
              <text
                x={(lastDraft![0] + previewEnd[0]) / 2}
                y={(lastDraft![1] + previewEnd[1]) / 2 - px(14)}
                textAnchor="middle"
                fontSize={px(12)}
                fontWeight={600}
                fill="var(--brand-strong)"
                paintOrder="stroke"
                stroke="#fff"
                strokeWidth={px(4)}
              >
                {typed ? `${typed} mm ⏎` : formatLength(dist(lastDraft!, previewEnd))}
              </text>
            </g>
          )}
          {state.tool === 'wall' && cursor && <circle cx={cursor[0]} cy={cursor[1]} r={px(5)} fill="none" stroke="var(--brand)" strokeWidth={px(2)} style={{ pointerEvents: 'none' }} />}

          {hoverOpening && <polygon points={pts(hoverOpening)} fill="var(--accent)" fillOpacity={0.6} stroke="#b88a1c" strokeWidth={px(1.5)} style={{ pointerEvents: 'none' }} />}

          {state.placing && ghost && (() => {
            const def = registry.item(state.placing);
            if (!def) return null;
            return (
              <g transform={`translate(${ghost.position[0]} ${ghost.position[1]}) rotate(${ghost.rotation})`} style={{ pointerEvents: 'none' }}>
                <rect x={-def.size.w / 2} y={-def.size.d / 2} width={def.size.w} height={def.size.d} fill="var(--brand)" fillOpacity={0.18} stroke="var(--brand)" strokeWidth={px(1.5)} strokeDasharray={`${px(5)} ${px(3)}`} />
                <line x1={-def.size.w / 2} x2={def.size.w / 2} y1={def.size.d / 2} y2={def.size.d / 2} stroke="var(--brand)" strokeWidth={px(3)} />
              </g>
            );
          })()}

          {calib && (
            <g style={{ pointerEvents: 'none' }}>
              {(() => {
                const b = calib.b ?? cursor ?? calib.a;
                return (
                  <>
                    <line x1={calib.a[0]} y1={calib.a[1]} x2={b[0]} y2={b[1]} stroke="#d4442e" strokeWidth={px(2)} />
                    {[calib.a, b].map((p, i) => (
                      <circle key={i} cx={p[0]} cy={p[1]} r={px(5)} fill="#fff" stroke="#d4442e" strokeWidth={px(2)} />
                    ))}
                  </>
                );
              })()}
            </g>
          )}
        </g>
      </svg>

      {calib?.b && (
        <div className="floating" style={{ top: 16, left: '50%', transform: 'translateX(-50%)', width: 300 }}>
          <form
            className="field"
            onSubmit={(e) => {
              e.preventDefault();
              applyCalibration();
            }}
          >
            <span>{t('calibrate.prompt')}</span>
            <div className="row">
              <input className="input" autoFocus inputMode="numeric" value={calib.length} onChange={(e) => setCalib({ ...calib, length: e.target.value.replace(/[^0-9]/g, '') })} placeholder="3600" />
              <button className="btn btn-primary" disabled={!Number(calib.length)}>
                {t('calibrate.apply')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="hintbar">
        {state.placing
          ? t('hint.item')
          : state.tool === 'wall'
            ? t('hint.wall')
            : isOpeningTool
              ? t('hint.opening')
              : state.tool === 'calibrate'
                ? t('hint.calibrate')
                : t('hint.select')}
      </div>
    </>
  );
}
