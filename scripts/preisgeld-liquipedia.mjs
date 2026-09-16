// Preisgeldtabellen aus Liquipedia - je Spieltag Platz und Betrag.
//
// Anlass: der Betreiber ueber "Meistes Preisgeld 2026": "ich weiss, wie viel
// der #1 hat, und es sind mehr als 271k, viel mehr." Bis hierhin zaehlte die
// Jahresliste nur die von Hand gepflegte Tabelle (Division 1, Performance
// Cup, Reload Victory Cup - alle EU) und vier LAN-Events. Die grossen
// Betraege fehlten ganz: die Grand Finals der FNCS Majors je Region, die
// Finals der Reload Elite Series, die Solo Series, das Last Chance Finale.
//
// Epic veroeffentlicht die Auszahlungstabellen nur in den Regelwerken (PDF).
// Liquipedia (CC BY-SA 3.0) fuehrt sie je Turnier und Region als
// Preisgeld-Liste: Platz, Betrag je Team, Namen. Von dort kommen die
// Tabellen - und angewendet werden sie auf Epics eigene Bestenliste, nach
// Platz. Kein Name wird zugeordnet; das Konto auf Platz drei bekommt den
// Betrag fuer Platz drei. Nur die Namen aus Liquipedia dienen der Kontrolle:
// stehen bei uns auf den ersten Plaetzen dieselben Spieler, stimmt die
// Zuordnung der Tabelle zum Spieltag.
//
// Liquipedia-API: gzip ist Pflicht, ein User-Agent mit Kontakt auch, und
// hoechstens eine Anfrage je zwei Sekunden. Rund fuenfhundert Seiten sind
// eine Viertelstunde; die Antworten bleiben im Zwischenspeicher liegen.
//
//   node scripts/preisgeld-liquipedia.mjs              alles
//   node scripts/preisgeld-liquipedia.mjs --nur-pruefen   nur Kontrolle gegen unsere Staende
//
// Ergebnis: data/preisgeld-tabellen.json (lib/preisgeld liest sie).

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const ausfuehren = promisify(execFile);

const UA = 'CompHub/1.0 (+https://www.thecomphub.com)';
const API = 'https://liquipedia.net/fortnite/api.php';
const ZWISCHEN = process.env.LIQUIPEDIA_CACHE || path.join(os.tmpdir(), 'comphub-liquipedia');
const ZIEL = path.join(process.cwd(), 'data', 'preisgeld-tabellen.json');
const PLATZ = path.join(process.cwd(), 'data', 'platzierungen');
const EPIC = path.join(process.cwd(), 'data', 'epic-spieltage');
const ARCHIV = path.join(process.cwd(), 'data', 'szene-stats');

const nurPruefen = process.argv.includes('--nur-pruefen');
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
let zuletzt = 0;

/**
 * Ein API-Aufruf mit Abstand, gzip und Wiederholung bei Drosselung.
 *
 * Ueber curl, nicht ueber fetch: Liquipedias Schutz sperrt Nodes eigenen
 * Abruf nach wenigen Seiten als "Scraper" (429, "temporarily blocked"),
 * waehrend dieselbe Adresse mit demselben User-Agent ueber curl weiter
 * antwortet - der Unterschied liegt im Fingerabdruck der Verbindung. curl
 * gibt es auf Windows und auf den GitHub-Rechnern.
 */
