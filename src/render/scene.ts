// Renderer, camera, lights, table, resize (§10.1–§10.3).
import * as THREE from 'three';
import gsap from 'gsap';
import { assets } from '../assets/loader';
import { tablePlaceholder } from './placeholders';

export const CAM_POS = new THREE.Vector3(0, 10.5, 8.6);
export const CAM_TARGET = new THREE.Vector3(0, 0, 0.9);

export class SceneManager {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  /** Base camera position after the aspect adjustment (shake offsets from this). */
  camBase = CAM_POS.clone();
  shakeOffset = new THREE.Vector3();
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  lamp: THREE.PointLight;
  lampBoost = { v: 0 };
  table!: THREE.Mesh;
  private updaters: ((dt: number, t: number) => void)[] = [];
  private last = performance.now();
  private startT = performance.now();
  frames = 0;
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;
  maxAniso = 4;

  constructor(public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.maxAniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    this.camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 100);
    this.camera.position.copy(CAM_POS);
    this.camera.lookAt(CAM_TARGET);
    this.scene.add(this.camera);

    this.hemi = new THREE.HemisphereLight(0xffe6c4, 0x3a2618, 0.6);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffd9a0, 1.6);
    this.key.position.set(2.5, 12, 5);
    this.key.target.position.set(0, 0, 0.5);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    const sc = this.key.shadow.camera;
    sc.left = -10; sc.right = 10; sc.top = 10; sc.bottom = -10; sc.near = 1; sc.far = 30;
    this.key.shadow.bias = -0.0005;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = 4;
    this.scene.add(this.key);
    this.scene.add(this.key.target);
    this.lamp = new THREE.PointLight(0xffb86b, 1.0, 20, 1.2);
    this.lamp.position.set(0, 6, 0);
    this.scene.add(this.lamp);

    this.buildTable();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    gsap.ticker.add(() => this.frame());
  }

  private buildTable(): void {
    const img = assets.imageSync('env', 'table');
    const src: HTMLImageElement | HTMLCanvasElement = img ?? tablePlaceholder();
    const top = src instanceof HTMLCanvasElement ? new THREE.CanvasTexture(src) : new THREE.Texture(src);
    top.colorSpace = THREE.SRGBColorSpace;
    top.anisotropy = this.maxAniso;
    top.needsUpdate = true;
    const side = top.clone();
    side.needsUpdate = true;
    // slight tint keeps the (already warm, light-pooled) wood from oversaturating under the warm lights
    const topMat = new THREE.MeshStandardMaterial({ map: top, color: img ? 0xb4b8c4 : 0xffffff, roughness: 0.85, metalness: 0 });
    const sideMat = new THREE.MeshStandardMaterial({ map: side, color: 0x6b4a2e, roughness: 0.9, metalness: 0 });
    const geo = new THREE.BoxGeometry(18, 0.6, 11);
    this.table = new THREE.Mesh(geo, [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
    this.table.position.set(0, -0.3, 0);
    this.table.receiveShadow = true;
    this.scene.add(this.table);
    // soft contact shadow under the table edge (cheap): a dark plane slightly below
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const aspect = w / h;
    this.camera.aspect = aspect;
    const dir = CAM_TARGET.clone().sub(CAM_POS).normalize();
    const back = aspect < 1.6 ? (1.6 - aspect) * 4 : 0;
    this.camBase.copy(CAM_POS).addScaledVector(dir, -back);
    this.camera.position.copy(this.camBase).add(this.shakeOffset);
    this.camera.updateProjectionMatrix();
    const scale = Math.max(0.6, Math.min(w / 1920, h / 1080));
    document.documentElement.style.setProperty('--ui-scale', String(scale));
    for (const f of this.resizeListeners) f();
  }

  resizeListeners: (() => void)[] = [];

  onUpdate(fn: (dt: number, t: number) => void): void { this.updaters.push(fn); }
  offUpdate(fn: (dt: number, t: number) => void): void { this.updaters = this.updaters.filter((f) => f !== fn); }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const t = (now - this.startT) / 1000;
    this.lamp.intensity = 1.0 + 0.06 * Math.sin(t * 7.3) * Math.sin(t * 3.1) + this.lampBoost.v;
    this.camera.position.copy(this.camBase).add(this.shakeOffset);
    for (const u of this.updaters) u(dt, t);
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 1) { this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; }
  }

  /** Project a world position to CSS pixels. */
  toScreen(v: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight, visible: p.z < 1 };
  }

  info(): { calls: number; triangles: number; textures: number; fps: number } {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, textures: i.memory.textures, fps: Math.round(this.fps) };
  }
}
