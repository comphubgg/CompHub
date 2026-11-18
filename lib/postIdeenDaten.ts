import { liesJson } from '@/lib/ablage';
import { anzeigenamen } from '@/lib/anzeigenamen';
import { landQuellen } from '@/lib/landQuellen';
import { liesOrgs } from '@/lib/orgs';
import { alleFenster, bestimmeFeld } from '@/lib/prognoseFeld';
import { gecacht } from '@/lib/epicCups';
import { fotoFrei, spielerbildGross } from '@/lib/spielerbildKlein';
import { GET as szeneAbruf } from '@/app/api/szene-stats/route';
import { GET as prAbruf } from '@/app/api/power-rankings/route';
import { GET as tabelleAbruf } from '@/app/api/spieltag-tabelle/route';
import {
  alleIdeen, kontenAus, tagesAuswahl, SEITE,
  type FeldEingabe, type OrgEintrag, type PlanFenster, type PostIdee, type PrSpieler, type TabellenSpieltag, type VerdienstPosten,
} from '@/lib/postIdeen';

/*
 * Die Daten fuer die Post-Ideen (lib/postIdeen.ts) - alles aus den eigenen Quellen der Seite, nichts von Hand:
 *   Teilnehmerfeld   lib/prognoseFeld bestimmeFeld (Heats, LCQ, Qualifier ueber Epics Zugangsmarken - dieselbe Rechnung wie Prognosen und Drop-Karte)
 *   Orgs             orgs.json (lib/orgs)
 *   Name, Flagge, @  spieler-anzeigenamen.json, spieler-profile.json, spieler-namen.json, lib/landQuellen
 *   Preisgeld        /api/szene-stats?ansicht=verdienst-posten (die Posten der Rechnung "Most earnings")
 *   Power Rankings   /api/power-rankings (Top 200)
 *   Platzierungen    /api/spieltag-tabelle je Spieltag der letzten 7 Tage
 *   Zeitplan         Cup-Katalog und Archiv (lib/prognoseFeld alleFenster)
 * Faellt eine Quelle aus, fehlen nur ihre Ideen - der Grund steht in "fehler".
 */

const TAG_MS = 86_400_000;

export interface IdeenStand { erstellt: number; ideen: PostIdee[]; auswahl: string[]; fehler: string[] }

async function json<T>(f: () => Promise<Response>): Promise<T | null> {
  try { const r = await f(); return r.ok ? await r.json() as T : null; } catch { return null; }
}

async function felderLaden(fenster: Awaited<ReturnType<typeof alleFenster>>, jetzt: number, fehler: string[]): Promise<FeldEingabe[]> {
  // Je Cup und Region das erste Finalfenster, das in den naechsten sechs Tagen beginnt und eine Zugangsmarke hat.
  const finals = new Map<string, (typeof fenster)[number]>();
  for (const f of fenster) {
    if (!f.istFinale || f.status !== 'kommt' || !(f.tokens ?? []).length || f.begin < jetzt || f.begin > jetzt + 6 * TAG_MS) continue;
    if (!/^(EU|NAC)$/.test(f.region)) continue;
    const k = `${f.cupId}|${f.region}`;
    const da = finals.get(k);
    if (!da || f.begin < da.begin) finals.set(k, f);
  }
  const raus: FeldEingabe[] = [];
  for (const f of finals.values()) {
    try {
      const feld = await gecacht(`prognose-feld|${f.eventId}|${f.windowId}|${f.region}`, 120_000,
        () => bestimmeFeld({ eventId: f.eventId, windowId: f.windowId, region: f.region }));
      const spieler = feld.teams.flatMap((t) => t.ids.map((id, i) => ({ id: id.toLowerCase(), name: t.namen[i] ?? '' }))).filter((s) => s.id);
      raus.push({
        windowId: f.windowId, region: f.region, cupTitel: f.cupTitel, begin: f.begin, spieler, geprueft: feld.geprueft,
        offen: feld.hinweise.filter((h) => h.art === 'vorrunde-offen').length, quellen: feld.quellen.map((q) => q.titel),
      });
    } catch (e) { fehler.push(`Feld ${f.windowId}: ${(e as Error).message}`.slice(0, 200)); }
  }
  return raus;
}

