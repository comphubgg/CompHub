/*
 * Fehlversuche bei der Anmeldung zaehlen (31.10.2026).
 *
 * Die Anmeldung mit Name und Zugangsschluessel (/api/auth/vip) und mit Passwort (/api/konto, "anmelden") liess beliebig viele
 * Versuche zu - ein Schluessel mit acht Zeichen, auch der des Admins, liess sich so durchprobieren. Jetzt sperrt eine Kombination
 * aus Anschluss und Name nach fuenf falschen Versuchen fuer fuenfzehn Minuten. Fuer normale Nutzer aendert sich nichts.
 *
 * Gezaehlt wird im Speicher des Servers: auf dem PC ist das ein einziger Vorgang, bei Netlify je Instanz - dort schwaecher, aber
 * ohne Ablage-Schreiben bei jedem Tippfehler. Geantwortet wird mit 400, nie mit 429 (der Lastverteiler wertet 429 als Ausfall).
 */

const GRENZE = 5;
const SPERRE_MS = 15 * 60_000;
const versuche = new Map<string, { n: number; bis: number }>();

/** Der Anschluss hinter Cloudflare - sonst der erste Eintrag der Weiterleitung. */
export function anschlussAus(request: Request): string {
  return (request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]
    ?? request.headers.get('x-real-ip') ?? '').trim();
}

const schluessel = (request: Request, name: string) => `${anschlussAus(request)}|${name.trim().toLowerCase()}`;

/** Gesperrt? Dann die Meldung, sonst null. */
export function gesperrt(request: Request, name: string): string | null {
  const e = versuche.get(schluessel(request, name));
  if (!e || e.n < GRENZE) return null;
  if (Date.now() > e.bis) { versuche.delete(schluessel(request, name)); return null; }
  const min = Math.max(1, Math.ceil((e.bis - Date.now()) / 60_000));
  return `Zu viele falsche Versuche - bitte in ${min} Minute${min === 1 ? '' : 'n'} erneut.`;
}

export function fehlversuch(request: Request, name: string): void {
  const k = schluessel(request, name);
  const e = versuche.get(k);
  const jetzt = Date.now();
  const n = e && jetzt < e.bis ? e.n + 1 : 1;
  versuche.set(k, { n, bis: jetzt + SPERRE_MS });
  // Nicht endlos wachsen lassen.
  if (versuche.size > 5000) for (const [x, v] of versuche) if (jetzt > v.bis) versuche.delete(x);
}

export function erfolg(request: Request, name: string): void {
  versuche.delete(schluessel(request, name));
}
