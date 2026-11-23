/*
 * Flaggen (Land), X-/Twitch-Konten UND den sauberen Szene-Namen (Anzeigename) der wichtigen Spieler aus Liquipedia nachtragen (Betreiber, 16.11.2026:
 * "jeder wichtige Spieler muss eine Flagge und ein X-Handle haben"; 23.11.2026: besonders viele US-/Amerika-Flaggen fehlen, und viele Spieler zeigen noch
 * ihren rohen Ingame-Namen statt eines sauberen Namens). Ergaenzt scripts/socials-finden.mjs (X/Twitch/Flagge ueber FixTweet/Twitch) um eine zweite,
 * unabhaengige Quelle: Liquipedias Spieler-Infoboxen. Der saubere Name ist Liquipedias id-Feld (der Wettkampfname). Ergebnis landet in denselben Dateien
 * (spieler-profile.json: land/x/twitch/anzeige) und erscheint automatisch im Profil, auf Plakaten/Bestenlisten und in /admin/flaggen zum Pruefen.
 *
 * Wer wird abgesucht: die wichtigen Spieler (spieler-kreis/_wichtig.json, wie /admin/flaggen und socials-finden - aus unseren eigenen Cup-Bestenlisten
 * gerechnet: Top 100 der grossen FNCS-Finals/Heats/Halbfinals), denen die Flagge ODER das X-Konto fehlt. Sortiert nach Wichtigkeit.
 *
 * Liquipedia (CC BY-SA 3.0), nur oeffentlich und hoeflich:
 *   - NUR action=query (prop=revisions fuer den Quelltext der Seite, list=search fuer die Suche) - NIE action=parse.
 *   - User-Agent "CompHub-stats-bot/1.0", gzip (--compressed), hoechstens eine Anfrage je gut zwei Sekunden, bei 429 immer laenger warten.
 *   - Ueber curl, nicht ueber fetch: Liquipedias Schutz sperrt Nodes eigenen Abruf schnell als Scraper, curl mit demselben UA antwortet weiter
 *     (wie scripts/preisgeld-liquipedia.mjs). Der Agenten-Sandkasten teilt sich eine IP und wird darum oft gedrosselt; die GitHub-Rechner nicht.
 *
 * Zuordnung SICHER (lib/liquipediaInfobox.mjs bewertePage): nur automatisch (-> spieler-profile.json, protokolliert in socials-auto.json), wenn der
 * Szene-Name exakt stimmt UND die Region zum Land passt (NAC/NAW = NA) UND die Seite direkt ueber den Namen gefunden wurde. Alles andere, was dem Namen
 * nach noch passen koennte, ist ein Vorschlag (socials-vorschlaege.json) - der Betreiber bestaetigt ihn mit einem Klick. Ein von Hand gepflegter Wert
 * wird nie ueberschrieben (nur leere Felder, gegen den frisch gelesenen Stand - wie scripts/socials-finden.mjs).
 *
 *   node scripts/liquipedia-flaggen.mjs [--minuten 300] [--max N] [--region EU,NAC] [--nur <epicId,...>] [--tage 30]   suchen, nichts schreiben
 *   node scripts/liquipedia-flaggen.mjs --anwenden [...]                                                              suchen und schreiben
 * Laeuft woechentlich in .github/workflows/liquipedia-flaggen.yml (dort mit DATEN_TOKEN -> Archiv comphub-daten). Setzt fort, wo er aufhoerte
 * (liquipedia-geprueft.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createJiti } from 'jiti';
import * as L from '../lib/liquipediaInfobox.mjs';
import { grundformen, spielerWoerter, namePasst } from '../lib/socialsFinder.mjs';

const ausfuehren = promisify(execFile);
const PROJEKT = path.resolve(import.meta.dirname, '..');
for (const z of (() => { try { return fs.readFileSync(path.join(PROJEKT, '.env.local'), 'utf8').split('\n'); } catch { return []; } })()) {
  const m = z.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}
console.error(`Umgebung: ${Object.keys(process.env).filter((k) => /TOKEN|ABLAGE|DATEN/.test(k)).sort().join(', ') || '-'}`);
const jiti = createJiti(import.meta.url, { alias: { '@': PROJEKT }, interopDefault: true });
const { liesJson, aendereJson } = await jiti.import(path.join(PROJEKT, 'lib/ablage.ts'));
const { PROFIL_DATEI, wendeAn } = await jiti.import(path.join(PROJEKT, 'lib/spielerProfil.ts'));
const { kernname, namensSchluessel, gefaltet } = await jiti.import(path.join(PROJEKT, 'lib/homoglyph.ts'));
const { landAusEingabe } = await jiti.import(path.join(PROJEKT, 'lib/laender.ts'));
const { regionVonLand } = await jiti.import(path.join(PROJEKT, 'lib/landRegion.ts'));

const DEPS = { landAusEingabe, regionVonLand, namensSchluessel, gefaltet, grundformen, kernname, namePasst, spielerWoerter };

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const hat = (n) => process.argv.includes(n);
const ANWENDEN = hat('--anwenden');
const MINUTEN = Number(arg('--minuten', 300));
const MAX = Number(arg('--max', 0)) || Infinity;
const TAGE = Number(arg('--tage', 30));
const NUR = String(arg('--nur', '') ?? '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => /^[0-9a-f]{32}$/.test(x));
const REGIONEN = new Set(String(arg('--region', '') ?? '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean));
const LAUF = `${new Date().toISOString().slice(0, 16)}Z`;
const ENDE = Date.now() + MINUTEN * 60e3;
const GEPRUEFT_DATEI = 'liquipedia-geprueft.json';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error(...a);
const leer = (v) => !String(v ?? '').trim();

/* ------------------------------------------------------------------ Liquipedia hoeflich abrufen (nur action=query, ueber curl) */

