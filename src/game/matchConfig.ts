// Match configuration shared by both modes (§19 Revision 2 heads-up: matches are played
// to 11 points, usually about two hands). The between-hands flow is unchanged; only the
// target lives here. Tests / debug can override it with ?target=N (see main.ts).
export type GameMode = 'dvoboj' | 'partneri';

export interface MatchConfig {
  /** first side/team to reach this (with no tie) wins the match */
  target: number;
}

export const MATCH_CONFIG: Record<GameMode, MatchConfig> = {
  dvoboj: { target: 11 },
  partneri: { target: 11 },
};

let override: number | undefined;

/** Debug/test override for both modes (undefined clears it). */
export function setMatchTargetOverride(n: number | undefined): void {
  override = n && n > 0 ? Math.floor(n) : undefined;
}

export function matchTarget(mode: GameMode): number {
  return override ?? MATCH_CONFIG[mode].target;
}
