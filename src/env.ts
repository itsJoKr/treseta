// URL debug flags (§16.9) plus test helpers.
const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');

function num(name: string): number | undefined {
  const v = q.get(name);
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export const FLAGS = {
  /** bot hand face up + console event log */
  debug: q.get('debug') === '1',
  seed: q.get('seed') ?? undefined,
  /** start the run at this ladder index with 30 šoldi */
  start: num('start'),
  fast: q.get('fast') === '1',
  nosound: q.get('nosound') === '1',
  /** the player side is auto-played by the bot logic */
  autoplay: q.get('autoplay') === '1',
  /** autoplay also clicks through summaries/screens */
  autonav: q.get('autonav') === '1',
  /** animation speed multiplier override (tests), e.g. 4 */
  speed: num('speed'),
  /** match target override for both modes (default from game/matchConfig.ts), e.g. 3 */
  target: num('target'),
  /** do not read/write localStorage */
  nosave: q.get('nosave') === '1',
  /** simulate an empty public/assets/ (placeholders, no sound) */
  noassets: q.get('noassets') === '1',
  /** start a fresh run immediately */
  newrun: q.get('newrun') === '1',
  /** with newrun: which mode ('partneri' | 'dvoboj', default dvoboj for the old tests) */
  mode: (q.get('mode') === 'partneri' ? 'partneri' : 'dvoboj') as 'partneri' | 'dvoboj',
  /** force the phone layout on any device (tests) */
  phone: q.get('phone') === '1',
  /** Partneri: pre-pick this partner on the pick screen (tests) */
  partner: q.get('partner') ?? undefined,
};
