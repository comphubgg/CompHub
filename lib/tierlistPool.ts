import { GET as katalogAbruf } from '@/app/api/cup-catalog/route';
import { holeTop } from '@/lib/epicCups';
import { spielerKontext } from '@/lib/globalsSolos';
import { finale, type KatalogCup, type KatalogFenster } from '@/lib/ergebnisPosts';
import { LISTE, lies as prLies } from '@/lib/powerRankings';
import { regionVonLand, regionVonLaendern } from '@/lib/landRegion';
import { liesJson } from '@/lib/ablage';

/*
 * Der Spieler-Pool der Tierlist fuer Solo und Duo - nur aus unseren eigenen Daten (17.11.2026).
 *
 * Der alte Pool stammte aus einer fremden Tierlist und ist mit ihr verschwunden; danach stand die Tierlist leer. Jetzt:
 *
 *   Solo  Die Power Rankings (Epic, weltweit, nach Platz) - je Spieler die Region, in der er die letzten Wochen tatsaechlich
 *         gespielt hat (EU- bzw. NAC-Bestenlisten von Epic, gezaehlt je Spieltag). Wer dort nicht auftaucht, zaehlt ueber sein
 *         Land zu EU; ein Land aus Nordamerika sagt nichts ueber NAC/NAW, deshalb dort nur, wer NAC-Cups spielt. Bis zu
 *         JE_REGION_SOLO je Region, nur mit Flagge (ohne blendet die Tierlist ohnehin aus). Name und Flagge aus
 *         spieler-profile.json, sonst Epics Name und Land.
 *   Duo   Die besten Duos der juengsten beendeten Duo-Cups in EU und NAC (Epics Bestenliste), dazu unsere duos.json.
 */

export interface Mitglied { name: string; land?: string | null }
export interface PoolEintrag { spieler: Mitglied[]; region: string }

const SEITE = 'https://www.thecomphub.com';
const REGIONEN = ['EU', 'NAC'] as const;
export const JE_REGION_SOLO = 150;
const JE_REGION_DUO = 50;
/** So viele juengste Spieltage je Region bestimmen, wer wo spielt - und so tief in jede Bestenliste. */
const FENSTER_JE_REGION = 12;
const TIEFE = 300;
const TAGE = 35;

async function katalog(): Promise<KatalogCup[]> {
  const j = await (await katalogAbruf(new Request(`${SEITE}/api/cup-catalog?modus=standard`))).json() as { cups?: KatalogCup[] };
  return j.cups ?? [];
}

/** Die juengsten beendeten Spieltage einer Region (ohne Arena/Ranked - dort spielt man nicht um die Region). */
function juengsteFenster(cups: KatalogCup[], region: string, filter: (c: KatalogCup) => boolean = () => true) {
  const ab = Date.now() - TAGE * 864e5;
  return cups
    .filter((c) => !/ranked|arena/i.test(c.titel) && filter(c))
    .flatMap((c) => (c.regionen?.[region] ?? []).filter((f) => f.status === 'vorbei' && (f.end ?? 0) > ab).map((f) => ({ c, f })))
    .sort((a, b) => (b.f.end ?? 0) - (a.f.end ?? 0));
}

async function inGruppen<T, R>(liste: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const raus: R[] = [];
  for (let i = 0; i < liste.length; i += n) raus.push(...await Promise.all(liste.slice(i, i + n).map(f)));
  return raus;
}

/** Konto-Id -> wie oft in den juengsten EU- bzw. NAC-Bestenlisten, dazu Epics Spiel-Land. */
async function werSpieltWo(cups: KatalogCup[]) {
  const zaehler = new Map<string, Record<string, number>>();
  const spielLand = new Map<string, string>();
  for (const region of REGIONEN) {
    const fenster = juengsteFenster(cups, region).slice(0, FENSTER_JE_REGION);
    await inGruppen(fenster, 4, async ({ f }: { f: KatalogFenster }) => {
      const top = await holeTop(f.eventId, f.windowId, TIEFE, true).catch(() => null);
      for (const e of top?.entries ?? []) {
        for (const p of e.players ?? []) {
          if (!p.id) continue;
          const z = zaehler.get(p.id) ?? {};
          z[region] = (z[region] ?? 0) + 1;
          zaehler.set(p.id, z);
          if (p.spielLand && !spielLand.has(p.id)) spielLand.set(p.id, p.spielLand);
        }
      }
    });
  }
  return { zaehler, spielLand };
}

