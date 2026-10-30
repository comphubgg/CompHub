import crypto from 'crypto';
import path from 'path';
import fs from '@/lib/ablageFs';
import { DATEN_ORT } from '@/lib/datenOrt';
import { ersatzSeit } from '@/lib/ablage';
import { brSchluessel, saisonVon } from '@/lib/inseln';

/*
 * Jede Saison ihre eigene Battle-Royale-Karte (Betreiber, 30.10.2026: "am 1. November ist eine neue Season, neue Map ... dass du automatisch
 * die neuen Maps in den neuen Tournaments machst").
 *
 * Bis dahin trug eine Turnierkarte ohne gewaehltes Bild gar keins - sie zeigte immer die Karte von heute (fortnite-api.com). Mit dem
 * Season-Wechsel haetten alle alten Karten ueber Nacht die neue Insel gezeigt. Jetzt:
 *
 *   - Die Insel einer Saison wird einmal als eigenes Kartenbild abgelegt (kartenbilder/, Kennung battle-royale-s<N>) und in
 *     insel-bilder.json unter "BR:S<N>" zugeordnet. Seiten und Automatik waehlen sie ueber lib/inseln brBildFuer.
 *   - Beim ersten Lauf ist das die Karte von heute fuer die laufende Saison; jede Turnierkarte ohne Bild bekommt sie - dasselbe Bild wie
 *     bisher, nur eingefroren.
 *   - Eine neue Saison (Epic nennt sie in der Kennung jedes Spieltags, S43_...) bekommt ihre Insel, sobald es sie gibt: zuerst die Karte von
 *     heute, wenn sie sich gegenueber der letzten Saison geaendert hat (fortnite-api.com braucht nach dem Start ein paar Tage), sonst das
 *     Patch-Bild "<N>.00" von fortnite.gg. Bis dahin bleibt es bei der Karte von heute; danach bekommen die Karten dieser Saison ohne Bild
 *     das neue von selbst.
 *
 * Was der Betreiber selbst zuordnet (Kartenseite, "BR:S<N>" oder eine Karte mit Bild), bleibt unangetastet.
 */

const ORDNER = path.join(DATEN_ORT, 'kartenbilder');
const VERZEICHNIS = path.join(ORDNER, 'karten.json');
const INSELN = path.join(DATEN_ORT, 'insel-bilder.json');
const TURNIERKARTEN = path.join(DATEN_ORT, 'turnier-karten.json');

interface Kartenbild { id: string; titel: string; datei: string; hochgeladen: number; groesse: number }
interface TurnierKarte { eventId?: string; windowId?: string; bildId?: string; bildTitel?: string; [k: string]: unknown }

async function liesJson<T>(p: string, leer: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(p, 'utf8')) as T; }
  catch (e) { if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return leer; throw e; }
}

async function lade(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(60_000) });
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  } catch { return null; }
}

/** Die Karte von heute ohne Ortsnamen (wie /bilder/karte-leer.png). */
async function karteVonHeute(): Promise<Buffer | null> {
  try {
    const j = await fetch('https://fortnite-api.com/v1/map', { cache: 'no-store', signal: AbortSignal.timeout(30_000) }).then((r) => r.json()) as { data?: { images?: { blank?: string } } };
    return j.data?.images?.blank ? await lade(j.data.images.blank) : null;
  } catch { return null; }
}

/** Das Patch-Bild "<N>.00" von fortnite.gg (lib/kartenUpdates), als PNG. */
async function patchBild(saison: number): Promise<Buffer | null> {
  for (const endung of ['webp', 'jpg', 'png']) {
    const roh = await lade(`https://fortnite.gg/img/maps/${saison}.00.${endung}`);
    if (!roh) continue;
    try {
      const sharp = (await import('sharp')).default;
      return await sharp(roh).png().toBuffer();
    } catch { return null; }
  }
  return null;
}

const pruef = (b: Buffer) => crypto.createHash('sha1').update(b).digest('hex');

/**
 * Ein Durchlauf (app/api/cron/karten-automatik, alle zehn Minuten). `fenster` sind alle Spieltage des Katalogs mit Kennung und Beginn.
 * Gibt die Zuordnung der Inseln zurueck (fuer die Kartenautomatik gleich danach) und was geschehen ist.
 */
