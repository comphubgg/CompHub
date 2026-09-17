import type { Speicher } from '@/lib/ablage';

/*
 * Die zweite Ablage: GitHub Releases.
 *
 * Alles, was der Laufrechner erzeugt (fertige Antworten, Akten, Spieltage,
 * Werte der Szene, Tabellen), liegt zusaetzlich als Datei an einem Release
 * des Projekts - kostenlos, ohne Karte, ueber GitHubs CDN von ueberall
 * lesbar. Die Seite liest diese Dinge zuerst von dort und erst dann aus
 * Supabase.
 *
 * Der Grund: am 16. September 2026 war die Datenbank bei Supabase dreimal
 * am Tag nicht erreichbar, und mit ihr stand die ganze Seite - obwohl sich
 * keine dieser Zahlen oefter als stuendlich aendert. Der Betreiber: "Sie
 * darf nicht einfach auf einmal offline sein." Eine Stoerung dort trifft
 * jetzt nur noch, was die Seite selbst schreibt (Konten, Profile, Overlays),
 * nicht mehr die Statistik.
 *
 * Geloescht wird bei Supabase nichts; es ist die Zweitkopie und der
 * Rueckfall, wenn eine Datei am Release fehlt.
 *
 * Namen: ein Release-Anhang darf keine Schraegstriche und keine
 * Gleichheitszeichen tragen, GitHub wuerde sie stillschweigend durch Punkte
 * ersetzen. Darum "/" -> "__" und "=" -> "-eq-", in beide Richtungen
 * eindeutig (siehe anhangName / ablageName).
 *
 * Akten: achttausend kleine Dateien waeren achttausend Anhaenge. Sie liegen
 * deshalb in 256 Buendeln nach den ersten zwei Zeichen der Konto-Id
 * ("akten__3f.json" = { "<id>": Akte, ... }); ein Profil liest ein Buendel
 * von etwa einem halben Megabyte.
 */

/** Wo die Anhaenge liegen. Ueberschreibbar, falls das Projekt umzieht. */
const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';

/*
 * Ein Release traegt nur gut tausend Anhaenge (GitHub lehnt darueber mit
 * "Validation Failed" ab). Deshalb je Ordner ein eigenes Release; der Tag
 * ergibt sich aus dem Namen der Datei. Gleiche Regel in scripts/ablage-github.mjs.
 */
