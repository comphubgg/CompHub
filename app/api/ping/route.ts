/*
 * Das Lebenszeichen: zwei Buchstaben, kein Datenverkehr.
 *
 * Der Waechter (scripts/seite-da.mjs) fragt alle fuenf Minuten, ob die Seite da ist. Vorher
 * lud er dafuer die ganze Startseite - 288 Mal am Tag. Der kostenlose Tarif von Render
 * erlaubt im Monat nur fuenf Gigabyte Datenverkehr, und als er aufgebraucht war, wurde der
 * ganze Arbeitsbereich gesperrt (11.10.2026). Jedes Byte zaehlt, auch das der eigenen Pruefung.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET() {
  return new Response('ok', { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
}
