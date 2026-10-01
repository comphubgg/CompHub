import { NextResponse } from 'next/server';
import { schickeAlarm } from '@/lib/discord';

/*
 * Nimmt Fehlermeldungen aus dem Browser entgegen und reicht sie an #admin-alarm.
 *
 * Gegenstueck zu app/components/Fehlerfaenger.tsx. Es wird nichts gespeichert,
 * nur weitergegeben - die Ablage (Supabase) bleibt dem vorbehalten, was
 * Nutzer und Betreiber schreiben.
 *
 * Schutz gegen Fluten: derselbe Fehler (gleiche Nachricht und Quelle) hoechstens
 * einmal je Stunde, insgesamt hoechstens zwanzig Meldungen je Stunde. Alles
 * ueber den Grenzen wird still verworfen; der Server antwortet immer mit 204,
 * damit ein Besucher nie etwas von der Meldung merkt.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STUNDE = 60 * 60_000;
const zuletzt = new Map<string, number>();
let fensterStart = Date.now();
let imFenster = 0;

const kuerze = (x: unknown, n: number) => (typeof x === 'string' ? x.slice(0, n) : '');

export async function POST(request: Request) {
  const leer = new NextResponse(null, { status: 204 });
  let k: Record<string, unknown>;
  try { k = await request.json(); } catch { return leer; }
  const nachricht = kuerze(k.nachricht, 300);
  if (!nachricht) return leer;
  const quelle = kuerze(k.quelle, 200);

  const jetzt = Date.now();
  if (jetzt - fensterStart > STUNDE) { fensterStart = jetzt; imFenster = 0; }
  if (imFenster >= 20) return leer;
  const schluessel = `${nachricht}|${quelle}`;
  if (jetzt - (zuletzt.get(schluessel) ?? 0) < STUNDE) return leer;
  zuletzt.set(schluessel, jetzt);
  if (zuletzt.size > 500) for (const [s, t] of zuletzt) if (jetzt - t > STUNDE) zuletzt.delete(s);
  imFenster += 1;

  const zeilen = [
    `**${nachricht}**`,
    quelle && `Quelle: \`${quelle}\``,
    `Seite: \`${kuerze(k.seite, 120)}\``,
    `Fenster: ${kuerze(k.fenster, 20)} · ${kuerze(k.browser, 160)}`,
    kuerze(k.spur, 600) && `\`\`\`\n${kuerze(k.spur, 600)}\n\`\`\``,
  ].filter(Boolean).join('\n');
  await schickeAlarm({ titel: 'Fehler bei einem Besucher', text: zeilen }).catch(() => { /* kein Token: nichts zu tun */ });
  return leer;
}
