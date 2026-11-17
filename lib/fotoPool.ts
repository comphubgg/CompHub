import crypto from 'crypto';
import sharp from 'sharp';
import { aendereJson, liesJson, speicher } from '@/lib/ablage';
import { CREDIT_DATEI, mitAenderung, type CreditEingabe, type CreditTafel, type FotoCredit } from '@/lib/fotoCredits';
import gesperrtListe from '@/lib/fotoGesperrt.json';

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
export const istGesperrt = (b: Buffer) => GESPERRT.has(sha1(b).slice(0, 8));

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

interface Bild { datei?: string; epicId?: string; name?: string; echtesFoto?: boolean }

const kurzName = (name: string) => (name || 'spieler').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'spieler';

async function aendereCredits(f: (t: CreditTafel) => void) {
  await aendereJson<CreditTafel>(CREDIT_DATEI, {}, (t) => { f(t); });
}

/**
 * Den Stand der Spieler herstellen, die eine Aenderung beruehrt: je Spieler genau das aktive Foto oeffentlich (Kopie in spielerfotos/,
 * spielerbilder.json, Credit), alle anderen nicht. `weg` sind Fotos, die eben aus dem Pool genommen wurden und noch eine Kopie haben koennten.
 */
async function abgleichen(epicIds: string[], weg: PoolFoto[] = []) {
  const ids = [...new Set(epicIds.filter((e) => KONTO.test(e)))];
  const t = await liesPool();
  const beruehrt = t.fotos.filter((f) => ids.includes(f.epicId) || (f.spielerDatei && (!f.epicId || !f.aktiv)));

  // 1. Kopien, die nicht (mehr) oeffentlich sein sollen: Credit zurueck in den Eintrag, Kopie und Credit-Eintrag weg.
  const zurueck = [...beruehrt.filter((f) => f.spielerDatei && !(f.aktiv && f.epicId)), ...weg.filter((f) => f.spielerDatei)];
  const geloest = new Set<string>();
  if (zurueck.length) {
    let credits: CreditTafel = {};
    await aendereCredits((c) => { credits = { ...c }; for (const f of zurueck) delete c[f.spielerDatei!]; });
    for (const f of zurueck) { geloest.add(f.spielerDatei!); await speicher.loesche(SPIELER_ORDNER + f.spielerDatei!).catch(() => {}); }
    await aenderePool((p) => {
      for (const f of p.fotos) {
        if (!f.spielerDatei || !geloest.has(f.spielerDatei)) continue;
        const c = credits[f.spielerDatei];
        if (c) f.credit = c; else delete f.credit;
        delete f.spielerDatei;
      }
    });
  }

  // 2. Je Spieler das aktive Foto veroeffentlichen.
  const neu = new Map<string, PoolFoto>();
  const nachher = await liesPool();
  for (const id of ids) {
    const aktiv = nachher.fotos.find((f) => f.epicId === id && f.aktiv);
    if (aktiv && !aktiv.spielerDatei) {
      const roh = await speicher.lies(aktiv.datei);
      if (!roh) throw new Error(`Pool-Foto ${aktiv.id} fehlt in der Ablage`);
      const name = `${kurzName(aktiv.name ?? '')}-${id.slice(0, 8)}-${Date.now().toString(36)}.webp`;
      await speicher.schreib(SPIELER_ORDNER + name, roh);
      neu.set(id, { ...aktiv, spielerDatei: name });
      // Kurz warten, damit zwei Kopien in derselben Millisekunde nie denselben Namen bekommen.
      await new Promise((r) => setTimeout(r, 2));
    }
  }
  if (neu.size) {
    await aendereCredits((c) => { for (const f of neu.values()) if (f.credit) c[f.spielerDatei!] = { ...f.credit, geaendert: Date.now() }; });
  }

  // 3. spielerbilder.json: das aktive Foto eintragen - oder zuruecksetzen, was der Spieler vorher hatte.
  const vorherNeu: Record<string, Vorher | null> = {};
  if (ids.length) {
    await aendereJson<Bild[]>('spielerbilder.json', [], (liste) => {
      if (!Array.isArray(liste)) throw new Error('spielerbilder.json ist keine Liste');
      for (const id of ids) {
        const aktiv = neu.get(id) ?? nachher.fotos.find((f) => f.epicId === id && f.aktiv && f.spielerDatei);
        const da = liste.find((b) => b.epicId === id);
        const unsere = (d?: string) => Boolean(d && (geloest.has(d) || nachher.fotos.some((f) => f.spielerDatei === d)));
        if (aktiv?.spielerDatei) {
          if (da) {
            if (!unsere(da.datei) && !(id in nachher.vorher)) vorherNeu[id] = { ...(da.datei ? { datei: da.datei } : {}), echtesFoto: Boolean(da.echtesFoto) };
            da.datei = aktiv.spielerDatei; da.echtesFoto = true;
          } else {
            if (!(id in nachher.vorher)) vorherNeu[id] = {};
            liste.push({ datei: aktiv.spielerDatei, epicId: id, name: aktiv.name || id.slice(0, 8), echtesFoto: true });
          }
        } else if (da && unsere(da.datei)) {
          const v = nachher.vorher[id];
          if (v?.datei) { da.datei = v.datei; da.echtesFoto = Boolean(v.echtesFoto); } else { delete da.datei; da.echtesFoto = false; }
          vorherNeu[id] = null;
        } else if (!aktiv) {
          vorherNeu[id] = null;
        }
      }
    }, 1);
  }
  if (neu.size || Object.keys(vorherNeu).length) {
    await aenderePool((p) => {
      for (const f of p.fotos) { const n = neu.get(f.epicId); if (n && n.id === f.id) f.spielerDatei = n.spielerDatei; }
      for (const [id, v] of Object.entries(vorherNeu)) { if (v) p.vorher[id] = v; else delete p.vorher[id]; }
    });
  }
}

