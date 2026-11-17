import { aendereJson, liesJson } from '@/lib/ablage';

/*
 * CompHub Awards 2026 (Betreiber, 17.11.2026) - vorerst NUR fuer den Admin.
 *
 * Ein Konzept eines Partners, jetzt ein CompHub-Projekt (nur Fortnite Competitive): Kategorien, in denen ein Gremium (~15 Leute) Nominierte
 * vorschlaegt; in einigen stimmt danach die Community ab (Content Creator, Play of the Year, Male, Female, Young Player), den Rest entscheidet
 * das Gremium. Dazu Sonderpreise (Manager und Coach, je "Best" und "Upcoming").
 *
 * Zwei Dateien im Datenarchiv (comphub-daten):
 *   awards-2026.json          Kategorien, Nominierte, Phasen, Ergebnisse - schreibt nur der Admin (/admin/awards)
 *   awards-2026-stimmen.json  die Stimmen der Community: je Kategorie Epic-Id -> Nominierten-Id (eine Stimme je Epic-Konto und Kategorie)
 *
 * Solange OEFFENTLICH false ist, sind /awards, /awards/<kategorie> und alle Schnittstellen nur fuer den Admin (Middleware: echter 404, Seite: notFound,
 * Schnittstellen: 404). Kein Menuepunkt, keine Sitemap, noindex. Oeffentlich wird es erst mit einer Code-Aenderung hier - nie aus Versehen ueber einen Schalter.
 *
 * Kein Alter: die Young-Player-Kategorie nennt nie ein Alter oder Geburtsdatum (Betreiber).
 */

export const OEFFENTLICH = false;

export const AWARDS_DATEI = 'awards-2026.json';
export const STIMMEN_DATEI = 'awards-2026-stimmen.json';

/** community: die Community stimmt ab (nach den Nominierungen des Gremiums); panel: das Gremium entscheidet; beide: beides zaehlt. */
export type AbstimmungsArt = 'community' | 'panel' | 'beide';
/** spieler: ein Profi mit Epic-Konto (Foto, Flagge, Team aus unseren Daten); person: Org/Creator/Agent/Manager/Coach von Hand; clip: ein Spielzug mit Link. */
export type NominiertenArt = 'spieler' | 'person' | 'clip';

export interface Nominierter {
  id: string;
  art: NominiertenArt;
  name: string;
  epicId?: string | null;
  team?: string | null;
  teamLogo?: string | null;
  /** ISO-Kuerzel (zwei Buchstaben). */
  land?: string | null;
  /** Bild-Adresse: fuer Spieler aus unserem Pool (wird beim Anzeigen frisch ueber die Epic-Id geholt), sonst von Hand. */
  bild?: string | null;
  /** Kurze Zahlenzeile, z. B. "44 events · 3.66 elims/match · $260K". */
  statZeile?: string | null;
  /** X-Handle ohne @. */
  x?: string | null;
  /** Clip oder Beleg (YouTube, X, Twitch ...). */
  link?: string | null;
}

export interface Kategorie {
  id: string;
  name: string;
  beschreibung: string;
  art: AbstimmungsArt;
  sonderpreis: boolean;
  nominierte: Nominierter[];
  /** Gewinner (Nominierten-Id) - erst sichtbar in der Ergebnis-Phase. */
  sieger?: string | null;
}

export interface Zeitraum { start: string | null; ende: string | null }

export interface Awards {
  version: 1;
  titel: string;
  phasen: { nominierung: Zeitraum; abstimmung: Zeitraum; ergebnis: { datum: string | null } };
  kategorien: Kategorie[];
  geaendert?: number;
}

export type Phase = 'vorher' | 'nominierung' | 'zwischen' | 'abstimmung' | 'auswertung' | 'ergebnis';

const kat = (id: string, name: string, beschreibung: string, art: AbstimmungsArt, sonderpreis = false): Kategorie =>
  ({ id, name, beschreibung, art, sonderpreis, nominierte: [], sieger: null });

