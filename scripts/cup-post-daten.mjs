// Daten fuer einen Ergebnis-Post (tools/posts/cup-ergebnis.html) aus Epics Bestenliste: Top 10 mit Namen, Elims, Siegen und Cup-Summen.
//   node scripts/cup-post-daten.mjs <eventId> <windowId> <aus.js> [art] [titel]
import fs from 'node:fs';
import { holeNutzerToken } from '../lib/replayKern.mjs';

const [eventId, windowId, aus, art = 'finale', titel = ''] = process.argv.slice(2);
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
const ACCOUNT = 'https://account-public-service-prod.ol.epicgames.com';

async function seite(nr) {
  for (let v = 0; v < 5; v++) {
    const { token, accountId } = await holeNutzerToken();
    const r = await fetch(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(eventId)}/${encodeURIComponent(windowId)}/${accountId}?page=${nr}&rank=0&teamAccountIds=`, { headers: { Authorization: token } }).catch(() => null);
    if (r?.ok) return r.json();
    if (r?.status === 404) return null;
    await new Promise((x) => setTimeout(x, 2000 * (v + 1)));
  }
  throw new Error(`Seite ${nr} nicht lesbar`);
}

const teams = [];
let seiten = 1;
for (let n = 0; n < Math.min(seiten, 60); n++) {
  const j = await seite(n);
  if (!j) break;
  seiten = j.totalPages ?? 1;
  teams.push(...(j.entries ?? []));
}
if (!teams.length) { console.log('Keine Eintraege - Bestenliste leer'); process.exit(2); }

const st = (s, k) => Number(s.trackedStats?.[k]) || 0;
const auswerten = (e) => {
  const s = e.sessionHistory ?? [];
  return {
    rang: e.rank, punkte: e.pointsEarned, ids: e.teamAccountIds ?? [], spiele: s.length,
    elims: s.reduce((a, x) => a + st(x, 'TEAM_ELIMS_STAT_INDEX'), 0),
    siege: s.reduce((a, x) => a + st(x, 'VICTORY_ROYALE_STAT'), 0),
    bestesSpiel: s.reduce((a, x) => Math.max(a, st(x, 'TEAM_ELIMS_STAT_INDEX')), 0),
  };
};
const alle = teams.map(auswerten).sort((a, b) => a.rang - b.rang);
const top = alle.slice(0, 10);

// Namen: bekannte Pro-Namen aus dem Release, sonst Epics Anzeigename.
let pro = {};
try { pro = await (await fetch('https://github.com/comphubgg/CompHub/releases/download/daten/spieler-namen.json')).json(); } catch { /* ohne */ }
const ids = [...new Set([...top.flatMap((t) => t.ids), ...alle.slice(0, 200).flatMap((t) => t.ids)])];
const anzeige = {};
for (let i = 0; i < ids.length; i += 100) {
  const { token } = await holeNutzerToken();
  const r = await fetch(`${ACCOUNT}/account/api/public/account?${ids.slice(i, i + 100).map((x) => `accountId=${x}`).join('&')}`, { headers: { Authorization: token } }).catch(() => null);
  for (const a of r?.ok ? await r.json() : []) anzeige[a.id] = a.displayName;
}
const name = (id) => pro[id]?.haupt ?? anzeige[id] ?? id.slice(0, 8);
// Foto aus public/spielerbilder: Schluessel aus spieler-namen.json, sonst der Name ohne Team-Kuerzel.
const ORDNER = new URL('../public/spielerbilder/', import.meta.url);
const bilder = fs.existsSync(ORDNER) ? fs.readdirSync(ORDNER) : [];
let gesichter = {};
try { gesichter = JSON.parse(fs.readFileSync(new URL('_gesichter.json', ORDNER), 'utf8')); } catch { /* ohne */ }
const kurz = (n) => String(n).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^(t1|roc|ag|flcn|havok|godl|vp|xp42|s8ul|fokus|nstar|rt|flc|glore|m8|cgn)\s+/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const bild = (id) => {
  for (const k of [pro[id]?.schluessel, kurz(name(id)), kurz(name(id)).split('-')[0]].filter(Boolean)) {
    const f = bilder.find((b) => b === `${k}.jpg` || b === `${k}.png`);
    if (f) return { datei: f, gesicht: gesichter[f] ?? null };
  }
  return null;
};

const meisteElims = [...alle].sort((a, b) => b.elims - a.elims)[0];
const bestesSpiel = [...alle].sort((a, b) => b.bestesSpiel - a.bestesSpiel)[0];
const daten = {
  art, titel, eventId, windowId, stand: new Date().toISOString(),
  teams: alle.length,
  elims: alle.reduce((a, t) => a + t.elims, 0),
  siege: alle.reduce((a, t) => a + t.siege, 0),
  top: top.map((t) => ({ ...t, namen: t.ids.map(name), bilder: t.ids.map(bild) })),
  meisteElims: { namen: meisteElims.ids.map(name), bilder: meisteElims.ids.map(bild), elims: meisteElims.elims, rang: meisteElims.rang },
  bestesSpiel: { namen: bestesSpiel.ids.map(name), elims: bestesSpiel.bestesSpiel, rang: bestesSpiel.rang },
};
fs.writeFileSync(aus, `window.DATEN=${JSON.stringify(daten)};`);
console.log(JSON.stringify(daten, null, 1).slice(0, 3000));
