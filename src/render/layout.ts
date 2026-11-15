// Fan math (handLayout) and table positions (tableLayout) from §10.5.
import * as THREE from 'three';
import { flatQuat } from './cardMesh';

const DEG = Math.PI / 180;

// ---- player hand (camera space) ----
export const HAND_ANCHOR = new THREE.Vector3(0, -1.95, -7);
export const HAND_R = 6.0;

export function playerSlot(i: number, n: number): { x: number; y: number; z: number; rz: number } {
  const step = n > 1 ? Math.min(4.2 * DEG, (36 * DEG) / (n - 1)) : 0;
  const th = (i - (n - 1) / 2) * step;
  const pivotY = HAND_ANCHOR.y - HAND_R;
  return {
    x: HAND_ANCHOR.x + HAND_R * Math.sin(th),
    y: pivotY + HAND_R * Math.cos(th),
    z: HAND_ANCHOR.z + i * 0.004,
    rz: -th,
  };
}

// ---- opponent hand (world, flat on the table, rotated 180° about y) ----
// nudged from z -4.0 so the fan is not hidden behind the HUD portrait (top centre)
export const BOT_HAND_CENTER = new THREE.Vector3(0, 0.02, -2.6);
export const BOT_R = 5;
export const BOT_SCALE = 0.85;

export function botSlot(i: number, n: number): { pos: THREE.Vector3; quat: THREE.Quaternion } {
  const step = n > 1 ? Math.min(3.5 * DEG, (30 * DEG) / (n - 1)) : 0;
  const th = (i - (n - 1) / 2) * step;
  const pivot = new THREE.Vector3(BOT_HAND_CENTER.x, BOT_HAND_CENTER.y, BOT_HAND_CENTER.z - BOT_R);
  const pos = new THREE.Vector3(pivot.x - BOT_R * Math.sin(th), BOT_HAND_CENTER.y + i * 0.003, pivot.z + BOT_R * Math.cos(th));
  return { pos, quat: flatQuat(Math.PI - th, true) };
}

// ---- table ----
export const TRICK_BOT = new THREE.Vector3(-0.55, 0.03, 0.2);
export const TRICK_PLAYER = new THREE.Vector3(0.55, 0.03, 0.75);
export const TRICK_CENTER = new THREE.Vector3(0, 0, 0.475);
export const TRICK_BOT_YAW = 7 * DEG;
export const TRICK_PLAYER_YAW = -6 * DEG;

export const MAC_PLAYER = new THREE.Vector3(3.6, 0, 1.6);
export const MAC_BOT = new THREE.Vector3(-3.6, 0, -1.4);
export const MAC_PLAYER_YAW = -8 * DEG;
export const MAC_BOT_YAW = 8 * DEG;

export const PILE_PLAYER = new THREE.Vector3(6.4, 0, 3.0);
export const PILE_BOT = new THREE.Vector3(-6.4, 0, -2.6);

export const REVEAL_PLAYER = new THREE.Vector3(2.0, 2.6, 3.2);
export const REVEAL_BOT = new THREE.Vector3(-2.0, 2.4, -0.4);
export const REVEAL_PLAYER_SCALE = 1.3;
export const REVEAL_BOT_SCALE = 1.15;

// nudged from z 1.0 so the showcase centres at ~40% screen height instead of covering the portrait
export const SHOWCASE = new THREE.Vector3(0, 3.0, 2.2);
export const SHOWCASE_GAP = 0.95;
export const SHOWCASE_SCALE = 1.35;

export const DECK_PLAYER = new THREE.Vector3(4.8, 0, 2.6);
export const DECK_BOT = new THREE.Vector3(-4.8, 0, -2.4);

export function trickSlot(side: 'player' | 'bot', first: boolean, jitter: number): { pos: THREE.Vector3; quat: THREE.Quaternion } {
  const base = side === 'player' ? TRICK_PLAYER : TRICK_BOT;
  const yaw = (side === 'player' ? TRICK_PLAYER_YAW : TRICK_BOT_YAW) + jitter * 4 * DEG;
  return { pos: new THREE.Vector3(base.x, first ? 0.03 : 0.05, base.z), quat: flatQuat(yaw, true) };
}

