import * as THREE from 'three';
import { add, dist, lineOfSight, pointInPolygon, scale, wallFrame, type Opening, type Vec2, type Wall } from '@homeset/core';

export interface PanoramaStop {
  id: string;
  name: string;
  url: string;
  /** Plan position (mm) and camera height above the floor (mm). */
  position: Vec2;
  height: number;
}

export interface PanoramaViewerOptions {
  /** One stop per room; stop ids are room ids. */
  stops: PanoramaStop[];
  /** Plan data: markers show only for rooms in sight, or at the doorway leading to them. */
  walls?: Wall[];
  openings?: Opening[];
  rooms?: { id: string; polygon: Vec2[] }[];
  levelHeight?: number;
  onStopChange?: (id: string) => void;
}

interface Doorway {
  rooms: [string, string];
  point: Vec2;
}

/**
 * "Real View": photoreal 360° panoramas linked room-to-room, like a Street View walk.
 * Panoramas share three.js's equirectangular layout, so markers placed at real plan
 * positions line up with the image.
 */
export class PanoramaViewer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  private readonly loader = new THREE.TextureLoader();
  private readonly textures = new Map<string, Promise<THREE.Texture>>();
  private readonly markers: { stop: PanoramaStop; el: HTMLButtonElement; at: Vec2 | null }[] = [];
  private readonly doorways: Doorway[];
  private zoomed = false;
  private readonly layer: HTMLDivElement;
  private readonly resizeObserver: ResizeObserver;
  private current: PanoramaStop | null = null;
  private yaw = 0;
  private pitch = 0;
  private drag: { id: number; x: number; y: number } | null = null;
  private pinch: { d: number; fov: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private dirty = true;
  private raf = 0;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly opts: PanoramaViewerOptions,
  ) {
    this.doorways = findDoorways(opts.walls ?? [], opts.openings ?? [], opts.rooms ?? []);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const canvas = this.renderer.domElement;
    Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none', cursor: 'grab', transition: 'opacity 220ms ease' });
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.appendChild(canvas);
    this.layer = document.createElement('div');
    Object.assign(this.layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' });
    container.appendChild(this.layer);

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKey);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop();
  }

  get stopId(): string | null {
    return this.current?.id ?? null;
  }

  /** Moves to a stop. Faces the direction of travel when coming from another stop. */
  async show(id: string): Promise<void> {
    const stop = this.opts.stops.find((s) => s.id === id);
    if (!stop || stop === this.current) return;
    const from = this.current;
    const texture = this.texture(stop.url);
    const canvas = this.renderer.domElement;
    canvas.style.opacity = from ? '0' : '1';
    const [tex] = await Promise.all([texture, from ? new Promise((r) => setTimeout(r, 220)) : null]);
    if (this.disposed) return;
    this.scene.background = tex;
    if (from) {
      const dx = stop.position[0] - from.position[0];
      const dz = stop.position[1] - from.position[1];
      this.yaw = Math.atan2(-dx, -dz);
    } else {
      this.yaw = this.openestHeading(stop);
    }
    this.pitch = -0.08;
    this.current = stop;
    this.buildMarkers();
    canvas.style.opacity = '1';
    this.dirty = true;
    this.opts.onStopChange?.(stop.id);
    // Warm up neighbours so the next step is instant.
    for (const m of this.markers) if (m.at) void this.texture(m.stop.url);
  }

  /** Faces the longest open view across the room on arrival. */
  private openestHeading(stop: PanoramaStop): number {
    const poly = this.opts.rooms?.find((r) => r.id === stop.id)?.polygon;
    if (!poly) return 0;
    let best = 0;
    let bestLen = -1;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const dir: Vec2 = [Math.cos(a), Math.sin(a)];
      let len = 0;
      while (len < 15000 && pointInPolygon(add(stop.position, scale(dir, len + 100)), poly)) len += 100;
      if (len > bestLen) {
        bestLen = len;
        best = Math.atan2(-dir[0], -dir[1]);
      }
    }
    return best;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.onKey);
    this.textures.forEach((p) => p.then((t) => t.dispose(), () => {}));
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.layer.remove();
  }

  private texture(url: string): Promise<THREE.Texture> {
    let p = this.textures.get(url);
    if (!p) {
      p = this.loader.loadAsync(url).then((t) => {
        t.mapping = THREE.EquirectangularReflectionMapping;
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      });
      this.textures.set(url, p);
    }
    return p;
  }

  private buildMarkers(): void {
    this.markers.forEach((m) => m.el.remove());
    this.markers.length = 0;
    const cur = this.current;
    if (!cur) return;
    const walls = this.opts.walls;
    const sees = (p: Vec2) => !walls || lineOfSight(cur.position, p, walls, this.opts.openings ?? [], this.opts.levelHeight ?? 2800);
    for (const stop of this.opts.stops) {
      if (stop === cur) continue;
      // In sight: mark where its panorama was taken. Around a corner: mark the doorway that leads there.
      let at: Vec2 | null = sees(stop.position) ? stop.position : null;
      if (!at) {
        const doors = this.doorways
          .filter((d) => d.rooms.includes(cur.id) && d.rooms.includes(stop.id) && sees(d.point))
          .sort((p, q) => dist(cur.position, p.point) - dist(cur.position, q.point));
        at = doors[0]?.point ?? null;
      }
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'pano-marker';
      el.innerHTML = `<span class="pano-ring"></span><span class="pano-label"></span>`;
      (el.querySelector('.pano-label') as HTMLSpanElement).textContent = stop.name;
      el.style.pointerEvents = 'auto';
      el.addEventListener('click', () => void this.show(stop.id));
      this.layer.appendChild(el);
      this.markers.push({ stop, el, at });
    }
  }

  private placeMarkers(): void {
    const cur = this.current;
    if (!cur) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const v = new THREE.Vector3();
    for (const m of this.markers) {
      if (!m.at) {
        m.el.style.display = 'none';
        continue;
      }
      // A spot on the floor: the other panorama, or the doorway leading to it.
      v.set((m.at[0] - cur.position[0]) / 1000, -cur.height / 1000, (m.at[1] - cur.position[1]) / 1000);
      v.project(this.camera);
      const onScreen = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      m.el.style.display = onScreen ? 'flex' : 'none';
      if (onScreen) m.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
    }
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait phones need a taller view to see a sensible width of the room.
    if (!this.zoomed) this.camera.fov = w < h ? 100 : 75;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.dirty) return;
    this.dirty = false;
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.renderer.render(this.scene, this.camera);
    this.placeMarkers();
  };

  private onDown = (e: PointerEvent) => {
    this.renderer.domElement.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: this.camera.fov };
      this.drag = null;
    } else {
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.renderer.domElement.style.cursor = 'grabbing';
    }
  };

  private onMove = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      this.setFov(this.pinch.fov * (this.pinch.d / Math.hypot(a.x - b.x, a.y - b.y)));
      return;
    }
    if (!this.drag || this.drag.id !== e.pointerId) return;
    // Drag the image under your finger: slower when zoomed in.
    const k = (this.camera.fov / 75) * (e.pointerType === 'touch' ? 0.004 : 0.0035);
    this.yaw += (e.clientX - this.drag.x) * k;
    this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch + (e.clientY - this.drag.y) * k));
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    this.dirty = true;
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.drag?.id === e.pointerId) this.drag = null;
    this.renderer.domElement.style.cursor = 'grab';
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.setFov(this.camera.fov * Math.exp(e.deltaY * 0.001));
  };

  private onKey = (e: KeyboardEvent) => {
    const step = 0.08;
    if (e.key === 'ArrowLeft') this.yaw += step;
    else if (e.key === 'ArrowRight') this.yaw -= step;
    else if (e.key === 'ArrowUp') this.pitch = Math.min(1.3, this.pitch + step);
    else if (e.key === 'ArrowDown') this.pitch = Math.max(-1.3, this.pitch - step);
    else return;
    this.dirty = true;
  };

  private setFov(fov: number): void {
    this.zoomed = true;
    this.camera.fov = Math.max(35, Math.min(105, fov));
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }
}

/** Floor-level openings that connect two rooms, at the middle of the opening. */
function findDoorways(walls: Wall[], openings: Opening[], rooms: { id: string; polygon: Vec2[] }[]): Doorway[] {
  const doorways: Doorway[] = [];
  for (const o of openings) {
    if (o.kind === 'window' || o.sill > 1) continue;
    const wall = walls.find((w) => w.id === o.wallId);
    if (!wall) continue;
    const f = wallFrame(wall);
    const centre = add(wall.a, scale(f.dir, o.offset));
    const probe = f.half + 150;
    const a = rooms.find((r) => pointInPolygon(add(centre, scale(f.normal, probe)), r.polygon));
    const b = rooms.find((r) => pointInPolygon(add(centre, scale(f.normal, -probe)), r.polygon));
    if (a && b && a.id !== b.id) doorways.push({ rooms: [a.id, b.id], point: centre });
  }
  return doorways;
}
