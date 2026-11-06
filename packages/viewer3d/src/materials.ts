import * as THREE from 'three';
import type { MaterialDef, Registry } from '@rumah3d/core';

/** Deterministic pseudo-random numbers so textures look the same on every load. */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10_000) / 10_000;
  };
}

function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amount)));
  return `#${c.getHexString()}`;
}

interface PatternTexture {
  canvas: HTMLCanvasElement;
  /** Real-world size of one texture repeat, in mm. */
  periodW: number;
  periodH: number;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return [canvas, canvas.getContext('2d')!];
}

function planks(def: MaterialDef): PatternTexture {
  const plankW = def.tileSize ?? 190;
  const plankL = def.tileLength ?? 1200;
  const cols = 4;
  const [canvas, ctx] = makeCanvas(512, 1024);
  const rand = seeded(def.id.length * 97 + plankW);
  const colW = canvas.width / cols;
  const pxPerMm = canvas.height / (plankL * 2);
  for (let c = 0; c < cols; c++) {
    const stagger = (c * 0.37 * plankL) % plankL;
    for (let k = -1; k < 3; k++) {
      const y0 = (k * plankL + stagger) * pxPerMm;
      ctx.fillStyle = shade(def.color, (rand() - 0.5) * 0.08);
      ctx.fillRect(c * colW, y0, colW, plankL * pxPerMm);
      // Grain
      ctx.globalAlpha = 0.12;
      for (let g = 0; g < 14; g++) {
        ctx.strokeStyle = shade(def.color, -0.15 + rand() * 0.1);
        ctx.lineWidth = 0.5 + rand() * 1.5;
        const x = c * colW + rand() * colW;
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.bezierCurveTo(x + rand() * 6 - 3, y0 + 200, x + rand() * 6 - 3, y0 + 400, x + rand() * 4 - 2, y0 + plankL * pxPerMm);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = shade(def.color, -0.22);
      ctx.fillRect(c * colW, y0, colW, 2);
    }
    ctx.fillStyle = shade(def.color, -0.2);
    ctx.fillRect(c * colW, 0, 2, canvas.height);
  }
  return { canvas, periodW: plankW * cols, periodH: plankL * 2 };
}

function tiles(def: MaterialDef, veins: boolean): PatternTexture {
  const size = def.tileSize ?? 600;
  const n = 2;
  const [canvas, ctx] = makeCanvas(1024, 1024);
  const rand = seeded(size + def.color.length * 31);
  const cell = canvas.width / n;
  const grout = Math.max(2, (canvas.width / (size * n)) * 3);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      ctx.fillStyle = shade(def.color, (rand() - 0.5) * (veins ? 0.02 : 0.04));
      ctx.fillRect(i * cell, j * cell, cell, cell);
    }
  }
  if (veins) {
    const vein = def.accentColor ?? shade(def.color, -0.25);
    for (let v = 0; v < 9; v++) {
      ctx.strokeStyle = vein;
      ctx.globalAlpha = 0.15 + rand() * 0.35;
      ctx.lineWidth = 0.6 + rand() * 2.2;
      ctx.beginPath();
      let x = rand() * canvas.width;
      let y = 0;
      ctx.moveTo(x, y);
      while (y < canvas.height) {
        const nx = x + (rand() - 0.4) * 120;
        const ny = y + 40 + rand() * 90;
        ctx.quadraticCurveTo(x + (rand() - 0.5) * 80, (y + ny) / 2, nx, ny);
        x = nx;
        y = ny;
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = def.accentColor ?? shade(def.color, -0.12);
  for (let i = 0; i < n; i++) {
    ctx.fillRect(i * cell, 0, grout, canvas.height);
    ctx.fillRect(0, i * cell, canvas.width, grout);
  }
  return { canvas, periodW: size * n, periodH: size * n };
}

function concrete(def: MaterialDef): PatternTexture {
  const [canvas, ctx] = makeCanvas(512, 512);
  const rand = seeded(7);
  ctx.fillStyle = def.color;
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = shade(def.color, (rand() - 0.5) * 0.12);
    ctx.globalAlpha = 0.25;
    const r = 2 + rand() * 18;
    ctx.beginPath();
    ctx.arc(rand() * 512, rand() * 512, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return { canvas, periodW: 2000, periodH: 2000 };
}

/**
 * Builds and caches three.js materials for catalog MaterialDefs.
 * Geometry UVs are in metres, so texture repeat = 1000 / period(mm).
 */
export class MaterialLibrary {
  private cache = new Map<string, THREE.Material>();
  private textures: THREE.Texture[] = [];

  constructor(
    private readonly registry: Registry,
    readonly anisotropy = 4,
  ) {}

  get(id: string | undefined, fallbackColor = '#f3f1ec'): THREE.Material {
    const key = id ?? `color:${fallbackColor}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const def = this.registry.material(id);
    const mat = def ? this.fromDef(def) : new THREE.MeshStandardMaterial({ color: fallbackColor, roughness: 0.9 });
    this.cache.set(key, mat);
    return mat;
  }

  color(hex: string, roughness = 0.7, metalness = 0): THREE.MeshStandardMaterial {
    const key = `c:${hex}:${roughness}:${metalness}`;
    let mat = this.cache.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color: hex, roughness, metalness });
      this.cache.set(key, mat);
    }
    return mat;
  }

  /** Upholstery: soft sheen at grazing angles, like real fabric. */
  fabric(hex: string): THREE.Material {
    return this.custom(`fabric:${hex}`, () => {
      const c = new THREE.Color(hex);
      return new THREE.MeshPhysicalMaterial({
        color: c,
        roughness: 0.92,
        sheen: 0.7,
        sheenRoughness: 0.75,
        sheenColor: c.clone().offsetHSL(0, -0.05, 0.15),
      });
    });
  }

  /** Furniture timber with visible grain. */
  wood(hex: string): THREE.Material {
    return this.custom(`wood:${hex}`, () => {
      const [canvas, ctx] = makeCanvas(256, 512);
      const rand = seeded(hex.length * 131 + parseInt(hex.slice(1, 4), 16));
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, 256, 512);
      for (let i = 0; i < 70; i++) {
        ctx.strokeStyle = shade(hex, (rand() - 0.6) * 0.18);
        ctx.globalAlpha = 0.25 + rand() * 0.3;
        ctx.lineWidth = 0.6 + rand() * 2;
        const x = rand() * 256;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + (rand() - 0.5) * 30, 170, x + (rand() - 0.5) * 30, 340, x + (rand() - 0.5) * 12, 512);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.anisotropy;
      this.textures.push(tex);
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
    });
  }

  /** Warm glowing downlight lens. */
  glow(hex = '#fff1d6', intensity = 4): THREE.Material {
    return this.custom(`glow:${hex}:${intensity}`, () => new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: hex, emissiveIntensity: intensity }));
  }

  /**
   * Equirectangular daytime sky, seen through windows and used to light HD photos.
   * Stored as linear half-float pixels: the path tracer needs raw data, not a canvas.
   */
  sky(): THREE.Texture {
    if (!this.skyTexture) {
      const W = 512;
      const H = 256;
      const [, ctx] = makeCanvas(W, H);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#5d93c9');
      g.addColorStop(0.38, '#a9cbe8');
      g.addColorStop(0.49, '#e9f1f6');
      g.addColorStop(0.5, '#cfd3cc');
      g.addColorStop(0.62, '#9aa58f');
      g.addColorStop(1, '#6f7a66');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // Soft clouds
      const rand = seeded(42);
      for (let i = 0; i < 40; i++) {
        const x = rand() * W;
        const y = H * (0.18 + rand() * 0.22);
        const r = 9 + rand() * 25;
        const cg = ctx.createRadialGradient(x, y, 0, x, y, r);
        cg.addColorStop(0, 'rgba(255,255,255,0.55)');
        cg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = cg;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const px = ctx.getImageData(0, 0, W, H).data;
      const data = new Uint16Array(W * H * 4);
      const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          // DataTexture rows start at the bottom; canvas rows start at the top.
          const src = ((H - 1 - y) * W + x) * 4;
          const dst = (y * W + x) * 4;
          for (let c = 0; c < 3; c++) data[dst + c] = THREE.DataUtils.toHalfFloat(toLinear(px[src + c]! / 255));
          data[dst + 3] = THREE.DataUtils.toHalfFloat(1);
        }
      }
      const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.LinearSRGBColorSpace;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      this.skyTexture = tex;
      this.textures.push(tex);
    }
    return this.skyTexture;
  }

  private skyTexture: THREE.Texture | null = null;

  /** Any other shared material, created once per key. */
  custom(key: string, create: () => THREE.Material): THREE.Material {
    let mat = this.cache.get(`x:${key}`);
    if (!mat) {
      mat = create();
      this.cache.set(`x:${key}`, mat);
    }
    return mat;
  }

  /** Ceilings only exist in walk mode (hidden in the dollhouse). Double-sided so the path tracer sees them too. */
  ceiling(): THREE.Material {
    const key = 'ceiling';
    let mat = this.cache.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color: '#fbfaf8', roughness: 0.95, side: THREE.DoubleSide });
      this.cache.set(key, mat);
    }
    return mat;
  }

  glass(): THREE.Material {
    const key = 'glass';
    let mat = this.cache.get(key);
    if (!mat) {
      mat = new THREE.MeshPhysicalMaterial({
        color: '#dfeef3',
        roughness: 0.05,
        metalness: 0,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.cache.set(key, mat);
    }
    return mat;
  }

  private fromDef(def: MaterialDef): THREE.Material {
    const pattern =
      def.pattern === 'planks'
        ? planks(def)
        : def.pattern === 'tiles'
          ? tiles(def, false)
          : def.pattern === 'marble'
            ? tiles(def, true)
            : def.pattern === 'concrete'
              ? concrete(def)
              : null;
    if (!pattern) return new THREE.MeshStandardMaterial({ color: def.color, roughness: def.roughness });
    const tex = new THREE.CanvasTexture(pattern.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1000 / pattern.periodW, 1000 / pattern.periodH);
    tex.anisotropy = this.anisotropy;
    this.textures.push(tex);
    // The pattern doubles as a bump map: grout lines and plank seams sit slightly lower.
    const relief = def.pattern === 'concrete' ? 0 : 1.2;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: def.roughness, bumpMap: relief ? tex : null, bumpScale: relief });
  }

  dispose(): void {
    this.cache.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.cache.clear();
    this.textures = [];
    this.skyTexture = null;
  }
}
