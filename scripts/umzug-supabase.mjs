/*
 * Die Daten von der Platte nach Supabase bringen.
 *
 * Der Betreiber hat eine Bedingung gestellt, die ueber allem steht: "dass Du
 * nix verlierst". Danach ist dieses Skript gebaut.
 *
 *   - Es liest nur von der Platte und schreibt nur nach Supabase. Auf der
 *     Platte wird nichts geloescht, nichts verschoben, nichts umbenannt. Geht
 *     etwas schief, ist der alte Stand unberuehrt da.
 *   - Jede Datei wird nach dem Schreiben zurueckgelesen und verglichen. Nicht
 *     "die Antwort war 200", sondern: steht dort wirklich dasselbe drin.
 *   - Am Ende steht eine Bilanz - wie viele Dateien, wie viele Bytes, wie
 *     viele geprueft, wie viele abweichend. Eine Zahl, die man nachrechnen
 *     kann, statt eines "fertig".
 *
 * Aufruf:
 *   node scripts/umzug-supabase.mjs --probe     nur zeigen, was geschehen wuerde
 *   node scripts/umzug-supabase.mjs             wirklich uebertragen
 *   node scripts/umzug-supabase.mjs --nur konten.json,tierlists.json
 *   node scripts/umzug-supabase.mjs --ohne replays,epic-spieltage
 *   node scripts/umzug-supabase.mjs --herunterladen --nur szene-stats
 *   node scripts/umzug-supabase.mjs --neuer-als 180
 *
 * Die Gegenrichtung, "--herunterladen", holt den Stand aus Supabase auf die
 * Platte. Gebraucht wird sie dort, wo die Nachtlaeufe kuenftig laufen: eine
 * GitHub-Aktion faengt mit einem leeren Ordner an. Ohne den vorherigen Stand
 * wuerde sie jedes Mal alles neu holen, statt nur das Neue.
 *
 * Ohne Angabe werden die kleinen Staende uebertragen - das sind die, die sich
 * nicht wiederherstellen lassen. Die grossen Zwischenspeicher (Replays,
 * Epic-Spieltage, Szene-Stats) holt sich das Werkzeug notfalls neu; sie
 * kosten Zeit, aber keine Daten, und muessen deshalb nicht im selben Zug mit.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/* --------------------------------------------------------- Einstellungen */

const PROJEKT = path.resolve(import.meta.dirname, '..');
const DATEN = path.join(PROJEKT, 'data');
const EIMER = 'comphub';
const TABELLE = 'ablage';

/** Diese Ordner gehen in den Objektspeicher - muss zu lib/ablageSupabase.ts passen. */
const IM_OBJEKTSPEICHER = [
  'replays/', 'kartenbilder/', 'kontakt-bilder/', 'admin-maps/',
  'epic-spieltage/', 'szene-stats/', 'szene-quelle/',
  'tournament-leaderboards/', '_sicherung/',
];

/**
 * Was ohne besondere Angabe nicht mitkommt.
 *
 * Alles davon ist berechnet und laesst sich neu holen. Zusammen sind es gut
 * siebenhundert Megabyte - das kostenlose Kontingent von Supabase liegt bei
 * einem Gigabyte, und es waere schade, es mit Zwischenspeichern zu fuellen,
 * bevor die eigentlichen Daten drin sind.
 */
const STANDARDMAESSIG_OHNE = [
  'replays', 'epic-spieltage', 'szene-stats', 'szene-quelle',
  'tournament-leaderboards', '_sicherung',
];

/* -------------------------------------------------------------- Umgebung */

function umgebungLesen() {
  const datei = path.join(PROJEKT, '.env.local');
  const raus = {};
  if (!fs.existsSync(datei)) return raus;
  for (const zeile of fs.readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^([A-Z_]+)=(.*)$/);
    if (m) raus[m[1]] = m[2].trim();
  }
  return raus;
}

const U = { ...umgebungLesen(), ...process.env };
const URL_ = (U.SUPABASE_URL || U.STORAGE_URL || '').replace(/\/+$/, '');
const KEY = U.SUPABASE_SERVICE_ROLE_KEY || U.STORAGE_SERVICE_ROLE_KEY || '';
const KOPF = { apikey: KEY, Authorization: `Bearer ${KEY}` };

