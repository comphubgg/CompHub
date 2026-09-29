import { NextResponse } from 'next/server';
import fs from '@/lib/ablageFs';
import path from 'path';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { DATEN_ORT } from '@/lib/datenOrt';

/*
 * Die Trios der Tierlist - fuer alle Konten gemeinsam.
 *
 * Trios sind fuer 2027 als Hauptmodus angekuendigt. Der Betreiber
 * (29.9.2026): die Trios "vom Performance Cup als allererstes generiert ...
 * automatisch mit Flagge", "immer wieder updaten", und was er selbst
 * hinzufuegt, "speichert es die fuer immer und ueberall. Ausser ich loesche
 * sie dann manuell".
 *
 * Deshalb zwei Quellen:
 *
 *   - Automatisch: scripts/tierlist-trios.mjs rechnet im stuendlichen Lauf
 *     aus den Trio-Spieltagen, wer gerade mit wem spielt (je Spieler das
 *     juengste Trio, Flaggen ueber die Konto-Id), und legt das Ergebnis am
 *     Release ab. Wechselt ein Spieler sein Trio, steht beim naechsten Lauf
 *     das neue da.
 *   - Vom Admin angelegt: data/tierlist-trios.json in der Ablage. Bleibt,
 *     bis er es loescht.
 *
 * Was der Admin loescht, steht zusaetzlich in /api/tierlist-entfernt - so
 * verschwindet auch ein automatisches Trio ueberall, und kommt beim
 * naechsten Lauf nicht wieder.
 *
 *   GET                                   -> { trios: [...] }
 *   POST { spieler: [{name, land}] x3, region }   -> anlegen (nur Admin)
 *   DELETE ?schluessel=...                -> ein angelegtes loeschen (nur Admin)
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EIGENE = path.join(DATEN_ORT, 'tierlist-trios.json');
const AUTO = path.join(DATEN_ORT, 'antworten', 'tierlist_trios_auto.json');

interface Mitglied { name: string; land?: string; id?: string }
interface Trio {
  schluessel: string;
  spieler: Mitglied[];
  region?: string;
  quelle: 'admin' | 'auto';
  cup?: string;
  platz?: number;
  wann?: string;
}

const namensTeil = (n: string) => String(n ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Derselbe Schluessel wie getTrioKey in der Tierlist. */
function schluesselVon(namen: string[]): string {
  const teile = namen.map(namensTeil);
  if (teile.some((t) => !t)) return '';
  return `trio:${teile.sort().join('|')}`;
}

async function liesEigene(): Promise<Trio[]> {
  try {
    const j = JSON.parse(await fs.readFile(EIGENE, 'utf8'));
    return Array.isArray(j?.trios) ? j.trios : [];
  } catch {
    return [];
  }
}

async function schreibeEigene(trios: Trio[]) {
  await fs.mkdir(path.dirname(EIGENE), { recursive: true });
  await fs.writeFile(EIGENE, JSON.stringify({ trios }, null, 1), 'utf8');
}

let autoMerker: { bis: number; trios: Trio[]; stand: number | null } | null = null;

async function liesAuto(): Promise<{ trios: Trio[]; stand: number | null }> {
  if (autoMerker && Date.now() < autoMerker.bis) return autoMerker;
  try {
    const j = JSON.parse(await fs.readFile(AUTO, 'utf8'));
    const trios: Trio[] = (j?.wert?.trios ?? []).map((t: Trio) => ({ ...t, quelle: 'auto' as const }));
    autoMerker = { bis: Date.now() + 5 * 60_000, trios, stand: j?.zeit ?? null };
  } catch {
    autoMerker = { bis: Date.now() + 60_000, trios: [], stand: null };
  }
  return autoMerker;
}

export async function GET() {
  const [eigene, auto] = await Promise.all([liesEigene(), liesAuto()]);
  const gesehen = new Set(eigene.map((t) => t.schluessel));
  const trios = [...eigene, ...auto.trios.filter((t) => t.schluessel && !gesehen.has(t.schluessel))];
  return NextResponse.json({
    success: true,
    trios,
    eigene: eigene.length,
    automatisch: auto.trios.length,
    stand: auto.stand,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ error: 'nur fuer den Admin' }, { status: 403 });
  }
  const koerper = await request.json().catch(() => ({}));
  const spieler: Mitglied[] = (Array.isArray(koerper.spieler) ? koerper.spieler : [])
    .map((s: Mitglied) => ({
      name: String(s?.name ?? '').trim(),
      ...(s?.land ? { land: String(s.land).trim().toUpperCase() } : {}),
    }))
    .filter((s: Mitglied) => s.name);
  if (spieler.length !== 3) {
    return NextResponse.json({ error: 'ein Trio braucht drei Namen' }, { status: 400 });
  }
  const schluessel = schluesselVon(spieler.map((s) => s.name));
  if (!schluessel || new Set(spieler.map((s) => namensTeil(s.name))).size < 3) {
    return NextResponse.json({ error: 'drei verschiedene Namen noetig' }, { status: 400 });
  }
  const liste = await liesEigene();
  if (!liste.some((t) => t.schluessel === schluessel)) {
    liste.push({
      schluessel,
      spieler,
      region: typeof koerper.region === 'string' ? koerper.region : undefined,
      quelle: 'admin',
      wann: new Date().toISOString(),
    });
    await schreibeEigene(liste);
  }
  return NextResponse.json({ success: true, schluessel, anzahl: liste.length });
}

export async function DELETE(request: Request) {
  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ error: 'nur fuer den Admin' }, { status: 403 });
  }
  const schluessel = new URL(request.url).searchParams.get('schluessel') ?? '';
  if (!schluessel) return NextResponse.json({ error: 'kein Schluessel' }, { status: 400 });
  const vorher = await liesEigene();
  const liste = vorher.filter((t) => t.schluessel !== schluessel);
  if (liste.length !== vorher.length) await schreibeEigene(liste);
  return NextResponse.json({ success: true, anzahl: liste.length });
}
