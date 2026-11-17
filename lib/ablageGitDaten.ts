/*
 * Derselbe Speicher, nur in einem privaten GitHub-Archiv.
 *
 * Der Betreiber (11.10.2026): "Langsam reicht es mir mit diesen Updates ... ich will
 * kein Supabase mehr, ich will etwas, das ich einmal mache und nie wieder." Zweimal
 * (22.9. und 3.10.) hat Supabase das Projekt gesperrt, weil das kostenlose
 * Datenvolumen aufgebraucht war, und jedes Mal war die ganze Seite weg. GitHub hat
 * fuer das, was wir hier tun, kein Datenvolumen-Limit, braucht keine Karte und kein
 * neues Konto: der Code und alle automatischen Ablaeufe liegen dort ohnehin.
 *
 * Was hier liegt, ist genau das, was Nutzer und Betreiber auf der Seite schreiben
 * (Konten, Tierlists, Overlays, Karten, Prognosen, Profile, Fotos). Alles, was ein
 * Lauf ausrechnet, bleibt am Release - siehe lib/ablageGithub.ts.
 *
 * Aufbau: ein privates Archiv (Voreinstellung comphubgg/comphub-daten), jede Datei
 * unter ihrem Namen, also "konten.json" oder "galerie/abc.jpg". Gesprochen wird die
 * Contents-Schnittstelle von GitHub:
 *
 *   lesen      GET  /contents/<name>   (roh, mit ETag; "nicht geaendert" kostet kein Kontingent)
 *   schreiben  PUT  /contents/<name>   (mit dem Stand der Datei, damit nichts ueberschrieben wird)
 *   loeschen   DELETE
 *   auflisten  GET  /contents/<ordner>
 *
 * Die Eigenheiten dieses Speichers - und warum es sie gibt:
 *
 *   - Gelesen wird zuerst aus dem Arbeitsspeicher. Eine Datei gilt eine Minute als
 *     frisch; danach fragt der Speicher mit dem ETag nach, ob sie sich geaendert hat.
 *     Eine Datei, die ein Ablauf (Org-Kader) im Archiv geaendert hat, ist so nach
 *     spaetestens einer Minute auch auf der Seite.
 *   - Geschrieben wird sofort und der Aufrufer wartet darauf: "Gespeichert" heisst
 *     wirklich gespeichert, und ein Fehler kommt als Fehler an. Nur Zaehler, die bei
 *     jedem Seitenaufruf schreiben (besuche, anwesenheit), werden gesammelt und alle
 *     zwei Minuten einmal geschrieben - sonst waere jeder Besucher ein Commit.
 *   - Wird dieselbe Datei in kurzer Zeit oefter geschrieben, zaehlt der letzte Stand:
 *     eine Schreibschleife irgendwo im Werkzeug fuehrt so nicht zu tausend Commits,
 *     und GitHubs Schutz gegen zu viele Schreibvorgaenge schlaegt nicht an.
 *   - Schreibvorgaenge laufen nacheinander, nie parallel (GitHub verlangt das fuer
 *     Commits auf demselben Zweig).
 *   - Antwortet GitHub nicht, liefert der Speicher den letzten bekannten Stand,
 *     statt zu scheitern. Das Schreiben bleibt in diesem Fall ein Fehler.
 *   - Unveraenderte Inhalte werden nicht geschrieben: keine leeren Commits.
 *
 * Eingeschaltet wird er mit DATEN_TOKEN in der Umgebung (ein GitHub-Schluessel mit
 * Zugriff auf das Archiv). DATEN_REPO nennt ein anderes Archiv, DATEN_PRAEFIX legt
 * alles in einen Unterordner (zum Ausprobieren, ohne den echten Stand anzufassen).
 */

import crypto from 'crypto';
import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import type { Sammel, Speicher } from '@/lib/ablage';

// Ueberschreibbar nur zum Pruefen gegen einen nachgebauten Dienst (DATEN_API / DATEN_RAW) - im Betrieb nie gesetzt.
const API = (process.env.DATEN_API || 'https://api.github.com').replace(/\/+$/, '');
const ZWEIG = 'main';
const FRISCH_MS = 60_000;
// Fehlende Dateien und Ordnerlisten zaehlen bei GitHub voll gegen das Stundenkontingent (nur "nicht geaendert" ist frei) - sie werden deshalb seltener erfragt
// (20.10.2026: das Kontingent war aufgebraucht, die Seite lieferte Fehler statt Katalog).
const NICHT_DA_MS = 180_000;
const VERZEICHNIS_MS = 120_000;
/** Groesste Datei, die auf die Platte gesichert wird (Fotos u. a. bleiben ausserhalb). */
const PLATTE_MAX = 1_500_000;
const LESEN_MS = 15_000;
const SCHREIBEN_MS = 45_000;
const ABSTAND_MS = 500;
const SCHNELL_MS = 10_000;
const GESAMMELT_MS = 120_000;

/** Was alle zwei Minuten statt sofort geschrieben wird: Zaehler, die bei jedem Aufruf anfallen. */
const GESAMMELT = /^(besuche\.json|anwesenheit\.json|anwesenheit\/.*)$/;

/*
 * Was nur im Arbeitsspeicher liegt, nie im Archiv: Zwischenspeicher, die die Seite alle paar
 * Minuten selbst neu schreibt (der Cup-Katalog, antworten/catalog_...). Jeder Stand waere ein
 * Commit - fast dreihundert am Tag - fuer etwas, das sich aus Epic jederzeit neu holen laesst.
 */
const NUR_SPEICHER = /^antworten\//;

const repo = () => (process.env.DATEN_REPO || 'comphubgg/comphub-daten').trim();
const praefix = () => (process.env.DATEN_PRAEFIX || '').trim().replace(/^\/+|\/+$/g, '');
/*
 * Der Schluessel fuers Archiv: DATEN_TOKEN - oder, wenn die Seite auf dem eigenen Rechner laeuft (COMPHUB_ABLAGE=github), der
 * GITHUB_TOKEN, der dort ohnehin in .env.local steht. So muss auf dem Rechner kein zweiter Schluessel abgelegt werden.
 */