async function api(params) {
  const url = `${API}?${new URLSearchParams({ ...params, format: 'json' })}`;
  for (let versuch = 0; versuch < 8; versuch++) {
    const pause = 2500 - (Date.now() - zuletzt);
    if (pause > 0) await warte(pause);
    zuletzt = Date.now();
    let stdout = '';
    try {
      ({ stdout } = await ausfuehren('curl', [
        '-s', '--compressed', '-A', UA, '--max-time', '60', '-w', '\n%{http_code}', url,
      ], { maxBuffer: 64 * 1024 * 1024 }));
    } catch {
      // curl selbst gescheitert (Verbindung abgerissen): wie ein Aussetzer.
      stdout = '\n0';
    }
    const trenn = stdout.lastIndexOf('\n');
    const status = Number(stdout.slice(trenn + 1).trim());
    const text = stdout.slice(0, trenn);
    // Gedrosselt oder Aussetzer: jedes Mal laenger warten, bis zu vier Minuten.
    if (status === 429 || status >= 500 || status === 0) { await warte(Math.min(240_000, 15_000 * 2 ** versuch)); continue; }
    if (status !== 200) throw new Error(`HTTP ${status} fuer ${url}`);
    return JSON.parse(text);
  }
  throw new Error(`Liquipedia antwortet nicht: ${url}`);
}

/** Alle Seitentitel mit einem Praefix. */
async function seitenMit(praefix) {
  const titel = [];
  let weiter = null;
  do {
    const p = { action: 'query', list: 'allpages', apprefix: praefix, aplimit: '500' };
    if (weiter) p.apcontinue = weiter;
    const d = await api(p);
    titel.push(...(d.query?.allpages ?? []).map((x) => x.title));
    weiter = d.continue?.apcontinue ?? null;
  } while (weiter);
  return titel;
}

/** Der Quelltext einer Seite - aus dem Zwischenspeicher, sonst von Liquipedia. */
async function quelltext(titel) {
  await fs.mkdir(ZWISCHEN, { recursive: true });
  const datei = path.join(ZWISCHEN, titel.replace(/[^A-Za-z0-9]+/g, '_') + '.txt');
  try { return await fs.readFile(datei, 'utf8'); } catch { /* holen */ }
  const d = await api({ action: 'parse', page: titel, prop: 'wikitext' });
  const w = d.parse?.wikitext?.['*'] ?? '';
  await fs.writeFile(datei, w, 'utf8');
  return w;
}

/* ------------------------------------------------------------ Zuordnung */

const REGION = {
  'Europe': 'EU', 'North America Central': 'NAC', 'North America West': 'NAW',
  'North America': 'NAC', 'Brazil': 'BR', 'Asia': 'ASIA', 'Middle East': 'ME', 'Oceania': 'OCE',
};
const REGIONEN = Object.keys(REGION).map((r) => r.replace(/ /g, ' ')).join('|');

/** Kapitel und Saison zu Epics Saisonnummer. */
const SAISON = {
  '5/3': 'S30', '5/4': 'S31',
  '6/1': 'S33', '6/2': 'S34', '6/3': 'S36', '6/4': 'S37',
  '7/1': 'S39', '7/2': 'S40', '7/3': 'S41', '7/4': 'S42',
};

/**
 * Welche Seite zu welchem Spieltag gehoert.
 *
 * "muster" ist ein regulaerer Ausdruck auf die Fensterkennung; "tage" sagt,
 * wie das Endergebnis eines mehrtaegigen Finales entsteht: "summe" - Epics
 * Fenster je Tag zaehlen nur den Tag, die Plaetze ergeben sich aus der Summe
 * (gemessen an Major 1 2025 EU, Major 1 2026 EU, Solo Series 2026 EU);
 * "letzter" - das Fenster des letzten Tages fuehrt schon die Gesamtwertung
 * (Major 3 2024). "art" ist "platz" (Betrag je Platz) oder "sieg" (Betrag je
 * Sieg, Performance Cup).
 */
