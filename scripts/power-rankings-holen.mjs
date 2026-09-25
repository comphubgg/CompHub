// Die Power Rankings von Epic holen.
//
// Warum ueber den Browser und nicht per Abruf vom Server?
//
// Epics Seite holt ihre Daten von einer offenen Adresse - derselbe Pfad mit
// angehaengtem ".data". Aus curl und aus einem gewoehnlichen Browserfenster
// antwortet die; aus Node heraus dagegen mit 403, und ebenso aus einem
// ferngesteuerten Browser - bei identischen Kopfzeilen. Erkannt wird also
// nicht die Kennung, sondern die Art der Verbindung. Das gezielt auszuhebeln
// waere das Umgehen einer Bot-Erkennung, und das unterbleibt hier.
//
// Was dagegen ohne Weiteres geht: die Seite ganz normal aufrufen und lesen,
// was sie anzeigt. Genau das tut dieses Skript. Die Tabelle traegt Platz,
// Wochenveraenderung, Flagge, Name und Wertung - mehr braucht die Rangliste
// nicht. Mit "pageSize=100" in der Adresse kommen hundert Zeilen je Aufruf,
// also hundert Aufrufe fuer die vollen zehntausend Plaetze.
//
// Aufruf:  node scripts/power-rankings-holen.mjs [Region ...] [--seiten N]

import { chromium } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';

const PRO_SEITE = 100;
const ABLAGE = path.join(process.cwd(), 'data', 'power-rankings');

const argumente = process.argv.slice(2);
const seitenGrenze = (() => {
  const i = argumente.indexOf('--seiten');
  return i >= 0 ? Math.max(1, parseInt(argumente[i + 1], 10) || 100) : 100;
})();
const regionen = argumente
  .filter((a) => !a.startsWith('--') && !/^\d+$/.test(a))
  .map((r) => r.toUpperCase());
// Epic fuehrt nur eine weltweite Liste; der Parameter in der Adresse
// aendert am Ergebnis nichts. Abgelegt wird sie deshalb als "global".
const ZIEL = regionen.length ? regionen : ['GLOBAL'];

