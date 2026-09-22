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

const DATEN = path.join(process.cwd(), 'data');
const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
const anhangName = (name) => name.replace(/\//g, '__').replace(/=/g, '-eq-');
const ablageName = (anhang) => anhang.replace(/-eq-/g, '=').replace(/__/g, '/');
// Dieselbe Kuerzung wie in scripts/ablage-github.mjs - sonst passt nie etwas.
const pruefsumme = (daten) => createHash('sha256').update(daten).digest('hex').slice(0, 24);

// Je Ordner ein Release - siehe scripts/ablage-github.mjs, tagFuer.
function tagFuer(name) {
  if (/^akten\//.test(name)) return 'daten-akten';
  if (/^(epic-spieltage|szene-quelle|power-rankings)\//.test(name)) return 'daten-spieltage';
  if (/^platzierungen\//.test(name)) return 'daten-platzierungen';
  if (/^szene-stats\//.test(name)) return 'daten-szene';
  if (/^tournament-leaderboards\//.test(name)) return 'daten-leaderboards';
  if (/^replays\//.test(name)) return 'daten-replays';
  return 'daten';
}

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

/** Eine Datei holen, wenn das Release eine andere Fassung hat als die Platte. */
async function eine(name, manifest) {
  const anhang = anhangName(name);
  const ziel = path.join(DATEN, name);
  const dort = manifest[anhang]?.summe;
  const hier = fs.existsSync(ziel) ? pruefsumme(fs.readFileSync(ziel)) : null;
  if (dort && hier === dort) return 'gleich';
  const daten = await holen(tagFuer(name), anhang);
  if (!daten) return 'fehlt';
  if (hier && pruefsumme(daten) === hier) return 'gleich';
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, daten);
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
      const was = await eine(name, await manifestVon(tagFuer(name)));
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
    const tag = tagFuer(praefix);
    const manifest = await manifestVon(tag);
    const alle = Object.keys(manifest).filter((a) => a !== 'manifest.json' && !a.endsWith('.neu'))
      .map(ablageName).filter((n) => n.startsWith(praefix) || (praefix === 'akten/' && /^akten__[0-9a-f]{2}\.json$/.test(n)));
    console.log(`  Ordner ${praefix}: ${alle.length} am Release (${tag})`);
    let naechste = 0;
    const arbeiter = async () => {
      while (naechste < alle.length) {
        const name = alle[naechste++];
        try {
          if (praefix === 'akten/') {
            // Ein Buendel: nur laden, wenn die Summe eine andere ist als beim letzten Mal.
            const merk = path.join(DATEN, 'akten', `.${name}.summe`);
            const dort = manifest[anhangName(name)]?.summe;
            if (dort && fs.existsSync(merk) && fs.readFileSync(merk, 'utf8') === dort) { gleich += 1; continue; }
            const daten = await holen(tag, name);
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
          const was = await eine(name, manifest);
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
