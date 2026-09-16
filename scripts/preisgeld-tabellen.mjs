// Epics Auszahlungstabellen zu einer Datei zusammenfuehren.
//
// Anlass: der Betreiber ueber "Meistes Preisgeld 2026": "ich weiss, wie viel
// der #1 hat, und es sind mehr als 271k, viel mehr." Die Jahresliste kannte
// nur die von Hand gepflegte EU-Tabelle. Epic veroeffentlicht zu jedem
// Turnierfenster seine Auszahlungstabelle (je Person, je Platzspanne oder je
// Punktzahl) - fuer die laufende Saison im Turnierkatalog, fuer alle
// frueheren nur noch dort, wo jemand sie aufgehoben hat: fortnitetracker.com
// haelt sie je Fenster in der Seite eines Spieltags (imp_eventWindow.payoutTable).
//
// Geholt werden sie dort im Browser (die Seite ist durch Cloudflare
// geschuetzt, ein Skript kommt nicht hinein) und als JSON abgelegt:
//
//   [{ "w": "S41_FNCSMajor2_Final_Day2_EU", "name": "Day 2 Finals",
//      "begin": "2026-08-02T15:00:00+00:00",
//      "tabs": [{ "t": "rank", "sid": "cumulative:...",
//                 "r": [[1, 60000, "ecomm"], [2, 40000, "ecomm"], ...] }] }, ...]
//
// "t" ist Epics scoringType (rank oder value), "r" je Stufe [Schwelle,
// Betrag je Person, Belohnungsarten]. Eine Stufe mit Betrag 0 (nur "token")
// bleibt drin - sie begrenzt die Spanne darunter (Top 5 eines Reload-Heats
// steigen auf und bekommen nichts, 6 bis 10 bekommen 250).
//
// Dieses Skript fuehrt beliebig viele solcher Dateien zusammen:
//
//   node scripts/preisgeld-tabellen.mjs roh-eu.json roh-nac.json ...
//
// Ergebnis: data/preisgeld-tabellen.json, das lib/preisgeld liest. Je Fenster
// eine genaue Tabelle; dazu je Familie (nur die Event-, Week- oder
// Session-Nummer verschieden) eine Musterregel als Rueckfall fuer Fenster,
// zu denen keine eigene Tabelle liegt. LAN-Fenster bleiben draussen - dort
// zaehlt die Datei je Konto (data/lan-preisgelder.json), weil Epics
// Bestenliste nur Turnierkonten fuehrt. Der erste Tag eines zweitaegigen
// Finales zahlt nie: Epic haengt die Tabelle des Endstands an beide Tage.

import { promises as fs } from 'fs';
import path from 'path';

const ZIEL = path.join(process.cwd(), 'data', 'preisgeld-tabellen.json');
const chr92 = String.fromCharCode(92);
const LAN = /^(Escargo|Bratwurst|Dinosauron|BambiRaptor)/;
const ERSTER_TAG = /(?:_Final_Day1_|CupFinal_Day1_|GrandFinalDay1_|_Day1$)/;
const REGION = /_(EU|NAC|NAW|BR|ASIA|ME|OCE)(?:_[A-Za-z0-9]+)?$/;

