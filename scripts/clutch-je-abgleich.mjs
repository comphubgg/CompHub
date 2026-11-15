// Die Werte je Match (clutch-je/<Fenster>.json) und ihre Lage in clutch/<Fenster>.json wieder in Einklang bringen (15.11.2026).
//
// Bis zum 15.11.2026 lud "Clutch ablegen" (.github/workflows/clutch-ablegen.yml) nur clutch/ und clutch-roh/ hoch, nicht clutch-je/: --nur clutch trifft
// in scripts/ablage-github.mjs nur "clutch" und "clutch/...", nicht "clutch-je/...". Die Spieltags-Datei bekam damit die Lage der Stuecke (je.lage, je.bytes)
// einer Datei, die nie am Release ankam. Der naechste Lauf holte die alte Datei vom Release, haengte seine Zeilen an und schrieb wieder eine neue Lage -
// die Zeilen des vorigen Laufs waren weg. Am 15.11.2026 passte bei 170 von 271 Spieltagen der letzten 31 Tage die Lage nicht zur Datei am Release
// (S43_TriosCashCup_Event2_EU hatte zeitweise gar keine): die Kurven je Match in den Player Stats lasen dort Byte-Bereiche mitten aus einem anderen Stueck.
//
// Dieses Skript laeuft in beiden Ablage-Schritten vor dem Hochladen. Fuer jede Spieltags-Datei mit "je", deren Werte-je-Match-Datei nicht gerade hier
// geschrieben wurde (data/clutch-je/<w>.json), vergleicht es die Groesse am Release (der Anhang selbst, HEAD) mit je.bytes. Passt sie nicht - oder ist die Datei noch nie
// geprueft worden (jeGeprueft) -, wird die Datei vom Release geholt, die Lage aus ihr neu bestimmt und gezaehlt, wie viele gelesene Matches dort keine
// einzige Zeile haben (jeFehlt). Fehlt die Datei am Release ganz, faellt "je" weg (der naechste Lauf faengt die Werte je Match neu an).
// Spieltage mit jeFehlt liest der Planer neu (scripts/clutch-berechnen.mjs, Regel "jeFehlt").
//
//   node scripts/clutch-je-abgleich.mjs            pruefen und reparieren (schreibt data/clutch/<w>.json)
//   node scripts/clutch-je-abgleich.mjs --nur-zeigen

import fs from 'node:fs';
import path from 'node:path';
import { STUECKE, jeFehltVon, jeLesen } from '../lib/jeSpiel.mjs';
import { tagFuer } from '../lib/releaseTags.mjs';

const DATEN = path.join(process.cwd(), 'data');
const ZIEL = path.join(DATEN, 'clutch');
const REPO = process.env.GITHUB_REPOSITORY || 'comphubgg/CompHub';
const nurZeigen = process.argv.includes('--nur-zeigen');
// Waehrend der FNCS-Heat vom 15.11.2026 (17:30-21:30 UTC) nicht: jede reparierte Spieltags-Datei wird hochgeladen, und die Ablage soll dann nur die Heat bringen.
if (Date.now() > Date.UTC(2026, 10, 15, 17, 0) && Date.now() < Date.UTC(2026, 10, 15, 22, 30)) { console.log('Werte je Match: waehrend der Heat ausgesetzt'); process.exit(0); }

async function holen(tag, anhang) {
  for (let v = 0; v < 3; v += 1) {
    try {
      const r = await fetch(`https://github.com/${REPO}/releases/download/${tag}/${encodeURIComponent(anhang)}`, { redirect: 'follow', signal: AbortSignal.timeout(180_000) });
      if (r.status === 404) return null;
      if (r.ok) return Buffer.from(await r.arrayBuffer());
    } catch { /* noch einmal */ }
    await new Promise((ok) => setTimeout(ok, 3000 * (v + 1)));
  }
  throw new Error(`${anhang} nicht lesbar`);
}

/*
 * Die Groesse der Datei am Release - aus dem Anhang selbst (HEAD), nicht aus manifest.json: das Manifest von daten-clutch-je-s43 nannte am 15.11.2026 fuer
 * S43_TriosCashCup_Event2_ME 2.439.631 Bytes, der Anhang hatte 3.502.836. null = es gibt ihn nicht (dreimal 404), undefined = nicht feststellbar.
 */
async function groesseAmRelease(name) {
  const url = `https://github.com/${REPO}/releases/download/${tagFuer(name)}/${encodeURIComponent(name.replace(/\//g, '__'))}`;
  let fehlt = 0;
  for (let v = 0; v < 3; v += 1) {
    try {
      const r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(60_000) });
      if (r.status === 404) fehlt += 1;
      else if (r.ok && r.headers.get('content-length')) return Number(r.headers.get('content-length'));
    } catch { /* noch einmal */ }
    await new Promise((ok) => setTimeout(ok, 2000 * (v + 1)));
  }
  return fehlt === 3 ? null : undefined;
}

/** Die Lage der Stuecke [Anfang, Laenge] aus der Datei selbst: eine Zeile je Stueck (lib/jeSpiel.mjs, jeDatei). */
function lageAus(buf) {
  const lage = []; let pos = 0;
  while (pos < buf.length) {
    let ende = buf.indexOf(0x0a, pos);
    if (ende < 0) ende = buf.length;
    lage.push([pos, ende - pos]);
    pos = ende + 1;
  }
  return lage;
}