export async function saisonKartenPflegen(fenster: Array<{ windowId: string; begin: number }>): Promise<{ inseln: Record<string, string>; log: string[] }> {
  const log: string[] = [];
  const inseln = await liesJson<Record<string, string>>(INSELN, {});
  const jetzt = Date.now();
  const saisons = new Map<number, number>();
  for (const f of fenster) {
    const n = saisonVon(f.windowId);
    if (n && Number.isFinite(f.begin)) saisons.set(n, Math.min(saisons.get(n) ?? Infinity, f.begin));
  }
  // Die laufende Saison: die juengste, von der schon ein Spieltag begonnen hat.
  const begonnen = [...saisons].filter(([, b]) => b <= jetzt).map(([n]) => n);
  if (!begonnen.length) return { inseln, log };
  const laufend = Math.max(...begonnen);
  const zugeordnet = Object.keys(inseln).map((k) => /^BR:S(\d+)$/.exec(k)).filter(Boolean).map((m) => Number(m![1]));

  let bild: Buffer | null = null;
  let titel = '';
  if (!inseln[brSchluessel(laufend)]) {
    const vorige = zugeordnet.filter((n) => n < laufend).sort((a, b) => b - a)[0];
    const heute = await karteVonHeute();
    if (vorige === undefined) {
      // Erster Lauf: die Karte von heute gehoert zur laufenden Saison.
      bild = heute; titel = `Battle Royale - S${laufend} (Stand ${new Date().toLocaleDateString('de-CH', { timeZone: 'Europe/Zurich' })})`;
    } else {
      const alt = await fs.readFile(path.join(ORDNER, `${inseln[brSchluessel(vorige)]}.png`)).catch(() => null) as Buffer | null;
      if (heute && (!alt || pruef(heute) !== pruef(alt))) { bild = heute; titel = `Battle Royale - S${laufend}`; }
      else {
        bild = await patchBild(laufend);
        if (bild) titel = `Battle Royale - S${laufend} (Update ${laufend}.00)`;
        else log.push(`S${laufend}: die neue Insel gibt es noch nirgends - bis dahin die Karte von heute`);
      }
    }
    if (bild) {
      const id = `battle-royale-s${laufend}`;
      await fs.mkdir(ORDNER, { recursive: true });
      await fs.writeFile(path.join(ORDNER, `${id}.png`), bild);
      const karten = await liesJson<Kartenbild[]>(VERZEICHNIS, []);
      const eintrag: Kartenbild = { id, titel, datei: `${id}.png`, hochgeladen: jetzt, groesse: bild.length };
      const i = karten.findIndex((k) => k.id === id);
      if (i >= 0) karten[i] = eintrag; else karten.push(eintrag);
      await fs.writeFile(VERZEICHNIS, JSON.stringify(karten, null, 2), 'utf8');
      inseln[brSchluessel(laufend)] = id;
      await fs.writeFile(INSELN, JSON.stringify(inseln, null, 2));
      log.push(`S${laufend}: Insel abgelegt (${titel})`);
    }
  }

  // Turnierkarten ohne Bild: die Insel ihrer Saison (ohne Saison in der Kennung, z. B. Global Championship: die laufende).
  if (ersatzSeit('turnier-karten.json') !== null) return { inseln, log };
  const karten = await liesJson<TurnierKarte[]>(TURNIERKARTEN, []);
  const titelVon = new Map((await liesJson<Kartenbild[]>(VERZEICHNIS, [])).map((k) => [k.id, k.titel]));
  let geaendert = 0;
  for (const k of karten) {
    if (k.bildId) continue;
    const n = saisonVon(k.windowId) ?? saisonVon(k.eventId) ?? laufend;
    const id = inseln[brSchluessel(n)];
    if (!id) continue;
    // Nur Bild und Titel - "geaendert" bleibt, damit die Kartenautomatik die Karte weiter als unberuehrt erkennt.
    k.bildId = id; k.bildTitel = titelVon.get(id) ?? 'Battle Royale';
    geaendert++;
  }
  if (geaendert) {
    await fs.writeFile(TURNIERKARTEN, JSON.stringify(karten, null, 2), 'utf8');
    log.push(`${geaendert} Turnierkarten ohne Bild haben die Insel ihrer Saison bekommen`);
  }
  return { inseln, log };
}
