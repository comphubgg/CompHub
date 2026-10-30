// Was beim Hochfahren des Servers einmal angestossen wird.
//
// Bisher wurden die Power Rankings nur erneuert, wenn jemand die Seite
// aufrief. Das genuegt nicht: ruft an einem Tag niemand die Rangliste auf,
// bleibt der Stand von vorgestern stehen, und der Naechste sieht alte Zahlen,
// ohne es zu merken. Deshalb laeuft die Erneuerung jetzt von selbst - einmal
// taeglich um ein Uhr nachts, wo niemand zusieht und Epic seine Fortschreibung
// laengst geschrieben hat.
//
// Der Aufruf beim Start faengt den Fall ab, dass der Rechner um ein Uhr aus
// war: ist der Stand aelter als der letzte Termin, wird sofort geholt.
//
// Zum selben Termin werden die Einzelwerte der Szene-Quelle nachgeholt -
// dieselbe Ueberlegung, andere Quelle. Danach zwei kleinere Laeufe: die
// Spieltage, zu denen die Quelle noch nichts hat (dort steht wenigstens Platz
// und Mitspieler), und das echte Turnierdatum zu allem Neuen.
//
// Die Turnier-Replays laufen aus der Reihe: stuendlich statt taeglich. Epic
// haelt sie nur einunddreissig Tage vor, und die Cups enden ueber alle
// Zeitzonen verteilt - ein fester Termin traefe immer nur eine Region frisch.
//
// Aus demselben Grund wird stuendlich nach neuen Turnieren gesehen. Ein
// Finale, das am Abend zu Ende ging, stand bis dahin am naechsten Morgen
// noch nicht in der Statistik; jetzt ist es binnen einer Stunde da - erst
// mit Platz und Punkten von Epic, spaeter mit den Einzelwerten der
// Szene-Quelle, sobald die sie veroeffentlicht.

