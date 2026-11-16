/*
 * Eine Flagge fuer jeden Spieler in einem Post (Betreiber, 16.11.2026: "jeder Spieler in einem Post soll eine Flagge haben ... es sieht komisch aus, wenn
 * manche eine haben und manche nicht"). Ohne "@/"-Importe und ohne Datei- oder Netzzugriff, damit dieselbe Regel in der Seite (lib/ftPosts.ts,
 * lib/ergebnisPosts.ts, lib/discordStats.ts) und in den Skripten (scripts/power-rankings-holen.mjs, scripts/ft-posts.mjs) gilt.
 *
 * Woher das Land kommt, in dieser Reihenfolge - die erste Quelle, die zur Region des Spielers passt, gilt:
 *   profil  unsere gepflegten Profile (spieler-profile.json, /admin/flaggen) - immer, auch gegen die Region (von Hand eingetragen)
 *   szene   szene-quelle/spielerliste.json (COUNTRY)
 *   spiel   die Flagge, die der Spieler in Fortnite selbst gewaehlt hat: Epic fuehrt sie in jeder Turnier-Bestenliste als playerFlagTokens
 *           ("GroupIdentity_GeoIdentity_germany", lib/epicCups.ts) - dieselbe Angabe, die die Power Rankings tragen
 *   noble   Nobles Spielerlisten (Scrims, lib/noble.ts) - "global" heisst dort: kein Land
 * Eine automatische Quelle, die der Region widerspricht (BR auf einem EU-Spieler), wird uebersprungen und gemeldet - nicht geraten.
 * Kennt keine Quelle ein Land, steht das Zeichen der Region da: 🇪🇺 fuer EU, 🌎 fuer NA (🇺🇸 waere fuer Kanadier falsch) und BR, 🌏 fuer ASIA/OCE,
 * 🌍 fuer ME.
 */

/** Die Reihenfolge der Quellen. */
export const LAND_QUELLEN = ['profil', 'szene', 'spiel', 'noble'];

/* ------------------------------------------------------ Epics GeoIdentity */

/*
 * Epic nennt das Land als "GroupIdentity_GeoIdentity_<land>" - ausgeschrieben, klein, ohne Leerzeichen ("unitedstates"). Die Kuerzel kommen aus den
 * englischen Laendernamen; England, Schottland, Wales und Nordirland fuehrt Epic einzeln (flag-EN, flag-SCO, flag-WAL) - sie bleiben "en", "sco", "wal",
 * "nir" (bis 16.11.2026 in scripts/power-rankings-holen.mjs).
 */
let laender = null;
function geoLaender() {
  if (laender) return laender;
  const dn = new Intl.DisplayNames(['en'], { type: 'region' });
  const karte = new Map();
  for (let a = 65; a <= 90; a += 1) {
    for (let b = 65; b <= 90; b += 1) {
      const code = String.fromCharCode(a, b);
      let name = '';
      try { name = dn.of(code) ?? ''; } catch { continue; }
      if (!name || name === code) continue;
      karte.set(name.toLowerCase().normalize('NFKD').replace(/[^a-z]/g, ''), code.toLowerCase());
    }
  }
  const extra = {
    england: 'en', scotland: 'sco', wales: 'wal', northernireland: 'nir', unitedstates: 'us', usa: 'us',
    unitedkingdom: 'gb', greatbritain: 'gb', southkorea: 'kr', korea: 'kr', russia: 'ru', czechia: 'cz',
    czechrepublic: 'cz', turkey: 'tr', turkiye: 'tr', vietnam: 'vn', ivorycoast: 'ci', cotedivoire: 'ci',
    bosnia: 'ba', bosniaandherzegovina: 'ba', northmacedonia: 'mk', macedonia: 'mk', uae: 'ae',
    unitedarabemirates: 'ae', hongkong: 'hk', taiwan: 'tw', macau: 'mo', macao: 'mo', palestine: 'ps',
    kosovo: 'xk', moldova: 'md', syria: 'sy', iran: 'ir', laos: 'la', bolivia: 'bo', venezuela: 've',
    tanzania: 'tz', congo: 'cg', drcongo: 'cd', democraticrepublicofthecongo: 'cd', brunei: 'bn',
    capeverde: 'cv', eswatini: 'sz', swaziland: 'sz', timorleste: 'tl', easttimor: 'tl',
  };
  for (const [k, v] of Object.entries(extra)) karte.set(k, v);
  laender = karte;
  return karte;
}

/** Ein Token, das keine Flagge ergab (fuer die Meldung im Lauf). */
export const unbekannteGeoTokens = new Set();

/** "GroupIdentity_GeoIdentity_germany" -> "de" (klein; England & Co. "en"/"sco"/"wal"/"nir"), sonst "". */
export function landAusGeoToken(token) {
  const m = /GeoIdentity_(.+)$/.exec(String(token ?? ''));
  if (!m) return '';
  const schluessel = m[1].toLowerCase().replace(/[^a-z]/g, '');
  const code = geoLaender().get(schluessel);
  if (!code) unbekannteGeoTokens.add(m[1]);
  return code ?? '';
}

/* --------------------------------------------------------------- Flaggen */

/** England, Schottland, Wales als eigene Flaggen (Tag-Folgen), Nordirland als 🇬🇧 - so fuehrt Epic sie. */
const TEILE = { en: 'gbeng', sco: 'gbsct', wal: 'gbwls' };
const tagFolge = (s) => String.fromCodePoint(0x1f3f4, ...[...s].map((c) => 0xe0000 + c.charCodeAt(0)), 0xe007f);

