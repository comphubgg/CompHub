import { NextResponse } from 'next/server';
import { vipWerkzeug, wer } from '@/lib/pov';
import { discordIdVon, einladungenVon, gueltig, neueEinladung, prosVon, zurueckziehen } from '@/lib/povVip';
import {
  einladungsLink, liesGilden, richteAlleEin, sendeTest, setzeKanal, setzeVipMeldungen, textKanaele, verwalteteGilden,
} from '@/lib/discordGilden';

/*
 * Der POV-Bereich der VIPs (lib/povVip, /pov).
 *
 *   GET                                      deine Pros, deine Einladungen, der Link fuer den Bot, deine Discord-Server mit Kanalwahl
 *   POST { aktion: 'einladen', name }        einen Einladungslink fuer einen Pro erstellen
 *   POST { aktion: 'zurueck', code }         eine offene Einladung zurueckziehen
 *   POST { aktion: 'kanal', gilde, kanal }   auf deinem Server den Kanal fuer die Live-Meldungen waehlen (leer = aus)
 *   POST { aktion: 'melden', gilde, an }     die Pros, die dich zusehen lassen, auf diesem Server melden
 *   POST { aktion: 'test', gilde }           eine Testmeldung in den gewaehlten Kanal
 *
 * Nur fuer VIPs (und den Admin). Einstellen darf ein VIP nur Server, die er auf Discord verwaltet (lib/discordGilden, verwalteteGilden).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const nie = { 'Cache-Control': 'no-store' };
let letzterAbgleich = 0;

async function vip() {
  const ich = await wer();
  return ich.idents.length && (ich.vip || ich.rolle === 'admin') && vipWerkzeug(ich, 'propov') ? ich : null;
}

function seiteVon(request: Request) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'www.thecomphub.com';
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(host) ? 'https://www.thecomphub.com' : `https://${host}`;
}

export async function GET(request: Request) {
  const ich = await vip();
  if (!ich) return NextResponse.json({ ok: false, error: 'Nur für VIPs.' }, { status: 403, headers: nie });
  const seite = seiteVon(request);
  const [pros, einladungen, discordId] = await Promise.all([prosVon(ich), einladungenVon(ich), discordIdVon(ich)]);

  // Frisch eingeladene Server gleich einrichten (hoechstens einmal je Minute), damit sie hier sofort stehen.
  let gilden: Array<{ id: string; name: string; kanal: string; melden: boolean; eingerichtet: boolean; fehler: string; kanaele: Array<{ id: string; name: string }> }> = [];
  let discordFehler = '';
  if (discordId) {
    try {
      if (Date.now() - letzterAbgleich > 60_000) { letzterAbgleich = Date.now(); await richteAlleEin(seite); }
      const [meine, stand] = await Promise.all([verwalteteGilden(discordId), liesGilden()]);
      gilden = await Promise.all(meine.map(async (g) => ({
        id: g.id, name: g.name,
        kanal: stand[g.id]?.ankuendigung ?? '',
        melden: (stand[g.id]?.vips ?? []).some((v) => ich.idents.includes(v)),
        eingerichtet: Boolean(stand[g.id]?.kanal),
        fehler: stand[g.id]?.fehler ?? '',
        kanaele: await textKanaele(g.id),
      })));
    } catch { discordFehler = 'Discord antwortet gerade nicht.'; }
  }
  return NextResponse.json({
    ok: true,
    name: ich.name,
    pros,
    einladungen: einladungen.map((e) => ({
      code: e.code, name: e.name, erstellt: e.erstellt, offen: gueltig(e),
      angenommen: e.angenommen ? { name: e.angenommen.name, zeit: e.angenommen.zeit } : null,
      link: `${seite}/pov/einladung?code=${e.code}`,
    })),
    discordVerbunden: Boolean(discordId),
    einladung: await einladungsLink().catch(() => null),
    gilden,
    discordFehler,
  }, { headers: nie });
}

export async function POST(request: Request) {
  const ich = await vip();
  if (!ich) return NextResponse.json({ ok: false, error: 'Nur für VIPs.' }, { status: 403, headers: nie });
  const k = await request.json().catch(() => ({})) as { aktion?: string; name?: string; code?: string; gilde?: string; kanal?: string; an?: boolean };

  if (k.aktion === 'einladen') {
    try {
      const e = await neueEinladung(ich, String(k.name ?? ''));
      return NextResponse.json({ ok: true, code: e.code, link: `${seiteVon(request)}/pov/einladung?code=${e.code}` }, { headers: nie });
    } catch (e) {
      return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 409, headers: nie });
    }
  }
  if (k.aktion === 'zurueck') {
    const ok = await zurueckziehen(ich, String(k.code ?? ''));
    return NextResponse.json(ok ? { ok: true } : { ok: false, error: 'Diese Einladung lässt sich nicht zurückziehen.' }, { status: ok ? 200 : 404, headers: nie });
  }

  // Alles Weitere betrifft einen Discord-Server - nur einen, den dieser VIP dort verwaltet.
  const gilde = String(k.gilde ?? '');
  const discordId = await discordIdVon(ich);
  if (!discordId) return NextResponse.json({ ok: false, error: 'Verbinde erst dein Discord-Konto (Account → Discord).' }, { status: 409, headers: nie });
  const meine = await verwalteteGilden(discordId).catch(() => []);
  if (!meine.some((g) => g.id === gilde)) {
    return NextResponse.json({ ok: false, error: 'Diesen Server verwaltest du auf Discord nicht.' }, { status: 403, headers: nie });
  }
  if (k.aktion === 'kanal') {
    const kanal = String(k.kanal ?? '');
    if (kanal && !(await textKanaele(gilde)).some((c) => c.id === kanal)) {
      return NextResponse.json({ ok: false, error: 'Diesen Kanal gibt es auf dem Server nicht.' }, { status: 400, headers: nie });
    }
    const g = await setzeKanal(gilde, kanal);
    return NextResponse.json(g ? { ok: true } : { ok: false, error: 'Der Server ist noch nicht eingerichtet - lade die Seite in einer Minute neu.' }, { status: g ? 200 : 409, headers: nie });
  }
  if (k.aktion === 'melden') {
    const g = await setzeVipMeldungen(gilde, ich.idents, Boolean(k.an));
    return NextResponse.json(g ? { ok: true } : { ok: false, error: 'Der Server ist noch nicht eingerichtet - lade die Seite in einer Minute neu.' }, { status: g ? 200 : 409, headers: nie });
  }
  if (k.aktion === 'test') {
    const r = await sendeTest(gilde);
    return NextResponse.json(r === 'ok' ? { ok: true } : { ok: false, error: r === 'kein-kanal' ? 'Wähle erst einen Kanal.' : 'Discord hat die Meldung abgelehnt - darf CompHub in diesem Kanal schreiben?' },
      { status: r === 'ok' ? 200 : 409, headers: nie });
  }
  return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400, headers: nie });
}
