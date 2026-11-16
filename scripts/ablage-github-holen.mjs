// Einzelne Dateien vom GitHub-Release holen - fuer den Laufrechner.
//
// Gegenstueck zu scripts/ablage-github.mjs fuer die Gegenrichtung. Die
// Verdienst-Akte (verdienst-archiv.json) und Epics Auszahlungstabellen
// (preisgeld-tabellen.json) entstehen nur auf dem Betreiber-Rechner - die
// alten Bestenlisten liegen nur dort - und kommen von dort ans Release.
// Der stuendliche Lauf holt sie sich sonst aus Supabase; antwortet das
// nicht (am 16. und 17.9.2026 stundenlang), rechnete er die Akten mit dem
// Stand aus seinem Zwischenspeicher und lud sie hoch: die Profile fielen
// auf die Zahlen von gestern zurueck. Deshalb hier: die genannten Dateien
// vom Release, und zwar immer, wenn die Pruefsumme dort eine andere ist.
//
//   node scripts/ablage-github-holen.mjs verdienst-archiv.json preisgeld-tabellen.json
//   node scripts/ablage-github-holen.mjs --ordner replays        alles unter replays/
//   node scripts/ablage-github-holen.mjs --ordner epic-spieltage --ordner platzierungen
//
// Ganze Ordner kommen ueber das Manifest des jeweiligen Releases (je Ordner
// ein Release, siehe scripts/ablage-github.mjs). Gebraucht, seit Supabase
// das Gerechnete nicht mehr fuehrt (22.9.2026): faengt der Laufrechner mit
// leerem Zwischenspeicher an, holt er seinen Stand von hier.
//
// Kein Token noetig: die Anhaenge eines oeffentlichen Releases liest jeder.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { tagsFuer } from '../lib/releaseTags.mjs';

