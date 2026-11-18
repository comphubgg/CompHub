import { ftKonten, ftLand, ftFlaggeFuer, type FtKonten } from '@/lib/ftPosts';
import { kernname, ohneZierrat } from '@/lib/homoglyph';

/*
 * Post-Ideen fuer jeden Tag (Betreiber, 18.11.2026: X soll ein- bis zweimal TAEGLICH posten, nicht nur nach Cups - "ich habe nie Ideen").
 *
 * Dieses Modul ist der reine Teil: aus fertig geladenen Daten (Teilnehmerfeld, orgs.json, Preisgeld-Posten, Power Rankings, Cup-Katalog) werden Ideen -
 * je eine mit englischem Text (Flaggen, @-Konten) und den Angaben fuer das Bild (lib/postIdeenBild.tsx). Geladen wird in lib/postIdeenDaten.ts.
 * Nichts wird erfunden:
 *   - eine Org gilt nur, wenn das Konto in orgs.json steht (Pro oder Academy) - sonst "Free agent", nie aus dem Orgtag im Namen geraten;
 *   - Preisgeld nur aus den Posten der Rechnung "Most earnings" (/api/szene-stats?ansicht=verdienst-posten), je Org nur das Pro Roster ab Beitritt
 *     (dieselbe Regel wie /api/orgs);
 *   - Power-Ranking-Aufsteiger "seit der letzten Fortschreibung", nicht "diese Woche" (die Quelle nennt keinen Zeitraum);
 *   - eine Idee entsteht nur, wenn die Daten sie tragen (Mindestzahlen je Art).
 */

export type IdeeArt =
  | 'org-vertretung' | 'org-monat' | 'spieler-woche' | 'laender-woche' | 'meilenstein' | 'pr-aufsteiger' | 'konstanz' | 'zeitplan' | 'promo';
export type Format = '1600x900' | '1500x500';
export const FORMATE: Format[] = ['1600x900', '1500x500'];

export const SEITE = 'https://thecomphub.com';

export interface BildSpieler { id: string | null; name: string; land: string | null }
export interface BildOrg { name: string; logo: string | null; anzahl: number; spieler: BildSpieler[]; erster: boolean }
export interface BildZeile {
  rang: number; titel: string; unter?: string; wert: string; land?: string | null; logo?: string | null; foto?: string | null; hervor?: boolean;
}
export interface PlanTag { tag: string; eintraege: Array<{ titel: string; zeiten: string; finale: boolean }> }

interface Kopf { kicker: string; titel: string; unter: string; fuss: string }
export type IdeeBild =
  | (Kopf & { typ: 'orgs'; orgs: BildOrg[]; frei: BildSpieler[]; gesamt: number; abzeichen: string })
  | (Kopf & { typ: 'liste'; zeilen: BildZeile[]; wertTitel: string })
  | (Kopf & { typ: 'plan'; tage: PlanTag[] })
  | (Kopf & { typ: 'promo'; punkte: string[] });

export interface PostIdee {
  /** Fest je Inhalt (z. B. "org-vertretung:S43_FNCSSoloReload_Final_EU") - fuer Bild-Adresse und Auswahl. */
  id: string;
  art: IdeeArt;
  /** Kurzer Name fuer den Betreiber (deutsch). */
  titel: string;
  /** Warum heute (deutsch) - und was an den Daten offen ist. */
  grund: string;
  /** 0-100: wie gut die Idee heute passt (Termine, frische Daten, Meilensteine). */
  relevanz: number;
  /** Der fertige Text zum Kopieren (englisch). */
  text: string;
  bild: IdeeBild;
  standardFormat: Format;
}

/* ------------------------------------------------------------------ Konten: Name, Flagge, @ */

export interface KontoQuellen {
  /** spieler-profile.json (Objekt oder Liste). */
  profile: unknown;
  /** spieler-namen.json (id -> { haupt }). */
  namen: Record<string, { haupt?: string } | undefined> | null;
  /** spieler-anzeigenamen.json als Karte (lib/anzeigenamen). */
  anzeigenamen: Map<string, string>;
  /** lib/landQuellen: Fortnite-Flagge und Noble. */
  spiel?: Record<string, string>;
  noble?: Record<string, string>;
}

export interface Konten {
  name(id: string | null, ersatz?: string): string;
  /** Zwei Buchstaben klein fuers Bild (England & Co. als gb) - oder null. */
  land(id: string | null, region?: string): string | null;
  /** "🇩🇪 @kaan_fn" bzw. "🇩🇪 KAAN" - Flagge oder Regionszeichen und das X-Konto, sonst der Name. */
  wer(id: string | null, ersatz?: string, region?: string): string;
  x(id: string | null): string | null;
}

/** Ein Epic-Name ohne Orgtag, Startnummer und Fremdalphabet-Zwillinge. */
export const reinName = (n: string) => ohneZierrat(kernname(n)).trim() || n.trim();

