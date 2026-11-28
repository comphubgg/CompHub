/*
 * Gemeinsames fuer die drei Community-Schnittstellen des neuen Hubs (27.11.2026):
 *
 *   /api/fn-inseln     Titel, Bild und Ersteller zu Insel-Codes und Epics eigenen Modi  (lib/fnInseln)
 *   /api/fn-entdecken  was Fortnites "Entdecken" gerade zeigt, mit Spielerzahlen        (lib/fnEntdecken)
 *   /api/fn-spieler    das Profil eines Spielers ausserhalb der Turniere                (lib/fnSpieler)
 *
 * Warum Epics eigene Dienste und nicht die oeffentliche Daten-Schnittstelle (api.fortnite.com/ecosystem): die kennt weder Vorschaubilder noch
 * Epics eigene Modi (Battle Royale, Reload, OG ...) und zaehlt Spieler nur im Nachhinein. Die Dienste hier sind dieselben, die das Spiel fragt -
 * mit dem Zugang, den die Seite fuer die Cups ohnehin haelt (getToken in lib/epicCups).
 *
 * Alle drei lesen nur. Geschrieben wird bei Epic nichts.
 */

import { getToken, verwirfToken } from '@/lib/epicCups';

export interface EpicAntwort<T> {
  status: number;
  /** Die Antwort als JSON - null, wenn sie leer oder kein JSON war. */
  daten: T | null;
  /** Der Anfang der Antwort als Text, fuer Fehlermeldungen. */
  text: string;
}

/**
 * Eine Anfrage an Epic mit dem Zugang der Seite.
 *
 * Anders als req() in lib/epicCups wirft sie bei 204/404 nicht: "Statistik privat" (204) und "Code gibt es nicht" (404) sind hier Antworten,
 * keine Fehler. Bei 401 genau ein zweiter Versuch mit frischem Zugang - derselbe Grund wie dort (ein Token, das Epic vor der Zeit verwirft).
 */
export async function epicAbruf<T = unknown>(
  url: string,
  opts: { method?: 'GET' | 'POST'; body?: unknown; kopf?: Record<string, string>; ms?: number } = {},
  nochmal = true,
): Promise<EpicAntwort<T>> {
  const { token } = await getToken();
  const res = await fetch(url, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    headers: {
      Authorization: token,
      ...(opts.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(opts.kopf ?? {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: 'no-store',
    signal: AbortSignal.timeout(opts.ms ?? 15_000),
  });
  if (res.status === 401 && nochmal) {
    verwirfToken();
    return epicAbruf<T>(url, opts, false);
  }
  const text = res.status === 204 ? '' : await res.text();
  let daten: T | null = null;
  if (text) { try { daten = JSON.parse(text) as T; } catch { /* kein JSON - bleibt null */ } }
  return { status: res.status, daten, text: text.slice(0, 300) };
}

/** Was Epic als Fehler meldet, in einem Satz und ohne Adresse (in der steht bei manchen Diensten die Konto-Id). */
export function epicFehler(a: EpicAntwort<unknown>): string {
  const d = a.daten as { errorMessage?: string; errorCode?: string } | null;
  return `Epic antwortete ${a.status}${d?.errorCode ? ` (${d.errorCode})` : ''}`;
}

/* ------------------------------------------------------------ Zwischenspeicher */

/*
 * Ein eigener Zwischenspeicher, nicht der der Cups (gecacht in lib/epicCups): der haelt hoechstens 600 Eintraege und wirft bei Bedarf die aeltesten
 * hinaus - hunderte Spielerprofile oder Insel-Codes verdraengten dort die Leaderboard-Seiten eines laufenden Cups.
 *
 * Ueber globalThis, weil Next jede Route als eigenes Bauteil laedt (siehe NamenZustand in lib/epicCups): /api/fn-entdecken und /api/fn-inseln
 * sollen sich die aufgeloesten Inseln teilen.
 */
interface Fach { wert: unknown; bis: number; laeuft?: Promise<unknown> }
const SPEICHER: Map<string, Fach> = ((globalThis as { __comphubFnSpeicher?: Map<string, Fach> }).__comphubFnSpeicher ??= new Map());
const HOECHSTENS = 8000;

function aufraeumen() {
  if (SPEICHER.size <= HOECHSTENS) return;
  const jetzt = Date.now();
  for (const [k, v] of SPEICHER) if (!v.laeuft && v.bis <= jetzt) SPEICHER.delete(k);
  for (const k of SPEICHER.keys()) {
    if (SPEICHER.size <= HOECHSTENS) break;
    if (!SPEICHER.get(k)?.laeuft) SPEICHER.delete(k);
  }
}

/** Der abgelegte Wert, solange er gilt - sonst undefined (null ist ein gueltiger Wert: "gibt es nicht"). */
export function gemerkt<T>(schluessel: string): T | undefined {
  const f = SPEICHER.get(schluessel);
  return f && f.bis > Date.now() ? f.wert as T : undefined;
}

export function merke(schluessel: string, wert: unknown, ms: number): void {
  aufraeumen();
  SPEICHER.set(schluessel, { wert, bis: Date.now() + ms });
}

/**
 * Holen oder aus dem Speicher nehmen. Gleichzeitige Anfragen teilen sich einen Abruf; scheitert er, gilt der alte Stand weiter (falls es einen
 * gibt) - alte Zahlen sind besser als keine, wenn Epic kurz nicht antwortet.
 */
export async function mitSpeicher<T>(schluessel: string, ms: number, hole: () => Promise<T>): Promise<T> {
  const f = SPEICHER.get(schluessel);
  if (f && f.bis > Date.now()) return f.wert as T;
  if (f?.laeuft) return f.laeuft as Promise<T>;
  aufraeumen();
  const laeuft = hole()
    .then((wert) => { SPEICHER.set(schluessel, { wert, bis: Date.now() + ms }); return wert; })
    .catch((e) => {
      if (f && f.bis > 0) { SPEICHER.set(schluessel, { wert: f.wert, bis: f.bis }); return f.wert as T; }
      SPEICHER.delete(schluessel);
      throw e;
    });
  SPEICHER.set(schluessel, { wert: f?.wert, bis: f?.bis ?? 0, laeuft });
  return laeuft;
}
