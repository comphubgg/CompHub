/*
 * Die Team-Historie der Spieler aus Liquipedia - Grundlage fuer den Reiter
 * "Teamverlauf" im Profil.
 *
 * Der Betreiber (1.10.2026): beim Teamverlauf "steht nicht seine alte
 * Organisation ... nur die aktuelle, nicht die veralteten". Das liegt daran,
 * dass der erste Entwurf nur die Orgs kannte, die CompHub fuehrt. Die
 * Liquipedia-Spielerseite fuehrt die ganze Reihe - im Infokasten unter
 * "History": je Zeile ein Zeitraum und das Team ("2024-02-24 - 2025-01-01
 * Ovation eSports", "2025-01-07 - 2026-09-27 BIG").
 *
 * Welche Seiten: die der Spieler, die in den Orgs der Seite mit Epic-Konto
 * stehen - heutige und ehemalige (Feld "liquipedia", gesetzt vom Kader-
 * Abgleich scripts/org-kader-pruefen.mjs). Verbunden wird also immer ueber
 * dieselbe Liquipedia-Seite, nie ueber einen Namen.
 *
 * Liquipedia erlaubt einen Seitenaufbau je 30 Sekunden (action=parse). Darum
 * holt jeder Lauf nur so viele Seiten, wie in sein Zeitfenster passen: zuerst
 * die noch nie geholten, dann die aeltesten. Eine Seite wird hoechstens
 * einmal pro Woche neu gelesen. Das Ergebnis liegt in data/team-verlauf.json
 * und kommt ans Release "daten-teams".
 *
 *   node scripts/team-verlauf-holen.mjs [--minuten 100] [--probe Vic0try0na]
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ausfuehren = promisify(execFile);
const PROJEKT = path.resolve(import.meta.dirname, '..');
const DATEN = process.env.COMPHUB_DATEN || path.join(PROJEKT, 'data');
const ZIEL = path.join(DATEN, 'team-verlauf.json');
const argumente = process.argv.slice(2);
const wert = (n) => { const i = argumente.indexOf(n); return i >= 0 ? argumente[i + 1] : undefined; };
const MINUTEN = Number(wert('--minuten') ?? 100);
const PROBE = wert('--probe');
const NEU_NACH_MS = 7 * 864e5;
const UA = 'CompHub/1.0 (+https://www.thecomphub.com)';
const API = 'https://liquipedia.net/fortnite/api.php';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
let zuletzt = 0;

async function api(params) {
  const url = `${API}?${new URLSearchParams({ ...params, format: 'json' })}`;
  for (let versuch = 0; versuch < 3; versuch++) {
    // Seitenaufbau: hoechstens einer je dreissig Sekunden (Liquipedias Regel).
    const pause = 31_000 - (Date.now() - zuletzt);
    if (pause > 0) await warte(pause);
    zuletzt = Date.now();
    try {
      const { stdout } = await ausfuehren('curl', ['-s', '--compressed', '-A', UA, '--max-time', '60', url],
        { maxBuffer: 32 * 1024 * 1024 });
      return JSON.parse(stdout);
    } catch { await warte(10_000 * (versuch + 1)); }
  }
  return null;
}

const entities = (s) => String(s).replace(/&#95;/g, '_').replace(/&#160;/g, ' ').replace(/&#8212;/g, '-')
  .replace(/&mdash;/g, '-').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const ohneTags = (s) => entities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** "2021-08-28 - 2022-02-23" -> { seit, bis }; "2026-09-27" -> nur seit. */
function zeitraum(text) {
  const teile = text.split(/\s+-\s+|\s+—\s+|\s+–\s+/).map((t) => t.trim()).filter(Boolean);
  const datum = (t) => /^\d{4}(-(\d{2}|\?\?)(-(\d{2}|\?\?))?)?$/.test(t ?? '') ? t : null;
  return { seit: datum(teile[0]), bis: datum(teile[1]) };
}