// Neueste Saison zuerst (S43 vor S42).
const dateien = (fs.existsSync(ZIEL) ? fs.readdirSync(ZIEL).filter((f) => f.endsWith('.json') && !f.startsWith('_')) : []).sort().reverse();
// Je Lauf hoechstens so viele holen und neu schreiben (jede geaenderte Spieltags-Datei wird danach hochgeladen) - der Rest kommt im naechsten Lauf.
const HOECHSTENS = Number(process.argv[process.argv.indexOf('--hoechstens') + 1]) || 60;
/*
 * Und hoechstens so viele Minuten (15.11.2026): mit 60 Dateien brauchte der Schritt im Abschluss 8,5 Minuten, das Hochladen danach lief in die Zeitgrenze
 * des Jobs (40 Minuten), und der ganze Abschluss wurde abgebrochen.
 */
const MINUTEN = Number(process.argv[process.argv.indexOf('--minuten') + 1]) || 3;
let geprueft = 0; let repariert = 0; let ohneDatei = 0; let ok = 0; let mitLuecke = 0; let aufgeschoben = 0;
// Erst alle Kandidaten (Text, ohne ganzes Einlesen) und ihre Groesse am Release - die Anfragen zu acht zugleich.
const kandidaten = [];
for (const f of dateien) {
  const w = f.replace(/\.json$/, '');
  // Gerade hier geschrieben (scripts/clutch-zusammen.mjs): Lage und Datei kommen aus demselben Lauf, jeFehlt hat zusammen schon gezaehlt.
  if (fs.existsSync(path.join(DATEN, 'clutch-je', f))) continue;
  // Die Dateien grosser Cups haben 60 MB, der Ordner zusammen Gigabytes: "je" mit seiner Groesse und jeGeprueft stehen als Text darin (auch eingerueckt, clutch-neu-rechnen).
  const text = fs.readFileSync(path.join(ZIEL, f), 'latin1');
  let an = -1;
  for (const m of text.matchAll(/"je":\s*\{\s*"spalten"/g)) an = m.index;
  if (an < 0) continue;
  kandidaten.push({ f, w, bytesText: Number(/"bytes":\s*(\d+)/.exec(text.slice(an, an + 40000))?.[1]), gepruefText: Number(/"jeGeprueft":\s*(\d+)/.exec(text)?.[1]) });
}
{
  let i = 0;
  await Promise.all(Array.from({ length: 8 }, async () => { while (i < kandidaten.length) { const k = kandidaten[i++]; k.groesse = await groesseAmRelease(`clutch-je/${k.w}.json`); } }));
}
// Die Minuten gelten fuer das Holen und Neuschreiben (das Durchsehen oben dauert bei 900 Dateien rund eine Minute).
const schluss = Date.now() + MINUTEN * 60_000;
for (const { f, w, bytesText, gepruefText, groesse } of kandidaten) {
  const datei = path.join(ZIEL, f);
  const name = `clutch-je/${w}.json`;
  if (groesse === undefined) { console.log(`  ${w}: Groesse am Release nicht feststellbar - diesmal nicht geprueft`); continue; }
  if (groesse === bytesText && gepruefText === bytesText) { ok += 1; continue; }
  if (geprueft >= HOECHSTENS || Date.now() > schluss) { aufgeschoben += 1; continue; }
  let d;
  try { d = JSON.parse(fs.readFileSync(datei, 'utf8')); } catch { continue; }
  if (!d?.je) continue;
  geprueft += 1;
  const buf = groesse === null ? null : await holen(tagFuer(name), name.replace(/\//g, '__')).catch((e) => { console.log(`  ${w}: ${e.message}`); return undefined; });
  if (buf === undefined) continue;
  const vorher = `Lage fuer ${d.je.bytes} Bytes, am Release ${groesse ?? 'keine Datei'}`;
  if (!buf) {
    ohneDatei += 1;
    d.jeFehlt = (d.matches ?? []).length;
    delete d.je; delete d.jeGeprueft;
    console.log(`  ${w}: ${vorher} - "je" entfernt, ${d.jeFehlt} Matches ohne Werte je Match`);
  } else {
    const lage = lageAus(buf);
    if (lage.length !== STUECKE) { console.log(`  ${w}: ${vorher} - ${lage.length} statt ${STUECKE} Stuecke, nicht angefasst`); continue; }
    const passt = buf.length === d.je.bytes && lage.every(([a, l], i) => a === d.je.lage[i]?.[0] && l === d.je.lage[i]?.[1]);
    d.je = { spalten: d.je.spalten, lage, bytes: buf.length };
    d.jeGeprueft = buf.length;
    d.jeFehlt = jeFehltVon(d, jeLesen(buf));
    if (!passt) repariert += 1;
    console.log(`  ${w}: ${vorher} - ${passt ? 'Lage stimmte' : 'Lage neu'}, ${d.jeFehlt} von ${(d.matches ?? []).length} Matches ohne Zeilen`);
  }
  if (d.jeFehlt) mitLuecke += 1; else delete d.jeFehlt;
  if (!nurZeigen) fs.writeFileSync(datei, JSON.stringify(d));
}
console.log(`Werte je Match: ${ok} stimmten, ${geprueft} geprueft (${aufgeschoben} auf den naechsten Lauf verschoben), davon ${repariert} Lage neu, ${ohneDatei} ohne Datei am Release; ${mitLuecke} mit fehlenden Matches${nurZeigen ? ' (nur gezeigt)' : ''}.`);
