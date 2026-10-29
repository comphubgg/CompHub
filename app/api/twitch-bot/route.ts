import { NextResponse } from 'next/server';
import { wer } from '@/lib/pov';
import { liesKanaele } from '@/lib/twitchStatistik';
import { abbestellen, abonnieren, istModerator, liesKanal, liesZugang, speichereKanal, type Befehl, type BotKanal, type Regel } from '@/lib/twitchBot';

/*
 * Das Dashboard des CompHub-Bots (lib/twitchBot).
 *
 *   GET [?kanal=<Id>]                                   Bot-Konto verbunden?, die eigenen Kanaele, Befehle und Regeln des gewaehlten, ist der Bot dort Moderator
 *   POST { aktion: 'speichern', kanal, befehle, regeln }  Befehle und Regeln ablegen
 *   POST { aktion: 'an', kanal, an }                    den Bot im Kanal ein- oder ausschalten (legt das Webhook-Abo bei Twitch an bzw. nimmt es weg)
 *
 * Welche Kanaele ein VIP einstellen darf, ist dieselbe Zuordnung wie bei der Twitch-Statistik (Admin, /twitch-statistik).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const nie = { 'Cache-Control': 'no-store' };
const RUECKWEG = 'https://www.thecomphub.com/api/twitch/eventsub';
const BEISPIEL: Befehl[] = [{ name: '!comphub', antwort: 'Live stats, tournaments and more: https://www.thecomphub.com', cooldownSek: 30, nurMods: false }];

async function meineKanaele() {
  const ich = await wer();
  const admin = ich.rolle === 'admin';
  if (!ich.idents.length || !(ich.vip || admin)) return null;
  const kanaele = (await liesKanaele()).filter((k) => k.id && (admin || k.vips.some((v) => ich.idents.includes(v))));
  return { admin, kanaele };
}

export async function GET(request: Request) {
  const m = await meineKanaele();
  if (!m) return NextResponse.json({ ok: false, error: 'Nur für VIPs.' }, { status: 403, headers: nie });
  const gewuenscht = new URL(request.url).searchParams.get('kanal') ?? '';
  const k = m.kanaele.find((x) => x.id === gewuenscht) ?? m.kanaele[0];
  const zugang = await liesZugang();
  const einstellung: BotKanal | null = k?.id ? (await liesKanal(k.id)) ?? { id: k.id, login: k.login, an: false, befehle: BEISPIEL, regeln: [], abo: null, geaendert: 0 } : null;
  return NextResponse.json({
    ok: true, admin: m.admin,
    bot: zugang ? { login: zugang.login } : null,
    kanaele: m.kanaele.map((x) => ({ id: x.id, login: x.login, name: x.name ?? x.login })),
    einstellung,
    moderator: k?.id && zugang ? await istModerator(k.id) : null,
  }, { headers: nie });
}

const sauber = (s: unknown, n: number) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, n);

export async function POST(request: Request) {
  const m = await meineKanaele();
  if (!m) return NextResponse.json({ ok: false, error: 'Nur für VIPs.' }, { status: 403, headers: nie });
  const b = await request.json().catch(() => ({})) as { aktion?: string; kanal?: string; an?: boolean; befehle?: Befehl[]; regeln?: Regel[] };
  const k = m.kanaele.find((x) => x.id === b.kanal);
  if (!k?.id) return NextResponse.json({ ok: false, error: 'Diesen Kanal darfst du nicht einstellen.' }, { status: 403, headers: nie });
  const alt = (await liesKanal(k.id)) ?? { id: k.id, login: k.login, an: false, befehle: BEISPIEL, regeln: [], abo: null, geaendert: 0 };

  if (b.aktion === 'speichern') {
    const befehle: Befehl[] = (Array.isArray(b.befehle) ? b.befehle : []).slice(0, 50).map((x) => ({
      name: `!${sauber(x.name, 26).replace(/^!+/, '').replace(/\s+/g, '').toLowerCase()}`,
      antwort: sauber(x.antwort, 480), cooldownSek: Math.min(3600, Math.max(0, Math.round(Number(x.cooldownSek) || 0))), nurMods: Boolean(x.nurMods),
    })).filter((x) => x.name.length > 1 && x.antwort);
    const regeln: Regel[] = (Array.isArray(b.regeln) ? b.regeln : []).slice(0, 50).map((x) => ({
      woerter: (Array.isArray(x.woerter) ? x.woerter : String(x.woerter ?? '').split(',')).map((w) => sauber(w, 40)).filter(Boolean).slice(0, 100),
      aktion: (['loeschen', 'timeout', 'bann'] as const).includes(x.aktion) ? x.aktion : 'timeout',
      dauerSek: Math.min(1_209_600, Math.max(1, Math.round(Number(x.dauerSek) || 600))), grund: sauber(x.grund, 200),
    })).filter((x) => x.woerter.length);
    await speichereKanal({ ...alt, befehle, regeln });
    return NextResponse.json({ ok: true }, { headers: nie });
  }
  if (b.aktion === 'an') {
    if (b.an) {
      const r = await abonnieren(k.id, RUECKWEG);
      if ('fehler' in r) return NextResponse.json({ ok: false, error: r.fehler }, { status: 409, headers: nie });
      await speichereKanal({ ...alt, an: true, abo: r.abo });
    } else {
      await abbestellen(alt.abo);
      await speichereKanal({ ...alt, an: false, abo: null });
    }
    return NextResponse.json({ ok: true }, { headers: nie });
  }
  return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400, headers: nie });
}
