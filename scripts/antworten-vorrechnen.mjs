/*
 * Die teuren Auskuenfte einmal ausrechnen, damit sie niemand mehr wartet.
 *
 * Die Startseite und die Statistikseite rechnen ueber neunhundert Spieltage.
 * Auf einem Rechner, auf dem die Dateien liegen, dauert das ein paar
 * Sekunden. Bei Vercel kommen dieselben Dateien ueber das Netz, und dann
 * dauert es Minuten - gemessen wurden erst eine Minute dreiundfuenfzig, nach
 * dem Umbau auf die Tabelle immer noch mehr als drei.
 *
 * Der Betreiber hat den Punkt getroffen: "Es geht viel zu lange, viel, viel,
 * viel zu lange." Schneller lesen ist dafuer die falsche Antwort. Richtig
 * ist, an der Stelle zu rechnen, an der die Dateien ohnehin liegen - auf dem
 * Rechner der stuendlichen GitHub-Aktion, direkt nachdem er die neuen Daten
 * geholt hat. Dort ist es schnell, dort stoert es niemanden, und das
 * Ergebnis wird anschliessend mit hochgeladen.
 *
 * Danach liest Vercel eine einzige Zeile statt neunhundert.
 *
 * Aufruf (der Server muss laufen und auf Dateien arbeiten):
 *   node scripts/antworten-vorrechnen.mjs http://localhost:3100
 */

import process from 'node:process';

const SERVER = (process.argv[2] || 'http://localhost:3000').replace(/\/+$/, '');

/*
 * Was vorgerechnet wird.
 *
 * Genau die Abfragen, die die Oberflaeche wirklich stellt - herausgesucht
 * aus den Aufrufen in app/. Was hier fehlt, wird beim ersten Besucher
 * gerechnet und dann ebenfalls abgelegt; die Liste muss also nicht
 * vollstaendig sein, sie soll nur das Haeufige abdecken.
 */
const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];

function wege(saisons) {
  const raus = [
    '/api/szene-stats?ansicht=start',
    '/api/szene-stats?ansicht=bilder',
    // Der Vorrat, in dem die Kopfzeilensuche sucht.
    '/api/szene-stats?ansicht=suchindex',
    '/api/szene-stats?ansicht=turniere',
    '/api/spieler-center',
    '/api/spieler-laender',
    // Die Startseite holt von hier die Zahl der ausgewerteten Matches.
    '/api/replays',
  ];
  /*
   * "alle" ist eine echte Wahl in der Oberflaeche, keine leere Angabe - und
   * die teuerste von allen, weil sie ueber jede Saison geht. Sie gehoert
   * deshalb zuerst auf die Liste.
   */
  for (const s of [...saisons, 'alle']) {
    raus.push(`/api/szene-stats?ansicht=start&saison=${encodeURIComponent(s)}`);
    raus.push(`/api/szene-stats?ansicht=turniere&saison=${encodeURIComponent(s)}`);
    // Die Spieler-Ansicht fragt mit limit=300 - zuerst ohne Region.
    raus.push(`/api/szene-stats?saison=${encodeURIComponent(s)}&sort=elims&limit=300`);
  }
  for (const r of REGIONEN) {
    raus.push(`/api/szene-stats?region=${r}&sort=elims&limit=80`);
    raus.push(`/api/szene-stats?region=${r}&sort=elims&limit=60`);
    /*
     * Die Regionen-Ansicht der Statistikseite fragt je Saison und Region mit
     * limit=500. Ohne diese hier rechnete Vercel beim ersten Besucher live -
     * und genau dort sah der Betreiber keine Bilder: sie kamen einfach noch
     * nicht, weil die Antwort noch unterwegs war.
     */
    for (const sa of [...saisons, 'alle']) {
      raus.push(`/api/szene-stats?saison=${encodeURIComponent(sa)}&region=${r}&sort=elims&limit=500`);
      // und dieselbe Ansicht mit einer gewaehlten Region.
      raus.push(`/api/szene-stats?saison=${encodeURIComponent(sa)}&sort=elims&limit=300&region=${r}`);
    }
  }
  return raus;
}

/** Welche Saisons es gibt - fragen statt raten. */
async function saisons() {
  try {
    // Ohne Angaben liefert die Schnittstelle die Auswahlliste - Saisons,
    // Regionen, Zahl der Spieltage.
    const r = await fetch(`${SERVER}/api/szene-stats`);
    if (r.ok) {
      const j = await r.json();
      const liste = j?.saisons ?? [];
      if (Array.isArray(liste) && liste.length) {
        return liste.map((x) => (typeof x === 'string' ? x : x?.kennung)).filter(Boolean);
      }
    }
  } catch { /* dann eben ohne */ }
  return [];
}

const zeit = (ms) => `${(ms / 1000).toFixed(1)}s`;

async function los() {
  console.log('');
  console.log(`  Server: ${SERVER}`);

  const s = await saisons();
  const liste = wege(s);
  console.log(`  Saisons: ${s.length ? s.join(', ') : '(keine gefunden)'}`);
  console.log(`  Abfragen: ${liste.length}`);
  console.log('');

  let ok = 0;
  let schief = 0;
  for (const weg of liste) {
    const start = Date.now();
    try {
      /*
       * Zehn Minuten Geduld je Abfrage. Auf dem Laufrechner dauert keine so
       * lange - aber ein Abbruch waere schlimmer als Warten: dann fehlte
       * genau die Antwort, die den Besucher spaeter aufhaelt.
       */
      const r = await fetch(SERVER + weg, {
        signal: AbortSignal.timeout(600_000),
      });
      const bytes = (await r.arrayBuffer()).byteLength;
      if (!r.ok) throw new Error(String(r.status));
      ok += 1;
      console.log(`  ok    ${zeit(Date.now() - start).padStart(7)}  ${String(bytes).padStart(9)} B  ${weg}`);
    } catch (e) {
      schief += 1;
      console.log(`  FEHLT ${zeit(Date.now() - start).padStart(7)}  ${' '.repeat(11)}${weg}  (${e.message})`);
    }
  }

  console.log('');
  console.log(`  Vorgerechnet: ${ok}   gescheitert: ${schief}`);
  console.log('');
  // Ein gescheiterter Vorlauf ist kein Grund, den ganzen Ablauf rot zu
  // faerben: die Daten sind trotzdem erneuert, und die fehlende Antwort
  // rechnet der erste Besucher aus.
}

await los();
