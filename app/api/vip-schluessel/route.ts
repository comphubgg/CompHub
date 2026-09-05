import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';
import { vipAus } from '@/lib/vipCookie';
import { alleZugaenge, type Zugang } from '@/lib/vipZugaenge';
import { schickeSchluessel, discordDa } from '@/lib/discord';
import {
  neuerSchluessel, praefixTaugt, schluesselTaugt, schonVergeben,
} from '@/lib/zugangsSchluessel';

/*
 * Der eigene Zugangsschluessel - fuer den VIP selbst.
 *
 * Der Betreiber wollte einzelnen VIPs erlauben, ihren Schluessel selbst zu
 * wechseln: wer ihn versehentlich im Stream gezeigt hat, soll nicht erst
 * fragen muessen. Das Recht dazu vergibt der Admin je Zugang; hier wird es
 * ausschliesslich gelesen. Koennte man es hier setzen, verlaengerte sich
 * jeder das Recht selbst, das er gerade ausuebt.
 *
 * Wer schreibt, ist durch sein eigenes Cookie ausgewiesen, und der Name
 * kommt aus diesem Cookie - nicht aus der Anfrage. Ein Namensfeld gaebe
 * sonst jedem, der die Adresse kennt, den Schluessel eines Fremden.
 *
 * Der neue Schluessel geht denselben Weg wie beim Admin: in den
 * Discord-Kanal, und die vorherige Nachricht dort verschwindet.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DATEI = path.join(DATEN_ORT, 'vip-users.json');
const VIP_COOKIE = 'streamer_dashboard_auth';

/** Wer fragt - oder null. */
async function werFragt(): Promise<string | null> {
  const laden = await cookies();
  return vipAus(laden.get(VIP_COOKIE)?.value);
}

/** Darf ich meinen Schluessel selbst aendern? */
export async function GET() {
  const name = await werFragt();
  if (!name) return NextResponse.json({ darf: false });
  const u = (await alleZugaenge())
    .find((x) => x.username.toLowerCase() === name.toLowerCase());
  return NextResponse.json({
    darf: Boolean(u?.darfSchluessel) && u?.status === 'active',
  });
}

export async function POST(request: Request) {
  const name = await werFragt();
  if (!name) {
    return NextResponse.json({ fehler: 'nicht angemeldet' }, { status: 401 });
  }

  let daten: { users: Zugang[] };
  try {
    const roh = JSON.parse(await fs.readFile(DATEI, 'utf8')) as { users?: Zugang[] };
    daten = { users: Array.isArray(roh.users) ? roh.users : [] };
  } catch {
    return NextResponse.json({ fehler: 'nicht lesbar' }, { status: 500 });
  }

  const i = daten.users.findIndex(
    (u) => u.username.toLowerCase() === name.toLowerCase());
  if (i < 0) {
    return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });
  }
  if (!daten.users[i].darfSchluessel || daten.users[i].status !== 'active') {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }

  const koerper = await request.json().catch(() => ({}));
  const vorgabe = String(koerper.schluessel ?? '').trim();
  const praefix = String(koerper.praefix ?? '').trim();

  if (vorgabe) {
    const einwand = schluesselTaugt(vorgabe);
    if (einwand) return NextResponse.json({ fehler: einwand }, { status: 400 });
    if (schonVergeben(vorgabe, daten.users, name)) {
      return NextResponse.json(
        { fehler: 'Diesen Schlüssel hat schon jemand anderes.' }, { status: 409 });
    }
  } else if (praefix) {
    const einwand = praefixTaugt(praefix);
    if (einwand) return NextResponse.json({ fehler: einwand }, { status: 400 });
  }

  let schluessel = vorgabe || neuerSchluessel(praefix);
  for (let versuch = 0; !vorgabe && schonVergeben(schluessel, daten.users, name)
    && versuch < 5; versuch += 1) {
    schluessel = neuerSchluessel(praefix);
  }

  daten.users[i].accessKey = schluessel;
  await fs.writeFile(DATEI, `${JSON.stringify(daten, null, 2)}\n`, 'utf8');

  const discord = await schickeSchluessel(daten.users[i].username, schluessel);

  return NextResponse.json({
    ok: true,
    schluessel,
    discord: discord.ok ? 'gesendet'
      : discordDa() ? `nicht gesendet: ${discord.grund}` : null,
  });
}
