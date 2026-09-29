// Die Kader der E-Sports-Organisationen taeglich mit Liquipedia abgleichen.
//
// Der Betreiber (29.9.2026): "fuege bei der eSports-Page auch eine
// automatische Analyse taeglich durch, ob diese Spieler wirklich auch noch
// im Team sind" - Spieler posten auf X ein "LFO" und sind dann weg, und bei
// manchen Orgs fehlten Spieler, die laengst dort sind.
//
// Quelle ist Liquipedia (CC BY-SA 3.0, kostenlos, ohne Schluessel; hoechstens
// eine Anfrage je zwei Sekunden, siehe scripts/preisgeld-liquipedia.mjs).
// Jede Teamseite fuehrt den aktiven Kader ("SquadPlayer" im Abschnitt ohne
// status=former) und die Ehemaligen mit Austrittsdatum.
//
//   - Wer bei uns im Kader steht und bei Liquipedia unter den Ehemaligen,
//     aber nicht mehr im aktiven Kader, wird entfernt.
//   - Wer bei Liquipedia aktiv ist und bei uns fehlt, kommt dazu - ohne
//     Epic-Konto (das ordnet der Admin im Player Center zu; ueber den Namen
//     wird nie ein Konto geraten).
//   - Content Creator bleiben unberuehrt: Liquipedia fuehrt nur Spieler.
//
// Welche Liquipedia-Seite zu einer Org gehoert, steht im Feld "liquipedia"
// der Org; fehlt es, wird einmal ueber den Namen gesucht und nur ein
// genauer Treffer uebernommen (und gemerkt).
//
// Jede Aenderung geht nach #admin-log, damit der Admin sie sieht und
// zuruecknehmen kann.
//
//   node scripts/org-kader-pruefen.mjs            abgleichen und data/orgs.json schreiben
//   node scripts/org-kader-pruefen.mjs --probe    nur zeigen

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ausfuehren = promisify(execFile);
const PROJEKT = path.resolve(import.meta.dirname, '..');
const DATEI = path.join(process.env.COMPHUB_DATEN || path.join(PROJEKT, 'data'), 'orgs.json');
const PROBE = process.argv.includes('--probe');
const UA = 'CompHub/1.0 (+https://www.thecomphub.com)';
const API = 'https://liquipedia.net/fortnite/api.php';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
let zuletzt = 0;

async function api(params) {
  const url = `${API}?${new URLSearchParams({ ...params, format: 'json' })}`;
  for (let versuch = 0; versuch < 5; versuch++) {
    const pause = 2500 - (Date.now() - zuletzt);
    if (pause > 0) await warte(pause);
    zuletzt = Date.now();
    try {
      const { stdout } = await ausfuehren('curl', ['-s', '--compressed', '-A', UA, '--max-time', '60', url],
        { maxBuffer: 32 * 1024 * 1024 });
      return JSON.parse(stdout);
    } catch { await warte(5000 * (versuch + 1)); }
  }
  return null;
}

/** Die Liquipedia-Seite zu einer Org: gemerkt oder genau per Titel gefunden. */
async function seiteVon(org) {
  if (org.liquipedia) return org.liquipedia;
  const j = await api({ action: 'opensearch', search: org.name, limit: '5', namespace: '0' });
  const titel = Array.isArray(j?.[1]) ? j[1] : [];
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const genau = titel.find((t) => norm(t) === norm(org.name));
  return genau ?? null;
}