function zuordnung(titel) {
  let m;
  const R = (name) => REGION[name];
  if ((m = titel.match(new RegExp(`^Fortnite Champion Series/(\\d{4})/Major (\\d)/(${REGIONEN})$`)))) {
    const [, jahr, major, region] = m;
    if (jahr === '2024' && major === '3') {
      return { season: 'S30', region: R(region), muster: `^S30_FNCS_Major3_GrandFinalDay2_${R(region)}$`, tage: 'letzter', art: 'platz' };
    }
    const saison = { '2025': { 1: 'S33', 2: 'S34', 3: 'S36' }, '2026': { 1: 'S40', 2: 'S41' } }[jahr]?.[major];
    if (!saison) return null;
    return { season: saison, region: R(region), muster: `^${saison}_FNCSMajor${major}_Final_Day2_${R(region)}$`, tage: 'summe', art: 'platz' };
  }
  if ((m = titel.match(new RegExp(`^Fortnite Champion Series/2026/Last Chance Finals/(${REGIONEN})$`)))) {
    return { season: 'S41', region: R(m[1]), muster: `^S41_FNCSLastChanceMajor_Final_${R(m[1])}$`, tage: 'einzeln', art: 'platz' };
  }
  if ((m = titel.match(new RegExp(`^Reload Elite Series/2026/Qualifier (\\d)/(${REGIONEN})$`)))) {
    const saison = { 1: 'S39', 2: 'S39', 3: 'S40', 4: 'S41' }[m[1]];
    return { season: saison, region: R(m[2]), muster: `^${saison}_ReloadEliteSeries${m[1]}Final_${R(m[2])}$`, tage: 'einzeln', art: 'platz' };
  }
  if ((m = titel.match(new RegExp(`^Chapter 7/Season 1/Solo Series/(${REGIONEN})$`)))) {
    return { season: 'S39', region: R(m[1]), muster: `^S39_SoloSeriesCupFinal_Day2_${R(m[1])}$`, tage: 'summe', art: 'platz' };
  }
  if ((m = titel.match(new RegExp(`^Chapter 6/Season 4/Solo Series/(${REGIONEN})$`)))) {
    return { season: 'S37', region: R(m[1]), muster: `^S37_SoloSeriesCup_Final_${R(m[1])}$`, tage: 'einzeln', art: 'platz' };
  }
  if ((m = titel.match(new RegExp(`^Chapter (\\d)/Season (\\d)/FNCS Divisional Cup Finals/Week (\\d+)/(${REGIONEN})$`)))) {
    const saison = SAISON[`${m[1]}/${m[2]}`];
    if (!saison) return null;
    // In Chapter 6 Season 4 hiess der Duos-Cup bei Epic "DuosDivisionalCup",
    // die Trios-Uebungswochen behielten "FNCSDivisionalCup".
    const kern = saison === 'S37' ? 'DuosDivisionalCup' : 'FNCSDivisionalCup';
    return { season: saison, region: R(m[4]), muster: `^${saison}_${kern}_Division1_Week${m[3]}Final_${R(m[4])}$`, tage: 'einzeln', art: 'platz' };
  }
  if ((m = titel.match(new RegExp(`^Chapter 6/Season 4/FNCS Divisional Practice Cups/Week (\\d+)/(${REGIONEN})$`)))) {
    return { season: 'S37', region: R(m[2]), muster: `^S37_FNCSDivisionalCup_Division1_Week${m[1]}Final_${R(m[2])}$`, tage: 'einzeln', art: 'platz' };
  }
  if ((m = titel.match(new RegExp(`^Chapter (\\d)/Season (\\d)/Fortnite Performance Evaluation/(?:Session|Week) (\\d+)(?:/(${REGIONEN}))?$`)))) {
    const saison = SAISON[`${m[1]}/${m[2]}`];
    if (!saison) return null;
    // Ohne Region (Chapter 5 Season 3) fuehrt Liquipedia nur Europa.
    const region = m[4] ? R(m[4]) : 'EU';
    return { season: saison, region, muster: `^${saison}_PerformanceEvaluation(Duos)?_Event${m[3]}Round2_${region}$`, tage: 'einzeln', art: 'sieg' };
  }
  if ((m = titel.match(new RegExp(`^Chapter 5/Season (3|4)/Duos Cash Cup/Week (\\d+)/(${REGIONEN})$`)))) {
    const saison = m[1] === '3' ? 'S30' : 'S31';
    return { season: saison, region: R(m[3]), muster: `^${saison}_DuosCashCup_Event${m[2]}Round2_${R(m[3])}$`, tage: 'einzeln', art: 'platz' };
  }
  // LAN-Events: nur zur Kontrolle der gepflegten Datei (dort zaehlt das Konto).
  const lan = {
    'Fortnite Champion Series/2024/Grand Finals': ['S31', 'BambiRaptor_Day2'],
    'Fortnite Champion Series/2025/Grand Finals': ['S37', 'Dinosauron_Day2'],
    'Fortnite Champion Series/2026/Major 1/Summit': ['S40', 'Bratwurst_Finals_Day3'],
    'Reload Elite Series/2026': ['S41', 'Escargo_Day4'],
  }[titel];
  if (lan) return { season: lan[0], region: 'LAN', muster: `^${lan[1]}_`, tage: 'einzeln', art: 'lan' };
  return null;
}