export async function soloPool(): Promise<PoolEintrag[] | null> {
  const [pr, cups, kontext] = await Promise.all([prLies(LISTE).catch(() => null), katalog().catch(() => [] as KatalogCup[]), spielerKontext()]);
  if (!pr?.spieler?.length) return null;
  const { zaehler, spielLand } = await werSpieltWo(cups);
  const proRegion: Record<string, PoolEintrag[]> = { EU: [], NAC: [] };
  const gesehen = new Set<string>();
  for (const s of [...pr.spieler].sort((a, b) => a.rank - b.rank)) {
    if (proRegion.EU.length >= JE_REGION_SOLO && proRegion.NAC.length >= JE_REGION_SOLO) break;
    const k = kontext(s.id, s.name, s.land || spielLand.get(s.id));
    if (!k.land) continue;
    const z = zaehler.get(s.id) ?? {};
    const eu = z.EU ?? 0, nac = z.NAC ?? 0;
    // Wo er oefter spielt; bei Gleichstand (oder gar nicht gesehen) entscheidet das Land - Nordamerika allein reicht nicht fuer NAC.
    const region = eu > nac ? 'EU' : nac > eu ? 'NAC' : (regionVonLand(k.land) === 'EU' ? 'EU' : '');
    if (!region || proRegion[region].length >= JE_REGION_SOLO) continue;
    const name = (k.anzeige || s.name || '').trim();
    if (!name || gesehen.has(name.toLowerCase())) continue;
    gesehen.add(name.toLowerCase());
    proRegion[region].push({ spieler: [{ name, land: k.land }], region });
  }
  const raus = [...proRegion.EU, ...proRegion.NAC];
  return raus.length ? raus : null;
}

export async function duoPool(): Promise<PoolEintrag[] | null> {
  const [cups, kontext, profile, eigene] = await Promise.all([
    katalog().catch(() => [] as KatalogCup[]), spielerKontext(),
    liesJson<Record<string, { name?: string; anzeige?: string; land?: string; namen?: string[] }>>('spieler-profile.json', {}),
    liesJson<{ duos?: string[][] }>('duos.json', {}),
  ]);
  const raus: PoolEintrag[] = [];
  const gesehen = new Set<string>();
  const schluessel = (sp: Mitglied[]) => sp.map((s) => s.name.toLowerCase()).sort().join('|');
  for (const region of REGIONEN) {
    // Erst die Finals (die Besten), dann die Runde davor - bis JE_REGION_DUO Duos beisammen sind.
    const fenster = juengsteFenster(cups, region, (c) => /duo/i.test(c.titel) && !/test/i.test(c.titel))
      .slice(0, 4)
      .sort((a, b) => Number(finale(b.c, b.f, b.c.regionen?.[region] ?? [])) - Number(finale(a.c, a.f, a.c.regionen?.[region] ?? [])));
    let n = 0;
    for (const { f } of fenster) {
      if (n >= JE_REGION_DUO) break;
      const top = await holeTop(f.eventId, f.windowId, 100).catch(() => null);
      for (const e of top?.entries ?? []) {
        if (n >= JE_REGION_DUO) break;
        const spieler = (e.players ?? []).slice(0, 2).map((p) => {
          const kx = p.id ? kontext(p.id, p.name, p.spielLand) : null;
          return { name: kx?.anzeige || p.name, land: kx?.land ?? null };
        });
        // Ohne aufgeloesten Namen (gekuerzte Konto-Id) oder ganz ohne Flagge kein Duo - die kennt niemand.
        if (spieler.length !== 2 || spieler.some((s) => /^[0-9a-f]{8}$/i.test(s.name)) || !spieler.some((s) => s.land)) continue;
        const k = schluessel(spieler);
        if (gesehen.has(k)) continue;
        gesehen.add(k);
        raus.push({ spieler, region });
        n++;
      }
    }
  }
  // Unsere eigene Duo-Liste (von Hand gepflegt): Flagge ueber das Profil, Region ueber die Laender.
  const landZu = (name: string) => {
    const s = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const p of Object.values(profile)) {
      if ([p.anzeige, p.name, ...(p.namen ?? [])].some((x) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') === s)) return p.land?.toUpperCase() ?? null;
    }
    return null;
  };
  for (const d of eigene.duos ?? []) {
    if (!Array.isArray(d) || d.length < 2) continue;
    const spieler = d.slice(0, 2).map((n) => ({ name: String(n).trim(), land: landZu(String(n)) }));
    if (spieler.some((s) => !s.name)) continue;
    const k = schluessel(spieler);
    if (gesehen.has(k)) continue;
    gesehen.add(k);
    const region = regionVonLaendern(spieler.map((s) => s.land));
    raus.push({ spieler, region: region === 'NA' ? 'NAC' : region || 'EU' });
  }
  return raus.length ? raus : null;
}
