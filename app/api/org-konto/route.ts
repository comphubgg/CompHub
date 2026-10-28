import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { werSchreibt } from '@/lib/werSchreibt';
import { liesOrgs, schreibOrgs, saeubere, type Org, type OrgRolle } from '@/lib/orgs';
import { liesJson, speicher } from '@/lib/ablage';
import { spielerbildKlein } from '@/lib/spielerbildKlein';

/*
 * Der Esports-Zugang (Betreiber, 14.10.2026): ein Konto, das der Admin einer Organisation zugeordnet hat (Konto.org), pflegt den Kader dieser einen Org.
 *
 *   GET                    die Org dieses Kontos (Admin: ?org=<Kennung> fuer jede) samt den Fotos der Konten
 *   POST { aktion, ... }   farbe | spieler-neu | spieler-weg | spieler-aendern
 *   POST (Formular)        datei, name -> ein Foto fuer einen Spieler ohne Konto hochladen, Antwort: die Adresse
 *
 * Wer nicht Admin ist, kann nur die eigene Org anfassen; die Kennung in der Anfrage zaehlt dann nicht. Es wird nur geaendert, was ein Kader ist:
 * Spieler, ihre Rolle, Beitritt, X-Konto, Foto - und die Farbe der Org. Der Name, das Logo, die Preisgelder und der Rest der Org bleiben dem Admin.
 * Aenderungen gelten fuer alle (auch fuer die Statistik unter Organisationen): es ist dieselbe Liste.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function wessen(orgParam: string | null): Promise<{ id: string } | { fehler: Response }> {
  const w = await werSchreibt();
  const id = (w.org || (w.rolle === 'admin' ? orgParam ?? '' : '')).toLowerCase();
  if (!id) return { fehler: NextResponse.json({ ok: false, error: 'Dieses Konto verwaltet keine Organisation.' }, { status: 403 }) };
  return { id };
}

interface Bildeintrag { datei: string; epicId: string; echtesFoto?: boolean }
async function fotos(org: Org): Promise<Record<string, string>> {
  const liste = await liesJson<Bildeintrag[]>('spielerbilder.json', []).catch(() => [] as Bildeintrag[]);
  const ids = new Set(org.spieler.map((s) => s.epicId).filter((x): x is string => !!x));
  const raus: Record<string, string> = {};
  for (const b of liste) if (b.epicId && b.echtesFoto && ids.has(b.epicId)) raus[b.epicId] = spielerbildKlein(b.datei);
  return raus;
}

const antwort = async (org: Org) => NextResponse.json({ ok: true, org, fotos: await fotos(org) }, { headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  const w = await wessen(new URL(request.url).searchParams.get('org'));
  if ('fehler' in w) return w.fehler;
  try {
    const org = (await liesOrgs()).find((o) => o.id === w.id);
    if (!org) return NextResponse.json({ ok: false, error: 'Diese Organisation gibt es nicht.' }, { status: 404 });
    return await antwort(org);
  } catch { return NextResponse.json({ ok: false, error: 'Die Ablage antwortet gerade nicht.' }, { status: 424 }); }
}

const NAME = /^[a-z0-9-]+\.webp$/;
const text = (x: unknown, max: number) => String(x ?? '').trim().slice(0, max);

export async function POST(request: Request) {
  const typ = request.headers.get('content-type') ?? '';

  // ---------------------------------------------------------- Foto hochladen
  if (typ.startsWith('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    const w = await wessen(String(form?.get('org') ?? '') || null);
    if ('fehler' in w) return w.fehler;
    const datei = form?.get('datei'); const name = text(form?.get('name'), 40);
    if (!(datei instanceof File) || !name) return NextResponse.json({ ok: false, error: 'Foto oder Name fehlt.' }, { status: 400 });
    if (datei.size > 15 * 1024 * 1024) return NextResponse.json({ ok: false, error: 'Das Foto ist größer als 15 MB.' }, { status: 413 });
    try {
      const bild = await sharp(Buffer.from(await datei.arrayBuffer())).rotate().resize({ height: 600, withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
      const kurz = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'spieler';
      const dateiName = `${kurz}-org-${Date.now().toString(36)}.webp`;
      if (!NAME.test(dateiName)) return NextResponse.json({ ok: false, error: 'Name nicht brauchbar.' }, { status: 400 });
      await speicher.schreib(`spielerfotos/${dateiName}`, bild);
      return NextResponse.json({ ok: true, bild: `/spielerbilder/${dateiName}` });
    } catch { return NextResponse.json({ ok: false, error: 'Das ist kein Bild, oder die Ablage antwortet nicht.' }, { status: 400 }); }
  }

  // ---------------------------------------------------------- Kader und Farbe
  const k = await request.json().catch(() => ({})) as {
    org?: string; aktion?: string; farbe?: string; index?: number; name?: string; epicId?: string; rolle?: string; seit?: string; x?: string; bild?: string | null;
  };
  const w = await wessen(k.org ?? null);
  if ('fehler' in w) return w.fehler;
  try {
    const orgs = await liesOrgs();
    const i = orgs.findIndex((o) => o.id === w.id);
    if (i < 0) return NextResponse.json({ ok: false, error: 'Diese Organisation gibt es nicht.' }, { status: 404 });
    const org: Org = JSON.parse(JSON.stringify(orgs[i]));
    const rolle = (r?: string): OrgRolle => (r === 'academy' || r === 'creator' ? r : 'pro');

    if (k.aktion === 'farbe') {
      org.farbe = /^#[0-9a-fA-F]{6}$/.test(k.farbe ?? '') ? String(k.farbe).toLowerCase() : null;
    } else if (k.aktion === 'spieler-neu') {
      const name = text(k.name, 40);
      const epicId = /^[0-9a-f]{32}$/i.test(k.epicId ?? '') ? String(k.epicId).toLowerCase() : null;
      if (!name && !epicId) return NextResponse.json({ ok: false, error: 'Name fehlt.' }, { status: 400 });
      if (epicId && org.spieler.some((s) => s.epicId === epicId)) return NextResponse.json({ ok: false, error: 'Dieser Spieler steht schon im Kader.' }, { status: 409 });
      org.spieler.push({ epicId, name, seit: /^\d{4}-\d{2}-\d{2}$/.test(k.seit ?? '') ? String(k.seit) : new Date().toISOString().slice(0, 10), rolle: rolle(k.rolle), x: text(k.x, 60) || null, twitch: null, tiktok: null, youtube: null, bild: null, liquipedia: null });
      // Wer von Hand wieder eingetragen wird, darf der Abgleich mit Liquipedia wieder fuehren.
      org.ausgeschlossen = (org.ausgeschlossen ?? []).filter((n) => n.toLowerCase() !== name.toLowerCase());
    } else if (k.aktion === 'spieler-weg' || k.aktion === 'spieler-aendern') {
      const idx = Number(k.index);
      const s = org.spieler[idx];
      if (!s || (k.name !== undefined && s.name !== k.name)) return NextResponse.json({ ok: false, error: 'Der Kader hat sich inzwischen geändert - bitte neu laden.' }, { status: 409 });
      if (k.aktion === 'spieler-weg') {
        org.spieler.splice(idx, 1);
        // Der taegliche Abgleich mit Liquipedia traegt ihn sonst gleich wieder ein.
        if (s.name) org.ausgeschlossen = [...new Set([...(org.ausgeschlossen ?? []), s.name])];
      } else {
        if (k.rolle !== undefined) s.rolle = rolle(k.rolle);
        if (k.seit !== undefined) s.seit = /^\d{4}-\d{2}-\d{2}$/.test(k.seit) ? k.seit : null;
        if (k.x !== undefined) s.x = text(k.x, 60) || null;
        if (k.bild !== undefined) s.bild = k.bild && /^\/spielerbilder\/[A-Za-z0-9%._-]+$/.test(k.bild) ? k.bild : null;
      }
    } else {
      return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400 });
    }

    orgs[i] = saeubere(org);
    await schreibOrgs(orgs);
    return await antwort(orgs[i]);
  } catch { return NextResponse.json({ ok: false, error: 'Die Ablage antwortet gerade nicht.' }, { status: 424 }); }
}
