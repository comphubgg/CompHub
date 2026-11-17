import crypto from 'crypto';
import sharp from 'sharp';
import { aendereJson, aendereMehrere, liesJson, speicher } from '@/lib/ablage';
import { CREDIT_DATEI, CREDIT_FELDER, mitAenderung, type CreditEingabe, type CreditTafel, type FotoCredit } from '@/lib/fotoCredits';
import gesperrtListe from '@/lib/fotoGesperrt.json';
import { kennungGesperrt } from '@/lib/fotoSperre.mjs';

/*
 * Der Foto-Pool (Betreiber, 17.11.2026): der Betreiber schickt viele Spielerfotos ohne Namen. Wir schneiden sie zu (scripts/fotos-pool-import.mjs),
 * er ordnet sie auf der Seite zu (/admin/fotos-pool, aus der Statistik unter Spieler -> "Fotos" verlinkt, nur fuer den Admin).
 *
 * Dieselbe Ablage wie das Hochladen in /admin/fotos-credits (comphub-daten):
 *
 *   foto-pool.json          { fotos: [PoolFoto], vorher: { <epicId>: { datei?, echtesFoto? } } }
 *   fotopool/<id>.webp      der Zuschnitt - privat: ausgeliefert nur ueber /api/admin/foto-pool/bild (Admin), nie ueber /spielerbilder
 *   spielerfotos/<..>.webp  die oeffentliche Kopie des AKTIVEN Fotos eines Spielers, Name wie beim Hochladen ("<name>-<konto8>-<zeit36>.webp",
 *                           lib/fotoSperre.mjs uploadFrei), eingetragen in spielerbilder.json - der Platzhalter verschwindet.
 *   foto-credits.json       die Angaben zum oeffentlichen Foto, unter dem Namen der Kopie (lib/fotoCredits.ts): oeffentlich steht der Credit nur,
 *                           wenn "bestaetigt". Solange ein Foto nicht oeffentlich ist, liegen seine Angaben im Pool-Eintrag selbst (credit).
 *
 * Mehrere Fotos je Spieler: zugeordnet koennen viele sein, oeffentlich ist genau eines ("aktiv") - das erste zugeordnete, bis der Admin ein
 * anderes waehlt. Wird das aktive geloest oder geloescht, rueckt das naechste nach; ist keines mehr da, kommt zurueck, was der Spieler vorher
 * hatte (vorher[epicId]) - oder der Platzhalter.
 */

export const POOL_DATEI = 'foto-pool.json';
export const POOL_ORDNER = 'fotopool/';
const SPIELER_ORDNER = 'spielerfotos/';
const BILDER_DATEI = 'spielerbilder.json';

export interface PoolFoto {
  id: string;
  /** Pfad in der Ablage: fotopool/<id>.webp */
  datei: string;
  /** Date.now() bei der Aufnahme. */
  erstellt: number;
  /** Zugeordneter Spieler (Epic-Konto-Id) - "" = noch niemand. */
  epicId: string;
  /** Der Name, unter dem zugeordnet wurde (nur zur Anzeige). */
  name?: string;
  zugeordnet?: number;
  /** Das oeffentliche Foto dieses Spielers. */
  aktiv?: boolean;
  /** Name der oeffentlichen Kopie in spielerfotos/ (nur solange aktiv). */
  spielerDatei?: string;
  /** Quelle, Fotograf, Link, Lizenz, bestaetigt ... - solange nicht oeffentlich; danach in foto-credits.json. */
  credit?: FotoCredit;
  /** Herkunft: Dateiname im Eingangsordner, SHA-1 der Eingangsdatei, Wahrnehmungs-Hash (dHash, 64 Bit hex) des Zuschnitts. */
  original?: string;
  quelleSha1?: string;
  /** dHash des ganzen Eingangsbildes - dasselbe Foto noch einmal, nur verkleinert oder neu gespeichert, wird so schon vor dem Zuschnitt erkannt. */
  quellePhash?: string;
  phash?: string;
  breite?: number;
  hoehe?: number;
}

interface Vorher { datei?: string; echtesFoto?: boolean }
export interface PoolTafel { fotos: PoolFoto[]; vorher: Record<string, Vorher> }

