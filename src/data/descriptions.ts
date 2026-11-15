// Mode-aware item descriptions: Partneri shows the 4-seat wording (§18.3), Dvoboj the base text.
import { FORE } from '../game/fore';
import { FORA_DESC4 } from '../game/fore4';
import type { ForaId, UkrasId } from '../game/types';
import { UKRASI } from '../game/ukrasi';
import { DESC4 } from '../game/ukrasi4';
import { getLang } from './strings';

export function foraDesc(id: ForaId, partneri: boolean): string {
  const hr = getLang() === 'hr';
  if (partneri) return hr ? FORA_DESC4[id].hr : FORA_DESC4[id].en;
  return hr ? FORE[id].descHr : FORE[id].descEn;
}

export function ukrasDesc(id: UkrasId, partneri: boolean): string {
  const hr = getLang() === 'hr';
  const d4 = partneri ? DESC4[id] : undefined;
  if (d4) return hr ? d4.hr : d4.en;
  return hr ? UKRASI[id].descHr : UKRASI[id].descEn;
}
