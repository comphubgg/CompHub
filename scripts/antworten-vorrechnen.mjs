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
    // Zuerst die Akten je Spieler und die Summen ueber das ganze Archiv -
    // davon lebt jedes Profil bei Vercel.
    '/api/szene-stats?ansicht=akten',
    '/api/szene-stats?ansicht=start',
    // Das Jahr - ueber alle Saisons, mit Preisgeld.
    `/api/szene-stats?ansicht=jahr&jahr=${new Date().getUTCFullYear()}`,
    '/api/szene-stats?ansicht=jahr&jahr=alle',
    '/api/szene-stats?ansicht=jahr&jahr=2025',
    '/api/szene-stats?ansicht=jahr&jahr=2024',
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
  const JAHRE = { 2026: ['S39', 'S40', 'S41', 'S42'], 2025: ['S33', 'S34', 'S36', 'S37'], 2024: ['S30', 'S31'] };
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

  /*
   * Danach die Profile - nachdem die Listen liegen, aus denen sie kommen.
   * Vier nebeneinander: einzeln waren es bei sechshundert Profilen eine
   * Viertelstunde, so ein paar Minuten.
   */
  const profile = await profileDerListen();
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