const LEER: PoolTafel = { fotos: [], vorher: {} };
const ID = /^[a-z0-9]{6,40}$/;
export const KONTO = /^[0-9a-f]{32}$/;

function sauber(t: unknown): PoolTafel {
  const x = (t && typeof t === 'object' ? t : {}) as Partial<PoolTafel>;
  return { fotos: Array.isArray(x.fotos) ? x.fotos : [], vorher: x.vorher && typeof x.vorher === 'object' ? x.vorher : {} };
}

export async function liesPool(): Promise<PoolTafel> {
  return sauber(await liesJson<PoolTafel>(POOL_DATEI, LEER));
}

async function aenderePool(f: (t: PoolTafel) => void): Promise<PoolTafel> {
  return sauber(await aendereJson<PoolTafel>(POOL_DATEI, LEER, (roh) => { const t = sauber(roh); f(t); return t; }));
}

/* ------------------------------------------------------------------ Hashes und Sperre */

const GESPERRT = new Set(gesperrtListe as string[]);
export const sha1 = (b: Buffer) => crypto.createHash('sha1').update(b).digest('hex');
/** Wie lib/fotoGesperrt.json: die ersten acht Zeichen des SHA-1. Die alten, entfernten Fotos (lib/fotoSperre.mjs) duerfen nie zurueck. */
export const istGesperrt = (b: Buffer) => kennungGesperrt(sha1(b).slice(0, 8), GESPERRT);

/** dHash: 9x8 Graustufen, je Zeile "heller als rechts daneben?" - 64 Bit als Hex. Gleiches Motiv, anders gespeichert/verkleinert => fast gleicher Hash. */
export async function wahrnehmungsHash(b: Buffer): Promise<string> {
  const px = await sharp(b).rotate().greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let bits = 0n;
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) bits = (bits << 1n) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1n : 0n);
  return bits.toString(16).padStart(16, '0');
}
export function abstand(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}
/** Bis zu diesem Abstand (von 64 Bit) gilt ein Zuschnitt als dasselbe Foto. */
export const FAST_GLEICH = 6;
/** Fuer ganze Eingangsbilder strenger: Serienbilder derselben Szene liegen sonst schnell darunter. */
export const FAST_GLEICH_QUELLE = 4;

/** Ein Foto wie beim Hochladen (app/api/spielerbild/hochladen): WebP, hoechstens 600 px hoch. */
export async function alsPoolBild(b: Buffer): Promise<{ bild: Buffer; breite: number; hoehe: number }> {
  const { data, info } = await sharp(b).rotate().resize({ height: 600, withoutEnlargement: true }).webp({ quality: 88 }).toBuffer({ resolveWithObject: true });
  return { bild: data, breite: info.width, hoehe: info.height };
}

/* ------------------------------------------------------------------ Aufnehmen */

export type Aufnahme =
  | { ok: true; foto: PoolFoto }
  | { ok: false; grund: 'gesperrt' | 'doppelt' | 'fast-gleich' | 'kein-bild'; wie?: string; abstand?: number };

/**
 * Einen fertigen Zuschnitt in den Pool legen (unzugeordnet). Prueft vorher: altes, gesperrtes Foto? Dieselbe Eingangsdatei schon im Pool
 * (quelleSha1 - nur, wenn sie genau so schon einmal eingelesen wurde und dabei nichts Neues entstand)? Ein fast gleicher Zuschnitt (dHash)?
 * Mit probe: nur pruefen, nichts schreiben.
 */
