import { NextResponse } from 'next/server';
import { liesJson, schreibJson } from '@/lib/ablage';
import { darfBereichAnfrage } from '@/lib/adminPruefung';
import { zwischenspeichern } from '@/lib/zwischenspeicher';
import seedStandard from '@/lib/prospectsSeed.json';

/*
 * Prospects (Betreiber, 15.11.2026; neu gerechnet am 16.11.2026): junge Spieler auf dem Weg nach oben, nach Score geordnet.
 *
 * Die Fakten je Konto rechnet scripts/spieler-kreis.mjs alle sechs Stunden (spieler-kreis/_prospects.json, die Regeln stehen dort oben):
 * Power-Ranking-Punkte, Durchbruch und "Neu", Trend, Grand Finals, ob jemand schon etabliert ist und ob er automatisch Kandidat ist.
 * Hier kommen dazu:
 *   - die redaktionelle Seed-Liste (lib/prospectsSeed.json, oder prospects.json -> seed, wenn sie dort gespeichert ist):
 *     ein Alter kennen wir nicht; wer nach Wissen der Redaktion jung ist, zaehlt als ganz neu (Neu = 1) und ist immer Kandidat,
 *   - die Pflege im Admin (prospects.json -> eintraege): aufnehmen (zaehlt wie Seed), entfernen, Stern, fester Platz.
 *   Score = Power-Ranking-Punkte + regeln.neu * Neu + regeln.trend * Trend;  Rating = Score / regeln.referenz.
 * Die Flagge nur aus unseren Profilen (spieler-profile.json) - nie geraten.
 *
 *   GET ?region=EU            -> { titelJahr, regeln, liste: [{ rang, epicId, name, region, land, rating, stern, grund, ... }] }  (hoechstens 100)
 *   GET ?verwaltung=1         -> alles, auch Entfernte und Seed-Spieler ohne aktuelle Daten (nur Admin / Player Center)
 *   POST { epicId, name?, region?, aktion?: 'add'|'remove'|null, stern?: boolean|null, platz?: number|null }  (nur Admin / Player Center)
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PFLEGE = 'prospects.json';
const STERNE = 11;
const ZEIGEN = 100;
const REGIONEN = new Set(['EU', 'NAC', 'NAW', 'BR', 'OCE', 'ME', 'ASIA']);

/** Fakten je Konto aus scripts/spieler-kreis.mjs (kurze Schluessel, siehe dort). */
interface Konto {
  r: number; w: number; d: number; h: string; e: number; t: number; n: number;
  b: [number, string, number, 'fncs' | 'cup'] | null; g: number; p: number; s?: 1; x?: 1; k?: 1; name?: string;
}
export interface Regeln {
  aktivTage: number; minEvents: number; jahre: number; neu: number; trend: number; trendMax: number; prMax: number; t10Feld: number;
  gfSaisons: number; podien: number; referenz: number;
}
interface Rechnung { stand: number; prStand: number | null; regeln: Regeln; konten: Record<string, Konto> }
export interface SeedEintrag { epicId: string; name?: string; kern?: boolean }
export interface PflegeEintrag { name?: string; region?: string; aktion?: 'add' | 'remove'; stern?: boolean; platz?: number; geaendert?: number }
type Pflege = { eintraege: Record<string, PflegeEintrag>; seed?: SeedEintrag[] };
interface Profil { id?: string; name?: string; anzeige?: string; land?: string; region?: string }

/** Warum ein Spieler in der Liste steht - die Oberflaeche macht daraus den Text. */
export interface Grund {
  /** Redaktion: Seed-Liste (seed), im Admin aufgenommen (add), sonst automatisch. */
  quelle: 'seed' | 'add' | 'auto';
  kern: boolean;
  prRang: number | null; prPunkte: number | null;
  neu: number | null;
  durchbruch: { datum: number; titel: string; platz: number; art: 'fncs' | 'cup' } | null;
  trend: number | null; grandFinals: number | null; etabliert: boolean;
}
export interface ProspectZeile {
  rang: number; epicId: string; name: string; region: string; land: string | null; rating: number; stern: boolean; grund: Grund;
  /** Von Hand gesetzter Platz / Stern. */
  platzFest: number | null; sternFest: boolean | null;
  /** Nur in der Verwaltung: von Hand entfernt / ohne aktuelle Daten (nicht im Power Ranking oder zu wenige Spieltage). */
  entfernt?: boolean; ohneDaten?: boolean;
}

