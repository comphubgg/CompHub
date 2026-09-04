import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { kontoAus, nachId } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach, rechteVon } from '@/lib/vipZugaenge';
import { holeDienst, setzeDienst, type Dienst } from '@/lib/dienstZugaenge';

// Die Zugangsdaten der Anmeldedienste eintragen - ohne Dateien zu bearbeiten.
//
//   GET             -> Zustand je Dienst, OHNE die Werte
//   POST { dienst, id, secret }  -> eintragen; beides leer loescht
//
// Herausgegeben wird nie ein Secret. Zurueck kommt nur, ob etwas hinterlegt
// ist und woher es stammt - eine Oberflaeche, die den Wert anzeigen wuerde,
// waere ein zweiter Ort, an dem er stehen kann.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KONTO_COOKIE = 'streamer_dashboard_konto';
const VIP_COOKIE = 'streamer_dashboard_auth';
const DIENSTE: Dienst[] = ['twitch', 'discord', 'google'];

async function istAdmin(): Promise<boolean> {
  const laden = await cookies();
  const id = kontoAus(laden.get(KONTO_COOKIE)?.value);
  if (id) {
    const k = await nachId(id);
    if (k && !k.gesperrt && k.rolle === 'admin') return true;
  }
  const wert = laden.get(VIP_COOKIE)?.value;
  if (istBetreiber(wert)) return true;
  const name = vipAus(wert);
  if (name) return rechteVon(await zugangNach(name)).rolle === 'admin';
  return false;
}

/** Wohin der Betreiber gehen muss, um die Werte zu holen. */
const WOHER: Record<Dienst, { seite: string; rueckruf: string }> = {
  twitch: { seite: 'dev.twitch.tv/console/apps',
    rueckruf: '/api/auth/twitch/callback' },
  discord: { seite: 'discord.com/developers/applications',
    rueckruf: '/api/auth/discord/callback' },
  google: { seite: 'console.cloud.google.com/apis/credentials',
    rueckruf: '/api/auth/google/callback' },
};

export async function GET() {
  if (!await istAdmin()) {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  }
  const basis = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  const stand = await Promise.all(DIENSTE.map(async (d) => {
    const { woher } = await holeDienst(d);
    return { dienst: d, woher, ...WOHER[d],
      rueckrufVoll: basis + WOHER[d].rueckruf };
  }));
  return NextResponse.json({ dienste: stand });
}

export async function POST(request: Request) {
  if (!await istAdmin()) {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  }
  const { dienst, id, secret } = await request.json() as
    { dienst?: string; id?: string; secret?: string };
  if (!dienst || !DIENSTE.includes(dienst as Dienst)) {
    return NextResponse.json({ error: 'Unknown service' }, { status: 400 });
  }
  try {
    await setzeDienst(dienst as Dienst, id ?? '', secret ?? '');
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  const { woher } = await holeDienst(dienst as Dienst);
  return NextResponse.json({ ok: true, dienst, woher });
}
