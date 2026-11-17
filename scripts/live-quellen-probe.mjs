// Probe (17.11.2026, EU LCQ Final): welche Epic-Schnittstelle nennt die LAUFENDE Match-ID eines Turnier-Spielers ohne Freundschaft - vor dem ersten Tod?
// Nur lesen, wenige Anfragen (eine je Sekunde). Je Runde:
//   A  Bestenliste v1 mit showLiveSessions=true und teamAccountIds=<Spieler>          -> liveSessions
//   B  Fenster-Verlauf v1 /events/.../{fenster}/history/{EIGENES}?teamAccountIds=<Spieler> -> liveSessionId (rotierend, 8 Spieler je Runde)
//   C  Fenster-Verlauf v1 mit dem Konto des Spielers im Pfad (Gegenprobe Berechtigung) - nur Runde 1
//   D  Bestenliste v2 POST /scores mit allen Spielern als teams                       -> liveSessionId / unbekannte Ids
//   E  matchmaking/session/{bekannte Match-ID}                                        -> was gibt eine Sitzung preis (nur Runde 1)
//   F  Replay-Metadaten fnreplaysmetadata/public/{bekannte Match-ID} und eine Verzeichnisabfrage (nur Runde 1)
// Jede 32-stellige Id, die nicht in BEKANNT steht, wird als "TREFFER <quelle> <id> <utc>" gemeldet.
//   node scripts/live-quellen-probe.mjs <ids-datei>   Umgebung: PROBE_MIN (8), PROBE_TAKT_S (20), EVENT, FENSTER, BEKANNT (Komma-Liste)
import fs from 'node:fs';
import { holeNutzerToken, verwirfNutzerToken, holeAppToken } from '../lib/replayKern.mjs';

