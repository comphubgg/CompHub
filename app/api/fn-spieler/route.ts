import { NextResponse } from 'next/server';
import { EpicLoginNoetig } from '@/lib/epicCups';
import { anschlussAus } from '@/lib/fehlversuche';
import { bremseFrei, imSpeicher, kontoNachId, kontoNachName, spielerName, spielerProfil } from '@/lib/fnSpieler';
import { zwischenspeichern } from '@/lib/zwischenspeicher';

/*
 * Das Profil eines Spielers ausserhalb der Turniere (27.11.2026, Seite "Stats" im Community-Bereich des neuen Hubs).
 *
 *   GET ?name=<Epic-Anzeigename>   oder   ?id=<Konto-Id>
 *   -> { konto: { id, name }, privat, level, saison,
 *        rang:  { br | zb | reload | reloadZb | og | ogZb | ballistic | ...: { typ, titel, stufe, name, fortschritt, hoechste, hoechsteName, platz, aktualisiert } },
 *        stats: { gesamt, solo, duo, trio, squad, sonstige, bereich: { ... }, eingabe: { ... } } | null,
 *        weitere: { "<Epics Schluessel>": Zahl }, stand }
 *      Jede Gruppe: { matches, wins, kills, kd, winrate, killsProMatch, top3, top5, top6, top10, top12, top25, minutesplayed, playersoutlived, score, lastmodified }
 *   &playlists=1  -> zusaetzlich stats.playlists: dieselben Werte je einzelner Spielliste
 *
 * privat: true heisst, der Spieler hat seine Statistik im Spiel verborgen - dann ist stats null, der Rang steht trotzdem da.
 * Unbekannter Name: 404 { error, gefunden: false }. Zu viele Anfragen von einem Anschluss: 400 { error, gebremst: true } (nie 429 - siehe lib/fehlversuche).
 *
 * Quellen, Fristen (zehn Minuten) und die Bremse: lib/fnSpieler.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get('id') ?? '').trim().toLowerCase();
  const name = spielerName(searchParams.get('name') ?? '');
  const mitId = /^[0-9a-f]{32}$/.test(id);
  if (!mitId && !name) return NextResponse.json({ error: 'name= (Epic-Anzeigename) oder id= (Konto-Id) fehlt' }, { status: 400 });

  const frage = mitId ? { id } : { name: name! };
  if (!imSpeicher(frage) && !bremseFrei(anschlussAus(request))) {
    return NextResponse.json({ error: 'Too many lookups - please try again in a few minutes.', gebremst: true }, { status: 400 });
  }

  try {
    const konto = mitId ? await kontoNachId(id) : await kontoNachName(name!);
    if (!konto) return NextResponse.json({ error: 'No Epic account with this name.', gefunden: false }, { status: 404 });
    const profil = await spielerProfil(konto);
    let antwort: unknown = profil;
    if (!searchParams.get('playlists') && profil.stats) {
      const { playlists: _weg, ...ohne } = profil.stats;
      void _weg;
      antwort = { ...profil, stats: ohne };
    }
    return zwischenspeichern(NextResponse.json(antwort, { headers: { 'Cache-Control': 'public, max-age=60' } }), 300);
  } catch (e) {
    const login = e instanceof EpicLoginNoetig;
    return NextResponse.json({ error: (e as Error).message, needsLogin: login }, { status: login ? 401 : 500 });
  }
}
