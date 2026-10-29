import { NextResponse } from 'next/server';
import { alleVips, wer } from '@/lib/pov';
import { auswerten, liesDatei, liesKanaele, schreibeKanaele } from '@/lib/twitchStatistik';
import { twitchToken } from '@/lib/twitchToken';

/*
 * Die Twitch-Statistik der VIPs (lib/twitchStatistik).
 *
 *   GET [?kanal=<Twitch-Id oder Login>]   die eigenen Kanaele und die Auswertung eines davon (Admin: alle Kanaele, dazu die VIP-Liste fuers Eintragen)
 *   POST { aktion: 'eintragen', login, vip }   (Admin) einen Kanal zaehlen lassen und diesem VIP freigeben
 *   POST { aktion: 'austragen', login }        (Admin) nicht mehr zaehlen - die gesammelten Werte bleiben im Archiv
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const nie = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const ich = await wer();
  const admin = ich.rolle === 'admin';
  if (!ich.idents.length || !(ich.vip || admin)) return NextResponse.json({ ok: false, error: 'Nur für VIPs.' }, { status: 403, headers: nie });
  const kanaele = (await liesKanaele()).filter((k) => admin || k.vips.some((v) => ich.idents.includes(v)));
  const p = new URL(request.url).searchParams;
  const gewuenscht = (p.get('kanal') ?? '').toLowerCase();
  const k = kanaele.find((x) => x.id === gewuenscht || x.login.toLowerCase() === gewuenscht) ?? kanaele[0];
  // Noch keine Datei vom Sammler (eben eingetragen): Archiv, TwitchTracker und Live gibt es trotzdem schon.
  const datei = k?.id ? (await liesDatei(k.id)) ?? { id: k.id, login: k.login, name: k.name ?? k.login, follower: [], streams: [] } : null;
  return NextResponse.json({
    ok: true,
    admin,
    kanaele: kanaele.map((x) => ({ login: x.login, id: x.id ?? null, name: x.name ?? x.login, vipName: x.vipName, seit: x.seit })),
    auswertung: datei ? await auswerten(datei, p.get('art') ?? undefined, p.get('einheit') ?? undefined) : null,
    gewaehlt: k ? (k.id ?? k.login) : null,
    ...(admin ? { vips: (await alleVips()).map((v) => ({ ident: v.ident, name: v.name })) } : {}),
  }, { headers: nie });
}

export async function POST(request: Request) {
  const ich = await wer();
  if (ich.rolle !== 'admin') return NextResponse.json({ ok: false, error: 'Nur für den Admin.' }, { status: 403, headers: nie });
  const b = await request.json().catch(() => ({})) as { aktion?: string; login?: string; vip?: string };
  const login = String(b.login ?? '').trim().replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '').replace(/\/.*$/, '').toLowerCase();
  if (!/^[a-z0-9_]{3,25}$/.test(login)) return NextResponse.json({ ok: false, error: 'Das ist kein Twitch-Name.' }, { status: 400, headers: nie });
  const kanaele = await liesKanaele();
  if (b.aktion === 'austragen') {
    await schreibeKanaele(kanaele.filter((k) => k.login.toLowerCase() !== login));
    return NextResponse.json({ ok: true }, { headers: nie });
  }
  if (b.aktion === 'eintragen') {
    const vip = (await alleVips()).find((v) => v.ident === b.vip || v.auch.includes(String(b.vip ?? '')));
    if (!vip) return NextResponse.json({ ok: false, error: 'Diesen VIP gibt es nicht.' }, { status: 400, headers: nie });
    // Die Twitch-Kennung gleich nachschlagen: die Datei des Sammlers heisst danach.
    let twitch: { id: string; name: string } | null = null;
    try {
      const token = await twitchToken();
      const r = token ? await fetch(`https://api.twitch.tv/helix/users?login=${login}`, {
        headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID || '', Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(8_000),
      }) : null;
      const u = r?.ok ? (await r.json() as { data?: Array<{ id: string; display_name: string }> }).data?.[0] : undefined;
      if (u) twitch = { id: u.id, name: u.display_name };
    } catch { /* der Sammler schlaegt sie dann selbst nach */ }
    if (!twitch) return NextResponse.json({ ok: false, error: 'Diesen Twitch-Kanal gibt es nicht.' }, { status: 400, headers: nie });
    const da = kanaele.find((k) => k.login.toLowerCase() === login);
    if (da) { da.vips = vip.auch; da.vipName = vip.name; da.id = twitch.id; da.name = twitch.name; }
    else kanaele.push({ login, id: twitch.id, name: twitch.name, vips: vip.auch, vipName: vip.name, seit: Date.now() });
    await schreibeKanaele(kanaele);
    // Den Sammler anstossen - ohne Kanaele beendet er sich und wartet (scripts/twitch-statistik.mjs). Laeuft er schon, wartet hoechstens einer.
    const gh = (process.env.GITHUB_TOKEN || process.env.DATEN_TOKEN || '').trim();
    if (gh) {
      await fetch('https://api.github.com/repos/comphubgg/CompHub/actions/workflows/twitch-statistik.yml/dispatches', {
        method: 'POST', body: JSON.stringify({ ref: 'main' }), signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${gh}`, Accept: 'application/vnd.github+json', 'User-Agent': 'comphub-twitch', 'Content-Type': 'application/json' },
      }).catch(() => null);
    }
    return NextResponse.json({ ok: true }, { headers: nie });
  }
  return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400, headers: nie });
}