/** Der Grundstand: alle Kategorien, keine Nominierten, keine Daten. */
export const GRUNDSTAND: Awards = {
  version: 1,
  titel: 'CompHub Awards 2026',
  phasen: { nominierung: { start: null, ende: null }, abstimmung: { start: null, ende: null }, ergebnis: { datum: null } },
  kategorien: [
    kat('best-male-player', 'Best Male Player', 'The best male competitive Fortnite player of 2026.', 'community'),
    kat('best-female-player', 'Best Female Player', 'The best female competitive Fortnite player of 2026.', 'community'),
    kat('best-young-player', 'Best Young Player', 'The best young talent of the 2026 competitive season.', 'community'),
    kat('best-esport-organisation', 'Best Esport Organisation', 'The organisation that did the most for competitive Fortnite in 2026.', 'panel'),
    kat('best-content-creator', 'Best Content Creator', 'The creator who brought competitive Fortnite to the most people in 2026.', 'community'),
    kat('best-agent', 'Best Agent', 'The agent who represented competitive players best in 2026.', 'panel'),
    kat('best-play-of-the-year', 'Best Play of the Year', 'The single best play of the 2026 competitive season.', 'community'),
    kat('best-manager', 'Best Manager', 'Special prize: the best team or player manager of 2026.', 'panel', true),
    kat('upcoming-manager', 'Upcoming Manager', 'Special prize: the manager to watch.', 'panel', true),
    kat('best-coach', 'Best Coach', 'Special prize: the best coach of 2026.', 'panel', true),
    kat('upcoming-coach', 'Upcoming Coach', 'Special prize: the coach to watch.', 'panel', true),
  ],
};

/* ------------------------------------------------------------------ Pruefen */

const ARTEN: AbstimmungsArt[] = ['community', 'panel', 'beide'];
const N_ARTEN: NominiertenArt[] = ['spieler', 'person', 'clip'];

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
const oder = (v: unknown, max: number): string | null => text(v, max) || null;
const zeit = (v: unknown): string | null => {
  const s = text(v, 40);
  return s && Number.isFinite(Date.parse(s)) ? new Date(Date.parse(s)).toISOString() : null;
};
/** Nur eigene Pfade oder https-Adressen - kein javascript:, kein data:. */
const adresse = (v: unknown): string | null => {
  const s = text(v, 600);
  if (!s) return null;
  if (s.startsWith('/') && !s.startsWith('//')) return s;
  try { const u = new URL(s); return u.protocol === 'https:' ? u.toString() : null; } catch { return null; }
};
export const kennung = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

function nominierterAus(r: Record<string, unknown>, vergeben: Set<string>): Nominierter | null {
  const name = text(r.name, 80);
  if (!name) return null;
  const art = N_ARTEN.includes(r.art as NominiertenArt) ? r.art as NominiertenArt : 'person';
  const epic = text(r.epicId, 40).replace(/-/g, '').toLowerCase();
  let id = kennung(text(r.id, 60) || name) || 'n';
  while (vergeben.has(id)) id = `${id}-2`;
  vergeben.add(id);
  const land = text(r.land, 2).toUpperCase();
  return {
    id, art, name,
    epicId: /^[0-9a-f]{32}$/.test(epic) ? epic : null,
    team: oder(r.team, 60), teamLogo: adresse(r.teamLogo),
    land: /^[A-Z]{2}$/.test(land) ? land : null,
    bild: adresse(r.bild), statZeile: oder(r.statZeile, 120),
    x: text(r.x, 30).replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, '') || null,
    link: adresse(r.link),
  };
}

