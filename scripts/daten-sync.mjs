/*
 * Die Daten zwischen der Platte und dem privaten GitHub-Archiv abgleichen.
 *
 * Gegenstueck zu lib/ablageGitDaten.ts, und Ersatz fuer scripts/umzug-supabase.mjs
 * (der Betreiber, 11.10.2026: "kein Supabase mehr"). Dieselben Schalter, damit die
 * Ablaeufe nur den Namen des Skripts tauschen muessen:
 *
 *   node scripts/daten-sync.mjs --noetiges                    Platte -> Archiv (hoch)
 *   node scripts/daten-sync.mjs --herunterladen --noetiges    Archiv -> Platte
 *   node scripts/daten-sync.mjs --nur konten.json,overlays.json
 *   node scripts/daten-sync.mjs --herunterladen --nur orgs.json
 *   node scripts/daten-sync.mjs --noetiges --neuer-als 120    nur, was in den letzten 120 Minuten angefasst wurde
 *   node scripts/daten-sync.mjs --noetiges --probe            zeigen, was geschehen wuerde
 *
 * Es wird nur uebertragen, was sich unterscheidet: beide Seiten kennen den Git-Stand
 * (Blob-Pruefsumme) jeder Datei, gleiche Dateien kosten nichts. Auf keiner Seite wird
 * etwas geloescht. Gerechnetes, das nur am Release liegt (Akten, Antworten, Replays ...),
 * geht nie in dieses Archiv - siehe lib/ablageGithub.ts.
 *
 * Der Schluessel kommt aus DATEN_TOKEN, sonst GITHUB_TOKEN (.env.local oder Umgebung);
 * DATEN_REPO nennt ein anderes Archiv, DATEN_PRAEFIX einen Unterordner darin,
 * COMPHUB_DATEN einen anderen Datenordner auf der Platte.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const DATEN = process.env.COMPHUB_DATEN || path.join(PROJEKT, 'data');

function ausDatei() {
  const raus = {};
  try {
    for (const z of fs.readFileSync(path.join(PROJEKT, '.env.local'), 'utf8').split('\n')) {
      const m = z.match(/^([A-Z_0-9]+)=(.*)$/); if (m) raus[m[1]] = m[2].trim().replace(/^"|"$/g, '');
    }
  } catch { /* keine Datei */ }
  return raus;
}
const DATEI = ausDatei();
const U = { ...DATEI, ...process.env };
/*
 * Der Schluessel aus .env.local vor dem der Umgebung (29.10.2026): in den Ablaeufen heisst GITHUB_TOKEN der Zugang des Ablaufs selbst, und der sieht das
 * private Archiv nicht. "Replays nacharbeiten" setzt ihn fuer das Hochladen - dort holte dieser Abgleich deshalb nie eine Anfrage der Seite
 * ("Runter: 0 geholt"), und der Vorrang kam nie an.
 */
const TOKEN = (U.DATEN_TOKEN || DATEI.GITHUB_TOKEN || U.GITHUB_TOKEN || '').trim();
const REPO = (U.DATEN_REPO || 'comphubgg/comphub-daten').trim();
const PRAEFIX = (U.DATEN_PRAEFIX || '').trim().replace(/^\/+|\/+$/g, '');
const ZWEIG = 'main';
const API = 'https://api.github.com';