export async function register() {
  // Nur im Node-Prozess, nicht in der Edge-Laufzeit: dort gibt es weder
  // Dateien noch die Moeglichkeit, ein Skript zu starten. Der Node-Teil liegt
  // deshalb in einer eigenen Datei und wird erst hier geholt.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  /*
   * Warum der Server ausfaellt - und dass ein vergessenes catch ihn nicht mehr beendet.
   *
   * Der Waechter (scripts/dauerbetrieb.ps1) meldete seit dem 21.10.2026 alle ein bis drei Stunden "Webserver war weg": die Seiten zeigten dann "not reachable right now",
   * bis er zwei Minuten spaeter wieder stand. Das Protokoll des beendeten Laufs wurde mit dem Neustart ueberschrieben, die Ursache blieb unbekannt. Node beendet sich ab
   * Version 15, wenn irgendwo ein Versprechen ohne catch scheitert (unhandledRejection) - eine einzige Abfrage bei Epic oder GitHub, die ins Leere laeuft, genuegt.
   * Mit diesen Haken laeuft der Server weiter, und jeder Fall steht in server-abstuerze.log (Zeit, Art, Stapel), damit er sich beheben laesst.
   */
  try {
    const { appendFileSync, statSync, readFileSync, writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const datei = join(process.cwd(), 'server-abstuerze.log');
    const schreibe = (art: string, e: unknown) => {
      try {
        if (statSync(datei).size > 400_000) writeFileSync(datei, readFileSync(datei, 'utf8').slice(-150_000));
      } catch { /* noch keine Datei */ }
      try { appendFileSync(datei, `${new Date().toISOString()} ${art}: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}
`); } catch { /* ohne Protokoll weiter */ }
    };
    process.on('unhandledRejection', (e) => schreibe('unhandledRejection', e));
    process.on('uncaughtException', (e) => schreibe('uncaughtException', e));
    process.on('exit', (code) => schreibe('exit', `Code ${code}, Speicher ${Math.round(process.memoryUsage().rss / 1048576)} MB`));
    process.on('SIGTERM', () => schreibe('SIGTERM', 'beendet von aussen'));
  } catch { /* die Haken sind eine Hilfe, kein Muss */ }

  /*
   * Und nicht dort, wo der Vorgang nach der Antwort wieder einschlaeft.
   *
   * Alles hier drin sind Zeitgeber: um ein Uhr die Rangliste, stuendlich die
   * Replays, alle fuenf Minuten der laufende Cup. Das setzt einen Server
   * voraus, der durchlaeuft. Bei Vercel startet je Anfrage eine Umgebung und
   * endet mit ihr - ein Zeitgeber auf eine Stunde liefe dort nie ab, waehrend
   * jeder Kaltstart erneut versuchte, Kindprozesse zu starten, die es dort
   * gar nicht geben kann. Das kostet bei jeder ersten Anfrage Zeit und
   * schreibt Fehler ins Protokoll, ohne je etwas auszurichten.
   *
   * Wo die Seite so laeuft, erledigt die stuendliche GitHub-Aktion dieselbe
   * Arbeit - siehe .github/workflows/daten-erneuern.yml. Auf einem eigenen
   * Rechner bleibt alles wie bisher.
   *
   * COMPHUB_KEIN_HINTERGRUND schaltet es auch von Hand ab, etwa wenn zwei
   * Fassungen nebeneinander laufen und nur eine die Nachtlaeufe machen soll.
   */
  /*
   * Wachhalten auf dem kostenlosen Host.
   *
   * Render legt die Seite nach fuenfzehn Minuten ohne Besuch schlafen; der
   * naechste Besucher wartet dann rund eine Minute. Der Ping aus dem
   * GitHub-Ablauf "Discord live" sollte das verhindern, aber GitHub laesst
   * geplante Laeufe unter Last ausfallen (am 28.9.2026 sieben Stunden lang
   * keiner) - der Betreiber: "die Player-Stats ... laden ziemlich, ziemlich
   * lange". Der Server ruft deshalb selbst alle zehn Minuten seine
   * oeffentliche Adresse auf; das kommt ueber Cloudflare als Besuch bei
   * Render an. Eine Anfrage, zwanzig Byte.
   */
  const wach = process.env.COMPHUB_WACH_URL;
  if (wach) {
    const ping = () => { void fetch(`${wach}?wach=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(30_000) }).catch(() => {}); };
    setInterval(ping, 10 * 60_000).unref?.();
  }

  /*
   * Aufwaermen nach jedem Start.
   *
   * Das erste Profil nach einem Neustart brauchte am 29.9.2026 46 Sekunden,
   * jedes weitere fuenf: erst muessen die grossen Listen (Gesamtsumme aller
   * Spieler, Tagesbeste, Heimatregionen, Spielerliste der Quelle) vom
   * Release geholt und gelesen werden. Das erledigt jetzt der Server selbst,
   * kurz nach dem Start, statt dass der erste Besucher davor wartet. Danach
   * die Uebersichten, die fast jeder zuerst oeffnet.
   */
  // Ohne eigene Angabe gilt im Betrieb (next start) der eigene Anschluss - der PC-Server laeuft auf 3100 (PORT), damit das Verzeichnis der Maps schon beim Start entsteht.
  const intern = process.env.COMPHUB_INTERN_URL || (process.env.NODE_ENV === 'production' ? `http://127.0.0.1:${process.env.PORT || 3100}` : '');
  if (intern) {
    /*
     * Zuerst, was die Startseite braucht - gleichzeitig, nicht der Reihe nach (Betreiber, 26.10.2026: "die Homepage laedt allgemein ein bisschen zu lange"): nach jedem Neustart
     * brauchte der erste Besucher sechzehn Sekunden fuer die Schaukaesten. Danach die uebrigen Uebersichten nacheinander.
     */
    const rufe = (weg: string) => fetch(`${intern}${weg}`, { cache: 'no-store', signal: AbortSignal.timeout(180_000) }).catch(() => {});
    const aufwaermen = async () => {
      await Promise.all([
        '/api/startvitrine',
        '/api/globals-solos?region=EU&kurz=1',
        '/api/cup-catalog?modus=alle',
        '/api/szene-stats?spieler=02c93e4588f241baa6cb5040632326b4',
      ].map(rufe));
      for (const weg of ['/api/maps-liste', '/api/fncs-ereignisse', '/api/globals-solos?region=EU']) await rufe(weg);
    };
    setTimeout(() => { void aufwaermen(); }, 4_000).unref?.();

    /*
     * Bestenlisten vorbauen (Betreiber, 30.10.2026: "13 Sekunden?! Maximal 3 ... bei anderen Webseiten geht das schneller"). Die ganze Liste eines
     * Spieltags (bis 10.000 Plaetze, hundert Seiten bei Epic) zu holen dauert gut zehn Sekunden - das soll nie ein Besucher abwarten. Der Server haelt
     * deshalb selbst fertig auf der Platte (app/api/cup-leaderboard, ganz=1): jede laufende Liste hoechstens drei Minuten alt, jede in den letzten
     * 31 Tagen beendete einmal nach ihrem Ende (gepackt, rund 1,3 MB je Spieltag). Der Besucher bekommt sie dann in Bruchteilen einer Sekunde.
     */
    let baut = false;
    const vorbauen = async () => {
      if (baut) return;
      baut = true;
      try {
        const kat = await fetch(`${intern}/api/cup-catalog?modus=alle`, { cache: 'no-store', signal: AbortSignal.timeout(120_000) }).then((r) => r.json()) as {
          cups?: Array<{ regionen?: Record<string, Array<{ eventId: string; windowId: string; status?: string; end?: number }>> }>;
        };
        const jetzt = Date.now();
        const ziele: Array<{ eventId: string; windowId: string; ab: number; live: boolean }> = [];
        for (const cup of kat.cups ?? []) {
          for (const liste of Object.values(cup.regionen ?? {})) {
            for (const w of liste) {
              if (w.status === 'live') ziele.push({ eventId: w.eventId, windowId: w.windowId, ab: jetzt - 3 * 60_000, live: true });
              else if (w.status === 'vorbei' && (w.end ?? 0) > jetzt - 31 * 864e5 && (w.end ?? 0) + 10 * 60_000 < jetzt) {
                ziele.push({ eventId: w.eventId, windowId: w.windowId, ab: (w.end ?? 0) + 10 * 60_000, live: false });
              }
            }
          }
        }
        // Laufende zuerst, dann das zuletzt Beendete.
        ziele.sort((a, b) => Number(b.live) - Number(a.live) || b.ab - a.ab);
        let i = 0;
        await Promise.all(Array.from({ length: 2 }, async () => {
          while (i < ziele.length) {
            const z = ziele[i++];
            await rufe(`/api/cup-leaderboard?event=${encodeURIComponent(z.eventId)}&window=${encodeURIComponent(z.windowId)}&ganz=1&vorbauen=1&ab=${Math.round(z.ab)}`);
          }
        }));
      } catch { /* naechster Takt */ } finally { baut = false; }
    };
    setTimeout(() => { void vorbauen(); }, 60_000).unref?.();
    setInterval(() => { void vorbauen(); }, 60_000).unref?.();
  }

  if (process.env.VERCEL || process.env.COMPHUB_KEIN_HINTERGRUND) {
    console.log(
      'Hintergrundlaeufe aus - hier laeuft kein durchgehender Vorgang. '
      + 'Die Daten erneuert die stuendliche GitHub-Aktion.');
    return;
  }

  const { starteHintergrund } = await import('./instrumentation.node');
  await starteHintergrund();
}
