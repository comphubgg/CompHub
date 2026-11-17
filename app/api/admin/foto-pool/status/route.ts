import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { CID, reiheZustand, status } from '@/lib/fotoPoolReihe';

/*
 * Stand der Schreibreihe des Foto-Pools (lib/fotoPoolReihe.ts) - nur fuer den Admin, immer JSON.
 *
 *   GET ?cids=<cid>,<cid>  -> { ok, reihe: { wartend, laeuft, fehlschlaege, letzterCommit, letzterFehler },
 *                               stand: { <cid>: { art: 'wartet' | 'gespeichert' | 'fehler', endgueltig?, fehler?, id } } }
 *   Fehlt eine cid in `stand`, kennt dieser Server sie nicht (Neustart) - die Seite schickt sie dann noch einmal.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const privat = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  try {
    if (!await istAdminAnfrage()) return NextResponse.json({ ok: false, error: 'Nur für Admins – bitte (neu) anmelden.', anmelden: true }, { status: 403, headers: privat });
    const cids = (new URL(request.url).searchParams.get('cids') ?? '').split(',').filter((c) => CID.test(c)).slice(0, 500);
    return NextResponse.json({ ok: true, reihe: reiheZustand(), stand: status(cids) }, { headers: privat });
  } catch (f) {
    return NextResponse.json({ ok: false, error: `Interner Fehler: ${String((f as Error)?.message ?? f).slice(0, 200)}` }, { status: 500, headers: privat });
  }
}