const token = () => (process.env.DATEN_TOKEN
  || (['github', 'supabase'].includes((process.env.COMPHUB_ABLAGE || '').toLowerCase()) ? process.env.GITHUB_TOKEN : '')
  || '').trim();

/** Ist dieser Speicher eingeschaltet? Ja, sobald ein Schluessel fuer das Archiv in der Umgebung steht. */
export function gitDatenAktiv(): boolean {
  return token() !== '';
}

interface Eintrag {
  daten: Buffer | null;
  /** Der Git-Blob-Stand der Datei - damit wissen wir, was wir beim Schreiben ersetzen. */
  sha: string | null;
  etag: string | null;
  geprueft: number;
  geaendert: number | null;
  /** Zum Sammeln vorgemerkt, noch nicht im Archiv. */
  ausstehend?: boolean;
  /** Wann DIESER Server die Datei zuletzt geschrieben hat - solange das nicht lange her ist, liest er sie nicht ueber das CDN (siehe leseNeu). */
  geschrieben?: number;
}

/**
 * Bis wann GitHub die API-Anfragen dieses Schluessels gedrosselt hat (ms). Solange das gilt, geht keine weitere Anfrage hinaus: sie wuerde nur abgelehnt (und frueher
 * wiederholten die Schreibversuche das jede halbe Minute, 28 Mal in 18 Minuten). Gelesen wird in der Zeit ueber das CDN (raw.githubusercontent.com), das nicht zaehlt.
 */
let gedrosseltBis = 0;
const cache = new Map<string, Eintrag>();
const verzeichnisse = new Map<string, { namen: string[]; bis: number; etag?: string | null }>();
/** Wie viele Anfragen seit dem Start mit welchem Ergebnis hinausgingen ("GET 200", "GET 304", "GET 404", "PUT 200" ...) - zeigt, wer das Stundenkontingent verbraucht. */
const anfragen: Record<string, number> = {};
const zaehlerSeit = Date.now();
const unterwegs = new Map<string, Promise<Buffer | null>>();
const zuletztGeschrieben = new Map<string, number>();
const sammelUhren = new Map<string, ReturnType<typeof setTimeout>>();
const schnellUhren = new Map<string, ReturnType<typeof setTimeout>>();
const wartend = new Map<string, Buffer>();
let letzterFehler: { zeit: number; text: string } | null = null;

function sauber(name: string): string {
  const n = String(name).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!n || n.split('/').some((t) => t === '..' || t === '.')) throw new Error(`Ungueltiger Name in der Ablage: ${name}`);
  return n;
}

function pfad(name: string): string {
  const n = name === '' ? '' : sauber(name);
  const voll = [praefix(), n].filter(Boolean).join('/');
  return voll.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

const blobSha = (b: Buffer) => crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');

async function anfrage(weg: string, init: RequestInit & { frist?: number } = {}): Promise<Response> {
  const t = token();
  if (!t) throw new Error('Ablage nicht eingerichtet: DATEN_TOKEN fehlt in der Umgebung.');
  if (Date.now() < gedrosseltBis) throw new Error(`Ablage (GitHub) gedrosselt bis ${new Date(gedrosseltBis).toISOString().slice(11, 16)} UTC`);
  const { frist = LESEN_MS, headers, ...rest } = init;
  const r = await fetch(`${API}${weg}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${t}`, 'User-Agent': 'comphub-ablage', 'X-GitHub-Api-Version': '2022-11-28',
      Accept: 'application/vnd.github+json', ...(headers as Record<string, string> | undefined),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(frist),
  });
  const art = `${(rest.method ?? 'GET').toUpperCase()} ${r.status}${weg.includes('/commits?') ? ' commits' : ''}`;
  anfragen[art] = (anfragen[art] ?? 0) + 1;
  if (r.status === 403 || r.status === 429) {
    // Zu viele Anfragen: GitHub nennt, wann es wieder geht.
    const wieder = Number(r.headers.get('x-ratelimit-reset') ?? 0) * 1000;
    if (r.headers.get('x-ratelimit-remaining') === '0' || r.status === 429) {
      // Genau bis zum genannten Zeitpunkt nichts mehr schicken (hoechstens eine Stunde, mindestens eine Minute).
      const bis = wieder > Date.now() ? wieder : Date.now() + 5 * 60_000;
      gedrosseltBis = Math.min(Math.max(bis, Date.now() + 60_000), Date.now() + 3_600_000);
      throw new Error(`Ablage (GitHub) gedrosselt${wieder ? ` bis ${new Date(wieder).toISOString().slice(11, 16)} UTC` : ''}`);
    }
  }
  return r;
}

/*
 * Die letzte bekannte Fassung jeder kleinen Datei liegt auch auf der Platte dieses Rechners. Antwortet GitHub nicht (Stundenkontingent aufgebraucht, Netz weg) und der
 * Arbeitsspeicher ist leer - etwa nach einem Neustart beim Veroeffentlichen -, dient diese Fassung statt eines Fehlers (Betreiber, 20.10.2026: die Prognose zeigte
 * "kein grosses Finale", der Knopf "TikTok bauen" scheiterte, weil der Katalog nicht kam). Auf Plattformen ohne beschreibbare Platte (Netlify) schlaegt das Sichern
 * still fehl und bleibt ohne Wirkung.
 */
const platteOrdner = () => path.join(process.env.ABLAGE_ZWISCHEN || path.join(os.tmpdir(), 'comphub-ablage-zwischen'), repo().replace(/\W+/g, '_'), praefix().replace(/\W+/g, '_') || '_');
const platteDatei = (n: string) => path.join(platteOrdner(), ...sauber(n).split('/'));
function platteSichern(n: string, buf: Buffer): void {
  if (buf.length > PLATTE_MAX) return;
  void (async () => {
    try { const p = platteDatei(n); await fsp.mkdir(path.dirname(p), { recursive: true }); await fsp.writeFile(p, buf); } catch { /* ohne Platte geht es auch */ }
  })();
}
async function platteLesen(n: string): Promise<Buffer | null> {
  try { return await fsp.readFile(platteDatei(n)); } catch { return null; }
}

