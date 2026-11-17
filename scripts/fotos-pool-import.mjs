/*
 * Spielerfotos ohne Namen in den Foto-Pool legen (Betreiber, 17.11.2026): zuschneiden, pruefen, ablegen - zugeordnet wird danach auf der Seite
 * (/admin/fotos-pool, aus der Statistik unter Spieler -> "Fotos").
 *
 *   node scripts/fotos-pool-import.mjs <ordner> [Angaben] [--probe] [--vorschau <ordner>] [--ohne-gesicht] [--log <datei>]
 *
 * Je Bild im Ordner (auch in Unterordnern; .jpg .jpeg .png .webp .tif .avif .heic, soweit sharp sie lesen kann):
 *   1. gesperrt?    gleicher Inhalt wie ein entferntes altes Foto (lib/fotoGesperrt.json, lib/fotoSperre.mjs) -> uebersprungen
 *   2. doppelt?     dieselbe Datei schon im Pool oder in diesem Lauf (SHA-1) -> uebersprungen
 *   3. zuschneiden  scripts/fotos-pool-gesichter.py: je Person ein eigener Zuschnitt (4:5 wie scripts/foto-zuschneiden.py), auf dem kein anderes
 *                   Gesicht zu sehen ist; geht das nicht sauber, wird die Person uebersprungen (steht im Protokoll). Gesichter werden NUR gesucht,
 *                   um den Ausschnitt zu legen - nie erkannt oder verglichen.
 *   4. fast gleich? Wahrnehmungs-Hash (dHash) des Zuschnitts gegen den Pool und diesen Lauf -> uebersprungen
 *   5. ablegen      WebP, hoechstens 600 px hoch (wie das Hochladen), unzugeordnet in fotopool/ + foto-pool.json (lib/fotoPool.ts)
 * Eine eigene kleine Fassung gibt es nicht: hochgeladene Fotos (spielerfotos/) sind schon klein (480x600), lib/spielerbildKlein.ts liefert fuer
 * sie das Original auch in Listen.
 *
 * Angaben zum Foto (Quelle, Fotograf, X-Konto, Link, Lizenz) - je Lauf, je Ordner und je Foto, das Genauere gewinnt:
 *   --quelle "Epic Games" --fotograf "Michal Konkol" --handle KonkolMichal --link https://... --lizenz "Erlaubnis per Mail 17.11." [--bestaetigt]
 *   _credit.json in einem (Unter-)Ordner        { "fotograf": "Wojciech Wandzel", "handle": "wandzelphoto" } - gilt dort und darunter
 *   --angaben angaben.json                      { "<dateiname oder relativer Pfad>": { "fotograf": ..., "handle": ... }, ... }
 *
 *   --probe              nichts ablegen - nur zeigen, was geschaehe (mit --vorschau die Zuschnitte als Dateien ansehen)
 *   --vorschau <ordner>  jeden Zuschnitt zusaetzlich dort ablegen
 *   --ohne-gesicht       Fotos ohne erkanntes Gesicht trotzdem zuschneiden (Mitte, oben buendig) statt sie zu melden
 *   --log <datei>        Protokoll als JSON (Voreinstellung: <ordner>/_pool-import-<zeit>.json)
 *
 * Abgelegt wird in die Ablage der Seite (lib/ablage): mit DATEN_TOKEN (GitHub-Schluessel mit Zugriff auf comphubgg/comphub-daten, aus der
 * Umgebung oder .env.local) im Archiv - z. B. DATEN_TOKEN=$(gh auth token) node scripts/fotos-pool-import.mjs ~/fotos. Ohne ihn in den
 * lokalen Datenordner (dann sieht die Seite die Fotos nicht - das Skript warnt).
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createJiti } from 'jiti';
import sharp from 'sharp';

const PROJEKT = path.resolve(import.meta.dirname, '..');
for (const z of (() => { try { return fs.readFileSync(path.join(PROJEKT, '.env.local'), 'utf8').split('\n'); } catch { return []; } })()) {
  const m = z.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}

const args = process.argv.slice(2);
const MIT_WERT = new Set(['--quelle', '--fotograf', '--handle', '--link', '--lizenz', '--angaben', '--vorschau', '--log']);
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const hat = (n) => args.includes(n);
const ORDNER = args.find((a, i) => !a.startsWith('--') && !MIT_WERT.has(args[i - 1]));
if (!ORDNER || !fs.existsSync(ORDNER) || !fs.statSync(ORDNER).isDirectory()) {
  console.error('Aufruf: node scripts/fotos-pool-import.mjs <ordner> [--quelle ..] [--fotograf ..] [--handle ..] [--link ..] [--lizenz ..] [--bestaetigt]'
    + ' [--angaben angaben.json] [--probe] [--vorschau <ordner>] [--ohne-gesicht] [--log <datei>]');
  process.exit(2);
}
const PROBE = hat('--probe');
const VORSCHAU = arg('--vorschau');
const LOG = arg('--log') ?? path.join(ORDNER, `_pool-import-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);
const ENDUNG = /\.(jpe?g|png|webp|tiff?|avif|heic|heif)$/i;
const CREDIT_FELDER = ['quelle', 'fotograf', 'handle', 'link', 'lizenz', 'bestaetigt'];

const imArchiv = Boolean((process.env.DATEN_TOKEN || '').trim()) || ['github', 'supabase'].includes((process.env.COMPHUB_ABLAGE || '').toLowerCase());
if (!imArchiv) console.warn('ACHTUNG: kein DATEN_TOKEN - abgelegt wird im lokalen Datenordner, nicht im Archiv der Seite. Fuer die Seite: DATEN_TOKEN=$(gh auth token) ...');

const jiti = createJiti(import.meta.url, { alias: { '@': PROJEKT }, interopDefault: true });
const pool = await jiti.import(path.join(PROJEKT, 'lib/fotoPool.ts'));

/* ------------------------------------------------------------------ Angaben je Lauf, Ordner, Foto */

