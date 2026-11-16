import { NextResponse } from 'next/server';
import { liesJson } from '@/lib/ablage';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { wirfWeg } from '@/lib/antwortSpeicher';
import { namensSchluessel } from '@/lib/homoglyph';
import { landNach } from '@/lib/laender';
import { PROFIL_DATEI, profilAendern, EingabeFehler, type SpielerProfil } from '@/lib/spielerProfil';

/*
 * Flaggen und X-Konten der wichtigen Spieler nachtragen (Betreiber, 16.11.2026) - nur fuer den Admin, die Seite dazu ist /admin/flaggen.
 *
 *   GET   -> { stand, regeln, zeilen: [...], ausgeschlossen }  jeder wichtige Spieler (scripts/flaggen-wichtig.mjs, spieler-kreis/_wichtig.json), dem in
 *            spieler-profile.json die Flagge oder das X-Konto fehlt; dazu, woher eine automatische Flagge kaeme (Szene-Liste, Epics Power Ranking).
 *   POST  { id, name, land?, x?, twitch? }  -> ein Feld, das fehlt, bleibt, wie es ist; "" loescht (lib/spielerProfil.ts).
 *
 * Die Profile werden bei jedem Aufruf frisch gelesen, die Liste der wichtigen Spieler kommt vom Release (alle sechs Stunden neu, spieler-kreis.yml).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** [punkte, final, semi, heat, runde, cup, besteFinal, letzte, region, name, prRang, weg] - siehe scripts/flaggen-wichtig.mjs. */
type Wichtig = [number, number, number, number, number, number, number | null, number | null, string, string, number | null, (1 | undefined)?];
interface WichtigDatei { stand: number; regeln: unknown; konten: Record<string, Wichtig> }
interface SzeneSpieler { ID?: string; NAME?: string; COUNTRY?: string }
interface PrDatei { spieler?: Array<{ id?: string; land?: string; rank?: number }> }

export interface FlaggenZeile {
  rang: number; id: string; name: string; namen: string[]; region: string;
  punkte: number; final: number; semi: number; heat: number; runde: number; cup: number; besteFinal: number | null; letzte: number | null; pr: number | null;
  land: string; x: string; twitch: string;
  /** Was die Seite ohne gepflegtes Land zeigen wuerde - nur ein Vorschlag, nie gespeichert. */
  auto: { land: string; quelle: string } | null;
  /** Das Profil liegt noch unter dem Namen (ohne Konto-Id) - beim Speichern wandert es unter die Id. */
  alterEintrag: string | null;
  /** Was unter der Konto-Id fehlt (beim Laden) - danach filtert die Seite. */
  fehlt: { land: boolean; x: boolean };
  /** Der Name, der beim Speichern mitgeht (findet den Alteintrag). */
  speicherName: string;
}

const nein = () => NextResponse.json({ ok: false, error: 'Nur für Admins.' }, { status: 403 });