/*
 * Ausstehende Schreibvorgaenge: lehnt GitHub ein Schreiben wegen des Stundenkontingents ab, bekommt der Nutzer trotzdem sein "Gespeichert" - der Stand liegt im Speicher und
 * auf der Platte (_ausstehend) und geht hinaus, sobald das Kontingent wieder frei ist; ein Neustart des Servers dazwischen verliert ihn nicht. (Betreiber, 20.10.2026: das
 * Kontingent darf die Seite nie wieder lahmlegen.)
 */
const ausstehendDatei = (n: string) => path.join(platteOrdner(), '_ausstehend', ...sauber(n).split('/'));
function ausstehendSichern(n: string, buf: Buffer): void {
  void (async () => {
    try { const p = ausstehendDatei(n); await fsp.mkdir(path.dirname(p), { recursive: true }); await fsp.writeFile(p, buf); } catch { /* im Speicher bleibt es trotzdem */ }
  })();
}
function ausstehendLoeschen(n: string): void {
  void fsp.unlink(ausstehendDatei(n)).catch(() => undefined);
}
let wiederhergestellt: Promise<void> | null = null;
/** Beim ersten Gebrauch nach dem Start: was beim letzten Mal nicht mehr hinausging, wieder auf den Weg bringen. */
function ausstehendWiederherstellen(): Promise<void> {
  if (wiederhergestellt) return wiederhergestellt;
  wiederhergestellt = (async () => {
    const wurzel = path.join(platteOrdner(), '_ausstehend');
    const gehe = async (ordner: string, vorne: string): Promise<void> => {
      let eintraege: import('fs').Dirent[];
      try { eintraege = await fsp.readdir(ordner, { withFileTypes: true }); } catch { return; }
      for (const e of eintraege) {
        const rel = vorne ? `${vorne}/${e.name}` : e.name;
        if (e.isDirectory()) { await gehe(path.join(ordner, e.name), rel); continue; }
        try { spaeter(sauber(rel), await fsp.readFile(path.join(ordner, e.name)), 20_000); } catch { /* diese Datei ueberspringen */ }
      }
    };
    await gehe(wurzel, '');
  })().catch(() => undefined);
  return wiederhergestellt;
}

function merkeFehler(e: unknown) {
  letzterFehler = { zeit: Date.now(), text: String((e as Error)?.message ?? e).slice(0, 200) };
}

/* ------------------------------------------------------------- Lesen */

/*
 * Gelesen wird ueber raw.githubusercontent.com, nicht ueber die API: dort zaehlt keine Anfrage gegen das Stundenkontingent des Schluessels - der Betreiber (20.10.2026):
 * "Ablage (GitHub) gedrosselt bis 16:33 UTC ... das darf nie wieder passieren". Das Kontingent verbrauchten die Replay-Schleifen auf GitHub (Hochladen, Loeschen,
 * Umbenennen je Datei) - derselbe Schluessel wie hinter der Seite. Nachteil des CDN: bis zu fuenf Minuten alt. Deshalb nicht fuer Dateien, die dieser Server in den
 * letzten sechs Minuten selbst geschrieben hat (sonst kaeme eine alte Fassung zurueck) - und bei jedem Fehler geht es ueber die API wie bisher.
 */
const RAW = (process.env.DATEN_RAW || 'https://raw.githubusercontent.com').replace(/\/+$/, '');
const RAW_SPERRE_MS = 6 * 60_000;

async function leseUeberCdn(name: string, alt: Eintrag | undefined): Promise<{ status: number; buf?: Buffer; etag?: string | null } | null> {
  const t = token();
  if (!t) return null;
  const kopf: Record<string, string> = { Authorization: `token ${t}`, 'User-Agent': 'comphub-ablage' };
  if (alt?.etag?.startsWith('cdn:')) kopf['If-None-Match'] = alt.etag.slice(4);
  try {
    const r = await fetch(`${RAW}/${repo()}/${ZWEIG}/${pfad(name)}`, { headers: kopf, cache: 'no-store', signal: AbortSignal.timeout(LESEN_MS) });
    if (r.status === 200) return { status: 200, buf: Buffer.from(await r.arrayBuffer()), etag: r.headers.get('etag') };
    if (r.status === 304 || r.status === 404) return { status: r.status };
    return null; // alles andere: die API versuchen
  } catch { return null; }
}

async function leseNeu(name: string, alt: Eintrag | undefined): Promise<Buffer | null> {
  const jetzt = Date.now();
  // Erst das CDN - ausser fuer eben selbst Geschriebenes.
  if (!(alt && (alt.ausstehend || (alt.geschrieben && jetzt - alt.geschrieben < RAW_SPERRE_MS)))) {
    const c = await leseUeberCdn(name, alt);
    if (c?.status === 304 && alt) { alt.geprueft = jetzt; return alt.daten; }
    if (c?.status === 404) { cache.set(name, { daten: null, sha: null, etag: null, geprueft: jetzt, geaendert: null }); return null; }
    if (c?.status === 200 && c.buf) {
      const buf = c.buf;
      cache.set(name, { daten: buf, sha: blobSha(buf), etag: c.etag ? `cdn:${c.etag}` : null, geprueft: jetzt, geaendert: alt?.geaendert ?? null });
      platteSichern(name, buf);
      return buf;
    }
  }
  const kopf: Record<string, string> = { Accept: 'application/vnd.github.raw+json' };
  // Der ETag der CDN-Antwort passt nicht zur API: fuer die API nur den, den sie selbst geliefert hat.
  if (alt?.etag && !alt.etag.startsWith('cdn:')) kopf['If-None-Match'] = alt.etag;
  let r: Response;
  try {
    r = await anfrage(`/repos/${repo()}/contents/${pfad(name)}?ref=${ZWEIG}`, { headers: kopf });
  } catch (e) {
    merkeFehler(e);
    if (alt) return alt.daten; // lieber der letzte Stand als ein Fehler
    const platte = await platteLesen(name);
    if (platte) { cache.set(name, { daten: platte, sha: blobSha(platte), etag: null, geprueft: jetzt - FRISCH_MS + 20_000, geaendert: null }); return platte; }
    throw e;
  }
  if (r.status === 304 && alt) { alt.geprueft = jetzt; return alt.daten; }
  if (r.status === 404) {
    cache.set(name, { daten: null, sha: null, etag: null, geprueft: jetzt, geaendert: null });
    return null;
  }
  if (!r.ok) {
    const e = new Error(`Ablage (GitHub) antwortet ${r.status} bei ${name}`);
    merkeFehler(e);
    if (alt) return alt.daten;
    const platte = await platteLesen(name);
    if (platte) { cache.set(name, { daten: platte, sha: blobSha(platte), etag: null, geprueft: jetzt - FRISCH_MS + 20_000, geaendert: null }); return platte; }
    throw e;
  }
  const buf = Buffer.from(await r.arrayBuffer());
  cache.set(name, { daten: buf, sha: blobSha(buf), etag: r.headers.get('etag'), geprueft: jetzt, geaendert: alt?.geaendert ?? null });
  platteSichern(name, buf);
  return buf;
}

