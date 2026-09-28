// Die Power Rankings von Epic holen - ueber Epics eigene Schnittstelle.
//
// Bis zum 28.9.2026 las dieses Skript Epics Webseite in einem Browser aus.
// Seit dem 23.9. lieferte die den GitHub-Rechnern keine Tabelle mehr, und die
// Rangliste blieb auf einem Stand stehen, der bei Platz 101 begann. Der
// Betreiber: "seit 105 Stunden alt ... man startet nicht bei 1, sondern bei
// 101".
//
// Dabei ist die Weltrangliste bei Epic intern eine gewoehnliche
// Turnier-Bestenliste: Event "epicgames_dreamyparadox", Fenster
// "dreamyparadox" (so steht es in den Daten der Seite selbst). Solche
// Bestenlisten holt das Werkzeug ohnehin fuer jeden Cup, mit dem Epic-Zugang
// des Betreibers (lib/replayKern.mjs) - hundert Seiten zu hundert Plaetzen,
// in einer halben Minute, ohne Browser. Dazu bringt jeder Eintrag die
// Konto-Id mit, die der Webseite fehlte: Namen und Flaggen haengen jetzt an
// der Id statt am angezeigten Namen.
//
// Aufruf:  node scripts/power-rankings-holen.mjs [--probe]
//          --probe: holen und zusammenfassen, nichts schreiben

import { promises as fs, readFileSync } from 'fs';
import path from 'path';