export async function inPoolAufnehmen(zuschnitt: Buffer, angaben: {
  original?: string; quelleSha1?: string; quellePhash?: string; quelleGesperrt?: boolean; credit?: CreditEingabe; probe?: boolean; schonGesehen?: PoolFoto[];
} = {}): Promise<Aufnahme> {
  if (angaben.quelleGesperrt || istGesperrt(zuschnitt)) return { ok: false, grund: 'gesperrt' };
  let fertig: { bild: Buffer; breite: number; hoehe: number };
  try { fertig = await alsPoolBild(zuschnitt); } catch { return { ok: false, grund: 'kein-bild' }; }
  const phash = await wahrnehmungsHash(fertig.bild);
  const vergleich = (fotos: PoolFoto[]): Aufnahme | null => {
    for (const f of fotos) {
      if (!f.phash) continue;
      const d = abstand(f.phash, phash);
      if (d <= FAST_GLEICH) return { ok: false, grund: d === 0 ? 'doppelt' : 'fast-gleich', wie: f.original ? `${f.id} (${f.original})` : f.id, abstand: d };
    }
    return null;
  };
  const vorab = vergleich([...(await liesPool()).fotos, ...(angaben.schonGesehen ?? [])]);
  if (vorab) return vorab;
  const id = `p${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
  const credit = angaben.credit && Object.keys(angaben.credit).length ? mitAenderung(undefined, angaben.credit) : null;
  const foto: PoolFoto = {
    id, datei: `${POOL_ORDNER}${id}.webp`, erstellt: Date.now(), epicId: '',
    ...(credit ? { credit } : {}),
    ...(angaben.original ? { original: String(angaben.original).slice(0, 160) } : {}),
    ...(angaben.quelleSha1 ? { quelleSha1: angaben.quelleSha1 } : {}),
    ...(angaben.quellePhash ? { quellePhash: angaben.quellePhash } : {}),
    phash, breite: fertig.breite, hoehe: fertig.hoehe,
  };
  if (angaben.probe) return { ok: true, foto };
  await speicher.schreib(foto.datei, fertig.bild);
  let doppel: Aufnahme | null = null;
  await aenderePool((t) => {
    // Zwischen Pruefen und Schreiben kann ein anderer Lauf dasselbe Foto abgelegt haben.
    doppel = vergleich(t.fotos);
    if (!doppel) t.fotos.push(foto);
  });
  if (doppel) { await speicher.loesche(foto.datei).catch(() => {}); return doppel; }
  return { ok: true, foto };
}

/* ------------------------------------------------------------------ Zuordnen, aktiv setzen, loesen, loeschen */

/*
 * Seit 17.11.2026 (Betreiber: "Fehler: Unexpected token '<', "<!DOCTYPE "... is not valid JSON" bei vielen Karten) als reine Rechnung auf dem
 * gelesenen Stand der drei Dateien, geschrieben in EINEM Commit fuer beliebig viele Aenderungen (lib/fotoPoolReihe.ts sammelt, lib/ablage
 * aendereMehrere schreibt). Vorher waren es je Zuordnung bis zu fuenf Commits nacheinander, die Anfrage wartete auf alle - bei schnellem Arbeiten
 * laenger als Cloudflares 100 Sekunden. Brach eine Anfrage mittendrin ab, blieb ein halber Stand: Pool-Eintrag ohne oeffentliches Foto, Kopien
 * ohne Eintrag (Kami dreimal), geloeschte Eintraege mit liegengebliebener Datei.
 *
 * Der Abgleich laeuft bei jedem Schreiben fuer ALLE zugeordneten Spieler: ein halber Stand von frueher heilt so beim naechsten Speichern.
 */

interface Bild { datei?: string; epicId?: string; name?: string; echtesFoto?: boolean }

const kurzName = (name: string) => (name || 'spieler').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'spieler';

export class PoolFehler extends Error {}

export type PoolAktion =
  | { aktion: 'zuordnen'; id: string; epicId: string; name: string }
  | { aktion: 'aktiv'; id: string }
  | { aktion: 'loeschen'; id: string }
  | { aktion: 'credit'; id: string; felder: CreditEingabe };

export interface PoolStand { pool: PoolTafel; credits: CreditTafel; bilder: Bild[] }

/** Eingabe pruefen und in die feste Form bringen (wirft PoolFehler). */
export function aktionAus(e: { aktion?: unknown; id?: unknown; epicId?: unknown; name?: unknown; felder?: unknown } | null): PoolAktion {
  const id = String(e?.id ?? '');
  if (!e || !ID.test(id)) throw new PoolFehler('Unbekanntes Foto');
  if (e.aktion === 'zuordnen') {
    const epicId = String(e.epicId ?? '').toLowerCase().replace(/-/g, '');
    if (epicId && !KONTO.test(epicId)) throw new PoolFehler('Epic-Konto-Id (32 Zeichen) fehlt');
    return { aktion: 'zuordnen', id, epicId, name: String(e.name ?? '').trim().slice(0, 40) };
  }
  if (e.aktion === 'aktiv' || e.aktion === 'loeschen') return { aktion: e.aktion, id };
  if (e.aktion === 'credit') {
    const roh = (e.felder && typeof e.felder === 'object' ? e.felder : {}) as Record<string, unknown>;
    const felder: CreditEingabe = {};
    for (const f of CREDIT_FELDER) if (roh[f] !== undefined) felder[f] = roh[f];
    return { aktion: 'credit', id, felder };
  }
  throw new PoolFehler('Unbekannte Aktion');
}

/** Hat ein Spieler nach einer Aenderung kein aktives Foto mehr, wird sein aeltestes zugeordnetes aktiv; mehr als eines aktiv: nur das erste bleibt. */
function nachruecken(t: PoolTafel, epicId: string) {
  if (!epicId) return;
  const seine = t.fotos.filter((f) => f.epicId === epicId);
  const aktive = seine.filter((f) => f.aktiv);
  for (const f of aktive.slice(1)) f.aktiv = false;
  if (seine.length && !aktive.length) {
    seine.sort((a, b) => (a.zugeordnet ?? a.erstellt) - (b.zugeordnet ?? b.erstellt))[0].aktiv = true;
  }
}

/**
 * Eine Aenderung auf den Stand legen. `zeit` ist der Zeitpunkt der Eingabe (fuer "zugeordnet" und damit den Namen der oeffentlichen Kopie).
 * Geloeschte Fotos landen in `weg` (ihre Datei und eine oeffentliche Kopie werden beim Abgleich mitgeloescht). Wirft PoolFehler.
 */
export function wendeAktionAn(st: PoolStand, a: PoolAktion, zeit: number, weg: PoolFoto[]): void {
  const t = st.pool;
  const i = t.fotos.findIndex((x) => x.id === a.id);
  if (i < 0) {
    // Zweimal geloescht (die Seite schickt nach einem Abbruch noch einmal) ist kein Fehler.
    if (a.aktion === 'loeschen') return;
    throw new PoolFehler('Unbekanntes Foto (inzwischen gelöscht?)');
  }
  const f = t.fotos[i];
  if (a.aktion === 'zuordnen') {
    const alt = f.epicId;
    if (f.epicId === a.epicId) { if (a.epicId && a.name) f.name = a.name; return; }
    f.epicId = a.epicId;
    f.aktiv = false;
    if (a.epicId) { f.name = a.name || undefined; f.zugeordnet = zeit; } else { delete f.name; delete f.zugeordnet; }
    // Das erste Foto eines Spielers wird aktiv.
    if (a.epicId && !t.fotos.some((x) => x !== f && x.epicId === a.epicId && x.aktiv)) f.aktiv = true;
    nachruecken(t, alt);
  } else if (a.aktion === 'aktiv') {
    if (!f.epicId) throw new PoolFehler('Das Foto ist niemandem zugeordnet');
    for (const x of t.fotos) if (x.epicId === f.epicId) x.aktiv = x === f;
  } else if (a.aktion === 'loeschen') {
    t.fotos.splice(i, 1);
    weg.push(f);
    nachruecken(t, f.epicId);
  } else if (a.aktion === 'credit') {
    if (f.spielerDatei) {
      const neu = mitAenderung(st.credits[f.spielerDatei], a.felder);
      if (neu) st.credits[f.spielerDatei] = neu; else delete st.credits[f.spielerDatei];
    } else {
      const neu = mitAenderung(f.credit, a.felder);
      if (neu) f.credit = neu; else delete f.credit;
    }
  }
}

/**
 * Den Stand herstellen, den der Pool verlangt: je Spieler genau das aktive Foto oeffentlich (Kopie in spielerfotos/, spielerbilder.json, Credit
 * in foto-credits.json), alle anderen nicht; ohne Foto zurueck, was der Spieler vorher hatte (vorher[epicId]) - oder der Platzhalter.
 * Aendert `st` und sagt, was kopiert und geloescht werden muss.
 */
export function abgleichen(st: PoolStand, weg: PoolFoto[], jetzt = Date.now()): { kopieren: Record<string, string>; loeschen: string[] } {
  const t = st.pool;
  const kopieren: Record<string, string> = {};
  const loeschen: string[] = weg.map((f) => f.datei).filter((d) => d?.startsWith(POOL_ORDNER));
  for (const id of new Set(t.fotos.map((f) => f.epicId).filter(Boolean))) nachruecken(t, id);

  // 1. Kopien, die nicht (mehr) oeffentlich sein sollen: Credit zurueck in den Eintrag, Kopie und Credit-Eintrag weg.
  const geloest = new Set<string>();
  for (const f of [...t.fotos.filter((x) => x.spielerDatei && !(x.aktiv && x.epicId)), ...weg.filter((x) => x.spielerDatei)]) {
    const d = f.spielerDatei!;
    geloest.add(d);
    const c = st.credits[d];
    delete st.credits[d];
    loeschen.push(SPIELER_ORDNER + d);
    if (t.fotos.includes(f)) { if (c) f.credit = c; else delete f.credit; delete f.spielerDatei; }
  }

  // 2. Je Spieler das aktive Foto veroeffentlichen - unter einem festen Namen (Name, Konto, Zeit der Zuordnung): ein zweiter Versuch legt keine
  //    zweite Kopie an (vorher: Kami dreimal in spielerfotos/).
  const vergeben = new Set(t.fotos.map((f) => f.spielerDatei).filter(Boolean) as string[]);
  for (const f of t.fotos) {
    if (!f.epicId || !f.aktiv || f.spielerDatei) continue;
    let zeit = f.zugeordnet ?? f.erstellt ?? jetzt;
    let name = '';
    for (;;) {
      name = `${kurzName(f.name ?? '')}-${f.epicId.slice(0, 8)}-${zeit.toString(36)}.webp`;
      if (!vergeben.has(name) && !geloest.has(name)) break;
      zeit += 1;
    }
    vergeben.add(name);
    f.spielerDatei = name;
    kopieren[SPIELER_ORDNER + name] = f.datei;
    if (f.credit) st.credits[name] = { ...f.credit, geaendert: jetzt };
  }

  // 3. spielerbilder.json: das aktive Foto eintragen - oder zuruecksetzen, was der Spieler vorher hatte.
  const unsere = (d?: string) => Boolean(d && (geloest.has(d) || vergeben.has(d)));
  const ids = new Set<string>([
    ...t.fotos.map((f) => f.epicId), ...weg.map((f) => f.epicId), ...Object.keys(t.vorher),
    ...st.bilder.filter((b) => unsere(b.datei)).map((b) => b.epicId ?? ''),
  ].filter((e) => KONTO.test(e)));
  for (const id of ids) {
    const aktiv = t.fotos.find((f) => f.epicId === id && f.aktiv && f.spielerDatei);
    const da = st.bilder.find((b) => b.epicId === id);
    if (aktiv?.spielerDatei) {
      if (da) {
        if (!unsere(da.datei) && !(id in t.vorher)) t.vorher[id] = { ...(da.datei ? { datei: da.datei } : {}), echtesFoto: Boolean(da.echtesFoto) };
        da.datei = aktiv.spielerDatei; da.echtesFoto = true;
      } else {
        if (!(id in t.vorher)) t.vorher[id] = {};
        st.bilder.push({ datei: aktiv.spielerDatei, epicId: id, name: aktiv.name || id.slice(0, 8), echtesFoto: true });
      }
    } else if (da && unsere(da.datei)) {
      const v = t.vorher[id];
      if (v?.datei) { da.datei = v.datei; da.echtesFoto = Boolean(v.echtesFoto); } else { delete da.datei; da.echtesFoto = false; }
      delete t.vorher[id];
    } else if (!t.fotos.some((f) => f.epicId === id)) {
      delete t.vorher[id];
    }
  }
  return { kopieren, loeschen };
}

const parse = <T>(roh: Buffer | null, name: string, standard: T): T => {
  if (!roh) return structuredClone(standard);
  try { return JSON.parse(roh.toString('utf8')) as T; } catch { throw new Error(`${name} ist kein gültiges JSON - nicht überschrieben`); }
};
const alsJson = (wert: unknown, einzug: number) => Buffer.from(JSON.stringify(wert, null, einzug), 'utf8');

export type Ergebnis = { ok: true } | { ok: false; fehler: string };

/**
 * Viele Aenderungen auf einmal schreiben: frisch gelesen (Zweigkopf), alle angewandt, abgeglichen, ein Commit. Eine einzelne ungueltige Aenderung
 * (Foto inzwischen geloescht ...) haelt die anderen nicht auf - sie bekommt ihr eigenes Ergebnis. Wirft nur, wenn das Schreiben selbst scheitert.
 */
export async function aenderungenSchreiben(liste: Array<{ cid: string; a: PoolAktion; zeit: number }>): Promise<{ ergebnisse: Record<string, Ergebnis>; commit: string | null }> {
  let ergebnisse: Record<string, Ergebnis> = {};
  const r = await aendereMehrere(`Foto-Pool: ${beschreibe(liste.map((x) => x.a))} (Admin)`, async (lies) => {
    ergebnisse = {};
    const [p, c, b] = await Promise.all([lies(POOL_DATEI), lies(CREDIT_DATEI), lies(BILDER_DATEI)]);
    const st: PoolStand = { pool: sauber(parse(p, POOL_DATEI, LEER)), credits: parse<CreditTafel>(c, CREDIT_DATEI, {}), bilder: parse<Bild[]>(b, BILDER_DATEI, []) };
    if (!Array.isArray(st.bilder)) throw new Error(`${BILDER_DATEI} ist keine Liste`);
    const weg: PoolFoto[] = [];
    for (const { cid, a, zeit } of liste) {
      try { wendeAktionAn(st, a, zeit, weg); ergebnisse[cid] = { ok: true }; } catch (f) {
        if (!(f instanceof PoolFehler)) throw f;
        ergebnisse[cid] = { ok: false, fehler: f.message };
      }
    }
    const { kopieren, loeschen } = abgleichen(st, weg);
    return {
      // Reihenfolge zaehlt nur beim Schreiben Datei fuer Datei (lib/ablage aendereMehrere): der Pool zuletzt.
      schreiben: { [CREDIT_DATEI]: alsJson(st.credits, 2), [BILDER_DATEI]: alsJson(st.bilder, 1), [POOL_DATEI]: alsJson(st.pool, 2) },
      kopieren, loeschen,
    };
  }, [POOL_DATEI, CREDIT_DATEI, BILDER_DATEI]);
  return { ergebnisse, commit: r.commit };
}

function beschreibe(liste: PoolAktion[]): string {
  const n = { zuordnen: 0, loesen: 0, aktiv: 0, loeschen: 0, credit: 0 };
  for (const a of liste) {
    if (a.aktion === 'zuordnen') n[a.epicId ? 'zuordnen' : 'loesen'] += 1; else n[a.aktion] += 1;
  }
  const teile = [[n.zuordnen, 'zugeordnet'], [n.loesen, 'geloest'], [n.aktiv, 'aktiv gesetzt'], [n.loeschen, 'geloescht'], [n.credit, 'Credit']]
    .filter(([z]) => z).map(([z, t]) => `${z} ${t}`);
  return teile.join(', ') || 'Abgleich';
}

/** Fuer die Admin-Seite: jedes Foto mit seinem gueltigen Credit (bei oeffentlichen der aus foto-credits.json). */
export async function poolMitCredits(pool?: PoolTafel): Promise<Array<Omit<PoolFoto, 'credit'> & { credit: FotoCredit | null }>> {
  const [t, credits] = await Promise.all([pool ?? liesPool(), liesJson<CreditTafel>(CREDIT_DATEI, {})]);
  return t.fotos.map((f) => ({ ...f, credit: (f.spielerDatei ? credits[f.spielerDatei] : f.credit) ?? null }));
}

export const istPoolId = (id: string) => ID.test(id);