/* Was als Noetigstes gilt: dieselbe Liste wie in scripts/umzug-supabase.mjs. */
const NOETIGES = [
  'konten.json', 'homepage-vips.json', 'dienst-zugaenge.json', 'tierlists.json',
  'dashboard.json', 'streamers.json', 'streamer-profiles.json', 'overlays.json',
  'turnier-karten.json', 'karten-vorlagen.json', 'karten-ausgeblendet.json',
  'prognosen.json', 'predictions.json', 'spieler-profile.json', 'spielerbilder.json',
  'spieler-namen.json', 'orgtags.json', 'socials.json', 'players.json', 'duos.json',
  'galerie.json', 'kontakt.json', 'sektionen.json', 'notes.json', 'offene-aufgaben.json',
  'anwesenheit.json', 'insel-bilder.json', 'tournaments.json', 'tournament-maps.json',
  'tournamentLeaderboards.json', 'gegenstaende.json', 'besuche.json', 'epic-auth.json',
  'epic-namen.json', 'preisgelder.json', 'lan-preisgelder.json', 'cup-archiv.json',
  'bekannte-ohne-foto.txt', 'fehlende-bilder.txt',
  'discord-kanaele.json', 'discord-anfragen.json', 'vip-users.json',
  'meine-prognosen', 'tierlisten', 'statistik-sichtbarkeit.json', 'spieler-versteckt.json',
  'tierlist-entfernt.json', 'tierlist-trios.json', 'cup-player-config.json', 'discord-dms.json', 'user-storage',
  'orgs.json', 'org-logos', 'spielerfotos',
  'galerie', 'kartenbilder', 'kontakt-bilder', 'admin-maps', 'eigene-matches', 'anwesenheit',
];

/** Was nur am Release liegt und nie hierher gehoert - muss zu lib/ablageGithub.ts (NUR_RELEASE) passen. */
const NUR_RELEASE = [
  /^antworten\/(?!catalog_|szene_spieler=|szene_ansicht=profil)/, /^akten\//, /^epic-spieltage\//,
  /^platzierungen\//, /^szene-stats\//, /^szene-quelle\//, /^tournament-leaderboards\//, /^power-rankings\//,
  /^replays\//, /^clutch\//, /^replay-voll\//, /^replays-schlank\//, /^scrims\//, /^_/,
  /^(verdienst-archiv|elims-archiv|elims-summen-alt|preisgeld-tabellen|prognose-felder|lan-konten|team-verlauf)\.json$/,
];

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const werte = (n) => args.flatMap((a, i) => (a === n && args[i + 1] ? args[i + 1].split(',') : [])).map((s) => s.trim()).filter(Boolean);
const herunter = flag('--herunterladen');
/** Ohne Schutz vor Konflikten schreiben - nur fuer Ablaeufe, die selbst gegen den frischen Stand zusammengefuehrt haben (Org-Kader). */
const ueberschreiben = flag('--ueberschreiben');
const probe = flag('--probe');
const neuerAls = Number(werte('--neuer-als')[0] || 0);
const nur = flag('--noetiges') ? NOETIGES : werte('--nur');
const ohne = werte('--ohne');

if (!TOKEN) { console.error('Kein Schluessel: DATEN_TOKEN oder GITHUB_TOKEN fehlt.'); process.exit(1); }
if (!nur.length) { console.error('Bitte --noetiges oder --nur <Namen> angeben.'); process.exit(1); }

const gewuenscht = (name) => {
  if (name.startsWith('.') || name.endsWith('.neu') || /\.\d+\.neu$/.test(name)) return false;
  if (NUR_RELEASE.some((m) => m.test(name))) return false;
  if (ohne.some((o) => name === o || name.startsWith(`${o}/`))) return false;
  return nur.some((n) => name === n || name.startsWith(`${n}/`));
};

/*
 * Der Stand beim Herunterladen - damit beim Hochladen nichts Neueres ueberschrieben wird.
 *
 * Ein Lauf holt seine Dateien zu Beginn und schreibt sie gut eine Stunde spaeter zurueck. Was
 * der Betreiber in der Zwischenzeit auf der Seite geaendert hat, steht dann im Archiv, nicht in
 * der Datei des Laufs. Deshalb merkt sich das Herunterladen je Datei den Git-Stand
 * (.sync-basis.json); das Hochladen schreibt nur, was der Lauf selbst geaendert hat, und nur,
 * wenn das Archiv sich seither nicht bewegt hat. Sonst: Konflikt, uebersprungen, gemeldet.
 */