/* ------------------------------------------------------------ Argumente */

const argumente = process.argv.slice(2);
const probe = argumente.includes('--probe');
const herunter = argumente.includes('--herunterladen');

function wert(name) {
  const i = argumente.indexOf(name);
  return i >= 0 ? (argumente[i + 1] || '') : '';
}

/*
 * Nur was sich zuletzt geaendert hat.
 *
 * Fuer die stuendliche Erneuerung: die Skripte schreiben je Lauf eine Handvoll
 * Dateien neu, alles andere liegt unveraendert da. Jedes Mal hundertvierzig
 * Megabyte hochzuladen waere nicht nur langsam - es wuerde das kostenlose
 * Kontingent von Supabase in wenigen Tagen aufbrauchen.
 */
const neuerAls = Number(wert('--neuer-als') || 0);

const nur = wert('--nur').split(',').map((s) => s.trim()).filter(Boolean);
const ohne = (wert('--ohne') || STANDARDMAESSIG_OHNE.join(','))
  .split(',').map((s) => s.trim()).filter(Boolean);

/* ------------------------------------------------------------- Sammeln */

/** Alle Dateien unterhalb von data, als Namen mit Schraegstrichen. */
function sammle(ordner = '', raus = []) {
  const voll = path.join(DATEN, ordner);
  let eintraege;
  try {
    eintraege = fs.readdirSync(voll, { withFileTypes: true });
  } catch {
    return raus;
  }
  for (const e of eintraege) {
    const name = ordner ? `${ordner}/${e.name}` : e.name;
    if (e.isDirectory()) {
      sammle(name, raus);
    } else if (e.isFile()) {
      raus.push(name);
    }
  }
  return raus;
}

function gewuenscht(name) {
  if (name.startsWith('.')) return false;               // .umgezogen und Aehnliches
  if (name.endsWith('.neu')) return false;              // halbfertige Schreibvorgaenge
  /*
   * Von den Replays kommt nur das Ausgewertete mit.
   *
   * Die rohen Runden sind Gigabytes, Epic loescht sie nach einunddreissig
   * Tagen, und die Seite liest sie nie - sie liest das Aggregat und den
   * Zustand. Diese Regel steht hier und nicht im Aufruf, damit niemand sie
   * versehentlich weglassen kann: ein Lauf, der die rohen Replays hochlaedt,
   * fuellt das kostenlose Kontingent in einem Zug.
   */
  if (name.startsWith('replays/')
      && !name.endsWith('_aggregat.json')
      && !name.endsWith('_zustand.json')) return false;
  if (nur.length) return nur.some((n) => name === n || name.startsWith(`${n}/`));
  return !ohne.some((o) => name === o || name.startsWith(`${o}/`));
}

/** Wurde die Datei in den letzten Minuten angefasst? Ohne Angabe: immer ja. */
function frischGenug(name) {
  if (!neuerAls) return true;
  try {
    const alter = Date.now() - fs.statSync(path.join(DATEN, name)).mtimeMs;
    return alter <= neuerAls * 60_000;
  } catch {
    return false;
  }
}

function alsObjekt(name) {
  return IM_OBJEKTSPEICHER.some((p) => name.startsWith(p));
}

/* ---------------------------------------------------------- Uebertragen */

/**
 * Schreibt und sagt zurueck, wo es gelandet ist.
 *
 * Das ist noetig, weil nicht jede Datei ausserhalb der Bilderordner auch
 * wirklich JSON ist - "bekannte-ohne-foto.txt" etwa ist eine Liste von
 * Zeilen. Sie kann nicht in eine jsonb-Spalte, also geht sie in den
 * Objektspeicher. Wer danach prueft, muss am selben Ort nachsehen, sonst
 * meldet die Pruefung einen Verlust, den es nicht gibt.
 */