export function kontenAus(q: KontoQuellen): Konten {
  // ftKonten nimmt den Hauptnamen aus spieler-namen vor dem gepflegten Anzeigenamen des Profils; hier geht der Anzeigename vor (der Hauptname ist oft
  // der rohe Epic-Name, "KAAN BABA GOTY7" statt "KAAN").
  const k: FtKonten = ftKonten(q.profile as Parameters<typeof ftKonten>[0], null, null);
  k.spiel = q.spiel; k.noble = q.noble;
  const profilName = { ...k.namen };
  const name = (id: string | null, ersatz = '') => {
    const i = (id ?? '').toLowerCase();
    const gepflegt = i ? (q.anzeigenamen.get(i) || profilName[i]) : '';
    if (gepflegt) return gepflegt;
    const haupt = i ? q.namen?.[i]?.haupt : '';
    return reinName(haupt || ersatz || i.slice(0, 8));
  };
  const land = (id: string | null, region = '') => {
    if (!id) return null;
    const l = ftLand({ ...k, region }, id)?.land ?? '';
    if (!l) return null;
    return /^(en|sco|wal|nir)$/.test(l) ? 'gb' : l.toLowerCase();
  };
  const x = (id: string | null) => (id ? k.x[id.toLowerCase()] ?? null : null);
  const wer = (id: string | null, ersatz = '', region = '') => {
    const flagge = id ? ftFlaggeFuer({ ...k, region }, id) : '';
    const h = x(id);
    return [flagge, h ? `@${h}` : name(id, ersatz)].filter(Boolean).join(' ');
  };
  return { name, land, wer, x };
}

/* ------------------------------------------------------------------ Hilfen */

const dollar = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const MONATE = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const REGION_NAME: Record<string, string> = { EU: 'Europe', NAC: 'NA Central', NAW: 'NA West', BR: 'Brazil', ASIA: 'Asia', ME: 'Middle East', OCE: 'Oceania' };
const TAG_MS = 86_400_000;

/** Plaetze mit Gleichstand: gleicher Wert, gleicher Platz (1, 2, 2, 4). */
function raenge<T>(liste: T[], wert: (x: T) => number): Array<{ x: T; rang: number }> {
  let rang = 0;
  return liste.map((x, i) => {
    if (i === 0 || wert(x) !== wert(liste[i - 1])) rang = i + 1;
    return { x, rang };
  });
}

/** "FNCS Solos Reload Finals" -> "FNCS Solos Reload Grand Finals". */
export function finalName(cupTitel: string): string {
  const t = cupTitel.replace(/\s*\((Battle Royale|Zero Build)\)\s*/i, ' ').trim();
  if (/grand final/i.test(t)) return t;
  return /finals?$/i.test(t) ? t.replace(/finals?$/i, 'Grand Finals') : `${t} Grand Finals`;
}

/* ------------------------------------------------------------------ 1. Org-Vertretung im Grand Final */

export interface OrgEintrag { id: string; name: string; logo: string | null; x: string | null; spieler: Array<{ epicId: string | null; name: string; rolle: string; seit: string | null }> }

/**
 * Konto -> Org aus orgs.json: Pro und Academy (Creator spielen nicht fuer die Org). Steht ein Konto bei zwei Orgs, gilt die mit dem juengeren
 * Beitrittsdatum; ohne Datum bei beiden ist die Zuordnung offen - dann keine (lieber "Free agent" als geraten).
 */
export function orgKarte(orgs: OrgEintrag[]): Map<string, { org: OrgEintrag; name: string }> {
  const kandidaten = new Map<string, Array<{ org: OrgEintrag; name: string; seit: string | null }>>();
  for (const o of orgs) {
    for (const s of o.spieler) {
      if (!s.epicId || s.rolle === 'creator') continue;
      const l = kandidaten.get(s.epicId) ?? [];
      if (!l.some((x) => x.org.id === o.id)) l.push({ org: o, name: s.name, seit: s.seit });
      kandidaten.set(s.epicId, l);
    }
  }
  const raus = new Map<string, { org: OrgEintrag; name: string }>();
  for (const [id, l] of kandidaten) {
    if (l.length === 1) { raus.set(id, l[0]); continue; }
    const datiert = l.filter((x) => x.seit).sort((a, b) => String(b.seit).localeCompare(String(a.seit)));
    if (datiert.length && (datiert.length === 1 || datiert[0].seit !== datiert[1].seit)) raus.set(id, datiert[0]);
  }
  return raus;
}

export interface FeldEingabe {
  windowId: string; region: string; cupTitel: string; begin: number;
  /** Die Konten des Feldes (alle Spieler aller Teams), mit dem Namen aus der Bestenliste. */
  spieler: Array<{ id: string; name: string }>;
  geprueft: boolean;
  /** Vorrunden, deren Ergebnis noch aussteht. */
  offen: number;
  /** Woher das Feld kommt ("Heat 1 · 14/11", ...). */
  quellen: string[];
}