async function lies(name: string): Promise<Buffer | null> {
  const n = sauber(name);
  void ausstehendWiederherstellen();
  const e = cache.get(n);
  if (NUR_SPEICHER.test(n)) return e?.daten ?? null;
  const jetzt = Date.now();
  if (e && (e.ausstehend || jetzt - e.geprueft < (e.daten ? FRISCH_MS : NICHT_DA_MS))) return e.daten;
  const laeuft = unterwegs.get(n);
  if (laeuft) return laeuft;
  const p = leseNeu(n, e).finally(() => unterwegs.delete(n));
  unterwegs.set(n, p);
  return p;
}

/* ----------------------------------------------------------- Schreiben */

/** Alle Schreibvorgaenge nacheinander, mit etwas Abstand. */
let reihe: Promise<unknown> = Promise.resolve();
function nacheinander<T>(arbeit: () => Promise<T>): Promise<T> {
  const lauf = reihe.then(arbeit, arbeit);
  reihe = lauf.then(() => new Promise((f) => setTimeout(f, ABSTAND_MS)), () => new Promise((f) => setTimeout(f, ABSTAND_MS)));
  return lauf;
}

async function holeSha(n: string): Promise<string | null> {
  const r = await anfrage(`/repos/${repo()}/contents/${pfad(n)}?ref=${ZWEIG}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Ablage (GitHub) antwortet ${r.status} bei ${n}`);
  const j = await r.json() as { sha?: string } | Array<unknown>;
  return Array.isArray(j) ? null : (j.sha ?? null);
}

function verzeichnisVergessen(n: string) {
  const teile = n.split('/');
  for (let i = 0; i < teile.length; i += 1) verzeichnisse.delete(teile.slice(0, i).join('/'));
}

async function schreibeJetzt(n: string, daten: Buffer): Promise<void> {
  const e = cache.get(n);
  const neuSha = blobSha(daten);
  // Dasselbe steht schon im Archiv: nichts zu tun.
  if (e && !e.ausstehend && e.sha === neuSha && e.daten) { e.geprueft = Date.now(); return; }
  let sha: string | null | undefined = e && !e.ausstehend ? e.sha : undefined;
  let letzter: Error | null = null;
  for (let versuch = 0; versuch < 4; versuch += 1) {
    if (sha === undefined || versuch > 0) sha = await holeSha(n);
    if (sha === neuSha) {
      cache.set(n, { daten, sha, etag: null, geprueft: Date.now(), geaendert: e?.geaendert ?? Date.now(), geschrieben: Date.now() });
      return;
    }
    const r = await anfrage(`/repos/${repo()}/contents/${pfad(n)}`, {
      method: 'PUT', frist: SCHREIBEN_MS,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `${sha ? 'Aktualisiert' : 'Neu'}: ${n}`.slice(0, 200),
        content: daten.toString('base64'), branch: ZWEIG, ...(sha ? { sha } : {}),
      }),
    });
    if (r.ok) {
      const j = await r.json() as { content?: { sha?: string }; commit?: { committer?: { date?: string } } };
      const wann = Date.parse(j.commit?.committer?.date ?? '') || Date.now();
      cache.set(n, { daten, sha: j.content?.sha ?? neuSha, etag: null, geprueft: Date.now(), geaendert: wann, geschrieben: Date.now() });
      verzeichnisVergessen(n);
      zuletztGeschrieben.set(n, Date.now());
      return;
    }
    // 409/422: der Stand hat sich inzwischen geaendert (ein Ablauf hat geschrieben) - neu holen und noch einmal.
    letzter = new Error(`Ablage (GitHub) antwortet ${r.status} beim Schreiben von ${n}`);
    if (r.status !== 409 && r.status !== 422) break;
    sha = undefined;
  }
  merkeFehler(letzter);
  throw letzter ?? new Error(`Ablage: Schreiben von ${n} gescheitert`);
}

/** Geschrieben wird erst in einigen Sekunden: der letzte Stand dieser Datei gewinnt. */
function spaeter(n: string, daten: Buffer, nachMs: number) {
  wartend.set(n, daten);
  const e = cache.get(n) ?? { daten: null, sha: null, etag: null, geprueft: 0, geaendert: null };
  cache.set(n, { ...e, daten, geprueft: Date.now(), geaendert: Date.now(), ausstehend: true });
  const uhren = nachMs >= GESAMMELT_MS ? sammelUhren : schnellUhren;
  if (uhren.has(n)) return;
  uhren.set(n, setTimeout(() => {
    uhren.delete(n);
    const d = wartend.get(n);
    wartend.delete(n);
    if (!d) return;
    const alt = cache.get(n);
    if (alt) cache.set(n, { ...alt, ausstehend: false, sha: alt.sha });
    void nacheinander(() => schreibeJetzt(n, d)).then(() => ausstehendLoeschen(n)).catch((err) => {
      merkeFehler(err);
      // Nicht verlieren: der Stand bleibt im Speicher, und in einer halben Minute geht es noch einmal.
      spaeter(n, d, 30_000);
    });
  }, nachMs));
}

