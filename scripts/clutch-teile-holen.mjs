// Die Teilstaende (clutch-teil-*) ALLER juengeren Laeufe von "Clutch rechnen" holen - nicht nur die eines Laufs (16.11.2026).
//
// Bis dahin holte jede Ablage nur die Teile des Laufs, der sie anstiess (--lauf). Weil GitHub in einer Gruppe nur einen wartenden Lauf haelt und den
// aelteren verwirft, sobald ein neuer kommt, durfte die naechste Runde erst nach dem Abschluss ("ablegen", bis zu 40 Minuten Warten auf die Sofort-Ablage)
// anfangen - EU LCQ 16.11.2026: Rechner fertig 20:15, abgelegt 20:54, die naechste Runde begann 20:54. Jetzt holt jede Ablage alles, was in den letzten
// Stunden entstand: was schon eingearbeitet ist, ueberspringt scripts/clutch-zusammen.mjs ("Matches standen schon da"), ein verworfener wartender Lauf
// verliert nichts mehr, und eine Runde muss auf keine Ablage warten.
//
// Auch der Planer nutzt es (--im-flug in scripts/clutch-berechnen.mjs): Matches, die in einem Teil stehen, aber noch nicht am Release, sind unterwegs -
// sie werden nicht ein zweites Mal geplant.
//
//   node scripts/clutch-teile-holen.mjs --ziel data/clutch-teil [--stunden 3] [--ausser <run-id>]
//   node scripts/clutch-teile-holen.mjs --marke-schreiben     nach geglueckter Ablage: was eingearbeitet ist, merken
//
// Die Marke (data/clutch/_teile-abgelegt.json, am Release): Artifact-Id -> Zeit, fuer jedes Teil, dessen Dateien clutch-zusammen.mjs alle eingearbeitet
// oder als schon vorhanden erkannt hat (data/clutch-teil/_erledigt.json). Solche Teile holt niemand mehr. Sie wird erst geschrieben, wenn das Hochladen
// geglueckt ist; fehlt sie, wird ein Teil eben noch einmal geholt und als schon vorhanden uebersprungen.
//
// Jede Datei bekommt einen eindeutigen Namen <windowId>__<artifact-id>.json (clutch-zusammen.mjs liest "<w>__<zahl>.json"). Zugang: GH_TOKEN/GITHUB_TOKEN
// mit actions: read. Ein Fehler bei einem Teil bricht nichts ab - er kommt mit der naechsten Ablage.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const arg = process.argv.slice(2);
const wert = (k) => { const i = arg.indexOf(k); return i >= 0 ? arg[i + 1] : undefined; };
const ZIEL = path.resolve(wert('--ziel') ?? 'data/clutch-teil');
const STUNDEN = Number(wert('--stunden') ?? 3);
const AUSSER = String(wert('--ausser') ?? '');
const MARKE = path.resolve('data/clutch/_teile-abgelegt.json');
const HERKUNFT = path.join(ZIEL, '_herkunft.json');
const liesJson = (p, ersatz) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return ersatz; } };

if (arg.includes('--marke-schreiben')) {
  // Ein Teil gilt als abgelegt, wenn jede seiner Dateien in _erledigt.json steht (eingearbeitet oder schon vorhanden) - zurueckgestellte nicht.
  const erledigt = new Set(liesJson(path.join(ZIEL, '_erledigt.json'), []));
  const herkunft = liesJson(HERKUNFT, {});
  const marke = liesJson(MARKE, {});
  let neu = 0; let offen = 0;
  for (const [id, dateien] of Object.entries(herkunft)) {
    if (dateien.every((f) => erledigt.has(f))) { if (!marke[id]) { marke[id] = new Date().toISOString(); neu += 1; } } else offen += 1;
  }
  // Nur den letzten Tag behalten - Artifacts leben zwei Tage, geholt wird ohnehin nur aus den letzten Stunden.
  for (const [id, t] of Object.entries(marke)) if (Date.now() - Date.parse(t) > 864e5) delete marke[id];
  fs.mkdirSync(path.dirname(MARKE), { recursive: true });
  fs.writeFileSync(MARKE, JSON.stringify(marke));
  console.log(`Marke: ${neu} Teile neu als abgelegt, ${offen} bleiben offen (zurueckgestellt), ${Object.keys(marke).length} gemerkt`);
  process.exit(0);
}
const marke = liesJson(MARKE, {});
const REPO = process.env.GITHUB_REPOSITORY || 'comphubgg/CompHub';
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
if (!TOKEN) { console.log('Kein GH_TOKEN - keine Teile geholt.'); process.exit(0); }
const KOPF = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'comphub-clutch' };