/* ------------------------------------------------------------ Quelltext lesen */

/** Der Text ab "start" bis zur schliessenden Klammer des Templates. */
function geklammert(text, start) {
  let tiefe = 0;
  for (let i = start; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') { tiefe += 1; i += 1; continue; }
    if (text[i] === '}' && text[i + 1] === '}') {
      tiefe -= 1; i += 1;
      if (tiefe === 0) return text.slice(start, i + 1);
    }
  }
  return text.slice(start);
}

/** Alle Templates mit einem Namen (regulaerer Ausdruck) im Text, samt Inhalt. */
function templates(text, nameRe) {
  const raus = [];
  const re = new RegExp(`\\{\\{(${nameRe})\\b`, 'g');
  let m;
  while ((m = re.exec(text))) {
    const block = geklammert(text, m.index);
    raus.push({ name: m[1], block });
    re.lastIndex = m.index + 2;
  }
  return raus;
}

/** Ein Betrag "120,000" oder "4.350" -> 120000. */
function betrag(s) {
  const z = (s ?? '').replace(/[^0-9.]/g, '');
  if (!z) return null;
  const n = Number(z);
  return Number.isFinite(n) ? n : null;
}

/** Die Spielernamen eines Opponent-Templates. */
function opponentNamen(block) {
  const innen = block.slice(2, -2);
  const teile = innen.split('|').slice(1);
  const namen = [];
  for (const t of teile) {
    const kv = t.match(/^\s*(p\d)\s*=\s*(.*)$/);
    if (kv) { if (kv[2].trim()) namen.push(kv[2].trim()); continue; }
    if (t.includes('=')) continue;
    if (t.trim()) namen.push(t.trim());
  }
  return namen;
}

/**
 * Die Preisgeld-Liste einer Seite: je Platz der Betrag je Team, dazu die
 * Namen. Liquipedia kennt zwei Schreibweisen - die neue
 * ({{DuoPrizePool|{{Slot|usdprize=..|{{Opponent..}}}}}}) und die alte
 * ({{prize pool slot trio |place=1 |usdprize=..|Name|..}}).
 */