/** Eine Seite auslesen. Gibt zurueck, was in der Tabelle steht. */
async function leseSeite(browser, region, nr) {
  // Fuer jede Seite ein frischer Tab.
  //
  // Ein blosses goto auf dieselbe Adresse fing die Anwendung intern ab: die
  // vorige Tabelle blieb stehen, und man las hundertmal dieselben Zeilen.
  // Ein neuer Tab kennt keinen alten Zustand.
  const seite = await browser.newPage({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      + ' (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  try {
  await seite.goto(
    'https://www.fortnite.com/competitive/power-rankings'
    + `?pageSize=${PRO_SEITE}&page=${nr}`,
    { waitUntil: 'domcontentloaded', timeout: 60_000 },
  );
  // Warten, bis die Tabelle dieser Seite steht.
  //
  // Auf "mindestens eine Zeile" zu warten genuegt nicht: nach dem Wechsel
  // steht die vorige Tabelle noch im Dokument, und dann liest man zweimal
  // dieselben hundert Zeilen. Gewartet wird deshalb auf den Platz, der oben
  // stehen muss - bei Seite 3 mit hundert Zeilen also auf 201.
  const ersterPlatz = (nr - 1) * PRO_SEITE + 1;
  await seite.waitForFunction(
    (erwartet) => {
      const erste = document.querySelector('table tbody tr');
      if (!erste) return false;
      const zahl = parseInt((erste.innerText.split('\n')[0] || '').replace(/\D/g, ''), 10);
      return zahl === erwartet;
    },
    ersterPlatz, { timeout: 30_000 },
  ).catch(() => {});

  return await seite.evaluate(() => [...document.querySelectorAll('table tbody tr')].map((tr) => {
    const zellen = [...tr.querySelectorAll('td,th')];
    // Spalte 1 traegt Platz und Veraenderung nebeneinander.
    const ersteZeilen = (zellen[0]?.innerText ?? '').split('\n')
      .map((x) => x.trim()).filter(Boolean);
    const rang = parseInt((ersteZeilen[0] ?? '').replace(/\D/g, ''), 10);

    // Die Richtung steht nicht im Text.
    //
    // Neben dem Platz sitzt ein Abzeichen mit einer blanken Zahl - "2" heisst
    // je nach Pfeil daneben zwei Plaetze hinauf oder zwei hinunter. Nimmt man
    // nur den Text, geht es jedes Mal aufwaerts, und die halbe Liste stimmt
    // nicht.
    //
    // Der Pfeil ist ein Chevron ohne Beschriftung. Erkennbar ist er an zwei
    // Dingen: Epic faerbt ihn gold, wenn es hinaufgeht, und violett, wenn es
    // hinuntergeht; und der Pfad beginnt oben rechts (M25…) beziehungsweise
    // oben links (M6…). Beide Merkmale werden geprueft. Laesst sich die
    // Richtung nicht bestimmen, wird nichts behauptet - dann bleibt das Feld
    // leer und der Lauf meldet es.
    const abzeichen = zellen[0]?.querySelector('div > span:nth-child(2) > span');
    let delta = 0;
    let unklar = false;
    if (abzeichen) {
      const betrag = parseInt((abzeichen.innerText || '').replace(/\D/g, ''), 10);
      const stil = abzeichen.querySelector('div[style*="color"]')
        ?.getAttribute('style') ?? '';
      const pfad = abzeichen.querySelector('path')?.getAttribute('d') ?? '';
      const hoch = /254,\s*184,\s*24/.test(stil) || /^M25\./.test(pfad);
      const runter = /139,\s*64,\s*253/.test(stil) || /^M6\./.test(pfad);

      if (!Number.isFinite(betrag) || hoch === runter) unklar = true;
      else delta = hoch ? betrag : -betrag;
    }

    const flagge = zellen[1]?.querySelector('img')?.getAttribute('src') ?? '';
    const land = (flagge.match(/flag-([A-Za-z]{2})\.png/) ?? [])[1] ?? '';
    const name = (zellen[1]?.innerText ?? '').trim();
    // "32.840" ist Epics Schreibweise fuer 32840.
    const wertung = parseInt((zellen[2]?.innerText ?? '').replace(/\D/g, ''), 10);

    return {
      rank: Number.isFinite(rang) ? rang : null,
      name,
      land: land.toLowerCase(),
      wertung: Number.isFinite(wertung) ? wertung : 0,
      deltaPlatz: delta,
      unklar,
    };
  }));
  } finally {
    await seite.close();
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  /** Welche Dateien dieser Lauf neu geschrieben hat - die gehen in die Ablage. */
  const geschrieben = [];
  try {
    for (const region of ZIEL) {
      const gesammelt = [];
      let leer = 0;

      /** Welche Seiten ohne Zeilen blieben - die kommen am Ende noch einmal dran. */
      const ohne = [];

      for (let nr = 1; nr <= seitenGrenze; nr++) {
        let zeilen = [];
        /*
         * Bis zu dreimal je Seite.
         *
         * Der erste Aufruf der Seite laeuft durch eine Kette von
         * Weiterleitungen (Anmeldung, Region) und kam gelegentlich ohne
         * Tabelle zurueck - der Lauf meldete dann "nur 0 Zeilen" und liess
         * die alte Datei stehen. Der Betreiber: "wieso wurde die Power
         * Ranking Page zuletzt vor dreizehn Tagen updated?" Ein zweiter
         * Anlauf im frischen Tab genuegt in der Regel.
         */
        for (let versuch = 1; versuch <= 3 && !zeilen.some((z) => z.rank && z.name); versuch += 1) {
          try {
            zeilen = await leseSeite(browser, region, nr);
          } catch (e) {
            console.error(`${region} Seite ${nr} (Versuch ${versuch}): ${e.message}`);
          }
          if (!zeilen.some((z) => z.rank && z.name) && versuch < 3) {
            await new Promise((r) => setTimeout(r, 4000 * versuch));
          }
        }

        const brauchbar = zeilen.filter((z) => z.rank && z.name);
        gesammelt.push(...brauchbar);

        /*
         * Wann ist die Liste zu Ende?
         *
         * Frueher hiessen zwei leere Seiten hintereinander "Ende". Am
         * 23.9.2026 zeigte Epics Seite zwischendurch nur "OOPS" - der Lauf
         * hoerte nach Platz 3500 auf, Seite 1 und die Plaetze 2201 bis 2300
         * fehlten, und gespeichert wurden 3300 Spieler ab Platz 101. Der
         * Betreiber: "startet bei 101 und hat nur 3300 Spieler, obwohl es
         * 10.000 sein sollten."
         *
         * Jetzt ist erst das Ende, wenn eine Seite weniger als hundert Zeilen
         * bringt (die letzte ist nie voll) oder fuenf Seiten hintereinander
         * gar nichts - dann ist Epic ganz weg. Leere Seiten werden gemerkt
         * und am Schluss noch einmal gelesen.
         */
        if (!brauchbar.length) {
          ohne.push(nr);
          if (++leer >= 5) break;
        } else {
          leer = 0;
          if (brauchbar.length < PRO_SEITE) break;
        }

        if (nr % 10 === 0) {
          console.log(`${region}: ${gesammelt.length} Zeilen nach Seite ${nr}`);
        }
      }

      // Die leeren Seiten ein zweites Mal - nach einer Pause, in der sich
      // Epics Seite meist wieder gefangen hat. Nur die vor der letzten
      // gelesenen Seite: was danach kam, war das Ende der Liste.
      const letzteMitZeilen = Math.max(0, ...gesammelt.map((z) => Math.ceil(z.rank / PRO_SEITE)));
      const nachholen = ohne.filter((nr) => nr < letzteMitZeilen);
      if (nachholen.length) {
        console.log(`${region}: ${nachholen.length} Seiten blieben leer (${nachholen.join(', ')}) - zweiter Anlauf`);
        await new Promise((r) => setTimeout(r, 20_000));
        for (const nr of nachholen) {
          for (let versuch = 1; versuch <= 3; versuch += 1) {
            let zeilen = [];
            try { zeilen = await leseSeite(browser, region, nr); } catch { /* naechster Versuch */ }
            const brauchbar = zeilen.filter((z) => z.rank && z.name);
            if (brauchbar.length) { gesammelt.push(...brauchbar); break; }
            await new Promise((r) => setTimeout(r, 6000 * versuch));
          }
        }
      }

      if (gesammelt.length < 50) {
        console.error(`${region}: nur ${gesammelt.length} Zeilen - die vorhandene `
          + 'Datei bleibt stehen, ein halber Stand waere schlechter als der alte');
        continue;
      }

      // Nach Platz sortieren und Dubletten entfernen, falls eine Seite
      // zweimal gelesen wurde.
      const nachPlatz = new Map();
      for (const z of gesammelt) if (!nachPlatz.has(z.rank)) nachPlatz.set(z.rank, z);
      const spieler = [...nachPlatz.values()]
        .sort((a, b) => a.rank - b.rank)
        .map((z) => ({
          rank: z.rank, id: '', name: z.name, land: z.land,
          wertung: z.wertung, bestwert: 0,
          deltaWertung: 0, deltaPlatz: z.deltaPlatz,
        }));

      /*
       * Vollstaendig oder nicht?
       *
       * Vollstaendig heisst: ab Platz 1 und ohne Loch. Ein unvollstaendiger
       * Stand ersetzt nie einen vollstaendigen - "ein stiller Ausschnitt ist
       * schlimmer als keine Liste". Liegt nur ein noch schlechterer Stand
       * vor, geht der neue trotzdem hinein, aber mit Vermerk; die Seite sagt
       * es dann dazu.
       */
      const fehlend = (s) => {
        if (!s.length) return Infinity;
        return s[s.length - 1].rank - s.length;
      };
      // Wie viele Plaetze zwischen 1 und dem letzten fehlen, oben eingeschlossen.
      const luecke = fehlend(spieler);
      const vollstaendig = spieler[0].rank === 1 && fehlend(spieler) === 0;
      const ziel = path.join(ABLAGE, `${region.toLowerCase()}.json`);
      if (!vollstaendig) {
        let alt = null;
        try { alt = JSON.parse(await fs.readFile(ziel, 'utf8')); } catch { /* keiner da */ }
        if (!alt?.spieler?.length) {
          // Kein Stand auf der Platte - der am Release zaehlt.
          try {
            const r = await fetch('https://github.com/comphubgg/CompHub/releases/download/daten-spieltage/'
              + `power-rankings__${region.toLowerCase()}.json`, { signal: AbortSignal.timeout(30_000) });
            if (r.ok) alt = await r.json();
          } catch { /* dann eben keiner */ }
        }
        const altSp = alt?.spieler ?? [];
        const altVoll = altSp.length && altSp[0].rank === 1 && fehlend(altSp) === 0;
        const neuBesser = !altSp.length
          || (!altVoll && spieler[0].rank <= altSp[0].rank && spieler.length > altSp.length);
        console.warn(`${region}: unvollstaendig - erster Platz ${spieler[0].rank}, `
          + `${spieler.length} Spieler, ${luecke} Plaetze fehlen`);
        if (!neuBesser) {
          console.warn(`${region}: der vorhandene Stand (${altSp.length} Spieler ab Platz `
            + `${altSp[0]?.rank}) bleibt stehen`);
          continue;
        }
      }

      await fs.mkdir(ABLAGE, { recursive: true });
      await fs.writeFile(
        ziel,
        JSON.stringify({
          region, spieler, gesamt: spieler.length, geholt: Date.now(),
          ...(vollstaendig ? {} : { unvollstaendig: true }),
        }),
        'utf8',
      );
      const mitLand = spieler.filter((s) => s.land).length;
      const hoch = spieler.filter((s) => s.deltaPlatz > 0).length;
      const runter = spieler.filter((s) => s.deltaPlatz < 0).length;
      console.log(`${region}: ${spieler.length} Spieler gespeichert, ${mitLand} mit Flagge, `
        + `${hoch} hinauf / ${runter} hinunter`);
      // Ein Pfeil, dessen Richtung sich nicht bestimmen liess, ist ein Hinweis
      // darauf, dass Epic das Abzeichen umgebaut hat.
      const offen = gesammelt.filter((z) => z.unklar).length;
      if (offen) console.warn(`${region}: bei ${offen} Zeilen war die Richtung unklar`);
      geschrieben.push(`power-rankings/${region.toLowerCase()}.json`);
    }
  } finally {
    await browser.close();
  }

  /*
   * Den frischen Stand gleich in die Ablage bringen.
   *
   * Die Seite bei Vercel liest aus Supabase, nicht von diesem Rechner. Bis
   * hierher schrieb der Lauf nur die Datei auf die Platte - auf dem
   * Betreiber-Rechner dreimal am Tag, ohne dass je etwas davon die Seite
   * erreichte; dort blieb der Stand des Laufrechners stehen, und der kam
   * wochenlang nicht durch. Mit Zugangsdaten in .env.local geht der Stand
   * jetzt direkt hinterher.
   */
  if (geschrieben.length) {
    try {
      const { spawnSync } = await import('child_process');
      const skript = path.join(process.cwd(), 'scripts', 'umzug-supabase.mjs');
      const lauf = spawnSync(process.execPath, [skript, '--nur', geschrieben.join(',')], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 120_000,
      });
      const zeile = (lauf.stdout || '').split('\n').find((z) => /Uebertragen|fehlen/.test(z));
      console.log(zeile ? `Ablage: ${zeile.trim()}` : `Ablage: ${lauf.status === 0 ? 'hochgeladen' : 'nicht hochgeladen'}`);
    } catch (e) {
      console.warn('Ablage: nicht hochgeladen -', e.message);
    }
  }
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