export { DEG };

// ======================= Partneri (§18.8) =======================
// flatQuat convention: yaw 0 = card top toward −z (readable from S). W/E fans have their
// tops pointing toward the table centre, so W uses yaw −90° − θ and E yaw +90° + θ.
export type BotSeat = 'W' | 'N' | 'E';
export const SIDE_R = 4;
export const SIDE_SCALE = 0.8;
export const N_SCALE = BOT_SCALE;
export const SIDE_PIVOT = { W: new THREE.Vector3(-9.2, 0.02, 0.2), E: new THREE.Vector3(9.2, 0.02, 0.2) };

export function sideSlot(seat: 'W' | 'E', i: number, n: number): { pos: THREE.Vector3; quat: THREE.Quaternion } {
  const step = n > 1 ? Math.min(3.2 * DEG, (28 * DEG) / (n - 1)) : 0;
  const th = (i - (n - 1) / 2) * step;
  const p = SIDE_PIVOT[seat];
  const sign = seat === 'W' ? 1 : -1;
  // card tops point outward along the radius from the pivot (toward the table centre); the
  // nearer cards (larger z) stack on top in both fans
  const pos = new THREE.Vector3(p.x + sign * SIDE_R * Math.cos(th), 0.02 + i * 0.003, p.z + SIDE_R * Math.sin(th));
  const yaw = seat === 'W' ? -90 * DEG - th : 90 * DEG + th;
  return { pos, quat: flatQuat(yaw, true) };
}

/** Fan slot of a bot seat (N reuses the Dvoboj bot fan). */
export function seatSlot(seat: BotSeat, i: number, n: number): { pos: THREE.Vector3; quat: THREE.Quaternion; scale: number } {
  if (seat === 'N') return { ...botSlot(i, n), scale: N_SCALE };
  return { ...sideSlot(seat, i, n), scale: SIDE_SCALE };
}

export const TRICK4: Record<'S' | 'W' | 'N' | 'E', { pos: THREE.Vector3; yaw: number }> = {
  S: { pos: new THREE.Vector3(0.15, 0.03, 1.25), yaw: -4 * DEG },
  W: { pos: new THREE.Vector3(-1.0, 0.03, 0.5), yaw: 10 * DEG },
  N: { pos: new THREE.Vector3(-0.15, 0.03, -0.3), yaw: 5 * DEG },
  E: { pos: new THREE.Vector3(1.0, 0.03, 0.5), yaw: -10 * DEG },
};
export const TRICK4_CENTER = new THREE.Vector3(0, 0.03, 0.47);

export function trickSlot4(seat: 'S' | 'W' | 'N' | 'E', playIndex: number, jitter: number): { pos: THREE.Vector3; quat: THREE.Quaternion } {
  const t = TRICK4[seat];
  return { pos: new THREE.Vector3(t.pos.x, 0.03 + 0.008 * playIndex, t.pos.z), quat: flatQuat(t.yaw + jitter * 3 * DEG, true) };
}

export const PILE_MI = PILE_PLAYER;
export const PILE_VI = PILE_BOT;

export const DECK4: Record<'S' | 'W' | 'N' | 'E', THREE.Vector3> = {
  S: new THREE.Vector3(2.4, 0, 2.8),
  W: new THREE.Vector3(-4.2, 0, 1.6),
  N: new THREE.Vector3(-2.4, 0, -2.0),
  E: new THREE.Vector3(4.2, 0, -0.6),
};

// ======================= Dvoboj on one deck (§19.3.4) =======================
export const SHARED_MAC = new THREE.Vector3(3.3, 0, 0.3);
export const SHARED_MAC_YAW = -8 * DEG;
export const DECK_P2 = new THREE.Vector3(2.4, 0, 2.8);
export const DECK_B2 = new THREE.Vector3(-2.4, 0, -1.8);
