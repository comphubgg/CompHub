import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { kontoAus, nachId, alleKonten } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach, rechteVon, alleZugaenge } from '@/lib/vipZugaenge';
import { schreibGrund } from '@/lib/schreibfehler';
import {
  liesVips, schreibeVips, kontoName, type HomepageVip, type Netz,
} from '@/lib/homepageVips';

/*
 * Wer auf der Startseite steht - und wer dafuer in Frage kaeme.
 *
 *   GET            -> die aktiven Eintraege, fuer jeden Besucher
 *   GET ?alle=1    -> alle Eintraege samt Kandidatenliste (nur Admin)
 *   POST           -> anlegen oder aendern (nur Admin)
 *   POST + Datei   -> ein Bild hochladen (nur Admin)
 *   DELETE ?id=…   -> von der Startseite nehmen (nur Admin)
 *
 * Die oeffentliche Auskunft gibt bewusst nur die aktiven heraus und nichts
 * darueber hinaus: kein Konto, keine Kennung, keine Frist. Auf der
 * Startseite steht ein Bild, ein Name und ein Twitch-Konto - mehr geht
 * niemanden etwas an.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KONTO_COOKIE = 'streamer_dashboard_konto';
const VIP_COOKIE = 'streamer_dashboard_auth';
const BILDER = path.join(process.cwd(), 'public', 'vips');

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

/**
 * Wer ueberhaupt in Frage kommt.
 *
 * Beide Arten von Zugang: die selbst vergebenen Schluessel und die
 * CompHub-Konten mit VIP-Recht. Wer schon auf der Startseite steht, faellt
 * heraus - sonst stuende er zweimal in der Auswahl.
 *
 * Die Liste ist ein Vorschlag, keine Schranke: der Betreiber kann auch
 * jemanden eintragen, der gar kein Konto hat. Ein Kooperationspartner
 * braucht keinen Zugang zum Werkzeug, um auf der Startseite zu stehen.
 */
