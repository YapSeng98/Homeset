import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { distanceToPolygonEdge, pointInPolygon, type HomeModel, type Registry, type Vec2 } from '@rumah3d/core';
import { buildLevel, type BuiltLevel, type RoomInfo } from './house';
import { MaterialLibrary } from './materials';
import { WalkControls } from './walk';

export type ViewMode = 'orbit' | 'walk';
export type RenderQuality = 'high' | 'low';

export interface HouseViewerOptions {
  registry: Registry;
  background?: string;
  /** 'high' adds ambient occlusion and sharper shadows. Defaults to 'low' on phones, 'high' elsewhere. */
  quality?: RenderQuality;
  /** Fires when the walker enters a different room (null = outside / dollhouse). Used for tour analytics. */
  onRoomChange?: (roomId: string | null) => void;
}

export interface PhotoOptions {
  /** Path-tracing samples per pixel. More = cleaner and slower. */
  samples?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Smooth remaining grain (default on). */
  denoise?: boolean | DenoiseSettings;
}

/** Smart-denoise parameters: sigma = blur radius, threshold = edge sharpness, kSigma = sample spread. */
export interface DenoiseSettings {
  sigma: number;
  threshold: number;
  kSigma: number;
  /** Remove lone outlier pixels first (default true). */
  despeckle?: boolean;
}

// Tuned on interior renders: removes speckle while keeping fabric and wood detail.
const DEFAULT_DENOISE: DenoiseSettings = { sigma: 5, threshold: 0.06, kSigma: 1.2 };

