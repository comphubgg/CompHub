import { NextResponse, type NextRequest } from 'next/server';
import { istBetreiberOderAdminKonto } from '@/lib/adminPruefung';
import { besucheJeTag, tagVon } from '@/lib/besuche';
import { detailsUeber } from '@/lib/besuchDetails';

/*
 * Woher die Besucher kommen - fuer den Abschnitt "Besucher" im Dashboard (nur Admins).
 *
 * ?spanne=gestern | 7 | 30. Gestern ist der letzte ganze Tag, 7 und 30 enden heute. Summen aus lib/besuchDetails, die
 * Gesamtzahlen dazu aus besuche.json (fuer die Prozente). Die 15 meistbesuchten Profile bekommen ihren Namen ueber
 * dieselbe Suche wie der Tab-Titel des Profils (app/statistics/page.tsx).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WURZEL = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');

const namen = new Map<string, { name: string | null; bis: number }>();

async function nameVon(id: string): Promise<string | null> {
  const alt = namen.get(id);
  if (alt && alt.bis > Date.now()) return alt.name;
  let name: string | null = null;
  try {
    const r = await fetch(`${WURZEL}/api/szene-stats?ansicht=suche&q=${encodeURIComponent(id)}`, {
      next: { revalidate: 3600 }, signal: AbortSignal.timeout(4000),
    });
    const d = r.ok ? await r.json() : null;
    const s = (Array.isArray(d?.spieler) ? d.spieler[0] : d?.spieler) as { epicId?: string; anzeige?: string; name?: string } | undefined;
    if (s && s.epicId?.toLowerCase() === id) name = (s.anzeige || s.name || '').trim() || null;
    if (!name) {
      const v = await fetch(`${WURZEL}/api/spieler-verlauf?id=${encodeURIComponent(id)}`, {
        next: { revalidate: 3600 }, signal: AbortSignal.timeout(4000),
      });
      const j = v.ok ? await v.json() as { name?: string | null } : null;
      name = (j?.name || '').trim() || null;
    }
  } catch { /* ohne Namen */ }
  namen.set(id, { name, bis: Date.now() + (name ? 6 * 3600_000 : 10 * 60_000) });
  return name;
}

export async function GET(request: NextRequest) {
  if (!await istBetreiberOderAdminKonto()) {
    return NextResponse.json({ fehler: 'Nicht erlaubt.' }, { status: 403 });
  }
  const wunsch = request.nextUrl.searchParams.get('spanne');
  const spanne = wunsch === 'gestern' ? 'gestern' : wunsch === '7' ? '7' : '30';

  const tage: string[] = [];
  const heute = new Date();
  if (spanne === 'gestern') {
    const d = new Date(heute); d.setDate(d.getDate() - 1); tage.push(tagVon(d));
  } else {
    for (let i = Number(spanne) - 1; i >= 0; i--) { const d = new Date(heute); d.setDate(d.getDate() - i); tage.push(tagVon(d)); }
  }

  const [details, besuche] = await Promise.all([detailsUeber(tage), besucheJeTag()]);
  const imZeitraum = besuche.filter((b) => tage.includes(b.tag));
  const gesamt = {
    besucher: imZeitraum.reduce((a, b) => a + b.besucher, 0),
    aufrufe: imZeitraum.reduce((a, b) => a + b.aufrufe, 0),
  };
  const spieler = await Promise.all(details.spieler.map(async (s) => ({ ...s, name: await nameVon(s.id) })));

  return NextResponse.json({
    spanne, von: tage[0], bis: tage[tage.length - 1], gesamt, ...details, spieler,
    /** Ob Cloudflare in diesem Zeitraum je eine Stadt mitgeschickt hat (cf-ipcity) - gemessen, nicht vermutet. */
    ortVerfuegbar: (details.koepfe['cf-ipcity'] ?? 0) > 0,
  });
}