const UA = 'CompHub-stats-bot/1.0';
const API = 'https://liquipedia.net/fortnite/api.php';
const ABSTAND = Number(process.env.LQ_ABSTAND) || 2600;
const zaehler = { anfragen: 0, 429: 0, fehler: 0, seiten: 0, suchen: 0 };
let zuletzt = 0;
async function api(params) {
  const url = `${API}?${new URLSearchParams({ ...params, format: 'json', maxlag: '5' })}`;
  for (let versuch = 0; versuch < 8; versuch += 1) {
    const pause = ABSTAND - (Date.now() - zuletzt);
    if (pause > 0) await warte(pause);
    zuletzt = Date.now();
    zaehler.anfragen += 1;
    let stdout = '';
    try {
      ({ stdout } = await ausfuehren('curl', ['-s', '--compressed', '-A', UA, '--max-time', '60', '-w', '\n%{http_code}', url], { maxBuffer: 64 * 1024 * 1024 }));
    } catch { stdout = '\n0'; }
    const trenn = stdout.lastIndexOf('\n');
    const status = Number(stdout.slice(trenn + 1).trim());
    const text = stdout.slice(0, trenn);
    if (status === 429 || status >= 500 || status === 0) {
      if (status === 429) zaehler[429] += 1; else zaehler.fehler += 1;
      const p = Math.min(240_000, 15_000 * 2 ** versuch);
      log(`  ${status} von Liquipedia - ${p / 1000} s Pause`);
      await warte(p);
      continue;
    }
    if (status !== 200) { zaehler.fehler += 1; return null; }
    try { return JSON.parse(text); } catch { return null; }
  }
  return null;
}