const DATEN = path.join(process.cwd(), 'data');
const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
const anhangName = (name) => name.replace(/\//g, '__').replace(/=/g, '-eq-');
const ablageName = (anhang) => anhang.replace(/-eq-/g, '=').replace(/__/g, '/');
// Dieselbe Kuerzung wie in scripts/ablage-github.mjs - sonst passt nie etwas.
const pruefsumme = (daten) => createHash('sha256').update(daten).digest('hex').slice(0, 24);

// Je Ordner ein Release, bei den grossen ab Saison 42 je Saison eins - lib/releaseTags.mjs.

async function holen(tag, anhang) {
  const r = await fetch(`https://github.com/${REPO}/releases/download/${tag}/` + encodeURIComponent(anhang), {
    redirect: 'follow', signal: AbortSignal.timeout(120_000),
    headers: { 'User-Agent': 'comphub-ablage' },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

const manifeste = new Map();
async function manifestVon(tag) {
  if (manifeste.has(tag)) return manifeste.get(tag);
  let m = {};
  try { m = JSON.parse((await holen(tag, 'manifest.json'))?.toString('utf8') || '{}'); }
  catch (e) { console.error(`  Manifest ${tag} nicht lesbar: ${e.message}`); }
  manifeste.set(tag, m);
  return m;
}

/** Das erste Release der Reihe, dessen Verzeichnis die Datei kennt (sonst das letzte). */
async function quelleVon(name) {
  const anhang = anhangName(name);
  const tags = tagsFuer(name);
  for (const tag of tags) {
    const m = await manifestVon(tag);
    if (m[anhang]) return { tag, manifest: m };
  }
  const tag = tags[tags.length - 1];
  return { tag, manifest: await manifestVon(tag) };
}

/** Eine Datei holen, wenn das Release eine andere Fassung hat als die Platte. */
async function eine(name, tag, manifest) {
  const anhang = anhangName(name);
  const ziel = path.join(DATEN, name);
  const dort = manifest[anhang]?.summe;
  const hier = fs.existsSync(ziel) ? pruefsumme(fs.readFileSync(ziel)) : null;
  if (dort && hier === dort) return 'gleich';
  let daten = await holen(tag, anhang);
  /*
   * Das Verzeichnis kennt die Datei, GitHub antwortet aber 404 (16.11.2026): waehrend ein anderer Lauf sie am vollen Release austauscht (erst loeschen,
   * dann anlegen), fehlt sie fuer die Dauer des Hochladens. Ein solches "fehlt" liess scripts/clutch-neu-rechnen.mjs eine Datei ohne Schaden anlegen, die die
   * volle am Release ersetzte. Deshalb hier noch zweimal nachsehen, bevor sie als fehlend gilt.
   */
  for (let v = 0; !daten && manifest[anhang] && v < 2; v += 1) {
    await new Promise((ok) => setTimeout(ok, v ? 30_000 : 10_000));
    daten = await holen(tag, anhang);
  }
  if (!daten) return 'fehlt';
  if (hier && pruefsumme(daten) === hier) return 'gleich';
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, daten);
  /*
   * Geholt ist nicht geaendert (15.11.2026). Bisher trug jede geholte Datei die Uhrzeit des Holens, und "ablage-github.mjs --neuer-als 60" hielt sie eine
   * Stunde lang fuer frisch: hatte ein anderer Rechner sie inzwischen neu hochgeladen, ging die alte Kopie wieder hoch. So geschehen bei One Piece Buggy Cup
   * NAC und ZB NAC: Nacharbeiter Teil 1 wertete um 12:22 UTC alle 586 offenen Matches aus (darunter die 9 FAILED), Teil 2 - der an diesen Spieltagen nichts
   * tat - lud um 12:36 seine um 12:16 geholten Fassungen von _zustand.json und _aggregat.json darueber; am Release standen wieder 2670 Matches und die FAILED.
   * Jetzt bekommt die Datei die Zeit aus dem Verzeichnis des Releases, einen Tag zurueckgesetzt - die Reihenfolge untereinander bleibt (replays-schlank
   * vergleicht Zeiten), und hochgeladen wird nur, was hier wirklich neu geschrieben wurde.
   */
  try {
    const zeit = (Date.parse(manifest[anhang]?.zeit ?? '') || Date.now()) - 864e5;
    fs.utimesSync(ziel, new Date(zeit), new Date(zeit));
  } catch { /* dann eben mit der Zeit des Holens */ }
  return daten.length;
}

async function main() {
  const argumente = process.argv.slice(2);
  const ordner = argumente.flatMap((a, i) => (a === '--ordner' && argumente[i + 1] ? [argumente[i + 1]] : []));
  const namen = argumente.filter((a, i) => !a.startsWith('--') && argumente[i - 1] !== '--ordner');
  if (!namen.length && !ordner.length) {
    console.error('Aufruf: node scripts/ablage-github-holen.mjs datei.json [...] | --ordner replays');
    process.exit(1);
  }

  let geholt = 0; let gleich = 0; let fehlt = 0; let kaputt = 0;
  for (const name of namen) {
    try {
      const q = await quelleVon(name);
      const was = await eine(name, q.tag, q.manifest);
      if (was === 'gleich') { gleich += 1; console.log(`  =  ${name} (unveraendert)`); }
      else if (was === 'fehlt') { fehlt += 1; console.log(`  -  ${name} (nicht am Release)`); }
      else { geholt += 1; console.log(`  +  ${name} (${Math.round(was / 1024)} KB)`); }
    } catch (e) { kaputt += 1; console.log(`  !  ${name}: ${e.message}`); }
  }

  /*
   * Ganze Ordner: alle Namen aus dem Manifest, die so anfangen - in kleinen
   * Gruppen gleichzeitig, das CDN vertraegt das. Akten liegen gebuendelt
   * und kommen als Buendel ("akten__3f.json" -> akten/<id>.json je Konto).
   */
  for (const o of ordner) {
    const praefix = o.replace(/\/+$/, '') + '/';
    const tags = tagsFuer(praefix);
    // Name -> das erste Release der Reihe, das ihn kennt (das Saison-Release geht vor).
    const woher = new Map();
    for (const tag of tags) {
      const manifest = await manifestVon(tag);
      for (const a of Object.keys(manifest)) {
        if (a === 'manifest.json' || a.endsWith('.neu')) continue;
        const n = ablageName(a);
        if (!(n.startsWith(praefix) || (praefix === 'akten/' && /^akten__[0-9a-f]{2}\.json$/.test(a)))) continue;
        // Den echten Anhangsnamen mitfuehren (16.11.2026): ablageName macht aus "akten__3f.json" "akten/3f.json", und das gibt es am Release nicht (404).
        if (!woher.has(n)) woher.set(n, { tag, manifest, anhang: a });
      }
    }
    const alle = [...woher.keys()];
    console.log(`  Ordner ${praefix}: ${alle.length} am Release (${[...new Set([...woher.values()].map((w) => w.tag))].join(', ') || tags[0]})`);
    let naechste = 0;
    const arbeiter = async () => {
      while (naechste < alle.length) {
        const name = alle[naechste++];
        const { tag, manifest, anhang } = woher.get(name);
        try {
          // Nur "akten__<2 hex>.json" ist ein Buendel; andere Akten (z. B. akten/<uuid>.json) laedt ablage-github.mjs einzeln hoch -> unten als Datei holen.
          if (/^akten__[0-9a-f]{2}\.json$/.test(anhang)) {
            // Ein Buendel: nur laden, wenn die Summe eine andere ist als beim letzten Mal.
            const merk = path.join(DATEN, 'akten', `.${anhang}.summe`);
            const dort = manifest[anhang]?.summe;
            if (dort && fs.existsSync(merk) && fs.readFileSync(merk, 'utf8') === dort) { gleich += 1; continue; }
            const daten = await holen(tag, anhang);
            if (!daten) { fehlt += 1; continue; }
            const buendel = JSON.parse(daten.toString('utf8'));
            fs.mkdirSync(path.join(DATEN, 'akten'), { recursive: true });
            for (const [id, akte] of Object.entries(buendel)) {
              fs.writeFileSync(path.join(DATEN, 'akten', `${id}.json`), JSON.stringify(akte, null, 1));
            }
            if (dort) fs.writeFileSync(merk, dort);
            geholt += 1;
            continue;
          }
          const was = await eine(name, tag, manifest);
          if (was === 'gleich') gleich += 1; else if (was === 'fehlt') fehlt += 1; else geholt += 1;
        } catch (e) { kaputt += 1; console.log(`  !  ${name}: ${e.message}`); }
        if ((geholt + gleich + fehlt + kaputt) % 100 === 0) console.log(`     ${geholt} geholt, ${gleich} unveraendert ...`);
      }
    };
    await Promise.all(Array.from({ length: 6 }, arbeiter));
  }
  console.log(`Fertig: ${geholt} geholt, ${gleich} unveraendert, ${fehlt} nicht am Release${kaputt ? `, ${kaputt} gescheitert` : ''}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