export function orgVertretungIdee(f: FeldEingabe, orgs: OrgEintrag[], k: Konten, jetzt: number): PostIdee | null {
  if (f.spieler.length < 10) return null;
  const karte = orgKarte(orgs);
  const jeOrg = new Map<string, { org: OrgEintrag; ids: string[] }>();
  const frei: string[] = [];
  for (const s of f.spieler) {
    const o = karte.get(s.id);
    if (!o) { frei.push(s.id); continue; }
    const e = jeOrg.get(o.org.id) ?? { org: o.org, ids: [] };
    e.ids.push(s.id);
    jeOrg.set(o.org.id, e);
  }
  if (!jeOrg.size) return null;
  const ersatz = new Map(f.spieler.map((s) => [s.id, s.name]));
  // Der Name, den die Org fuehrt, nur wenn es keinen gepflegten gibt.
  const orgName = new Map([...karte].map(([id, o]) => [id, o.name]));
  const nameVon = (id: string) => k.name(id, orgName.get(id) || ersatz.get(id) || '');
  const sortiert = [...jeOrg.values()].sort((a, b) => b.ids.length - a.ids.length || a.org.name.localeCompare(b.org.name));
  const spitze = sortiert[0].ids.length;
  const geteilt = sortiert.filter((o) => o.ids.length === spitze).length > 1;
  const titel = finalName(f.cupTitel);
  const region = f.region;
  const tag = new Date(f.begin).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

  const plaetze = raenge(sortiert, (o) => o.ids.length);
  const zeilen = plaetze.filter((p) => p.rang <= 3).map(({ x: o, rang }) => {
    const wer = o.org.x ? `@${o.org.x}` : o.org.name;
    const leute = o.ids.map((id) => k.wer(id, nameVon(id), region)).join(', ');
    return `${rang}. ${wer} - ${o.ids.length} ${o.ids.length === 1 ? 'player' : 'players'}: ${leute}`;
  });
  const text = [
    `Most represented orgs in the ${titel} 🏆 (${region})`,
    '',
    ...zeilen,
    '',
    `${frei.length} of ${f.spieler.length} qualified players are free agents.`,
  ].join('\n');

  const bildSp = (id: string): BildSpieler => ({ id, name: nameVon(id), land: k.land(id, region) });
  const tageBis = Math.floor((f.begin - jetzt) / TAG_MS);
  const relevanz = f.begin <= jetzt ? 30 : Math.max(50, 92 - Math.max(0, tageBis) * 6) - (f.offen ? 25 : 0) - (/^(EU|NAC)$/.test(region) ? 0 : 15);
  const grund = [
    `${titel} ${region} am ${new Date(f.begin).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'Europe/Berlin' })}`,
    `${f.spieler.length} Spieler im Feld (${f.quellen.join(', ') || 'Quellen unbekannt'})`,
    f.geprueft ? 'Marken je Konto bei Epic bestätigt' : 'Marken noch nicht je Konto bestätigt - Feld laut Bestenlisten',
    f.offen ? `${f.offen} Vorrunde(n) noch offen - Feld unvollständig` : '',
    `${jeOrg.size} Orgs, ${frei.length} Free Agents (nur Konten aus orgs.json zählen)`,
  ].filter(Boolean).join(' · ');
  return {
    id: `org-vertretung:${f.windowId}`, art: 'org-vertretung', titel: `Orgs im ${titel} ${region}`, grund, relevanz, text, standardFormat: '1600x900',
    bild: {
      typ: 'orgs', kicker: `${titel.toUpperCase()} · ${REGION_NAME[region]?.toUpperCase() ?? region} · ${tag.toUpperCase()}`,
      titel: 'MOST REPRESENTED ORGS',
      unter: `${f.spieler.length} qualified players · ${jeOrg.size} orgs · ${frei.length} free agents`,
      fuss: geteilt ? `Tied for #1 with ${spitze} players each` : `#1 most represented: ${sortiert[0].org.name}`,
      gesamt: f.spieler.length, abzeichen: geteilt ? 'TIED FOR #1' : '#1 MOST REPRESENTED',
      orgs: sortiert.map((o) => ({
        name: o.org.name, logo: o.org.logo, anzahl: o.ids.length, erster: o.ids.length === spitze,
        spieler: o.ids.map(bildSp),
      })),
      frei: frei.map(bildSp).sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
    },
  };
}

/* ------------------------------------------------------------------ Preisgeld-Posten */

/** /api/szene-stats?ansicht=verdienst-posten: fenster[i] = { w, t, r, d }, konten[id] = [[fensterNr, betrag, platz, punkte, team], ...], summen[id]. */
export interface VerdienstPosten {
  fenster: Array<{ w: string; t: string; r: string; d: number | null; q?: string }>;
  konten: Record<string, Array<[number, number, number | null, number | null, string[]]>>;
  summen: Record<string, number>;
}

/** Das Preisgeld je Konto in [von, bis), mit der Zahl der Turniere. */
export function geldImZeitraum(v: VerdienstPosten, von: number, bis: number): Map<string, { betrag: number; posten: Array<{ d: number; betrag: number }> }> {
  const raus = new Map<string, { betrag: number; posten: Array<{ d: number; betrag: number }> }>();
  for (const [id, liste] of Object.entries(v.konten)) {
    for (const [nr, betrag] of liste) {
      const d = v.fenster[nr]?.d;
      if (!betrag || betrag <= 0 || d == null || d < von || d >= bis) continue;
      const e = raus.get(id) ?? { betrag: 0, posten: [] };
      e.betrag += betrag; e.posten.push({ d, betrag });
      raus.set(id, e);
    }
  }
  return raus;
}

/* ------------------------------------------------------------------ 2. Orgs mit dem meisten Preisgeld im Monat */