async function api(p) {
  for (let v = 0; v < 3; v += 1) {
    const r = await fetch(`https://api.github.com${p}`, { headers: KOPF, signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (r?.ok) return r.json();
    await new Promise((ok) => setTimeout(ok, 2000 * (v + 1)));
  }
  throw new Error(`GitHub ${p}`);
}

/*
 * Uebergang: Laeufe von vor der Umstellung (16.11.2026, 21:30 UTC) legen ihre Teile im eigenen Schritt "ablegen" selbst ab, und ihre Teile tragen kein
 * "geplant" (scripts/clutch-zusammen.mjs wuerde einen alten Neuanfang wieder ausfuehren) - sie werden hier nie geholt.
 */
const UMSTELLUNG = Date.parse('2026-11-16T21:30:00Z');
const seit = new Date(Math.max(UMSTELLUNG, Date.now() - STUNDEN * 3600_000)).toISOString().slice(0, 19);
const laeufe = [];
for (let seite = 1; seite <= 5; seite += 1) {
  const j = await api(`/repos/${REPO}/actions/workflows/clutch-rechnen.yml/runs?per_page=100&page=${seite}&created=%3E%3D${seit}Z`);
  laeufe.push(...(j.workflow_runs ?? []));
  if ((j.workflow_runs ?? []).length < 100) break;
}
const teile = []; const plaene = [];
for (const l of laeufe) {
  if (String(l.id) === AUSSER) continue;
  const j = await api(`/repos/${REPO}/actions/runs/${l.id}/artifacts?per_page=100`).catch(() => ({ artifacts: [] }));
  for (const a of j.artifacts ?? []) {
    if (/^clutch-teil-\d+$/.test(a.name) && !a.expired && !marke[a.id]) teile.push({ lauf: l.id, ...a });
    if (a.name === 'clutch-plan' && !a.expired) plaene.push(a);
  }
}
/*
 * --listen: die gemerkten Match-Listen des Planers (clutch/_listen.json) aus dem juengsten Plan. Bis zum 16.11.2026 legte sie der Abschluss der Runde ab;
 * den gibt es nicht mehr - ohne sie fragte jeder Plan alle Bestenlisten neu.
 */
if (arg.includes('--listen') && plaene.length) {
  const a = plaene.sort((x, y) => y.id - x.id)[0];
  try {
    const r = await fetch(a.archive_download_url, { headers: KOPF, redirect: 'follow', signal: AbortSignal.timeout(180_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const t = fs.mkdtempSync(path.join(os.tmpdir(), 'clutch-plan-'));
    fs.writeFileSync(path.join(t, 'p.zip'), Buffer.from(await r.arrayBuffer()));
    execFileSync('unzip', ['-q', '-o', path.join(t, 'p.zip'), 'clutch/_listen.json', '-d', t]);
    const neu = liesJson(path.join(t, 'clutch', '_listen.json'), null);
    if (neu && typeof neu === 'object') {
      // Vereinigen statt ersetzen: was das Release kennt, bleibt; die juengere Zeit gewinnt.
      const ziel = path.resolve('data/clutch/_listen.json');
      const alt = liesJson(ziel, {});
      for (const [w, l] of Object.entries(neu)) {
        const o = alt[w];
        alt[w] = { zeit: Math.max(l?.zeit ?? 0, o?.zeit ?? 0), ids: [...new Set([...(o?.ids ?? []), ...(l?.ids ?? [])])] };
      }
      fs.mkdirSync(path.dirname(ziel), { recursive: true });
      fs.writeFileSync(ziel, JSON.stringify(alt));
      console.log(`Match-Listen aus dem Plan ${a.id}: ${Object.keys(neu).length} Spieltage`);
    }
    fs.rmSync(t, { recursive: true, force: true });
  } catch (e) { console.log(`Match-Listen aus dem Plan nicht geholt (${String(e.message).slice(0, 80)}) - es bleibt die vom Release`); }
}
// Aelteste zuerst: clutch-zusammen.mjs liest die Dateien in Namensfolge, die Artifact-Ids steigen mit der Zeit.
teile.sort((a, b) => a.id - b.id);
fs.mkdirSync(ZIEL, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clutch-teile-'));
let dateien = 0; let mb = 0; let schief = 0;
const herkunft = liesJson(HERKUNFT, {});
for (const a of teile) {
  try {
    const r = await fetch(a.archive_download_url, { headers: KOPF, redirect: 'follow', signal: AbortSignal.timeout(180_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const zip = path.join(tmp, `${a.id}.zip`);
    fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
    mb += fs.statSync(zip).size / 1048576;
    const aus = path.join(tmp, String(a.id));
    execFileSync('unzip', ['-q', '-o', zip, '-d', aus]);
    const namen = [];
    for (const f of fs.readdirSync(aus).filter((x) => /__\d+\.json$/.test(x))) {
      // Erst ganz schreiben, dann umbenennen - ein halber Teil darf nie im Zielordner liegen.
      const name = f.replace(/__\d+\.json$/, `__${a.id}.json`);
      fs.copyFileSync(path.join(aus, f), path.join(ZIEL, `${name}.tmp`));
      fs.renameSync(path.join(ZIEL, `${name}.tmp`), path.join(ZIEL, name));
      namen.push(name);
      dateien += 1;
    }
    herkunft[a.id] = namen;
    fs.rmSync(aus, { recursive: true, force: true }); fs.rmSync(zip, { force: true });
  } catch (e) { schief += 1; console.log(`  Teil ${a.name} von Lauf ${a.lauf}: ${String(e.message).slice(0, 100)} - kommt mit der naechsten Ablage`); }
}
fs.rmSync(tmp, { recursive: true, force: true });
fs.writeFileSync(HERKUNFT, JSON.stringify(herkunft));
console.log(`Teile geholt: ${teile.length - schief} von ${teile.length} aus ${laeufe.length} Laeufen der letzten ${STUNDEN} h, ${dateien} Dateien, ${mb.toFixed(0)} MB`);