const nurCredit = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([k, v]) => CREDIT_FELDER.includes(k) && v !== undefined && v !== null && v !== ''));
const lauf = nurCredit({
  quelle: arg('--quelle'), fotograf: arg('--fotograf'), handle: arg('--handle'), link: arg('--link'), lizenz: arg('--lizenz'),
  ...(hat('--bestaetigt') ? { bestaetigt: true } : {}),
});
const jeFoto = (() => {
  const d = arg('--angaben');
  if (!d) return {};
  try { return JSON.parse(fs.readFileSync(d, 'utf8')); } catch (e) { console.error(`--angaben ${d}: ${e.message}`); process.exit(2); }
})();
function ordnerAngaben(datei) {
  // _credit.json vom Eingangsordner abwaerts bis zum Ordner des Fotos - tiefer gewinnt.
  const stufen = [];
  let d = path.dirname(datei);
  for (;;) {
    stufen.unshift(d);
    if (path.resolve(d) === path.resolve(ORDNER) || path.dirname(d) === d) break;
    d = path.dirname(d);
  }
  let aus = {};
  for (const s of stufen) {
    const f = path.join(s, '_credit.json');
    if (fs.existsSync(f)) { try { aus = { ...aus, ...nurCredit(JSON.parse(fs.readFileSync(f, 'utf8'))) }; } catch (e) { console.warn(`${f}: ${e.message}`); } }
  }
  return aus;
}
const angabenFuer = (datei) => {
  const rel = path.relative(ORDNER, datei).split(path.sep).join('/');
  return { ...lauf, ...ordnerAngaben(datei), ...nurCredit(jeFoto[rel] ?? jeFoto[path.basename(datei)]) };
};

/* ------------------------------------------------------------------ Dateien */

function alleBilder(d) {
  const aus = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) aus.push(...alleBilder(p));
    else if (ENDUNG.test(e.name)) aus.push(p);
  }
  return aus;
}

const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
function gesichterSuchen(dateien) {
  const r = spawnSync(PYTHON, [path.join(PROJEKT, 'scripts', 'fotos-pool-gesichter.py'), ...(hat('--ohne-gesicht') ? ['--ohne-gesicht'] : []), ...dateien],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`fotos-pool-gesichter.py: ${(r.stderr || r.error?.message || '').trim().slice(-800)}`);
  return JSON.parse(r.stdout);
}

