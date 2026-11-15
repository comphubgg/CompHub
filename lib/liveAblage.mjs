/*
 * Gemeinsames fuer die Live-Spur auf dem Server (scripts/live-spur.mjs) und ihren Abgleich (scripts/live-abgleich.mjs), 14.11.2026:
 *   - die massgeblichen Dateien vom Release lesen (clutch/<w>.json, clutch-je/<w>.json, clutch-roh/<w>.json) - nur lesen, nie schreiben;
 *   - die Teile je Match unter COMPHUB_LIVE_ORT (teil/<w>/<id>.json, schon im Release enthaltene gepackt unter archiv/<w>/<id>.json.gz);
 *   - Dateien so schreiben, dass ein Leser nie eine halbe sieht (erst .tmp, dann umbenennen);
 *   - Teile mit dem unveraenderten clutch-zusammen.mjs (und den Folgeschritten) auf eine Grundlage zusammenfuehren (zusammenfuehren).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { tagFuer } from './releaseTags.mjs';

const REPO = process.env.GITHUB_REPOSITORY || 'comphubgg/CompHub';
export const LIVE_ORT = process.env.COMPHUB_LIVE_ORT || '/app/live';

// Dieselben Namen und dieselbe Pruefsumme wie scripts/ablage-github.mjs / ablage-github-holen.mjs.
const anhangName = (name) => name.replace(/\//g, '__').replace(/=/g, '-eq-');
const pruefsumme = (daten) => createHash('sha256').update(daten).digest('hex').slice(0, 24);

async function holen(tag, anhang) {
  const r = await fetch(`https://github.com/${REPO}/releases/download/${tag}/${encodeURIComponent(anhang)}`, {
    redirect: 'follow', signal: AbortSignal.timeout(120_000), headers: { 'User-Agent': 'comphub-live' },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${anhang}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Das Verzeichnis eines Releases, hoechstens eine Minute alt - damit eine unveraenderte Datei nicht jede Minute neu geladen wird. */
const manifeste = new Map();
async function manifestVon(tag) {
  const da = manifeste.get(tag);
  if (da && Date.now() - da.zeit < 60_000) return da.m;
  let m = null;
  try { m = JSON.parse((await holen(tag, 'manifest.json'))?.toString('utf8') || '{}'); } catch { /* dann direkt */ }
  manifeste.set(tag, { zeit: Date.now(), m });
  return m;
}

/*
 * Eine Datei vom Release: der Inhalt (Buffer) oder null, wenn es sie nicht gibt; nicht lesbar -> Ausnahme (dann lieber diesmal nichts bauen als mit einer
 * falschen Grundlage). Mit zwischen: Ordner, in dem die zuletzt geholte Fassung samt Pruefsumme liegt - geladen wird nur, wenn das Verzeichnis eine andere nennt.
 * Fehlt die Datei im Verzeichnis, wird trotzdem direkt gefragt (das Verzeichnis kann hinterherhinken).
 */
export async function releaseDatei(name, zwischen = null) {
  // Zum Pruefen ohne GitHub: COMPHUB_RELEASE_LOKAL=<Ordner> liest <Ordner>/<name> statt des Release (fehlt die Datei -> null).
  if (process.env.COMPHUB_RELEASE_LOKAL) { const p = path.join(process.env.COMPHUB_RELEASE_LOKAL, name); return fs.existsSync(p) ? fs.readFileSync(p) : null; }
  const tag = tagFuer(name);
  const anhang = anhangName(name);
  const m = await manifestVon(tag);
  const summe = m?.[anhang]?.summe ?? null;
  const ablage = zwischen ? path.join(zwischen, anhang) : null;
  if (ablage && summe && fs.existsSync(ablage)) {
    const inhalt = fs.readFileSync(ablage);
    if (pruefsumme(inhalt) === summe) return inhalt;
  }
  let inhalt = null;
  for (let v = 0; v < 3; v += 1) {
    /*
     * Fehlt die Datei, kann das Release gerade ersetzen: scripts/ablage-github.mjs legt die neue Fassung als "<name>.neu" daneben, loescht die alte und
     * benennt um - dazwischen gibt es nur die .neu (15.11.2026 im Probe-Ablauf gesehen: clutch/S43_FNCSSoloReload_HeatsStage_Heat1_EU.json kurz 404).
     */
    try { inhalt = (await holen(tag, anhang)) ?? (await holen(tag, `${anhang}.neu`)); break; } catch (e) {
      if (v === 2) throw e;
      await new Promise((ok) => setTimeout(ok, 3000));
    }
  }
  if (ablage && inhalt) { fs.mkdirSync(zwischen, { recursive: true }); schreibeAtomar(ablage, inhalt); }
  return inhalt;
}

