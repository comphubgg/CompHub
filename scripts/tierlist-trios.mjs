/*
 * Die Trios fuer die Tierlist - aus den echten Trio-Spieltagen.
 *
 * Trios sind fuer 2027 als Hauptmodus angekuendigt. Der Betreiber
 * (29.9.2026): "die Trios vom Performance Cup als allererstes generiert ...
 * automatisch generieren mit Flagge ... immer wieder updaten".
 *
 * Grundlage sind die abgelegten Spieltage (data/epic-spieltage), in denen
 * jedes Team mit seinen Konto-Ids steht. Beruecksichtigt werden nur
 * Wettkampf-Cups (Performance Evaluation, FNCS, Division, Cash Cup, Victory
 * Cup, Elite, Global) mit Dreierteams, ohne Zero Build.
 *
 * Wer mit wem spielt, aendert sich. Deshalb gilt je Spieler sein juengstes
 * Trio: die Spieltage werden vom neuesten zum aeltesten durchgegangen, und
 * ein Team zaehlt nur, wenn keiner der drei schon in einem neueren Trio
 * steht. Wechselt jemand, steht beim naechsten Lauf das neue Trio da.
 *
 * Flaggen und Namen kommen ausschliesslich ueber die Konto-Id (gepflegtes
 * Profil, Szene-Quelle, Epics Power Rankings; Namen zuletzt direkt bei
 * Epic). Ein Trio kommt nur in die Liste, wenn mindestens einer der drei
 * eine Flagge hat - Unbekannte blendet die Tierlist ohnehin aus - und alle
 * drei einen Namen haben.
 *
 * Ergebnis: data/antworten/tierlist_trios_auto.json. Der Schritt
 * "Zwischenstand ans GitHub-Release" nimmt die Datei mit, gelesen wird sie
 * von /api/tierlist-trios.
 *
 * Aufruf:  node scripts/tierlist-trios.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const DATEN = process.env.COMPHUB_DATEN || path.join(PROJEKT, 'data');
const ZIEL = path.join(DATEN, 'antworten', 'tierlist_trios_auto.json');

const WETTKAMPF = /PerformanceEvaluation|PerfEval|Performance|FNCS|Division|CashCup|Cash Cup|VictoryCup|Victory Cup|Elite|Global/i;
const OHNE = /_ZB_|_ZB$|ZeroBuild|NoBuild|Zero Build/i;
/** Wie weit zurueck - Trios gibt es erst seit Ende September 2026. */
const TAGE = 180;
/** Tiefer als bis Platz 2000 eines Spieltags reicht die Liste nicht. */
const PLATZ_BIS = 2000;

function liesJson(datei, ersatz) {
  try { return JSON.parse(fs.readFileSync(datei, 'utf8')); } catch { return ersatz; }
}

