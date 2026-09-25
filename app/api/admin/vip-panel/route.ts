import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { kontoAus, nachId } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach, rechteVon } from '@/lib/vipZugaenge';
import {
  vipUebersicht, vipChat, vipFrist, vipLoeschen, vipVerknuepfen, mitgliederSuchen,
  abgelaufeneVipsLoeschen, discordDa,
} from '@/lib/discord';

/*
 * Das VIP-Panel im Adminbereich (siehe app/admin/vip-access).
 *
 *   GET                                   -> alle Zugaenge mit Discord, Anfragen, Frist
 *   POST { aktion: 'chat', name }         -> Ticket-Kanal mit der Person
 *   POST { aktion: 'frist', name, bis }   -> Frist setzen (bis: 'JJJJ-MM-TT' oder null), DM vom Bot
 *   POST { aktion: 'loeschen', name, grund } -> Zugang weg, Grund als DM
 *   POST { aktion: 'suchen', q }          -> Mitglieder des Servers zum Verknuepfen
 *   POST { aktion: 'verknuepfen', name, discordId, discordName }
 *
 * Nur fuer den Admin. Alles, was die Person erreicht, schickt der
 * CompHub-Bot - der Betreiber will VIPs nicht privat anschreiben.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const KONTO_COOKIE = 'streamer_dashboard_konto';
const VIP_COOKIE = 'streamer_dashboard_auth';

async function istAdmin(): Promise<boolean> {
  const laden = await cookies();
  const id = kontoAus(laden.get(KONTO_COOKIE)?.value);
  if (id) {
    const k = await nachId(id);
    if (k?.rolle === 'admin') return true;
  }
  const vipName = vipAus(laden.get(VIP_COOKIE)?.value);
  if (!vipName) return false;
  if (istBetreiber(laden.get(VIP_COOKIE)?.value)) return true;
  return rechteVon(await zugangNach(vipName)).rolle === 'admin';
}

export async function GET() {
  if (!await istAdmin()) return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  try {
    // Wer hier nachsieht, soll keinen laengst abgelaufenen Zugang mehr sehen.
    const abgelaufen = await abgelaufeneVipsLoeschen().catch(() => []);
    return NextResponse.json({ ok: true, discord: discordDa(), zugaenge: await vipUebersicht(), abgelaufen });
  } catch (e) {
    // Nie "keine Zugaenge", wenn die Ablage nur nicht antwortet.
    return NextResponse.json({ fehler: `Storage is not answering right now (${(e as Error).message}).` }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!await istAdmin()) return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  const e = await request.json().catch(() => ({})) as {
    aktion?: string; name?: string; bis?: string | null; grund?: string;
    q?: string; discordId?: string; discordName?: string;
  };
  const name = String(e.name ?? '').trim();
  try {
    switch (e.aktion) {
      case 'chat':
        return NextResponse.json(await vipChat(name));
      case 'frist': {
        let bis: number | null = null;
        if (e.bis) {
          const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.bis);
          if (!m) return NextResponse.json({ ok: false, text: 'Date missing.' }, { status: 400 });
          // Bis zum Ende des Tages (Schweizer Zeit, grob: 22:59 UTC).
          bis = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 22, 59, 59);
          if (bis <= Date.now()) return NextResponse.json({ ok: false, text: 'That date is in the past.' }, { status: 400 });
        }
        return NextResponse.json(await vipFrist(name, bis));
      }
      case 'loeschen': {
        const grund = String(e.grund ?? '').trim();
        if (grund.length < 3) return NextResponse.json({ ok: false, text: 'Please give a reason.' }, { status: 400 });
        return NextResponse.json(await vipLoeschen(name, grund));
      }
      case 'suchen':
        return NextResponse.json({ ok: true, treffer: await mitgliederSuchen(String(e.q ?? '')) });
      case 'verknuepfen':
        if (!/^\d{15,}$/.test(String(e.discordId ?? ''))) {
          return NextResponse.json({ ok: false, text: 'No Discord account chosen.' }, { status: 400 });
        }
        return NextResponse.json(await vipVerknuepfen(name, String(e.discordId), String(e.discordName ?? '')));
      default:
        return NextResponse.json({ ok: false, text: 'Unknown action.' }, { status: 400 });
    }
  } catch (f) {
    return NextResponse.json({
      ok: false, text: `Storage is not answering right now - nothing was changed (${(f as Error).message}).`,
    }, { status: 503 });
  }
}