async function schreib(name: string, daten: Buffer): Promise<void> {
  const n = sauber(name);
  if (NUR_SPEICHER.test(n)) {
    cache.set(n, { daten, sha: null, etag: null, geprueft: Date.now(), geaendert: Date.now() });
    return;
  }
  if (GESAMMELT.test(n)) { spaeter(n, daten, GESAMMELT_MS); return; }
  // Wurde sie eben erst geschrieben, wird gesammelt: eine Schreibschleife darf nicht tausend Commits machen.
  if (Date.now() - (zuletztGeschrieben.get(n) ?? 0) < SCHNELL_MS && cache.get(n)?.daten) {
    spaeter(n, daten, SCHNELL_MS);
    return;
  }
  // Gerade ein aelterer Stand vorgemerkt? Der neue ersetzt ihn.
  wartend.delete(n);
  void ausstehendWiederherstellen();
  try {
    await nacheinander(() => schreibeJetzt(n, daten));
    ausstehendLoeschen(n);
  } catch (e) {
    // Gedrosselt: nicht als Fehler melden, sondern vormerken (Speicher + Platte) und senden, sobald GitHub wieder annimmt.
    if (/gedrosselt/i.test(String((e as Error)?.message ?? e))) {
      ausstehendSichern(n, daten);
      spaeter(n, daten, Math.max(60_000, gedrosseltBis - Date.now() + 5_000));
      return;
    }
    throw e;
  }
}

