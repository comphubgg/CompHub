/*
 * Rohe Ingame-Namen zu sauberen Szene-Namen machen - OHNE Team-/Org-Kuerzel davor und OHNE angehaengte Clan-Zeichen/Satzzeichen (Betreiber, 23.11.2026:
 * "die Anzeigenamen sollen der saubere Szene-Name sein", viele Spieler zeigen noch ihren rohen Namen). Zweite, unabhaengige Quelle neben Liquipedia
 * (scripts/liquipedia-flaggen.mjs): fuer die vielen Spieler OHNE Liquipedia-Seite. Rein aus dem Namen gerechnet - kein Abruf.
 *
 * Die Regeln stehen in lib/namenSaeubern.ts (nutzt die erprobten Bausteine aus lib/homoglyph / lib/orgtags). Bewusst vorsichtig, im Zweifel nichts aendern:
 *   SICHER    -> spieler-profile.json "anzeige" (erscheint sofort im Profil, auf Plakaten/Bestenlisten), protokolliert in socials-auto.json (zum
 *                Pruefen/Zuruecknehmen, wie scripts/liquipedia-flaggen.mjs). Ein gesetzter Anzeigename (Hand ODER Liquipedia) wird NIE ueberschrieben.
 *   VORSCHLAG -> socials-vorschlaege.json (der Betreiber bestaetigt in /admin/flaggen mit einem Klick).
 *   sonst     -> unangetastet.
 *
 * Mit Liquipedia abgestimmt: gesetzt wird nur, wo "anzeige" noch leer ist - was der Liquipedia-Lauf schon sauber gemacht hat, bleibt. Beide schreiben gegen
 * den frisch gelesenen Stand (lib/ablage aendereJson) und ueberschreiben nie ein volles Feld.
 *
 *   node scripts/namen-saeubern.mjs                 rechnen, nichts schreiben, Liste als JSON ausgeben
 *   node scripts/namen-saeubern.mjs --anwenden      rechnen und schreiben
 *   [--nur <epicId|schluessel,...>] [--max N]
 * Laeuft woechentlich mit dem Liquipedia-Lauf (.github/workflows/liquipedia-flaggen.yml); dort mit DATEN_TOKEN -> Archiv comphub-daten.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createJiti } from 'jiti';

const PROJEKT = path.resolve(import.meta.dirname, '..');
// .env.local einlesen (DATEN_TOKEN/COMPHUB_ABLAGE -> Archiv comphub-daten), wie scripts/liquipedia-flaggen.mjs.
for (const z of (() => { try { return fs.readFileSync(path.join(PROJEKT, '.env.local'), 'utf8').split('\n'); } catch { return []; } })()) {
  const m = z.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}
const jiti = createJiti(import.meta.url, { alias: { '@': PROJEKT }, interopDefault: true });
const { liesJson, aendereJson } = await jiti.import(path.join(PROJEKT, 'lib/ablage.ts'));
const { PROFIL_DATEI } = await jiti.import(path.join(PROJEKT, 'lib/spielerProfil.ts'));
const { saeubere, teamTags } = await jiti.import(path.join(PROJEKT, 'lib/namenSaeubern.ts'));

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const ANWENDEN = process.argv.includes('--anwenden');
const MAX = Number(arg('--max', 0)) || Infinity;
const NUR = new Set(String(arg('--nur', '') ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
const LAUF = `${new Date().toISOString().slice(0, 16)}Z`;
const HEX = /^[0-9a-f]{32}$/i;
const log = (...a) => console.error(...a);

/** Die Epic-Id eines Eintrags (Feld id oder hex-Schluessel), sonst der Schluessel selbst - fuers Protokoll/den Vorschlag. */
const kennung = (schluessel, v) => (v?.id && HEX.test(v.id) ? v.id.toLowerCase() : (HEX.test(schluessel) ? schluessel.toLowerCase() : schluessel));

function beleg(r) {
  const t = [];
  if (r.tag) t.push(`Team-Kürzel „${r.tag}“ entfernt`);
  if (r.grund.includes('klammer')) t.push('Turnier-Klammer entfernt');
  if (r.grund === 'nur-zierrat') t.push('Zierrat/Satzzeichen am Ende entfernt');
  if (!t.length) t.push('sauberer Szene-Name');
  return [{ art: 'name', text: `${t.join(', ')} → „${r.nachher}“` }];
}

