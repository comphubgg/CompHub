import fs from '@/lib/ablageFs';

/*
 * Eine Wache je Datei - geteilt von allen offenen Leitungen.
 *
 * Die Live-Leitungen (Chat, Turnierkarte) sahen frueher jede fuer sich
 * nach: alle 250 bis 300 ms ein Blick auf den Zeitstempel, und der liegt in
 * Supabase - also eine Datenbankabfrage. Jeder offene Tab eines angemeldeten
 * Besuchers hielt so 200 Abfragen in der Minute am Laufen, auch bei
 * geschlossenem Chat; jeder Zuschauer einer Karte las nach jeder Aenderung
 * die ganze Kartendatei selbst. Wurde Supabase langsam, stapelten sich die
 * Blicke, weil keiner auf den vorigen wartete. Am 24.9.2026 stand das
 * Projekt "Comphub 2" (kleinste Stufe) deshalb als "Unhealthy" still, und
 * mit ihm Anmeldung und Konten.
 *
 * Jetzt gibt es je Datei und Instanz genau eine Wache:
 *   - ein Blick im Takt, gleich wie viele zusehen;
 *   - nie zwei Blicke zugleich - antwortet die Ablage langsam, wird eben
 *     seltener gesehen, statt nachzulegen;
 *   - der Inhalt wird je Aenderung einmal gelesen und an alle verteilt
 *     (liesGeteilt).
 * Sieht niemand mehr zu, endet die Wache.
 */

type Abonnent = (stempel: number) => void;

interface Wache {
  abonnenten: Set<Abonnent>;
  stempel: number;
  uhr: ReturnType<typeof setInterval> | null;
  laeuft: boolean;
}

const wachen = new Map<string, Wache>();

/**
 * Auf Aenderungen einer Datei horchen.
 *
 * Der Abonnent hoert den aktuellen Zeitstempel sofort, sofern die Wache ihn
 * schon kennt, und danach jede Aenderung. Zurueck kommt die Abmeldung.
 * Der Takt gilt je Datei; es zaehlt der des ersten Zuhoerers.
 */
export function beobachte(pfad: string, taktMs: number, abonnent: Abonnent): () => void {
  let w = wachen.get(pfad);
  if (!w) {
    w = { abonnenten: new Set(), stempel: -1, uhr: null, laeuft: false };
    wachen.set(pfad, w);
  }
  const wache = w;
  wache.abonnenten.add(abonnent);
  if (wache.stempel >= 0) abonnent(wache.stempel);

  if (!wache.uhr) {
    const schau = async () => {
      if (wache.laeuft) return;
      wache.laeuft = true;
      try {
        const s = (await fs.stat(pfad)).mtimeMs;
        if (s !== wache.stempel) {
          wache.stempel = s;
          for (const a of [...wache.abonnenten]) a(s);
        }
      } catch { /* Ablage gerade weg oder Datei im Schreiben: naechster Takt */ }
      finally { wache.laeuft = false; }
    };
    wache.uhr = setInterval(() => { void schau(); }, taktMs);
    void schau();
  }

  return () => {
    wache.abonnenten.delete(abonnent);
    if (!wache.abonnenten.size) {
      if (wache.uhr) clearInterval(wache.uhr);
      wache.uhr = null;
      wachen.delete(pfad);
    }
  };
}

const inhalte = new Map<string, { stempel: number; wert: Promise<unknown> }>();

/**
 * Den Inhalt einer JSON-Datei zu einem Zeitstempel - einmal gelesen, fuer
 * alle. Fragen zwanzig Leitungen zugleich, geht trotzdem nur eine Anfrage
 * hinaus.
 */
export function liesGeteilt<T>(pfad: string, stempel: number): Promise<T> {
  const da = inhalte.get(pfad);
  if (da && da.stempel === stempel) return da.wert as Promise<T>;
  const wert = fs.readFile(pfad, 'utf8').then((t) => JSON.parse(String(t)) as T);
  inhalte.set(pfad, { stempel, wert });
  // Ein Fehlschlag soll nicht haengen bleiben: beim naechsten Mal neu lesen.
  wert.catch(() => { if (inhalte.get(pfad)?.wert === wert) inhalte.delete(pfad); });
  return wert;
}