/** Die Zeilen der Tabelle "History" im Infokasten einer Spielerseite. */
export function historieAus(html) {
  const roh = entities(html);
  const i = roh.indexOf('>History<');
  if (i < 0) return [];
  const t = roh.indexOf('<table', i);
  // Nur der Kasten gleich nach der Ueberschrift - nicht irgendeine spaetere Tabelle.
  if (t < 0 || t - i > 600) return [];
  const e = roh.indexOf('</table>', t);
  const tabelle = roh.slice(t, e < 0 ? undefined : e);
  const raus = [];
  for (const z of tabelle.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const zellen = [...z[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (zellen.length < 2) continue;
    const { seit, bis } = zeitraum(ohneTags(zellen[0]));
    if (!seit) continue;
    const zelle = zellen[1];
    const team = ohneTags(zelle.replace(/<span[^>]*>\s*\([^<]*\)\s*<\/span>/g, '')).replace(/\s*\([^)]*\)\s*$/, '').trim();
    const hinweis = /\(([^)]+)\)/.exec(ohneTags(zelle))?.[1] ?? null;
    const seite = /href="\/fortnite\/([^"#?]+)"/.exec(zelle)?.[1];
    if (!team) continue;
    let titel = null;
    try { titel = seite ? decodeURIComponent(seite).replace(/_/g, ' ') : null; } catch { titel = null; }
    raus.push({ team, seite: titel, seit, bis, hinweis });
  }
  return raus;
}

function kandidaten() {
  let orgs;
  try {
    const roh = JSON.parse(fs.readFileSync(path.join(DATEN, 'orgs.json'), 'utf8'));
    orgs = Array.isArray(roh) ? roh : roh.orgs ?? [];
  } catch (e) { console.log(`orgs.json nicht lesbar: ${e.message}`); return []; }
  const seiten = new Map();
  const nimm = (titel) => { if (titel) seiten.set(String(titel).toLowerCase(), String(titel)); };
  for (const o of orgs) {
    for (const s of o.spieler ?? []) if (s.epicId) nimm(s.liquipedia);
    for (const e of o.ehemalige ?? []) if (e.epicId) nimm(e.liquipedia);
  }
  return [...seiten.values()];
}

async function main() {
  if (PROBE) {
    const j = await api({ action: 'parse', page: PROBE, prop: 'text', disablelimitreport: '1', disableeditsection: '1', redirects: '1' });
    console.log(JSON.stringify(historieAus(j?.parse?.text?.['*'] ?? ''), null, 1));
    return;
  }

  let stand = { zeit: 0, seiten: {} };
  try { stand = JSON.parse(fs.readFileSync(ZIEL, 'utf8')); } catch { /* erster Lauf */ }
  stand.seiten ??= {};

  const alle = kandidaten();
  const faellig = alle
    .filter((t) => Date.now() - (Date.parse(stand.seiten[t.toLowerCase()]?.geholt ?? '') || 0) > NEU_NACH_MS)
    .sort((a, b) => (Date.parse(stand.seiten[a.toLowerCase()]?.geholt ?? '') || 0)
      - (Date.parse(stand.seiten[b.toLowerCase()]?.geholt ?? '') || 0));
  console.log(`${alle.length} Spielerseiten, davon faellig: ${faellig.length}; Fenster ${MINUTEN} min (etwa ${Math.floor(MINUTEN * 60 / 31)} Seiten)`);

  const schluss = Date.now() + MINUTEN * 60_000;
  let geholt = 0; let ohne = 0;
  for (const titel of faellig) {
    if (Date.now() + 40_000 > schluss) break;
    const j = await api({ action: 'parse', page: titel, prop: 'text|displaytitle', disablelimitreport: '1', disableeditsection: '1', redirects: '1' });
    const html = j?.parse?.text?.['*'];
    if (!html) {
      // Seite fehlt oder keine Antwort: merken, damit sie nicht jeden Lauf blockiert.
      stand.seiten[titel.toLowerCase()] = { titel, geholt: new Date().toISOString(), eintraege: [], fehler: true };
      ohne += 1;
      continue;
    }
    const eintraege = historieAus(html);
    stand.seiten[titel.toLowerCase()] = {
      titel, name: ohneTags(j.parse.displaytitle ?? '') || titel,
      geholt: new Date().toISOString(), eintraege,
    };
    geholt += 1;
    if (geholt % 10 === 0) {
      stand.zeit = Date.now();
      fs.mkdirSync(DATEN, { recursive: true });
      fs.writeFileSync(ZIEL, JSON.stringify(stand));
      console.log(`  ${geholt} Seiten gelesen ...`);
    }
  }
  stand.zeit = Date.now();
  fs.mkdirSync(DATEN, { recursive: true });
  fs.writeFileSync(ZIEL, JSON.stringify(stand));
  const mitHistorie = Object.values(stand.seiten).filter((s) => s.eintraege?.length).length;
  console.log(`Fertig: ${geholt} gelesen, ${ohne} ohne Seite; im Bestand ${Object.keys(stand.seiten).length} Seiten, ${mitHistorie} mit Historie; noch faellig: ${Math.max(0, faellig.length - geholt - ohne)}`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
