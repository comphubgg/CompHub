import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { creditEingabe } from '@/lib/fotoCredits';
import { aktionAus, inPoolAufnehmen, liesPool, poolMitCredits, PoolFehler, sha1 } from '@/lib/fotoPool';
import { abgleichAnstossen, CID, einreihen, mitWartendem, reiheZustand } from '@/lib/fotoPoolReihe';
import { liesJson } from '@/lib/ablage';

/*
 * Der Foto-Pool (lib/fotoPool.ts) - nur fuer den Admin, die Seite dazu ist /admin/fotos-pool. Jede Anfrage wird hier geprueft; dass die Seite
 * sich vor anderen versteckt, schuetzt nichts. Jede Antwort ist JSON - auch ohne Anmeldung (403) und bei einem Fehler im Server (500/503).
 *
 *   GET   -> { fotos: [{ id, erstellt, epicId, name, aktiv, oeffentlich, credit, original, bild }], namen: { <epicId>: Anzeigename }, reihe }
 *            (Wartendes aus der Schreibreihe ist schon eingerechnet)
 *   POST  JSON { cid, aktion: 'zuordnen', id, epicId, name }   zuordnen / umhaengen; epicId "" loest
 *              { cid, aktion: 'aktiv', id }                    das oeffentliche Foto des Spielers
 *              { cid, aktion: 'loeschen', id }                 samt Datei in fotopool/ und oeffentlicher Kopie
 *              { cid, aktion: 'credit', id, felder: { quelle?, fotograf?, handle?, link?, lizenz?, bestaetigt? } }
 *         -> sofort { ok, cid, stand: { art: 'wartet' } }: geschrieben wird gesammelt, ein Commit fuer alles Wartende (lib/fotoPoolReihe.ts).
 *            Den Stand fragt die Seite unter /api/admin/foto-pool/status ab. cid vergibt die Seite (8-64 Zeichen); dieselbe cid zweimal = einmal.
 *   POST  Formular (datei + Credit-Felder)                 einen fertigen Zuschnitt in den Pool legen (scripts/fotos-pool-import.mjs schreibt
 *                                                         direkt in die Ablage; dies ist derselbe Weg ueber die Seite)
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const privat = { 'Cache-Control': 'private, no-store' };
const antwort = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: privat });
const nein = () => antwort({ ok: false, error: 'Nur für Admins – bitte (neu) anmelden.', anmelden: true }, 403);

export async function GET() {
  try {
    if (!await istAdminAnfrage()) return nein();
    const pool = mitWartendem(await liesPool());
    const [fotos, profile] = await Promise.all([
      poolMitCredits(pool),
      liesJson<Record<string, { anzeige?: string; name?: string }>>('spieler-profile.json', {}),
    ]);
    // Ein halber Stand von frueher (aktives Foto ohne oeffentliche Kopie): einmal im Hintergrund abgleichen.
    if (fotos.some((f) => f.epicId && f.aktiv && !f.spielerDatei)) abgleichAnstossen();
    const namen: Record<string, string> = {};
    for (const f of fotos) if (f.epicId && !namen[f.epicId]) namen[f.epicId] = String(profile[f.epicId]?.anzeige || profile[f.epicId]?.name || f.name || '');
    return antwort({
      ok: true,
      namen,
      reihe: reiheZustand(),
      fotos: fotos.sort((a, b) => b.erstellt - a.erstellt).map((f) => ({
        id: f.id, erstellt: f.erstellt, epicId: f.epicId, name: f.name ?? '', aktiv: Boolean(f.aktiv), oeffentlich: Boolean(f.spielerDatei),
        credit: f.credit, original: f.original ?? '', bild: `/api/admin/foto-pool/bild?id=${f.id}`,
      })),
    });
  } catch (f) {
    return antwort({ ok: false, error: `Pool nicht lesbar: ${String((f as Error)?.message ?? f).slice(0, 200)}` }, 503);
  }
}

export async function POST(request: Request) {
  try {
    if (!await istAdminAnfrage()) return nein();
    if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      const form = await request.formData();
      const datei = form.get('datei');
      if (!(datei instanceof File)) return antwort({ ok: false, error: 'Foto fehlt' }, 400);
      if (datei.size > 15 * 1024 * 1024) return antwort({ ok: false, error: 'Größer als 15 MB' }, 413);
      const roh = Buffer.from(await datei.arrayBuffer());
      const credit = creditEingabe((f) => { const v = form.get(f); return typeof v === 'string' && v ? v : undefined; });
      const r = await inPoolAufnehmen(roh, { original: datei.name, quelleSha1: sha1(roh), credit });
      return antwort(r.ok ? { ok: true, id: r.foto.id } : { ok: false, error: `Nicht aufgenommen: ${r.grund}${r.wie ? ` (wie ${r.wie})` : ''}`, grund: r.grund },
        r.ok ? 200 : 409);
    }
    const e = await request.json().catch(() => null) as Record<string, unknown> | null;
    const cid = String(e?.cid ?? '');
    if (!CID.test(cid)) return antwort({ ok: false, error: 'Kennung der Änderung (cid) fehlt' }, 400);
    const a = aktionAus(e);
    // Gibt es das Foto (mit allem, was schon wartet)? Ein zweites Loeschen ist kein Fehler.
    if (a.aktion !== 'loeschen' && !mitWartendem(await liesPool()).fotos.some((f) => f.id === a.id)) throw new PoolFehler('Unbekanntes Foto');
    const stand = await einreihen(cid, a);
    return antwort({ ok: true, cid, stand, reihe: reiheZustand() });
  } catch (f) {
    if (f instanceof PoolFehler) return antwort({ ok: false, error: f.message }, 400);
    console.error('[foto-pool] POST', f);
    return antwort({ ok: false, error: `Interner Fehler: ${String((f as Error)?.message ?? f).slice(0, 200)}` }, 500);
  }
}