const teil = (n) => String(n ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const schluesselVon = (namen) => `trio:${namen.map(teil).sort().join('|')}`;
const istId = (s) => /^[0-9a-f]{32}$/.test(s);

async function epicNamen(ids) {
  const raus = new Map();
  if (!ids.length) return raus;
  let token;
  try {
    const { holeNutzerToken } = await import('../lib/replayKern.mjs');
    ({ token } = await holeNutzerToken());
  } catch (e) {
    console.log(`Kein Epic-Zugang (${e.message}) - fehlende Namen bleiben offen`);
    return raus;
  }
  const ACCOUNT = 'https://account-public-service-prod.ol.epicgames.com';
  for (let i = 0; i < ids.length; i += 100) {
    const stueck = ids.slice(i, i + 100);
    try {
      const r = await fetch(`${ACCOUNT}/account/api/public/account?${stueck.map((id) => `accountId=${id}`).join('&')}`,
        { headers: { Authorization: token } });
      if (!r.ok) { console.log(`Epic-Namen: HTTP ${r.status}`); continue; }
      for (const acc of await r.json()) {
        let name = acc.displayName;
        if (!name && acc.externalAuths) name = Object.values(acc.externalAuths)[0]?.externalDisplayName;
        if (name) raus.set(acc.id, name);
      }
    } catch { /* dann ohne diese hundert */ }
  }
  return raus;
}

async function main() {
  // Namen und Laender je Konto-Id.
  const land = new Map(); const name = new Map();
  const profile = liesJson(path.join(DATEN, 'spieler-profile.json'), {});
  const namenVz = liesJson(path.join(DATEN, 'spieler-namen.json'), {});
  const epicVz = liesJson(path.join(DATEN, 'epic-namen.json'), {});
  const quelle = liesJson(path.join(DATEN, 'szene-quelle', 'spielerliste.json'), []);
  const rangliste = liesJson(path.join(DATEN, 'power-rankings', 'global.json'), {})?.spieler ?? [];

  // Rangfolge: was weiter hinten steht, ueberschreibt nichts Vorderes.
  const setze = (karte, id, wert) => { if (id && wert && !karte.has(id)) karte.set(id, wert); };
  for (const [id, p] of Object.entries(profile)) {
    const k = istId(id) ? id : (istId(p?.id ?? '') ? p.id : '');
    if (!k) continue;
    const l = String(p?.land ?? '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(l)) setze(land, k, l);
    setze(name, k, String(p?.anzeige ?? '').trim());
  }
  for (const p of quelle) {
    const id = String(p?.ID ?? '').trim();
    const l = String(p?.COUNTRY ?? '').trim().toUpperCase();
    if (istId(id) && /^[A-Z]{2}$/.test(l)) setze(land, id, l);
  }
  for (const p of rangliste) {
    const l = String(p?.land ?? '').trim().toUpperCase();
    if (istId(p?.id ?? '') && /^[A-Z]{2}$/.test(l)) setze(land, p.id, l);
  }
  for (const [id, e] of Object.entries(namenVz)) setze(name, id, String(e?.haupt ?? '').trim());
  for (const p of rangliste) setze(name, p?.id, String(p?.name ?? '').trim());
  for (const p of quelle) setze(name, String(p?.ID ?? '').trim(), String(p?.NAME ?? '').trim());
  for (const [id, n] of Object.entries(epicVz)) setze(name, id, String(n ?? '').trim());

  // Die Trio-Spieltage, neueste zuerst.
  const wurzel = path.join(DATEN, 'epic-spieltage');
  const ab = Date.now() - TAGE * 864e5;
  const tage = [];
  for (const saison of fs.existsSync(wurzel) ? fs.readdirSync(wurzel) : []) {
    const ordner = path.join(wurzel, saison);
    if (!fs.statSync(ordner).isDirectory()) continue;
    for (const datei of fs.readdirSync(ordner)) {
      if (!datei.endsWith('.json')) continue;
      const w = datei.slice(0, -5);
      if (OHNE.test(w)) continue;
      const j = liesJson(path.join(ordner, datei), null);
      if (!j || !Array.isArray(j.teams) || !j.teams.length) continue;
      if ((j.datum ?? 0) < ab) continue;
      if (!WETTKAMPF.test(`${j.eventId ?? ''} ${j.windowId ?? w} ${j.titel ?? ''}`)) continue;
      if (OHNE.test(String(j.titel ?? ''))) continue;
      const groesse = Math.max(...j.teams.slice(0, 50).map((t) => t.spieler?.length ?? 0));
      if (groesse !== 3) continue;
      tage.push(j);
    }
  }
  tage.sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0));
  console.log(`${tage.length} Trio-Spieltage: ${tage.slice(0, 8).map((t) => t.windowId).join(', ')}${tage.length > 8 ? ' ...' : ''}`);

  const vergeben = new Set();
  const kandidaten = [];
  for (const tag of tage) {
    const teams = [...tag.teams].sort((a, b) => (a.platz ?? 1e9) - (b.platz ?? 1e9));
    for (const t of teams) {
      const ids = (t.spieler ?? []).filter(istId);
      if (ids.length !== 3) continue;
      if (ids.some((id) => vergeben.has(id))) continue;
      // Auch wer herausfaellt, ist vergeben: sonst kaeme ein aelteres Trio
      // desselben Spielers wieder hoch.
      for (const id of ids) vergeben.add(id);
      if ((t.platz ?? 1e9) > PLATZ_BIS) continue;
      if (!ids.some((id) => land.has(id))) continue;
      kandidaten.push({ ids, platz: t.platz ?? null, tag });
    }
  }

  // Fehlende Namen einmal gesammelt bei Epic.
  const fehlend = [...new Set(kandidaten.flatMap((k) => k.ids).filter((id) => !name.has(id)))];
  if (fehlend.length) {
    const neu = await epicNamen(fehlend);
    for (const [id, n] of neu) name.set(id, n);
    console.log(`${fehlend.length} Namen fehlten, ${neu.size} bei Epic gefunden`);
  }

  const trios = [];
  const gesehen = new Set();
  for (const k of kandidaten) {
    const spieler = k.ids.map((id) => ({ id, name: name.get(id) ?? '', ...(land.has(id) ? { land: land.get(id) } : {}) }));
    if (spieler.some((s) => !teil(s.name))) continue;
    const schluessel = schluesselVon(spieler.map((s) => s.name));
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    trios.push({
      schluessel,
      spieler,
      region: String(k.tag.region ?? '').toUpperCase() || undefined,
      platz: k.platz,
      cup: k.tag.titel ?? k.tag.windowId,
      windowId: k.tag.windowId,
      datum: k.tag.datum ?? null,
    });
  }

  fs.mkdirSync(path.dirname(ZIEL), { recursive: true });
  fs.writeFileSync(ZIEL, JSON.stringify({ zeit: Date.now(), wert: { trios, spieltage: tage.map((t) => t.windowId) } }));
  const jeRegion = {};
  for (const t of trios) jeRegion[t.region ?? '?'] = (jeRegion[t.region ?? '?'] ?? 0) + 1;
  console.log(`${trios.length} Trios abgelegt ${JSON.stringify(jeRegion)}`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