const BASIS_DATEI = path.join(DATEN, '.sync-basis.json');
const basisLesen = () => { try { return JSON.parse(fs.readFileSync(BASIS_DATEI, 'utf8')); } catch { return {}; } };
const basisSchreiben = (b) => { try { fs.mkdirSync(DATEN, { recursive: true }); fs.writeFileSync(BASIS_DATEI, JSON.stringify(b)); } catch { /* ohne Basis gilt der Vergleich mit dem Archiv */ } };

const blobSha = (b) => crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
const pfadTeil = (name) => [PRAEFIX, name].filter(Boolean).join('/').split('/').map(encodeURIComponent).join('/');
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(weg, init = {}) {
  for (let v = 0; v < 4; v += 1) {
    const r = await fetch(`${API}${weg}`, {
      ...init,
      headers: { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'comphub-daten-sync', 'X-GitHub-Api-Version': '2022-11-28', Accept: 'application/vnd.github+json', ...(init.headers || {}) },
      signal: AbortSignal.timeout(60_000),
    });
    // Gedrosselt: so lange warten, wie GitHub sagt, dann noch einmal.
    if ((r.status === 403 || r.status === 429) && (r.headers.get('retry-after') || r.headers.get('x-ratelimit-remaining') === '0')) {
      const sek = Number(r.headers.get('retry-after')) || Math.max(5, Number(r.headers.get('x-ratelimit-reset')) - Math.floor(Date.now() / 1000));
      console.log(`  GitHub bittet um ${sek} s Pause ...`);
      await warte(Math.min(sek, 120) * 1000);
      continue;
    }
    return r;
  }
  throw new Error(`GitHub dauernd gedrosselt bei ${weg}`);
}

/** Der Stand des Archivs: Name -> { sha, size }, einmal fuer alles. */
async function entferntLesen() {
  const karte = new Map();
  const r = await api(`/repos/${REPO}/git/trees/${ZWEIG}?recursive=1`);
  if (r.status === 404 || r.status === 409) return karte; // leeres Archiv
  if (!r.ok) throw new Error(`Archiv nicht lesbar: HTTP ${r.status}`);
  const j = await r.json();
  if (j.truncated) console.log('  Achtung: die Liste des Archivs ist abgeschnitten.');
  const vor = PRAEFIX ? `${PRAEFIX}/` : '';
  for (const e of j.tree || []) {
    if (e.type !== 'blob' || (vor && !e.path.startsWith(vor))) continue;
    karte.set(e.path.slice(vor.length), { sha: e.sha, size: e.size });
  }
  return karte;
}

function sammle(ordner = '', raus = []) {
  let eintraege;
  try { eintraege = fs.readdirSync(path.join(DATEN, ordner), { withFileTypes: true }); } catch { return raus; }
  for (const e of eintraege) {
    const name = ordner ? `${ordner}/${e.name}` : e.name;
    if (e.isDirectory()) {
      // Ordner nur betreten, wenn darunter etwas gewuenscht sein kann.
      if (nur.some((n) => n === name || n.startsWith(`${name}/`) || name.startsWith(`${n}/`))) sammle(name, raus);
    } else if (e.isFile()) raus.push(name);
  }
  return raus;
}

