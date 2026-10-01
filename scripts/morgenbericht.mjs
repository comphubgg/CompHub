/*
 * Der Morgenbericht: eine Nachricht in #admin-log, die sagt, ob alles laeuft.
 *
 * Der Betreiber (1.10.2026) hat den Vorschlag freigegeben: "Jeden Morgen eine
 * einzige Nachricht: was nachts gelaufen ist, welche Cups heute starten, wie
 * viele Replays noch fehlen, ob ein Ablauf gescheitert ist, wie viele Besucher
 * gestern da waren." Er soll nicht in die Admin-Zentrale schauen muessen, um
 * zu wissen, dass nichts brennt.
 *
 * Alles kommt aus Quellen, die es schon gibt: die Abfragen der Seite selbst
 * (/api/tageszahlen, /api/replays, /api/cup-events) und die Laufliste von
 * GitHub Actions. Nichts wird erfunden; was sich nicht abrufen laesst, steht
 * als "nicht abrufbar" da.
 *
 *   node scripts/morgenbericht.mjs      schreibt morgenbericht.txt
 *   BASIS=https://...  GH_TOKEN=...  GITHUB_REPOSITORY=comphubgg/CompHub  COMPHUB_DATEN=<Ordner mit besuche.json und konten.json>
 */

import fs from 'node:fs';

const BASIS = (process.env.BASIS || 'https://www.thecomphub.com').replace(/\/+$/, '');
const REPO = process.env.GITHUB_REPOSITORY || 'comphubgg/CompHub';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/** JSON holen; ein Aufspielen liefert eine Minute lang 502, deshalb mehrere Versuche. */
async function hole(url, kopf = {}) {
  for (let v = 1; v <= 5; v++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'comphub-morgenbericht', ...kopf }, signal: AbortSignal.timeout(30_000) });
      if (r.ok) return await r.json();
    } catch { /* naechster Versuch */ }
    if (v < 5) await warte(20_000);
  }
  return null;
}

const jetzt = Date.now();
const gestern = new Date(jetzt - 86_400_000).toISOString().slice(0, 10);
const zahl = (n) => Number(n).toLocaleString('de-CH');
const zeilen = [];

// ---- Abfaelle: was lief in den letzten 24 Stunden, was ist gescheitert?
const seit = new Date(jetzt - 86_400_000).toISOString();
const kopf = { Accept: 'application/vnd.github+json', ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}) };
const laeufe = await hole(`https://api.github.com/repos/${REPO}/actions/runs?per_page=100&created=%3E%3D${encodeURIComponent(seit)}`, kopf);
if (laeufe?.workflow_runs) {
  const je = new Map();
  for (const l of laeufe.workflow_runs) {
    if (l.status !== 'completed' || l.conclusion === 'cancelled' || l.conclusion === 'skipped') continue;
    const e = je.get(l.name) ?? { ok: 0, fehler: 0, url: '' };
    if (l.conclusion === 'success') e.ok += 1; else { e.fehler += 1; e.url = e.url || l.html_url; }
    je.set(l.name, e);
  }
  const kaputt = [...je].filter(([, e]) => e.fehler > 0);
  zeilen.push(kaputt.length
    ? `**Gescheitert in den letzten 24 Stunden**\n${kaputt.map(([n, e]) => `• ${n}: ${e.fehler} von ${e.ok + e.fehler} (${e.url})`).join('\n')}`
    : `**Abläufe:** alle ${[...je.values()].reduce((a, e) => a + e.ok, 0)} Läufe der letzten 24 Stunden sind durchgelaufen.`);
} else zeilen.push('**Abläufe:** nicht abrufbar.');

// ---- Besucher und Konten von gestern
// Die Zahlen liegen in der Ablage; der Ablauf holt sie vorher nach DATEN (siehe morgenbericht.yml).
// Die Abfrage /api/tageszahlen taugt dafuer nicht - sie durchsucht Replay-Ordner und antwortet auf dem Server nicht rechtzeitig.
const DATEN = process.env.COMPHUB_DATEN || '';
const lesen = (name) => { try { return JSON.parse(fs.readFileSync(`${DATEN}/${name}`, 'utf8')); } catch { return null; } };
const besuche = DATEN ? lesen('besuche.json') : null;
const konten = DATEN ? lesen('konten.json') : null;
if (besuche && typeof besuche === 'object') {
  const b = besuche[gestern];
  zeilen.push(b
    ? `**Besucher gestern:** ${zahl(b.besucher)} (davon ${zahl(b.neu)} neu), ${zahl(b.aufrufe)} Seitenaufrufe`
    : '**Besucher gestern:** keine Zahl vorhanden.');
} else zeilen.push('**Besucher gestern:** nicht abrufbar.');
if (Array.isArray(konten)) {
  zeilen.push(`**Konten:** ${zahl(konten.length)} insgesamt, ${zahl(konten.filter((k) => (k.angelegt ?? '').startsWith(gestern)).length)} neu gestern, ${zahl(konten.filter((k) => (k.zuletzt ?? '').startsWith(gestern)).length)} gestern aktiv`);
} else zeilen.push('**Konten:** nicht abrufbar.');

// ---- Replays: wie viel ist ausgewertet, was ist in Epics Frist noch offen?
const rep = await hole(`${BASIS}/api/replays`);
if (rep?.fenster?.length) {
  const frist = jetzt - 31 * 864e5;
  let gesamt = 0; let fertig = 0; let offen = 0;
  for (const f of rep.fenster) {
    for (const [stand, n] of Object.entries(f.zaehler ?? {})) {
      gesamt += n;
      const alt = (f.datum ?? 0) > 0 && (f.datum ?? 0) < frist;
      if (stand === 'PARSED') fertig += n;
      else if (stand !== 'NOT_AVAILABLE' && !alt) offen += n;
    }
  }
  zeilen.push(`**Replays:** ${(fertig / gesamt * 100).toFixed(1)} % ausgewertet (${zahl(fertig)} von ${zahl(gesamt)}), in der Frist noch offen: ${zahl(offen)}`);
} else zeilen.push('**Replays:** nicht abrufbar.');

// ---- Cups in den naechsten 24 Stunden (EU)
const cups = await hole(`${BASIS}/api/cup-events?region=EU`);
if (cups?.windows) {
  const bald = cups.windows.filter((w) => w.begin >= jetzt && w.begin < jetzt + 86_400_000).sort((a, b) => a.begin - b.begin);
  zeilen.push(bald.length
    ? `**Cups in den nächsten 24 Stunden (EU)**\n${bald.slice(0, 8).map((w) => `• ${new Date(w.begin).toLocaleTimeString('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' })} Uhr – ${w.windowId}`).join('\n')}${bald.length > 8 ? `\n• … und ${bald.length - 8} weitere` : ''}`
    : '**Cups:** in den nächsten 24 Stunden startet keiner (EU).');
} else zeilen.push('**Cups:** nicht abrufbar.');

fs.writeFileSync('morgenbericht.txt', zeilen.join('\n\n'));
console.log(zeilen.join('\n\n'));
