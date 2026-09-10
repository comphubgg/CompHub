import { NextResponse } from 'next/server';
import { getToken, EVENTS, gecacht } from '@/lib/epicCups';
import { qualiZeilen, type QualiZeile } from '@/lib/qualiText';

/*
 * Wer bei diesem Spieltag mitspielen darf.
 *
 * Epic legt die Bedingungen in denselben Ereignisdaten ab, aus denen auch die
 * Cup-Liste kommt - als Kennungen ("S39_FNCS_Division3_EU"), nicht als Text.
 * Diese Route holt sie und laesst sie in lib/qualiText.ts uebersetzen.
 *
 *   GET ?event=…&window=…  ->  { zeilen: [{art, text}], da: true }
 *
 * Der Betreiber wollte das unter Events sehen: "wie man sich qualifizieren
 * kann, wenn Du das ueber die API findest". Es findet sich - und wenn zu einem
 * Spieltag nichts dasteht, kommt eine leere Liste zurueck statt einer
 * erfundenen Bedingung.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Eine Stunde. Teilnahmebedingungen aendern sich nicht im Minutentakt. */
const TTL = 3_600_000;

interface RohesEreignis {
  eventId: string;
  regions?: string[];
  metadata?: Record<string, unknown>;
  eventWindows?: Array<{ eventWindowId: string } & Record<string, unknown>>;
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const event = (p.get('event') ?? '').trim();
  const fenster = (p.get('window') ?? '').trim();
  if (!event) {
    return NextResponse.json({ fehler: 'event fehlt' }, { status: 400 });
  }

  try {
    const zeilen = await gecacht<QualiZeile[]>(
      `quali|${event}|${fenster}`, TTL, async () => {
        const { token, accountId } = await getToken();
        /*
         * Die Region steht in der Kennung des Ereignisses, nicht im Aufruf.
         *
         * Epic gibt die Liste je Region heraus; wer nach einem Ereignis aus
         * NAC fragt, findet es in der EU-Liste nicht. Deshalb der Reihe nach,
         * bis es gefunden ist - im Zwischenspeicher landet ohnehin nur das
         * Ergebnis.
         */
        for (const region of ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE']) {
          const r = await fetch(
            `${EVENTS}/api/v1/events/Fortnite/download/${accountId}`
            + `?region=${region}&platform=Windows&teamAccountIds=${accountId}`,
            { headers: { Authorization: token } });
          if (!r.ok) continue;
          const d = await r.json() as { events?: RohesEreignis[] };
          const ev = (d.events ?? []).find((e) => e.eventId === event);
          if (!ev) continue;
          const w = fenster
            ? (ev.eventWindows ?? []).find((x) => x.eventWindowId === fenster)
            : (ev.eventWindows ?? [])[0];
          // Die rohen Felder sind lose getippt - qualiText liest nur
          // heraus, was es kennt, und laesst den Rest liegen.
          return qualiZeilen(ev, (w ?? null) as Parameters<typeof qualiZeilen>[1]);
        }
        return [];
      });

    return NextResponse.json({ ok: true, zeilen });
  } catch (e) {
    /*
     * Ohne Epic-Anmeldung gibt es die Bedingungen nicht.
     *
     * Das ist kein Fehler der Seite - sie zeigt den Abschnitt dann einfach
     * nicht, statt eine Fehlermeldung an eine Stelle zu setzen, an der ein
     * Zuschauer nichts damit anfangen kann.
     */
    return NextResponse.json({ ok: false, zeilen: [], grund: (e as Error).message });
  }
}
