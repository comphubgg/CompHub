/*
 * Epics Auszahlungstabellen der laufenden Season dauerhaft ablegen.
 *
 * Die Seite rechnet das Preisgeld der laufenden Season aus Epics
 * Turnierkatalog (lib/preisgeld, ausEpicKatalog). Faellt ein Fenster dort
 * heraus - spaetestens mit der naechsten Season -, fehlte das Geld wieder:
 * am 26.9.2026 standen 261 Spieltage ohne Tabelle, fast alle aus Season 42
 * (Reload Cash Cups, Victory Cups). Dieses Skript schreibt jede Tabelle, die
 * Epic gerade nennt, in data/preisgeld-tabellen.json - in derselben Form wie
 * scripts/preisgeld-tabellen.mjs (Stufen ohne Geld bleiben als Grenze drin,
 * der erste Tag eines zweitaegigen Finales zahlt nie, LANs bleiben draussen).
 * Was dort schon steht, wird nicht angefasst.
 *
 * Laeuft im stuendlichen Lauf gegen dessen Server; die Datei geht danach mit
 * ans Release.
 *
 * Aufruf:  node scripts/preisgeld-aus-katalog.mjs http://localhost:3000 [--probe]
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const DATEN = process.env.COMPHUB_DATEN || path.join(PROJEKT, 'data');
const DATEI = path.join(DATEN, 'preisgeld-tabellen.json');
const SERVER = (process.argv.find((a) => a.startsWith('http')) || 'http://localhost:3000').replace(/\/+$/, '');
const PROBE = process.argv.includes('--probe');

const LAN = /^(Escargo|Bratwurst|Dinosauron|BambiRaptor|MannekenPis)/;
const ERSTER_TAG = /(?:_Final_Day1_|CupFinal_Day1_|GrandFinalDay1_|_Day1$)/;

const hole = (weg) => fetch(`${SERVER}${weg}`, { cache: 'no-store', signal: AbortSignal.timeout(60_000) })
  .then((r) => (r.ok ? r.json() : null)).catch(() => null);

/** Eine Tabelle in der Form von data/preisgeld-tabellen.json - oder null. */
function alsTabelle(w, region, gruppen, name, beginn) {
  for (const g of gruppen ?? []) {
    const stufen = [];
    for (const r of g.ranks ?? []) {
      if (typeof r.threshold !== 'number') continue;
      const betrag = (r.payouts ?? [])
        .filter((z) => z.rewardType === 'ecomm' && typeof z.quantity === 'number')
        .reduce((s, z) => s + z.quantity, 0);
      if (g.scoringType === 'value') { if (betrag > 0) stufen.push({ abPunkte: r.threshold, betrag }); }
      else if (g.scoringType === 'rank') stufen.push({ bis: r.threshold, betrag });
    }
    if (!stufen.some((s) => s.betrag > 0)) continue;
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      quelle: "Epic payout table (Epic's tournament catalog)",
      fenster: w, muster: `^${escaped}$`,
      season: (w.match(/^(S\d+)_/) ?? [])[1] ?? '', region,
      name: name ?? null, beginn: beginn ? new Date(beginn).toISOString() : null,
      // Zweitaegige Finals seit 2025: je Tag gewertet, der Endstand ist die Summe.
      tage: /_Day\d+(?:_|$)/.test(w) || /GrandFinalDay2/.test(w) ? 'summe' : 'einzeln',
      art: g.scoringType === 'value' ? 'punkte' : 'platz',
      waehrung: 'USD', stufen,
    };
  }
  return null;
}

async function main() {
  const datei = JSON.parse(fs.readFileSync(DATEI, 'utf8'));
  const schon = new Set((datei.eintraege ?? []).filter((e) => !String(e.muster).includes('\\d+'))
    .map((e) => `${e.fenster}|${e.region}`));

  const katalog = await hole('/api/cup-catalog');
  if (!katalog) { console.log('Cup-Katalog antwortet nicht.'); return; }
  const fenster = [];
  for (const c of katalog.cups ?? []) {
    for (const [region, liste] of Object.entries(c.regionen ?? {})) {
      for (const f of liste) {
        if (!/^S\d+_/.test(f.windowId) || LAN.test(f.windowId) || ERSTER_TAG.test(f.windowId)) continue;
        if (String(f.eventId).startsWith('manuell_')) continue;
        if (schon.has(`${f.windowId}|${region}`)) continue;
        fenster.push({ w: f.windowId, region, name: c.titel, beginn: f.begin });
      }
    }
  }

  const neu = [];
  for (const f of fenster) {
    const roh = await hole(`/api/cup-preise?roh=1&window=${encodeURIComponent(f.w)}&region=${f.region}`);
    const t = alsTabelle(f.w, f.region, roh?.gruppen, f.name, f.beginn);
    if (t) neu.push(t);
  }
  console.log(`${fenster.length} Fenster ohne eigene Tabelle geprueft, ${neu.length} Tabellen von Epic.`);
  if (!neu.length || PROBE) { if (PROBE) console.log(JSON.stringify(neu.slice(0, 3), null, 1)); return; }

  datei.eintraege = [...neu, ...(datei.eintraege ?? [])];
  datei.stand = new Date().toISOString();
  fs.writeFileSync(DATEI, JSON.stringify(datei, null, 1));
  console.log(`${neu.length} Tabellen in preisgeld-tabellen.json ergaenzt.`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
