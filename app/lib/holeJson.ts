/*
 * JSON holen, ohne dass eine langsame Antwort die Startseite leer stehen laesst (Betreiber, 18.11.2026: "die Startseite hing etwa eine Minute -
 * Striche oben, graue Platzhalter in allen Karten. Das darf nie wieder passieren").
 *
 * Gemessen am 18.11.2026: ein Aufruf, der eine 200-340 MB grosse Clutch-Datei vom Release las, hielt die Ereignisschleife des Servers je Datei
 * 2-3 Sekunden an (lib/clutchLive) - in der Zeit antwortete keine Route. Die Seite wartete bis dahin auf ALLE Antworten, bevor eine Karte etwas zeigte,
 * und eine Frist von 20 s (mit zweitem Versuch 40 s) liess die Platzhalter so lange stehen.
 *
 *   - Frist je Versuch und ein zweiter (und dritter) Versuch mit laengerer Frist - eine kurze Stoerung ueberbrueckt sich von selbst.
 *   - Die letzte gute Antwort liegt im Browser (localStorage, "vorrat"): sie steht sofort da, die frische ersetzt sie, sobald sie kommt
 *     (stale-while-revalidate). Ohne Vorrat (erster Besuch) bleibt es beim Platzhalter, bis die erste Antwort kommt.
 *   - Jede Quelle fuer sich: der Aufrufer setzt seine Karte, sobald SEINE Antwort da ist, nicht erst, wenn alle da sind.
 */

const VORSILBE = 'ch-vorrat:';
/** Aelter als das wird ein Vorrat nicht mehr gezeigt - lieber ein Platzhalter als Zahlen von vorgestern. */
const VORRAT_HOECHSTENS_MS = 3 * 864e5;

/** Die zuletzt gute Antwort zu diesem Schluessel aus dem Browser - oder null. Nur im Browser (useEffect) aufrufen. */
export function ausVorrat<T>(schluessel: string): T | null {
  try {
    const roh = window.localStorage.getItem(VORSILBE + schluessel);
    if (!roh) return null;
    const e = JSON.parse(roh) as { zeit?: number; wert?: T };
    if (typeof e.zeit !== 'number' || Date.now() - e.zeit > VORRAT_HOECHSTENS_MS || e.wert === undefined) return null;
    return e.wert;
  } catch { return null; }
}

function inVorrat(schluessel: string, wert: unknown): void {
  try { window.localStorage.setItem(VORSILBE + schluessel, JSON.stringify({ zeit: Date.now(), wert })); } catch { /* voll oder gesperrt - dann ohne */ }
}

const warte = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });

export interface HolArt<T> {
  /** Fristen der Versuche in ms - so viele Versuche wie Eintraege. */
  fristen?: number[];
  /** Unter diesem Schluessel die gute Antwort im Browser ablegen (siehe ausVorrat). */
  vorrat?: string;
  /** Ist die Antwort gut genug zum Ablegen und Zeigen? Sonst zaehlt sie wie ein Fehlschlag (naechster Versuch). */
  gut?: (wert: T) => boolean;
}

/**
 * Holt url als JSON, mit Frist und Wiederholung. Wirft, wenn kein Versuch eine gute Antwort brachte.
 * Standard: 8 s, dann 12 s, dann 20 s, dazwischen 1 s und 3 s Pause - nach spaetestens rund 45 s ist Schluss.
 */
export function holeJson<T>(url: string, art: HolArt<T> = {}): Promise<T> {
  // Fragen zwei Teile der Seite dasselbe zugleich (Startvitrine und Hintergrund: /api/startvitrine), geht nur eine Anfrage hinaus.
  // Nur bei gleichem Vorrat-Schluessel: "gut" und Ablage gehoeren zum Aufrufer.
  const k = `${url}|${art.vorrat ?? ''}`;
  let l = unterwegs.get(k) as Promise<T> | undefined;
  if (!l) {
    l = holeJsonNeu<T>(url, art).finally(() => { unterwegs.delete(k); });
    unterwegs.set(k, l);
  }
  return l;
}

const unterwegs = new Map<string, Promise<unknown>>();

async function holeJsonNeu<T>(url: string, art: HolArt<T>): Promise<T> {
  const fristen = art.fristen ?? [8_000, 12_000, 20_000];
  let fehler: unknown = null;
  for (let i = 0; i < fristen.length; i += 1) {
    if (i > 0) await warte(i === 1 ? 1_000 : 3_000);
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(fristen[i]), cache: 'no-store' });
      if (!r.ok && r.status >= 500) throw new Error(`HTTP ${r.status}`);
      const wert = await r.json() as T;
      if (art.gut && !art.gut(wert)) throw new Error('Antwort ohne Inhalt');
      if (art.vorrat) inVorrat(art.vorrat, wert);
      return wert;
    } catch (e) { fehler = e; }
  }
  throw fehler instanceof Error ? fehler : new Error('nicht erreichbar');
}

/**
 * Erst den Vorrat (sofort), dann die frische Antwort: setz wird bis zu zweimal aufgerufen. Gibt zurueck, ob am Ende etwas gesetzt wurde
 * (aus dem Vorrat oder frisch) - so kann der Aufrufer "nicht erreichbar" nur zeigen, wenn es wirklich nichts gibt.
 */
export async function vorratDannFrisch<T>(url: string, schluessel: string, setz: (wert: T, frisch: boolean) => void,
  art: Omit<HolArt<T>, 'vorrat'> = {}): Promise<boolean> {
  const alt = ausVorrat<T>(schluessel);
  if (alt !== null && (!art.gut || art.gut(alt))) setz(alt, false);
  try {
    setz(await holeJson<T>(url, { ...art, vorrat: schluessel }), true);
    return true;
  } catch {
    return alt !== null;
  }
}
