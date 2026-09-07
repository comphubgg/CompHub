// Spieltage holen, zu denen die Szene-Quelle (noch) nichts hat.
//
// Das Archiv in data/szene-stats spiegelt eucompetitive.com. Dort stehen die
// Einzelwerte jedes Teilnehmers - Schaden, Treffer, Material, Bauteile -, und
// die gibt es sonst nirgends kostenlos: Epic selbst liefert sie nicht einmal
// fuer die Turniere, zu denen die Quelle sie hat (nachgeprueft am selben
// Fenster S42_PerformanceEvaluation_Event1Round2_EU: bei Epic steht ueberall
// Schaden 0, in der Quelle 3550,24 fuer denselben Spieler).
//
// Die Quelle veroeffentlicht aber erst ein, zwei Tage nach dem Cup - und
// laengst nicht jeden. Bis dahin fehlte der Spieltag im Profil vollstaendig,
// obwohl er stattgefunden hat und Epic ihn fuehrt.
//
// Was Epic hergibt, ist echt und nicht wenig:
//
//   - Platzierung und Punkte
//   - die Konto-Ids aller Teammitglieder
//   - wie viele Matches das Team gespielt hat
//
// Was Epic NICHT hergibt, ist alles je Spieler. Die Eliminierungen im
// Leaderboard gelten fuer das ganze Team; sie landen deshalb unter dem
// Namen "teamElims" und werden in der Turnierliste nicht angezeigt. Eine
// Zahl, die einmal "dieser Spieler" und einmal "dieses Duo" bedeutet, waere
// in derselben Spalte schlimmer als eine Luecke.
//
//   node scripts/epic-spieltage-holen.mjs            -> alles Fehlende
//   node scripts/epic-spieltage-holen.mjs --neu      -> auch Vorhandenes
//
// Wie bei den Platzierungen laeuft die Abfrage ueber die eigene
// Schnittstelle - der Entwicklungsserver muss laufen.

import { promises as fs } from 'fs';
import path from 'path';

const BASIS = process.env.WERKZEUG_URL || 'http://localhost:3000';
const ARCHIV = path.join(process.cwd(), 'data', 'szene-stats');
const ABLAGE = path.join(process.cwd(), 'data', 'epic-spieltage');

const neu = process.argv.slice(2).includes('--neu');
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/** Die Saison steckt im Namen des Fensters: S42_FNCSDivisionalCup_… */
function saisonAus(windowId, cupId) {
  const m = /^(S\d+)_/i.exec(windowId) || /^(s\d+)_/i.exec(cupId ?? '');
  return m ? m[1].toUpperCase() : null;
}

async function json(url) {
  const antwort = await fetch(url);
  if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
  const daten = await antwort.json();
  if (daten.error) throw new Error(daten.error);
  return daten;
}

async function main() {
  const katalog = await json(`${BASIS}/api/cup-catalog`);

  /*
   * Frueher wurde uebersprungen, was die Szene-Quelle schon hat.
   *
   * Das ging von einer falschen Annahme aus: die Quelle fuehrt je Spieltag
   * die Einzelwerte der besten hundert, aber keine Endtabelle. Wer den
   * Endstand eines Finales sehen wollte - siebenhundert Teams mit Platz und
   * Punkten -, fand deshalb ausgerechnet bei den wichtigsten Spieltagen
   * nichts, weil sie in der Quelle standen.
   *
   * Jetzt wird jeder abgeschlossene Spieltag gespiegelt. Die beiden Ablagen
   * halten Verschiedenes, und beides wird gebraucht.
   */
  const offen = [];
  for (const cup of katalog.cups ?? []) {
    for (const fenster of Object.values(cup.regionen ?? {})) {
      for (const w of fenster) {
        if (w.status !== 'vorbei') continue;
        const season = saisonAus(w.windowId, cup.id);
        if (!season) continue;
        offen.push({ ...w, season, titel: cup.titel, cupId: cup.id });
      }
    }
  }

  console.log(`${offen.length} vergangene Fenster ohne Datei der Quelle`);
  let geholt = 0; let vorhanden = 0; let leer = 0; const fehler = [];

  for (const w of offen) {
    const ordner = path.join(ABLAGE, w.season);
    const datei = path.join(ordner, `${w.windowId}.json`);
    if (!neu) {
      try { await fs.access(datei); vorhanden++; continue; } catch { /* fehlt */ }
    }

    let daten;
    try {
      daten = await json(`${BASIS}/api/cup-leaderboard`
        + `?event=${encodeURIComponent(w.eventId)}`
        + `&window=${encodeURIComponent(w.windowId)}&limit=10000`);
    } catch {
      await warte(2500);
      try {
        daten = await json(`${BASIS}/api/cup-leaderboard`
          + `?event=${encodeURIComponent(w.eventId)}`
          + `&window=${encodeURIComponent(w.windowId)}&limit=10000`);
      } catch (err2) { fehler.push(`${w.windowId}: ${err2.message}`); continue; }
    }

    const eintraege = daten.entries ?? [];
    if (!eintraege.length) { leer++; await warte(400); continue; }

    // Der Beginn des Spieltags: die frueheste Match-Endzeit, sonst der
    // geplante Start aus dem Katalog.
    const zeiten = eintraege.flatMap((e) => (e.matches ?? [])
      .map((m) => Date.parse(m.endTime ?? '')).filter(Number.isFinite));
    const datum = zeiten.length ? Math.min(...zeiten) : (w.begin ?? null);

    const teams = eintraege.map((e) => ({
      platz: e.rank,
      punkte: e.points ?? 0,
      matches: e.games ?? e.matches?.length ?? 0,
      // Team-Wert, kein Spielerwert - der Name sagt es, damit ihn niemand
      // versehentlich in eine Spalte fuer Einzelwerte setzt.
      teamElims: e.elims ?? 0,
      spieler: (e.players ?? []).map((p) => p.id).filter(Boolean),
    })).filter((t) => t.spieler.length);

    await fs.mkdir(ordner, { recursive: true });
    await fs.writeFile(datei, JSON.stringify({
      eventId: w.eventId, windowId: w.windowId, region: w.region,
      season: w.season, titel: w.titel, cupId: w.cupId,
      runde: w.runde ?? null, rundenTyp: w.rundenTyp ?? null,
      istFinale: Boolean(w.istFinale),
      datum,
      geholt: new Date().toISOString(),
      teams,
    }, null, 1), 'utf8');

    geholt++;
    console.log(`  ${w.season} ${w.region.padEnd(4)} ${w.windowId}`
      + ` - ${teams.length} Teams`);
    await warte(400);
  }

  console.log(`\nFertig: ${geholt} geholt, ${vorhanden} lagen schon,`
    + ` ${leer} ohne Bestenliste`);
  if (fehler.length) {
    console.log(`${fehler.length} Fehler, die ersten fuenf:`);
    for (const f of fehler.slice(0, 5)) console.log('   ', f);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