/** Was der Editor schickt, in eine saubere Form bringen - alles Unbekannte faellt weg. */
export function saeubern(roh: unknown): Awards {
  const r = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>;
  const ph = (r.phasen && typeof r.phasen === 'object' ? r.phasen : {}) as Record<string, Record<string, unknown> | undefined>;
  const ids = new Set<string>();
  const kategorien: Kategorie[] = [];
  for (const k of Array.isArray(r.kategorien) ? r.kategorien.slice(0, 40) : []) {
    if (!k || typeof k !== 'object') continue;
    const o = k as Record<string, unknown>;
    const name = text(o.name, 80);
    if (!name) continue;
    let id = kennung(text(o.id, 60) || name) || 'kategorie';
    while (ids.has(id)) id = `${id}-2`;
    ids.add(id);
    const vergeben = new Set<string>();
    const nominierte = (Array.isArray(o.nominierte) ? o.nominierte.slice(0, 40) : [])
      .map((n) => (n && typeof n === 'object' ? nominierterAus(n as Record<string, unknown>, vergeben) : null))
      .filter((n): n is Nominierter => !!n);
    const sieger = text(o.sieger, 60);
    kategorien.push({
      id, name, beschreibung: text(o.beschreibung, 400),
      art: ARTEN.includes(o.art as AbstimmungsArt) ? o.art as AbstimmungsArt : 'panel',
      sonderpreis: o.sonderpreis === true,
      nominierte,
      sieger: nominierte.some((n) => n.id === sieger) ? sieger : null,
    });
  }
  return {
    version: 1,
    titel: text(r.titel, 80) || GRUNDSTAND.titel,
    phasen: {
      nominierung: { start: zeit(ph.nominierung?.start), ende: zeit(ph.nominierung?.ende) },
      abstimmung: { start: zeit(ph.abstimmung?.start), ende: zeit(ph.abstimmung?.ende) },
      ergebnis: { datum: zeit(ph.ergebnis?.datum) },
    },
    kategorien,
  };
}

/* ------------------------------------------------------------- Lesen/Schreiben */

export async function liesAwards(): Promise<Awards> {
  const roh = await liesJson<unknown>(AWARDS_DATEI, null);
  if (!roh) return structuredClone(GRUNDSTAND);
  return { ...saeubern(roh), geaendert: (roh as { geaendert?: number }).geaendert };
}

export async function schreibAwards(neu: unknown): Promise<Awards> {
  const sauber = { ...saeubern(neu), geaendert: Date.now() };
  await aendereJson<unknown>(AWARDS_DATEI, null, () => sauber);
  return sauber;
}

/* ------------------------------------------------------------------- Phasen */

const ms = (s: string | null | undefined) => (s ? Date.parse(s) : NaN);

/** Wo die Awards gerade stehen. Ohne Daten: "vorher". */
export function phaseVon(a: Awards, jetzt = Date.now()): Phase {
  const { nominierung: n, abstimmung: v, ergebnis: e } = a.phasen;
  if (ms(e.datum) <= jetzt) return 'ergebnis';
  if (ms(v.ende) <= jetzt) return 'auswertung';
  if (ms(v.start) <= jetzt) return 'abstimmung';
  if (ms(n.ende) <= jetzt) return 'zwischen';
  if (ms(n.start) <= jetzt) return 'nominierung';
  return 'vorher';
}

/** Der naechste Zeitpunkt, auf den der Countdown zaehlt - mit Beschriftung. */
export function naechsterSchritt(a: Awards, jetzt = Date.now()): { ziel: string; was: string } | null {
  const reihe: Array<[string | null, string]> = [
    [a.phasen.nominierung.start, 'Nominations open'],
    [a.phasen.nominierung.ende, 'Nominations close'],
    [a.phasen.abstimmung.start, 'Voting opens'],
    [a.phasen.abstimmung.ende, 'Voting closes'],
    [a.phasen.ergebnis.datum, 'Winners revealed'],
  ];
  for (const [z, was] of reihe) if (z && ms(z) > jetzt) return { ziel: z, was };
  return null;
}

export const stimmtAb = (k: Kategorie) => k.art === 'community' || k.art === 'beide';

/* ------------------------------------------------------------------- Stimmen */