/* ------------------------------------------------------------------ Lauf */

const dateien = alleBilder(ORDNER);
console.log(`${dateien.length} Bilder in ${ORDNER}${PROBE ? ' (Probe - nichts wird abgelegt)' : ''}`);
const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'pool-import-'));
if (VORSCHAU) await fsp.mkdir(VORSCHAU, { recursive: true });

const vorhanden = await pool.liesPool();
const bekannteSha = new Map(vorhanden.fotos.filter((f) => f.quelleSha1).map((f) => [f.quelleSha1, f.original || f.id]));
const bekanntePhash = vorhanden.fotos.filter((f) => f.quellePhash).map((f) => [f.quellePhash, (f.original || f.id).replace(/#\d+$/, '')]);
const gesehen = []; // Zuschnitte dieses Laufs (fuer die Probe und als Rueckhalt gegen den Zwischenspeicher)
const protokoll = [];
const summe = { dateien: dateien.length, aufgenommen: 0, personenUebersprungen: 0, doppelt: 0, gesperrt: 0, ohneZuschnitt: 0, fehler: 0 };

const STUECK = 16;
for (let i = 0; i < dateien.length; i += STUECK) {
  const teil = [];
  for (const datei of dateien.slice(i, i + STUECK)) {
    const rel = path.relative(ORDNER, datei).split(path.sep).join('/');
    const eintrag = { datei: rel, gesichter: null, aufgenommen: [], uebersprungen: [], doppelt: [] };
    protokoll.push(eintrag);
    try {
      const roh = await fsp.readFile(datei);
      const sha = createHash('sha1').update(roh).digest('hex');
      if (pool.istGesperrt(roh)) { eintrag.gesperrt = true; summe.gesperrt += 1; continue; }
      if (bekannteSha.has(sha)) { eintrag.doppelt.push({ art: 'gleiche Datei', wie: bekannteSha.get(sha) }); summe.doppelt += 1; continue; }
      bekannteSha.set(sha, rel);
      // Gedreht nach EXIF und als JPEG fuer die Gesichtersuche - die Kaesten gelten dann fuer genau dieses Bild.
      const norm = await sharp(roh).rotate().jpeg({ quality: 95 }).toBuffer();
      // Dasselbe Foto in anderer Groesse oder neu gespeichert: Wahrnehmungs-Hash des ganzen Bildes.
      const qph = await pool.wahrnehmungsHash(norm);
      const aehnlich = bekanntePhash.find(([h]) => pool.abstand(h, qph) <= pool.FAST_GLEICH_QUELLE);
      if (aehnlich) {
        eintrag.doppelt.push({ art: `fast gleiche Datei (Abstand ${pool.abstand(aehnlich[0], qph)}/64)`, wie: aehnlich[1] }); summe.doppelt += 1; continue;
      }
      bekanntePhash.push([qph, rel]);
      const tmpDatei = path.join(tmp, `${protokoll.length}.jpg`);
      await fsp.writeFile(tmpDatei, norm);
      teil.push({ datei, rel, sha, qph, norm, tmpDatei, eintrag });
    } catch (e) {
      eintrag.fehler = `nicht lesbar: ${e.message}`; summe.fehler += 1;
    }
  }
  if (!teil.length) continue;
  let funde;
  try { funde = gesichterSuchen(teil.map((t) => t.tmpDatei)); } catch (e) {
    for (const t of teil) { t.eintrag.fehler = e.message; summe.fehler += 1; }
    continue;
  }
  for (const [k, t] of teil.entries()) {
    const f = funde[k];
    const e = t.eintrag;
    if (f.fehler) { e.fehler = f.fehler; summe.fehler += 1; continue; }
    e.gesichter = f.gesichter;
    if (f.hintergrund) e.hintergrund = f.hintergrund;
    for (const u of f.uebersprungen) { e.uebersprungen.push(u); if (u.gesicht) summe.personenUebersprungen += 1; }
    const credit = angabenFuer(t.datei);
    if (Object.keys(credit).length) e.credit = credit;
    for (const [n, z] of f.zuschnitte.entries()) {
      const stueck = await sharp(t.norm).extract({ left: z.x, top: z.y, width: z.breite, height: z.hoehe }).jpeg({ quality: 95 }).toBuffer();
      const name = `${t.rel}#${n + 1}`;
      const r = await pool.inPoolAufnehmen(stueck, { original: name, quelleSha1: t.sha, quellePhash: t.qph, credit, probe: PROBE, schonGesehen: gesehen });
      if (r.ok) {
        gesehen.push(r.foto);
        e.aufgenommen.push({ id: r.foto.id, person: n + 1, ausschnitt: [z.x, z.y, z.breite, z.hoehe], ...(z.ohneGesicht ? { ohneGesicht: true } : {}) });
        summe.aufgenommen += 1;
        if (VORSCHAU) {
          await sharp(stueck).resize({ height: 600, withoutEnlargement: true }).webp({ quality: 88 })
            .toFile(path.join(VORSCHAU, `${t.rel.replace(/[/\\]/g, '__').replace(ENDUNG, '')}_${n + 1}.webp`));
        }
      } else if (r.grund === 'gesperrt') {
        e.uebersprungen.push({ person: n + 1, grund: 'gesperrtes altes Foto' }); summe.gesperrt += 1;
      } else if (r.grund === 'kein-bild') {
        e.uebersprungen.push({ person: n + 1, grund: 'Zuschnitt nicht lesbar' }); summe.fehler += 1;
      } else {
        e.doppelt.push({ person: n + 1, art: r.grund === 'doppelt' ? 'gleicher Zuschnitt' : `fast gleich (Abstand ${r.abstand}/64)`, wie: r.wie });
        summe.doppelt += 1;
      }
    }
    if (!e.aufgenommen.length) summe.ohneZuschnitt += 1;
  }
}
await fsp.rm(tmp, { recursive: true, force: true });

/* ------------------------------------------------------------------ Protokoll */

for (const e of protokoll) {
  const teile = [];
  if (e.fehler) teile.push(`FEHLER ${e.fehler}`);
  if (e.gesperrt) teile.push('gesperrt (altes, entferntes Foto)');
  if (e.gesichter !== null) teile.push(`${e.gesichter} Gesicht${e.gesichter === 1 ? '' : 'er'}${e.hintergrund ? ` (${e.hintergrund} im Hintergrund)` : ''}`);
  teile.push(`${e.aufgenommen.length} Zuschnitt${e.aufgenommen.length === 1 ? '' : 'e'}${PROBE ? ' (Probe)' : ''}`);
  if (e.uebersprungen.length > 3) {
    // Gruppenfotos: nach Grund zusammengefasst (einzeln im JSON-Protokoll).
    const je = new Map();
    for (const u of e.uebersprungen) je.set(u.grund.replace(/ \(\d+x\d+ Pixel\)/, ''), (je.get(u.grund.replace(/ \(\d+x\d+ Pixel\)/, '')) ?? 0) + 1);
    for (const [g, n] of je) teile.push(`uebersprungen ${n}x: ${g}`);
  } else {
    for (const u of e.uebersprungen) teile.push(`uebersprungen${u.person ? ` #${u.person}` : u.gesicht ? ` Person bei ${u.gesicht[0]},${u.gesicht[1]}` : ''}: ${u.grund}`);
  }
  for (const d of e.doppelt) teile.push(`doppelt${d.person ? ` #${d.person}` : ''}: ${d.art} wie ${d.wie}`);
  console.log(`  ${e.datei}: ${teile.join(' | ')}`);
}
console.log(`\nAufgenommen: ${summe.aufgenommen} | Personen uebersprungen: ${summe.personenUebersprungen} | doppelt: ${summe.doppelt}`
  + ` | gesperrt: ${summe.gesperrt} | Dateien ohne Zuschnitt: ${summe.ohneZuschnitt} | Fehler: ${summe.fehler}`);
await fsp.writeFile(LOG, JSON.stringify({ lauf: new Date().toISOString(), ordner: path.resolve(ORDNER), probe: PROBE, archiv: imArchiv, summe, dateien: protokoll }, null, 1));
console.log(`Protokoll: ${LOG}`);
if (!PROBE && summe.aufgenommen) console.log('Zuordnen: https://thecomphub.com/admin/fotos-pool');
process.exit(0);
