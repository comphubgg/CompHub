import { NextResponse } from 'next/server';
import { wer } from '@/lib/pov';
import { getToken } from '@/lib/epicCups';
import { epicIdNorm, freigabeDazu, freigabeWeg, freigaben, freigabenSenden } from '@/lib/matchIdFreigaben';

/*
 * Die Freigabeliste des Bot-Kontos (lib/matchIdFreigaben) - nur fuer den Admin, im Match-ID-Finder.
 *
 *   GET                       -> { ok, eintraege: [{ id, name, seit, von }], dienst: { ids } | null }
 *   POST { eingabe }          -> Epic-Konto-Id (32 Zeichen) oder genauer Epic-Name; nimmt das Konto auf
 *   DELETE ?id=<epicId>       -> nimmt es heraus
 *
 * Aufgenommen heisst nur: schickt dieses Konto dem Bot "comphub." selbst eine Freundschaftsanfrage, wird sie angenommen. Der Bot fragt niemanden an.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const nie = { 'Cache-Control': 'no-store' };
const HEX32 = /^[0-9a-f]{32}$/;

async function nurAdmin() {
  const ich = await wer();
  return ich.rolle === 'admin' ? ich : null;
}

/** Was der XMPP-Dienst gerade haelt - zur Kontrolle in der Anzeige. */
async function dienstStand(): Promise<{ ids: string[] } | null> {
  const d = (process.env.XMPP_DIENST_URL || '').replace(/\/+$/, '');
  if (!d) return null;
  try {
    const r = await fetch(`${d}/freigaben`, { cache: 'no-store', signal: AbortSignal.timeout(4_000), headers: process.env.XMPP_DIENST_GEHEIM ? { Authorization: `Bearer ${process.env.XMPP_DIENST_GEHEIM}` } : {} });
    return r.ok ? await r.json() as { ids: string[] } : null;
  } catch { return null; }
}

/** Ein genauer Epic-Name -> Konto (wie /api/match-finder?name=). */
async function kontoZuName(name: string): Promise<{ id: string; name: string } | null> {
  const { token } = await getToken();
  for (const v of [...new Set([name, name.replace(/!/g, 'ǃ'), name.replace(/ǃ/g, '!')])]) {
    const r = await fetch(`https://account-public-service-prod.ol.epicgames.com/account/api/public/account/displayName/${encodeURIComponent(v)}`,
      { headers: { Authorization: token }, cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (!r.ok && r.status !== 404) throw new Error(`Epic ${r.status}`);
    const j = r.ok ? await r.json() as { id?: string; displayName?: string } : null;
    if (j?.id) return { id: epicIdNorm(j.id), name: j.displayName ?? name };
  }
  return null;
}

export async function GET() {
  if (!await nurAdmin()) return NextResponse.json({ ok: false, error: 'Nur für den Admin.' }, { status: 403, headers: nie });
  const eintraege = await freigaben();
  let dienst = await dienstStand();
  // Weicht der Dienst ab (z. B. nach einem Neustart), gleich nachschicken.
  if (dienst && dienst.ids.slice().sort().join() !== eintraege.map((e) => e.id).sort().join() && await freigabenSenden(eintraege)) dienst = await dienstStand();
  return NextResponse.json({ ok: true, eintraege, dienst }, { headers: nie });
}

export async function POST(request: Request) {
  const ich = await nurAdmin();
  if (!ich) return NextResponse.json({ ok: false, error: 'Nur für den Admin.' }, { status: 403, headers: nie });
  const { eingabe } = await request.json().catch(() => ({})) as { eingabe?: string };
  const roh = String(eingabe ?? '').trim();
  if (!roh || roh.length > 60) return NextResponse.json({ ok: false, error: 'Epic-Name oder Konto-Id eingeben.' }, { status: 400, headers: nie });
  let konto: { id: string; name: string } | null;
  try {
    konto = HEX32.test(epicIdNorm(roh)) ? { id: epicIdNorm(roh), name: '' } : await kontoZuName(roh);
  } catch {
    return NextResponse.json({ ok: false, error: 'Epic antwortet gerade nicht' }, { status: 424, headers: nie });
  }
  if (!konto) return NextResponse.json({ ok: false, error: `Kein Epic-Konto "${roh}" gefunden.` }, { status: 404, headers: nie });
  const r = await freigabeDazu(konto.id, konto.name, ich.name || 'admin');
  return NextResponse.json({ ok: true, eintraege: r.liste, gesendet: r.gesendet, dienst: await dienstStand() }, { headers: nie });
}

export async function DELETE(request: Request) {
  if (!await nurAdmin()) return NextResponse.json({ ok: false, error: 'Nur für den Admin.' }, { status: 403, headers: nie });
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const r = await freigabeWeg(id);
  return NextResponse.json({ ok: true, eintraege: r.liste, gesendet: r.gesendet, dienst: await dienstStand() }, { headers: nie });
}