async function hoch(entfernt) {
  const lokal = sammle().filter(gewuenscht);
  const basis = basisLesen();
  let neu = 0; let gleich = 0; let fehler = 0; let bytes = 0; let konflikte = 0;
  for (const name of lokal) {
    const voll = path.join(DATEN, name);
    const st = fs.statSync(voll);
    if (neuerAls && Date.now() - st.mtimeMs > neuerAls * 60_000) continue;
    if (st.size > 90 * 1024 * 1024) { console.log(`  zu gross, uebersprungen: ${name}`); continue; }
    const daten = fs.readFileSync(voll);
    if (name.endsWith('.json')) {
      try { JSON.parse(daten.toString('utf8')); } catch { console.log(`  kein gueltiges JSON, uebersprungen: ${name}`); fehler += 1; continue; }
    }
    const sha = blobSha(daten);
    const dort = entfernt.get(name);
    if (dort && dort.sha === sha) { gleich += 1; continue; }
    // Seit dem Herunterladen nicht angefasst: nichts von diesem Lauf, nichts zu schreiben.
    if (!ueberschreiben && basis[name] && basis[name] === sha) { gleich += 1; continue; }
    // Das Archiv hat sich seit dem Herunterladen bewegt: nicht darueberschreiben.
    if (!ueberschreiben && dort && basis[name] && basis[name] !== dort.sha) {
      console.log(`  KONFLIKT ${name}: im Archiv inzwischen geaendert, nicht ueberschrieben`);
      konflikte += 1; continue;
    }
    if (probe) { console.log(`  wuerde schreiben: ${name} (${daten.length} B)`); neu += 1; continue; }
    let ok = false;
    let alt = dort ? dort.sha : undefined;
    for (let v = 0; v < 4 && !ok; v += 1) {
      const r = await api(`/repos/${REPO}/contents/${pfadTeil(name)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `${alt ? 'Aktualisiert' : 'Neu'}: ${name}`.slice(0, 200), content: daten.toString('base64'), branch: ZWEIG, ...(alt ? { sha: alt } : {}) }),
      });
      if (r.ok) { ok = true; break; }
      if (r.status === 409 || r.status === 422) {
        const g = await api(`/repos/${REPO}/contents/${pfadTeil(name)}?ref=${ZWEIG}`);
        alt = g.ok ? (await g.json()).sha : undefined;
        continue;
      }
      console.log(`  FEHLER ${name}: HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
      break;
    }
    if (ok) { neu += 1; bytes += daten.length; } else fehler += 1;
    await warte(450); // GitHub verlangt Abstand zwischen Commits
  }
  console.log(`Hoch: ${neu} geschrieben (${Math.round(bytes / 1024)} kB), ${gleich} unveraendert, ${konflikte} Konflikte, ${fehler} Fehler${probe ? ' (Probelauf)' : ''}.`);
  return fehler;
}

async function runter(entfernt) {
  let geholt = 0; let gleich = 0; let fehler = 0;
  const liste = [...entfernt.entries()].filter(([name]) => gewuenscht(name));
  const basis = basisLesen();
  let i = 0;
  const arbeiter = Array.from({ length: 4 }, async () => {
    for (;;) {
      const [name, e] = liste[i++] || [];
      if (!name) return;
      const voll = path.join(DATEN, name);
      let lokalSha = null;
      try { lokalSha = blobSha(fs.readFileSync(voll)); } catch { /* gibt es noch nicht */ }
      if (lokalSha === e.sha) { gleich += 1; basis[name] = e.sha; continue; }
      if (probe) { console.log(`  wuerde holen: ${name}`); geholt += 1; continue; }
      const r = await api(`/repos/${REPO}/git/blobs/${e.sha}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
      if (!r.ok) { console.log(`  FEHLER ${name}: HTTP ${r.status}`); fehler += 1; continue; }
      const daten = Buffer.from(await r.arrayBuffer());
      fs.mkdirSync(path.dirname(voll), { recursive: true });
      const vorlaeufig = `${voll}.${process.pid}.neu`;
      fs.writeFileSync(vorlaeufig, daten);
      fs.renameSync(vorlaeufig, voll);
      basis[name] = e.sha;
      geholt += 1;
    }
  });
  await Promise.all(arbeiter);
  if (!probe) basisSchreiben(basis);
  console.log(`Runter: ${geholt} geholt, ${gleich} unveraendert, ${fehler} Fehler${probe ? ' (Probelauf)' : ''}.`);
  return fehler;
}

const entfernt = await entferntLesen();
console.log(`Archiv ${REPO}${PRAEFIX ? '/' + PRAEFIX : ''}: ${entfernt.size} Dateien.`);
const fehler = herunter ? await runter(entfernt) : await hoch(entfernt);
process.exitCode = fehler ? 1 : 0;
