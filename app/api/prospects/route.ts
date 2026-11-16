import { NextResponse } from 'next/server';
import { liesJson, schreibJson } from '@/lib/ablage';
import { darfBereichAnfrage } from '@/lib/adminPruefung';
import { zwischenspeichern } from '@/lib/zwischenspeicher';

/*
 * Prospects (Betreiber, 15.11.2026; neu am 16.11.2026: allein aus unseren eigenen Daten, keine Namensliste von aussen).
 *
 * Die ganze Rechnung - wer ein Prospect ist, Score und Stern - macht scripts/prospects.mjs auf GitHub (spieler-kreis.yml, alle sechs Stunden) und legt die ersten
 * hundert je Region und weltweit in spieler-kreis/_prospects.json. Hier wird nur noch gelesen: keine Reihenfolge, kein Stern und kein Name von Hand.
 * Die Pflege im Admin kann ein Konto nur ausblenden (z. B. gesperrt oder zwei Konten derselben Person) - prospects.json -> ausgeblendet.
 * Die Flagge nur aus unseren Profilen (spieler-profile.json) - nie geraten.
 *
 *   GET ?region=EU      -> { kopf, liste: [Zeile] }  (hoechstens 100)
 *   GET ?verwaltung=1   -> dazu die ausgeblendeten (nur Admin / Player Center)
 *   POST { epicId, ausblenden: boolean, name?, grund? }   (nur Admin / Player Center)
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PFLEGE = 'prospects.json';
const ZEIGEN = 100;
const REGIONEN = new Set(['EU', 'NAC', 'NAW', 'BR', 'OCE', 'ME', 'ASIA']);

/** Eine Zeile aus scripts/prospects.mjs. */
interface Roh {
  id: string; name: string; region: string; score: number; niveau: number; spitze: number; replay: number | null; replayCups: number; ergebnisse: number;
  form: number | null; formVorher: number | null; stern: boolean; preisgeld: number; gf: number; gfBeste: number | null; ersterGf: number | null;
  fruehSaisons: number; erstes: number | null; ersteSpitze: [number, string, number] | null; beste: [number, string, number, number] | null; pr: number | null; rang: number;
}
export interface Regeln {
  karriereTage: number; halbTage: number; aktivTage: number; aktivMin: number; letztesTage: number; gNiveau: number; gSpitze: number; gReplay: number;
  replayMin: number; formTage: number; formMin: number; sternPlus: number; spitzeNote: number; jungSaisons: number; jungTage: number;
  etabliertGeld: number; etabliertGf: number;
}
interface Rechnung { version?: number; stand: number; prStand: number | null; regeln: Regeln; prospects: number; liste: Roh[] }
interface Ausgeblendet { name?: string; grund?: string; geaendert?: number }
/** eintraege: die Pflege bis zum 16.11.2026 - davon zaehlt nur noch "remove" (als ausgeblendet). */
type Pflege = { ausgeblendet?: Record<string, Ausgeblendet>; eintraege?: Record<string, { aktion?: string; name?: string; geaendert?: number }> };
const ausgeblendetVon = (p: Pflege | null): Record<string, Ausgeblendet> => {
  const alt = Object.entries(p?.eintraege ?? {}).filter(([, e]) => e?.aktion === 'remove').map(([id, e]) => [id, { name: e.name, geaendert: e.geaendert }]);
  return { ...Object.fromEntries(alt), ...(p?.ausgeblendet ?? {}) };
};
interface Profil { id?: string; name?: string; anzeige?: string; land?: string }

export interface ProspectZeile extends Omit<Roh, 'id'> { epicId: string; land: string | null }

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

async function zusammen() {
  const [rechnung, pflege, profilMap] = await Promise.all([
    liesJson<Rechnung | null>('spieler-kreis/_prospects.json', null).catch(() => null),
    liesJson<Pflege>(PFLEGE, {}).catch(() => ({} as Pflege)),
    profile(),
  ]);
  // Eine Rechnung im alten Format (vor dem 16.11.2026 abends) traegt keine Liste - dann bleibt sie leer, bis der naechste Lauf sie schreibt.
  const neu = rechnung?.version === 2 && Array.isArray(rechnung.liste) ? rechnung : null;
  const aus = ausgeblendetVon(pflege);
  const alle: ProspectZeile[] = (neu?.liste ?? []).map((z) => {
    const { id, ...rest } = z;
    const p = profilMap.get(id);
    return { ...rest, epicId: id, name: (p?.anzeige || z.name || p?.name || '').trim(), land: p?.land?.toUpperCase() || null };
  });
  return { neu, alle, aus };
}

/** Plaetze neu durchzaehlen, nachdem ausgeblendete Konten herausgefallen sind. */
const nummern = (l: ProspectZeile[]) => l.map((z, i) => ({ ...z, rang: i + 1 }));

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const titelJahr = new Date().getUTCFullYear() + 1;
  const { neu, alle, aus } = await zusammen();
  const kopf = neu ? { stand: neu.stand, prStand: neu.prStand, prospects: neu.prospects, regeln: neu.regeln } : null;
  if (p.get('verwaltung') === '1') {
    if (!await darfBereichAnfrage('spieler')) return NextResponse.json({ error: 'Dafür fehlt dir das Recht.' }, { status: 403 });
    const liste = alle.map((z) => ({ ...z, ausgeblendet: z.epicId in aus }));
    return NextResponse.json({ titelJahr, kopf, liste, ausgeblendet: aus }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const region = (p.get('region') ?? '').toUpperCase();
  const sichtbar = alle.filter((z) => !(z.epicId in aus) && z.name);
  const auswahl = nummern(REGIONEN.has(region) ? sichtbar.filter((z) => z.region === region) : sichtbar).slice(0, ZEIGEN);
  return zwischenspeichern(NextResponse.json({ titelJahr, kopf, liste: auswahl }, { headers: { 'Cache-Control': 'public, max-age=60' } }), 300);
}

export async function POST(request: Request) {
  if (!await darfBereichAnfrage('spieler')) return NextResponse.json({ error: 'Dafür fehlt dir das Recht.' }, { status: 403 });
  const k = await request.json().catch(() => ({})) as Record<string, unknown>;
  const epicId = String(k.epicId ?? '').replace(/-/g, '').toLowerCase();
  if (!istId(epicId)) return NextResponse.json({ error: 'Keine gültige Epic-Konto-Id.' }, { status: 400 });

  const pflege = await liesJson<Pflege>(PFLEGE, {});
  const ausgeblendet = ausgeblendetVon(pflege);
  if (k.ausblenden === true) {
    ausgeblendet[epicId] = {
      ...(typeof k.name === 'string' && k.name.trim() ? { name: k.name.trim().slice(0, 40) } : {}),
      ...(typeof k.grund === 'string' && k.grund.trim() ? { grund: k.grund.trim().slice(0, 120) } : {}),
      geaendert: Date.now(),
    };
  } else delete ausgeblendet[epicId];
  // Geschrieben wird nur noch "ausgeblendet": eine fruehere Seed-Liste, Aufnahmen, Sterne und feste Plaetze von Hand fallen damit weg.
  await schreibJson(PFLEGE, { ausgeblendet });
  return NextResponse.json({ ok: true, ausgeblendet: ausgeblendet[epicId] ?? null });
}