async function kandidaten(schonDrin: Set<string>) {
  const raus: Array<{ konto: string; name: string; art: 'schluessel' | 'konto' }> = [];

  for (const z of await alleZugaenge()) {
    if (z.status !== 'active') continue;
    if (schonDrin.has(z.username.toLowerCase())) continue;
    raus.push({ konto: z.username, name: z.username, art: 'schluessel' });
  }

  for (const k of await alleKonten()) {
    if (!k.vip || k.gesperrt) continue;
    if (schonDrin.has(k.name.toLowerCase())) continue;
    raus.push({ konto: k.id, name: k.name, art: 'konto' });
  }

  return raus.sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET(request: Request) {
  const alle = new URL(request.url).searchParams.get('alle') === '1';
  const liste = await liesVips();

  if (!alle) {
    // Fuer die Startseite: nur die aktiven, und nur was auf der Karte steht.
    return NextResponse.json({
      ok: true,
      vips: liste.filter((v) => v.aktiv).map((v) => ({
        id: v.id, name: v.name, bild: v.bild ?? null,
        twitch: v.twitch ?? null, x: v.x ?? null, tiktok: v.tiktok ?? null,
      })),
    });
  }

  if (!await istAdmin()) {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }

  const drin = new Set(liste.map((v) => (v.konto ?? v.name).toLowerCase()));
  return NextResponse.json({
    ok: true, admin: true,
    vips: liste,
    kandidaten: await kandidaten(drin),
  });
}

export async function POST(request: Request) {
  if (!await istAdmin()) {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }

  /*
   * Ein Bild kommt als Formulardaten, alles andere als JSON.
   *
   * Getrennte Wege waeren sauberer, aber ein Bild gehoert immer zu einem
   * Eintrag; so bleibt beides an einer Stelle und der Aufrufer muss sich
   * keine zweite Adresse merken.
   */
  const art = request.headers.get('content-type') ?? '';
  if (art.includes('multipart/form-data')) {
    const daten = await request.formData();
    const id = String(daten.get('id') ?? '').trim();
    const datei = daten.get('bild');
    if (!id || !(datei instanceof File)) {
      return NextResponse.json({ fehler: 'id und Bild nötig' }, { status: 400 });
    }
    if (datei.size > 4_000_000) {
      return NextResponse.json({ fehler: 'Das Bild ist größer als vier Megabyte.' },
        { status: 400 });
    }

    const endung = (datei.name.match(/\.(png|jpe?g|webp|gif)$/i)?.[1] ?? 'png')
      .toLowerCase();
    const liste = await liesVips();
    const i = liste.findIndex((v) => v.id === id);
    if (i < 0) return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });

    /*
     * Der Dateiname bekommt einen frischen Zufallsteil.
     *
     * Sonst zeigte der Browser nach dem Austauschen weiter das alte Bild -
     * gleiche Adresse, gleicher Zwischenspeicher. Der alte Stand wird
     * anschliessend entfernt, damit sich der Ordner nicht fuellt.
     */
    const name = `${id}-${crypto.randomBytes(4).toString('hex')}.${endung}`;
    try {
      await fs.mkdir(BILDER, { recursive: true });
      await fs.writeFile(path.join(BILDER, name),
        Buffer.from(await datei.arrayBuffer()));
      const vorher = liste[i].bild;
      liste[i].bild = `/vips/${name}`;
      await schreibeVips(liste);
      if (vorher?.startsWith('/vips/')) {
        await fs.unlink(path.join(process.cwd(), 'public', vorher)).catch(() => {});
      }
    } catch (e) {
      return NextResponse.json({ fehler: schreibGrund(e, BILDER) }, { status: 500 });
    }
    return NextResponse.json({ ok: true, vips: await liesVips() });
  }

  const koerper = await request.json().catch(() => ({}));
  const liste = await liesVips();

  const id = String(koerper.id ?? '').trim();
  const i = id ? liste.findIndex((v) => v.id === id) : -1;

  if (i < 0) {
    // Neu. Der Name ist das einzige, was wirklich sein muss.
    const name = String(koerper.name ?? '').trim();
    if (!name) {
      return NextResponse.json({ fehler: 'Ein Name gehört dazu.' }, { status: 400 });
    }
    const neu: HomepageVip = {
      id: crypto.randomUUID(),
      konto: String(koerper.konto ?? '').trim() || undefined,
      name: name.slice(0, 60),
      twitch: kontoName(String(koerper.twitch ?? '')) || undefined,
      x: kontoName(String(koerper.x ?? '')) || undefined,
      tiktok: kontoName(String(koerper.tiktok ?? '')) || undefined,
      bild: undefined,
      aktiv: koerper.aktiv !== false,
      // Ans Ende. Verschieben kann er danach.
      reihenfolge: liste.length,
    };
    liste.push(neu);
    try { await schreibeVips(liste); }
    catch (e) {
      return NextResponse.json({ fehler: schreibGrund(e, 'data/homepage-vips.json') },
        { status: 500 });
    }
    return NextResponse.json({ ok: true, id: neu.id, vips: await liesVips() });
  }

  // Aendern. Nur was mitgeschickt wird, wird angefasst - ein leeres Feld
  // leert dabei wirklich, so wie ueberall sonst im Werkzeug.
  if (koerper.name !== undefined) {
    const name = String(koerper.name).trim();
    if (!name) {
      return NextResponse.json({ fehler: 'Ein Name gehört dazu.' }, { status: 400 });
    }
    liste[i].name = name.slice(0, 60);
  }
  /*
   * Die drei Konten einzeln. Nur was mitgeschickt wird, wird angefasst -
   * ein leeres Feld leert wirklich, so wie ueberall sonst im Werkzeug.
   */
  for (const netz of ['twitch', 'x', 'tiktok'] as Netz[]) {
    if (koerper[netz] === undefined) continue;
    liste[i][netz] = kontoName(String(koerper[netz])) || undefined;
  }
  if (koerper.aktiv !== undefined) liste[i].aktiv = Boolean(koerper.aktiv);

  /*
   * Verschieben um einen Platz.
   *
   * Ueber Nachbartausch statt ueber eine frei gesetzte Zahl: so kann die
   * Reihenfolge nicht in einen Zustand geraten, den niemand mehr versteht.
   */
  if (koerper.richtung === 'hoch' || koerper.richtung === 'runter') {
    const j = koerper.richtung === 'hoch' ? i - 1 : i + 1;
    if (j >= 0 && j < liste.length) {
      const merk = liste[i].reihenfolge;
      liste[i].reihenfolge = liste[j].reihenfolge;
      liste[j].reihenfolge = merk;
    }
  }

  try { await schreibeVips(liste); }
  catch (e) {
    return NextResponse.json({ fehler: schreibGrund(e, 'data/homepage-vips.json') },
      { status: 500 });
  }
  return NextResponse.json({ ok: true, vips: await liesVips() });
}

export async function DELETE(request: Request) {
  if (!await istAdmin()) {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const liste = await liesVips();
  const weg = liste.find((v) => v.id === id);
  if (!weg) return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });

  try {
    await schreibeVips(liste.filter((v) => v.id !== id));
    // Das Bild geht mit - es gehoerte nur zu diesem Eintrag.
    if (weg.bild?.startsWith('/vips/')) {
      await fs.unlink(path.join(process.cwd(), 'public', weg.bild)).catch(() => {});
    }
  } catch (e) {
    return NextResponse.json({ fehler: schreibGrund(e, 'data/homepage-vips.json') },
      { status: 500 });
  }
  return NextResponse.json({ ok: true, vips: await liesVips() });
}