/** kategorie -> epicId -> nominierten-Id */
export type Stimmen = Record<string, Record<string, string>>;

export const liesStimmen = () => liesJson<Stimmen>(STIMMEN_DATEI, {});

/*
 * Schreiben gebuendelt: jede Stimme wartet, bis sie wirklich im Archiv steht ("gespeichert" heisst gespeichert), aber alle Stimmen, die waehrend eines
 * laufenden Commits eintreffen, gehen zusammen in den naechsten. Bei Andrang wird es so ein Commit je ein bis zwei Sekunden statt einer je Stimme.
 */
interface Offen { kategorie: string; epicId: string; nominierter: string; fertig: (r: 'ok' | 'schon') => void; fehler: (e: unknown) => void }
let warteschlange: Offen[] = [];
let laeuft = false;

async function abarbeiten() {
  if (laeuft) return;
  laeuft = true;
  try {
    while (warteschlange.length) {
      const stapel = warteschlange;
      warteschlange = [];
      const antwort = new Map<Offen, 'ok' | 'schon'>();
      try {
        await aendereJson<Stimmen>(STIMMEN_DATEI, {}, (s) => {
          antwort.clear();
          for (const o of stapel) {
            const k = (s[o.kategorie] ??= {});
            if (k[o.epicId]) { antwort.set(o, 'schon'); continue; }
            k[o.epicId] = o.nominierter;
            antwort.set(o, 'ok');
          }
          return [...antwort.values()].includes('ok') ? s : undefined;
        }, 0);
        for (const o of stapel) o.fertig(antwort.get(o) ?? 'schon');
      } catch (e) {
        for (const o of stapel) o.fehler(e);
      }
    }
  } finally { laeuft = false; }
}

/** Eine Stimme eintragen. "schon": dieses Epic-Konto hat in dieser Kategorie bereits abgestimmt (eine Stimme, endgueltig). */
export function stimmeEintragen(kategorie: string, epicId: string, nominierter: string): Promise<'ok' | 'schon'> {
  return new Promise((fertig, fehler) => {
    warteschlange.push({ kategorie, epicId, nominierter, fertig, fehler });
    void abarbeiten();
  });
}

/** Stimmen je Nominiertem - nur fuer den Admin oder in der Ergebnis-Phase. */
export function auszaehlen(s: Stimmen): Record<string, Record<string, number>> {
  const aus: Record<string, Record<string, number>> = {};
  for (const [k, wer] of Object.entries(s)) {
    const z: Record<string, number> = (aus[k] = {});
    for (const n of Object.values(wer)) z[n] = (z[n] ?? 0) + 1;
  }
  return aus;
}

/* ------------------------------------------------------- Bremse fuer Stimmen */

/*
 * Im Speicher des Servers gezaehlt (wie lib/fehlversuche): je Anschluss und je Epic-Konto hoechstens so viele Stimm-Anfragen je Viertelstunde.
 * Antwort dann 400, nie 429 (der Lastverteiler wertet 429 als Ausfall).
 */
const FENSTER_MS = 15 * 60_000;
const GRENZEN = { anschluss: 40, konto: 20 };
const zaehler = new Map<string, { n: number; bis: number }>();

export function gebremst(anschluss: string, epicId: string): boolean {
  const jetzt = Date.now();
  if (zaehler.size > 20_000) for (const [k, v] of zaehler) if (v.bis < jetzt) zaehler.delete(k);
  let zu = false;
  for (const [schluessel, grenze] of [[`a|${anschluss}`, GRENZEN.anschluss], [`k|${epicId}`, GRENZEN.konto]] as const) {
    const e = zaehler.get(schluessel);
    const n = e && e.bis > jetzt ? e.n + 1 : 1;
    zaehler.set(schluessel, { n, bis: e && e.bis > jetzt ? e.bis : jetzt + FENSTER_MS });
    if (n > grenze) zu = true;
  }
  return zu;
}
