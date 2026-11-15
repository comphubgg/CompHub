/*
 * /stats player:<name> [cup:<cup>] - EIN Cup, ausfuehrlich, wie die Player Stats der Event-Seite (Betreiber, 15.11.2026).
 *
 * Bei einem Team-Cup eine Einbettung je Teammitglied (der gesuchte Spieler zuerst), alle in einer Nachricht (Discord: hoechstens zehn).
 * Die Zahlen kommen aus denselben Routen wie auf der Seite, direkt aufgerufen - nichts wird hier neu gerechnet:
 *   app/api/spieler-detail   Team Stats der Event-Seite: Platz, Punkte, Siege, Spiele aus Epics Bestenliste (frisch bei Epic - also der Endstand,
 *                            nicht eine waehrend des Cups gespeicherte Liste), je Spieler Elims (killsEcht des vollen Auslesens, nie Clutch "solo"),
 *                            Schaden, Treffer, Material, Zeit, Strecke ...
 *   app/api/cup-spieler      Player Stats: der Platz jedes Werts im ganzen Feld ("(#n)", ?raenge=).
 * Welche Quelle bei welchem Wert gilt, ist dieselbe Regel wie in app/events/[id]/SpielerDetail.tsx (Szene-Quelle vor Replay, im Solo Epics Zahl).
 * Zeichen, Namen und Formate der Werte: app/admin/tweets/kennzahlen.ts (wie Player Card und Team Spotlight).
 */

import { GET as detailAbruf } from '@/app/api/spieler-detail/route';
import { GET as cupSpielerAbruf } from '@/app/api/cup-spieler/route';
import { vereinheitlichen, einzelZeile, type KennzahlListe } from '@/app/admin/tweets/kennzahlen';
import { spielerKontext } from '@/lib/globalsSolos';
import { genauerEintrag } from '@/lib/discordEpicKonto';

const SEITE = 'https://www.thecomphub.com';
const FARBE = 0x0ea5e9;

type Einbettung = Record<string, unknown>;

interface Mitglied {
  id: string; name: string; land: string | null; ich: boolean;
  szene: Record<string, number> | null;
  replay: Record<string, number | null | undefined | unknown> | null;
}
interface Eintrag {
  rank: number; points: number; elims: number; games: number; wins: number; damage: number; damageTaken: number; headshots: number;
  timeAlive: number; strecke: number; punktePlatz?: number; punkteElims?: number; percentile?: number;
  matches?: Array<{ placement?: number }>; players?: Array<{ id: string; name: string }>;
}
interface Detail {
  ok: boolean; id: string; name: string; dabei: boolean; ausserhalbListe: boolean;
  rank: number | null; gesamt: number; top: number | null; eintrag: Eintrag | null; mitglieder: Mitglied[];
  replayTeil?: unknown;
}
type Raenge = Record<string, Record<string, { wert: number; rang: number; von: number }>>;

/** Was der Aufrufer schon weiss: der Cup und - falls die Epic-Liste nicht antwortet - die gespeicherte Zeile. */
export interface KartenWahl {
  epicId: string; eventId: string; windowId: string;
  cupId: string | null; cupTitel: string; tag: string; region: string; datum: number;
  /** Platz/Punkte aus der gespeicherten Bestenliste - nur, wenn Epic selbst nichts liefert. */
  gespeichert?: { platz: number; punkte: number; matches: number; endstand: boolean } | null;
  /** Genauer Eintrag ueber ein verknuepftes Epic-Konto (auch hinter Platz 10.000). */
  verknuepft?: { rank: number; points: number; games?: number; wins?: number; punktePlatz?: number; punkteElims?: number; placements?: number[] } | null;
  /** "Other recent cups" - schon fertig formatiert. */
  andere?: string[];
  /** Wer fragt (Discord-Id) - ist sein Epic-Konto verknuepft und im Team, zaehlt sein genauer Eintrag. */
  fragender?: string | null;
}

async function json<T>(antwort: Response | Promise<Response>): Promise<T | null> {
  try { const r = await antwort; if (!r.ok) return null; return await r.json() as T; } catch { return null; }
}

