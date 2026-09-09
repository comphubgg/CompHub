import path from 'path';
import { NextResponse } from 'next/server';
import fs from '@/lib/ablageFs';
import { DATEN_ORT } from '@/lib/datenOrt';

/*
 * Die eigenen Werte aus den Replays, die auf einem Rechner lagen.
 *
 * ---------------------------------------------------------------- Warum
 *
 * Epic veroeffentlicht zu einem Turniermatch nur Platz, Eliminierungen,
 * Lebenszeit und Siege. Schaden, Trefferquote und Material stehen dort
 * nirgends - nachgemessen an sechs Cup-Arten.
 *
 * Die Szene-Quelle veroeffentlicht sie, aber nur fuer die Cups, die sie
 * abdeckt: fuer die laufende Saison sind das in Europa vier Spieltage
 * (Division 1 Finals und Performance Evaluation), nachgesehen in ihrem
 * eigenen Verzeichnis. Division 2 bis 5, Reload, Ranked und die Skin-Cups
 * fehlen dort ganz.
 *
 * Bleibt das Replay, das Fortnite auf dem eigenen Rechner ablegt. Darin
 * stehen die vollen Werte - allerdings nur fuer den, der es aufgezeichnet
 * hat. scripts/eigene-replays.mjs loest sie heraus, und diese Route gibt
 * sie zurueck.
 *
 * ------------------------------------------------------------ Der Umfang
 *
 * Zurueck kommt alles, was vorliegt, geordnet nach Konto und Sitzung. Das
 * sind ein paar hundert Byte je Match und im Ganzen wenige Dutzend
 * Kilobyte; wer welche Runde meint, entscheidet die Seite anhand der
 * Sitzungskennungen ihres Spieltags. Ein Filter nach Fenster waere hier
 * nicht moeglich, ohne dieselbe Bestenliste noch einmal zu holen, die die
 * Seite ohnehin schon hat.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface EigenesMatch {
  sitzung?: string;
  konto?: string;
  name?: string | null;
  werte?: Record<string, number | null>;
}

export async function GET() {
  const wurzel = path.join(DATEN_ORT, 'eigene-matches');
  const raus: Record<string, Record<string, Record<string, number | null>>> = {};
  const namen: Record<string, string> = {};

  let konten: string[];
  try {
    konten = await fs.readdir(wurzel);
  } catch {
    // Noch nie gelaufen - das ist kein Fehler, nur nichts da.
    return NextResponse.json({ vorhanden: false, konten: {}, namen: {} });
  }

  for (const konto of konten) {
    if (konto.startsWith('_')) continue;
    let dateien: string[];
    try {
      dateien = await fs.readdir(path.join(wurzel, konto));
    } catch { continue; }

    for (const d of dateien) {
      if (!d.endsWith('.json') || d.startsWith('_')) continue;
      try {
        const m = JSON.parse(
          await fs.readFile(path.join(wurzel, konto, d), 'utf8')) as EigenesMatch;
        if (!m?.sitzung || !m?.werte) continue;
        const k = (m.konto ?? konto).toLowerCase();
        raus[k] ??= {};
        raus[k][m.sitzung.toLowerCase()] = m.werte;
        if (m.name) namen[k] = m.name;
      } catch { /* eine kaputte Datei haelt den Rest nicht auf */ }
    }
  }

  return NextResponse.json({
    vorhanden: Object.keys(raus).length > 0,
    konten: raus,
    namen,
  });
}
