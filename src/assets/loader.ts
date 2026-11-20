// Loads manifest.json, images and audio buffers. Missing files resolve to null.
import { FLAGS } from '../env';
import { buildDefaultManifest } from './defaultManifest';
import type { AssetManifest } from './defaultManifest';

const BASE = import.meta.env.BASE_URL;

export type ImageKey = string; // e.g. "cards/kupe_3", "ui/coin", "portraits/jure"

export class Assets {
  manifest: AssetManifest = buildDefaultManifest();
  /** Files known to exist (relative to assets/), or null if unknown. */
  private index: Set<string> | null = null;
  /** Content hash per file from asset-index.json: appended as ?v= so a changed file gets a new URL. */
  private versions: Record<string, string> = {};
  private images = new Map<string, HTMLImageElement | null>();
  private loading = new Map<string, Promise<HTMLImageElement | null>>();
  version = 0; // bumps when new images arrive

  url(rel: string): string {
    const v = this.versions[rel];
    return `${BASE}${this.manifest.basePath}${rel}${v ? `?v=${v}` : ''}`;
  }

  exists(rel: string): boolean {
    if (!this.index) return true;
    return this.index.has(rel);
  }

  async init(): Promise<void> {
    if (FLAGS.noassets) {
      this.index = new Set();
      return;
    }
    try {
      const r = await fetch(`${BASE}asset-index.json`, { cache: 'no-store' });
      if (r.ok) {
        const j = (await r.json()) as { files: string[]; v?: Record<string, string> };
        this.index = new Set(j.files);
        this.versions = j.v ?? {};
      }
    } catch {
      this.index = null;
    }
    if (this.exists('manifest.json')) {
      try {
        const r = await fetch(this.url('manifest.json'), { cache: 'no-store' });
        if (r.ok) {
          const m = (await r.json()) as AssetManifest;
          if (m && m.version === 1 && m.images && m.audio) this.manifest = m;
        }
      } catch {
        /* fall back to the built-in manifest */
      }
    }
  }

  /** Resolve a manifest path group/id to the relative path. */
  path(group: keyof AssetManifest['images'], id: string): string | undefined {
    const g = this.manifest.images[group] as Record<string, string>;
    return g ? g[id] : undefined;
  }

  imageRel(rel: string | undefined): Promise<HTMLImageElement | null> {
    if (!rel) return Promise.resolve(null);
    if (this.images.has(rel)) return Promise.resolve(this.images.get(rel)!);
    const pending = this.loading.get(rel);
    if (pending) return pending;
    if (!this.exists(rel)) {
      this.images.set(rel, null);
      return Promise.resolve(null);
    }
    const p = new Promise<HTMLImageElement | null>((res) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => { this.images.set(rel, img); this.version++; res(img); };
      img.onerror = () => { this.images.set(rel, null); res(null); };
      img.src = this.url(rel);
    });
    this.loading.set(rel, p);
    return p;
  }

  image(group: keyof AssetManifest['images'], id: string): Promise<HTMLImageElement | null> {
    return this.imageRel(this.path(group, id));
  }

  /** Synchronous lookup of an already-loaded image. */
  imageSync(group: keyof AssetManifest['images'], id: string): HTMLImageElement | null {
    const rel = this.path(group, id);
    if (!rel) return null;
    return this.images.get(rel) ?? null;
  }

  /** URL usable in <img>/CSS if the file exists, else null. */
  imageUrl(group: keyof AssetManifest['images'], id: string): string | null {
    const rel = this.path(group, id);
    if (!rel || !this.exists(rel)) return null;
    const loaded = this.images.get(rel);
    if (loaded === null) return null;
    return this.url(rel);
  }

  /** Preload images in the manifest (optionally only those matching `filter`); reports progress 0..1. */
  async preloadImages(onProgress?: (p: number) => void, filter?: (rel: string) => boolean): Promise<void> {
    const rels: string[] = [];
    const imgs = this.manifest.images;
    for (const g of Object.values(imgs)) for (const v of Object.values(g as Record<string, string>)) if (!filter || filter(v)) rels.push(v);
    if (rels.length === 0) { onProgress?.(1); return; }
    let done = 0;
    await Promise.all(rels.map((r) => this.imageRel(r).then(() => { done++; onProgress?.(done / rels.length); })));
  }

  /** Everything the menu and the 3D scene need before the first frame: UI, table, menu background, card backs, suit icons. */
  static isCritical(rel: string): boolean {
    return rel.startsWith('ui/') || rel.startsWith('cards/back_') || rel.startsWith('cards/suits/')
      || rel.startsWith('env/table_wood') || rel.startsWith('env/bg_konoba');
  }

  async fetchAudio(rel: string): Promise<ArrayBuffer | null> {
    if (!this.exists(rel)) return null;
    try {
      const r = await fetch(this.url(rel));
      if (!r.ok) return null;
      const ct = r.headers.get('content-type') ?? '';
      if (ct.includes('text/html')) return null;
      const b = await r.arrayBuffer();
      return b.byteLength > 0 ? b : null;
    } catch {
      return null;
    }
  }
}

export const assets = new Assets();