export function tagFuer(name: string): string {
  if (/^akten\//.test(name)) return 'daten-akten';
  if (/^(epic-spieltage|szene-quelle|power-rankings)\//.test(name)) return 'daten-spieltage';
  if (/^platzierungen\//.test(name)) return 'daten-platzierungen';
  if (/^szene-stats\//.test(name)) return 'daten-szene';
  if (/^tournament-leaderboards\//.test(name)) return 'daten-leaderboards';
  return 'daten';
}
const basis = (tag: string) => `https://github.com/${REPO}/releases/download/${tag}/`;

/** Wie lange eine Anfrage hoechstens dauern darf. */
const LESEN_MS = 8_000;

/**
 * Was am Release liegt - alles, was der Laufrechner schreibt. Alles andere
 * (Konten, Profile, Overlays, Fotos, Sperren) gehoert Supabase allein.
 */
const AM_RELEASE: Array<RegExp> = [
  // Nicht die Turnierliste (catalog_): die schreibt die Seite selbst alle
  // zehn Minuten frisch von Epic, ein stuendlicher Stand waere ein Rueckschritt.
  // Und nicht die Antwort je Spieler (szene_spieler=...): die rechnet die
  // Seite in Sekunden aus der Akte, und ein Stand von gestern am Release
  // wuerde zuerst ausgeliefert - mit den Zahlen von gestern.
  /^antworten\/(?!catalog_|szene_spieler=|szene_ansicht=profil)/,
  /^akten\//,
  /^epic-spieltage\//,
  /^platzierungen\//,
  /^szene-stats\//,
  /^szene-quelle\//,
  /^tournament-leaderboards\//,
  /^power-rankings\//,
  /^(verdienst-archiv|preisgeld-tabellen|preisgelder|lan-preisgelder|epic-namen|cup-archiv)\.json$/,
  // Vom Betreiber gepflegt, von der Seite viel gelesen: als Rueckfall, wenn
  // Supabase nicht antwortet. Gelesen wird zuerst die lebende Kopie dort.
  /^(prognosen|turnier-karten|karten-vorlagen|spieler-profile|spielerbilder|spieler-namen|orgtags|galerie)\.json$/,
];

export function amRelease(name: string): boolean {
  return AM_RELEASE.some((m) => m.test(name));
}

/*
 * Was zuerst vom Release kommt: einzelne Dateien, die eine Seite fuer sich
 * liest - fertige Antworten, Akten, die grossen Einzeldateien. Ganze Ordner
 * (Spieltage, Werte der Szene) liest die Seite weiter zuerst aus Supabase,
 * weil die Tabelle dort einen Ordner in einer Anfrage liefert; das Release
 * kann nur Datei fuer Datei und ist dort der Rueckfall.
 */
const ZUERST: Array<RegExp> = [
  /^antworten\/(?!catalog_|szene_spieler=|szene_ansicht=profil)/,
  /^akten\//,
  /^(verdienst-archiv|preisgeld-tabellen|preisgelder|lan-preisgelder|epic-namen|cup-archiv)\.json$/,
];

export function releaseZuerst(name: string): boolean {
  return ZUERST.some((m) => m.test(name));
}

/** Aus dem Ablage-Namen der Name des Anhangs. */
export function anhangName(name: string): string {
  return name.replace(/\//g, '__').replace(/=/g, '-eq-');
}

/** Und zurueck. */
export function ablageName(anhang: string): string {
  return anhang.replace(/-eq-/g, '=').replace(/__/g, '/');
}

/** Akten liegen gebuendelt: die Datei zur Id und die Id in der Datei. */
export function aktenBuendel(name: string): { buendel: string; id: string } | null {
  const m = name.match(/^akten\/([0-9a-f]{32})\.json$/i);
  if (!m) return null;
  return { buendel: `akten__${m[1].slice(0, 2).toLowerCase()}.json`, id: m[1].toLowerCase() };
}

/* ------------------------------------------------------------ Lesen */

/** Kurzer Vorrat je Vorgang: dieselbe Datei nicht zweimal in einer Minute holen. */
const vorrat = new Map<string, { bis: number; wert: Buffer | null }>();
const VORRAT_MS = 60_000;

async function holeAnhang(anhang: string, tag: string): Promise<Buffer | null> {
  const jetzt = Date.now();
  const da = vorrat.get(anhang);
  if (da && da.bis > jetzt) return da.wert;
  const r = await fetch(basis(tag) + encodeURIComponent(anhang), {
    redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(LESEN_MS),
  });
  let wert: Buffer | null;
  if (r.status === 404) wert = null;
  else if (!r.ok) throw new Error(`GitHub-Ablage ${r.status} bei ${anhang}`);
  else wert = Buffer.from(await r.arrayBuffer());
  // Nur Gefundenes merken - was fehlt, kann im naechsten Lauf da sein.
  if (wert) vorrat.set(anhang, { bis: jetzt + VORRAT_MS, wert });
  return wert;
}

async function lies(name: string): Promise<Buffer | null> {
  const akte = aktenBuendel(name);
  if (akte) {
    const roh = await holeAnhang(akte.buendel, tagFuer(name));
    if (!roh) return null;
    const buendel = JSON.parse(roh.toString('utf8')) as Record<string, unknown>;
    const a = buendel[akte.id];
    return a === undefined ? null : Buffer.from(JSON.stringify(a, null, 1), 'utf8');
  }
  return holeAnhang(anhangName(name), tagFuer(name));
}

/**
 * Der Leser fuer die Seite. Schreiben, Loeschen und Auflisten gibt es hier
 * nicht - das tut der Laufrechner ueber scripts/ablage-github.mjs.
 */
export const githubLeser: Pick<Speicher, 'lies'> = { lies };
