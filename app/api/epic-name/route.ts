import { NextResponse } from 'next/server';
import { getToken, loeseNamenAuf } from '@/lib/epicCups';
import { spielerKontext } from '@/lib/globalsSolos';

export const dynamic = 'force-dynamic';

/*
 * Der Name eines Epic-Kontos, so wie Epic ihn herausgibt (Betreiber, 14.10.2026).
 *
 * Wird ein Profil ueber die Konto-Id geoeffnet und das Werkzeug kennt den Spieler noch nicht (kein Eintrag in der Statistik, keine
 * Szene-Liste), stand oben nur die gekuerzte Id ("8224FC75"). Hier wird der Anzeigename bei Epic nachgeschlagen - dieselbe Aufloesung, die
 * die Cup-Listen nutzen - und mit dem Namen des Werkzeugs (Profil, Szene-Liste) abgeglichen: "anzeige" ist der, der im Profil stehen soll,
 * "epicName" der rohe von Epic. Gibt Epic nichts heraus (Konto geloescht), kommt null zurueck und die Seite behaelt, was sie hat.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id')?.trim() ?? '';
  if (!/^[0-9a-f]{32}$/i.test(id)) return NextResponse.json({ success: false, error: 'id fehlt oder ist keine Konto-Id' }, { status: 400 });
  try {
    const { token } = await getToken();
    const namen = await loeseNamenAuf([id], token);
    const epic = namen[id];
    // Was Epic nicht kennt, kommt als gekuerzte Id zurueck - die ist kein Name.
    const echt = epic && epic !== id.slice(0, 8) ? epic : '';
    const k = (await spielerKontext())(id, echt);
    return NextResponse.json({ success: true, epicName: echt || null, anzeige: k.anzeige || echt || null });
  } catch {
    return NextResponse.json({ success: false, epicName: null, anzeige: null });
  }
}
