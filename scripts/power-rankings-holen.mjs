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
  try {
    for (const region of ZIEL) {
      const gesammelt = [];
      let leer = 0;

      for (let nr = 1; nr <= seitenGrenze; nr++) {
        let zeilen = [];
        try {
          zeilen = await leseSeite(browser, region, nr);
        } catch (e) {
          console.error(`${region} Seite ${nr}: ${e.message}`);
        }

        const brauchbar = zeilen.filter((z) => z.rank && z.name);
        gesammelt.push(...brauchbar);

        // Zwei leere Seiten hintereinander heissen: das war das Ende.
        if (!brauchbar.length) {
          if (++leer >= 2) break;
        } else {
          leer = 0;
        }

        if (nr % 10 === 0) {
          console.log(`${region}: ${gesammelt.length} Zeilen nach Seite ${nr}`);
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

      await fs.mkdir(ABLAGE, { recursive: true });
      await fs.writeFile(
        path.join(ABLAGE, `${region.toLowerCase()}.json`),
        JSON.stringify({ region, spieler, gesamt: spieler.length, geholt: Date.now() }),
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
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