// Zugangsdaten wie in den anderen Skripten aus .env.local (im Lauf schreibt
// der Schritt "Zugangsdaten" sie dorthin).
try {
  for (const z of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const i = z.indexOf('=');
    const k = z.slice(0, i).trim();
    if (i > 0 && !z.startsWith('#') && !process.env[k]) process.env[k] = z.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
} catch { /* nur Umgebung */ }

const { holeNutzerToken, verwirfNutzerToken } = await import('../lib/replayKern.mjs');

const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
const ACCOUNT = 'https://account-public-service-prod.ol.epicgames.com';
const EVENT = 'epicgames_dreamyparadox';
const FENSTER = 'dreamyparadox';
const REGION = 'GLOBAL';
const ABLAGE = path.join(process.cwd(), 'data', 'power-rankings');
const probe = process.argv.includes('--probe');
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

let zugang = await holeNutzerToken();

/** Eine Abfrage mit Epic-Zugang; ein 401 heisst "Token verworfen", nicht "abgemeldet". */
async function hole(url) {
  for (let versuch = 1; versuch <= 4; versuch += 1) {
    let r = await fetch(url, { headers: { Authorization: zugang.token }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (r?.status === 401) {
      verwirfNutzerToken();
      zugang = await holeNutzerToken();
      r = await fetch(url, { headers: { Authorization: zugang.token }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    }
    if (r?.ok) return r.json();
    // 429 und Aussetzer: kurz warten, dann noch einmal.
    await warte(1500 * versuch);
  }
  throw new Error(`Epic antwortet nicht: ${url.replace(/\/[0-9a-f]{32}\?/, '/…?')}`);
}

/*
 * Flaggen: Epic nennt das Land als "GroupIdentity_GeoIdentity_<land>" -
 * ausgeschrieben, klein, ohne Leerzeichen ("unitedstates"). Die Kuerzel
 * kommen aus den englischen Laendernamen; England, Schottland und Wales
 * fuehrt Epic einzeln, wie auf seiner Seite (flag-EN, flag-SCO, flag-WAL).
 */
const LAENDER = (() => {
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
  return karte;
})();
const unbekannteFlaggen = new Set();
function land(token) {
  const m = /GeoIdentity_(.+)$/.exec(token ?? '');
  if (!m) return '';
  const schluessel = m[1].toLowerCase().replace(/[^a-z]/g, '');
  const code = LAENDER.get(schluessel);
  if (!code) unbekannteFlaggen.add(m[1]);
  return code ?? '';
}

/** Namen je Konto - hundert je Abfrage, vier Abfragen gleichzeitig (wie lib/epicCups). */
async function namen(ids) {
  const raus = new Map();
  const bloecke = [];
  for (let i = 0; i < ids.length; i += 100) bloecke.push(ids.slice(i, i + 100));
  for (let i = 0; i < bloecke.length; i += 4) {
    const antworten = await Promise.all(bloecke.slice(i, i + 4).map((b) =>
      hole(`${ACCOUNT}/account/api/public/account?${b.map((id) => `accountId=${id}`).join('&')}`).catch(() => [])));
    for (const acc of antworten.flat()) {
      let name = acc.displayName;
      if (!name && acc.externalAuths) {
        const ext = Object.values(acc.externalAuths)[0];
        name = ext?.externalDisplayName;
      }
      if (name) raus.set(acc.id, name);
    }
  }
  return raus;
}

async function main() {
  // Seite 0 sagt, wie viele Seiten es gibt; der Rest vier zugleich.
  const erste = await hole(`${EVENTS}/api/v1/leaderboards/Fortnite/${EVENT}/${FENSTER}/${zugang.accountId}?page=0&rank=0&teamAccountIds=`);
  const seiten = Math.min(Number(erste.totalPages) || 1, 200);
  const alle = [...(erste.entries ?? [])];
  const epicStand = erste.updatedTime ?? null;
  for (let p = 1; p < seiten; p += 4) {
    const gruppe = [];
    for (let q = p; q < Math.min(p + 4, seiten); q += 1) {
      gruppe.push(hole(`${EVENTS}/api/v1/leaderboards/Fortnite/${EVENT}/${FENSTER}/${zugang.accountId}?page=${q}&rank=0&teamAccountIds=`));
    }
    for (const d of await Promise.all(gruppe)) alle.push(...(d.entries ?? []));
    await warte(250);
  }

  const nachPlatz = new Map();
  for (const e of alle) {
    // Ein Platz ohne Konto (bei Epic ohne Namen, etwa ein geloeschtes
    // Konto) bleibt stehen - sonst klaffte in der Liste ein Loch.
    const id = e.teamAccountIds?.[0] ?? '';
    const schluessel = id || `platz-${e.rank}`;
    if (!e.rank || nachPlatz.has(schluessel)) continue;
    const s = e.sessionHistory?.[0]?.trackedStats ?? {};
    nachPlatz.set(schluessel, {
      rank: e.rank, id, name: '', land: land(e.playerFlagTokens?.[id]),
      wertung: Number(s.PR ?? e.pointsEarned) || 0,
      bestwert: Number(s.peakPR) || 0,
      deltaWertung: Number(s.deltaPR) || 0,
      deltaPlatz: Number(s.deltaPosition) || 0,
    });
  }
  const spieler = [...nachPlatz.values()].sort((a, b) => a.rank - b.rank);
  const namenJeKonto = await namen(spieler.map((s) => s.id).filter(Boolean));
  let ohneName = 0;
  for (const s of spieler) {
    s.name = namenJeKonto.get(s.id) ?? '';
    if (!s.name) ohneName += 1;
  }

  const luecke = spieler.length ? spieler[spieler.length - 1].rank - spieler.length : Infinity;
  const vollstaendig = spieler[0]?.rank === 1 && luecke === 0;
  console.log(`${REGION}: ${spieler.length} Plaetze von ${seiten} Seiten, erster ${spieler[0]?.rank}, `
    + `Luecken ${luecke}, ohne Name ${ohneName}, mit Flagge ${spieler.filter((s) => s.land).length}, Epic-Stand ${epicStand}`);
  if (unbekannteFlaggen.size) console.log(`Flaggen ohne Kuerzel: ${[...unbekannteFlaggen].join(', ')}`);
  if (probe) {
    const zaehl = new Map();
    for (const s of spieler) zaehl.set(s.rank, (zaehl.get(s.rank) ?? 0) + 1);
    const fehlt = Array.from({ length: spieler.at(-1)?.rank ?? 0 }, (_, i) => i + 1).filter((r) => !zaehl.has(r));
    console.log('--probe: doppelte Plaetze', [...zaehl].filter(([, n]) => n > 1).slice(0, 10), 'fehlende', fehlt.slice(0, 10));
    console.log(JSON.stringify(spieler.slice(0, 2)));
    return;
  }

  // Ein unvollstaendiger Stand ersetzt nie einen vollstaendigen - "ein
  // stiller Ausschnitt ist schlimmer als keine Liste".
  if (!vollstaendig) {
    console.error(`${REGION}: unvollstaendig - die vorhandene Datei bleibt stehen`);
    process.exitCode = 1;
    return;
  }
  await fs.mkdir(ABLAGE, { recursive: true });
  await fs.writeFile(path.join(ABLAGE, `${REGION.toLowerCase()}.json`),
    JSON.stringify({ region: REGION, spieler, gesamt: spieler.length, geholt: Date.now(), epicStand }), 'utf8');
  console.log(`${REGION}: gespeichert`);
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
