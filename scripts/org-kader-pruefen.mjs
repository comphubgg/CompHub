// Die Kader der E-Sports-Organisationen taeglich mit Liquipedia abgleichen.
//
// Der Betreiber (29.9.2026): "fuege bei der eSports-Page auch eine
// automatische Analyse taeglich durch, ob diese Spieler wirklich auch noch
// im Team sind" - Spieler posten auf X ein "LFO" und sind dann weg, und bei
// manchen Orgs fehlten Spieler, die laengst dort sind.
//
// Quelle ist Liquipedia (CC BY-SA 3.0, kostenlos, ohne Schluessel). Liquipedia
// erlaubt eine Anfrage je zwei Sekunden und einen Seitenaufbau ("parse") je
// dreissig Sekunden. Die Teamseiten fuehren ihren Kader nicht mehr im
// Quelltext ({{ActiveSquadAuto}} wird aus den Spielerseiten gebaut) - er steht
// nur in der fertigen Seite, in den Tabellen "Active" und "Former".
//
// Der erste Probelauf am 29.9.2026 fragte je Org einzeln und im
// Zwei-Sekunden-Takt nach dem Seitenaufbau und brach nach 40 Minuten ohne
// Ergebnis ab. Jetzt:
//   1. Welche Orgs eine Teamseite haben, klaert eine Sammelabfrage - bis zu 50
//      Titel je Anfrage ("Name", "Team Name", "Name (team)", "Name Esports").
//   2. Nur diese Seiten werden aufgebaut, im Dreissig-Sekunden-Takt.
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
  // Seitenaufbau: hoechstens einer je dreissig Sekunden (Liquipedias Regel).
  const takt = params.action === 'parse' ? 31_000 : 2500;
  for (let versuch = 0; versuch < 3; versuch++) {
    const pause = takt - (Date.now() - zuletzt);
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

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Welche Orgs eine Teamseite haben - in Sammelabfragen zu 50 Titeln.
 * Gibt je Org den Seitentitel zurueck (Map org.name -> Titel).
 */
async function teamSeiten(orgs) {
  const kandidaten = new Map(); // angefragter Titel -> Org-Namen
  for (const org of orgs) {
    const namen = org.liquipedia ? [org.liquipedia]
      : [org.name, `Team ${org.name}`, `${org.name} (team)`, `${org.name} Esports`];
    for (const n of namen) {
      const t = String(n).trim();
      if (!t) continue;
      if (!kandidaten.has(t)) kandidaten.set(t, []);
      kandidaten.get(t).push(org.name);
    }
  }
  const titel = [...kandidaten.keys()];
  const ziel = new Map(); // angefragter Titel -> endgueltige Teamseite
  for (let i = 0; i < titel.length; i += 50) {
    const stueck = titel.slice(i, i + 50);
    const j = await api({ action: 'query', titles: stueck.join('|'), redirects: '1',
      prop: 'revisions', rvprop: 'content', rvslots: 'main' });
    const q = j?.query;
    if (!q) continue;
    const weiter = new Map();
    for (const n of q.normalized ?? []) weiter.set(n.from, n.to);
    for (const r of q.redirects ?? []) weiter.set(r.from, r.to);
    const istTeam = new Set();
    for (const seite of Object.values(q.pages ?? {})) {
      const text = seite?.revisions?.[0]?.slots?.main?.['*'] ?? '';
      if (/\{\{\s*Infobox team/i.test(text)) istTeam.add(seite.title);
    }
    for (const t of stueck) {
      let e = t;
      for (let k = 0; k < 3 && weiter.has(e); k++) e = weiter.get(e);
      if (istTeam.has(e)) ziel.set(t, e);
    }
    console.log(`  Titel ${i + 1}-${i + stueck.length}: ${[...stueck].filter((t) => ziel.has(t)).length} Teamseiten`);
  }
  const jeOrg = new Map();
  for (const [t, orgNamen] of kandidaten) {
    if (!ziel.has(t)) continue;
    for (const o of orgNamen) if (!jeOrg.has(o)) jeOrg.set(o, ziel.get(t));
  }
  return jeOrg;
}

const entities = (s) => String(s).replace(/&#95;/g, '_').replace(/&#160;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"');

/** Die Spielerzeilen einer Kader-Tabelle: Name und die Datumsspalten. */
function zeilenAus(html) {
  const out = [];
  for (const m of html.matchAll(/<tr class="table2__row--body"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const zeile = m[1];
    const treffer = /class="inline-player"[\s\S]*?<a ([^>]*)>([^<]+)<\/a>/.exec(zeile);
    const spieler = treffer?.[2]?.trim();
    if (!spieler) continue;
    // Die Spielerseite (fuer das X-Konto weiter unten), aus dem Link.
    const href = /href="\/fortnite\/([^"#?]+)"/.exec(treffer[1])?.[1];
    let seite = null;
    try { seite = href ? decodeURIComponent(href).replace(/_/g, ' ') : null; } catch { seite = null; }
    // Die Daten aus dem sichtbaren Text der Zellen - die Fussnoten tragen
    // dasselbe Datum noch einmal in ihrer Kennung.
    const zellen = [...zeile.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((z) => z[1].replace(/<[^>]+>/g, ' '));
    const daten = zellen.map((z) => /\d{4}-\d{2}-\d{2}/.exec(z)?.[0]).filter(Boolean);
    out.push({ id: spieler, seite, beitritt: daten[0] ?? '', austritt: daten[1] ?? '' });
  }
  return out;
}

/**
 * Aktiver Kader und Ehemalige aus der fertigen Teamseite.
 *
 * Gelesen wird nur der Abschnitt "Player Roster": zwischen der Ueberschrift
 * "Active" und "Former" die Aktiven, danach bis zur naechsten
 * Hauptueberschrift ("Organization") die Ehemaligen. Die Tabellen unter
 * "Organization" (Besitzer, Manager) gehoeren nicht zum Kader.
 */
function kaderAus(rohHtml) {
  const html = entities(rohHtml);
  const aktiv = new Map(); const ehemalig = new Map();
  const a = html.indexOf('id="Active"');
  if (a < 0) return { aktiv, ehemalig };
  const f = html.indexOf('id="Former"', a);
  const naechsteH2 = (ab) => {
    const i = html.indexOf('mw-heading2', ab);
    return i < 0 ? html.length : i;
  };
  const aktivTeil = html.slice(a, f > 0 ? f : naechsteH2(a));
  const ehemaligTeil = f > 0 ? html.slice(f, naechsteH2(f)) : '';
  for (const z of zeilenAus(aktivTeil)) aktiv.set(z.id.toLowerCase(), z);
  for (const z of zeilenAus(ehemaligTeil)) ehemalig.set(z.id.toLowerCase(), z);
  return { aktiv, ehemalig };
}

async function main() {
  const roh = JSON.parse(fs.readFileSync(DATEI, 'utf8'));
  const orgs = Array.isArray(roh) ? roh : roh.orgs ?? [];
  /*
   * Derselbe Spieler, auch wenn eine Seite Zusaetze fuehrt ("27 twi" / "Twi")
   * oder Ziffern statt Buchstaben schreibt: Liquipedia fuehrt Vico als
   * "vic0" (mit Null). Der erste Abgleich am 30.9.2026 hielt das fuer einen
   * neuen Spieler und trug ihn bei BIG ein zweites Mal ein - der Betreiber:
   * "VIC0 ... das ist der gleiche Spieler wie ... Vico".
   *
   * Deshalb gefaltet (0->o, 1->i, 3->e, 4->a, 5->s, 7->t, kyrillische und
   * griechische Zwillingsbuchstaben), und dazu alle Namen, unter denen das
   * Konto eines Spielers je angetreten ist ("BIG vic0").
   */
  const ZWILLINGE = { 'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c',
    'т': 't', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'α': 'a', 'ε': 'e', 'ι': 'i', 'κ': 'k',
    'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'ν': 'v', 'ı': 'i', 'ł': 'l', 'ø': 'o' };
  const ZIFFERN = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' };
  const falte = (t) => [...String(t ?? '').normalize('NFKC').toLowerCase()].map((z) => ZWILLINGE[z] ?? z).join('')
    .replace(/[^a-z0-9]/g, '').replace(/[013457]/g, (z) => ZIFFERN[z]);
  const gleich = (a, b) => {
    const x = falte(a); const y = falte(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const [kurz, lang] = x.length <= y.length ? [x, y] : [y, x];
    return kurz.length >= 3 && (lang.startsWith(kurz) || lang.endsWith(kurz));
  };
  const namenVz = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(path.dirname(DATEI), 'spieler-namen.json'), 'utf8')); }
    catch { return {}; }
  })();
  const profilVz = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(path.dirname(DATEI), 'spieler-profile.json'), 'utf8')); }
    catch { return {}; }
  })();
  /** Alle gefalteten Namen, unter denen dieser Spieler bekannt ist. */
  const bekannteNamen = (sp) => {
    const roh = [sp.name];
    if (sp.epicId) {
      const e = namenVz[sp.epicId];
      roh.push(...(e?.namen ?? []), e?.haupt ?? '');
      const pr = profilVz[sp.epicId];
      roh.push(pr?.anzeige ?? '', pr?.name ?? '', ...(pr?.namen ?? []));
    }
    const raus = new Set();
    for (const n of roh) {
      if (!n) continue;
      raus.add(falte(n));
      // Ohne Orgtag und Startnummer: jedes Wort fuer sich ("BIG vic0 1!").
      for (const w of String(n).split(/\s+/)) { const f = falte(w); if (f.length >= 3) raus.add(f); }
    }
    raus.delete('');
    return raus;
  };
  /** Ist dieser Liquipedia-Eintrag der Spieler sp? */
  const derselbe = (sp, lpId) => gleich(sp.name, lpId) || bekannteNamen(sp).has(falte(lpId));
  const aenderungen = [];
  let geprueft = 0;
  console.log(`${orgs.length} Orgs - Teamseiten suchen`);
  const seiten = await teamSeiten(orgs);
  console.log(`${seiten.size} Orgs mit Teamseite, Aufbau je 31 s (etwa ${Math.ceil(seiten.size * 31 / 60)} min)`);
  for (const org of orgs) {
    const seite = seiten.get(org.name);
    if (!seite) continue;
    if (!org.liquipedia) org.liquipedia = seite;
    const j = await api({ action: 'parse', page: seite, prop: 'text', disablelimitreport: '1', disableeditsection: '1' });
    const text = j?.parse?.text?.['*'];
    if (!text) { console.log(`  ${org.name} (${seite}): keine Antwort`); continue; }
    const { aktiv, ehemalig } = kaderAus(text);
    console.log(`  ${org.name} (${seite}): ${aktiv.size} aktiv, ${ehemalig.size} ehemalig`);
    if (!aktiv.size && !ehemalig.size) continue;
    geprueft += 1;
    const spieler = org.spieler ?? [];
    // Weg: bei Liquipedia ehemalig und nicht mehr aktiv (nur Spieler, keine Creator).
    const bleiben = spieler.filter((sp) => {
      if (sp.rolle === 'creator') return true;
      const weg = [...ehemalig.values()].some((e) => derselbe(sp, e.id))
        && ![...aktiv.values()].some((a) => derselbe(sp, a.id));
      if (weg) {
        const e = [...ehemalig.values()].find((x) => derselbe(sp, x.id));
        aenderungen.push(`${org.name}: **${sp.name}** left${e?.austritt ? ` (${e.austritt})` : ''}`);
      }
      return !weg;
    });
    // Dazu: bei Liquipedia aktiv, bei uns nicht.
    for (const a of aktiv.values()) {
      const da = bleiben.find((sp) => derselbe(sp, a.id));
      if (da) {
        // Die Spielerseite merken - daran haengt die Zuordnung ueber X.
        if (!da.liquipedia && a.seite && !da.epicId) da.liquipedia = a.seite;
        continue;
      }
      bleiben.push({ epicId: null, name: a.id, seit: /^\d{4}-\d{2}-\d{2}$/.test(a.beitritt) ? a.beitritt : null,
        rolle: 'pro', x: null, twitch: null, tiktok: null, youtube: null,
        ...(a.seite ? { liquipedia: a.seite } : {}) });
      aenderungen.push(`${org.name}: **${a.id}** joined${a.beitritt ? ` (${a.beitritt})` : ''} - Epic account still to assign`);
    }
    org.spieler = bleiben;
  }
  /*
   * Doppelte in derselben Org entfernen.
   *
   * Was der Abgleich vom 30.9.2026 unter einer anderen Schreibweise schon
   * eingetragen hat ("vic0" neben "Vico"), faellt hier wieder heraus: ein
   * Eintrag ohne Epic-Konto, der derselbe Spieler ist wie ein anderer Eintrag
   * derselben Org mit Konto.
   */
  for (const org of orgs) {
    const liste = org.spieler ?? [];
    const mitKonto = liste.filter((sp) => sp.epicId);
    const raus = new Set();
    for (const sp of liste) {
      if (sp.epicId || sp.rolle === 'creator') continue;
      const original = mitKonto.find((o) => o !== sp && derselbe(o, sp.name));
      if (!original) continue;
      raus.add(sp);
      aenderungen.push(`${org.name}: removed duplicate **${sp.name}** (same player as ${original.name})`);
    }
    if (raus.size) org.spieler = liste.filter((sp) => !raus.has(sp));
  }

  /*
   * Das Epic-Konto ueber das X-Konto - nie ueber den Namen.
   *
   * Liquipedia fuehrt kein Epic-Konto, aber auf jeder Spielerseite das
   * X-Konto. Die gepflegten Profile tragen ihr X-Konto an der Konto-Id. Passt
   * das X-Konto einer Spielerseite genau auf ein Profil, ist das dasselbe
   * Konto; gibt es keinen oder mehr als einen Treffer, bleibt der Spieler
   * zum Zuordnen stehen.
   */
  const handle = (x) => String(x ?? '').trim().toLowerCase()
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//, '').replace(/^@/, '').replace(/[/?#].*$/, '');
  const kontoNachX = new Map();
  for (const [schl, pr] of Object.entries(profilVz)) {
    const id = /^[0-9a-f]{32}$/.test(schl) ? schl : (/^[0-9a-f]{32}$/.test(pr?.id ?? '') ? pr.id : null);
    const h = handle(pr?.x);
    if (!id || !h) continue;
    if (!kontoNachX.has(h)) kontoNachX.set(h, new Set());
    kontoNachX.get(h).add(id);
  }
  const offen = [];
  for (const org of orgs) for (const sp of org.spieler ?? []) {
    if (!sp.epicId && sp.liquipedia) offen.push({ org, sp });
  }
  const xVonSeite = new Map();
  const seitenListe = [...new Set(offen.map((o) => o.sp.liquipedia))];
  for (let i = 0; i < seitenListe.length && kontoNachX.size; i += 50) {
    const j = await api({ action: 'query', titles: seitenListe.slice(i, i + 50).join('|'), redirects: '1',
      prop: 'revisions', rvprop: 'content', rvslots: 'main' });
    const q = j?.query;
    const weiter = new Map();
    for (const n of q?.normalized ?? []) weiter.set(n.to, n.from);
    for (const r of q?.redirects ?? []) weiter.set(r.to, weiter.get(r.from) ?? r.from);
    for (const seite of Object.values(q?.pages ?? {})) {
      const text = seite?.revisions?.[0]?.slots?.main?.['*'] ?? '';
      const x = /\|\s*twitter\s*=\s*([^|\n}]+)/i.exec(text)?.[1];
      if (x) {
        xVonSeite.set(seite.title, handle(x));
        if (weiter.has(seite.title)) xVonSeite.set(weiter.get(seite.title), handle(x));
      }
    }
  }
  let verknuepft = 0;
  for (const { org, sp } of offen) {
    const h = xVonSeite.get(sp.liquipedia);
    const ids = h ? kontoNachX.get(h) : null;
    if (!ids || ids.size !== 1) continue;
    sp.epicId = [...ids][0];
    if (!sp.x) sp.x = h;
    verknuepft += 1;
    aenderungen.push(`${org.name}: **${sp.name}** linked to their Epic account via X @${h}`);
  }
  console.log(`${offen.length} ohne Epic-Konto, ${xVonSeite.size} X-Konten gelesen, ${verknuepft} ueber X zugeordnet`);

  console.log(`${geprueft} Orgs mit Liquipedia-Kader geprueft, ${aenderungen.length} Aenderungen`);
  for (const a of aenderungen) console.log(`  ${a.replace(/\*\*/g, '')}`);
  if (PROBE) return;
  fs.writeFileSync(DATEI, JSON.stringify(roh, null, 1));
  fs.writeFileSync(path.join(path.dirname(DATEI), '.kader-aenderungen.json'), JSON.stringify(aenderungen));
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
