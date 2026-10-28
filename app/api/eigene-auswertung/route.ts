import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { kontoAus, nachId } from '@/lib/konten';
import { GAST_COOKIE, gastAus } from '@/lib/epicGast';
import { findeSpieler, MAX_PAGES } from '@/lib/epicCups';
import { FRIST_MS, fensterOk, kontoOk, leseAnfrage, leseErgebnis, merkeKonto, schreibeAnfrage } from '@/lib/eigeneAuswertung';

/*
 * Die Auswertung der eigenen Lobbys eines Cups (lib/eigeneAuswertung).
 *
 *   GET  ?window=FENSTER&id=KONTO   wie weit ist die Auswertung: { ergebnis | null, angefragt | null }
 *   POST { eventId, windowId }      die Auswertung der eigenen Lobbys bestellen - nur fuer das Konto, das sich mit Epic verifiziert hat
 *
 * Bestellt wird immer fuer das verifizierte Konto der Anfrage (Konto oder Gast-Cookie), nie fuer eine Id aus dem Text: niemand kann
 * Auswertungen auf fremde Namen losschicken. Je Fenster und Konto gibt es hoechstens eine Bestellung.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const NEIN = { 'Cache-Control': 'no-store' };
const normId = (s: string) => s.replace(/-/g, '').toLowerCase();

/** Das verifizierte Epic-Konto dieser Anfrage - leer, wenn es keins gibt. */
async function ich(): Promise<string> {
  const laden = await cookies();
  const kid = kontoAus(laden.get('streamer_dashboard_konto')?.value);
  const konto = kid ? await nachId(kid) : null;
  if (konto && !konto.gesperrt && konto.epicId) return normId(konto.epicId);
  return gastAus(laden.get(GAST_COOKIE)?.value);
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const w = p.get('window') ?? ''; const id = normId(p.get('id') ?? '');
  if (!fensterOk(w) || !kontoOk(id)) return NextResponse.json({ ok: false, error: 'Fenster und Konto fehlen.' }, { status: 400, headers: NEIN });
  const [e, a] = await Promise.all([leseErgebnis(w, id), leseAnfrage(w, id)]);
  return NextResponse.json({
    ok: true,
    ergebnis: e ? { gelesen: e.gelesen, sitzungen: e.sitzungen, gerechnet: e.gerechnet, grund: e.grund ?? null } : null,
    angefragt: a?.zeit ?? null,
  }, { headers: NEIN });
}

export async function POST(request: Request) {
  const k = await request.json().catch(() => ({})) as { eventId?: string; windowId?: string };
  const eventId = String(k.eventId ?? ''); const w = String(k.windowId ?? '');
  if (!eventId || eventId.length > 160 || !fensterOk(w)) return NextResponse.json({ ok: false, error: 'Cup fehlt.' }, { status: 400, headers: NEIN });
  const id = await ich();
  if (!kontoOk(id)) return NextResponse.json({ ok: false, error: 'Erst mit Epic verifizieren.' }, { status: 401, headers: NEIN });
  // Ab jetzt werden auch alle anderen Cups dieses Kontos von selbst ausgewertet.
  await merkeKonto(id);

  if (await leseErgebnis(w, id)) return NextResponse.json({ ok: true, stand: 'fertig' }, { headers: NEIN });
  const alt = await leseAnfrage(w, id);
  if (alt) return NextResponse.json({ ok: true, stand: 'angefragt', zeit: alt.zeit }, { headers: NEIN });

  try {
    const r = await findeSpieler(eventId, w, [], [id], MAX_PAGES);
    const e = r.entries[0];
    if (!e) return NextResponse.json({ ok: false, error: 'Du stehst in diesem Cup nicht in der Bestenliste.' }, { status: 404, headers: NEIN });
    const sitzungen = [...new Set(e.matches.map((m) => m.sessionId).filter((s): s is string => !!s))].slice(0, 30);
    if (!sitzungen.length) return NextResponse.json({ ok: false, error: 'Epic nennt zu deinen Spielen keine Lobbys.' }, { status: 404, headers: NEIN });
    // Epic haelt ein Replay 31 Tage - ist das juengste Spiel aelter, gibt es nichts mehr auszuwerten.
    const juengste = Math.max(0, ...e.matches.map((m) => (m.endTime ? Date.parse(m.endTime) || 0 : 0)));
    if (juengste && Date.now() - juengste > FRIST_MS) return NextResponse.json({ ok: false, error: 'Die Replays dieses Cups sind bei Epic schon gelöscht.' }, { status: 410, headers: NEIN });
    const team = [...new Set(e.players.map((x) => normId(x.id)).filter(kontoOk))];
    if (!team.includes(id)) team.push(id);
    const zeit = Date.now();
    await schreibeAnfrage({ eventId, windowId: w, epicId: id, sitzungen, team, zeit, ...(juengste ? { ende: juengste } : {}) });
    return NextResponse.json({ ok: true, stand: 'angefragt', zeit, sitzungen: sitzungen.length }, { headers: NEIN });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Die Bestellung ließ sich gerade nicht speichern: ${String((e as Error).message).slice(0, 120)}` }, { status: 424, headers: NEIN });
  }
}
