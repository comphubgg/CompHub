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

import fs from 'node:fs';
import path from 'node:path';
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

/** Welche Saisons zu welchem Jahr zaehlen - aus lib/saisonJahre.ts, damit es nur eine Liste gibt. */
function jahrSaisons() {
  const quelle = fs.readFileSync(path.join(process.cwd(), 'lib', 'saisonJahre.ts'), 'utf8');
  const raus = {};
  for (const m of quelle.matchAll(/(\d{4}):\s*\[([^\]]*)\]/g)) {
    raus[m[1]] = [...m[2].matchAll(/'(S\d+)'/g)].map((x) => x[1]);
  }
  return raus;
}

function wege(saisons) {
  const raus = [
    // Zuerst die Akten je Spieler und die Summen ueber das ganze Archiv -
    // davon lebt jedes Profil bei Vercel.
    '/api/szene-stats?ansicht=akten',
    '/api/szene-stats?ansicht=start',
    // Das Jahr - ueber alle Saisons, mit Preisgeld.
    `/api/szene-stats?ansicht=jahr&jahr=${new Date().getUTCFullYear()}`,
    '/api/szene-stats?ansicht=jahr&jahr=alle',
    // Die Startseite: die fuenf mit dem meisten Preisgeld dieses Jahres.
    `/api/szene-stats?ansicht=jahr&jahr=${new Date().getUTCFullYear()}&kurz=1`,
    '/api/szene-stats?ansicht=jahr&jahr=alle&kurz=1',
    '/api/szene-stats?ansicht=jahr&jahr=2025',
    '/api/szene-stats?ansicht=jahr&jahr=2024',
    // Die Jahre vor dem Archiv der Szene - nur Preisgeld, aus der Verdienst-Akte.
    '/api/szene-stats?ansicht=jahr&jahr=2023',
    '/api/szene-stats?ansicht=jahr&jahr=2022',
    '/api/szene-stats?ansicht=jahr&jahr=2021',
    '/api/szene-stats?ansicht=jahr&jahr=2020',
    '/api/szene-stats?ansicht=jahr&jahr=2019',
    // Die ganze Preisgeldliste je Jahr - hinter dem Plus, hundert je Seite.
    '/api/szene-stats?ansicht=jahr&jahr=alle&liste=verdienst',
    ...[2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
      .map((j) => `/api/szene-stats?ansicht=jahr&jahr=${j}&liste=verdienst`),
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
  /*
   * Die Jahresansicht in allen Spielarten: je Jahr, je Region, je Saison
   * des Jahres. Ohne das rechnete Vercel "2025 · NAC" beim ersten Klick
   * ueber dreihundert Dateien - der Betreiber: "es ist noch laggy, bis ich
   * 2025 sehe."
   */
  /*
   * Alle Jahre und alle ihre Saisons (lib/saisonJahre.ts), nicht nur die
   * mit Werten der Szene: seit den Team-Eliminierungen aus Epics
   * Bestenlisten haben auch 2019 bis 2023 und die Saisons ohne Archiv
   * (S28, S29, S32, S35, S38) etwas zu zeigen - und die Seite bietet jede
   * Saison eines Jahres zur Wahl an. Was hier fehlt, meldet Vercel als
   * "noch nicht vorgerechnet".
   */
  const JAHRE = jahrSaisons();
  for (const [jahr, sais] of Object.entries(JAHRE)) {
    for (const sa of sais) raus.push(`/api/szene-stats?ansicht=jahr&jahr=${jahr}&saison=${sa}`);
    for (const r of REGIONEN) {
      raus.push(`/api/szene-stats?ansicht=jahr&jahr=${jahr}&region=${r}`);
      for (const sa of sais) raus.push(`/api/szene-stats?ansicht=jahr&jahr=${jahr}&region=${r}&saison=${sa}`);
    }
  }
  for (const r of REGIONEN) raus.push(`/api/szene-stats?ansicht=jahr&jahr=alle&region=${r}`);
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
  // Das Preisgeld der Spieler der E-Sports-Organisationen (app/api/orgs) -
  // ganz vorn: es braucht Sekunden, stand es am Ende, erreichte der Lauf es
  // nie (26.9.2026, Zeitgrenze in der letzten Portion).
  raus.unshift('/api/orgs?ansicht=verdienst');
  return raus;
}

/**
 * Die Profile, die jemand als Erstes oeffnet: alle aus den Listen der
 * Startansicht und die Preisgeldliste des Jahres.
 *
 * Ein Profil, das noch nicht in der Ablage liegt, braucht bei Vercel zehn
 * bis dreissig Sekunden - der Betreiber: "die Spielerprofile laden noch
 * immer viel zu lange." Hier, mit Dateien auf der Platte, sind es Sekunden
 * je Profil; danach liest Vercel nur noch.
 */
async function profileDerListen() {
  const ids = new Set();
  try {
    const start = await (await fetch(`${SERVER}/api/szene-stats?ansicht=start`)).json();
    for (const l of start.listen ?? []) for (const p of l.plaetze ?? []) if (p.epicId) ids.add(p.epicId);
    for (const g of start.profile ?? []) for (const p of g.spieler ?? []) if (p.epicId) ids.add(p.epicId);
  } catch { /* dann ohne */ }
  try {
    const jahr = await (await fetch(`${SERVER}/api/szene-stats?ansicht=jahr&jahr=${new Date().getUTCFullYear()}`)).json();
    for (const l of jahr.listen ?? []) for (const p of (l.plaetze ?? []).slice(0, 100)) if (p.epicId) ids.add(p.epicId);
  } catch { /* dann ohne */ }
  // Und die Spieler der Organisationen - ein Klick dort fuehrt ins Profil.
  try {
    const orgs = await (await fetch(`${SERVER}/api/orgs`)).json();
    for (const o of orgs.orgs ?? []) for (const sp of o.spieler ?? []) if (sp.epicId) ids.add(sp.epicId);
  } catch { /* dann ohne */ }
  return [...ids].map((id) => `/api/szene-stats?spieler=${id}`);
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
  /*
   * In Portionen ("--teil=2/4"): der Server waechst mit jeder Antwort und
   * lief am 26.9.2026 nach rund 390 Abfragen bei zehn Gigabyte voll. Der
   * Ablauf startet ihn zwischen den Portionen neu; die Profile kommen mit
   * der letzten, wenn alle Listen liegen.
   */
  const teilArg = process.argv.find((a) => /^--teil=\d+\/\d+$/.test(a));
  const [teil, teile] = teilArg ? teilArg.slice(7).split('/').map(Number) : [1, 1];
  const alle = wege(s);
  const je = Math.ceil(alle.length / teile);
  const liste = alle.slice((teil - 1) * je, teil * je);
  console.log(`  Saisons: ${s.length ? s.join(', ') : '(keine gefunden)'}`);
  console.log(`  Abfragen: ${liste.length}${teile > 1 ? ` (Teil ${teil} von ${teile}, zusammen ${alle.length})` : ''}`);
  console.log('');

  let ok = 0;
  let schief = 0;
  for (const weg of liste) {
    const start = Date.now();
    try {
      /*
       * Drei Minuten Geduld je Abfrage. Frueher waren es zehn - ein Abbruch
       * schien schlimmer als Warten. Am 26.9.2026 hielten aber wenige
       * haengende Abfragen die letzte Portion bis in die Zeitgrenze auf, und
       * alles danach fehlte. Eine fehlende Antwort rechnet spaeter der erste
       * Besucher; eine verlorene Portion niemand.
       */
      const r = await fetch(SERVER + weg, {
        // Drei Minuten: eine haengende Abfrage hielt sonst die ganze
        // letzte Portion bis in die Zeitgrenze auf.
        signal: AbortSignal.timeout(180_000),
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

  /*
   * Danach die Profile - nachdem die Listen liegen, aus denen sie kommen.
   * Vier nebeneinander: einzeln waren es bei sechshundert Profilen eine
   * Viertelstunde, so ein paar Minuten.
   */
  const profile = teil === teile ? await profileDerListen() : [];
  console.log(`  Profile: ${profile.length}`);
  let profileOk = 0;
  for (let i = 0; i < profile.length; i += 4) {
    await Promise.all(profile.slice(i, i + 4).map(async (weg) => {
      try {
        const r = await fetch(SERVER + weg, { signal: AbortSignal.timeout(120_000) });
        await r.arrayBuffer();
        if (r.ok) profileOk += 1; else schief += 1;
      } catch { schief += 1; }
    }));
    if ((i + 4) % 100 === 0) console.log(`  ... ${Math.min(i + 4, profile.length)}/${profile.length} Profile`);
  }
  ok += profileOk;

  console.log('');
  console.log(`  Vorgerechnet: ${ok}   gescheitert: ${schief}`);
  console.log('');
  // Ein gescheiterter Vorlauf ist kein Grund, den ganzen Ablauf rot zu
  // faerben: die Daten sind trotzdem erneuert, und die fehlende Antwort
  // rechnet der erste Besucher aus.
}

await los();