const istId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{32}$/.test(s);
const STANDARD_SEED = ((seedStandard as { seed?: SeedEintrag[] }).seed ?? []).filter((s) => istId(s.epicId));

async function profile(): Promise<Map<string, Profil>> {
  const roh = await liesJson<Record<string, Profil> | Profil[]>('spieler-profile.json', {}).catch(() => ({} as Record<string, Profil>));
  const m = new Map<string, Profil>();
  for (const [k, p] of Object.entries(roh ?? {})) {
    const id = String(p?.id ?? k).replace(/-/g, '').toLowerCase();
    if (istId(id)) m.set(id, p);
  }
  return m;
}

/** Die ganze Liste in ihrer Reihenfolge (mitAllem: auch Entfernte und Seed-Spieler ohne Daten, markiert). */
async function zusammen(mitAllem: boolean) {
  const [rechnung, pflege, profilMap] = await Promise.all([
    liesJson<Rechnung | null>('spieler-kreis/_prospects.json', null).catch(() => null),
    liesJson<Pflege>(PFLEGE, { eintraege: {} }).catch(() => ({ eintraege: {} } as Pflege)),
    profile(),
  ]);
  const eintraege = pflege?.eintraege ?? {};
  const seedListe = (Array.isArray(pflege?.seed) ? pflege.seed : STANDARD_SEED).filter((s) => istId(s?.epicId));
  const seed = new Map(seedListe.map((s) => [s.epicId, s]));
  // Eine Rechnung im alten Format (vor dem 16.11.2026) hat keine Konten - dann bleibt die Liste leer, bis der naechste Lauf sie schreibt.
  const konten = rechnung?.konten ?? {};
  const regeln = rechnung?.regeln ?? null;
  const referenz = regeln?.referenz || 33_000;

  const ids = new Set<string>();
  for (const [id, k] of Object.entries(konten)) if (k.k) ids.add(id);
  for (const id of seed.keys()) ids.add(id);
  for (const [id, e] of Object.entries(eintraege)) if (e.aktion === 'add' && istId(id)) ids.add(id);

  type Roh = ProspectZeile & { score: number };
  const alle: Roh[] = [];
  for (const id of ids) {
    const k = konten[id];
    const e = eintraege[id];
    const quelle: Grund['quelle'] = seed.has(id) ? 'seed' : e?.aktion === 'add' ? 'add' : 'auto';
    const neu = k ? (quelle === 'auto' ? k.n : 1) : null;
    const score = k && regeln ? k.w + regeln.neu * (neu ?? 0) + regeln.trend * k.t : 0;
    const name = (profilMap.get(id)?.anzeige || e?.name || seed.get(id)?.name || k?.name || profilMap.get(id)?.name || '').trim();
    alle.push({
      rang: 0, epicId: id, name, region: (e?.region || k?.h || profilMap.get(id)?.region || '').toUpperCase(), land: profilMap.get(id)?.land?.toUpperCase() || null,
      rating: Math.round((score / referenz) * 1000) / 1000, score, stern: false,
      grund: {
        quelle, kern: !!seed.get(id)?.kern, prRang: k?.r ?? null, prPunkte: k?.w ?? null, neu,
        durchbruch: k?.b ? { datum: k.b[0], titel: k.b[1], platz: k.b[2], art: k.b[3] } : null,
        trend: k ? k.t : null, grandFinals: k ? k.g : null, etabliert: !!k?.x,
      },
      platzFest: e?.platz ?? null, sternFest: e?.stern ?? null, entfernt: e?.aktion === 'remove', ohneDaten: !k,
    });
  }

  // Reihenfolge: nach Score; danach die festen Plaetze an ihre Stelle (der kleinste zuerst, damit sich die Plaetze nicht gegenseitig verschieben).
  const sichtbar = alle.filter((z) => !z.entfernt && !z.ohneDaten && z.name);
  const frei = sichtbar.filter((z) => z.platzFest == null).sort((a, b) => b.score - a.score);
  const fest = sichtbar.filter((z) => z.platzFest != null).sort((a, b) => (a.platzFest! - b.platzFest!) || (b.score - a.score));
  const reihe = [...frei];
  for (const z of fest) reihe.splice(Math.min(Math.max(z.platzFest! - 1, 0), reihe.length), 0, z);
  const ohneScore = (z: Roh): ProspectZeile => { const { score, ...rest } = z; void score; return rest; };
  const liste: ProspectZeile[] = reihe.map((z, i) => ({ ...ohneScore(z), rang: i + 1, stern: z.sternFest ?? i < STERNE }));
  if (mitAllem) for (const z of alle.filter((x) => x.entfernt || x.ohneDaten || !x.name)) liste.push({ ...ohneScore(z), rang: 0, stern: false });

  const kopf = regeln && rechnung ? { ...regeln, stand: rechnung.stand, prStand: rechnung.prStand, kandidaten: sichtbar.length, seed: seed.size } : null;
  return { liste, regeln: kopf, eintraege, seedListe, seedGespeichert: Array.isArray(pflege?.seed) };
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const titelJahr = new Date().getUTCFullYear() + 1;
  if (p.get('verwaltung') === '1') {
    if (!await darfBereichAnfrage('spieler')) return NextResponse.json({ error: 'Dafür fehlt dir das Recht.' }, { status: 403 });
    const { liste, regeln, eintraege, seedListe, seedGespeichert } = await zusammen(true);
    return NextResponse.json({ titelJahr, regeln, liste, eintraege, seedListe, seedGespeichert }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const region = (p.get('region') ?? '').toUpperCase();
  const { liste, regeln } = await zusammen(false);
  const auswahl = (REGIONEN.has(region) ? liste.filter((z) => z.region === region) : liste).slice(0, ZEIGEN);
  return zwischenspeichern(NextResponse.json({ titelJahr, regeln, liste: auswahl }, { headers: { 'Cache-Control': 'public, max-age=60' } }), 120);
}

export async function POST(request: Request) {
  if (!await darfBereichAnfrage('spieler')) return NextResponse.json({ error: 'Dafür fehlt dir das Recht.' }, { status: 403 });
  const k = await request.json().catch(() => ({})) as Record<string, unknown>;
  const epicId = String(k.epicId ?? '').replace(/-/g, '').toLowerCase();
  if (!istId(epicId)) return NextResponse.json({ error: 'Keine gültige Epic-Konto-Id.' }, { status: 400 });

  const pflege = await liesJson<Pflege>(PFLEGE, { eintraege: {} });
  const eintraege = pflege?.eintraege ?? {};
  const e: PflegeEintrag = { ...(eintraege[epicId] ?? {}) };
  if ('aktion' in k) { if (k.aktion === 'add' || k.aktion === 'remove') e.aktion = k.aktion; else delete e.aktion; }
  if ('stern' in k) { if (typeof k.stern === 'boolean') e.stern = k.stern; else delete e.stern; }
  if ('platz' in k) {
    const n = Number(k.platz);
    if (k.platz !== null && k.platz !== '' && Number.isInteger(n) && n >= 1 && n <= 999) e.platz = n; else delete e.platz;
  }
  if (typeof k.name === 'string') { const n = k.name.trim().slice(0, 40); if (n) e.name = n; else delete e.name; }
  if (typeof k.region === 'string') { const r = k.region.trim().toUpperCase(); if (REGIONEN.has(r)) e.region = r; else delete e.region; }

  const leer = !e.aktion && e.stern === undefined && e.platz === undefined && !e.region;
  if (leer) delete eintraege[epicId]; else eintraege[epicId] = { ...e, geaendert: Date.now() };
  // Eine dort gespeicherte Seed-Liste bleibt erhalten; sonst gilt die mitgelieferte aus lib/prospectsSeed.json.
  await schreibJson(PFLEGE, { ...(Array.isArray(pflege?.seed) ? { seed: pflege.seed } : {}), eintraege });
  return NextResponse.json({ ok: true, eintrag: eintraege[epicId] ?? null });
}