function preisliste(text) {
  const teamGroesse = { Solo: 1, Duo: 2, Trio: 3, Squad: 4, Team: null };
  let groesse = null;
  const plaetze = []; // { platz, betrag, namen }
  const praemien = []; // { titel, betrag, namen }

  const neu = templates(text, '(?:Solo|Duo|Trio|Squad|Team)?PrizePool');
  for (const { name, block } of neu) {
    if (name.startsWith('Award')) continue;
    const art = name.replace('PrizePool', '');
    if (art in teamGroesse && teamGroesse[art]) groesse = groesse ?? teamGroesse[art];
    // Praemien (MVP) stehen als eigener Block darin - getrennt merken.
    let rest = block;
    for (const a of templates(block, 'AwardPrizePool')) {
      for (const s of templates(a.block, 'Slot')) {
        const namen = templates(s.block, '\\d*Opponent').flatMap((o) => opponentNamen(o.block));
        praemien.push({ titel: (s.block.match(/\|award=([^|}]*)/)?.[1] ?? 'Award').trim(), betrag: betrag(s.block.match(/usdprize=([^|}]*)/)?.[1]), namen });
      }
      rest = rest.replace(a.block, '');
    }
    let naechster = 1;
    for (const s of templates(rest, 'Slot')) {
      const usd = betrag(s.block.match(/usdprize=([^|}]*)/)?.[1]);
      const platzAngabe = Number(s.block.match(/\|place=(\d+)/)?.[1]);
      const gegner = templates(s.block, '\\d*Opponent');
      const anzahl = Math.max(1, gegner.length);
      const platz = platzAngabe || naechster;
      for (let k = 0; k < anzahl; k++) {
        plaetze.push({ platz, betrag: usd, namen: gegner[k] ? opponentNamen(gegner[k].block) : [] });
      }
      naechster = platz + anzahl;
    }
  }
  if (!plaetze.length) {
    const alt = /\{\{prize pool slot(?: (solos?|duos?|trios?|teams?|squads?))?\s*\|([^\n]*)\}\}/gi;
    let m;
    while ((m = alt.exec(text))) {
      const art = (m[1] ?? '').toLowerCase().replace(/s$/, '');
      if (art === 'solo') groesse = groesse ?? 1;
      if (art === 'duo') groesse = groesse ?? 2;
      if (art === 'trio') groesse = groesse ?? 3;
      // Wikilinks und Templates in der Zeile tragen eigene "|" - erst weg damit.
      const teile = m[2].replace(/\[\[[^\]]*\]\]/g, '').replace(/\{\{[^}]*\}\}/g, '').split('|');
      const platz = Number(teile.find((t) => /^\s*place\s*=/.test(t))?.split('=')[1]);
      const usd = betrag(teile.find((t) => /^\s*usdprize\s*=/.test(t))?.split('=')[1]);
      const namen = teile.slice(1).filter((t) => !t.includes('=') && t.trim()).map((t) => t.trim());
      plaetze.push({ platz: platz || plaetze.length + 1, betrag: usd, namen });
    }
  }
  if (!groesse) {
    const modus = (text.match(/\|(?:mode|format)=([^\n|]*)/)?.[1] ?? '').toLowerCase();
    if (/duo/.test(modus)) groesse = 2;
    else if (/trio/.test(modus)) groesse = 3;
    else if (/squad/.test(modus)) groesse = 4;
    else if (/solo/.test(modus)) groesse = 1;
  }
  return { teamGroesse: groesse, plaetze, praemien };
}

/* ------------------------------------------------------------ Kontrolle */

/** Schrift vereinheitlichen: kyrillische Doppelgaenger, Sonderzeichen. */
function schlicht(s) {
  const tausch = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'к': 'k', 'і': 'i', 'ѕ': 's', 'Т': 'T', 'М': 'M', 'К': 'K', 'ǃ': '', 'ÿ': 'y', 'ó': 'o', 'ü': 'u', 'é': 'e', 'ö': 'o', 'ä': 'a', 'î': 'i', 'ú': 'u' };
  return (s ?? '').split('').map((c) => tausch[c] ?? c).join('').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Epics Namen eines Spieltags aus dem Archiv - Konto -> Name. */
async function archivNamen(season, windowId, region) {
  try {
    const d = JSON.parse(await fs.readFile(path.join(ARCHIV, region, season, `${windowId}.json`), 'utf8'));
    return new Map((d.players ?? []).map((p) => [p.epicId, p.username]));
  } catch { return new Map(); }
}

/** Die Teams eines Fensters, wie lib/szeneStats sie liest. */
async function teams(season, windowId) {
  for (const basis of [PLATZ, EPIC]) {
    try {
      const d = JSON.parse(await fs.readFile(path.join(basis, season, `${windowId}.json`), 'utf8'));
      if (Array.isArray(d.teams) && d.teams.length) return d.teams;
    } catch { /* naechste Ablage */ }
  }
  return null;
}