/** Aktiver Kader und Ehemalige aus dem Quelltext einer Teamseite. */
function kaderAus(wikitext) {
  const aktiv = new Map(); const ehemalig = new Map();
  // Jede Kader-Tabelle: {{SquadStart ...}} ... {{SquadEnd}}
  const bloecke = wikitext.split(/\{\{\s*SquadStart/i).slice(1);
  for (const b of bloecke) {
    const kopf = b.slice(0, b.indexOf('}}'));
    const inhalt = b.slice(0, b.search(/\{\{\s*SquadEnd/i) >= 0 ? b.search(/\{\{\s*SquadEnd/i) : b.length);
    const status = /status\s*=\s*(former|inactive)/i.exec(kopf)?.[1]?.toLowerCase() ?? 'active';
    for (const m of inhalt.matchAll(/\{\{\s*SquadPlayer([^}]*)\}\}/gi)) {
      const feld = (n) => new RegExp(`\\|\\s*${n}\\s*=\\s*([^|}]*)`, 'i').exec(m[1])?.[1]?.trim() || '';
      const id = feld('id') || feld('link');
      if (!id) continue;
      const eintrag = { id, beitritt: feld('joindate'), austritt: feld('leavedate') };
      if (status === 'active' && !eintrag.austritt) aktiv.set(id.toLowerCase(), eintrag);
      else ehemalig.set(id.toLowerCase(), eintrag);
    }
  }
  return { aktiv, ehemalig };
}

async function main() {
  const roh = JSON.parse(fs.readFileSync(DATEI, 'utf8'));
  const orgs = Array.isArray(roh) ? roh : roh.orgs ?? [];
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // Derselbe Spieler, auch wenn eine Seite Zusaetze fuehrt ("27 twi" / "Twi").
  const gleich = (a, b) => {
    const x = norm(a); const y = norm(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const [kurz, lang] = x.length <= y.length ? [x, y] : [y, x];
    return kurz.length >= 3 && (lang.startsWith(kurz) || lang.endsWith(kurz));
  };
  const aenderungen = [];
  let geprueft = 0;
  for (const org of orgs) {
    const seite = await seiteVon(org);
    if (!seite) continue;
    if (!org.liquipedia) org.liquipedia = seite;
    const j = await api({ action: 'parse', page: seite, prop: 'wikitext' });
    const text = j?.parse?.wikitext?.['*'];
    if (!text) continue;
    const { aktiv, ehemalig } = kaderAus(text);
    if (!aktiv.size && !ehemalig.size) continue;
    geprueft += 1;
    const spieler = org.spieler ?? [];
    // Weg: bei Liquipedia ehemalig und nicht mehr aktiv (nur Spieler, keine Creator).
    const bleiben = spieler.filter((sp) => {
      if (sp.rolle === 'creator') return true;
      const weg = [...ehemalig.values()].some((e) => gleich(e.id, sp.name))
        && ![...aktiv.values()].some((a) => gleich(a.id, sp.name));
      if (weg) {
        const e = [...ehemalig.values()].find((x) => gleich(x.id, sp.name));
        aenderungen.push(`${org.name}: **${sp.name}** left${e?.austritt ? ` (${e.austritt})` : ''}`);
      }
      return !weg;
    });
    // Dazu: bei Liquipedia aktiv, bei uns nicht.
    for (const a of aktiv.values()) {
      if (bleiben.some((sp) => gleich(sp.name, a.id))) continue;
      bleiben.push({ epicId: null, name: a.id, seit: /^\d{4}-\d{2}-\d{2}$/.test(a.beitritt) ? a.beitritt : null,
        rolle: 'pro', x: null, twitch: null, tiktok: null, youtube: null });
      aenderungen.push(`${org.name}: **${a.id}** joined${a.beitritt ? ` (${a.beitritt})` : ''} - Epic account still to assign`);
    }
    org.spieler = bleiben;
  }
  console.log(`${geprueft} Orgs mit Liquipedia-Kader geprueft, ${aenderungen.length} Aenderungen`);
  for (const a of aenderungen) console.log(`  ${a.replace(/\*\*/g, '')}`);
  if (PROBE) return;
  fs.writeFileSync(DATEI, JSON.stringify(roh, null, 1));
  fs.writeFileSync(path.join(path.dirname(DATEI), '.kader-aenderungen.json'), JSON.stringify(aenderungen));
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
