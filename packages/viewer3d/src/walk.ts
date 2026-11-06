import * as THREE from 'three';
import type { Vec2 } from '@homeset/core';

export const EYE_HEIGHT = 1.6;
const RADIUS = 0.25;
const SPEED = 1.6; // m/s, a relaxed walking pace

/**
 * First-person walkthrough controls.
 * Desktop: drag to look, WASD/arrows to move, double-click the floor to walk there.
 * Touch: drag to look, on-screen joystick to move, double-tap the floor to walk there.
 */
export class WalkControls {
  enabled = false;
  yaw = 0;
  pitch = 0;
  readonly position = new THREE.Vector3();
  colliders: Vec2[][] = [];
  floorY = 0;

  private keys = new Set<string>();
  private stick = new THREE.Vector2();
  private dragging: { id: number; x: number; y: number } | null = null;
  private target: THREE.Vector3 | null = null;
  private joystick: HTMLDivElement;
  private knob: HTMLDivElement;
  private raycaster = new THREE.Raycaster();
  private lastTap = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly dom: HTMLElement,
    private readonly container: HTMLElement,
    private readonly pickFloor: () => THREE.Object3D[],
  ) {
    this.joystick = document.createElement('div');
    this.knob = document.createElement('div');
    Object.assign(this.joystick.style, {
      position: 'absolute', left: '24px', bottom: '24px', width: '112px', height: '112px', borderRadius: '50%',
      background: 'rgba(255,255,255,0.18)', border: '2px solid rgba(255,255,255,0.55)', backdropFilter: 'blur(4px)',
      touchAction: 'none', display: 'none', zIndex: '5',
    } satisfies Partial<CSSStyleDeclaration>);
    Object.assign(this.knob.style, {
      position: 'absolute', left: '36px', top: '36px', width: '40px', height: '40px', borderRadius: '50%',
      background: 'rgba(255,255,255,0.85)', boxShadow: '0 2px 8px rgba(0,0,0,0.25)', pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    this.joystick.appendChild(this.knob);
    container.appendChild(this.joystick);

    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    dom.addEventListener('dblclick', this.onDoubleClick);
    this.joystick.addEventListener('pointerdown', this.onStick);
    this.joystick.addEventListener('pointermove', this.onStick);
    this.joystick.addEventListener('pointerup', this.onStickEnd);
    this.joystick.addEventListener('pointercancel', this.onStickEnd);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    const touch = window.matchMedia('(pointer: coarse)').matches;
    this.joystick.style.display = on && touch ? 'block' : 'none';
    this.keys.clear();
    this.stick.set(0, 0);
    this.target = null;
  }

  /** Stand at a point (world XZ) looking towards `lookAt`. */
  placeAt(p: THREE.Vector3, lookAt?: THREE.Vector3): void {
    this.position.set(p.x, this.floorY + EYE_HEIGHT, p.z);
    if (lookAt) {
      const dx = lookAt.x - p.x;
      const dz = lookAt.z - p.z;
      if (Math.hypot(dx, dz) > 0.01) this.yaw = Math.atan2(-dx, -dz);
    }
    this.pitch = -0.05;
    this.target = null;
    this.apply();
  }

  /** Advances one frame. Returns true if the camera moved. */
  update(dt: number): boolean {
    if (!this.enabled) return false;
    const move = new THREE.Vector2(0, 0);
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) move.y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) move.y -= 1;
    if (this.keys.has('KeyA')) move.x -= 1;
    if (this.keys.has('KeyD')) move.x += 1;
    if (this.keys.has('ArrowLeft')) this.yaw += 1.6 * dt;
    if (this.keys.has('ArrowRight')) this.yaw -= 1.6 * dt;
    move.add(this.stick);
    const turning = this.keys.has('ArrowLeft') || this.keys.has('ArrowRight');
    const fast = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 2 : 1;

    const before = this.position.clone();
    if (move.lengthSq() > 0) {
      this.target = null;
      if (move.length() > 1) move.normalize();
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      this.position.addScaledVector(fwd, move.y * SPEED * fast * dt).addScaledVector(right, move.x * SPEED * fast * dt);
    } else if (this.target) {
      const to = new THREE.Vector3(this.target.x - this.position.x, 0, this.target.z - this.position.z);
      const d = to.length();
      if (d < 0.05) this.target = null;
      else {
        const step = Math.min(d, SPEED * 1.5 * dt);
        this.position.addScaledVector(to.normalize(), step);
        const wantYaw = Math.atan2(-to.x, -to.z);
        let dy = wantYaw - this.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.yaw += dy * Math.min(1, dt * 4);
      }
    }
    this.collide();
    this.apply();
    return turning || this.position.distanceToSquared(before) > 1e-10;
  }

  private apply(): void {
    this.position.y = this.floorY + EYE_HEIGHT;
    this.camera.position.copy(this.position);
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  /** Pushes the viewer out of walls (circle vs. wall outlines in plan). */
  private collide(): void {
    for (let iter = 0; iter < 3; iter++) {
      let pushed = false;
      for (const poly of this.colliders) {
        const p: Vec2 = [this.position.x, this.position.z];
        let best = Infinity;
        let bx = 0;
        let bz = 0;
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i]!;
          const b = poly[(i + 1) % poly.length]!;
          const abx = b[0] - a[0];
          const abz = b[1] - a[1];
          const l2 = abx * abx + abz * abz || 1;
          const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / l2));
          const cx = a[0] + abx * t;
          const cz = a[1] + abz * t;
          const d = Math.hypot(p[0] - cx, p[1] - cz);
          if (d < best) {
            best = d;
            bx = cx;
            bz = cz;
          }
        }
        const inside = insidePoly(p, poly);
        if (!inside && best >= RADIUS) continue;
        let nx = p[0] - bx;
        let nz = p[1] - bz;
        const nl = Math.hypot(nx, nz) || 1;
        nx /= nl;
        nz /= nl;
        const push = inside ? best + RADIUS : RADIUS - best;
        const sign = inside ? -1 : 1;
        this.position.x += nx * push * sign;
        this.position.z += nz * push * sign;
        pushed = true;
      }
      if (!pushed) break;
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    this.dragging = { id: e.pointerId, x: e.clientX, y: e.clientY };
    if (e.pointerType === 'touch') {
      const now = performance.now();
      if (now - this.lastTap < 300) this.walkTo(e.clientX, e.clientY);
      this.lastTap = now;
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.enabled || !this.dragging || this.dragging.id !== e.pointerId) return;
    const dx = e.clientX - this.dragging.x;
    const dy = e.clientY - this.dragging.y;
    this.dragging.x = e.clientX;
    this.dragging.y = e.clientY;
    const k = e.pointerType === 'touch' ? 0.006 : 0.004;
    this.yaw += dx * k;
    this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + dy * k));
    this.apply();
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.dragging?.id === e.pointerId) this.dragging = null;
  };

  private onDoubleClick = (e: MouseEvent) => {
    if (this.enabled) this.walkTo(e.clientX, e.clientY);
  };

  private walkTo(clientX: number, clientY: number) {
    const rect = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickFloor(), false)[0];
    if (hit) this.target = hit.point.clone();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow')) e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => this.keys.clear();

  private onStick = (e: PointerEvent) => {
    if (e.type === 'pointerdown') this.joystick.setPointerCapture(e.pointerId);
    if (!this.joystick.hasPointerCapture(e.pointerId)) return;
    e.stopPropagation();
    const r = this.joystick.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const v = new THREE.Vector2(x, -y);
    if (v.length() > 1) v.normalize();
    this.stick.copy(v);
    this.knob.style.transform = `translate(${v.x * 36}px, ${-v.y * 36}px)`;
  };

  private onStickEnd = () => {
    this.stick.set(0, 0);
    this.knob.style.transform = '';
  };

  dispose(): void {
    this.dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.dom.removeEventListener('dblclick', this.onDoubleClick);
    this.joystick.remove();
  }
}

function insidePoly(pt: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
