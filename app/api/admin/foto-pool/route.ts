import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { CREDIT_FELDER, creditEingabe, type CreditEingabe } from '@/lib/fotoCredits';
import { aktivSetzen, creditSetzen, inPoolAufnehmen, istPoolId, loeschen, poolMitCredits, PoolFehler, sha1, zuordnen } from '@/lib/fotoPool';
import { liesJson } from '@/lib/ablage';

/*
 * Der Foto-Pool (lib/fotoPool.ts) - nur fuer den Admin, die Seite dazu ist /admin/fotos-pool. Jede Anfrage wird hier geprueft; dass die Seite
 * sich vor anderen versteckt, schuetzt nichts.
 *
 *   GET   -> { fotos: [{ id, erstellt, epicId, name, aktiv, credit, original, bild }], namen: { <epicId>: Anzeigename } }
 *   POST  JSON { aktion: 'zuordnen', id, epicId, name }   zuordnen / umhaengen; epicId "" loest
 *              { aktion: 'aktiv', id }                    das oeffentliche Foto des Spielers
 *              { aktion: 'loeschen', id }
 *              { aktion: 'credit', id, felder: { quelle?, fotograf?, handle?, link?, lizenz?, bestaetigt? } }
 *   POST  Formular (datei + Credit-Felder)                 einen fertigen Zuschnitt in den Pool legen (scripts/fotos-pool-import.mjs schreibt
 *                                                         direkt in die Ablage; dies ist derselbe Weg ueber die Seite)
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const nein = () => NextResponse.json({ ok: false, error: 'Nur für Admins.' }, { status: 403 });
const privat = { 'Cache-Control': 'private, no-store' };

export async function GET() {
  if (!await istAdminAnfrage()) return nein();
  const [fotos, profile] = await Promise.all([
    poolMitCredits(),
    liesJson<Record<string, { anzeige?: string; name?: string }>>('spieler-profile.json', {}),
  ]);
  const namen: Record<string, string> = {};
  for (const f of fotos) if (f.epicId && !namen[f.epicId]) namen[f.epicId] = String(profile[f.epicId]?.anzeige || profile[f.epicId]?.name || f.name || '');
  return NextResponse.json({
    ok: true,
    namen,
    fotos: fotos.sort((a, b) => b.erstellt - a.erstellt).map((f) => ({
      id: f.id, erstellt: f.erstellt, epicId: f.epicId, name: f.name ?? '', aktiv: Boolean(f.aktiv), oeffentlich: Boolean(f.spielerDatei),
      credit: f.credit, original: f.original ?? '', bild: `/api/admin/foto-pool/bild?id=${f.id}`,
    })),
  }, { headers: privat });
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage()) return nein();
  try {
    if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      const form = await request.formData();
      const datei = form.get('datei');
      if (!(datei instanceof File)) return NextResponse.json({ ok: false, error: 'Foto fehlt' }, { status: 400 });
      if (datei.size > 15 * 1024 * 1024) return NextResponse.json({ ok: false, error: 'Größer als 15 MB' }, { status: 413 });
      const roh = Buffer.from(await datei.arrayBuffer());
      const credit = creditEingabe((f) => { const v = form.get(f); return typeof v === 'string' && v ? v : undefined; });
      const r = await inPoolAufnehmen(roh, { original: datei.name, quelleSha1: sha1(roh), credit });
      return NextResponse.json(r.ok ? { ok: true, id: r.foto.id } : { ok: false, error: `Nicht aufgenommen: ${r.grund}${r.wie ? ` (wie ${r.wie})` : ''}`, grund: r.grund },
        { status: r.ok ? 200 : 409 });
    }
    const e = await request.json().catch(() => null) as { aktion?: string; id?: string; epicId?: string; name?: string; felder?: Record<string, unknown> } | null;
    const id = String(e?.id ?? '');
    if (!e || !istPoolId(id)) return NextResponse.json({ ok: false, error: 'Unbekanntes Foto' }, { status: 400 });
    if (e.aktion === 'zuordnen') await zuordnen(id, String(e.epicId ?? ''), String(e.name ?? ''));
    else if (e.aktion === 'aktiv') await aktivSetzen(id);
    else if (e.aktion === 'loeschen') await loeschen(id);
    else if (e.aktion === 'credit') {
      const felder: CreditEingabe = {};
      for (const f of CREDIT_FELDER) if (e.felder?.[f] !== undefined) felder[f] = e.felder[f];
      return NextResponse.json({ ok: true, credit: await creditSetzen(id, felder) });
    } else return NextResponse.json({ ok: false, error: 'Unbekannte Aktion' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (f) {
    if (f instanceof PoolFehler) return NextResponse.json({ ok: false, error: f.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: `Speichern gescheitert: ${(f as Error).message}` }, { status: 503 });
  }
}