async function loesche(name: string): Promise<void> {
  const n = sauber(name);
  wartend.delete(n);
  await nacheinander(async () => {
    const sha = await holeSha(n);
    if (sha) {
      const r = await anfrage(`/repos/${repo()}/contents/${pfad(n)}`, {
        method: 'DELETE', frist: SCHREIBEN_MS, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Geloescht: ${n}`.slice(0, 200), sha, branch: ZWEIG }),
      });
      if (!r.ok && r.status !== 404) throw new Error(`Ablage (GitHub) antwortet ${r.status} beim Loeschen von ${n}`);
    }
    cache.set(n, { daten: null, sha: null, etag: null, geprueft: Date.now(), geaendert: null });
    verzeichnisVergessen(n);
  });
}

/* ---------------------------------------------------------- Auflisten */

async function liste(ordner: string): Promise<string[]> {
  const o = ordner.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const k = o;
  const gemerkt = verzeichnisse.get(k);
  if (gemerkt && Date.now() < gemerkt.bis) return gemerkt.namen;
  let r: Response;
  try {
    // Mit dem ETag der letzten Antwort: "nicht geaendert" kostet kein Kontingent.
    r = await anfrage(`/repos/${repo()}/contents/${pfad(o)}?ref=${ZWEIG}`, gemerkt?.etag ? { headers: { 'If-None-Match': gemerkt.etag } } : {});
  } catch (e) {
    merkeFehler(e);
    if (gemerkt) return gemerkt.namen;
    throw e;
  }
  if (r.status === 304 && gemerkt) { gemerkt.bis = Date.now() + VERZEICHNIS_MS; return gemerkt.namen; }
  if (r.status === 404) { verzeichnisse.set(k, { namen: [], bis: Date.now() + VERZEICHNIS_MS }); return []; }
  if (!r.ok) {
    if (gemerkt) return gemerkt.namen;
    throw new Error(`Ablage (GitHub) antwortet ${r.status} beim Auflisten von ${o || '/'}`);
  }
  const j = await r.json() as Array<{ name: string }> | { name?: string };
  const namen = Array.isArray(j) ? j.map((x) => x.name) : [];
  verzeichnisse.set(k, { namen, bis: Date.now() + VERZEICHNIS_MS, etag: r.headers.get('etag') });
  return namen;
}

async function angaben(name: string): Promise<{ groesse: number; geaendert: Date } | null> {
  const n = sauber(name);
  const daten = await lies(n);
  if (!daten) return null;
  const e = cache.get(n);
  if (e?.geaendert) return { groesse: daten.length, geaendert: new Date(e.geaendert) };
  // Wann zuletzt geaendert: der letzte Commit auf dieser Datei.
  try {
    const r = await anfrage(`/repos/${repo()}/commits?path=${pfad(n)}&sha=${ZWEIG}&per_page=1`);
    if (r.ok) {
      const j = await r.json() as Array<{ commit?: { committer?: { date?: string } } }>;
      const wann = Date.parse(j[0]?.commit?.committer?.date ?? '');
      if (wann && e) e.geaendert = wann;
      if (wann) return { groesse: daten.length, geaendert: new Date(wann) };
    }
  } catch { /* dann die Zeit des Abrufs */ }
  return { groesse: daten.length, geaendert: new Date(e?.geprueft ?? Date.now()) };
}

/*
 * Lesen, aendern, schreiben - gegen den gelesenen Stand (Betreiber, 16.11.2026: /admin/flaggen).
 *
 * schreib() oben schreibt immer den ganzen Inhalt, den es bekommt; bei einem Konflikt (409/422) holt es nur den neuen Stand und schreibt denselben Inhalt
 * noch einmal darueber. Fuer eine Datei, die auch andere schreiben (spieler-profile.json: die Laeufe auf GitHub tragen X-Konten ein, lib/xHandles.mjs),
 * waere das ein stilles Ueberschreiben. Hier wird die Datei frisch ueber die Schnittstelle gelesen (nicht aus dem Speicher und nicht ueber das CDN), die
 * Aenderung darauf gesetzt und mit genau diesem Stand (sha) geschrieben. Lehnt GitHub ab, weil sich die Datei bewegt hat, beginnt es von vorn - bis zu
 * fuenfmal, mit wachsendem Abstand. Ein noch vorgemerkter Stand dieser Datei geht vorher hinaus, damit er nicht spaeter die Aenderung ueberschreibt.
 */
async function aendere(name: string, aendern: (alt: Buffer | null) => Buffer | null): Promise<Buffer | null> {
  const n = sauber(name);
  if (NUR_SPEICHER.test(n) || GESAMMELT.test(n)) throw new Error(`Ablage: ${n} laesst sich nicht sicher aendern`);
  return nacheinander(async () => {
    const vorgemerkt = wartend.get(n);
    if (vorgemerkt) {
      wartend.delete(n);
      for (const uhren of [schnellUhren, sammelUhren]) { const u = uhren.get(n); if (u) clearTimeout(u); uhren.delete(n); }
      await schreibeJetzt(n, vorgemerkt);
      ausstehendLoeschen(n);
    }
    let letzter: Error | null = null;
    /*
     * Die Grundlage. Hat dieser Server die Datei zuletzt selbst geschrieben, kennt er Inhalt und sha schon - dann ohne Lesen (Betreiber, 16.11.2026: die
     * Inhalte-Schnittstelle liefert direkt nach einem Commit noch eine Weile den alten Stand; jeder Versuch darauf lief in 409, Zeile um Zeile).
     * Sonst, und nach jedem Konflikt: erst den Kopf des Zweigs (git/ref ist nie zwischengespeichert), dann die Datei genau zu diesem Commit.
     */
    const e0 = cache.get(n);
    let grundlage: { daten: Buffer | null; sha: string | null } | null = e0 && !e0.ausstehend && e0.geschrieben && e0.daten && e0.sha
      ? { daten: e0.daten, sha: e0.sha } : null;
    for (let versuch = 0; versuch < 6; versuch += 1) {
      if (versuch > 1) await new Promise((f) => setTimeout(f, 400 * versuch));
      if (!grundlage) {
        const k = await anfrage(`/repos/${repo()}/git/ref/heads/${ZWEIG}`);
        if (!k.ok) throw new Error(`Ablage (GitHub) antwortet ${k.status} beim Lesen des Zweigs`);
        const commit = ((await k.json()) as { object?: { sha?: string } }).object?.sha ?? ZWEIG;
        const r = await anfrage(`/repos/${repo()}/contents/${pfad(n)}?ref=${commit}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
        if (!r.ok && r.status !== 404) throw new Error(`Ablage (GitHub) antwortet ${r.status} beim Lesen von ${n}`);
        const daten = r.status === 404 ? null : Buffer.from(await r.arrayBuffer());
        grundlage = { daten, sha: daten ? blobSha(daten) : null };
      }
      const alt = grundlage.daten;
      const sha = grundlage.sha;
      const neu = aendern(alt);
      if (!neu) return alt;
      const p = await anfrage(`/repos/${repo()}/contents/${pfad(n)}`, {
        method: 'PUT', frist: SCHREIBEN_MS,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Aktualisiert: ${n}`.slice(0, 200), content: neu.toString('base64'), branch: ZWEIG, ...(sha ? { sha } : {}) }),
      });
      if (p.ok) {
        const j = await p.json() as { content?: { sha?: string }; commit?: { committer?: { date?: string } } };
        const wann = Date.parse(j.commit?.committer?.date ?? '') || Date.now();
        cache.set(n, { daten: neu, sha: j.content?.sha ?? blobSha(neu), etag: null, geprueft: Date.now(), geaendert: wann, geschrieben: Date.now() });
        verzeichnisVergessen(n);
        zuletztGeschrieben.set(n, Date.now());
        platteSichern(n, neu);
        return neu;
      }
      letzter = new Error(`Ablage (GitHub) antwortet ${p.status} beim Schreiben von ${n}`);
      // 409/422: die Datei hat sich seit dem Lesen bewegt - frisch lesen und die Aenderung neu daraufsetzen.
      if (p.status !== 409 && p.status !== 422) break;
      grundlage = null;
    }
    merkeFehler(letzter);
    throw letzter ?? new Error(`Ablage: Aendern von ${n} gescheitert`);
  });
}

/*
 * Mehrere Dateien in EINEM Commit (Betreiber, 17.11.2026: /admin/fotos-pool - "Unexpected token '<'" bei vielen Karten).
 *
 * Eine Zuordnung im Foto-Pool schrieb vorher fuenf Commits nacheinander (foto-pool.json, die Kopie in spielerfotos/, foto-credits.json,
 * spielerbilder.json, noch einmal foto-pool.json), jeder einzeln in der einen Schreibreihe und jeder mit eigener Konfliktschleife. Zehn schnelle
 * Zuordnungen waren fuenfzig Commits; die Anfragen warteten laenger als die 100 Sekunden, nach denen Cloudflare abbricht, und lieferten dessen
 * HTML-Seite. Hier entsteht ein Commit ueber die Git-Schnittstelle (Baum + Commit + Zweig vorruecken):
 *
 *   - `plan` bekommt einen Leser, der genau den Stand des Zweigkopfs liefert (nie veraltet), und sagt, was zu schreiben, zu kopieren und zu
 *     loeschen ist. Es kann mehrmals laufen: rueckt der Zweig dazwischen weiter (ein anderer Commit), wird neu gelesen und neu geplant.
 *   - Kopien werden nicht hochgeladen: die Kopie zeigt im Baum auf denselben Blob wie das Original (gleicher Inhalt = gleicher Blob).
 *   - Geloescht wird nur, was im Kopfstand wirklich liegt (sonst lehnt GitHub den Baum ab).
 */

function baumPfad(n: string): string {
  return [praefix(), sauber(n)].filter(Boolean).join('/');
}

export async function sammelCommit(
  nachricht: string,
  plan: (lies: (name: string) => Promise<Buffer | null>) => Promise<Sammel | null>,
  dateien: string[] = [],
): Promise<{ commit: string | null; geschrieben: string[] }> {
  return nacheinander(async () => {
    // Ein noch vorgemerkter Stand einer dieser Dateien geht vorher hinaus, damit er die Aenderung nicht spaeter ueberschreibt.
    for (const name of dateien) {
      const n = sauber(name);
      const vorgemerkt = wartend.get(n);
      if (!vorgemerkt) continue;
      wartend.delete(n);
      for (const uhren of [schnellUhren, sammelUhren]) { const u = uhren.get(n); if (u) clearTimeout(u); uhren.delete(n); }
      await schreibeJetzt(n, vorgemerkt);
      ausstehendLoeschen(n);
    }
    const json = async <T>(weg: string, wozu: string): Promise<T> => {
      const r = await anfrage(weg);
      if (!r.ok) throw new Error(`Ablage (GitHub) antwortet ${r.status} beim ${wozu}`);
      return await r.json() as T;
    };
    const kopfLesen = async () => {
      const kopf = (await json<{ object?: { sha?: string } }>(`/repos/${repo()}/git/ref/heads/${ZWEIG}`, 'Lesen des Zweigs')).object?.sha;
      if (!kopf) throw new Error('Ablage (GitHub): Zweig ohne Commit');
      return kopf;
    };
    const baumVon = async (commit: string) => {
      const baum = (await json<{ tree?: { sha?: string } }>(`/repos/${repo()}/git/commits/${commit}`, 'Lesen des Commits')).tree?.sha;
      if (!baum) throw new Error('Ablage (GitHub): Commit ohne Baum');
      return baum;
    };

    type BaumEintrag = { path: string; mode: '100644'; type: 'blob'; sha?: string | null; content?: string };
    let letzter: Error | null = null;
    for (let versuch = 0; versuch < 6; versuch += 1) {
      if (versuch > 0) await new Promise((f) => setTimeout(f, 200 * versuch + Math.floor(Math.random() * 400)));
      let kopf = await kopfLesen();

      const gelesen = new Map<string, Buffer | null>();
      const leser = async (name: string): Promise<Buffer | null> => {
        const n = sauber(name);
        if (gelesen.has(n)) return gelesen.get(n)!;
        const r = await anfrage(`/repos/${repo()}/contents/${pfad(n)}?ref=${kopf}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
        if (!r.ok && r.status !== 404) throw new Error(`Ablage (GitHub) antwortet ${r.status} beim Lesen von ${n}`);
        const daten = r.status === 404 ? null : Buffer.from(await r.arrayBuffer());
        gelesen.set(n, daten);
        return daten;
      };
      // Baum des Kopfs und Planen (liest die Dateien) gleichzeitig - jede Runde zaehlt, solange andere den Zweig bewegen.
      const [baum0, s] = await Promise.all([baumVon(kopf), plan(leser)]);
      let baum = baum0;
      if (!s) return { commit: null, geschrieben: [] };

      // Was im Kopfstand liegt, mit Blob-sha - je Ordner eine Anfrage (Inhalte-Schnittstelle, bis 1000 Eintraege; sonst einzeln nachsehen).
      const ordnerInhalt = new Map<string, Promise<Map<string, string>>>();
      const ordnerVon = (n: string) => { const i = n.lastIndexOf('/'); return i < 0 ? '' : n.slice(0, i); };
      const ordnerLesen = (ordner: string) => {
        let p = ordnerInhalt.get(ordner);
        if (!p) {
          p = (async () => {
            const inhalt = new Map<string, string>();
            const r = await anfrage(`/repos/${repo()}/contents/${pfad(ordner)}?ref=${kopf}`);
            if (r.ok) {
              const j = await r.json() as Array<{ name: string; sha: string; type: string }> | object;
              if (Array.isArray(j)) for (const e of j) if (e.type === 'file') inhalt.set(e.name, e.sha);
              if (Array.isArray(j) && j.length >= 1000) inhalt.set('\0voll', '1');
            } else if (r.status !== 404) throw new Error(`Ablage (GitHub) antwortet ${r.status} beim Auflisten von ${ordner || '/'}`);
            return inhalt;
          })();
          ordnerInhalt.set(ordner, p);
        }
        return p;
      };
      const blobVon = async (name: string): Promise<string | null> => {
        const n = sauber(name);
        const inhalt = await ordnerLesen(ordnerVon(n));
        const sha = inhalt.get(n.slice(n.lastIndexOf('/') + 1));
        if (sha || !inhalt.has('\0voll')) return sha ?? null;
        const r = await anfrage(`/repos/${repo()}/contents/${pfad(n)}?ref=${kopf}`);
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(`Ablage (GitHub) antwortet ${r.status} bei ${n}`);
        return ((await r.json()) as { sha?: string }).sha ?? null;
      };
      const pfade = [...Object.keys(s.kopieren), ...Object.values(s.kopieren), ...s.loeschen].map(sauber);
      await Promise.all([...new Set(pfade.map(ordnerVon))].map(ordnerLesen));

      const eintraege: BaumEintrag[] = [];
      const geaendert: Array<{ n: string; daten: Buffer }> = [];
      for (const [name, daten] of Object.entries(s.schreiben)) {
        const n = sauber(name);
        const alt = gelesen.has(n) ? gelesen.get(n) : await leser(n);
        if (alt && alt.equals(daten)) continue;
        eintraege.push({ path: baumPfad(n), mode: '100644', type: 'blob', content: daten.toString('utf8') });
        geaendert.push({ n, daten });
      }
      const kopiert: Array<{ nach: string; von: string; sha: string }> = [];
      for (const [nach, von] of Object.entries(s.kopieren)) {
        const sha = await blobVon(von);
        if (!sha) throw new Error(`Ablage: ${von} fehlt - keine Kopie nach ${nach}`);
        if ((await blobVon(nach)) === sha) continue; // liegt schon so da
        eintraege.push({ path: baumPfad(nach), mode: '100644', type: 'blob', sha });
        kopiert.push({ nach: sauber(nach), von: sauber(von), sha });
      }
      const geloescht: string[] = [];
      const ziele = new Set([...Object.keys(s.kopieren), ...Object.keys(s.schreiben)].map(sauber));
      for (const name of new Set(s.loeschen.map(sauber))) {
        if (ziele.has(name)) continue;
        if (!(await blobVon(name))) continue; // schon weg
        eintraege.push({ path: baumPfad(name), mode: '100644', type: 'blob', sha: null });
        geloescht.push(name);
      }
      if (!eintraege.length) return { commit: kopf, geschrieben: [] };
      const beruehrt = new Set([...geaendert.map((x) => x.n), ...kopiert.flatMap((x) => [x.nach, x.von]), ...geloescht].map(baumPfad));

      /*
       * Baum, Commit, Zweig vorruecken. Rueckt ein anderer Commit den Zweig dazwischen weiter (422), und hat er keine unserer Dateien beruehrt
       * (Vergleich alter Kopf ... neuer Kopf), wird dieselbe Aenderung ohne neues Lesen und Planen auf den neuen Kopf gesetzt - so kommt der
       * Commit auch durch, wenn andere alle ein, zwei Sekunden schreiben. Sonst: von vorn.
       */
      let ergebnis: { sha: string; wann: number } | null = null;
      for (let schnell = 0; schnell < 6 && !ergebnis; schnell += 1) {
        const t = await anfrage(`/repos/${repo()}/git/trees`, {
          method: 'POST', frist: SCHREIBEN_MS, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base_tree: baum, tree: eintraege }),
        });
        if (!t.ok) { letzter = new Error(`Ablage (GitHub) antwortet ${t.status} beim Anlegen des Baums`); break; }
        const neuerBaum = ((await t.json()) as { sha?: string }).sha;
        const cm = await anfrage(`/repos/${repo()}/git/commits`, {
          method: 'POST', frist: SCHREIBEN_MS, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: nachricht.slice(0, 2000), tree: neuerBaum, parents: [kopf] }),
        });
        if (!cm.ok) throw new Error(`Ablage (GitHub) antwortet ${cm.status} beim Anlegen des Commits`);
        const cj = await cm.json() as { sha?: string; committer?: { date?: string } };
        const u = await anfrage(`/repos/${repo()}/git/refs/heads/${ZWEIG}`, {
          method: 'PATCH', frist: SCHREIBEN_MS, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sha: cj.sha, force: false }),
        });
        if (u.ok) { ergebnis = { sha: cj.sha ?? '', wann: Date.parse(cj.committer?.date ?? '') || Date.now() }; break; }
        letzter = new Error(`Ablage (GitHub) antwortet ${u.status} beim Vorruecken des Zweigs`);
        if (u.status !== 422 && u.status !== 409) throw letzter;
        const neu = await kopfLesen();
        const [vergleich, neuerKopfBaum] = await Promise.all([
          anfrage(`/repos/${repo()}/compare/${kopf}...${neu}`).then(async (r) => (r.ok ? await r.json() as { files?: Array<{ filename: string; previous_filename?: string }>; total_commits?: number } : null)),
          baumVon(neu),
        ]);
        const dateienDazwischen = vergleich?.files;
        if (!dateienDazwischen || dateienDazwischen.length >= 300 || (vergleich?.total_commits ?? 0) > 250) break;
        if (dateienDazwischen.some((f) => beruehrt.has(f.filename) || (f.previous_filename && beruehrt.has(f.previous_filename)))) break;
        kopf = neu; baum = neuerKopfBaum;
      }
      if (!ergebnis) continue;

      // Der eigene Stand gilt ab jetzt - ohne erneutes Lesen (die Inhalte-Schnittstelle und das CDN liefern eine Weile noch den alten).
      const jetzt = Date.now();
      for (const { n, daten } of geaendert) {
        cache.set(n, { daten, sha: blobSha(daten), etag: null, geprueft: jetzt, geaendert: ergebnis.wann, geschrieben: jetzt });
        zuletztGeschrieben.set(n, jetzt);
        platteSichern(n, daten);
        verzeichnisVergessen(n);
      }
      for (const k2 of kopiert) {
        const quelle = cache.get(k2.von);
        const daten = quelle?.daten && quelle.sha === k2.sha ? quelle.daten : null;
        // Ohne den Inhalt: als "eben geschrieben" vermerken, damit das naechste Lesen ueber die Schnittstelle geht (das CDN kennt die Datei noch nicht).
        cache.set(k2.nach, { daten, sha: k2.sha, etag: null, geprueft: daten ? jetzt : 0, geaendert: ergebnis.wann, geschrieben: jetzt });
        verzeichnisVergessen(k2.nach);
      }
      for (const n of geloescht) {
        wartend.delete(n);
        cache.set(n, { daten: null, sha: null, etag: null, geprueft: jetzt, geaendert: null });
        verzeichnisVergessen(n);
      }
      return { commit: ergebnis.sha || null, geschrieben: [...geaendert.map((x) => x.n), ...kopiert.map((x) => x.nach), ...geloescht] };
    }
    merkeFehler(letzter);
    // Kam nur wegen anderer Commits nicht durch: lib/ablage aendereMehrere schreibt dann Datei fuer Datei (jede mit ihrem sha).
    throw Object.assign(letzter ?? new Error('Ablage: Sammel-Commit gescheitert'), { zweigBewegt: Boolean(letzter && /Vorruecken des Zweigs/.test(letzter.message)) });
  });
}

