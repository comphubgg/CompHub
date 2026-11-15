import { NextResponse } from 'next/server';
import { liesJson, schreibJson } from '@/lib/ablage';
import { darfBereichAnfrage } from '@/lib/adminPruefung';
import { zwischenspeichern } from '@/lib/zwischenspeicher';

/*
 * Prospects (Betreiber, 15.11.2026): Spieler, deren erster nennenswerter Auftritt kurz zurueckliegt, nach Rating geordnet.
 *
 * Die Kandidaten rechnet scripts/spieler-kreis.mjs alle sechs Stunden (spieler-kreis/_prospects.json, Regeln dort oben). Hier kommt die Pflege des Betreibers
 * dazu (prospects.json, im Admin unter /admin/prospects):
 *   oeffentliche Liste = Kandidaten ∪ von Hand aufgenommen − von Hand entfernt; ein von Hand gesetzter Platz geht der Rechnung vor, ein gesetzter Stern auch.
 * Die Flagge nur aus unseren Profilen (spieler-profile.json) - nie geraten.
 *
 *   GET ?region=EU            -> { titelJahr, regeln, liste: [{ rang, epicId, name, region, land, rating, stern, ... }] }  (hoechstens 100)
 *   GET ?verwaltung=1         -> alles, auch Entfernte, mit den Eintraegen der Pflege (nur Admin / Player Center)
 *   POST { epicId, name?, region?, aktion?: 'add'|'remove'|null, stern?: boolean|null, platz?: number|null }  (nur Admin / Player Center)
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PFLEGE = 'prospects.json';
const STERNE = 11;
const ZEIGEN = 100;
const REGIONEN = new Set(['EU', 'NAC', 'NAW', 'BR', 'OCE', 'ME', 'ASIA']);

interface Kandidat {
  epicId: string; name: string; region: string; score: number; rating: number; niveau: number; note: number; trend: number;
  events: number; fncs: number; top100: number; beste: number; verlauf: number[];
  erstes: { datum: number; windowId: string; titel: string; platz: number; art: 'fncs' | 'cup'; nachLuecke?: boolean };
}
interface Rechnung {
  stand: number; ab: number; tage: number; aktivTage: number; spitze: number; luecke: number; lueckeNach: number; minEvents: number; trendGewicht: number; trendMax: number; trendVoll: number; stuetze: number; referenz: number;
  liste: Kandidat[];
}
export interface PflegeEintrag { name?: string; region?: string; aktion?: 'add' | 'remove'; stern?: boolean; platz?: number; geaendert?: number }
type Pflege = { eintraege: Record<string, PflegeEintrag> };
interface Profil { id?: string; name?: string; anzeige?: string; land?: string; region?: string }
interface IndexZeile { epicId: string; name: string; konstanz: number; region: string; cups: number; beste: number }

export interface ProspectZeile {
  rang: number; epicId: string; name: string; region: string; land: string | null; rating: number; stern: boolean;
  events: number | null; trend: number | null; erstes: Kandidat['erstes'] | null;
  /** Von Hand aufgenommen (kein automatischer Kandidat). */
  manuell: boolean;
  /** Von Hand gesetzter Platz / Stern. */
  platzFest: number | null; sternFest: boolean | null;
  /** Nur in der Verwaltung: von Hand entfernt. */
  entfernt?: boolean;
}

const istId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{32}$/.test(s);

async function profile(): Promise<Map<string, Profil>> {
  const roh = await liesJson<Record<string, Profil> | Profil[]>('spieler-profile.json', {}).catch(() => ({} as Record<string, Profil>));
  const m = new Map<string, Profil>();
  for (const [k, p] of Object.entries(roh ?? {})) {
    const id = String(p?.id ?? k).replace(/-/g, '').toLowerCase();
    if (istId(id)) m.set(id, p);
  }
  return m;
}