const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
const MM = 'https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/matchmaking/session/';
const META = 'https://datastorage-public-service-live.ol.epicgames.com/api/v1/data/fnreplaysmetadata/public/';
const EVENT = process.env.EVENT || 'epicgames_S43_FNCSSoloReload_LastChanceQualifier_EU';
const FENSTER = process.env.FENSTER || 'S43_FNCSSoloReload_LastChanceLobby_EU';
const DAUER_MS = Number(process.env.PROBE_MIN || 8) * 60_000;
const TAKT_MS = Number(process.env.PROBE_TAKT_S || 20) * 1000;
const BEKANNT = new Set(String(process.env.BEKANNT || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const uhr = () => new Date().toISOString().slice(11, 19);

const konten = fs.readFileSync(process.argv[2], 'utf8').split('\n').map((z) => z.trim().split(/\s+/)).filter((t) => /^[0-9a-f]{32}$/i.test(t[0] ?? ''))
  .map((t) => ({ id: t[0].toLowerCase(), name: t.slice(1).join(' ') || t[0].slice(0, 8) })).slice(0, 50);
const alleIds = new Set(konten.map((k) => k.id));
const gemeldet = new Set();

async function rufe(url, opt = {}) {
  for (let v = 0; v < 2; v++) {
    const { token } = await holeNutzerToken();
    const r = await fetch(url, { ...opt, headers: { Authorization: token, 'Content-Type': 'application/json', ...(opt.headers ?? {}) }, signal: AbortSignal.timeout(15_000) })
      .catch((e) => ({ ok: false, status: String(e.message), text: async () => '' }));
    if (r.status === 401 && v === 0) { verwirfNutzerToken(); continue; }
    const text = await r.text().catch(() => '');
    await warte(1000);
    return { status: r.status, text };
  }
  return { status: 401, text: '' };
}

/** Alle 32-stelligen Ids im Text, die weder ein Konto noch eine bekannte Match-ID sind. */
function neueIds(text, quelle, wer = '') {
  for (const m of String(text).toLowerCase().matchAll(/[0-9a-f]{32}/g)) {
    const id = m[0];
    if (alleIds.has(id) || BEKANNT.has(id) || id === eigenes) continue;
    if (gemeldet.has(`${quelle}|${id}`)) continue;
    gemeldet.add(`${quelle}|${id}`);
    console.log(`TREFFER ${quelle} ${id} ${new Date().toISOString()} ${wer}`);
  }
}
const kurz = (t) => String(t).replace(/\s+/g, ' ').slice(0, 260);

const { accountId } = await holeNutzerToken();
const eigenes = String(accountId).toLowerCase();
console.log(`${uhr()} ${konten.length} Konten, ${EVENT}/${FENSTER}, bekannt ${BEKANNT.size} Match-IDs, Dauer ${DAUER_MS / 60_000} min`);
const ende = Date.now() + DAUER_MS;
let runde = 0, rot = 0;
do {
  runde += 1;
  const k0 = konten[runde % konten.length];
  // A
  const a = await rufe(`${EVENTS}/api/v1/leaderboards/Fortnite/${EVENT}/${FENSTER}/${eigenes}?page=0&rank=0&teamAccountIds=${k0.id}&showLiveSessions=true&appId=Fortnite`);
  let live = '';
  try { live = JSON.stringify(JSON.parse(a.text).liveSessions ?? null); } catch { live = kurz(a.text); }
  console.log(`${uhr()} A ${a.status} liveSessions=${live.slice(0, 200)}`);
  neueIds(live, 'A');
  // B (8 Spieler je Runde, rotierend)
  for (let i = 0; i < 8; i++) {
    const k = konten[rot++ % konten.length];
    const b = await rufe(`${EVENTS}/api/v1/events/Fortnite/${EVENT}/${FENSTER}/history/${eigenes}?teamAccountIds=${k.id}`);
    let lsid = '';
    try { const j = JSON.parse(b.text); lsid = Array.isArray(j) ? j.map((e) => `${(e.teamAccountIds ?? []).join('+').slice(0, 8)}:live=${e.liveSessionId}:n=${(e.sessionHistory ?? []).length}`).join(' ') : kurz(b.text); } catch { lsid = kurz(b.text); }
    if (runde === 1 || i === 0) console.log(`${uhr()} B ${b.status} ${k.name}: ${lsid.slice(0, 200)}`);
    if (b.status === 200) { try { for (const e of JSON.parse(b.text)) if (e.liveSessionId) neueIds(e.liveSessionId, 'B', k.name); } catch { /* egal */ } }
  }
  if (runde === 1) {
    // C
    const c = await rufe(`${EVENTS}/api/v1/events/Fortnite/${EVENT}/${FENSTER}/history/${k0.id}`);
    console.log(`${uhr()} C ${c.status} ${kurz(c.text).slice(0, 200)}`);
    // E + F mit einer bekannten Match-ID
    const bek = [...BEKANNT][0];
    if (bek) {
      const e = await rufe(MM + bek);
      console.log(`${uhr()} E ${e.status} ${kurz(e.text)}`);
      const app = await holeAppToken().catch(() => null);
      if (app) {
        const f = await fetch(`${META}${bek}.json`, { headers: { Authorization: app }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
        console.log(`${uhr()} F meta ${f?.status} ${kurz(await f?.text().catch(() => '') ?? '')}`);
        const g = await fetch(META, { headers: { Authorization: app }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
        console.log(`${uhr()} F liste ${g?.status} ${kurz(await g?.text().catch(() => '') ?? '')}`);
      }
    }
  }
  // D
  const d = await rufe(`${EVENTS}/api/v2/games/Fortnite/leaderboards/${EVENT}/${FENSTER}/scores?accountId=${eigenes}&fromIndex=0`, { method: 'POST', body: JSON.stringify({ teams: konten.map((k) => [k.id]) }) });
  let dz = '';
  try {
    const j = JSON.parse(d.text);
    dz = Array.isArray(j) ? `${j.length} Teams, Felder ${Object.keys(j[0] ?? {}).join(',')}, live=${j.filter((e) => e.liveSessionId).length}` : kurz(d.text);
  } catch { dz = kurz(d.text); }
  console.log(`${uhr()} D ${d.status} ${dz.slice(0, 220)}`);
  if (d.status === 200) neueIds(d.text, 'D');
  console.log(`${uhr()} Runde ${runde} fertig`);
  if (Date.now() + TAKT_MS < ende) await warte(TAKT_MS);
} while (Date.now() < ende);
console.log(`${uhr()} Ende`);
