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
const { saeubere, teamTags, namensUniversum, normName, kollisionsName, KORREKTUREN } = await jiti.import(path.join(PROJEKT, 'lib/namenSaeubern.ts'));

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const ANWENDEN = process.argv.includes('--anwenden');
const NUR = new Set(String(arg('--nur', '') ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
const LAUF = `${new Date().toISOString().slice(0, 16)}Z`;
const HEX = /^[0-9a-f]{32}$/i;
const log = (...a) => console.error(...a);

/** Die Epic-Id eines Eintrags (Feld id oder hex-Schluessel), sonst der Schluessel selbst - fuers Protokoll/den Vorschlag. */
const kennung = (schluessel, v) => (v?.id && HEX.test(v.id) ? v.id.toLowerCase() : (HEX.test(schluessel) ? schluessel.toLowerCase() : schluessel));

function beleg(r) {
  const t = [];
  if (r.grund === 'korrektur') t.push('vom Betreiber bestätigter Szene-Name');
  if (r.tag) t.push(`Team-Kürzel „${r.tag}“ entfernt`);
  if (String(r.grund).includes('klammer')) t.push('Turnier-Klammer entfernt');
  if (String(r.grund).includes('zierrat')) t.push('Zierrat/Satzzeichen am Ende entfernt');
  if (!t.length) t.push('sauberer Szene-Name');
  let text = `${t.join(', ')} → „${r.nachher}“`;
  if (r.kollisionMit) text = `⚠ Kollision mit „${r.kollisionMit}“ – NICHT automatisch gesetzt, bitte prüfen. (sonst ${text})`;
  return [{ art: 'name', text }];
}

/**
 * Alle Profile durchrechnen - mit Kollisions-Guard (ein sauberer Name darf nie 1:1 wie ein ANDERER Spieler sein).
 *   ang     sicher anzuwenden (leeres anzeige, sauber, keine Kollision)
 *   vor     Vorschlag/Review (mehrdeutig ODER Kollision)
 *   revert  von uns frueher gesetzter anzeige-Wert, der jetzt kollidiert -> zuruecknehmen (Originalname), ab in die Review-Liste
 *   korr    vom Betreiber bestaetigte Korrektur (KORREKTUREN), sofern der Name frei ist
 */
function berechne(profile, tags, mine) {
  const uni = namensUniversum(profile, tags);
  const ang = []; const vor = []; const revert = []; const korr = [];
  for (const [schluessel, v] of Object.entries(profile)) {
    if (!v || typeof v !== 'object') continue;
    const id = kennung(schluessel, v);
    if (NUR.size && !NUR.has(id) && !NUR.has(String(schluessel).toLowerCase())) continue;
    const name = String(v.name ?? schluessel);
    const anzeige = typeof v.anzeige === 'string' ? v.anzeige.trim() : '';
    const vonMir = mine.has(id);
    const mach = (liste, nachher, grund, kollisionMit = null) => liste.push({ schluessel, id, name, vorher: name, nachher, land: String(v.land ?? ''), grund, tag: null, kollisionMit, belege: beleg({ nachher, grund, tag: null, kollisionMit }) });

    // 1. Vom Betreiber bestaetigte Korrektur (geht vor) - nur in ein leeres oder ein von UNS gesetztes Feld, nie ueber Hand/Liquipedia.
    const k = KORREKTUREN[normName(name)];
    if (k && (!anzeige || vonMir)) {
      const mit = kollisionsName(k.anzeige, schluessel, uni);
      if (mit) vor.push({ schluessel, id, name, vorher: name, nachher: k.anzeige, land: k.land || String(v.land ?? ''), grund: 'korrektur/kollision', tag: null, kollisionMit: mit, belege: beleg({ nachher: k.anzeige, grund: 'korrektur', tag: null, kollisionMit: mit }) });
      else korr.push({ schluessel, id, name, vorher: name, nachher: k.anzeige, land: k.land || String(v.land ?? ''), grund: 'korrektur', tag: null, kollisionMit: null, belege: beleg({ nachher: k.anzeige, grund: 'korrektur', tag: null }) });
      continue;
    }

    // 2. Reparatur: ein von UNS frueher gesetzter Anzeigename, der jetzt mit einem anderen Spieler kollidiert -> zuruecknehmen.
    if (anzeige) {
      const mit = vonMir ? kollisionsName(anzeige, schluessel, uni) : null;
      if (mit) revert.push({ schluessel, id, name, vorher: name, nachher: anzeige, land: String(v.land ?? ''), grund: 'kollision-zurueckgenommen', tag: null, kollisionMit: mit, belege: [{ art: 'name', text: `⚠ „${anzeige}“ wäre 1:1 wie „${mit}“ – zurückgenommen (den Pro gibt es nur einmal), bitte prüfen` }] });
      continue; // gesetzte Namen (Hand/Liquipedia/unsere, die stimmen) nie anfassen
    }

    // 3. Neu saeubern, mit Guard.
    const r = saeubere(name, tags, { schluessel, universum: uni });
    if (r.status === 'unveraendert') continue;
    mach(r.status === 'angewendet' ? ang : vor, r.nachher, r.grund, r.kollisionMit ?? null);
  }
  return { ang, vor, revert, korr };
}

async function main() {
  const [profile0, orgs, auto0] = await Promise.all([liesJson(PROFIL_DATEI, {}), liesJson('orgs.json', null), liesJson('socials-auto.json', { eintraege: [] })]);
  const tags = teamTags(orgs);
  const mine = new Set((auto0.eintraege ?? []).filter((e) => e.quelle === 'namen-saeubern' && e.feld === 'anzeige').map((e) => String(e.id)));
  const vor0 = berechne(profile0, tags, mine);
  log(`Tags ${tags.size} · ${Object.keys(profile0).length} Profile · sicher ${vor0.ang.length}, Vorschlag ${vor0.vor.length}, Korrektur ${vor0.korr.length}, zurückgenommen ${vor0.revert.length} (${ANWENDEN ? 'ANWENDEN' : 'nur Plan'})`);

  let res = vor0;
  if (ANWENDEN) {
    if (!Object.keys(profile0).length) throw new Error('--anwenden braucht eine lesbare spieler-profile.json - nichts geschrieben');
    const getan = { ang: [], korr: [], revert: [], vor: [] };
    // 1. Profile: Korrekturen setzen, kollidierende eigene Namen zuruecknehmen, sichere Namen setzen - gegen den frischen Stand.
    await aendereJson(PROFIL_DATEI, {}, (profile) => {
      for (const kk of Object.keys(getan)) getan[kk].length = 0;
      const b = berechne(profile, tags, mine);
      for (const it of b.korr) { const p = profile[it.schluessel]; if (!p) continue; p.anzeige = it.nachher; if (it.land) p.land = it.land; getan.korr.push(it); }
      for (const it of b.revert) { const p = profile[it.schluessel]; if (p && typeof p.anzeige === 'string') { delete p.anzeige; getan.revert.push(it); } }
      for (const it of b.ang) { const p = profile[it.schluessel]; if (!p) continue; if (typeof p.anzeige === 'string' && p.anzeige.trim()) continue; p.anzeige = it.nachher; getan.ang.push(it); }
      getan.vor = b.vor;
    });
    // 2. Protokoll: neue/geaenderte Namen eintragen, zurueckgenommene als solche markieren.
    await aendereJson('socials-auto.json', { eintraege: [] }, (a) => {
      a.eintraege ??= [];
      for (const it of a.eintraege) {
        if (it.quelle !== 'namen-saeubern' || it.feld !== 'anzeige' || it.status === 'rueckgaengig') continue;
        if (getan.revert.some((r) => r.id === it.id) || getan.korr.some((r) => r.id === it.id && String(r.nachher).toLowerCase() !== String(it.wert).toLowerCase())) {
          it.status = 'rueckgaengig'; it.entschieden = Date.now();
        }
      }
      for (const it of [...getan.ang, ...getan.korr]) {
        if (a.eintraege.some((e) => e.id === it.id && e.feld === 'anzeige' && e.wert === it.nachher && e.status !== 'zurückgenommen')) continue;
        a.eintraege.push({ id: it.id, name: it.name, feld: 'anzeige', wert: it.nachher, zeit: Date.now(), lauf: LAUF, belege: it.belege, status: 'offen', quelle: 'namen-saeubern' });
      }
    });
    // 3. Review-Liste: Vorschlaege + zurueckgenommene Kollisionen. Nie ueber einen vorhandenen Vorschlag/ein Abgelehntes schreiben.
    const frisch = await liesJson(PROFIL_DATEI, {});
    const b2 = berechne(frisch, tags, mine);
    // Zurueckgenommene tauchen in b2.vor erneut auf (jetzt ohne anzeige, Kollision) - nicht doppelt zaehlen; sie werden ueber getan.revert gefuehrt.
    const revIds = new Set(getan.revert.map((r) => r.id));
    const appIds = new Set([...getan.ang, ...getan.korr].map((r) => r.id));
    res = { ...b2, vor: b2.vor.filter((x) => !revIds.has(x.id) && !appIds.has(x.id)) };
    // Zuerst die zurueckgenommenen (mit ihrer "zurueckgenommen"-Begruendung), dann die uebrigen Vorschlaege.
    const review = [...getan.revert, ...res.vor];
    await aendereJson('socials-vorschlaege.json', { zeilen: {} }, (vdat) => {
      vdat.zeilen ??= {};
      let geaendert = false;
      for (const it of review) {
        const z = vdat.zeilen[it.id] ?? { name: it.name, abgelehnt: {} };
        const abgelehnt = (z.abgelehnt?.anzeige ?? []).map((x) => String(x).toLowerCase());
        if (z.anzeige || abgelehnt.includes(String(it.nachher).toLowerCase())) continue;
        // Der saubere Name wird gezeigt, bei Kollision mit deutlichem ⚠-Hinweis in den Belegen (der Betreiber entscheidet in /admin/flaggen).
        z.anzeige = { wert: it.nachher, belege: it.belege, andere: [] };
        z.name = z.name || it.name; z.zeit = Date.now(); z.lauf = LAUF;
        vdat.zeilen[it.id] = z; geaendert = true;
      }
      if (geaendert) vdat.stand = Date.now();
    });
    res = { ang: getan.ang, korr: getan.korr, revert: getan.revert, vor: res.vor };
  } else {
    res = { ...vor0, vor: vor0.vor.filter((x) => !vor0.revert.some((r) => r.id === x.id) && !vor0.korr.some((r) => r.id === x.id)) };
  }

  const zeile = ({ id, vorher, nachher, land, grund, kollisionMit }, status) => ({ id, vorher, nachher, land, grund, status, kollision: kollisionMit || '' });
  const alle = [
    ...res.ang.map((x) => zeile(x, 'angewendet')),
    ...res.korr.map((x) => zeile(x, 'angewendet')),
    ...res.revert.map((x) => zeile(x, 'zurückgenommen')),
    ...res.vor.map((x) => zeile(x, 'vorschlag')),
  ];
  console.log(JSON.stringify({ lauf: LAUF, anwenden: ANWENDEN, sicher: res.ang.length + res.korr.length, vorschlag: res.vor.length, zurueckgenommen: res.revert.length, zeilen: alle }, null, 1));
}

await main();