export const gitDatenSpeicher: Speicher = { lies, schreib, loesche, liste, angaben, aendere, sammeln: sammelCommit };

/* ------------------------------------------------- Hilfen fuer den Betrieb */

/**
 * Alles Vorgemerkte jetzt schreiben - beim Beenden des Servers.
 *
 * Render beendet den alten Server bei jedem Aufspielen mit SIGTERM; was bis dahin
 * nur gesammelt war (Zaehler), geht so noch ins Archiv statt verloren.
 */
export async function ablageLeeren(): Promise<number> {
  for (const u of [...sammelUhren.values(), ...schnellUhren.values()]) clearTimeout(u);
  sammelUhren.clear(); schnellUhren.clear();
  const alle = [...wartend.entries()];
  wartend.clear();
  let n = 0;
  for (const [name, daten] of alle) {
    try { await nacheinander(() => schreibeJetzt(name, daten)); n += 1; } catch (e) { merkeFehler(e); }
  }
  return n;
}

/** Die haeufig gelesenen kleinen Dateien beim Start laden, damit die erste Seite nicht auf GitHub wartet. */
export async function ablageWaermen(namen: string[]): Promise<void> {
  const rest = [...namen];
  const arbeiter = Array.from({ length: 5 }, async () => {
    for (let n = rest.shift(); n; n = rest.shift()) { try { await lies(n); } catch { /* fehlt oder gedrosselt */ } }
  });
  await Promise.all(arbeiter);
}

/** Fuer die Pruefung der Ablage: Zustand und letzter Fehler. */
export function gitDatenZustand() {
  return {
    repo: repo(), praefix: praefix() || null, imSpeicher: cache.size,
    vorgemerkt: wartend.size, letzterFehler,
    anfragen, anfragenSeit: new Date(zaehlerSeit).toISOString(),
  };
}
