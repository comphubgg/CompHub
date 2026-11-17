import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { speicher, schreibJson } from '@/lib/ablage';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { creditEingabe, setzeCredits, type FotoCredit } from '@/lib/fotoCredits';
import { uploadFrei } from '@/lib/fotoSperre.mjs';
import { PLATZHALTER_FOTO } from '@/lib/spielerbildKlein';

/*
 * Ein Spielerfoto hochladen - aus dem Admin-Werkzeug der E-Sports-Teams.
 *
 * Der Betreiber (28.9.2026): "lass mich bei den Admin Tool ... die Spieler
 * auch ein Profil[bild] hochladen ... wenn es keins hat." Ein vorhandenes
 * Foto laesst sich ersetzen, muss aber nicht.
 *
 *   POST (Formular: datei, epicId, name)   nur Admin
 *        dazu wahlweise die Angaben zum Foto (lib/fotoCredits.ts): fotograf, quelle, link, lizenz, bestaetigt, wahrscheinlich, notiz
 *        - /admin/fotos-credits schickt sie gleich beim Hochladen mit (Betreiber, 17.11.2026).
 *   GET  ?datei=spielerfotos/...webp       das Bild ausliefern
 *
 * Abgelegt als WebP (hoechstens 600 px hoch) im Objektspeicher; die
 * Zuordnung Konto -> Datei steht wie bei allen Fotos in spielerbilder.json.
 * Angezeigt wird es ueber dieselbe Adresse wie die mitgelieferten Fotos
 * (/spielerbilder/<datei>) - was dort nicht als Datei liegt, reicht
 * next.config an diese Schnittstelle weiter.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ORDNER = 'spielerfotos/';
const NAME = /^[a-z0-9-]+\.webp$/;

export async function GET(request: Request) {
  /*
   * Der Dateiname kommt als ?datei=... - oder, ueber die Weiterleitung aus
   * next.config (/spielerbilder/<datei>), aus dem Pfad. Dort kam der
   * Parameter nicht an: jedes hochgeladene Foto antwortete mit 404 und stand
   * im Admin als kaputtes Bild da (30.9.2026).
   */
  const adresse = new URL(request.url);
  let roh = adresse.searchParams.get('datei') ?? '';
  if (!roh) {
    // Die Middleware legt den urspruenglichen Pfad in x-comphub-pfad ab.
    for (const pfad of [request.headers.get('x-comphub-pfad') ?? '', adresse.pathname]) {
      const m = /\/spielerbilder(?:-klein)?\/([^/?#]+)$/.exec(pfad);
      if (m) { try { roh = decodeURIComponent(m[1]); } catch { roh = m[1]; } break; }
    }
  }
  const datei = roh.replace(/^spielerfotos\//, '');
  // Ein Fehlschlag darf nirgends liegen bleiben: Cloudflare hielt ein 404 vier Stunden
  // fest, und ein eben hochgeladenes Foto blieb so lange kaputt (30.9.2026) - darum no-store.
  /*
   * Alles, was hier ankommt und nicht frei ist - die entfernten Fotos unter ihrer alten Adresse (/spielerbilder/x.jpg,
   * /spielerbilder-klein/x.webp) und Uploads von vor dem Neuanfang (lib/fotoSperre.mjs) -, leitet auf den Platzhalter um: nie das alte
   * Bild, und auch kein kaputtes Bild an Stellen, die eine alte Adresse noch abgelegt haben. Nicht zwischenspeichern, damit ein neues Foto
   * unter demselben Namen sofort kommt.
   */
  const platzhalter = () => new NextResponse(null, {
    status: 302,
    headers: { Location: new URL(PLATZHALTER_FOTO, adresse).pathname, 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store' },
  });
  if (!NAME.test(datei) || uploadFrei(datei) !== true) return platzhalter();
  try {
    const roh = await speicher.lies(ORDNER + datei);
    if (!roh) return platzhalter();
    return new NextResponse(new Uint8Array(roh), {
      headers: {
        'Content-Type': 'image/webp',
        /*
         * Jede Fassung hat ihren eigenen Namen. Frueher ein Jahr "immutable"; seit dem 17.11.2026 eine Stunde: ein Foto, das entfernt
         * werden muss, darf nicht ein Jahr lang in Cloudflare oder im Browser liegen bleiben.
         */
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ fehler: 'Storage is not answering right now.' }, { status: 424 });
  }
}

interface Bild { datei?: string; epicId?: string; name?: string; echtesFoto?: boolean }

export async function POST(request: Request) {
  if (!await istAdminAnfrage(request)) return NextResponse.json({ fehler: 'Only the admin.' }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const datei = form?.get('datei');
  const epicId = String(form?.get('epicId') ?? '').toLowerCase();
  const name = String(form?.get('name') ?? '').trim().slice(0, 40);
  /*
   * Auch ohne Konto - fuer Content Creator und Spieler, zu denen es kein
   * Epic-Konto gibt. Der Betreiber (30.9.2026): "dann lass mich mindestens
   * ein Bild hochladen. Es muss ja kein Account connected sein." Das Foto
   * haengt dann am Eintrag der Org (lib/orgs, Feld "bild"), nicht am Konto.
   */
  const ohneKonto = String(form?.get('ohneKonto') ?? '') === '1';
  if (!(datei instanceof File) || (!ohneKonto && !/^[0-9a-f]{32}$/.test(epicId)) || (ohneKonto && !name)) {
    return NextResponse.json({ fehler: 'Photo or account missing.' }, { status: 400 });
  }
  if (datei.size > 15 * 1024 * 1024) return NextResponse.json({ fehler: 'The photo is larger than 15 MB.' }, { status: 413 });

  let bild: Buffer;
  try {
    bild = await sharp(Buffer.from(await datei.arrayBuffer())).rotate()
      .resize({ height: 600, withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
  } catch {
    return NextResponse.json({ fehler: 'This file is not an image.' }, { status: 400 });
  }

  const credit = creditEingabe((f) => { const v = form?.get(f); return typeof v === 'string' ? v : undefined; });
  /** Die Angaben zum Foto ablegen - scheitert das, ist das Foto trotzdem da; die Antwort sagt es. */
  const mitCredit = async (dateiName: string): Promise<{ credit?: FotoCredit | null; creditFehler?: string }> => {
    if (!Object.keys(credit).length) return {};
    try { return { credit: (await setzeCredits([dateiName], credit))[dateiName] }; }
    catch (e) { return { creditFehler: `Photo saved, but the credit was not: ${(e as Error).message}` }; }
  };

  const kurz = (name || 'spieler').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'spieler';
  const dateiName = `${kurz}-${ohneKonto ? 'org' : epicId.slice(0, 8)}-${Date.now().toString(36)}.webp`;
  if (ohneKonto) {
    try { await speicher.schreib(ORDNER + dateiName, bild); }
    catch { return NextResponse.json({ fehler: 'Storage is not answering right now - the photo was not saved.' }, { status: 424 }); }
    return NextResponse.json({ ok: true, bild: `/spielerbilder/${dateiName}`, datei: dateiName, ...await mitCredit(dateiName) });
  }
  try {
    await speicher.schreib(ORDNER + dateiName, bild);
    // Roh gelesen, nicht ueber liesJson: das blendet gesperrte Fotos aus, und hier wird die ganze Zuordnung zurueckgeschrieben.
    const alt = await speicher.lies('spielerbilder.json');
    const gelesen: unknown = alt ? JSON.parse(alt.toString('utf8')) : [];
    if (!Array.isArray(gelesen)) throw new Error('spielerbilder.json ist keine Liste');
    const liste = gelesen as Bild[];
    const da = liste.find((b) => b.epicId === epicId);
    if (da) { da.datei = dateiName; da.echtesFoto = true; }
    else liste.push({ datei: dateiName, epicId, name: name || epicId.slice(0, 8), echtesFoto: true });
    await schreibJson('spielerbilder.json', liste);
  } catch {
    return NextResponse.json({ fehler: 'Storage is not answering right now - the photo was not saved.' }, { status: 424 });
  }
  return NextResponse.json({ ok: true, bild: `/spielerbilder/${dateiName}`, datei: dateiName, ...await mitCredit(dateiName) });
}