async function schreibTabelle(name, roh) {
  const text = roh.toString('utf8');
  try {
    // Nur pruefen, ob es ueberhaupt JSON ist - abgelegt wird der Text selbst.
    JSON.parse(text);
  } catch {
    await schreibObjekt(name, roh);
    return 'objekt';
  }
  const r = await fetch(`${URL_}/rest/v1/${TABELLE}`, {
    method: 'POST',
    headers: {
      ...KOPF,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ name, wert: text }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return 'tabelle';
}

async function schreibObjekt(name, roh) {
  const r = await fetch(`${URL_}/storage/v1/object/${EIMER}/${name}`, {
    method: 'POST',
    headers: {
      ...KOPF,
      'Content-Type': name.endsWith('.json')
        ? 'application/json' : 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: new Uint8Array(roh),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
}

/** Zurueckholen und vergleichen. Das ist der eigentliche Beweis. */
async function pruefe(name, roh, wo) {
  if (wo === 'objekt') {
    const r = await fetch(`${URL_}/storage/v1/object/${EIMER}/${name}`,
      { headers: KOPF });
    if (!r.ok) return `nicht lesbar (${r.status})`;
    const zurueck = Buffer.from(await r.arrayBuffer());
    return zurueck.equals(roh) ? null : `Groesse ${zurueck.length} statt ${roh.length}`;
  }
  const r = await fetch(
    `${URL_}/rest/v1/${TABELLE}?name=eq.${encodeURIComponent(name)}&select=wert`,
    { headers: KOPF });
  if (!r.ok) return `nicht lesbar (${r.status})`;
  const zeilen = await r.json();
  if (!zeilen.length) return 'nicht angekommen';
  /*
   * Zeichen fuer Zeichen verglichen.
   *
   * Frueher musste hier normalisiert werden, weil die Spalte jsonb war und
   * Postgres die Schluessel umsortierte. Seit dort Text steht, ist der
   * strenge Vergleich moeglich - und der ist der einzige, der wirklich
   * belegt, dass nichts verlorengegangen ist.
   */
  return zeilen[0].wert === roh.toString('utf8') ? null : 'Inhalt weicht ab';
}

/* ---------------------------------------------------------------- Lauf */

/* ------------------------------------------------------- Gegenrichtung */

/** Alle Namen in der Tabelle, seitenweise geholt. */
async function tabellenNamen() {
  const raus = [];
  const PRO_SEITE = 1000;
  for (let von = 0; ; von += PRO_SEITE) {
    const r = await fetch(`${URL_}/rest/v1/${TABELLE}?select=name`, {
      headers: { ...KOPF, Range: `${von}-${von + PRO_SEITE - 1}` },
    });
    if (!r.ok) break;
    const teil = await r.json();
    for (const z of teil) raus.push(z.name);
    if (teil.length < PRO_SEITE) break;
  }
  return raus;
}

/** Alle Namen im Objektspeicher, Ordner fuer Ordner. */
async function objektNamen() {
  const raus = [];
  async function tiefer(praefix) {
    for (let versatz = 0; ; versatz += 100) {
      const r = await fetch(`${URL_}/storage/v1/object/list/${EIMER}`, {
        method: 'POST',
        headers: { ...KOPF, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: praefix, limit: 100, offset: versatz }),
      });
      if (!r.ok) return;
      const teil = await r.json();
      for (const e of teil) {
        // Supabase meldet Ordner ohne "id" - daran sind sie zu erkennen.
        if (e.id === null || e.id === undefined) await tiefer(praefix + e.name + '/');
        else raus.push(praefix + e.name);
      }
      if (teil.length < 100) return;
    }
  }
  await tiefer('');
  return raus;
}

async function holen() {
  const namen = [...await tabellenNamen(), ...await objektNamen()]
    .filter(gewuenscht).sort();
  console.log(`  Zu holen: ${namen.length}`);
  console.log('');

  let ok = 0;
  let schief = 0;
  for (const [i, name] of namen.entries()) {
    process.stdout.write(
      `\r  ${String(i + 1).padStart(5)}/${namen.length}  ${name.slice(0, 50).padEnd(50)}`);
    try {
      let roh;
      if (alsObjekt(name)) {
        const r = await fetch(`${URL_}/storage/v1/object/${EIMER}/${name}`,
          { headers: KOPF });
        if (!r.ok) throw new Error(String(r.status));
        roh = Buffer.from(await r.arrayBuffer());
      } else {
        const r = await fetch(
          `${URL_}/rest/v1/${TABELLE}?name=eq.${encodeURIComponent(name)}&select=wert`,
          { headers: KOPF });
        if (!r.ok) throw new Error(String(r.status));
        const zeilen = await r.json();
        if (!zeilen.length) throw new Error('leer');
        roh = Buffer.from(zeilen[0].wert, 'utf8');
      }
      const ziel = path.join(DATEN, name);
      fs.mkdirSync(path.dirname(ziel), { recursive: true });
      fs.writeFileSync(ziel, roh);
      ok += 1;
    } catch (e) {
      schief += 1;
      if (schief <= 10) console.log(`\n    - ${name}: ${e.message}`);
    }
  }
  console.log('\n');
  console.log(`  Geholt      : ${ok}`);
  console.log(`  Gescheitert : ${schief}`);
  console.log('');
  process.exit(schief ? 1 : 0);
}

async function los() {
  if (!URL_ || !KEY) {
    console.error('SUPABASE_URL oder der Schluessel fehlen in .env.local.');
    process.exit(1);
  }

  if (herunter) {
    console.log('');
    console.log(`  Projekt   : ${URL_.replace(/https:\/\/([a-z0-9]{4})[a-z0-9]*/, 'https://$1…')}`);
    console.log('  Richtung  : Supabase -> Platte');
    console.log(`  Nur       : ${nur.join(', ') || '(alles)'}`);
    console.log('');
    return holen();
  }

  const alle = sammle().filter(gewuenscht).filter(frischGenug).sort();
  const bytes = alle.reduce(
    (s, n) => s + fs.statSync(path.join(DATEN, n)).size, 0);

  console.log('');
  console.log(`  Projekt   : ${URL_.replace(/https:\/\/([a-z0-9]{4})[a-z0-9]*/, 'https://$1…')}`);
  console.log(`  Dateien   : ${alle.length}`);
  console.log(`  Umfang    : ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Ausgelassen: ${ohne.join(', ') || '(nichts)'}`);
  if (neuerAls) console.log(`  Nur juenger als: ${neuerAls} Minuten`);
  console.log('');

  if (probe) {
    for (const n of alle.slice(0, 40)) {
      console.log(`    ${alsObjekt(n) ? 'Objekt ' : 'Tabelle'}  ${n}`);
    }
    if (alle.length > 40) console.log(`    … und ${alle.length - 40} weitere`);
    console.log('\n  Nur eine Probe - es wurde nichts uebertragen.\n');
    return;
  }

  let ok = 0;
  let schief = 0;
  const fehler = [];

  for (const [i, name] of alle.entries()) {
    const roh = fs.readFileSync(path.join(DATEN, name));
    process.stdout.write(
      `\r  ${String(i + 1).padStart(4)}/${alle.length}  ${name.slice(0, 52).padEnd(52)}`);
    try {
      let wo;
      if (alsObjekt(name)) { await schreibObjekt(name, roh); wo = 'objekt'; }
      else wo = await schreibTabelle(name, roh);
      const abweichung = await pruefe(name, roh, wo);
      if (abweichung) { schief += 1; fehler.push(`${name}: ${abweichung}`); }
      else ok += 1;
    } catch (e) {
      schief += 1;
      fehler.push(`${name}: ${e.message}`);
    }
  }

  console.log('\n');
  console.log(`  Uebertragen und nachgeprueft : ${ok}`);
  console.log(`  Abweichend oder gescheitert  : ${schief}`);
  if (fehler.length) {
    console.log('');
    for (const f of fehler.slice(0, 25)) console.log(`    - ${f}`);
    if (fehler.length > 25) console.log(`    … und ${fehler.length - 25} weitere`);
  }
  console.log('');
  console.log('  Auf der Platte wurde nichts veraendert.');
  console.log('');
  process.exit(schief ? 1 : 0);
}

await los();