const seitenCache = new Map();
// Anfragen, die trotz Wiederholung nichts lieferten (Drosselung/Aussetzer) - ein Spieler mit so einem Fehlschlag gilt NICHT als abgesucht und wird
// spaeter erneut versucht, statt ihn 30 Tage lang auszulassen (Betreiber-Hauptregel: nie vorschnell "keine Seite" sagen).
let fehlschlaege = 0;
/** Der Quelltext einer Seite (nach Weiterleitung/Normalisierung) oder null. { titel, wikitext }. */
async function seiteWikitext(titel) {
  const k = titel.toLowerCase();
  if (seitenCache.has(k)) return seitenCache.get(k);
  zaehler.seiten += 1;
  const d = await api({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', redirects: '1', titles: titel });
  if (d === null) { fehlschlaege += 1; return null; }
  let raus = null;
  const seiten = d?.query?.pages ?? {};
  for (const p of Object.values(seiten)) {
    if (p.missing !== undefined || p.invalid !== undefined) continue;
    const w = p.revisions?.[0]?.slots?.main?.['*'];
    if (w) { raus = { titel: p.title || titel, wikitext: w }; break; }
  }
  seitenCache.set(k, raus);
  return raus;
}

/** Volltextsuche im Hauptnamensraum - die ersten Titel. */
async function suche(text) {
  zaehler.suchen += 1;
  const d = await api({ action: 'query', list: 'search', srsearch: text, srnamespace: '0', srlimit: '5' });
  if (d === null) { fehlschlaege += 1; return null; }
  return (d?.query?.search ?? []).map((x) => x.title);
}

/* ------------------------------------------------------------------ Eine Seite zu einem Spieler finden. Gibt { felder, titel, quelle } oder null;
 * `throttled` = true, wenn eine Anfrage fuer diesen Spieler ohne Antwort blieb und nicht sicher ist, dass es wirklich keine Seite gibt. */

async function findeSeite(spieler) {
  const f0 = fehlschlaege;
  const abschluss = (r) => { r = r ?? null; if (r) return r; return fehlschlaege > f0 ? { throttled: true } : null; };
  // 1. Direkt ueber den Namen: die Infobox muss existieren UND der Name exakt passen.
  for (const titel of L.titelKandidaten(spieler.namen, DEPS)) {
    if (Date.now() > ENDE) break;
    const s = await seiteWikitext(titel);
    if (!s) continue;
    const felder = L.infoboxFelder(s.wikitext);
    if (!felder) continue;
    const b = L.bewertePage(felder, s.titel, spieler, 'titel', DEPS);
    if (b.nameStufe === 'exakt') return { felder, titel: s.titel, quelle: 'titel' };
  }
  // 2. Suche - hoechstens eine je Spieler, nur der plausibelste Treffer. Mit einer entschaerften (zwillingsfreien) Grundform, damit Namen mit
  // kyrillischen Zwillingen ("shаdоw") ueberhaupt gefunden werden.
  if (Date.now() > ENDE) return abschluss(null);
  const sauber = [...new Set(spieler.namen.flatMap((n) => grundformen(n, kernname)))][0] || spieler.namen[0];
  const kand = await suche(`${sauber} Fortnite`);
  for (const titel of (kand ?? []).slice(0, 3)) {
    if (Date.now() > ENDE) break;
    if (/\b(disambiguation|Begriffsklärung)\b/i.test(titel)) continue;
    const s = await seiteWikitext(titel);
    if (!s) continue;
    const felder = L.infoboxFelder(s.wikitext);
    if (!felder) continue;
    const b = L.bewertePage(felder, s.titel, spieler, 'suche', DEPS);
    if (b.nameStufe) return { felder, titel: s.titel, quelle: 'suche' };
  }
  return abschluss(null);
}

/* ------------------------------------------------------------------ Daten laden (wie scripts/socials-finden.mjs) */

async function vomRelease(name) {
  const anhang = name.replace(/\//g, '__');
  for (const tag of ['daten-rangliste', 'daten-spieltage', 'daten']) {
    const r = await fetch(`https://github.com/comphubgg/CompHub/releases/download/${tag}/${encodeURIComponent(anhang)}`, { redirect: 'follow', signal: AbortSignal.timeout(120_000) }).catch(() => null);
    if (r?.ok) return r.json().catch(() => null);
  }
  return null;
}
const releaseJson = async (name, standard) => (await liesJson(name, null).catch(() => null)) ?? (await vomRelease(name)) ?? standard;

const kern = (w) => w[1] + w[2] + w[3] >= 2 || w[4] >= 3;

async function ladeDaten() {
  const [wichtig, namen, profile] = await Promise.all([
    releaseJson('spieler-kreis/_wichtig.json', null),
    releaseJson('spieler-namen.json', {}),
    liesJson(PROFIL_DATEI, {}),
  ]);
  if (!wichtig?.konten) throw new Error('spieler-kreis/_wichtig.json fehlt (Release) - nichts zu tun');
  if (ANWENDEN && !Object.keys(profile).length) throw new Error('--anwenden braucht eine lesbare spieler-profile.json - nichts geschrieben');
  log(`Daten: ${Object.keys(wichtig.konten).length} Konten, ${Object.keys(namen).length} Namen, ${Object.keys(profile).length} Profile`);
  return { wichtig, namen, profile };
}

function nachId(profile) {
  const id = new Map(); const name = new Map();
  for (const [k, p] of Object.entries(profile)) {
    const i = String(p.id || (/^[0-9a-f]{32}$/i.test(k) ? k : '')).toLowerCase();
    if (i) id.set(i, p); else name.set(k, p);
  }
  return { id, name };
}
/** Was unter einem Konto schon gespeichert ist (Hauptkonto oder Alteintrag unter dem Namen). */
function gespeichert(id, namenListe, s) {
  const quellen = [s.id.get(id)];
  for (const n of namenListe) { const p = s.name.get(namensSchluessel(n)); if (p) { quellen.push(p); break; } }
  const feld = (f) => quellen.map((p) => String(p?.[f] ?? '').trim()).find(Boolean) ?? '';
  return { land: feld('land').toUpperCase(), x: feld('x'), twitch: feld('twitch'), anzeige: feld('anzeige') };
}

function spielerListe(d) {
  const s = nachId(d.profile);
  const liste = [];
  for (const [id, w] of Object.entries(d.wichtig.konten)) {
    if (w[11] || !kern(w)) continue;
    const b = d.namen[id];
    const namenListe = [...new Set([w[9], b?.haupt ?? '', ...(b?.namen ?? [])].map((n) => String(n ?? '').trim()).filter(Boolean))];
    const eigen = s.id.get(id);
    const name = eigen?.anzeige || namenListe[0] || '';
    if (!name || /^\[[^\]]+\]/.test(name)) continue; // reine Turnierkonten uebergehen
    const region = (eigen?.region || w[8] || '').toUpperCase();
    liste.push({ id, name, namen: namenListe, region, punkte: w[0], hat: gespeichert(id, namenListe, s) });
  }
  return liste.sort((a, b) => b.punkte - a.punkte);
}

/* ------------------------------------------------------------------ Schreiben (nur leere Felder, gegen den frischen Stand) */

async function eintragen(fertig) {
  const eingetragen = [];
  await aendereJson(PROFIL_DATEI, {}, (profile) => {
    eingetragen.length = 0;
    const s = nachId(profile);
    const xHalter = new Map(); const twHalter = new Map();
    for (const [i, p] of s.id) { if (p.x) xHalter.set(p.x.toLowerCase(), i); if (p.twitch) twHalter.set(p.twitch.toLowerCase(), i); }
    for (const f of fertig) {
      const jetzt = gespeichert(f.p.id, f.p.namen, s);
      if (!leer(jetzt[f.feld])) continue; // nie ueberschreiben
      if (f.feld === 'x') { const h = xHalter.get(f.wert.toLowerCase()); if (h && h !== f.p.id) continue; }
      if (f.feld === 'twitch') { const h = twHalter.get(f.wert.toLowerCase()); if (h && h !== f.p.id) continue; }
      wendeAn(profile, { id: f.p.id, name: f.p.namen[0] || f.p.name, schluessel: f.p.id, felder: { [f.feld]: f.wert } });
      eingetragen.push(f);
      if (f.feld === 'x') xHalter.set(f.wert.toLowerCase(), f.p.id);
      if (f.feld === 'twitch') twHalter.set(f.wert.toLowerCase(), f.p.id);
    }
  });
  if (eingetragen.length) {
    await aendereJson('socials-auto.json', { eintraege: [] }, (a) => {
      a.eintraege ??= [];
      for (const f of eingetragen) {
        if (a.eintraege.some((e) => e.id === f.p.id && e.feld === f.feld && e.wert === f.wert)) continue;
        a.eintraege.push({ id: f.p.id, name: f.p.name, feld: f.feld, wert: f.wert, zeit: Date.now(), lauf: LAUF, belege: f.belege, status: 'offen' });
      }
    });
  }
  return eingetragen;
}

async function ablegen(vorschlaege, geprueft) {
  if (vorschlaege.length) {
    await aendereJson('socials-vorschlaege.json', { zeilen: {} }, (v) => {
      v.zeilen ??= {};
      let geaendert = false;
      for (const { p, treffer } of vorschlaege) {
        const z = v.zeilen[p.id] ?? { name: p.name, abgelehnt: {} };
        let neu = false;
        for (const f of ['x', 'twitch', 'land', 'anzeige']) {
          const r = treffer[f];
          // Nur in ein FREIES Feld schreiben - einen vorhandenen Vorschlag (etwa von scripts/socials-finden.mjs, mit eigenen Belegen) nie ueberschreiben.
          if (r && r.stufe === 'vorschlag' && !z[f] && !(z.abgelehnt?.[f] ?? []).includes(String(r.wert).toLowerCase())) { z[f] = { wert: r.wert, belege: r.belege, andere: [] }; neu = true; }
        }
        if (neu) { z.name = z.name || p.name; z.zeit = Date.now(); z.lauf = LAUF; v.zeilen[p.id] = z; geaendert = true; }
      }
      if (geaendert) v.stand = Date.now();
    });
  }
  await aendereJson(GEPRUEFT_DATEI, {}, (g) => { for (const [id, t] of geprueft) g[id] = t; });
}

/* ------------------------------------------------------------------ Lauf */

async function lauf(d) {
  const geprueftAlt = await liesJson(GEPRUEFT_DATEI, {});
  // Offen = Flagge ODER X ODER sauberer Anzeigename fehlt. Den Namen gibt die Liquipedia-Seite ohnehin mit (kein zusaetzlicher Abruf), also tragen wir ihn
  // bei jeder gefundenen Seite gleich mit nach.
  let liste = spielerListe(d).filter((p) => leer(p.hat.land) || leer(p.hat.x) || leer(p.hat.anzeige));
  if (NUR.length) liste = liste.filter((p) => NUR.includes(p.id));
  // Sonst: nicht in den letzten TAGE Tagen abgesucht - ODER der Anzeigename fehlt noch und der letzte Lauf hat ihn gar nicht erst versucht (aeltere
  // Laeufe, die nur Flagge/X suchten; geprueft-Eintrag ohne 'anzeige'-Schluessel). So holt der erste Lauf mit Namensuche die Namen gleich nach.
  else liste = liste.filter((p) => { const g = geprueftAlt[p.id]; return (g?.zeit ?? 0) < Date.now() - TAGE * 864e5 || (leer(p.hat.anzeige) && !!g && !('anzeige' in g)); });
  if (REGIONEN.size) liste = liste.filter((p) => REGIONEN.has(p.region));
  liste = liste.slice(0, MAX === Infinity ? liste.length : MAX);
  log(`${liste.length} wichtige Spieler offen (Flagge, X oder Anzeigename fehlt${REGIONEN.size ? `, Region ${[...REGIONEN].join('/')}` : ''}${NUR.length ? ', ausgewaehlt' : `, nicht in den letzten ${TAGE} Tagen`}). Budget ${MINUTEN} min, ${ANWENDEN ? 'ANWENDEN' : 'nur Plan'}.`);

  const summe = { spieler: 0, seiteGefunden: 0, auto: { land: 0, x: 0, twitch: 0, anzeige: 0 }, vorschlag: { land: 0, x: 0, twitch: 0, anzeige: 0 }, eingetragen: { land: 0, x: 0, twitch: 0, anzeige: 0 }, beispiele: [] };
  let puffer = []; let vorschlaege = []; let geprueft = [];
  const leeren = async () => {
    if (ANWENDEN) {
      const ein = puffer.length ? await eintragen(puffer) : [];
      for (const f of ein) summe.eingetragen[f.feld] += 1;
      await ablegen(vorschlaege, geprueft);
    }
    puffer = []; vorschlaege = []; geprueft = [];
  };

  for (const p of liste) {
    if (Date.now() > ENDE) { log('Budget erreicht - der naechste Lauf setzt fort.'); break; }
    summe.spieler += 1;
    const seite = await findeSeite(p).catch((e) => { log(`  Fehler bei ${p.name}: ${e.message}`); return { throttled: true }; });
    // Gedrosselt und nichts gefunden: diesen Spieler NICHT als abgesucht vermerken, damit der naechste Lauf ihn erneut versucht.
    if (seite?.throttled) { summe.gedrosselt = (summe.gedrosselt ?? 0) + 1; log(`  ${summe.spieler}. ${p.name} [${p.region}] (gedrosselt - naechster Lauf erneut)`); continue; }
    const treffer = {};
    let titel = null;
    if (seite) {
      summe.seiteGefunden += 1;
      titel = seite.titel;
      const b = L.bewertePage(seite.felder, seite.titel, p, seite.quelle, DEPS);
      for (const f of ['land', 'x', 'twitch', 'anzeige']) {
        const r = b[f];
        if (!r) continue;
        treffer[f] = r;
        summe[r.stufe][f] += 1;
        if (r.stufe === 'auto') puffer.push({ p, feld: f, wert: r.wert, belege: r.belege });
        if (summe.beispiele.length < 60) summe.beispiele.push({ name: p.name, region: p.region, feld: f, wert: r.wert, stufe: r.stufe, titel: seite.titel });
      }
    }
    if (Object.keys(treffer).length) vorschlaege.push({ p, treffer });
    geprueft.push([p.id, { zeit: Date.now(), titel, land: treffer.land?.stufe ?? null, x: treffer.x?.stufe ?? null, twitch: treffer.twitch?.stufe ?? null, anzeige: treffer.anzeige?.stufe ?? null }]);
    log(`  ${summe.spieler}. ${p.name} [${p.region}] ${titel ? `-> ${titel}` : '(keine Seite)'}${treffer.anzeige ? ` · Name ${treffer.anzeige.stufe} ${treffer.anzeige.wert}` : ''}${treffer.land ? ` · Flagge ${treffer.land.stufe} ${treffer.land.wert}` : ''}${treffer.x ? ` · X ${treffer.x.stufe} @${treffer.x.wert}` : ''}${treffer.twitch ? ` · Twitch ${treffer.twitch.stufe} ${treffer.twitch.wert}` : ''}`);
    if (geprueft.length >= 10) await leeren();
  }
  await leeren();
  return summe;
}

const daten = await ladeDaten();
const ergebnis = await lauf(daten);
console.log(JSON.stringify({ lauf: LAUF, anwenden: ANWENDEN, ...ergebnis, anfragen: zaehler }, null, 1));
