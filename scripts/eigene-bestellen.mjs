// Fuer jedes verifizierte Konto jeden Cup der letzten 31 Tage bestellen, in dem es in Epics Bestenliste steht (lib/eigeneAuswertung).
//
// Der Betreiber (14.10.2026): "jeden einzelnen Cup gleich wichtig, fuer jeden einzelnen Account" - nicht nur die Cups, die jemand gerade
// offen hat, und nicht nur die grossen. Die Konten stehen unter eigene-konten/ (vorgemerkt bei der Verifizierung), die Cups mit ihren
// Teams unter epic-spieltage/ (Epics Bestenliste je Spieltag, vom stuendlichen Lauf geholt).
//
// Je Konto und Fenster entsteht eine Bestellung ohne Sitzungen (scripts/eigene-auswerten.mjs schlaegt sie bei Epic nach) - nur, wenn es weder
// ein Ergebnis noch eine Bestellung gibt. Diese Bestellungen bleiben auf dem Rechner des Ablaufs; was bleibt, ist das Ergebnis.
//
//   node scripts/eigene-bestellen.mjs

import fs from 'node:fs';
import path from 'node:path';

const DATEN = process.env.COMPHUB_DATEN || path.join(process.cwd(), 'data');
const KONTEN = path.join(DATEN, 'eigene-konten');
const SPIELTAGE = path.join(DATEN, 'epic-spieltage');
const ANFRAGEN = path.join(DATEN, 'eigene-anfragen');
const STATS = path.join(DATEN, 'eigene-stats');
const FRIST_MS = 31 * 864e5;

const konten = (fs.existsSync(KONTEN) ? fs.readdirSync(KONTEN) : []).map((f) => f.replace(/\.json$/, '')).filter((id) => /^[0-9a-f]{32}$/.test(id));
if (!konten.length) { console.log('Keine vorgemerkten Konten.'); process.exit(0); }
if (!fs.existsSync(SPIELTAGE)) { console.log('Keine Spieltage da.'); process.exit(0); }

const grenze = Date.now() - FRIST_MS;
let geprueft = 0; let neu = 0;
for (const ordner of fs.readdirSync(SPIELTAGE)) {
  const o = path.join(SPIELTAGE, ordner);
  if (!fs.statSync(o).isDirectory()) continue;
  for (const f of fs.readdirSync(o)) {
    if (!f.endsWith('.json')) continue;
    const p = path.join(o, f);
    let text;
    try { text = fs.readFileSync(p, 'utf8'); } catch { continue; }
    // "datum" steht vor den Teams: nur Fenster der letzten 31 Tage genauer ansehen.
    const d = /"datum":\s*(\d{10,})/.exec(text.slice(0, 1500));
    if (!d || Number(d[1]) < grenze) continue;
    geprueft += 1;
    const dabei = konten.filter((id) => text.includes(id));
    if (!dabei.length) continue;
    let t;
    try { t = JSON.parse(text); } catch { continue; }
    if (!t.windowId || !t.eventId || !Array.isArray(t.teams)) continue;
    for (const id of dabei) {
      const team = t.teams.find((x) => (x.spieler ?? []).includes(id));
      if (!team) continue;
      // Ein Ergebnis in der heutigen Fassung reicht (Fassung 3: Tode = Spiele ohne Sieg, dazu die Zeit im Sturm); aeltere werden neu gerechnet.
      try { if (JSON.parse(fs.readFileSync(path.join(STATS, t.windowId, `${id}.json`), 'utf8')).version >= 3) continue; } catch { /* noch keins */ }
      const ziel = path.join(ANFRAGEN, `${t.windowId}__${id}.json`);
      if (fs.existsSync(ziel)) continue;
      fs.mkdirSync(ANFRAGEN, { recursive: true });
      fs.writeFileSync(ziel, JSON.stringify({
        eventId: t.eventId, windowId: t.windowId, epicId: id, sitzungen: [], team: team.spieler, platz: team.platz ?? null,
        auto: true, datum: Number(d[1]), zeit: Date.now(),
      }));
      neu += 1;
      console.log(`  ${t.windowId} ${id.slice(0, 8)}: Platz ${team.platz ?? '?'}`);
    }
  }
}
console.log(`${konten.length} Konten, ${geprueft} Fenster der letzten 31 Tage geprueft, ${neu} neue Bestellungen.`);