/** Das Laenderkuerzel als Flagge ("DE" -> 🇩🇪, "en" -> 🏴󠁧󠁢󠁥󠁮󠁧󠁿), sonst "". */
export function flaggeZeichen(code) {
  const k = String(code ?? '').trim().toLowerCase();
  if (TEILE[k]) return tagFolge(TEILE[k]);
  const iso = k === 'nir' ? 'GB' : k === 'uk' ? 'GB' : k.toUpperCase();
  return /^[A-Z]{2}$/.test(iso) ? String.fromCodePoint(...[...iso].map((b) => 0x1f1a5 + b.charCodeAt(0))) : '';
}

/* --------------------------------------------------------------- Regionen */

/** Die Wettkampfregion aus einer Fenster-Id ("..._EU", "..._NAC") oder einer Regionsangabe ("NA-East" -> NAC). */
export function regionVon(roh) {
  const s = String(roh ?? '').toUpperCase();
  const m = /(?:^|[_\s-])(EU|NAC|NAE|NAW|NA|BR|ASIA|OCE|ME)(?:$|[_\s-])/.exec(s) ?? /^(EU|NAC|NAE|NAW|NA|BR|ASIA|OCE|ME)/.exec(s);
  if (!m) return '';
  return m[1] === 'NAE' ? 'NAC' : m[1];
}

/** Das Zeichen der Region, wenn kein Land bekannt ist - fuer jede Region etwas, nie 🇺🇸 fuer NA (Kanadier). */
export function regionZeichen(region) {
  switch (regionVon(region) || String(region ?? '').toUpperCase()) {
    case 'EU': return '🇪🇺';
    case 'NAC': case 'NAW': case 'NA': case 'BR': return '🌎';
    case 'ASIA': case 'OCE': return '🌏';
    case 'ME': return '🌍';
    default: return '🌐';
  }
}

/*
 * Welche Laender zu welcher Region passen. Grosszuegig - wer in einer Region spielt, kommt oft aus der Nachbarschaft (Nordafrika und Nahost im EU-Feld,
 * Suedamerika in NA, Suedostasien in OCE). Ausgeschlossen ist nur, was klar nicht passt: eine brasilianische Flagge bei einem reinen EU-Spieler.
 */
const EUROPA = 'AD AL AT BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SK SM UA VA XK EN SCO WAL NIR';
const KAUKASUS_TR = 'TR GE AM AZ KZ';
const NAHOST = 'IL PS LB JO SY IQ IR SA AE QA KW BH OM YE';
const NORDAFRIKA = 'MA DZ TN LY EG EH MR SD';
const AMERIKA = 'US CA MX GT BZ SV HN NI CR PA CU JM HT DO PR BS BB TT AG DM GD KN LC VC AW CW BM KY TC VG VI BR AR CL UY PY BO PE EC CO VE GY SR GF';
const ASIEN = 'JP KR KP CN TW HK MO MN TH VN LA KH MM MY SG ID PH BN TL IN PK BD LK NP BT MV AF UZ TM TJ KG KZ RU';
const OZEANIEN = 'AU NZ PG FJ SB VU NC PF WS TO KI FM MH PW NR TV CK NU';
const ERLAUBT = {
  EU: `${EUROPA} ${KAUKASUS_TR} ${NAHOST} ${NORDAFRIKA}`,
  NAC: AMERIKA, NAW: AMERIKA, NA: AMERIKA, BR: AMERIKA,
  ASIA: `${ASIEN} ${OZEANIEN} ${NAHOST}`,
  OCE: `${OZEANIEN} ${ASIEN}`,
  ME: `${NAHOST} ${NORDAFRIKA} ${KAUKASUS_TR} PK IN AF SO DJ ER ET`,
};
const erlaubtSet = Object.fromEntries(Object.entries(ERLAUBT).map(([r, s]) => [r, new Set(s.split(/\s+/).filter(Boolean))]));

/** Passt das Land zur Region? Ohne bekannte Region passt alles. */
export function landPasst(land, region) {
  const r = regionVon(region) || String(region ?? '').toUpperCase();
  const set = erlaubtSet[r];
  if (!set) return true;
  return set.has(String(land ?? '').toUpperCase());
}

/** Ein Laenderkuerzel, wie es gespeichert wird: zwei Buchstaben gross ("de" -> "DE"), England & Co. klein ("en"); "global"/"UK" wie Noble. */
export function landNorm(roh) {
  const k = String(roh ?? '').trim();
  if (!k || /^global$/i.test(k)) return '';
  if (/^(en|sco|wal|nir)$/i.test(k)) return k.toLowerCase();
  if (/^uk$/i.test(k)) return 'GB';
  return /^[A-Za-z]{2}$/.test(k) ? k.toUpperCase() : '';
}

/**
 * Das Land eines Spielers aus den Quellen in der festen Reihenfolge.
 *   quellen: { profil?, szene?, spiel?, noble? } - je ein Kuerzel oder leer
 *   region:  die Wettkampfregion (Fenster-Id oder "EU"); leer = keine Pruefung
 *   melde:   (quelle, land) => void - fuer eine uebersprungene Angabe, die der Region widerspricht
 * -> { land, quelle } oder null
 */
export function landWaehlen(quellen, region, melde) {
  for (const q of LAND_QUELLEN) {
    const land = landNorm(quellen?.[q]);
    if (!land) continue;
    // Das gepflegte Profil gilt immer - es hat jemand von Hand eingetragen.
    if (q !== 'profil' && region && !landPasst(land, region)) { melde?.(q, land); continue; }
    return { land, quelle: q };
  }
  return null;
}

/** Flagge oder, ohne Land, das Zeichen der Region - so hat jeder Name im Post ein Zeichen davor. */
export function flaggeOderRegion(land, region) {
  return flaggeZeichen(land) || (region ? regionZeichen(region) : '');
}