/** Die ganze Liste in ihrer Reihenfolge: Kandidaten + Aufgenommene, ohne Entfernte (mitEntfernten: die stehen dann markiert dabei). */
async function zusammen(mitEntfernten: boolean) {
  const [rechnung, pflege, profilMap] = await Promise.all([
    liesJson<Rechnung | null>('spieler-kreis/_prospects.json', null).catch(() => null),
    liesJson<Pflege>(PFLEGE, { eintraege: {} }).catch(() => ({ eintraege: {} } as Pflege)),
    profile(),
  ]);
  const eintraege = pflege?.eintraege ?? {};
  const referenz = rechnung?.referenz || 0.44;
  const kandidaten = new Map((rechnung?.liste ?? []).map((k) => [k.epicId, k]));

  // Von Hand Aufgenommene, die keine Kandidaten sind: Rating aus ihrer Note (spieler-kreis/n-xx.json), Name und Region aus dem Kreis, wo die Pflege nichts sagt.
  const extra = Object.entries(eintraege).filter(([id, e]) => e.aktion === 'add' && !kandidaten.has(id)).map(([id]) => id);
  const noten = new Map<string, { n: number; c: number }>();
  const index = new Map<string, IndexZeile>();
  if (extra.length) {
    const eimer = [...new Set(extra.map((id) => id.slice(0, 2)))];
    const [teile, idx] = await Promise.all([
      Promise.all(eimer.map((e) => liesJson<Record<string, { n: number; c: number }>>(`spieler-kreis/n-${e}.json`, {}).catch(() => ({} as Record<string, { n: number; c: number }>)))),
      liesJson<IndexZeile[]>('spieler-kreis/_index.json', []).catch(() => [] as IndexZeile[]),
    ]);
    for (const t of teile) for (const [id, r] of Object.entries(t)) if (extra.includes(id)) noten.set(id, r);
    for (const z of idx) if (extra.includes(z.epicId)) index.set(z.epicId, z);
  }

  type Roh = Omit<ProspectZeile, 'rang' | 'stern'> & { score: number };
  const alle: Roh[] = [];
  const nameVon = (id: string, roh?: string) => (profilMap.get(id)?.anzeige || eintraege[id]?.name || roh || index.get(id)?.name || profilMap.get(id)?.name || '').trim();
  for (const k of kandidaten.values()) {
    const e = eintraege[k.epicId];
    alle.push({
      epicId: k.epicId, name: nameVon(k.epicId, k.name), region: (e?.region || k.region || '').toUpperCase(), land: profilMap.get(k.epicId)?.land?.toUpperCase() || null,
      rating: k.rating, score: k.score, events: k.events, trend: k.trend, erstes: k.erstes, manuell: false,
      platzFest: e?.platz ?? null, sternFest: e?.stern ?? null, entfernt: e?.aktion === 'remove',
    });
  }
  for (const id of extra) {
    const e = eintraege[id];
    const n = noten.get(id);
    const score = n?.n ?? 0;
    alle.push({
      epicId: id, name: nameVon(id), region: (e.region || index.get(id)?.region || profilMap.get(id)?.region || '').toUpperCase(), land: profilMap.get(id)?.land?.toUpperCase() || null,
      rating: Math.round((score / referenz) * 1000) / 1000, score, events: n?.c ?? null, trend: null, erstes: null, manuell: true,
      platzFest: e.platz ?? null, sternFest: e.stern ?? null, entfernt: false,
    });
  }

  // Reihenfolge: nach Score; danach die festen Plaetze an ihre Stelle (der kleinste zuerst, damit sich die Plaetze nicht gegenseitig verschieben).
  const sichtbar = alle.filter((z) => !z.entfernt && z.name);
  const frei = sichtbar.filter((z) => z.platzFest == null).sort((a, b) => b.score - a.score);
  const fest = sichtbar.filter((z) => z.platzFest != null).sort((a, b) => (a.platzFest! - b.platzFest!) || (b.score - a.score));
  const reihe = [...frei];
  for (const z of fest) reihe.splice(Math.min(Math.max(z.platzFest! - 1, 0), reihe.length), 0, z);
  const ohneScore = (z: Roh): Omit<Roh, 'score'> => { const k: Partial<Roh> = { ...z }; delete k.score; return k as Omit<Roh, 'score'>; };
  const liste: ProspectZeile[] = reihe.map((z, i) => ({ ...ohneScore(z), rang: i + 1, stern: z.sternFest ?? i < STERNE }));
  if (mitEntfernten) for (const z of alle.filter((x) => x.entfernt)) liste.push({ ...ohneScore(z), rang: 0, stern: false });

  const regeln = rechnung ? {
    tage: rechnung.tage, aktivTage: rechnung.aktivTage, spitze: rechnung.spitze, luecke: rechnung.luecke, lueckeNach: rechnung.lueckeNach, ab: rechnung.ab, minEvents: rechnung.minEvents, trendGewicht: rechnung.trendGewicht, trendMax: rechnung.trendMax,
    trendVoll: rechnung.trendVoll, stuetze: rechnung.stuetze, referenz: rechnung.referenz, stand: rechnung.stand, kandidaten: rechnung.liste.length,
  } : null;
  return { liste, regeln, eintraege };
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const titelJahr = new Date().getUTCFullYear() + 1;
  if (p.get('verwaltung') === '1') {
    if (!await darfBereichAnfrage('spieler')) return NextResponse.json({ error: 'Dafür fehlt dir das Recht.' }, { status: 403 });
    const { liste, regeln, eintraege } = await zusammen(true);
    return NextResponse.json({ titelJahr, regeln, liste, eintraege }, { headers: { 'Cache-Control': 'no-store' } });
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
  await schreibJson(PFLEGE, { eintraege });
  return NextResponse.json({ ok: true, eintrag: eintraege[epicId] ?? null });
}