export function orgMonatIdee(v: VerdienstPosten, orgs: OrgEintrag[], k: Konten, jahr: number, monat: number, jetzt: number): PostIdee | null {
  const von = Date.UTC(jahr, monat, 1);
  const bis = Date.UTC(jahr, monat + 1, 1);
  const fertig = jetzt >= bis;
  const geld = geldImZeitraum(v, von, Math.min(bis, jetzt + 1));
  const liste = orgs.map((o) => {
    const wer: Array<{ id: string; name: string; betrag: number }> = [];
    for (const s of o.spieler) {
      if (!s.epicId || s.rolle !== 'pro') continue;
      const ab = s.seit ? Date.parse(`${s.seit}T00:00:00Z`) : 0;
      const b = (geld.get(s.epicId)?.posten ?? []).filter((p) => p.d >= ab).reduce((a, p) => a + p.betrag, 0);
      if (b > 0) wer.push({ id: s.epicId, name: s.name, betrag: b });
    }
    return { o, betrag: wer.reduce((a, w) => a + w.betrag, 0), wer: wer.sort((a, b) => b.betrag - a.betrag) };
  }).filter((x) => x.betrag > 0).sort((a, b) => b.betrag - a.betrag || a.o.name.localeCompare(b.o.name));
  if (liste.length < 3) return null;
  const top = raenge(liste, (x) => x.betrag).filter((r) => r.rang <= 5);
  const monatName = `${MONATE[monat]} ${jahr}`;
  const zusatz = fertig ? '' : ' (so far)';
  const spieler = liste.flatMap((x) => x.wer.map((w) => ({ ...w, org: x.o }))).sort((a, b) => b.betrag - a.betrag);
  // Bei Gleichstand alle mit dem hoechsten Betrag - nie einen davon als "den" Besten.
  const beste = spieler.filter((s) => s.betrag === spieler[0]?.betrag);
  const text = [
    `Orgs with the most Fortnite earnings in ${monatName}${zusatz} 💰`,
    '',
    ...top.map(({ x, rang }) => `${rang}. ${x.o.x ? `@${x.o.x}` : x.o.name} ${dollar(x.betrag)}`),
    '',
    beste.length ? `Top ${beste.length > 1 ? 'earners' : 'earner'} on an org roster (${dollar(beste[0].betrag)}): ${beste.map((s) => `${k.wer(s.id, s.name)} (${s.org.x ? `@${s.org.x}` : s.org.name})`).join(', ')}` : '',
    '',
    `Pro rosters only, counted from the day each player joined.`,
  ].filter((z, i, a) => z || (a[i - 1] ?? '') !== '').join('\n').trim();
  const tagImMonat = new Date(jetzt).getUTCDate();
  const relevanz = fertig ? (jetzt - bis < 4 * TAG_MS ? 88 : 30) : 30 + Math.round(Math.min(1, tagImMonat / 30) * 25);
  return {
    id: `org-monat:${jahr}-${String(monat + 1).padStart(2, '0')}`, art: 'org-monat',
    titel: `Orgs mit dem meisten Preisgeld · ${monatName}${fertig ? '' : ' (bisher)'}`,
    grund: `${liste.length} Orgs mit Preisgeld im ${monatName}; nur Pro Roster ab Beitritt (wie /admin/orgs)${fertig ? '' : ' - Monat läuft noch, Text sagt "so far"'}`,
    relevanz, text, standardFormat: '1600x900',
    bild: {
      typ: 'liste', kicker: `EARNINGS · ${monatName.toUpperCase()}${fertig ? '' : ' · SO FAR'}`, titel: 'TOP EARNING ORGS',
      unter: 'Pro rosters only, counted from the day each player joined', fuss: `${liste.length} orgs earned prize money this month`,
      wertTitel: 'EARNINGS',
      zeilen: top.map(({ x, rang }, i) => ({
        rang, titel: x.o.name, logo: x.o.logo, wert: dollar(x.betrag), hervor: i === 0 || rang === 1,
        unter: x.wer.slice(0, 4).map((w) => `${k.name(w.id, w.name)} ${dollar(w.betrag)}`).join(' · '),
      })),
    },
  };
}

/* ------------------------------------------------------------------ 3a. Spieler der Woche (Preisgeld) */

function wocheGrenzen(jetzt: number) {
  return { von: jetzt - 7 * TAG_MS, bis: jetzt };
}

export function spielerWocheIdee(v: VerdienstPosten, k: Konten, fotos: Map<string, string>, jetzt: number): PostIdee | null {
  const { von, bis } = wocheGrenzen(jetzt);
  const geld = [...geldImZeitraum(v, von, bis)].sort((a, b) => b[1].betrag - a[1].betrag);
  if (geld.length < 5) return null;
  const top = raenge(geld, (x) => x[1].betrag).filter((r) => r.rang <= 5);
  const [erst] = geld;
  const geteilt = geld.length > 1 && geld[1][1].betrag === erst[1].betrag;
  const text = [
    geteilt ? `Most Fortnite earnings in the last 7 days 💸` : `Player of the week 💸 ${k.wer(erst[0])} earned ${dollar(erst[1].betrag)} in the last 7 days`,
    '',
    ...top.map(({ x, rang }) => `${rang}. ${k.wer(x[0])} ${dollar(x[1].betrag)}`),
  ].join('\n');
  const wochentag = new Date(jetzt).getUTCDay();
  return {
    id: `spieler-woche:${new Date(jetzt).toISOString().slice(0, 10)}`, art: 'spieler-woche', titel: 'Spieler der Woche (Preisgeld, 7 Tage)',
    grund: `${geld.length} Konten mit Preisgeld in den letzten 7 Tagen (Rechnung "Most earnings")`,
    relevanz: wochentag === 1 ? 72 : 42, text, standardFormat: '1600x900',
    bild: {
      typ: 'liste', kicker: 'LAST 7 DAYS · ALL REGIONS', titel: geteilt ? 'MOST EARNINGS THIS WEEK' : 'PLAYER OF THE WEEK',
      unter: 'Prize money from every Epic-paid tournament', fuss: `${geld.length} players earned prize money`, wertTitel: 'EARNINGS',
      zeilen: top.map(({ x, rang }) => ({
        rang, titel: k.name(x[0]), land: k.land(x[0]), foto: fotos.get(x[0]) ?? null, wert: dollar(x[1].betrag), hervor: rang === 1,
        unter: `${x[1].posten.length} ${x[1].posten.length === 1 ? 'tournament' : 'tournaments'}`,
      })),
    },
  };
}