const flagge = (land?: string | null) => (land && /^[A-Za-z]{2}$/.test(land)
  ? [...land.toUpperCase()].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join('') : '');
const zahl = (n: number) => Math.round(n).toLocaleString('en-US');

/** Die einheitliche Kennzahl (Name, Zeichen, Einheit) aus kennzahlen.ts - eigene Zeilen (Platz, Spiele) mit eigenem Namen. */
function kennzahl(schluessel: string, titel = schluessel, symbol = ''): KennzahlListe {
  return vereinheitlichen([{ schluessel, titel, symbol, einheit: null, plaetze: [] }])[0];
}

export function eventLink(cupId: string | null, region: string, windowId: string, epicId: string): string {
  if (!cupId) return `${SEITE}/statistics?spieler=${encodeURIComponent(epicId)}`;
  const q = new URLSearchParams({ region, fenster: windowId, reiter: 'teams', spieler: epicId });
  return `${SEITE}/events/${encodeURIComponent(cupId)}?${q.toString()}`;
}

/**
 * Die Antwort fuer einen Spieler in einem Spieltag - oder null, wenn die Team Stats nicht antworten (dann nimmt der Aufrufer die kurze Liste).
 */
export async function spielerKarte(wahl: KartenWahl): Promise<{ embeds: Einbettung[]; components: unknown[] } | null> {
  let w = wahl;
  const id = w.epicId.toLowerCase();
  const adresse = `${SEITE}/api/spieler-detail?event=${encodeURIComponent(w.eventId)}&window=${encodeURIComponent(w.windowId)}&id=${id}`;
  let d: Detail | null = null;
  for (let i = 0; i < 3 && !d?.ok; i += 1) {
    d = await json<Detail>(detailAbruf(new Request(adresse)));
    if (!d?.ok && i < 2) await new Promise((r) => setTimeout(r, 600 * (i + 1)));
  }
  if (!d?.ok || !d.mitglieder?.length) return null;

  /*
   * Kein Eintrag in Epics oeffentlicher Liste (hinter Platz 10.000): ist jemand aus dem Team (oder der Fragende) verknuepft, holt sein eigenes
   * Konto den genauen Eintrag (lib/discordEpicKonto). Die Mitspieler kennt dann nur dieser Eintrag - ihre Werte kommen je Konto aus denselben Team Stats.
   */
  if (!d.eintrag && !w.verknuepft) {
    const g = await genauerEintrag(w.eventId, w.windowId, d.mitglieder.map((m) => m.id), w.fragender).catch(() => null);
    if (g) {
      w = { ...w, verknuepft: { rank: g.rank, points: g.points, games: g.games, wins: g.wins, placements: g.placements } };
      const fehlen = g.teamAccountIds.filter((t) => !d!.mitglieder.some((m) => m.id === t));
      const dazu = await Promise.all(fehlen.slice(0, 3).map((t) => json<Detail>(detailAbruf(new Request(
        `${SEITE}/api/spieler-detail?event=${encodeURIComponent(w.eventId)}&window=${encodeURIComponent(w.windowId)}&id=${t}`)))));
      for (const x of dazu) for (const m of x?.ok ? x.mitglieder : []) if (!d.mitglieder.some((y) => y.id === m.id)) d.mitglieder.push({ ...m, ich: false });
    }
  }
  // Weder bei Epic noch in den Replays dabei und kein gespeicherter Platz: nicht so tun, als haette er gespielt - der Aufrufer zeigt die Liste.
  if (!d.dabei && !d.eintrag && !w.verknuepft && !w.gespeichert) return null;
  const mitglieder = [...d.mitglieder].sort((a, b) => Number(b.ich) - Number(a.ich));
  const solo = mitglieder.length === 1;
  const [raengeAntwort, kontext] = await Promise.all([
    json<{ raenge?: Raenge }>(cupSpielerAbruf(new Request(`${SEITE}/api/cup-spieler?window=${encodeURIComponent(w.windowId)}`
      + `&event=${encodeURIComponent(w.eventId)}&raenge=${mitglieder.map((m) => m.id).join(',')}`))),
    spielerKontext().catch(() => null),
  ]);
  const raenge = raengeAntwort?.raenge ?? {};

  /* ------------------------------------------------ Team: Platz, Punkte, Siege (fuer alle gleich) */
  const e = d.eintrag;
  const v = w.verknuepft;
  const platz = e?.rank ?? v?.rank ?? w.gespeichert?.platz ?? null;
  const punkte = e?.points ?? v?.points ?? w.gespeichert?.punkte ?? null;
  const spiele = e?.games ?? v?.games ?? w.gespeichert?.matches ?? null;
  const siege = e?.wins ?? v?.wins ?? null;
  const pp = e?.punktePlatz ?? v?.punktePlatz; const pe = e?.punkteElims ?? v?.punkteElims;
  const plaetze = (e?.matches ?? []).map((m) => m.placement).filter((x): x is number => typeof x === 'number' && x > 0);
  const plaetzeV = plaetze.length ? plaetze : (v?.placements ?? []).filter((x) => x > 0);
  const schnitt = plaetzeV.length ? plaetzeV.reduce((a, x) => a + x, 0) / plaetzeV.length : null;
  const quelle = e ? null : v ? 'exact rank via linked Epic account' : w.gespeichert ? 'Epic did not answer - rank from our saved leaderboard (may differ slightly)' : null;

  const kopfZeilen: string[] = [];
  const tagText = [w.tag, w.region].filter(Boolean).join(' · ');
  kopfZeilen.push(`**${w.cupTitel}**${tagText ? ` · ${tagText}` : ''}${w.datum ? ` · <t:${Math.floor(w.datum / 1000)}:d>` : ''}`);
  if (platz !== null) {
    const von = d.gesamt > 0 ? ` of ${zahl(d.gesamt)}` : '';
    const top = d.top !== null && d.top !== undefined && e ? ` (top ${d.top}%)` : '';
    kopfZeilen.push(`🏅 Place: **#${zahl(platz)}**${von}${top}`);
  } else if (d.dabei) {
    kopfZeilen.push('🏅 Place: outside Epic\'s public top 10,000 - link your Epic account with `/link-account` to see your exact rank');
  }
  if (punkte !== null) {
    kopfZeilen.push(`${einzelZeile(kennzahl('points'), punkte)} pts${typeof pp === 'number' && typeof pe === 'number' ? ` (${zahl(pp)} placement + ${zahl(pe)} elims)` : ''}`);
  }
  const teamZeilen = [
    spiele !== null ? `🎮 Matches Played: ${zahl(spiele)}` : null,
    siege !== null ? einzelZeile(kennzahl('wins'), siege) : null,
    schnitt !== null ? einzelZeile(kennzahl('avgPlace'), schnitt) : null,
  ].filter((x): x is string => !!x);
  if (teamZeilen.length) kopfZeilen.push(teamZeilen.join(' · '));

  /* ------------------------------------------------ Je Spieler (dieselben Regeln wie SpielerDetail.tsx) */
  const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const pos = (x: unknown): number | null => { const n = num(x); return n !== null && n > 0 ? n : null; };
  const link = (m: Mitglied) => eventLink(w.cupId, w.region, w.windowId, m.id);

  const einbettungen = mitglieder.slice(0, 10).map((m, i) => {
    const sz = (k: string) => num(m.szene?.[k]);
    const r = (k: string) => num(m.replay?.[k]);
    const elims = (solo && e && typeof e.elims === 'number' ? e.elims : null) ?? sz('eliminations') ?? r('kills');
    const dmg = sz('damageDealt') ?? r('damage') ?? (solo ? pos(e?.damage) : null);
    const dmgT = sz('damageTakenFromPlayers') ?? r('damageTaken') ?? (solo ? pos(e?.damageTaken) : null);
    const hits = sz('hitsToPlayers') ?? r('hits');
    const kopf = sz('headshots') ?? r('headshots') ?? (solo ? pos(e?.headshots) : null);
    const schuss = r('schussEcht');
    const genau = schuss && hits !== null ? (hits / schuss) * 100 : null;
    const selbst = r('selbstHolz') !== null ? (r('selbstHolz') ?? 0) + (r('selbstStein') ?? 0) + (r('selbstMetall') ?? 0) : null;
    // "Builds Placed" aus bauHolz/-Stein/-Metall ist im Team die Summe des Teams - je Spieler nur die eigenen Teile.
    const bau = selbst ?? (solo && r('bauHolz') !== null ? (r('bauHolz') ?? 0) + (r('bauStein') ?? 0) + (r('bauMetall') ?? 0) : null);
    const mats = r('farmHolz') !== null ? (r('farmHolz') ?? 0) + (r('farmStein') ?? 0) + (r('farmMetall') ?? 0) : null;
    const leben = e?.timeAlive ? e.timeAlive : r('lebenSek');
    const strecke = r('streckeM');
    const sturm = sz('timeInStorm') ?? r('sturmSek');
    const knocks = r('knocks');

    // Der Platz in der Kennzahl - nur, wenn die Player Stats denselben Wert fuehren (sonst gehoert der Platz zu einer anderen Zahl).
    const rang = (feld: string, wert: number | null, genauigkeit = 0.5) => {
      const x = raenge[m.id]?.[feld];
      return x && wert !== null && Math.abs(x.wert - wert) <= genauigkeit ? x.rang : undefined;
    };
    const zeilen: string[] = [];
    const plus = (k: KennzahlListe, wert: number | null, platzIn?: number) => { if (wert !== null) zeilen.push(einzelZeile(k, wert, platzIn)); };
    plus(kennzahl('elims'), elims, rang('kills', elims));
    plus(kennzahl('knocks'), knocks, rang('knocks', knocks));
    plus(kennzahl('damage'), dmg, rang('damage', dmg, 1));
    plus(kennzahl('damageTaken'), dmgT, rang('damageTaken', dmgT, 1));
    const quote = dmg !== null && dmgT ? dmg / dmgT : null;
    plus(kennzahl('quote'), quote, rang('quote', quote, 0.005));
    plus(kennzahl('hits'), hits, rang('hits', hits));
    plus(kennzahl('headshots'), kopf, rang('headshots', kopf));
    plus(kennzahl('genauigkeit'), genau, rang('genauigkeit', genau, 0.05));
    plus(kennzahl('builds'), bau, rang('builds', bau));
    plus(kennzahl('mats'), mats, rang('mats', mats));
    plus(kennzahl('timeAlive'), leben, rang('timeAlive', leben, 1));
    plus(kennzahl('distanz'), strecke !== null ? strecke / 1000 : null, rang('distanz', strecke, 1));
    plus(kennzahl('sturm'), sturm, rang('timeInStorm', sturm, 1));

    const k = kontext?.(m.id, m.name);
    const land = m.land ?? k?.land ?? null;
    const bild = k?.bild ? `${SEITE}${k.bild}` : null;
    const titel = `${flagge(land)} ${m.name}`.trim();
    const partner = mitglieder.filter((x) => x.id !== m.id).map((x) => x.name);
    const beschreibung = [
      ...kopfZeilen,
      ...(partner.length ? [`👥 Team: ${partner.join(' + ')}`] : []),
      '',
      zeilen.length ? zeilen.join('\n') : '*No per-player stats for this cup yet - the replays are still being read.*',
    ];
    const letzte = i === Math.min(mitglieder.length, 10) - 1;
    const fusszeile = ['thecomphub.com · stats', quelle].filter(Boolean).join(' · ');
    return {
      title: titel.slice(0, 256),
      url: link(m),
      color: FARBE,
      description: beschreibung.join('\n').slice(0, 4000),
      ...(bild ? { thumbnail: { url: bild } } : {}),
      ...(letzte && w.andere?.length ? { fields: [{ name: 'Other recent cups', value: w.andere.join('\n').slice(0, 1024) }] } : {}),
      ...(letzte ? { footer: { text: fusszeile } } : {}),
    } as Einbettung;
  });

  return {
    embeds: einbettungen,
    components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Open on thecomphub.com', url: link(mitglieder[0]) }] }],
  };
}
