import { NextResponse } from 'next/server';
import { GET as katalogAbruf } from '@/app/api/cup-catalog/route';
import { holeTop } from '@/lib/epicCups';
import { spielerKontext } from '@/lib/globalsSolos';
import { abgelegteAntwort } from '@/lib/antwortSpeicher';
import { ueberdauernd } from '@/lib/ueberdauernd';
import { finale, type KatalogCup } from '@/lib/ergebnisPosts';
import { LISTE, lies as prLies } from '@/lib/powerRankings';
import { regionVonLand } from '@/lib/landRegion';

/*
 * Der gemeinsame Spieler-Pool der Tierlist fuer Solo und Duo - wie die Trios (app/api/tierlist-trios) aus echten Daten statt aus der alten
 * Spielerliste, die an der nicht mehr erreichbaren Supabase-Datenbank hing (30.10.2026: /api/players lieferte 3 Spieler, /api/duos 1 Duo - "die Solo-
 * und Duo-Liste ist einfach ein paar Mal leer ... auch wenn man ausgeloggt ist, soll da Leute drin sein").
 *
 *   GET ?modus=solo  -> die Besten jeder Region aus dem Archiv (Name, Land, Region) - dieselben wie in der Statistik
 *   GET ?modus=duo   -> die besten Duos der juengsten beendeten Duo-Finals je Region (Epics Bestenliste, Namen und Flaggen ueber die Konto-Id)
 *
 * Sechs Stunden frisch, danach im Hintergrund erneuert; der letzte gute Stand haelt eine Woche (lib/ueberdauernd).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const SEITE = 'https://www.thecomphub.com';
const JE_REGION_SOLO = 25;
/** Dazu die bekannten Profis aus den Power Rankings (nur mit Profil/Flagge), bis zu so vielen Solos insgesamt. */
const SOLO_HOECHSTENS = 200;
const JE_REGION_DUO = 15;

interface Mitglied { name: string; land?: string | null }
interface PoolEintrag { spieler: Mitglied[]; region: string }

async function soloPool(): Promise<PoolEintrag[] | null> {
  const start = await abgelegteAntwort<{ profile?: Array<{ region: string; spieler: Array<{ anzeige?: string; name: string; land?: string | null }> }> }>('szene|ansicht=start').catch(() => null);
  if (!start?.profile?.length) return null;
  const raus: PoolEintrag[] = [];
  const gesehen = new Set<string>();
  for (const r of start.profile) {
    for (const s of r.spieler.slice(0, JE_REGION_SOLO)) {
      const name = (s.anzeige || s.name || '').trim();
      if (!name || gesehen.has(name.toLowerCase())) continue;
      gesehen.add(name.toLowerCase());
      raus.push({ spieler: [{ name, land: s.land ?? null }], region: r.region });
    }
  }
  // Die Besten jeder Region aus dem Archiv sind nur wenige - dazu die Profis aus den Power Rankings, nach ihrem Platz.
  const pr = await prLies(LISTE).catch(() => null);
  if (pr?.spieler?.length) {
    const kontext = await spielerKontext();
    for (const s of pr.spieler) {
      if (raus.length >= SOLO_HOECHSTENS) break;
      const k = s.id ? kontext(s.id, s.name) : null;
      if (!k?.land) continue;
      const name = (k.anzeige || s.name || '').trim();
      if (!name || gesehen.has(name.toLowerCase())) continue;
      gesehen.add(name.toLowerCase());
      raus.push({ spieler: [{ name, land: k.land }], region: regionVonLand(k.land) || 'EU' });
    }
  }
  return raus.length ? raus : null;
}

async function duoPool(): Promise<PoolEintrag[] | null> {
  const katalog = await (await katalogAbruf(new Request(`${SEITE}/api/cup-catalog?modus=standard`))).json() as { cups?: KatalogCup[] };
  const kontext = await spielerKontext();
  const raus: PoolEintrag[] = [];
  const gesehen = new Set<string>();
  // Je Region das juengste beendete Finale eines Duo-Cups (Arena und Ranked zaehlen nicht - dort spielt jeder mit jedem).
  for (const region of ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE']) {
    const kandidaten = (katalog.cups ?? [])
      .filter((c) => /duo/i.test(c.titel) && !/ranked|arena|test/i.test(c.titel))
      .flatMap((c) => (c.regionen?.[region] ?? []).filter((f) => f.status === 'vorbei' && finale(c, f, c.regionen?.[region] ?? [])).map((f) => ({ c, f })))
      .sort((a, b) => (b.f.end ?? 0) - (a.f.end ?? 0));
    const k = kandidaten[0];
    if (!k) continue;
    const top = await holeTop(k.f.eventId, k.f.windowId, 30).catch(() => null);
    for (const e of (top?.entries ?? []).slice(0, JE_REGION_DUO) as Array<{ players?: Array<{ id?: string; name: string }>; teamAccountIds?: string[] }>) {
      const spieler = (e.players ?? []).slice(0, 2).map((p) => {
        const kx = p.id ? kontext(p.id, p.name) : null;
        return { name: kx?.anzeige || p.name, land: kx?.land ?? null };
      });
      // Ohne aufgeloesten Namen (gekuerzte Konto-Id, wenn Epic die Namensabfrage bremst) oder ohne einen bekannten Profi (Flagge) kein Duo - die kennt niemand.
      if (spieler.length !== 2 || spieler.some((s) => /^[0-9a-f]{8}$/i.test(s.name)) || !spieler.some((s) => s.land)) continue;
      const schluessel = spieler.map((s) => s.name.toLowerCase()).sort().join('|');
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      raus.push({ spieler, region });
    }
  }
  return raus.length ? raus : null;
}

export async function GET(request: Request) {
  const modus = new URL(request.url).searchParams.get('modus') === 'duo' ? 'duo' : 'solo';
  const sechsStunden = 6 * 3_600_000;
  const pool = await ueberdauernd(`tierlist-pool-v3-${modus}`, sechsStunden, 7 * 864e5, () => (modus === 'duo' ? duoPool() : soloPool())).catch(() => null);
  return NextResponse.json({ ok: Boolean(pool), modus, pool: pool ?? [] }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
