import { NextResponse } from 'next/server';
import {
  alleVips, bereinige, epicIdVon, leererPro, liesPros, oeffentlichPov, schreibePros, standardBild, wer,
} from '@/lib/pov';
import { discordStand, mitgliedName, pruefeDiscordLive, standardDiscordId } from '@/lib/povDiscord';
import { istLive, liveSeit, zuschauerZahl, gleicherAnschluss, anschlussVon } from '@/lib/povRelay';

/*
 * Pro-POVs.
 *
 *   GET ?modus=sichtbar   die POVs, die der Besucher sehen darf (VIP und Admin)
 *   GET ?modus=mein       das eigene POV-Profil samt Liste der VIPs (Profi und Admin)
 *   POST { teil }         das eigene Profil aendern (Profi und Admin)
 *
 * Wer ein POV sehen darf, steht im Profil des Profis; der Server gibt einem Besucher nur die Eintraege
 * heraus, in deren Freigabe seine Kennung steht (der Admin sieht alle). Der Twitch-Kanal ist ohnehin
 * oeffentlich bei Twitch - die Freigabe regelt, wo er auf CompHub erscheint, nicht den Kanal selbst.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const nie = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const modus = new URL(request.url).searchParams.get('modus') ?? 'sichtbar';
  const ich = await wer();
  const alle = await liesPros();

  if (modus === 'mein') {
    if (ich.rolle !== 'pro' && ich.rolle !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Nur für Profis.' }, { status: 403, headers: nie });
    }
    const ident = ich.idents[0];
    if (!ident) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401, headers: nie });
    const mein = alle[ident] ?? leererPro(ident, ich.name, ich.bild);
    // Der Name folgt dem Konto; das Bild ist das gewaehlte - sonst das Spielerfoto des verknuepften Epic-Kontos.
    if (!alle[ident]) mein.name = ich.name;
    const eigenes = Boolean(alle[ident]?.bild);
    const standard = (await standardBild(ident)) ?? ich.bild;
    mein.bild = eigenes ? mein.bild : standard;
    // Das Discord-Konto: das zugewiesene, sonst das verknuepfte. Der Stand zeigt, ob der Bot den Profi im Sprachkanal sieht.
    const dId = mein.discordId || (await standardDiscordId(ident)) || '';
    const dName = mein.discordId ? mein.discordName : (dId ? await mitgliedName(dId) : null);
    const dStand = dId ? await discordStand(dId) : null;
    void pruefeDiscordLive({ ident, name: mein.name || ich.name, gilden: mein.gilden, discordId: mein.discordId });
    return NextResponse.json({
      ok: true,
      mein: { ...mein, live: istLive(ident), liveSeit: liveSeit(ident) },
      discord: { id: dId, name: dName ?? '', auto: !mein.discordId && Boolean(dId), stand: dStand },
      bildEigen: eigenes,
      zuschauer: zuschauerZahl(ident),
      vips: (await alleVips()).filter((v) => !v.auch.includes(ident)),
    }, { headers: nie });
  }

  // sichtbar
  if (!ich.vip) return NextResponse.json({ ok: true, pros: [] }, { headers: nie });
  const sichtbar = Object.values(alle)
    .filter((p) => ich.rolle === 'admin' || p.erlaubt.some((e) => ich.idents.includes(e)));
  const pros = await Promise.all(sichtbar.map(async (p) => {
    // Sitzt der Profi in einem Discord-Sprachkanal? Nur das, was ein freigegebener Zuschauer braucht.
    const dId = p.discordId || (await standardDiscordId(p.ident)) || '';
    const d = dId ? await discordStand(dId) : null;
    // Streamt er im Sprachkanal, geht dazu die Meldung auf seinen Servern hinaus (einmal je Sitzung).
    void pruefeDiscordLive(p);
    return {
      ...oeffentlichPov(p), bild: p.bild ?? (await standardBild(p.ident)),
      // Hat der Profi ein verbundenes Epic-Konto, kann das POV seine Werte zeigen.
      stats: Boolean(await epicIdVon(p.ident)),
      // Derselbe Anschluss wie der Sender: dann zuerst ohne Ton (Echo, siehe lib/povRelay gleicherAnschluss).
      lokal: gleicherAnschluss(p.ident, anschlussVon(request)),
      discord: d && d.imKanal ? { streamt: d.streamt, kanal: d.kanalName, server: d.gildenName, link: d.link } : null,
    };
  }));
  return NextResponse.json({ ok: true, pros }, { headers: nie });
}

export async function POST(request: Request) {
  const ich = await wer();
  if (ich.rolle !== 'pro' && ich.rolle !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Nur für Profis.' }, { status: 403, headers: nie });
  }
  const ident = ich.idents[0];
  if (!ident) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401, headers: nie });

  let body: { teil?: Record<string, unknown> } = {};
  try { body = await request.json(); } catch { /* leerer Rumpf */ }
  const alle = await liesPros();
  const alt = alle[ident] ?? leererPro(ident, ich.name, ich.bild);
  const vips = new Set((await alleVips()).flatMap((v) => v.auch));
  const teil = { ...(body.teil ?? {}) };
  // Ein zugewiesenes Discord-Konto muss ein Mitglied des CompHub-Servers sein; der Name kommt von dort.
  if (typeof teil.discordId === 'string') {
    const id = teil.discordId.trim();
    if (!id) { teil.discordId = ''; teil.discordName = ''; } else {
      const name = await mitgliedName(id);
      if (!name) return NextResponse.json({ ok: false, error: 'Dieses Discord-Konto ist nicht im CompHub-Server.' }, { status: 400, headers: nie });
      teil.discordName = name;
    }
  }
  const neu = bereinige(alt, teil, vips);
  // Der Name des Kontos gilt; das Bild ist das gewaehlte, sonst das Spielerfoto (siehe GET).
  neu.name = ich.name || neu.name;
  alle[ident] = neu;
  await schreibePros(alle);
  const wirksam = neu.bild ?? (await standardBild(ident)) ?? ich.bild;
  return NextResponse.json({
    ok: true, bildEigen: Boolean(neu.bild),
    mein: { ...neu, bild: wirksam, live: istLive(ident), liveSeit: liveSeit(ident) },
  }, { headers: nie });
}
