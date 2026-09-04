import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { kontoAus, nachId } from '@/lib/konten';
import { vipAus } from '@/lib/vipCookie';
import { zugangNach, rechteVon } from '@/lib/vipZugaenge';

// Wer ist hier Admin - oder Manager?
//
// Diese Auskunft kannte lange nur den alten VIP-Schluessel und verglich
// stur mit "admin-juanito". Damit bekam jeder, dem der Betreiber am
// CompHub-Konto die Rolle "admin" gegeben hatte, ein glattes Nein - die
// Verwaltungskacheln blieben ihm verborgen, obwohl er das Recht hatte.
//
// Jetzt zaehlen beide Wege, und sie liefert gleich mit, was das Konto darf:
// die Rolle und, bei einem Manager, seine angehakten Bereiche. So muss die
// Oberflaeche nicht an zwei Stellen fragen.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KONTO_COOKIE = 'streamer_dashboard_konto';
const VIP_COOKIE = 'streamer_dashboard_auth';

export async function GET() {
  try {
    const laden = await cookies();

    // 1. Der alte Weg - der Betreiber selbst.
    const vipName = vipAus(laden.get(VIP_COOKIE)?.value);
    const istBetreiber = vipName?.trim().toLowerCase() === 'admin-juanito';

    // 2. Der neue Weg - die Rolle am CompHub-Konto.
    let rolle: 'admin' | 'manager' | 'pro' | null = null;
    let rechte: string[] = [];
    let name: string | null = null;
    // Das verknuepfte Epic-Konto. Damit erkennt die Karte, welches Duo in
    // der Teamliste der Betrachter selbst ist.
    let epicId: string | null = null;

    const id = kontoAus(laden.get(KONTO_COOKIE)?.value);
    if (id) {
      const k = await nachId(id);
      // Ein gesperrtes Konto hat keine Rechte mehr, egal was dranstand.
      if (k && !k.gesperrt) {
        rolle = k.rolle ?? null;
        rechte = k.rechte ?? [];
        name = k.name;
        epicId = k.epicId ?? null;
      }
    }

    /*
     * Ein Zugang mit Schluessel kann ebenfalls eine Rolle tragen. Ohne
     * diesen Blick sah ein zum Admin gemachter Zugang seine Werkzeuge nie.
     */
    if (vipName && !istBetreiber) {
      const darf = rechteVon(await zugangNach(vipName));
      if (!rolle && darf.rolle) rolle = darf.rolle;
      if (!rechte.length) rechte = darf.rechte;
      if (!name) name = vipName;
    }

    const isAdmin = istBetreiber || rolle === 'admin';

    return NextResponse.json({
      isAdmin,
      userName: name ?? vipName ?? null,
      /** Was dieses Konto ist - fuer die Oberflaeche. */
      rolle: isAdmin ? 'admin' : rolle,
      /** Bei einem Manager: welche Bereiche. Ein Admin darf ohnehin alles. */
      rechte: isAdmin ? [] : rechte,
      /** Das eigene Epic-Konto, sofern verknuepft - sonst null. */
      epicId,
    });
  } catch {
    return NextResponse.json({
      isAdmin: false, userName: null, rolle: null, rechte: [], epicId: null,
    });
  }
}
