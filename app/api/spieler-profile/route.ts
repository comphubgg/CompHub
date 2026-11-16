import { NextResponse } from 'next/server';
import { darfBereichAnfrage } from '@/lib/adminPruefung';
import { wirfWeg } from '@/lib/antwortSpeicher';
import fs from '@/lib/ablageFs';
import path from 'path';
import { namensSchluessel } from '@/lib/homoglyph';
import { DATEN_ORT } from '@/lib/datenOrt';
import { liesLanKonten } from '@/lib/lanKonten';
import { profilAendern, profilLoeschen, EingabeFehler, type ProfilEingang, type SpielerProfil } from '@/lib/spielerProfil';

// Herkunftsland, X-Konto und Anzeigename je Spieler - von Hand gepflegt.
//
// Der Schluessel ist die Epic-Konto-ID, nicht der Name: Namen sind nicht
// eindeutig. "FocusHD yhyh" und "Th0masHD yhyh" enden beide auf "yhyh" und
// bekaemen sonst denselben Eintrag - beim Pflegen des einen aenderte sich
// stillschweigend auch der andere.
//
// Damit aeltere Eintraege und Faelle ohne bekannte ID weiter funktionieren,
// laesst sich zusaetzlich ueber die beobachteten Namen suchen.
//
// Bewusst ohne automatische Quelle fuer die Laender: die vorhandene Rangliste
// fuehrt Kuerzel, die nachweislich nicht stimmen (sie ordnet shxrk "KR" und
// peterbot "MX" zu). Lieber gar keine Flagge als eine falsche.
//
//   GET                                            -> alle Profile
//   POST { id?, name, land, x, region, anzeige }   -> anlegen oder aendern
//   DELETE ?id=… oder ?name=…                      -> Profil entfernen

export type { SpielerProfil } from '@/lib/spielerProfil';

const DATEI = path.join(DATEN_ORT, 'spieler-profile.json');

async function lies(): Promise<Record<string, SpielerProfil>> {
  try {
    return JSON.parse(await fs.readFile(DATEI, 'utf8')) as Record<string, SpielerProfil>;
  } catch {
    return {};
  }
}

/*
 * Turnierkonten eines LAN tragen Flagge und X-Konto des echten Kontos.
 *
 * Nur in der Antwort, nie in der Datei: wer ein Turnierkonto selbst pflegt,
 * gewinnt, und die Zuordnung (lib/lanKonten) kann sich im naechsten Lauf
 * noch verbessern. Ein Anzeigename wird bewusst nicht gesetzt - der
 * Betreiber will in der Bestenliste Epics Namen sehen ("[FNCSGC26] BIG
 * Vico"). Wo ein Name fuer einen Beitrag gebraucht wird, steht der echte in
 * "echterName".
 */
async function mitLanKonten(profile: Record<string, SpielerProfil>) {
  const lan = await liesLanKonten();
  if (!Object.keys(lan).length) return profile;
  const nachId = new Map(Object.values(profile).filter((p) => p.id).map((p) => [p.id!, p]));
  const raus: Record<string, SpielerProfil & { echt?: string; echterName?: string }> = { ...profile };
  for (const [id, z] of Object.entries(lan)) {
    const echt = nachId.get(z.echt);
    const eigen = nachId.get(id);
    const echterName = echt?.anzeige || z.name.replace(/^\S+\s+/, '') || z.name;
    if (eigen) {
      // Eigener Eintrag: nur Luecken fuellen.
      raus[id] = {
        ...eigen,
        land: eigen.land || echt?.land, x: eigen.x || echt?.x, twitch: eigen.twitch || echt?.twitch,
        echt: z.echt, echterName: eigen.anzeige || echterName,
      };
      continue;
    }
    raus[id] = {
      id, name: z.lan, namen: [z.lan],
      ...(echt?.land ? { land: echt.land } : {}),
      ...(echt?.x ? { x: echt.x } : {}),
      ...(echt?.twitch ? { twitch: echt.twitch } : {}),
      echt: z.echt, echterName,
    };
  }
  return raus;
}

export async function GET() {
  return NextResponse.json({ profile: await mitLanKonten(await lies()) });
}

/*
 * Anlegen oder aendern - zusammengefuehrt, nie ersetzt (lib/spielerProfil.ts).
 *
 * Bis zum 16.11.2026 nahm diese Stelle fuer Felder, die die Anfrage nicht nannte, nur den Wert eines alten Namenseintrags: wer nur { id, name, x }
 * schickte, loeschte dabei Flagge und Twitch des Spielers. Jetzt bleibt stehen, was die Anfrage nicht anspricht; ein leeres Feld loescht weiter.
 */
export async function POST(request: Request) {
  // Serverseitige Pruefung (31.10.2026): vorher kam jede von Hand geschickte Anfrage durch, die Knoepfe waren nur im Browser versteckt.
  if (!await darfBereichAnfrage('spieler', 'karten', 'tweets', 'prognosen')) return NextResponse.json({ ok: false, success: false, error: 'Dafür fehlt dir das Recht.' }, { status: 403 });
  let eingang: ProfilEingang;
  try { eingang = await request.json() as ProfilEingang; } catch { return NextResponse.json({ error: 'Kein JSON' }, { status: 400 }); }
  try {
    const { schluessel, profil } = await profilAendern(eingang);
    /*
     * Die vorgerechneten Antworten des Player Center wegwerfen.
     *
     * Sie halten neunzig Minuten. Wer hier ein @-Konto eintraegt, will es
     * danach sehen und nicht nach der naechsten Frist - der Betreiber hat ein
     * Konto nach dem anderen gepflegt, und im Player Center blieb die Spalte
     * leer. Schlaegt das Wegwerfen fehl, ist das kein Grund, das Speichern
     * scheitern zu lassen.
     */
    void wirfWeg('center|');
    return NextResponse.json({ ok: true, schluessel, profile: profil });
  } catch (e) {
    if (e instanceof EingabeFehler) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: `Speichern gescheitert: ${(e as Error).message}` }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  // Serverseitige Pruefung (31.10.2026): vorher kam jede von Hand geschickte Anfrage durch, die Knoepfe waren nur im Browser versteckt.
  if (!await darfBereichAnfrage('spieler', 'karten', 'tweets', 'prognosen')) return NextResponse.json({ ok: false, success: false, error: 'Dafür fehlt dir das Recht.' }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get('id') ?? '').trim();
  const name = (searchParams.get('name') ?? '').trim();
  const schluessel = id || namensSchluessel(name);
  if (!schluessel) return NextResponse.json({ error: 'id oder name fehlt' }, { status: 400 });

  try { await profilLoeschen(schluessel); } catch (e) {
    return NextResponse.json({ ok: false, error: `Löschen gescheitert: ${(e as Error).message}` }, { status: 503 });
  }
  /*
   * Die vorgerechneten Antworten des Player Center wegwerfen.
   *
   * Sie halten neunzig Minuten. Wer hier ein @-Konto eintraegt, will es
   * danach sehen und nicht nach der naechsten Frist - der Betreiber hat ein
   * Konto nach dem anderen gepflegt, und im Player Center blieb die Spalte
   * leer. Schlaegt das Wegwerfen fehl, ist das kein Grund, das Speichern
   * scheitern zu lassen.
   */
  void wirfWeg('center|');
  return NextResponse.json({ ok: true });
}
