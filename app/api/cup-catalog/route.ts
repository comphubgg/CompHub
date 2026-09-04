import { NextResponse } from 'next/server';
import {
  gecacht, cupsGruppiert, REGIONEN, REGION_TEXT, STANDARD_ARTEN,
  schreibeArchiv, leseArchiv, archivCups, EpicLoginNoetig,
  type CupArt, type CupGruppe,
} from '@/lib/epicCups';

// Alle Cups, je Turnier ueber die Regionen zusammengefasst - mit Titel,
// Kachelbild und Farbe von Epic.
//
//   ?modus=aktuell   -> Standard-Cups, nur laufend und kommend (Voreinstellung)
//   ?modus=standard  -> Standard-Cups ueber alle Zeiten, auch vergangene
//   ?modus=alle      -> wirklich alles, auch Ranked, Mobile und Skin-Cups
//   ?modus=vorbei    -> nur, was schon gelaufen ist
//
// Ausser bei "aktuell" kommen die Cups aus dem eigenen Archiv dazu: Epics
// Ereignisliste ist ein rollendes Fenster und laesst Vergangenes fallen.
//   ?arten=division,finals   -> feine Auswahl, sticht den Modus
//   ?regions=EU,NAC

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gewaehlt = (searchParams.get('regions') ?? '').split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => (REGIONEN as readonly string[]).includes(s));
  const regionen = gewaehlt.length ? gewaehlt : REGIONEN;

  const modus = searchParams.get('modus') ?? 'aktuell';
  const arten = (searchParams.get('arten') ?? '').split(',')
    .map((s) => s.trim()).filter(Boolean) as CupArt[];

  try {
    const alle = await gecacht(`catalog|${regionen.join(',')}`, 5 * 60_000,
      () => cupsGruppiert(regionen));

    // Jeden Durchlauf mitschreiben, damit die Vergangenheit waechst.
    // Epic selbst haelt vergangene Cups nur wenige Tage vor.
    const neuImArchiv = await schreibeArchiv(alle);

    // "alle" laesst jede Art durch, die beiden anderen Modi zeigen die
    // Standard-Arten - "aktuell" zusaetzlich nur, was noch bevorsteht.
    const erlaubt: CupArt[] = arten.length ? arten
      : modus === 'alle' ? [] : STANDARD_ARTEN;

    /*
     * Vergangene Cups liegen nur noch im eigenen Archiv - Epic gibt sie nach
     * wenigen Tagen nicht mehr heraus.
     *
     * Auch "aktuell" liest mit. Frueher blieb das Archiv dort aussen vor,
     * weil dort ohnehin nur Vergangenes vermutet wurde. Von Hand
     * nachgetragene Turniere stehen aber ebenfalls nur im Archiv - der
     * FNCS Global Championship etwa, den Epic als LAN gar nicht als Fenster
     * fuehrt. Er waere damit ausgerechnet in der Ansicht unsichtbar
     * gewesen, in die er gehoert. Was vorbei ist, faellt unten ohnehin
     * durch die Pruefung.
     */
    const ausArchiv = await archivCups(new Set(alle.map((c) => c.id)));
    const zusammen = [...alle, ...ausArchiv];

    /*
     * Von den Divisionen zaehlt nur die erste.
     *
     * Epic fuehrt Division 1 bis 5, und jede davon in sieben Regionen - in
     * der Uebersicht sind das zwei Dutzend Kacheln, von denen den Betreiber
     * genau eine interessiert: "unter Cup und Upcoming soll nur Division
     * eins sein". Unter "alles" bleibt trotzdem alles sichtbar; weggeworfen
     * wird nichts, nur die Voreinstellung ist aufgeraeumt.
     */
    const kleineDivision = (c: CupGruppe) =>
      /division\s*[2-9]/i.test(c.titel ?? '');

    const passt = (c: CupGruppe) => {
      if (erlaubt.length && !erlaubt.includes(c.art)) return false;
      if (modus !== 'alle' && kleineDivision(c)) return false;
      if (modus === 'aktuell') return c.live || c.naechsterStart !== null;
      if (modus === 'vorbei') return c.vorbei;
      return true;
    };

    const cups = zusammen.filter(passt);

    // Zaehlung je Art, damit die Oberflaeche echte Zahlen anzeigen kann.
    const proArt: Record<string, number> = {};
    for (const c of zusammen) proArt[c.art] = (proArt[c.art] ?? 0) + 1;

    const archiv = await leseArchiv();

    return NextResponse.json({
      cups,
      proArt,
      regionen: Object.fromEntries(regionen.map((r) => [r, REGION_TEXT[r] ?? r])),
      live: alle.filter((c) => c.live).length,
      archiv: (() => {
        // "959 Spieltage" war irrefuehrend: das Archiv haelt je Region ein
        // eigenes Fenster, ein Turniertag zaehlt also siebenmal. Was ein
        // Mensch "Spieltag" nennt, ist der Kalendertag - und davon gibt es
        // ein Siebtel.
        const tag = (ms: number) => new Date(ms).toISOString().slice(0, 10);
        return {
          eintraege: archiv.length,
          neu: neuImArchiv,
          cups: ausArchiv.length,
          turniere: new Set(archiv.map((e) => e.id)).size,
          tage: new Set(archiv.filter((e) => e.begin).map((e) => tag(e.begin))).size,
        };
      })(),
    });
  } catch (e) {
    const login = e instanceof EpicLoginNoetig;
    return NextResponse.json(
      { error: (e as Error).message, needsLogin: login },
      { status: login ? 401 : 500 },
    );
  }
}