/** Alle offenen Profile (ohne gesetzten Anzeigenamen) saeubern. Gibt die Listen zurueck; schreibt nichts. */
function berechne(profile, tags) {
  const ang = []; const vor = [];
  for (const [schluessel, v] of Object.entries(profile)) {
    if (!v || typeof v !== 'object') continue;
    if (typeof v.anzeige === 'string' && v.anzeige.trim()) continue; // schon gesetzt (Hand/Liquipedia) - nie anfassen
    const id = kennung(schluessel, v);
    if (NUR.size && !NUR.has(id) && !NUR.has(schluessel.toLowerCase())) continue;
    const name = String(v.name ?? schluessel);
    const r = saeubere(name, tags);
    if (r.status === 'unveraendert') continue;
    const eintrag = { schluessel, id, name, vorher: name, nachher: r.nachher, land: String(v.land ?? ''), grund: r.grund, tag: r.tag, belege: beleg(r) };
    (r.status === 'angewendet' ? ang : vor).push(eintrag);
  }
  return { ang, vor };
}

async function main() {
  const [profile0, orgs] = await Promise.all([liesJson(PROFIL_DATEI, {}), liesJson('orgs.json', null)]);
  const tags = teamTags(orgs);
  const { ang, vor } = berechne(profile0, tags);
  log(`Tags ${tags.size} · ${Object.keys(profile0).length} Profile · ${ang.length} sicher, ${vor.length} Vorschlag (${ANWENDEN ? 'ANWENDEN' : 'nur Plan'})`);

  let angewendet = ang; let vorschlaege = vor;
  if (ANWENDEN) {
    if (!Object.keys(profile0).length) throw new Error('--anwenden braucht eine lesbare spieler-profile.json - nichts geschrieben');
    // 1. Sichere Namen in die Profile (gegen den frischen Stand; nie ein gesetztes Feld ueberschreiben).
    const gesetzt = [];
    await aendereJson(PROFIL_DATEI, {}, (profile) => {
      gesetzt.length = 0;
      for (const it of berechne(profile, tags).ang) {
        const p = profile[it.schluessel];
        if (!p || typeof p !== 'object') continue;
        if (typeof p.anzeige === 'string' && p.anzeige.trim()) continue;
        p.anzeige = it.nachher;
        gesetzt.push(it);
      }
    });
    angewendet = gesetzt;
    // 2. Protokoll (wie scripts/liquipedia-flaggen.mjs), zum Pruefen/Zuruecknehmen.
    if (gesetzt.length) {
      await aendereJson('socials-auto.json', { eintraege: [] }, (a) => {
        a.eintraege ??= [];
        for (const it of gesetzt) {
          if (a.eintraege.some((e) => e.id === it.id && e.feld === 'anzeige' && e.wert === it.nachher)) continue;
          a.eintraege.push({ id: it.id, name: it.name, feld: 'anzeige', wert: it.nachher, zeit: Date.now(), lauf: LAUF, belege: it.belege, status: 'offen', quelle: 'namen-saeubern' });
        }
      });
    }
    // 3. Vorschlaege (nur in ein FREIES anzeige-Feld, einen vorhandenen Vorschlag/ein abgelehntes nie ueberschreiben) - gegen den frischen Profilstand.
    const frisch = await liesJson(PROFIL_DATEI, {});
    vorschlaege = berechne(frisch, tags).vor;
    if (vorschlaege.length) {
      await aendereJson('socials-vorschlaege.json', { zeilen: {} }, (vdat) => {
        vdat.zeilen ??= {};
        let geaendert = false;
        for (const it of vorschlaege) {
          const z = vdat.zeilen[it.id] ?? { name: it.name, abgelehnt: {} };
          const abgelehnt = (z.abgelehnt?.anzeige ?? []).map((x) => String(x).toLowerCase());
          if (z.anzeige || abgelehnt.includes(String(it.nachher).toLowerCase())) continue;
          z.anzeige = { wert: it.nachher, belege: it.belege, andere: [] };
          z.name = z.name || it.name; z.zeit = Date.now(); z.lauf = LAUF;
          vdat.zeilen[it.id] = z; geaendert = true;
        }
        if (geaendert) vdat.stand = Date.now();
      });
    }
  }

  const abspecken = (xs) => xs.map(({ id, vorher, nachher, land, grund }) => ({ id, vorher, nachher, land, grund }));
  console.log(JSON.stringify({ lauf: LAUF, anwenden: ANWENDEN, sicher: angewendet.length, vorschlag: vorschlaege.length, angewendet: abspecken(angewendet), vorschlaege: abspecken(vorschlaege) }, null, 1));
}

await main();