/* ------------------------------------------------------------------ 3b. Laender der Woche */

export function laenderWocheIdee(v: VerdienstPosten, k: Konten, jetzt: number): PostIdee | null {
  const { von, bis } = wocheGrenzen(jetzt);
  const jeLand = new Map<string, { betrag: number; spieler: number }>();
  let ohne = 0;
  for (const [id, g] of geldImZeitraum(v, von, bis)) {
    const l = k.land(id);
    if (!l) { ohne += g.betrag; continue; }
    const e = jeLand.get(l) ?? { betrag: 0, spieler: 0 };
    e.betrag += g.betrag; e.spieler += 1;
    jeLand.set(l, e);
  }
  const liste = [...jeLand].sort((a, b) => b[1].betrag - a[1].betrag);
  if (liste.length < 5) return null;
  const dn = new Intl.DisplayNames(['en'], { type: 'region' });
  const landName = (l: string) => { try { return dn.of(l.toUpperCase()) ?? l.toUpperCase(); } catch { return l.toUpperCase(); } };
  const flagge = (l: string) => [...l.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('');
  const top = raenge(liste, (x) => x[1].betrag).filter((r) => r.rang <= 5);
  const text = [
    `Fortnite earnings by country, last 7 days 🌍`,
    '',
    ...top.map(({ x, rang }) => `${rang}. ${flagge(x[0])} ${landName(x[0])} ${dollar(x[1].betrag)}`),
  ].join('\n');
  return {
    id: `laender-woche:${new Date(jetzt).toISOString().slice(0, 10)}`, art: 'laender-woche', titel: 'Länder-Rangliste der Woche (Preisgeld)',
    grund: `${liste.length} Länder; ${dollar(ohne)} von Spielern ohne bekanntes Land sind nicht gezählt`,
    relevanz: new Date(jetzt).getUTCDay() === 2 ? 62 : 36, text, standardFormat: '1600x900',
    bild: {
      typ: 'liste', kicker: 'LAST 7 DAYS · ALL REGIONS', titel: 'EARNINGS BY COUNTRY', unter: 'Prize money from every Epic-paid tournament',
      fuss: 'Players without a known country are not counted', wertTitel: 'EARNINGS',
      zeilen: top.map(({ x, rang }) => ({
        rang, titel: landName(x[0]), land: x[0], wert: dollar(x[1].betrag), hervor: rang === 1,
        unter: `${x[1].spieler} ${x[1].spieler === 1 ? 'player' : 'players'}`,
      })),
    },
  };
}

/* ------------------------------------------------------------------ 3c. Meilensteine */

const SCHWELLEN = [100_000, 250_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000];

/** Wer in den letzten 7 Tagen eine Preisgeld-Schwelle aller Zeiten ueberschritten hat (Summe vorher < Schwelle <= Summe jetzt). */
export function meilensteinIdeen(v: VerdienstPosten, k: Konten, fotos: Map<string, string>, jetzt: number): PostIdee[] {
  const { von, bis } = wocheGrenzen(jetzt);
  const raus: PostIdee[] = [];
  for (const [id, g] of geldImZeitraum(v, von, bis)) {
    const summe = v.summen[id] ?? 0;
    const vorher = summe - g.betrag;
    const s = [...SCHWELLEN].reverse().find((t) => vorher < t && summe >= t);
    if (!s) continue;
    const runde = s >= 1_000_000 ? `$${s / 1_000_000}M` : `$${s / 1000}K`;
    raus.push({
      id: `meilenstein:${id}:${s}`, art: 'meilenstein', titel: `Meilenstein: ${k.name(id)} über ${runde}`,
      grund: `Preisgeld aller Zeiten ${dollar(vorher)} -> ${dollar(summe)} durch ${g.posten.length} Turnier(e) der letzten 7 Tage`,
      relevanz: s >= 1_000_000 ? 96 : s >= 500_000 ? 82 : 64,
      text: `${k.wer(id)} has passed ${runde} in career Fortnite earnings 🎉\n\nAll-time: ${dollar(summe)}`,
      standardFormat: '1600x900',
      bild: {
        typ: 'liste', kicker: 'MILESTONE · CAREER EARNINGS', titel: `${runde} CLUB`, unter: `${k.name(id)} has passed ${runde} in Fortnite earnings`,
        fuss: 'All Epic-paid tournaments, LANs included', wertTitel: 'ALL-TIME',
        zeilen: [{ rang: 1, titel: k.name(id), land: k.land(id), foto: fotos.get(id) ?? null, wert: dollar(summe), hervor: true, unter: `+${dollar(g.betrag)} in the last 7 days` }],
      },
    });
  }
  return raus;
}

/* ------------------------------------------------------------------ 3d. Power-Ranking-Aufsteiger */

export interface PrSpieler { rank: number; id: string; name: string; anzeige?: string; land?: string; deltaPlatz?: number; bild?: string | null }

export function prAufsteigerIdee(pr: { spieler: PrSpieler[]; stand: number | null }, k: Konten, jetzt: number): PostIdee | null {
  const auf = pr.spieler.filter((s) => (s.deltaPlatz ?? 0) > 0 && s.rank <= 200)
    .sort((a, b) => (b.deltaPlatz ?? 0) - (a.deltaPlatz ?? 0) || a.rank - b.rank).slice(0, 5);
  if (auf.length < 3) return null;
  const name = (s: PrSpieler) => k.name(s.id, s.anzeige || s.name);
  const text = [
    `Biggest climbers in the latest Power Rankings update 📈 (top 200)`,
    '',
    ...auf.map((s, i) => `${i + 1}. ${k.wer(s.id, name(s))} ▲${s.deltaPlatz} to #${s.rank}`),
    '',
    `${SEITE}/power-rankings`,
  ].join('\n');
  const alter = pr.stand ? jetzt - pr.stand : Infinity;
  return {
    id: `pr-aufsteiger:${pr.stand ?? 0}`, art: 'pr-aufsteiger', titel: 'Größte Aufsteiger der Power Rankings (Top 200)',
    grund: `Sprünge seit der letzten Fortschreibung der Rangliste (Stand ${pr.stand ? new Date(pr.stand).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : 'unbekannt'}) - der Zeitraum ist nicht "diese Woche"`,
    relevanz: alter < 36 * 3_600_000 ? 60 : 32, text, standardFormat: '1600x900',
    bild: {
      typ: 'liste', kicker: 'POWER RANKINGS · TOP 200', titel: 'BIGGEST CLIMBERS', unter: 'Places gained since the last ranking update',
      fuss: 'thecomphub.com/power-rankings', wertTitel: 'NOW',
      zeilen: auf.map((s, i) => ({
        rang: i + 1, titel: name(s), land: k.land(s.id) ?? (s.land ? s.land.toLowerCase() : null), foto: s.bild ?? null,
        wert: `#${s.rank}`, unter: `▲ ${s.deltaPlatz} places`, hervor: i === 0,
      })),
    },
  };
}

/* ------------------------------------------------------------------ 3e. Konstanteste Spieler der Woche */

export interface TabellenSpieltag { windowId: string; titel: string; region: string; teams: Array<{ platz: number; ids: string[] }> }

/** Die niedrigste mittlere Platzierung ueber die Finals-Lobbys der Woche einer Region (hoechstens 150 Teams je Tabelle, mindestens `mindest` Cups). */
export function konstanzIdee(tage: TabellenSpieltag[], region: string, k: Konten, jetzt: number, mindest = 3): PostIdee | null {
  const lobbys = tage.filter((t) => t.region === region && t.teams.length >= 10 && t.teams.length <= 150);
  if (lobbys.length < mindest) return null;
  const plaetze = new Map<string, number[]>();
  for (const t of lobbys) for (const team of t.teams) for (const id of team.ids) plaetze.set(id, [...(plaetze.get(id) ?? []), team.platz]);
  const liste = [...plaetze].filter(([, p]) => p.length >= mindest)
    .map(([id, p]) => ({ id, n: p.length, schnitt: p.reduce((a, b) => a + b, 0) / p.length }))
    .sort((a, b) => a.schnitt - b.schnitt || b.n - a.n);
  if (liste.length < 5) return null;
  const top = raenge(liste, (x) => Math.round(x.schnitt * 10)).filter((r) => r.rang <= 5);
  const ein = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const text = [
    `Most consistent players this week 📊 (${region}: lowest average placement in lobbies of up to 150, min. ${mindest} cups)`,
    '',
    ...top.map(({ x, rang }) => `${rang}. ${k.wer(x.id, '', region)} avg. ${ein(x.schnitt)} in ${x.n} cups`),
  ].join('\n');
  return {
    id: `konstanz:${region}:${new Date(jetzt).toISOString().slice(0, 10)}`, art: 'konstanz', titel: `Konstanteste Spieler der Woche (${region})`,
    grund: `${lobbys.length} Lobbys mit bis 150 Teams (Finals, Heats, Runde 2) der letzten 7 Tage in ${region}: ${lobbys.map((l) => l.titel).slice(0, 6).join(', ')}${lobbys.length > 6 ? ' …' : ''}`,
    relevanz: new Date(jetzt).getUTCDay() === 1 ? 58 : 34, text, standardFormat: '1600x900',
    bild: {
      typ: 'liste', kicker: `LAST 7 DAYS · ${REGION_NAME[region]?.toUpperCase() ?? region}`, titel: 'MOST CONSISTENT PLAYERS',
      unter: `Lowest average placement in lobbies of up to 150 · at least ${mindest} cups`, fuss: `${lobbys.length} lobbies counted`, wertTitel: 'AVG. PLACE',
      zeilen: top.map(({ x, rang }) => ({ rang, titel: k.name(x.id), land: k.land(x.id, region), wert: ein(x.schnitt), unter: `${x.n} cups`, hervor: rang === 1 })),
    },
  };
}

/* ------------------------------------------------------------------ 3f. Zeitplan der Woche */

export interface PlanFenster { cupTitel: string; region: string; begin: number; istFinale: boolean; status: string; windowId: string }

export function zeitplanIdee(fenster: PlanFenster[], jetzt: number): PostIdee | null {
  const ende = jetzt + 7 * TAG_MS;
  const relevant = fenster.filter((f) => f.status !== 'vorbei' && f.begin > jetzt && f.begin < ende && /^(EU|NAC)$/.test(f.region)
    && !/ranked/i.test(f.cupTitel));
  if (relevant.length < 3) return null;
  // Je Cup und Tag (Berliner Zeit) die erste Runde je Region.
  const tagVon = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Berlin' });
  const zeit = (ms: number, tz: string) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const gruppen = new Map<string, { tag: string; titel: string; begin: number; eu?: number; na?: number; finale: boolean }>();
  for (const f of relevant.sort((a, b) => a.begin - b.begin)) {
    // NA-Abende liegen nach Mitternacht in Berlin: der Tag kommt von der EU-Runde, sonst von der NA-Zeit in New York.
    const tag = f.region === 'EU' ? tagVon(f.begin)
      : new Date(f.begin).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/New_York' });
    const titel = f.istFinale ? finalName(f.cupTitel) : f.cupTitel.replace(/\s*\((Battle Royale|Zero Build)\)\s*/i, ' ').trim();
    const sch = `${tag}|${titel}`;
    const g = gruppen.get(sch) ?? { tag, titel, begin: f.begin, finale: f.istFinale };
    if (f.region === 'EU' && g.eu === undefined) g.eu = f.begin;
    if (f.region === 'NAC' && g.na === undefined) g.na = f.begin;
    g.begin = Math.min(g.begin, f.begin);
    gruppen.set(sch, g);
  }
  const tage: PlanTag[] = [];
  for (const g of [...gruppen.values()].sort((a, b) => a.begin - b.begin)) {
    let t = tage.find((x) => x.tag === g.tag);
    if (!t) { t = { tag: g.tag, eintraege: [] }; tage.push(t); }
    const zeiten = [g.eu !== undefined ? `EU ${zeit(g.eu, 'Europe/Berlin')} CET` : '', g.na !== undefined ? `NA ${zeit(g.na, 'America/New_York')} ET` : ''].filter(Boolean).join(' · ');
    t.eintraege.push({ titel: g.titel, zeiten, finale: g.finale });
  }
  const text = [
    `Competitive Fortnite this week 📅`,
    '',
    ...tage.flatMap((t) => [`${t.tag}`, ...t.eintraege.map((e) => `${e.finale ? '🏆' : '•'} ${e.titel}: ${e.zeiten}`), '']),
    `Live standings: ${SEITE}/events`,
  ].join('\n').trim();
  const montag = new Date(jetzt).getUTCDay() === 1;
  const finals = tage.some((t) => t.eintraege.some((e) => e.finale));
  return {
    id: `zeitplan:${new Date(jetzt).toISOString().slice(0, 10)}`, art: 'zeitplan', titel: 'Zeitplan der nächsten 7 Tage (EU/NA)',
    grund: `${relevant.length} Spieltage EU/NAC aus dem Cup-Katalog (ohne Ranked)${finals ? ', mit Finals' : ''}`,
    relevanz: montag ? 80 : finals ? 55 : 40, text, standardFormat: '1600x900',
    bild: { typ: 'plan', kicker: 'NEXT 7 DAYS · EU & NA', titel: 'UPCOMING THIS WEEK', unter: 'EU times in CET · NA times in ET', fuss: 'Live standings on thecomphub.com/events', tage },
  };
}

/* ------------------------------------------------------------------ 3g. Werbung fuer die Seite */

const PROMOS: Array<{ id: string; titel: string; kicker: string; gross: string; unter: string; punkte: string[]; text: string }> = [
  { id: 'power-rankings', titel: 'Promo: Power Rankings', kicker: 'ON THECOMPHUB.COM', gross: 'POWER RANKINGS', unter: 'The top 10,000 players in one list',
    punkte: ['Search any player', 'Places gained and lost since the last update', 'Countries of the top 100'],
    text: `Where do you rank? 📈\n\nThe Power Rankings on CompHub: search any player, see who climbed since the last update and where the top 100 come from.\n\n${SEITE}/power-rankings` },
  { id: 'statistics', titel: 'Promo: Spielerprofile & Statistik', kicker: 'ON THECOMPHUB.COM', gross: 'PLAYER PROFILES', unter: 'Every pro, every tournament',
    punkte: ['Earnings tournament by tournament', 'FNCS results and teammates', 'Eliminations and Damage per season'],
    text: `Open any player on CompHub and see the whole career 🔎\n\nEarnings tournament by tournament, FNCS results, teammates, eliminations and Damage per season.\n\n${SEITE}/statistics` },
  { id: 'tournament-maps', titel: 'Promo: Turnierkarten', kicker: 'ON THECOMPHUB.COM', gross: 'TOURNAMENT MAPS', unter: 'Every map version, every tournament matched to its map',
    punkte: ['Chapter 1 to today', 'Each tournament on the map it was played on', 'Drop spots of the pros'],
    text: `Every Fortnite map version, from Chapter 1 to today 🗺️\n\nEach tournament matched to the map it was played on.\n\n${SEITE}/tournament-maps` },
  { id: 'match-id', titel: 'Promo: Match-ID-Finder (VIP)', kicker: 'COMPHUB VIP', gross: 'MATCH ID FINDER', unter: 'Find the match your favourite pro is in - live during cups',
    punkte: ['Save players as favourites', 'Copy the Match ID and spectate in game', 'Live during cups and scrims'],
    text: `Want to spectate a pro live during a cup? 👀\n\nThe CompHub Match ID finder shows which match your favourite players are in, so you can copy the ID and watch in game. Available for VIP members.\n\n${SEITE}` },
  { id: 'overlays', titel: 'Promo: Stream-Overlays', kicker: 'FOR STREAMERS', gross: 'STREAM OVERLAYS', unter: 'Live leaderboards and stats for your stream',
    punkte: ['Live leaderboard during cups', 'Your own colours and layout', 'Add it to OBS in seconds'],
    text: `Streaming a cup? 🎥\n\nCompHub overlays put the live leaderboard and your stats on stream - your colours, your layout.\n\n${SEITE}/overlays` },
];

export function promoIdeen(jetzt: number): PostIdee[] {
  const tagNr = Math.floor(jetzt / TAG_MS);
  return PROMOS.map((p, i) => ({
    id: `promo:${p.id}`, art: 'promo' as const, titel: p.titel, grund: 'Werbung für eine Funktion der Seite - gelegentlich, wenn sonst wenig ansteht',
    // Jeden Tag eine andere vorn.
    relevanz: 18 + ((tagNr + i) % PROMOS.length === 0 ? 8 : 0), text: p.text, standardFormat: '1600x900' as Format,
    bild: { typ: 'promo' as const, kicker: p.kicker, titel: p.gross, unter: p.unter, punkte: p.punkte, fuss: SEITE.replace(/^https:\/\//, '') },
  }));
}

/* ------------------------------------------------------------------ Alle zusammen */

export interface IdeenEingabe {
  konten: Konten;
  orgs: OrgEintrag[];
  /** Die Teilnehmerfelder der anstehenden Grand Finals (lib/prognoseFeld). */
  felder: FeldEingabe[];
  verdienst: VerdienstPosten | null;
  /** Konto -> freie Foto-Adresse. */
  fotos: Map<string, string>;
  pr: { spieler: PrSpieler[]; stand: number | null } | null;
  tabellen: TabellenSpieltag[];
  plan: PlanFenster[];
}

export function alleIdeen(e: IdeenEingabe, jetzt: number): PostIdee[] {
  const ideen: Array<PostIdee | null> = [];
  for (const f of e.felder) ideen.push(orgVertretungIdee(f, e.orgs, e.konten, jetzt));
  if (e.verdienst) {
    const d = new Date(jetzt);
    // Die ersten drei Tage eines Monats: der abgeschlossene Vormonat; sonst der laufende ("so far").
    const [j, mo] = d.getUTCDate() <= 3 ? [d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear(), (d.getUTCMonth() + 11) % 12] : [d.getUTCFullYear(), d.getUTCMonth()];
    ideen.push(orgMonatIdee(e.verdienst, e.orgs, e.konten, j, mo, jetzt));
    ideen.push(spielerWocheIdee(e.verdienst, e.konten, e.fotos, jetzt));
    ideen.push(laenderWocheIdee(e.verdienst, e.konten, jetzt));
    ideen.push(...meilensteinIdeen(e.verdienst, e.konten, e.fotos, jetzt));
  }
  if (e.pr) ideen.push(prAufsteigerIdee(e.pr, e.konten, jetzt));
  for (const r of ['EU', 'NAC']) ideen.push(konstanzIdee(e.tabellen, r, e.konten, jetzt));
  ideen.push(zeitplanIdee(e.plan, jetzt));
  ideen.push(...promoIdeen(jetzt));
  return ideen.filter((i): i is PostIdee => !!i).sort((a, b) => b.relevanz - a.relevanz);
}

/* ------------------------------------------------------------------ 4. Die zwei des Tages */

/** Die besten Ideen fuer heute: nach Relevanz, je Art hoechstens eine, Werbung nur, wenn nichts anderes da ist. */
export function tagesAuswahl(ideen: PostIdee[], anzahl = 2): string[] {
  const raus: PostIdee[] = [];
  const arten = new Set<IdeeArt>();
  for (const i of [...ideen].sort((a, b) => b.relevanz - a.relevanz)) {
    if (raus.length >= anzahl) break;
    if (arten.has(i.art)) continue;
    // Zwei Preisgeld-Listen am selben Tag wirken doppelt.
    const geld: IdeeArt[] = ['org-monat', 'spieler-woche', 'laender-woche'];
    if (geld.includes(i.art) && raus.some((r) => geld.includes(r.art))) continue;
    raus.push(i); arten.add(i.art);
  }
  // Tragen die Daten heute zu wenig, fuellt die naechstbeste Idee auf (etwa eine zweite Werbung) - immer zwei zur Wahl.
  for (const i of [...ideen].sort((a, b) => b.relevanz - a.relevanz)) {
    if (raus.length >= anzahl) break;
    if (!raus.includes(i)) raus.push(i);
  }
  return raus.map((i) => i.id);
}
