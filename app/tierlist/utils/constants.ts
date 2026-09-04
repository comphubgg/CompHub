export const FLAG_CODES = ['us','de','gb','ca','fr','nl','se','no','dk','fi','es','it','pl','ru','br','ar','mx','au','nz','jp','kr','cn','in','ph','id','my','sg','za','ng','ke','cl','pe','co','ve','pk','bd','il','sa','ir','iq','ae','qa','kw','om','bh','jo','lb','sy','ye','eg','ch','at','be','gr','hr','hu','ie','si','sk','ua','ro','rs','bg'];

export const REGION_LABELS: Record<string,string> = {
  EU: 'Europe',
  NAC: 'NAC',
  NAW: 'NA West',
  NAE: 'NA East',
  ASIA: 'Asia',
  OCE: 'Oceania',
  ME: 'Middle East',
  BRAZIL: 'Brazil'
};

export const TIER_KEYS: Array<'S'|'A'|'B'|'C'|'D'|'E'|'F'> = ['S','A','B','C','D','E','F'];

export const TIER_LABELS_DEFAULT: Record<'S'|'A'|'B'|'C'|'D'|'E'|'F', string> = {
  S: 'S',
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  E: 'E',
  F: 'F',
};

export const STORAGE_KEYS = {
  TIER_LISTS: 'tierlist:lists',
  CURRENT_LIST_ID: 'tierlist:currentListId',
};

export const TIER_COLORS: Record<string,string> = {
  S: 'tier-S',
  A: 'tier-A',
  B: 'tier-B',
  C: 'tier-C',
  D: 'tier-D',
  E: 'tier-E',
  F: 'tier-F'
};

export const getRegionFromCountryCode = (code: string) => {
  const c = String(code||'').toLowerCase();
  if (!c) return 'EU';
  if (['us','ca','mx'].includes(c)) return 'NAC';
  if (['gb','de','fr','nl','se','no','dk','fi','es','it','pl'].includes(c)) return 'EU';
  if (['jp','kr','cn','in','ph','id','my','sg'].includes(c)) return 'ASIA';
  if (['au','nz'].includes(c)) return 'OCE';
  return 'EU';
};
