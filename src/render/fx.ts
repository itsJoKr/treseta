// Particles (pooled), camera shake and lamp flash (§10.6).
import * as THREE from 'three';
import gsap from 'gsap';
import { dotTexture } from './placeholders';
import type { SceneManager } from './scene';

interface PointBurst {
  points: THREE.Points;
  mat: THREE.PointsMaterial;
  pos: Float32Array;
  vel: Float32Array;
  n: number;
  life: number;
  age: number;
  gravity: number;
  baseOpacity: number;
  active: boolean;
  drag: number;
}

interface ConfettiBurst {
  mesh: THREE.InstancedMesh;
  pos: THREE.Vector3[];
  vel: THREE.Vector3[];
  rot: THREE.Euler[];
  spin: THREE.Vector3[];
  age: number;
  life: number;
  active: boolean;
}

const PALETTE = ['#B5452B', '#D9A441', '#6B7A3A', '#2F5D7C', '#F3E6C8'];

export class FX {
  private dot: THREE.Texture;
  private bursts: PointBurst[] = [];
  private confetti: ConfettiBurst[] = [];
  private tmp = new THREE.Object3D();
  private shakeTween: gsap.core.Tween | null = null;

  constructor(private sm: SceneManager) {
    this.dot = new THREE.CanvasTexture(dotTexture());
    for (let i = 0; i < 10; i++) this.bursts.push(this.makeBurst(32));
    for (let i = 0; i < 3; i++) this.confetti.push(this.makeConfetti(40));
    sm.onUpdate((dt) => this.update(dt));
  }