/** Der Endstand eines Finales nach "tage" - wie lib/szeneStats ihn rechnet. */
async function endstand(season, windowId, tage) {
  const letzter = await teams(season, windowId);
  if (!letzter) return null;
  const m = windowId.match(/Day(\d+)/);
  if (tage !== 'summe' || !m || Number(m[1]) < 2) return letzter;
  const summe = new Map();
  for (let t = 1; t <= Number(m[1]); t++) {
    const tag = await teams(season, windowId.replace(/Day\d+/, `Day${t}`));
    if (!tag) return null;
    for (const team of tag) {
      const k = [...team.spieler].sort().join(',');
      const e = summe.get(k) ?? { spieler: team.spieler, punkte: 0 };
      e.punkte += team.punkte;
      summe.set(k, e);
    }
  }
  const liste = [...summe.values()].sort((a, b) => b.punkte - a.punkte);
  let platz = 0;
  return liste.map((t, i) => {
    if (i === 0 || t.punkte !== liste[i - 1].punkte) platz = i + 1;
    return { ...t, platz };
  });
}

/* ------------------------------------------------------------ Hauptlauf */

async function main() {
  const praefixe = [
    'Fortnite Champion Series/2024', 'Fortnite Champion Series/2025', 'Fortnite Champion Series/2026',
    'Reload Elite Series/2026', 'Chapter 5/Season 3', 'Chapter 5/Season 4',
    'Chapter 6/Season 1', 'Chapter 6/Season 2', 'Chapter 6/Season 3', 'Chapter 6/Season 4',
    'Chapter 7/Season 1', 'Chapter 7/Season 2', 'Chapter 7/Season 3', 'Chapter 7/Season 4',
  ];
  let alt = { eintraege: [] };
  try { alt = JSON.parse(await fs.readFile(ZIEL, 'utf8')); } catch { /* neu */ }

  const seiten = [];
  if (!nurPruefen) {
    for (const p of praefixe) {
      const t = await seitenMit(p);
      seiten.push(...t);
      console.log(`${p}: ${t.length} Seiten`);
    }
  }
  const auswahl = seiten.map((t) => [t, zuordnung(t)]).filter(([, z]) => z);
  console.log(`${auswahl.length} Seiten mit Preisgeld fuer bekannte Spieltage`);

  const eintraege = nurPruefen ? alt.eintraege : [];
  const lanKontrolle = [];
  let n = 0;
  for (const [titel, z] of auswahl) {
    n += 1;
    const text = await quelltext(titel);
    const name = (text.match(/\|name=([^\n|]*)/)?.[1] ?? titel).replace(/<br\s*\/?>/g, ' ').trim();
    const gesamt = betrag(text.match(/\|prizepoolusd=([^\n|]*)/)?.[1]);
    const { teamGroesse, plaetze, praemien } = preisliste(text);
    if (!plaetze.length) { console.log(`  - ${titel}: keine Preisgeld-Liste`); continue; }
    if (z.art === 'lan') { lanKontrolle.push({ titel, season: z.season, fenster: z.muster, teamGroesse, plaetze, praemien }); continue; }
    const eintrag = {
      seite: titel, titel: name, season: z.season, region: z.region, muster: z.muster, tage: z.tage,
      art: z.art, teamGroesse, gesamt, waehrung: 'USD', proTeam: true,
    };
    if (z.art === 'sieg') {
      const betraege = [...new Set(plaetze.map((p) => p.betrag).filter((b) => b))];
      if (betraege.length !== 1) console.log(`  ? ${titel}: ${betraege.length} verschiedene Betraege je Sieg (${betraege.join(', ')})`);
      eintrag.jeSieg = betraege[0] ?? null;
    } else {
      eintrag.plaetze = plaetze.filter((p) => p.betrag).map((p) => ({ platz: p.platz, betrag: p.betrag }));
    }
    // Die Namen bleiben zur Kontrolle dabei - nur die ersten fuenf.
    eintrag.kontrolle = plaetze.slice(0, 5).map((p) => ({ platz: p.platz, namen: p.namen }));
    if (praemien.length) eintrag.praemien = praemien;
    eintraege.push(eintrag);
    if (n % 25 === 0) console.log(`  ${n}/${auswahl.length} gelesen`);
  }

  // Kontrolle: stehen bei uns auf den ersten Plaetzen dieselben Namen?
  let geprueft = 0; let stimmig = 0;
  const unstimmig = [];
  const fenster = [];
  for (const basis of [PLATZ, EPIC]) {
    for (const s of await fs.readdir(basis).catch(() => [])) {
      for (const f of await fs.readdir(path.join(basis, s)).catch(() => [])) {
        if (f.endsWith('.json') && !f.startsWith('_')) fenster.push([s, f.slice(0, -5)]);
      }
    }
  }
  for (const e of eintraege) {
    if (e.art !== 'platz') continue;
    const re = new RegExp(e.muster, 'i');
    const passende = fenster.filter(([s, w]) => s === e.season && re.test(w));
    e.spieltage = [...new Set(passende.map(([, w]) => w))];
    for (const w of e.spieltage) {
      const stand = await endstand(e.season, w, e.tage);
      if (!stand) continue;
      const namen = await archivNamen(e.season, w, e.region);
      if (!namen.size) continue;
      geprueft += 1;
      const oben = stand.slice(0, 3).map((t) => t.spieler.map((id) => schlicht(namen.get(id) ?? '')));
      const soll = e.kontrolle.filter((k) => k.platz <= 3);
      let treffer = 0;
      for (const k of soll) {
        const unsere = oben[k.platz - 1] ?? [];
        if (k.namen.length && k.namen.every((nm) => unsere.some((u) => u.includes(schlicht(nm))))) treffer += 1;
      }
      if (soll.length && treffer === soll.length) stimmig += 1;
      else unstimmig.push(`${w}: Liquipedia ${soll.map((k) => k.namen.join('+')).join(' / ')} | bei uns ${stand.slice(0, 3).map((t) => t.spieler.map((id) => namen.get(id) ?? id.slice(0, 6)).join('+')).join(' / ')}`);
    }
  }
  console.log(`\nKontrolle: ${geprueft} Spieltage verglichen, ${stimmig} mit denselben ersten drei Teams.`);
  for (const u of unstimmig) console.log('  ! ' + u);

  if (!nurPruefen) {
    await fs.writeFile(ZIEL, JSON.stringify({
      hinweis: 'Prize money per placement, per team, from Liquipedia (CC BY-SA 3.0, https://liquipedia.net/fortnite). Applied to Epic\'s own standings by placement; names are only kept for checking. "tage": summe = the day windows count single days and the final standing is their sum; letzter = the last day window already carries the total. Amount per player = amount / teamGroesse.',
      quelle: 'https://liquipedia.net/fortnite', lizenz: 'CC BY-SA 3.0',
      stand: new Date().toISOString(),
      eintraege,
    }, null, 1), 'utf8');
    console.log(`\n${eintraege.length} Tabellen nach ${path.relative(process.cwd(), ZIEL)} geschrieben.`);
    if (lanKontrolle.length) {
      const lanDatei = path.join(path.dirname(ZIEL), 'preisgeld-lan-liquipedia.json');
      await fs.writeFile(lanDatei, JSON.stringify({ hinweis: 'LAN prize lists from Liquipedia, names only - for checking data/lan-preisgelder.json.', eintraege: lanKontrolle }, null, 1), 'utf8');
      console.log(`${lanKontrolle.length} LAN-Listen nach ${path.relative(process.cwd(), lanDatei)} (nur zur Kontrolle).`);
    }
  }
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