async function tabellenLaden(fenster: Awaited<ReturnType<typeof alleFenster>>, jetzt: number): Promise<TabellenSpieltag[]> {
  const woche = fenster.filter((f) => f.status === 'vorbei' && f.begin >= jetzt - 7 * TAG_MS && f.begin < jetzt && /^(EU|NAC)$/.test(f.region)
    && !/ranked/i.test(f.cupTitel)).slice(0, 60);
  const raus: TabellenSpieltag[] = [];
  for (let i = 0; i < woche.length; i += 6) {
    const teil = await Promise.all(woche.slice(i, i + 6).map(async (f) => {
      const t = await json<{ teams?: Array<{ platz: number; spieler: Array<{ epicId?: string }> }> }>(
        () => tabelleAbruf(new Request(`${SEITE}/api/spieltag-tabelle?window=${encodeURIComponent(f.windowId)}`)));
      if (!t?.teams?.length) return null;
      return {
        windowId: f.windowId, titel: f.cupTitel, region: f.region,
        teams: t.teams.map((x) => ({ platz: x.platz, ids: x.spieler.map((s) => String(s.epicId ?? '').toLowerCase()).filter(Boolean) })),
      };
    }));
    raus.push(...teil.filter((x): x is TabellenSpieltag => !!x));
  }
  return raus;
}

async function berechne(): Promise<IdeenStand> {
  const jetzt = Date.now();
  const fehler: string[] = [];
  const [profile, namen, anzeige, laender, orgsRoh, fenster, verdienst, pr, bilder] = await Promise.all([
    liesJson<unknown>('spieler-profile.json', {}).catch(() => { fehler.push('spieler-profile.json nicht lesbar'); return {}; }),
    liesJson<Record<string, { haupt?: string }>>('spieler-namen.json', {}).catch(() => ({})),
    anzeigenamen().catch(() => new Map<string, string>()),
    landQuellen().catch(() => null),
    liesOrgs().catch((e: Error) => { fehler.push(`orgs.json: ${e.message}`); return []; }),
    alleFenster().catch((e: Error) => { fehler.push(`Cup-Katalog: ${e.message}`); return []; }),
    json<VerdienstPosten & { success?: boolean }>(() => szeneAbruf(new Request(`${SEITE}/api/szene-stats?ansicht=verdienst-posten`))),
    json<{ fetchedAt?: number; players?: PrSpieler[] }>(() => prAbruf(new Request(`${SEITE}/api/power-rankings?page=1&pageSize=200`))),
    liesJson<Array<{ epicId?: string; datei?: string; echtesFoto?: boolean }>>('spielerbilder.json', []).catch(() => []),
  ]);
  if (!verdienst?.konten) fehler.push('Preisgeld-Posten (verdienst-posten) nicht vorgerechnet - keine Preisgeld-Ideen');
  if (!pr?.players?.length) fehler.push('Power Rankings nicht lesbar');

  const konten = kontenAus({ profile, namen, anzeigenamen: anzeige, spiel: laender?.spiel, noble: laender?.noble });
  const orgs: OrgEintrag[] = orgsRoh.map((o) => ({
    id: o.id, name: o.name, logo: o.logo, x: o.x, spieler: o.spieler.map((s) => ({ epicId: s.epicId, name: s.name, rolle: s.rolle, seit: s.seit })),
  }));
  const fotos = new Map<string, string>();
  for (const b of bilder) if (b.epicId && b.datei && b.echtesFoto && fotoFrei(b.datei)) fotos.set(b.epicId.toLowerCase(), spielerbildGross(b.datei));

  const [felder, tabellen] = await Promise.all([felderLaden(fenster, jetzt, fehler), tabellenLaden(fenster, jetzt)]);
  const plan: PlanFenster[] = fenster.map((f) => ({ cupTitel: f.cupTitel, region: f.region, begin: f.begin, istFinale: f.istFinale, status: f.status, windowId: f.windowId }));

  const ideen = alleIdeen({
    konten, orgs, felder, verdienst: verdienst?.konten ? verdienst : null, fotos,
    pr: pr?.players?.length ? { spieler: pr.players, stand: pr.fetchedAt ?? null } : null, tabellen, plan,
  }, jetzt);
  return { erstellt: jetzt, ideen, auswahl: tagesAuswahl(ideen), fehler };
}

let vorrat: { bis: number; wert: Promise<IdeenStand> } | null = null;

/** Die Ideen von heute - zehn Minuten vorgehalten (das Teilnehmerfeld fragt Epic). neu: sofort neu rechnen. */
export function postIdeen(neu = false): Promise<IdeenStand> {
  if (!neu && vorrat && vorrat.bis > Date.now()) return vorrat.wert;
  const wert = berechne();
  vorrat = { bis: Date.now() + 10 * 60_000, wert };
  wert.catch(() => { vorrat = null; });
  return wert;
}