function eintraegeAus(roh, exakt) {
  const w = roh.w;
  if (roh.fehler || !Array.isArray(roh.tabs) || !roh.tabs.length) return [];
  if (LAN.test(w) || ERSTER_TAG.test(w)) return [];
  const region = (w.match(REGION) ?? [])[1] ?? '';
  const season = (w.match(/^(S\d+)_/) ?? [])[1] ?? '';
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const muster = exakt
    ? `^${escaped}$`
    : `^${escaped.replace(/(Event|Week|Session)\d+/g, '$1\\d+')}$`;
  const raus = [];
  for (const t of roh.tabs) {
    const stufen = (t.r ?? [])
      .filter((s) => typeof s[0] === 'number')
      .map((s) => (t.t === 'value' ? { abPunkte: s[0], betrag: s[1] ?? 0 } : { bis: s[0], betrag: s[1] ?? 0 }));
    if (!stufen.some((s) => s.betrag > 0)) continue;
    const sid = String(t.sid ?? '').toLowerCase();
    /*
     * Zweitaegige Finals: 2025/26 (_Final_Day2_) und 2023 (_GrandFinals_EU_Day2)
     * zaehlen je Tag, der Endstand ist die Summe - Epics Geldtabelle haengt
     * an der kumulierten Liste ("cumulative:" bzw. 2023 "floating:"). 2024
     * (GrandFinalDay2): in Chapter 5 Season 3 (S30) traegt der zweite Tag
     * schon die Summe, in Season 1 und 2 (S28, S29) zaehlt er nur den Tag -
     * geprueft an Malibucas Punkten (S29: 208 + 333 = 541 bei FN Tracker).
     */
    const tage = (sid.includes('cumulative') || sid.includes('floating')) && /_Day\d+(?:_|$)/.test(w) && !/GrandFinalDay/.test(w)
      ? 'summe' : (/GrandFinalDay2/.test(w) ? (/^S30_/.test(w) ? 'letzter' : 'summe') : 'einzeln');
    raus.push({
      quelle: 'Epic payout table (via fortnitetracker.com)',
      fenster: w, muster, season, region,
      name: roh.name ?? null, beginn: roh.begin ?? null, tage,
      art: t.t === 'rank' ? 'platz' : (t.t === 'value' ? 'punkte' : t.t),
      waehrung: 'USD', stufen,
    });
    break; // eine Geldtabelle je Fenster reicht - die zweite traegt Gegenstaende
  }
  return raus;
}

async function main() {
  const dateien = process.argv.slice(2);
  if (!dateien.length) { console.error('Aufruf: node scripts/preisgeld-tabellen.mjs roh.json [...]'); process.exit(1); }
  const roh = [];
  for (const d of dateien) {
    const j = JSON.parse(await fs.readFile(d, 'utf8'));
    roh.push(...(Array.isArray(j) ? j : (j.erg ?? [])));
  }
  // Genaue Tabellen zuerst; bei Dubletten gewinnt die spaetere Datei.
  const genau = new Map();
  for (const r of roh) for (const e of eintraegeAus(r, true)) genau.set(e.fenster, e);
  // Dann je Familie ein Muster - aus dem Fenster mit der kleinsten Nummer.
  const familien = new Map();
  for (const r of roh) {
    for (const e of eintraegeAus(r, false)) {
      const bisher = familien.get(e.muster);
      if (!bisher || e.fenster.localeCompare(bisher.fenster, undefined, { numeric: true }) < 0) familien.set(e.muster, e);
    }
  }
  const eintraege = [...genau.values(), ...[...familien.values()].filter((f) => f.muster.includes(chr92 + 'd+'))];
  // Sortiert: genaue vor Mustern, dann nach Saison und Fenster.
  eintraege.sort((a, b) => (a.muster.includes('\\d+') ? 1 : 0) - (b.muster.includes('\\d+') ? 1 : 0)
    || a.season.localeCompare(b.season, undefined, { numeric: true }) || a.fenster.localeCompare(b.fenster));

  await fs.writeFile(ZIEL, JSON.stringify({
    hinweis: 'Prize money per player, straight from Epic\'s payout table of each tournament window (as kept per window on fortnitetracker.com). Applied to Epic\'s own standings by placement; "bis" is the last placement of a span (a span with betrag 0 only carries a qualification token), "abPunkte" the points threshold (Performance and Victory Cups, per Victory Royale). Exact windows first (muster ^...$ with the full id), then one table per family where only the event, week or session number varies. tage: summe = the day windows count single days and the final standing is the sum of all days (cumulative leaderboard); letzter = the last day window already carries the total. LAN events (Escargo, Bratwurst, Dinosauron, BambiRaptor) are not in here: Epic\'s leaderboard there only holds tournament accounts, so their money sits per account in lan-preisgelder.json. The first day of a two-day final never pays. Built by scripts/preisgeld-tabellen.mjs.',
    stand: new Date().toISOString(),
    eintraege,
  }, null, 1), 'utf8');
  const genauN = eintraege.filter((e) => !e.muster.includes('\\d+')).length;
  console.log(`${eintraege.length} Tabellen (${genauN} genaue, ${eintraege.length - genauN} Muster) nach ${path.relative(process.cwd(), ZIEL)}`);
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