export function schreibeAtomar(datei, inhalt) {
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  const tmp = `${datei}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, inhalt);
  fs.renameSync(tmp, datei);
}

export const teilOrdner = (ort, w) => path.join(ort, 'teil', w);
export const archivOrdner = (ort, w) => path.join(ort, 'archiv', w);

/** Die Match-Ids, zu denen ein Teil liegt (offen und schon archiviert). */
export function teilIds(ort, w) {
  const ids = new Map();
  for (const [ordner, endung, art] of [[teilOrdner(ort, w), '.json', 'teil'], [archivOrdner(ort, w), '.json.gz', 'archiv']]) {
    for (const f of fs.existsSync(ordner) ? fs.readdirSync(ordner) : []) if (f.endsWith(endung)) ids.set(f.slice(0, -endung.length), art);
  }
  return ids;
}

/** Ein Teil lesen (offen oder archiviert) - null, wenn es fehlt oder kaputt ist. */
export function liesTeil(ort, w, id) {
  try {
    const offen = path.join(teilOrdner(ort, w), `${id}.json`);
    if (fs.existsSync(offen)) return JSON.parse(fs.readFileSync(offen, 'utf8'));
    return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(archivOrdner(ort, w), `${id}.json.gz`))).toString('utf8'));
  } catch { return null; }
}

/** Ein Teil, das schon im Release steht, gepackt beiseite legen: fuer den Live-Stand zaehlt es nicht mehr, der Abgleich (live-abgleich.mjs) braucht es noch. */
export function archiviere(ort, w, id) {
  const offen = path.join(teilOrdner(ort, w), `${id}.json`);
  if (!fs.existsSync(offen)) return;
  schreibeAtomar(path.join(archivOrdner(ort, w), `${id}.json.gz`), zlib.gzipSync(fs.readFileSync(offen)));
  fs.rmSync(offen, { force: true });
}

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const lauf = (skript, cwd) => new Promise((ok) => {
  execFile(process.execPath, [path.join(WURZEL, 'scripts', skript)], { cwd, timeout: 10 * 60_000, maxBuffer: 64 * 1024 * 1024, env: process.env },
    (fehler, aus, err) => ok({ ok: !fehler, text: `${aus ?? ''}${err ?? ''}`.trim().split('\n').slice(-3).join(' | ') }));
});

/*
 * Teile auf eine Grundlage zusammenfuehren - genau wie der Schritt "ablegen" (clutch-ablegen.yml): unveraendertes scripts/clutch-zusammen.mjs in einem
 * eigenen Arbeitsordner, danach (folge) clutch-neu-rechnen.mjs und clutch-leben.mjs. Gemeinsam fuer den Live-Stand (live-spur.mjs: Grundlage = Release)
 * und den Abgleich (live-abgleich.mjs: Grundlage leer, oder ein Zwischenstand).
 *
 *   basis     clutch/<w>.json als Objekt oder null (leer anfangen)
 *   basisJe   clutch-je/<w>.json als Buffer oder null
 *   basisRoh  clutch-roh/<w>.json als Buffer oder null
 *   teile     Teilstaende (Objekte, Format data/clutch-teil)
 *   wieGithub Grundlage unveraendert lassen (sonst gilt eine Fassung 3 aus clutch-zusammen als 4, siehe unten)
 * Ergebnis: { d, je, roh, text } - d null, wenn clutch-zusammen scheiterte.
 */
export async function zusammenfuehren({ w, basis = null, basisJe = null, basisRoh = null, teile, folge = true, wieGithub = false, log = () => {} }) {
  const arbeit = fs.mkdtempSync(path.join(os.tmpdir(), 'live-bau-'));
  try {
    const daten = path.join(arbeit, 'data');
    if (basis) {
      /*
       * clutch-neu-rechnen.mjs schreibt "version: 3" in jede Datei, die es anfasst - auch in eine, die clutch-zusammen.mjs gerade als Fassung 4 geschrieben
       * hat (am Release so gesehen, 14.11.2026: S42_ReloadSoloVictoryCup_Event5_Round2_ASIA, version 3, schadenFassung 17). clutch-zusammen.mjs faengt bei
       * einer Fassung unter 4 leer an. Auf GitHub ist das folgenlos (der Plan liest einen Spieltag mit Fassung 3 dann ganz neu, clutch-berechnen.mjs "gilt"),
       * hier wuerden Schaden, Spiele, Strecke und die Werte je Match des Release verloren gehen. Deshalb gilt die Kopie als Fassung 4, wenn sie erkennbar
       * aus clutch-zusammen stammt (schadenFassung gesetzt). Das Release selbst bleibt, wie es ist.
       */
      // wieGithub (live-abgleich.mjs, Probe C): die Grundlage genau so, wie der Schritt "ablegen" sie vom Release holt.
      const b = !wieGithub && (basis.version ?? 0) < 4 && basis.schadenFassung != null ? { ...basis, version: 4 } : basis;
      schreibeAtomar(path.join(daten, 'clutch', `${w}.json`), JSON.stringify(b));
      if (basisJe) schreibeAtomar(path.join(daten, 'clutch-je', `${w}.json`), basisJe);
      if (basisRoh) schreibeAtomar(path.join(daten, 'clutch-roh', `${w}.json`), basisRoh);
    }
    // Je Match ein Teil, benannt wie die Teile der Rechner (<w>__<n>.json) - so findet clutch-zusammen.mjs sie.
    fs.mkdirSync(path.join(daten, 'clutch-teil'), { recursive: true });
    teile.forEach((t, i) => fs.writeFileSync(path.join(daten, 'clutch-teil', `${w}__${i}.json`), JSON.stringify(t)));
    const z = await lauf('clutch-zusammen.mjs', arbeit);
    if (!z.ok) return { d: null, je: null, roh: null, text: `clutch-zusammen scheiterte - ${z.text}` };
    if (folge) {
      // Wie im Ablauf: continue-on-error.
      for (const s of ['clutch-neu-rechnen.mjs', 'clutch-leben.mjs']) { const r = await lauf(s, arbeit); if (!r.ok) log(`${w}: ${s} scheiterte (weiter wie im Ablauf) - ${r.text}`); }
    }
    const lies = (p) => (fs.existsSync(p) ? fs.readFileSync(p) : null);
    const dBuf = lies(path.join(daten, 'clutch', `${w}.json`));
    return {
      d: dBuf ? JSON.parse(dBuf.toString('utf8')) : null,
      je: lies(path.join(daten, 'clutch-je', `${w}.json`)),
      roh: lies(path.join(daten, 'clutch-roh', `${w}.json`)),
      text: z.text,
    };
  } finally { fs.rmSync(arbeit, { recursive: true, force: true }); }
}