export async function GET() {
  if (!await istAdminAnfrage()) return nein();
  const [wichtig, profile, namen, szene, pr] = await Promise.all([
    liesJson<WichtigDatei | null>('spieler-kreis/_wichtig.json', null),
    liesJson<Record<string, SpielerProfil>>(PROFIL_DATEI, {}),
    liesJson<Record<string, { namen?: string[]; haupt?: string }>>('spieler-namen.json', {}),
    liesJson<SzeneSpieler[]>('szene-quelle/spielerliste.json', []),
    liesJson<PrDatei | null>('power-rankings/global.json', null),
  ]);
  if (!wichtig?.konten) {
    return NextResponse.json({ ok: false, error: 'Die Liste der wichtigen Spieler ist noch nicht gerechnet (spieler-kreis/_wichtig.json fehlt am Release). Sie entsteht im Lauf "Spieler-Kreis".' }, { status: 503 });
  }

  const nachId = new Map<string, SpielerProfil>();
  const nachName = new Map<string, [string, SpielerProfil]>();
  for (const [k, p] of Object.entries(profile)) {
    const id = (p.id || (/^[0-9a-f]{32}$/i.test(k) ? k : '')).toLowerCase();
    if (id) nachId.set(id, p);
    else nachName.set(k, [k, p]);
  }
  const szeneLand = new Map<string, string>();
  for (const s of szene) {
    const id = String(s.ID ?? '').trim().toLowerCase();
    const l = String(s.COUNTRY ?? '').trim().toUpperCase();
    if (id && landNach(l)) szeneLand.set(id, l);
  }
  const prLand = new Map<string, string>();
  for (const s of pr?.spieler ?? []) {
    const id = String(s.id ?? '').replace(/-/g, '').toLowerCase();
    const l = String(s.land ?? '').trim().toUpperCase();
    if (id && landNach(l)) prLand.set(id, l);
  }

  const ausgeschlossen = { geloescht: 0, turnierkonto: 0, vollstaendig: 0, ohneName: 0 };
  const zeilen: FlaggenZeile[] = [];
  const sortiert = Object.entries(wichtig.konten).sort((a, b) => b[1][0] - a[1][0]);
  let rang = 0;
  for (const [id, w] of sortiert) {
    rang += 1;
    const [punkte, final, semi, heat, runde, cup, besteFinal, letzte, region, epicName, prRang, weg] = w;
    const bekannt = namen[id];
    const alle = [...new Set([epicName, bekannt?.haupt ?? '', ...(bekannt?.namen ?? [])].map((n) => String(n ?? '').trim()).filter(Boolean))];
    const eigen = nachId.get(id);
    // Ein alter Eintrag nur unter dem Namen (ohne Konto-Id): die Statistik liest ihn nicht (sie kennt nur Eintraege mit Id), deshalb bleibt die Zeile offen,
    // bis unter der Id gespeichert ist - der Alteintrag wandert dann mit (lib/spielerProfil.ts).
    let alt: SpielerProfil | undefined;
    let alterEintrag: string | null = null;
    let speicherName = '';
    if (!eigen?.land || !eigen?.x) {
      for (const n of alle) { const t = nachName.get(namensSchluessel(n)); if (t) { alterEintrag = t[0]; alt = t[1]; speicherName = n; break; } }
    }
    const name = eigen?.anzeige || alt?.anzeige || alle[0] || '';
    // Offensichtlicher Ausschuss: ein Konto, das Epic nicht mehr kennt (geloescht oder gesperrt), oder ein Turnierkonto eines LAN, das nicht zugeordnet
    // werden konnte ("[FNCSGC26] ...") - es bekommt Flagge und X vom echten Konto. Ein Konto ohne bekannten Namen bleibt: dann steht die Id da.
    if (weg && !eigen && !alt) { ausgeschlossen.geloescht += 1; continue; }
    if (!name) ausgeschlossen.ohneName += 1;
    if (!eigen && !alt && /^\[[^\]]+\]/.test(name)) { ausgeschlossen.turnierkonto += 1; continue; }
    if (eigen?.land && eigen?.x) { ausgeschlossen.vollstaendig += 1; continue; }
    const land = (eigen?.land || alt?.land || '').toUpperCase();
    const x = eigen?.x || alt?.x || '';
    const auto = land ? null
      : szeneLand.has(id) ? { land: szeneLand.get(id)!, quelle: 'Szene-Liste' }
        : prLand.has(id) ? { land: prLand.get(id)!, quelle: 'Power Ranking' } : null;
    zeilen.push({
      rang, id, name, namen: alle.filter((n) => n !== name).slice(0, 6), region: eigen?.region || alt?.region || region || '',
      punkte, final, semi, heat, runde, cup, besteFinal, letzte, pr: prRang,
      land, x, twitch: eigen?.twitch || alt?.twitch || '', auto, alterEintrag,
      fehlt: { land: !eigen?.land, x: !eigen?.x }, speicherName: speicherName || epicName || name,
    });
  }
  return NextResponse.json({ ok: true, stand: wichtig.stand, regeln: wichtig.regeln, wichtig: sortiert.length, zeilen, ausgeschlossen },
    { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage()) return nein();
  let e: { id?: string; name?: string; land?: string; x?: string; twitch?: string };
  try { e = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'Kein JSON' }, { status: 400 }); }
  if (!/^[0-9a-f]{32}$/i.test(e.id ?? '')) return NextResponse.json({ ok: false, error: 'Epic-Konto-Id fehlt' }, { status: 400 });
  try {
    // Nur die Felder, die die Zeile wirklich schickt - alles andere im Profil bleibt (lib/spielerProfil.ts).
    const { schluessel, profil } = await profilAendern({
      id: e.id, name: e.name ?? '',
      ...(e.land !== undefined ? { land: e.land } : {}),
      ...(e.x !== undefined ? { x: e.x } : {}),
      ...(e.twitch !== undefined ? { twitch: e.twitch } : {}),
    });
    // Vorgerechnete Antworten, die das Profil enthalten: Player Center (90 Minuten) und die Spielerprofile (in Sekunden neu aus der Akte).
    void wirfWeg('center|');
    void wirfWeg('szene_spieler=');
    return NextResponse.json({ ok: true, schluessel, profil });
  } catch (f) {
    if (f instanceof EingabeFehler) return NextResponse.json({ ok: false, error: f.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: `Speichern gescheitert: ${(f as Error).message}` }, { status: 503 });
  }
}
