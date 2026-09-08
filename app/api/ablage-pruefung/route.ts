import { NextResponse } from 'next/server';
import { speicher } from '@/lib/ablage';
import { DATEN_ORT } from '@/lib/datenOrt';

/*
 * Woher holt diese Seite gerade ihre Daten - und kommt sie dort an?
 *
 * Beim Umzug zu Vercel stand die Seite fertig da, aber alle Zahlen waren
 * null: Startseite 0 Spieltage, Rangliste 0 Spieler, Events "no cups". Von
 * aussen sieht das aus wie ein Fehler in der Anwendung. Tatsaechlich gibt es
 * dafuer zwei ganz verschiedene Gruende, und man kann sie am Bildschirm nicht
 * auseinanderhalten:
 *
 *   - Der Schalter COMPHUB_ABLAGE steht nicht auf "supabase". Dann sucht die
 *     Anwendung ihre Daten in einem Ordner, den es dort nicht gibt, findet
 *     nichts und antwortet mit leeren Listen - ohne Fehler, denn "die Datei
 *     fehlt" ist fuer sie ein gewoehnlicher Zustand.
 *   - Der Schalter steht richtig, aber Supabase antwortet nicht.
 *
 * Diese Auskunft trennt die beiden Faelle. Sie nennt keinen Schluessel, keine
 * Adresse und keinen Inhalt - nur, welcher Speicher gilt, ob eine bekannte
 * Datei ankommt und wie gross sie ist. Damit laesst sie sich gefahrlos
 * oeffentlich abrufen, und genau das ist der Sinn: waehrend eines Umzugs
 * kommt man an die Protokolle des Anbieters oft nicht heran.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Dateien, an denen sich zeigt, ob die Ablage wirklich antwortet. */
const PROBEN = [
  'konten.json',
  'spieler-namen.json',
  'cup-archiv.json',
  'epic-auth.json',
  'tierlists.json',
];

/**
 * Kommt der Mailversand von hier aus durch?
 *
 * Geprueft wird mit "verify" - das baut die Verbindung auf und meldet sich an,
 * verschickt aber nichts. Genau das ist die Frage: ein serverloser Dienst darf
 * nicht selbstverstaendlich nach draussen auf Port 465, und ob er darf, sieht
 * man erst, wenn es jemand versucht. Ein Testbrief waere dafuer der falsche
 * Weg - er landete in einem echten Postfach.
 */
async function mailPruefen() {
  const { versandDa, pruefeVerbindung } = await import('@/lib/mail');
  if (!versandDa()) return { eingerichtet: false, verbindung: null, fehler: null };
  try {
    await pruefeVerbindung();
    return { eingerichtet: true, verbindung: true, fehler: null };
  } catch (e) {
    return { eingerichtet: true, verbindung: false, fehler: (e as Error).message };
  }
}

export async function GET(request: Request) {
  const mitMail = new URL(request.url).searchParams.has('mail');
  const gewaehlt = (process.env.COMPHUB_ABLAGE || '(nicht gesetzt)').toLowerCase();
  const beginn = Date.now();

  const proben: Array<{ name: string; da: boolean; groesse: number | null }> = [];
  let fehler: string | null = null;

  try {
    for (const name of PROBEN) {
      const a = await speicher.angaben(name);
      proben.push({ name, da: Boolean(a), groesse: a ? a.groesse : null });
    }
  } catch (e) {
    fehler = (e as Error).message;
  }

  const gefunden = proben.filter((p) => p.da).length;

  return NextResponse.json({
    speicher: gewaehlt,
    ...(mitMail ? { mail: await mailPruefen() } : {}),
    /*
     * Der Ordner steht nur zur Einordnung dabei. Bei Vercel ist er
     * bedeutungslos - dort dient er allein als Bezugspunkt, um aus einem
     * Pfad einen Namen zu machen.
     */
    datenordner: DATEN_ORT,
    aufVercel: Boolean(process.env.VERCEL),
    supabaseEingerichtet: Boolean(
      (process.env.SUPABASE_URL || process.env.STORAGE_URL)
      && (process.env.SUPABASE_SERVICE_ROLE_KEY
        || process.env.STORAGE_SERVICE_ROLE_KEY)),
    proben,
    gefunden: `${gefunden} von ${PROBEN.length}`,
    dauerMs: Date.now() - beginn,
    fehler,
    urteil: fehler
      ? 'Der Speicher antwortet nicht - siehe "fehler".'
      : gefunden === PROBEN.length
        ? 'Alles in Ordnung: die Ablage antwortet und die Daten sind da.'
        : gefunden === 0
          ? (gewaehlt === 'supabase'
            ? 'Supabase ist eingestellt, liefert aber nichts. Stimmen URL und Schluessel?'
            : 'Es wird im Datenordner gesucht. Bei Vercel gibt es den nicht - '
              + 'COMPHUB_ABLAGE muss auf "supabase" stehen, und danach muss '
              + 'einmal neu aufgespielt werden.')
          : 'Nur ein Teil der Daten ist da.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
