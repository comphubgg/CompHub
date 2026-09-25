// Die zweite Ablage fuellen: Dateien des Laufrechners an ein GitHub-Release.
//
// Gegenstueck zu lib/ablageGithub.ts. Alles, was der Laufrechner erzeugt
// (fertige Antworten, Akten, Spieltage, Werte der Szene, Tabellen), kommt
// als Anhang an das Release "daten" des Projekts. Die Seite liest es von
// dort, wenn Supabase nicht antwortet - und die Antworten und Akten sogar
// zuerst von dort. Supabase bleibt die Zweitkopie; hier wird nichts dort
// geloescht.
//
//   node scripts/ablage-github.mjs                    alles, was sich geaendert hat
//   node scripts/ablage-github.mjs --nur antworten    nur ein Ordner (mehrfach moeglich)
//   node scripts/ablage-github.mjs --neuer-als 120    nur Dateien der letzten 120 Minuten
//   node scripts/ablage-github.mjs --probe            zeigen, nicht uebertragen
//   node scripts/ablage-github.mjs --erzwingen        auch, was laut Manifest schon so liegt
//
// Geaendert heisst: die Pruefsumme weicht von der im Manifest ab, das als
// eigener Anhang ("manifest.json") am Release liegt. Akten werden in 256
// Buendel nach den ersten zwei Zeichen der Konto-Id gepackt (siehe
// lib/ablageGithub), ein Buendel wird nur hochgeladen, wenn sich darin
// etwas geaendert hat.
//
// Zugang: GITHUB_TOKEN aus der Umgebung oder .env.local (auf dem Laufrechner
// das Token des Auftrags). Rate: 5000 Anfragen je Stunde; ein Anhang kostet
// zwei (loeschen, hochladen), ein Lauf mit ein paar hundert Aenderungen
// bleibt weit darunter.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PROJEKT = process.cwd();
const DATEN = path.join(PROJEKT, 'data');
const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
// Je Ordner ein Release - siehe lib/ablageGithub.ts, tagFuer.
function tagFuer(name) {
  if (/^akten\//.test(name)) return 'daten-akten';
  if (/^(epic-spieltage|szene-quelle|power-rankings)\//.test(name)) return 'daten-spieltage';
  if (/^platzierungen\//.test(name)) return 'daten-platzierungen';
  if (/^szene-stats\//.test(name)) return 'daten-szene';
  if (/^tournament-leaderboards\//.test(name)) return 'daten-leaderboards';
  if (/^replays\//.test(name)) return 'daten-replays';
  return 'daten';
}
const API = 'https://api.github.com';
const GLEICHZEITIG = 4;
/*
 * Abstand zwischen zwei Anfragen, die etwas anlegen oder loeschen.
 *
 * GitHub laesst davon hoechstens achtzig je Minute zu; darueber kommt 403
 * mit Wartezeit, und genau daran hing der Schritt seit dem 17.9.2026 vierzig
 * Minuten fest, ohne fertig zu werden - kein einziger Anhang kam an, die
 * Profile blieben beim Stand vom 17.9. Mit 750 Millisekunden Abstand sind
 * es achtzig je Minute, unter der Grenze, und der Lauf kommt ans Ende.
 */
const ABSTAND_MS = 750;
let naechsteAnfrage = 0;
async function gedrosselt() {
  const jetzt = Date.now();
  const dran = Math.max(jetzt, naechsteAnfrage);
  naechsteAnfrage = dran + ABSTAND_MS;
  if (dran > jetzt) await new Promise((r) => setTimeout(r, dran - jetzt));
}

/* ------------------------------------------------------------ Aufruf */

const argumente = process.argv.slice(2);
const wert = (name) => { const i = argumente.indexOf(name); return i >= 0 ? argumente[i + 1] : undefined; };
const werte = (name) => argumente.flatMap((a, i) => (a === name && argumente[i + 1] ? [argumente[i + 1]] : []));
const nur = werte('--nur');
const neuerAls = Number(wert('--neuer-als') || 0);
const probe = argumente.includes('--probe');
// Auch hochladen, was laut Manifest schon so liegt - wenn das Manifest luegt.
const erzwingen = argumente.includes('--erzwingen');

function umgebung() {
  const raus = {};
  const datei = path.join(PROJEKT, '.env.local');
  if (fs.existsSync(datei)) {
    for (const zeile of fs.readFileSync(datei, 'utf8').split(/\r?\n/)) {
      const m = zeile.match(/^([A-Z_]+)=(.*)$/);
      if (m) raus[m[1]] = m[2].trim();
    }
  }
  return { ...raus, ...process.env };
}
const TOKEN = umgebung().GITHUB_TOKEN || umgebung().GH_TOKEN || '';
if (!TOKEN) { console.error('GITHUB_TOKEN fehlt (Umgebung oder .env.local).'); process.exit(1); }

const KOPF = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'comphub-ablage',
};

/* ------------------------------------------------------------ Regeln */

// Dieselben Regeln wie lib/ablageGithub.ts - was ans Release gehoert.
const AM_RELEASE = [
  // Und nicht die Antwort je Spieler (szene_spieler=...): die rechnet die
  // Seite in Sekunden aus der Akte, und ein Stand von gestern am Release
  // wuerde zuerst ausgeliefert - mit den Zahlen von gestern.
  /^antworten\/(?!catalog_|szene_spieler=|szene_ansicht=profil)/,
  /^akten\//,
  /^epic-spieltage\//,
  /^platzierungen\//,
  /^szene-stats\//,
  /^szene-quelle\//,
  /^tournament-leaderboards\//,
  /^power-rankings\//,
  // Die ausgewerteten Replays - seit dem 22.9.2026 nur noch hier, nicht
  // mehr bei Supabase (siehe lib/ablageGithub, nurRelease).
  /^replays\//,
  /^(verdienst-archiv|elims-archiv|elims-summen-alt|preisgeld-tabellen|preisgelder|lan-preisgelder|epic-namen|cup-archiv|prognose-felder)\.json$/,
  // Vom Betreiber gepflegt, von der Seite viel gelesen: als Rueckfall, wenn
  // Supabase nicht antwortet. Gelesen wird zuerst die lebende Kopie dort.
  /^(prognosen|turnier-karten|karten-vorlagen|spieler-profile|spielerbilder|spieler-namen|orgtags|galerie)\.json$/,
];
/** Was der Betreiber auf der Seite pflegt - siehe gewuenscht(). */
const GEPFLEGT = /^(prognosen|turnier-karten|karten-vorlagen|spieler-profile|spielerbilder|spieler-namen|orgtags|galerie)\.json$/;
const anhangName = (name) => name.replace(/\//g, '__').replace(/=/g, '-eq-');

function gewuenscht(name) {
  if (name.startsWith('.') || name.endsWith('.neu') || /\.\d+\.neu$/.test(name)) return false;
  // Von den Replays nur die Auswertungen und Staende, nie die rohen Matches
  // (siebzehntausend Dateien, die sich nie wieder aendern).
  if (/^replays\//.test(name) && !/\/(_aggregat|_zustand)\.json$|^replays\/_[^/]+\.json$/.test(name)) return false;
  if (!AM_RELEASE.some((m) => m.test(name))) return false;
  if (nur.length && !nur.some((n) => name === n || name.startsWith(`${n}/`))) return false;
  /*
   * Vom Betreiber Gepflegtes nur, wenn es eben frisch aus Supabase kam.
   *
   * Karten, Prognosen, Profile und Fotozuordnung leben in Supabase; am
   * Release liegt nur ihre Ersatzkopie. Der Laufrechner hat davon aber auch
   * einen Stand im Zwischenspeicher - am 25.9.2026 einen vom 23.9. -, und
   * jedes Hochladen am Ende eines Laufs schob diesen alten Stand als
   * Ersatzkopie ans Release. Die Seite zeigte ihn dann bei jedem Aussetzer
   * von Supabase: die Globals-Karte ohne ein einziges Team. Jetzt duerfen
   * sie nur aus dem Schritt hoch, der sie gerade erfolgreich geholt hat
   * (GEPFLEGT_HOCHLADEN=1).
   */
  if (GEPFLEGT.test(name) && process.env.GEPFLEGT_HOCHLADEN !== '1') return false;
  return true;
}

function sammle(ordner = '', raus = []) {
  let eintraege;
  try { eintraege = fs.readdirSync(path.join(DATEN, ordner), { withFileTypes: true }); } catch { return raus; }
  for (const e of eintraege) {
    const name = ordner ? `${ordner}/${e.name}` : e.name;
    if (e.isDirectory()) sammle(name, raus);
    else if (e.isFile()) raus.push(name);
  }
  return raus;
}

const pruefsumme = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 24);

/*
 * Die Pruefsumme einer fertigen Antwort - ueber den Inhalt, nicht die Zeit.
 *
 * Jede Antwort traegt "zeit", wann sie gerechnet wurde. Der Lauf rechnet
 * stuendlich achthundert davon neu, und fast alle kommen unveraendert
 * heraus - nur die Zeit ist eine andere. Mit der Zeit in der Summe wurden
 * sie alle jede Stunde hochgeladen (achthundert Anhaenge, je drei
 * Anfragen), mit der Summe nur ueber den Inhalt bleibt es bei denen, die
 * sich wirklich geaendert haben.
 */
function antwortSumme(daten) {
  try {
    const j = JSON.parse(daten.toString('utf8'));
    if (j && typeof j === 'object' && 'wert' in j) return pruefsumme(Buffer.from(JSON.stringify(j.wert), 'utf8'));
  } catch { /* keine Antwort im ueblichen Format */ }
  return pruefsumme(daten);
}

/* ------------------------------------------------------------ GitHub */

async function api(pfad, init = {}, versuche = 3) {
  for (let v = 1; ; v++) {
    const r = await fetch(pfad.startsWith('http') ? pfad : `${API}${pfad}`, {
      ...init, headers: { ...KOPF, ...(init.headers || {}) }, signal: AbortSignal.timeout(120_000),
    });
    if (r.ok || r.status === 404 || v >= versuche) return r;
    // Sekundaere Rate-Grenze oder Wackler: kurz warten, noch einmal.
    const warte = r.status === 403 || r.status === 429 ? 30_000 : 3_000;
    await new Promise((res) => setTimeout(res, warte * v));
  }
}

async function releaseHolen(tag) {
  let r = await api(`/repos/${REPO}/releases/tags/${tag}`);
  if (r.status === 404) {
    r = await api(`/repos/${REPO}/releases`, {
      method: 'POST',
      body: JSON.stringify({
        tag_name: tag, target_commitish: 'main', name: `Daten der Seite (${tag})`, prerelease: true,
        body: 'Second copy of the data the hourly run produces (answers, player files, match days). '
          + 'Read by the site when Supabase does not answer. Written by scripts/ablage-github.mjs. '
          + 'Not a software release.',
      }),
    });
  }
  if (!r.ok) throw new Error(`Release: ${r.status} ${await r.text()}`);
  return r.json();
}

async function anhaenge(releaseId) {
  const karte = new Map();
  for (let seite = 1; ; seite++) {
    const r = await api(`/repos/${REPO}/releases/${releaseId}/assets?per_page=100&page=${seite}`);
    if (!r.ok) throw new Error(`Anhaenge: ${r.status}`);
    const teil = await r.json();
    for (const a of teil) karte.set(a.name, a);
    if (teil.length < 100) break;
  }
  return karte;
}

async function anhangLesen(a) {
  const r = await fetch(a.browser_download_url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}

/*
 * Ersetzen ohne Luecke: erst die neue Fassung unter "<name>.neu" hochladen,
 * dann die alte loeschen, dann die neue umbenennen. Vorher hiess es
 * loeschen und danach hochladen - dazwischen fehlte der Anhang ein paar
 * Sekunden, und die Seite zeigte "Zahlen gerade nicht erreichbar", waehrend
 * die Jahreslisten neu hochkamen. Ein Rest ".neu" von einem abgebrochenen
 * Lauf wird beim naechsten Mal ueberschrieben.
 */
async function hochladen(releaseId, vorhandene, name, daten) {
  const alt = vorhandene.get(name);
  const zwischenname = alt ? `${name}.neu` : name;
  const rest = vorhandene.get(zwischenname);
  if (rest) { await gedrosselt(); await api(`/repos/${REPO}/releases/assets/${rest.id}`, { method: 'DELETE' }); }
  await gedrosselt();
  const r = await api(
    `https://uploads.github.com/repos/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(zwischenname)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': name.endsWith('.json') ? 'application/json' : 'application/octet-stream',
                 'Content-Length': String(daten.length) },
      body: daten,
    });
  if (!r.ok) throw new Error(`hochladen ${name}: ${r.status} ${(await r.text()).slice(0, 600)}`);
  let neu = await r.json();
  if (alt) {
    await gedrosselt();
    const weg = await api(`/repos/${REPO}/releases/assets/${alt.id}`, { method: 'DELETE' });
    if (!weg.ok && weg.status !== 404) throw new Error(`loeschen ${name}: ${weg.status}`);
    await gedrosselt();
    const um = await api(`/repos/${REPO}/releases/assets/${neu.id}`, {
      method: 'PATCH', body: JSON.stringify({ name }),
    });
    if (!um.ok) throw new Error(`umbenennen ${name}: ${um.status} ${(await um.text()).slice(0, 300)}`);
    neu = await um.json();
    vorhandene.delete(zwischenname);
  }
  vorhandene.set(name, neu);
}

/* ------------------------------------------------------------ Ablauf */

async function main() {
  const frisch = (name) => {
    if (!neuerAls) return true;
    const st = fs.statSync(path.join(DATEN, name));
    return Date.now() - st.mtimeMs < neuerAls * 60_000;
  };
  const alle = sammle().filter(gewuenscht);

  // Akten buendeln, alles andere einzeln.
  const einzeln = [];
  const buendel = new Map();
  for (const name of alle) {
    const m = name.match(/^akten\/([0-9a-f]{32})\.json$/i);
    if (m) {
      const k = `akten__${m[1].slice(0, 2).toLowerCase()}.json`;
      (buendel.get(k) ?? buendel.set(k, []).get(k)).push([m[1].toLowerCase(), name]);
    } else if (frisch(name)) {
      einzeln.push(name);
    }
  }

  // Je Release: Anhaenge, Manifest, Aufgaben.
  const releases = new Map();
  const releaseFuer = async (tag) => {
    if (releases.has(tag)) return releases.get(tag);
    const release = await releaseHolen(tag);
    const vorhandene = await anhaenge(release.id);
    const manifestAlt = vorhandene.get('manifest.json')
      ? JSON.parse((await anhangLesen(vorhandene.get('manifest.json')))?.toString('utf8') || '{}') : {};
    const eintrag = { tag, release, vorhandene, manifestAlt, manifest: { ...manifestAlt }, fertig: 0 };
    releases.set(tag, eintrag);
    return eintrag;
  };

  // Was hochgeladen wird: Name des Anhangs -> Bytes, je Release.
  const aufgaben = [];
  for (const name of einzeln) {
    const daten = fs.readFileSync(path.join(DATEN, name));
    const anhang = anhangName(name);
    const summe = /^antworten\//.test(name) ? antwortSumme(daten) : pruefsumme(daten);
    const rel = await releaseFuer(tagFuer(name));
    if (!erzwingen && rel.manifestAlt[anhang]?.summe === summe && rel.vorhandene.has(anhang)) continue;
    /*
     * Eine fertige Antwort nie mit einem aelteren Stand ueberschreiben.
     *
     * Der Laufrechner und der Betreiber-Rechner laden beide hoch. Am
     * 17.9.2026 legte der Lauf eine Jahresliste vom Vortag ueber die
     * frische - seine Berechnung war gescheitert, die alte Datei lag noch
     * in seinem Zwischenspeicher. Jede Antwort traegt "zeit"; die steht
     * jetzt im Manifest, und wer Aelteres bringt, darf nicht.
     */
    let inhaltZeit = 0;
    if (/^antworten\//.test(name)) {
      try { inhaltZeit = Number(JSON.parse(daten.toString('utf8'))?.zeit) || 0; } catch { /* keine Antwort */ }
      const dort = Number(rel.manifestAlt[anhang]?.inhaltZeit) || 0;
      if (!erzwingen && inhaltZeit && dort && inhaltZeit < dort && rel.vorhandene.has(anhang)) continue;
    }
    aufgaben.push({ rel, anhang, daten, summe, inhaltZeit });
  }
  for (const [anhang, dateien] of buendel) {
    const rel = await releaseFuer('daten-akten');
    if (neuerAls && !dateien.some(([, name]) => frisch(name))) {
      if (rel.vorhandene.has(anhang)) continue;
    }
    const inhalt = {};
    for (const [id, name] of dateien.sort((a, b) => a[0].localeCompare(b[0]))) {
      try { inhalt[id] = JSON.parse(fs.readFileSync(path.join(DATEN, name), 'utf8')); } catch { /* kaputt - weglassen */ }
    }
    const daten = Buffer.from(JSON.stringify(inhalt), 'utf8');
    const summe = pruefsumme(daten);
    if (!erzwingen && rel.manifestAlt[anhang]?.summe === summe && rel.vorhandene.has(anhang)) continue;
    aufgaben.push({ rel, anhang, daten, summe, inhaltZeit: 0 });
  }

  const umfang = aufgaben.reduce((s, a) => s + a.daten.length, 0);
  console.log('');
  for (const rel of releases.values()) console.log(`  Release   : ${REPO} #${rel.tag} (${rel.vorhandene.size} Anhaenge vorhanden)`);
  console.log(`  Dateien   : ${alle.length} passend, ${aufgaben.length} zu uebertragen`);
  console.log(`  Umfang    : ${(umfang / 1024 / 1024).toFixed(1)} MB`);
  if (nur.length) console.log(`  Nur       : ${nur.join(', ')}`);
  if (neuerAls) console.log(`  Nur juenger als: ${neuerAls} Minuten`);
  console.log('');
  if (probe) {
    for (const a of aufgaben.slice(0, 40)) console.log(`    ${a.anhang} (${(a.daten.length / 1024).toFixed(0)} KB)`);
    if (aufgaben.length > 40) console.log(`    … und ${aufgaben.length - 40} weitere`);
    console.log('\n  Nur eine Probe - es wurde nichts uebertragen.\n');
    return;
  }

  let fertig = 0; let schief = 0; const fehler = [];
  let naechste = 0;
  /*
   * Das Manifest nicht erst ganz am Ende schreiben.
   *
   * Bricht der Lauf ab (Zeitgrenze des Auftrags), wusste das Manifest sonst
   * nichts von den Anhaengen, die schon oben waren - der naechste Lauf lud
   * sie alle noch einmal hoch und brach wieder ab. Alle vierzig Anhaenge
   * je Release steht der Zwischenstand oben.
   */
  const manifestSchreiben = async (rel) => {
    try {
      await hochladen(rel.release.id, rel.vorhandene, 'manifest.json', Buffer.from(JSON.stringify(rel.manifest), 'utf8'));
      rel.manifestStand = rel.fertig;
    } catch (e) { fehler.push(`${rel.tag}/manifest.json: ${e.message}`); }
  };
  let manifestLaeuft = Promise.resolve();
  const arbeiter = async () => {
    while (naechste < aufgaben.length) {
      const a = aufgaben[naechste++];
      try {
        await hochladen(a.rel.release.id, a.rel.vorhandene, a.anhang, a.daten);
        a.rel.manifest[a.anhang] = {
          summe: a.summe, groesse: a.daten.length, zeit: new Date().toISOString(),
          ...(a.inhaltZeit ? { inhaltZeit: a.inhaltZeit } : {}),
        };
        a.rel.fertig += 1;
        fertig += 1;
        if (a.rel.fertig - (a.rel.manifestStand ?? 0) >= 40) {
          const rel = a.rel; rel.manifestStand = rel.fertig;
          manifestLaeuft = manifestLaeuft.then(() => manifestSchreiben(rel));
        }
      } catch (e) {
        schief += 1; fehler.push(`${a.anhang}: ${e.message}`);
      }
      process.stdout.write(`\r  ${String(fertig + schief).padStart(5)}/${aufgaben.length}  ${a.anhang.slice(0, 56).padEnd(56)}`);
    }
  };
  await Promise.all(Array.from({ length: GLEICHZEITIG }, arbeiter));
  await manifestLaeuft;

  for (const rel of releases.values()) {
    if (!rel.fertig || rel.fertig === rel.manifestStand) continue;
    await manifestSchreiben(rel);
  }
  console.log('');
  console.log(`  Uebertragen : ${fertig}`);
  console.log(`  Gescheitert : ${schief}`);
  for (const f of fehler.slice(0, 20)) console.log(`    - ${f}`);
  console.log('');
  process.exit(schief ? 1 : 0);
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