/** Hat ein Spieler nach einer Aenderung kein aktives Foto mehr, wird sein aeltestes zugeordnetes aktiv. */
function nachruecken(t: PoolTafel, epicId: string) {
  if (!epicId) return;
  const seine = t.fotos.filter((f) => f.epicId === epicId);
  if (seine.length && !seine.some((f) => f.aktiv)) {
    seine.sort((a, b) => (a.zugeordnet ?? a.erstellt) - (b.zugeordnet ?? b.erstellt))[0].aktiv = true;
  }
}

export class PoolFehler extends Error {}

/** Foto einem Spieler zuordnen (epicId), einem anderen umhaengen oder loesen (epicId ""). */
export async function zuordnen(id: string, epicId: string, name: string) {
  if (!ID.test(id)) throw new PoolFehler('Unbekanntes Foto');
  const ziel = String(epicId ?? '').toLowerCase().replace(/-/g, '');
  if (ziel && !KONTO.test(ziel)) throw new PoolFehler('Epic-Konto-Id (32 Zeichen) fehlt');
  let alt = '';
  await aenderePool((t) => {
    const f = t.fotos.find((x) => x.id === id);
    if (!f) throw new PoolFehler('Unbekanntes Foto');
    alt = f.epicId;
    if (f.epicId === ziel) { if (ziel && name) f.name = String(name).trim().slice(0, 40); return; }
    f.epicId = ziel;
    f.aktiv = false;
    if (ziel) { f.name = String(name ?? '').trim().slice(0, 40) || undefined; f.zugeordnet = Date.now(); }
    else { delete f.name; delete f.zugeordnet; }
    // Das erste Foto eines Spielers wird aktiv.
    if (ziel && !t.fotos.some((x) => x !== f && x.epicId === ziel && x.aktiv)) f.aktiv = true;
    nachruecken(t, alt);
  });
  await abgleichen([alt, ziel]);
}

/** Dieses Foto wird das oeffentliche seines Spielers. */
export async function aktivSetzen(id: string) {
  let epicId = '';
  await aenderePool((t) => {
    const f = t.fotos.find((x) => x.id === id);
    if (!f) throw new PoolFehler('Unbekanntes Foto');
    if (!f.epicId) throw new PoolFehler('Das Foto ist niemandem zugeordnet');
    epicId = f.epicId;
    for (const x of t.fotos) if (x.epicId === epicId) x.aktiv = x === f;
  });
  await abgleichen([epicId]);
}

/** Aus dem Pool loeschen - samt oeffentlicher Kopie, wenn es aktiv war (dann rueckt das naechste Foto des Spielers nach). */
export async function loeschen(id: string) {
  let weg: PoolFoto | undefined;
  await aenderePool((t) => {
    const i = t.fotos.findIndex((x) => x.id === id);
    if (i < 0) throw new PoolFehler('Unbekanntes Foto');
    [weg] = t.fotos.splice(i, 1);
    nachruecken(t, weg.epicId);
  });
  if (!weg) return;
  await abgleichen([weg.epicId], [weg]);
  await speicher.loesche(weg.datei).catch(() => {});
}

/** Angaben zum Foto aendern - im Eintrag, und wenn es oeffentlich ist, in foto-credits.json (dort gilt "bestaetigt"). */
export async function creditSetzen(id: string, e: CreditEingabe): Promise<FotoCredit | null> {
  const t = await liesPool();
  const f = t.fotos.find((x) => x.id === id);
  if (!f) throw new PoolFehler('Unbekanntes Foto');
  if (f.spielerDatei) {
    let neu: FotoCredit | null = null;
    await aendereCredits((c) => { neu = mitAenderung(c[f.spielerDatei!], e); if (neu) c[f.spielerDatei!] = neu; else delete c[f.spielerDatei!]; });
    return neu;
  }
  let neu: FotoCredit | null = null;
  await aenderePool((p) => {
    const x = p.fotos.find((y) => y.id === id);
    if (!x) throw new PoolFehler('Unbekanntes Foto');
    neu = mitAenderung(x.credit, e);
    if (neu) x.credit = neu; else delete x.credit;
  });
  return neu;
}

/** Fuer die Admin-Seite: jedes Foto mit seinem gueltigen Credit (bei oeffentlichen der aus foto-credits.json). */
export async function poolMitCredits(): Promise<Array<Omit<PoolFoto, 'credit'> & { credit: FotoCredit | null }>> {
  const [t, credits] = await Promise.all([liesPool(), liesJson<CreditTafel>(CREDIT_DATEI, {})]);
  return t.fotos.map((f) => ({ ...f, credit: (f.spielerDatei ? credits[f.spielerDatei] : f.credit) ?? null }));
}

export const istPoolId = (id: string) => ID.test(id);