  private makeBurst(max: number): PointBurst {
    const pos = new Float32Array(max * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ map: this.dot, size: 0.12, transparent: true, depthWrite: false, opacity: 0, sizeAttenuation: true, toneMapped: false });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    this.sm.scene.add(points);
    return { points, mat, pos, vel: new Float32Array(max * 3), n: 0, life: 1, age: 0, gravity: 0, baseOpacity: 1, active: false, drag: 0 };
  }

  private makeConfetti(n: number): ConfettiBurst {
    const geo = new THREE.PlaneGeometry(0.09, 0.055);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    for (let i = 0; i < n; i++) mesh.setColorAt(i, new THREE.Color(PALETTE[i % PALETTE.length]));
    mesh.visible = false;
    mesh.frustumCulled = false;
    this.sm.scene.add(mesh);
    const mk = <T>(f: () => T) => Array.from({ length: n }, f);
    return { mesh, pos: mk(() => new THREE.Vector3()), vel: mk(() => new THREE.Vector3()), rot: mk(() => new THREE.Euler()), spin: mk(() => new THREE.Vector3()), age: 0, life: 1.5, active: false };
  }

  private freeBurst(): PointBurst {
    return this.bursts.find((b) => !b.active) ?? this.bursts[0];
  }

  /** Dust puff on card land: 8 particles, #CDBB9A, alpha 0.4, radius 0.5, 400 ms. */
  dust(at: THREE.Vector3): void {
    const b = this.freeBurst();
    b.n = 8;
    for (let i = 0; i < b.n; i++) {
      const a = (i / b.n) * Math.PI * 2 + Math.random() * 0.4;
      b.pos.set([at.x + Math.cos(a) * 0.15, at.y + 0.02, at.z + Math.sin(a) * 0.15], i * 3);
      const sp = 0.9 + Math.random() * 0.5;
      b.vel.set([Math.cos(a) * sp, 0.25 + Math.random() * 0.3, Math.sin(a) * sp], i * 3);
    }
    this.start(b, { color: '#CDBB9A', opacity: 0.4, size: 0.28, life: 0.4, gravity: -0.6, additive: false, drag: 3.5 });
  }

  /** Sparks for strong plays: 24 particles, #FFD27A additive, 2–4 u/s, gravity −6, 600 ms. */
  sparks(at: THREE.Vector3, color = '#FFD27A', n = 24): void {
    const b = this.freeBurst();
    b.n = Math.min(32, n);
    for (let i = 0; i < b.n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 0.6 + Math.random() * 0.8;
      const sp = 2 + Math.random() * 2;
      b.pos.set([at.x, at.y + 0.05, at.z], i * 3);
      b.vel.set([Math.cos(a) * sp * 0.6, up * sp, Math.sin(a) * sp * 0.6], i * 3);
    }
    this.start(b, { color, opacity: 1, size: 0.11, life: 0.6, gravity: -6, additive: true, drag: 0.4 });
  }

  private start(b: PointBurst, o: { color: string; opacity: number; size: number; life: number; gravity: number; additive: boolean; drag: number }): void {
    b.mat.color.set(o.color);
    b.mat.size = o.size;
    b.mat.blending = o.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    b.mat.needsUpdate = true;
    b.baseOpacity = o.opacity;
    b.mat.opacity = o.opacity;
    b.life = o.life;
    b.age = 0;
    b.gravity = o.gravity;
    b.drag = o.drag;
    b.active = true;
    b.points.visible = true;
    b.points.geometry.setDrawRange(0, b.n);
    (b.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Confetti: 40 palette quads tumbling, 1500 ms. */
  confettiBurst(at: THREE.Vector3): void {
    const c = this.confetti.find((x) => !x.active) ?? this.confetti[0];
    const n = c.pos.length;
    for (let i = 0; i < n; i++) {
      c.pos[i].set(at.x + (Math.random() - 0.5) * 0.6, at.y + (Math.random() - 0.5) * 0.3, at.z + (Math.random() - 0.5) * 0.4);
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 2.5;
      c.vel[i].set(Math.cos(a) * sp, 2.5 + Math.random() * 3, Math.sin(a) * sp * 0.6);
      c.rot[i].set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      c.spin[i].set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
    }
    c.age = 0;
    c.active = true;
    c.mesh.visible = true;
  }

  private update(dtRaw: number): void {
    const dt = dtRaw * gsap.globalTimeline.timeScale();
    for (const b of this.bursts) {
      if (!b.active) continue;
      b.age += dt;
      const t = b.age / b.life;
      if (t >= 1) { b.active = false; b.points.visible = false; continue; }
      for (let i = 0; i < b.n; i++) {
        const k = i * 3;
        b.vel[k + 1] += b.gravity * dt;
        const damp = Math.max(0, 1 - b.drag * dt);
        b.vel[k] *= damp; b.vel[k + 2] *= damp;
        b.pos[k] += b.vel[k] * dt;
        b.pos[k + 1] = Math.max(0.01, b.pos[k + 1] + b.vel[k + 1] * dt);
        b.pos[k + 2] += b.vel[k + 2] * dt;
      }
      (b.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      b.mat.opacity = b.baseOpacity * (1 - t * t);
    }
    for (const c of this.confetti) {
      if (!c.active) continue;
      c.age += dt;
      if (c.age >= c.life) { c.active = false; c.mesh.visible = false; continue; }
      const n = c.pos.length;
      for (let i = 0; i < n; i++) {
        c.vel[i].y -= 6 * dt;
        c.vel[i].multiplyScalar(Math.max(0, 1 - 1.6 * dt));
        c.pos[i].addScaledVector(c.vel[i], dt);
        if (c.pos[i].y < 0.02) { c.pos[i].y = 0.02; c.vel[i].set(0, 0, 0); }
        c.rot[i].x += c.spin[i].x * dt; c.rot[i].y += c.spin[i].y * dt; c.rot[i].z += c.spin[i].z * dt;
        const fade = Math.min(1, (c.life - c.age) / 0.35);
        this.tmp.position.copy(c.pos[i]);
        this.tmp.rotation.copy(c.rot[i]);
        this.tmp.scale.setScalar(fade);
        this.tmp.updateMatrix();
        c.mesh.setMatrixAt(i, this.tmp.matrix);
      }
      c.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Camera shake: random offset of amplitude A decaying (power2.out); restored exactly. */
  shake(amplitude = 0.06, durationMs = 250): void {
    this.shakeTween?.kill();
    const s = { a: amplitude };
    const off = this.sm.shakeOffset;
    this.shakeTween = gsap.to(s, {
      a: 0, duration: durationMs / 1000, ease: 'power2.out',
      onUpdate: () => off.set((Math.random() * 2 - 1) * s.a, (Math.random() * 2 - 1) * s.a, (Math.random() * 2 - 1) * s.a),
      onComplete: () => { off.set(0, 0, 0); },
      onInterrupt: () => { off.set(0, 0, 0); },
    });
  }

  /** Lamp flash: intensity +2 and back over 300 ms. */
  flash(): void {
    const b = this.sm.lampBoost;
    gsap.killTweensOf(b);
    b.v = 2;
    gsap.to(b, { v: 0, duration: 0.3, ease: 'power2.out' });
  }
}
