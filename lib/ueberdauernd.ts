import fs from 'node:fs';
import path from 'node:path';

/*
 * Die letzte gute Antwort ueberdauert den Neustart (Betreiber, 26.10.2026: "die Startseite laedt zu lange" / "Not reachable right now").
 *
 * Nach jedem Veroeffentlichen startet der Server leer. Die ersten Besucher warteten dann bis zu 40 Sekunden auf die Schaukaesten der Startseite - lange genug, dass
 * Cloudflares Lastverteiler 502/504 zurueckgab und die Karten "nicht erreichbar" zeigten. Die Antworten aendern sich aber nur langsam; es genuegt, die letzte gute
 * sofort zu zeigen und im Hintergrund eine frische zu rechnen.
 *
 *   ueberdauernd('startvitrine', 10 * 60_000, 24 * 3600_000, () => rechnen())
 *
 *   - Antwort im Speicher juenger als frischMs: gleich zurueck
 *   - sonst eine letzte Antwort da (Speicher oder Platte, hoechstens standMs alt): die kommt sofort, im Hintergrund wird neu gerechnet (nur einmal zugleich)
 *   - sonst wird gerechnet und gewartet
 * Rechnen darf null liefern ("nichts Gutes") - das ueberschreibt nichts. Auf einem Host ohne beschreibbare Platte bleibt es beim Speicher.
 */

const ORDNER = path.join(process.cwd(), 'data', '.zuletzt');
const speicher = new Map<string, { wert: unknown; zeit: number }>();
const laufend = new Map<string, Promise<unknown>>();

/*
 * Ohne den PC daheim (29.10.2026, Betreiber: "alles muss ohne meinen PC laufen"). Die Ausweichseite bei Netlify faengt jede Anfrage leer an und bricht nach
 * Sekunden ab - Startseite, FNCS und Maps liefen dort in die Frist. Deshalb liegt die letzte gute Antwort zusaetzlich unter antworten/zuletzt_<Schluessel>.json:
 * der Stundenlauf rechnet sie vor (scripts/antworten-vorrechnen.mjs) und laedt sie ans Release; wo weder Speicher noch Platte etwas haben, wird sie von dort
 * gelesen. Auf einem Host ohne Dauerbetrieb (Netlify, AWS Lambda) wird danach nicht im Hintergrund nachgerechnet - die Funktion endet mit der Antwort, und
 * die Rechnung kostete nur Punkte.
 */
const ohneDauerbetrieb = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY || process.env.VERCEL);
const ablageName = (schluessel: string) => `antworten/zuletzt_${schluessel.replace(/[^a-z0-9_-]/gi, '_')}.json`;

async function vonAblage(schluessel: string): Promise<{ wert: unknown; zeit: number } | null> {
  try {
    const { liesJson } = await import('@/lib/ablage');
    const roh = await Promise.race([
      liesJson<{ zeit?: number; wert?: unknown } | null>(ablageName(schluessel), null),
      new Promise<null>((r) => { setTimeout(() => r(null), 8_000); }),
    ]);
    return roh && typeof roh.zeit === 'number' && roh.wert !== undefined ? { wert: roh.wert, zeit: roh.zeit } : null;
  } catch { return null; }
}

function vonPlatte(schluessel: string): { wert: unknown; zeit: number } | null {
  try {
    const datei = path.join(ORDNER, `${schluessel.replace(/[^a-z0-9_-]/gi, '_')}.json`);
    const roh = JSON.parse(fs.readFileSync(datei, 'utf8')) as { zeit?: number; wert?: unknown };
    return typeof roh.zeit === 'number' && roh.wert !== undefined ? { wert: roh.wert, zeit: roh.zeit } : null;
  } catch { return null; }
}

function aufPlatte(schluessel: string, eintrag: { wert: unknown; zeit: number }) {
  try {
    fs.mkdirSync(ORDNER, { recursive: true });
    fs.writeFileSync(path.join(ORDNER, `${schluessel.replace(/[^a-z0-9_-]/gi, '_')}.json`), JSON.stringify(eintrag));
  } catch { /* kein beschreibbarer Ort - dann nur der Speicher */ }
  // Im Stundenlauf (Ordner data/antworten vorhanden) auch als Antwort fuer das Release - siehe oben.
  try {
    const antworten = path.join(process.cwd(), 'data', 'antworten');
    if (fs.existsSync(antworten)) fs.writeFileSync(path.join(process.cwd(), 'data', ablageName(schluessel)), JSON.stringify(eintrag));
  } catch { /* nur ein Zusatz */ }
}

export async function ueberdauernd<T>(schluessel: string, frischMs: number, standMs: number, rechnen: () => Promise<T | null>): Promise<T | null> {
  const da = speicher.get(schluessel);
  if (da && Date.now() - da.zeit < frischMs) return da.wert as T;

  const neu = () => {
    let l = laufend.get(schluessel);
    if (!l) {
      l = rechnen()
        .then((wert) => {
          if (wert !== null && wert !== undefined) {
            const eintrag = { wert, zeit: Date.now() };
            speicher.set(schluessel, eintrag);
            aufPlatte(schluessel, eintrag);
          }
          return wert;
        })
        .finally(() => { laufend.delete(schluessel); });
      laufend.set(schluessel, l);
    }
    return l as Promise<T | null>;
  };

  const alt = da ?? vonPlatte(schluessel);
  if (alt && Date.now() - alt.zeit < standMs) {
    if (!da) speicher.set(schluessel, alt);
    // Im Hintergrund frisch rechnen; ein Fehler dort ist nicht der des Besuchers.
    void neu().catch(() => { /* die alte bleibt */ });
    return alt.wert as T;
  }
  // Weder Speicher noch Platte: die vorgerechnete vom Release (bis zu einer Woche alt - besser als eine leere Seite).
  const abgelegt = await vonAblage(schluessel);
  if (abgelegt && Date.now() - abgelegt.zeit < Math.max(standMs, 7 * 864e5)) {
    speicher.set(schluessel, abgelegt);
    if (!ohneDauerbetrieb) void neu().catch(() => { /* die abgelegte bleibt */ });
    return abgelegt.wert as T;
  }
  return neu();
}