/** Replaces a pixel with its 3×3 luminance-median neighbour when it is a clear outlier. */
function despeckleMaterial(width: number, height: number, map: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, texel: { value: new THREE.Vector2(1 / width, 1 / height) } },
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec2 texel;
      varying vec2 vUv;
      float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
      void main() {
        vec4 s[9];
        float l[9];
        int k = 0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            s[k] = texture2D(map, vUv + vec2(float(x), float(y)) * texel);
            l[k] = lum(s[k].rgb);
            k++;
          }
        }
        int med = 4;
        for (int i = 0; i < 9; i++) {
          int rank = 0;
          for (int j = 0; j < 9; j++) {
            if (l[j] < l[i] || (l[j] == l[i] && j < i)) rank++;
          }
          if (rank == 4) med = i;
        }
        float m = l[med];
        gl_FragColor = abs(l[4] - m) > 0.35 * m + 0.02 ? s[med] : s[4];
      }`,
  });
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function defaultQuality(): RenderQuality {
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  return coarse || (navigator.hardwareConcurrency ?? 8) <= 4 ? 'low' : 'high';
}

/** Distance along a ray from (ox, oz) to the polygon boundary. */
function rayToEdge(poly: Vec2[], ox: number, oz: number, dx: number, dz: number): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i]!;
    const [bx, bz] = poly[(i + 1) % poly.length]!;
    const ex = bx - ax;
    const ez = bz - az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((ax - ox) * ez - (az - oz) * ex) / den;
    const u = ((ax - ox) * dz - (az - oz) * dx) / den;
    if (t > 1e-4 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}

/**
 * Framework-free 3D viewer for a Home Model: dollhouse (orbit) view, first-person walkthrough,
 * and path-traced HD photos. Used by the editor, the public tour page, and later kiosks and embeds.
 */
export class HouseViewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.05, 500);
  readonly quality: RenderQuality;
  private readonly orbit: OrbitControls;
  private readonly walk: WalkControls;
  private readonly mats: MaterialLibrary;
  private readonly composer: EffectComposer | null = null;
  private readonly gtao: GTAOPass | null = null;
  private readonly sun = new THREE.DirectionalLight('#fff4e5', 2.0);
  private readonly hemi = new THREE.HemisphereLight('#ffffff', '#d9cfc2', 0.45);
  private readonly studioBackground: THREE.Color;
  private readonly resizeObserver: ResizeObserver;
  private built: BuiltLevel | null = null;
  private model: HomeModel | null = null;
  private levelId: string | null = null;
  private mode: ViewMode = 'orbit';
  private dirty = true;
  private photoActive = false;
  private tracer: import('three-gpu-pathtracer').WebGLPathTracer | null = null;
  private denoiseMaterial: typeof import('three-gpu-pathtracer').DenoiseMaterial | null = null;
  private timer = new THREE.Timer();
  private roomTimer = 0;
  private currentRoom: string | null = null;
  private hasFramed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly opts: HouseViewerOptions,
  ) {
    this.quality = opts.quality ?? defaultQuality();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Neutral tone mapping keeps paint and floor colours true to the catalog swatches.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.appendChild(this.renderer.domElement);

    this.mats = new MaterialLibrary(opts.registry, this.renderer.capabilities.getMaxAnisotropy());
    this.studioBackground = new THREE.Color(opts.background ?? '#e9edf0');
    this.scene.background = this.studioBackground;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.4;
    pmrem.dispose();

    this.sun.castShadow = true;
    const shadowSize = this.quality === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(120, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#dfe3e0', roughness: 1 }),
    );
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    this.scene.add(ground);

    if (this.quality === 'high') {
      // Ambient occlusion: soft contact shadows in corners and under furniture.
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.gtao = new GTAOPass(this.scene, this.camera, 1, 1);
      this.gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 2, thickness: 1, scale: 1.1, samples: 16 });
      this.gtao.updatePdMaterial({ radius: 8, samples: 16 });
      this.gtao.blendIntensity = 0.85;
      this.composer.addPass(this.gtao);
      this.composer.addPass(new OutputPass());
    }

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.maxPolarAngle = Math.PI * 0.47;
    this.orbit.minDistance = 2;
    this.orbit.maxDistance = 80;
    this.orbit.addEventListener('change', () => (this.dirty = true));

    this.walk = new WalkControls(this.camera, this.renderer.domElement, container, () =>
      this.built ? this.built.group.children.filter((o) => o.userData.kind === 'floor') : [],
    );

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop((time) => this.tick(time));
  }

  /** Rebuilds the scene from a model. Keeps the camera where it is unless this is the first model. */
  setModel(model: HomeModel, levelId?: string): void {
    this.model = model;
    this.levelId = levelId ?? model.levels[0]?.id ?? null;
    this.rebuild();
  }

  get rooms(): RoomInfo[] {
    return this.built?.rooms ?? [];
  }

  get viewMode(): ViewMode {
    return this.mode;
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.orbit.enabled = mode === 'orbit';
    this.walk.setEnabled(mode === 'walk');
    if (this.built) this.built.ceilings.visible = mode === 'walk';
    this.camera.fov = mode === 'walk' ? 72 : 50;
    this.camera.updateProjectionMatrix();
    this.hemi.intensity = mode === 'walk' ? 0.6 : 0.45;
    this.scene.environmentIntensity = mode === 'walk' ? 0.5 : 0.4;
    // Inside, windows look out onto a sky; the dollhouse sits in a clean studio.
    this.scene.background = mode === 'walk' ? this.mats.sky() : this.studioBackground;
    if (mode === 'walk') {
      const target = this.orbit.target.clone();
      const room = this.rooms.find((r) => pointInPolygon([target.x, target.z], r.polygon)) ?? this.largestRoom();
      if (room) this.goToRoom(room.id);
      else this.walk.placeAt(target);
    } else {
      this.frameAll();
      this.setRoom(null);
    }
    this.dirty = true;
  }

  /**
   * Walk mode: stand where a property photographer would, a clear spot with the widest
   * view across the room, and look towards its centre.
   */
  goToRoom(roomId: string): void {
    const room = this.rooms.find((r) => r.id === roomId);
    if (!room) return;
    if (this.mode !== 'walk') this.setMode('walk');
    const poly = room.polygon;
    const centre = room.anchor;
    const obstacles = this.built?.obstacles ?? [];
    const xs = poly.map((p) => p[0]);
    const zs = poly.map((p) => p[1]);
    let stand = centre;
    let bestScore = -Infinity;
    const step = 0.3;
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
      for (let z = Math.min(...zs) + step / 2; z < Math.max(...zs); z += step) {
        if (!pointInPolygon([x, z], poly) || distanceToPolygonEdge([x, z], poly) < 0.45) continue;
        const toX = centre.x - x;
        const toZ = centre.z - z;
        const toLen = Math.hypot(toX, toZ);
        // The centre must be in sight (matters in L-shaped rooms).
        if (toLen > 0.3 && rayToEdge(poly, x, z, toX / toLen, toZ / toLen) < toLen - 0.05) continue;
        const heading = toLen > 0.3 ? Math.atan2(toZ, toX) : 0;
        let openness = 0;
        for (let k = -3; k <= 3; k++) {
          const a = heading + k * 0.2;
          openness += Math.min(rayToEdge(poly, x, z, Math.cos(a), Math.sin(a)), 9);
        }
        openness /= 7;
        const clearance = obstacles.reduce((m, o) => Math.min(m, Math.hypot(x - o.x, z - o.z) - o.r), Infinity);
        const score = openness + (clearance < 0.35 ? clearance * 4 - 2 : Math.min(clearance, 0.8));
        if (score > bestScore) {
          bestScore = score;
          stand = new THREE.Vector3(x, centre.y, z);
        }
      }
    }
    let lookAt = centre;
    if (stand.distanceTo(centre) < 0.5) {
      let far = 0;
      for (const [x, z] of poly) {
        const d = Math.hypot(x - stand.x, z - stand.z);
        if (d > far) {
          far = d;
          lookAt = new THREE.Vector3(x, 0, z);
        }
      }
    }
    this.walk.placeAt(stand, lookAt);
    this.dirty = true;
  }

  /** Fits the whole house in view for the current screen shape (portrait phones included). */
  frameAll(): void {
    if (!this.built) return;
    const box = this.built.bounds;
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const sphere = Math.max(Math.hypot(size.x, size.y, size.z) / 2, 3);
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const distance = (sphere / Math.sin(Math.min(vfov, hfov) / 2)) * 0.9;
    const dir = new THREE.Vector3(0.45, 1.05, 0.95).normalize();
    this.orbit.target.set(centre.x, 0, centre.z);
    this.camera.position.set(centre.x, 0, centre.z).addScaledVector(dir, distance);
    this.orbit.update();
    this.dirty = true;
  }

  /** JPEG snapshot of the current real-time view (thumbnails). */
  capture(type = 'image/jpeg', quality = 0.9): string {
    this.draw();
    return this.renderer.domElement.toDataURL(type, quality);
  }

  /**
   * Photoreal still of the current view, path-traced in the browser (real light bounces,
   * soft shadows, sky light through windows). Returns a JPEG data URL.
   */
  async renderPhoto(opts: PhotoOptions = {}): Promise<string> {
    return this.pathTrace(this.camera, this.mode === 'walk', opts);
  }

  /**
   * Photoreal 360° panorama ("Real View") from the clearest spot in a room, at camera height.
   * Returns the equirectangular JPEG plus where it was taken, so tours can link rooms together.
   */
  async renderPanorama(
    roomId: string,
    opts: PhotoOptions & { width?: number } = {},
  ): Promise<{ dataUrl: string; position: Vec2; height: number }> {
    const room = this.rooms.find((r) => r.id === roomId);
    if (!room) throw new Error(`Unknown room ${roomId}`);
    const { EquirectCamera } = await import('three-gpu-pathtracer');
    const spot = this.panoramaSpot(room);
    const eye = 1.5;
    const camera = new EquirectCamera();
    camera.position.set(spot[0], (this.walk.floorY ?? 0) + eye, spot[1]);
    camera.updateMatrixWorld();
    const width = opts.width ?? 2048;
    const dataUrl = await this.pathTrace(camera, true, opts, { width, height: width / 2 });
    return { dataUrl, position: [Math.round(spot[0] * 1000), Math.round(spot[1] * 1000)], height: eye * 1000 };
  }

  /** Most open point of a room: far from walls and furniture, near the middle. */
  private panoramaSpot(room: RoomInfo): Vec2 {
    const poly = room.polygon;
    const obstacles = this.built?.obstacles ?? [];
    const xs = poly.map((p) => p[0]);
    const zs = poly.map((p) => p[1]);
    let best: Vec2 = [room.anchor.x, room.anchor.z];
    let bestScore = -Infinity;
    const step = 0.2;
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
      for (let z = Math.min(...zs) + step / 2; z < Math.max(...zs); z += step) {
        if (!pointInPolygon([x, z], poly)) continue;
        const toWall = distanceToPolygonEdge([x, z], poly);
        const toFurniture = obstacles.reduce((m, o) => Math.min(m, Math.hypot(x - o.x, z - o.z) - o.r), Infinity);
        const score = Math.min(toWall, 1.5) + Math.min(toFurniture, 1.0) * 1.5 - 0.15 * Math.hypot(x - room.anchor.x, z - room.anchor.z);
        if (score > bestScore) {
          bestScore = score;
          best = [x, z];
        }
      }
    }
    return best;
  }

  private async pathTrace(camera: THREE.Camera, interior: boolean, opts: PhotoOptions, size?: { width: number; height: number }): Promise<string> {
    if (this.photoActive) throw new Error('A photo is already rendering');
    const { WebGLPathTracer, DenoiseMaterial } = await import('three-gpu-pathtracer');
    const target = opts.samples ?? 96;
    const saved = {
      environment: this.scene.environment,
      environmentIntensity: this.scene.environmentIntensity,
      background: this.scene.background,
      hemi: this.hemi.visible,
      ceilings: this.built?.ceilings.visible ?? false,
    };
    this.photoActive = true;
    this.walk.enabled = false;
    this.orbit.enabled = false;
    try {
      await this.built?.ready;
      // A real sky lights the scene; the fake ambient light is not needed.
      const sky = this.mats.sky();
      this.scene.environment = sky;
      this.scene.environmentIntensity = interior ? 1.1 : 0.9;
      if (interior) this.scene.background = sky;
      if (this.built) this.built.ceilings.visible = interior;
      this.hemi.visible = false;
      if (size) {
        this.renderer.setPixelRatio(1);
        this.renderer.setSize(size.width, size.height, false);
      }
      // One tracer per viewer: its large shader compiles once, then every photo and 360° reuses it.
      if (!this.tracer) {
        const t = new WebGLPathTracer(this.renderer);
        t.tiles.set(2, 2);
        t.bounces = 6;
        t.filterGlossyFactor = 0.5;
        t.minSamples = 1;
        t.renderDelay = 0;
        t.fadeDuration = 0;
        t.dynamicLowRes = false;
        this.tracer = t;
      }
      const tracer = this.tracer;
      // Synchronous BVH build: a home is small enough, and the async path needs a worker setup.
      tracer.setScene(this.scene, camera);
      tracer.reset();
      await nextFrame();
      while (tracer.samples < target) {
        if (opts.signal?.aborted) throw new DOMException('Photo cancelled', 'AbortError');
        tracer.renderSample();
        opts.onProgress?.(Math.min(1, tracer.samples / target));
        await nextFrame();
      }
      this.denoiseMaterial = DenoiseMaterial;
      if (opts.denoise !== false) this.drawDenoised(opts.denoise === true || !opts.denoise ? DEFAULT_DENOISE : opts.denoise);
      return this.renderer.domElement.toDataURL('image/jpeg', 0.92);
    } finally {
      this.scene.environment = saved.environment;
      this.scene.environmentIntensity = saved.environmentIntensity;
      this.scene.background = saved.background;
      this.hemi.visible = saved.hemi;
      if (this.built) this.built.ceilings.visible = saved.ceilings;
      this.walk.enabled = this.mode === 'walk';
      this.orbit.enabled = this.mode === 'orbit';
      this.photoActive = false;
      if (size) {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.resize();
      }
      this.dirty = true;
    }
  }

  /**
   * Cleans the accumulated path-traced image and draws it to the canvas:
   * 1. despeckle: pixels far from their 3×3 median (lone dark/bright samples) take the median;
   * 2. edge-preserving smart denoise for the remaining grain.
   */
  private drawDenoised(settings: DenoiseSettings): void {
    if (!this.tracer || !this.denoiseMaterial) return;
    const source = this.tracer.target;
    let map = source.texture;
    let clean: THREE.WebGLRenderTarget | null = null;
    const despeckle = settings.despeckle !== false ? new FullScreenQuad(despeckleMaterial(source.width, source.height, source.texture)) : null;
    if (despeckle) {
      clean = new THREE.WebGLRenderTarget(source.width, source.height, { type: THREE.HalfFloatType });
      this.renderer.setRenderTarget(clean);
      despeckle.render(this.renderer);
      map = clean.texture;
    }
    const { despeckle: _d, ...smart } = settings;
    const quad = new FullScreenQuad(new this.denoiseMaterial({ map, ...smart }));
    this.renderer.setRenderTarget(null);
    quad.render(this.renderer);
    quad.material.dispose();
    quad.dispose();
    if (despeckle) {
      (despeckle.material as THREE.Material).dispose();
      despeckle.dispose();
    }
    clean?.dispose();
  }

  /**
   * Re-applies the denoiser to the last HD photo with other settings (for tuning).
   * Only valid straight after renderPhoto, before the view changes.
   */
  redenoiseLastPhoto(settings: DenoiseSettings): string {
    this.drawDenoised(settings);
    return this.renderer.domElement.toDataURL('image/jpeg', 0.92);
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.orbit.dispose();
    this.walk.dispose();
    this.clearBuilt();
    this.mats.dispose();
    this.tracer?.dispose();
    this.composer?.dispose();
    this.gtao?.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private draw(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private largestRoom(): RoomInfo | undefined {
    let best: RoomInfo | undefined;
    let bestArea = 0;
    for (const r of this.rooms) {
      let a = 0;
      for (let i = 0; i < r.polygon.length; i++) {
        const p = r.polygon[i]!;
        const q = r.polygon[(i + 1) % r.polygon.length]!;
        a += p[0] * q[1] - q[0] * p[1];
      }
      if (Math.abs(a) > bestArea) {
        bestArea = Math.abs(a);
        best = r;
      }
    }
    return best;
  }

  private rebuild(): void {
    this.clearBuilt();
    const level = this.model?.levels.find((l) => l.id === this.levelId);
    if (!this.model || !level) return;
    this.built = buildLevel(level, this.opts.registry, this.mats, () => (this.dirty = true));
    this.built.ceilings.visible = this.mode === 'walk';
    this.scene.add(this.built.group);
    this.walk.colliders = this.built.colliders;
    this.walk.floorY = level.elevation / 1000;
    this.placeSun();
    if (!this.hasFramed && this.built.group.children.length > 1) {
      this.frameAll();
      this.hasFramed = true;
    }
    this.dirty = true;
  }

  private placeSun(): void {
    if (!this.built) return;
    const box = this.built.bounds;
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z, 6) * 0.8;
    // Afternoon sun from the north-west of plan "up" (tropical sun is high).
    this.sun.position.set(centre.x - r * 0.6, r * 1.6, centre.z - r * 0.8);
    this.sun.target.position.copy(centre);
    const cam = this.sun.shadow.camera;
    cam.left = -r * 1.3;
    cam.right = r * 1.3;
    cam.top = r * 1.3;
    cam.bottom = -r * 1.3;
    cam.near = 0.5;
    cam.far = r * 5;
    cam.updateProjectionMatrix();
  }

  private clearBuilt(): void {
    if (!this.built) return;
    this.scene.remove(this.built.group);
    this.built.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !mesh.geometry.userData.shared) mesh.geometry.dispose();
    });
    this.built = null;
  }

  private resize(): void {
    if (this.photoActive) return;
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private setRoom(id: string | null): void {
    if (id === this.currentRoom) return;
    this.currentRoom = id;
    this.opts.onRoomChange?.(id);
  }

  private tick(time: number): void {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    if (this.photoActive) return;
    if (this.mode === 'orbit') {
      if (this.orbit.update()) this.dirty = true;
    } else if (this.walk.update(dt)) {
      this.dirty = true;
    }
    if (this.mode === 'walk') {
      this.roomTimer += dt;
      if (this.roomTimer > 0.3) {
        this.roomTimer = 0;
        const p = this.camera.position;
        const room = this.rooms.find((r) => pointInPolygon([p.x, p.z], r.polygon));
        this.setRoom(room?.id ?? null);
      }
    }
    if (this.dirty) {
      this.dirty = false;
      this.draw();
    }
  }
}
