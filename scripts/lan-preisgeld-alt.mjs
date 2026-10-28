// Das Preisgeld der LANs vor 2024 - World Cup 2019, Gamers8 2022 und 2023,
// FNCS Invitational 2022, Global Championship 2023.
//
// Der Betreiber (Aufgabe 5): "Es fehlen die LAN-Preislisten vor 2024." Fuer
// diese LANs gibt es bei uns keine Bestenliste: Epic fuehrt die Fenster von
// damals nicht mehr, und im Archiv steht kein Spieltag. Die Preislisten
// kommen deshalb von Liquipedia (CC BY-SA 3.0) - Platz, Betrag je Team,
// Namen - und die Namen werden Konten zugeordnet:
//
//   1. Name aus einer schon gepflegten LAN-Liste (data/lan-preisgelder.json)
//   2. Name eines Profis mit Foto (data/spielerbilder.json)
//   3. Name aus dem Namensverzeichnis (data/spieler-namen.json,
//      data/epic-namen.json) - nur Konten, die irgendwo Preisgeld haben;
//      bei mehreren das eine, das um die LAN herum gespielt hat.
//
// Zaehlt nur ein eindeutiger Treffer. Wer offen bleibt, steht mit Platz und
// Betrag unter "offen" in der Datei - eintragen geht von Hand (das Konto
// entscheidet). Was schon von Hand zugeordnet ist, bleibt stehen.
//
// Betrag je Person = Betrag des Platzes / Teamgroesse (Liquipedia nennt ihn je
// Team). Sonderpraemien (MVP, meiste Elims) zaehlen nicht mit - bei Duos ist
// dort nicht belegt, wie sie geteilt wurden.
//
//   node scripts/lan-preisgeld-alt.mjs [--probe]

import fs from 'node:fs';
import path from 'node:path';
import { quelltext, preisliste } from './preisgeld-liquipedia.mjs';

const DATEN = path.join(process.cwd(), 'data');
const DATEI = path.join(DATEN, 'lan-preisgelder.json');
const PROBE = process.argv.includes('--probe');
// --neu: alles frisch zuordnen, auch was schon in der Datei steht (sonst bleiben vorhandene Zuordnungen - auch die von Hand).

const LANS = [
  { kennung: 'fortnite-world-cup-2019-solo', name: 'Fortnite World Cup 2019 Solo', seite: 'Fortnite World Cup/2019/Finals/Solo', season: 'S9', fenster: 'WorldCup2019_Solo', datum: '2019-07-28', ort: 'New York' },
  { kennung: 'fortnite-world-cup-2019-duos', name: 'Fortnite World Cup 2019 Duos', seite: 'Fortnite World Cup/2019/Finals/Duos', season: 'S9', fenster: 'WorldCup2019_Duos', datum: '2019-07-27', ort: 'New York' },
  { kennung: 'gamers8-2022-zero-build', name: 'Gamers8 2022 Zero Build', seite: 'Gamers8/2022/Zero Build', season: 'S21', fenster: 'Gamers8ZeroBuild2022_Finals', datum: '2022-07-29', ort: 'Riyadh' },
  { kennung: 'gamers8-2022', name: 'Gamers8 2022', seite: 'Gamers8/2022', season: 'S21', fenster: 'Gamers82022_Finals', datum: '2022-07-31', ort: 'Riyadh' },
  { kennung: 'fncs-invitational-2022', name: 'FNCS Invitational 2022', seite: 'Fortnite Champion Series/2022/Invitational', season: 'S22', fenster: 'FNCSInvitational2022_Finals', datum: '2022-11-13', ort: 'Raleigh' },
  { kennung: 'gamers8-2023', name: 'Gamers8 2023', seite: 'Gamers8/2023', season: 'S25', fenster: 'Gamers82023_Finals', datum: '2023-07-09', ort: 'Riyadh' },
  { kennung: 'fncs-global-championship-2023', name: 'FNCS Global Championship 2023', seite: 'Fortnite Champion Series/2023', season: 'S26', fenster: 'FNCSGC2023_Finals', datum: '2023-10-15', ort: 'Copenhagen' },
];

const liesJson = (datei, standard) => { try { return JSON.parse(fs.readFileSync(datei, 'utf8')); } catch { return standard; } };
const schluessel = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '').toLowerCase();

/**
 * Die Schluessel, unter denen ein Kontoname gefunden werden soll: ganz, ohne
 * Org-Kuerzel vorn und Ziffern hinten ("BIG Malibuca 7" -> "malibuca"), und das
 * letzte Wort allein ("falcon peterbot" -> "peterbot").
 */
function schluesselVon(name, mitLetztemWort = true) {
  const roh = String(name ?? '').replace(/^\s*\[[^\]]*\]\s*/, '').replace(/[ǃ!]+/g, ' ').trim();
  const woerter = roh.split(/\s+/).filter(Boolean);
  while (woerter.length > 1 && /^\d+$/.test(schluessel(woerter[woerter.length - 1]))) woerter.pop();
  const ohneOrg = woerter.length > 1 && /^[A-Z0-9]{1,5}$/.test(woerter[0]) ? woerter.slice(1) : woerter;
  const raus = new Set([schluessel(roh), schluessel(woerter.join('')), schluessel(ohneOrg.join(''))]);
  if (mitLetztemWort && woerter.length > 1) raus.add(schluessel(woerter[woerter.length - 1]));
  // "mero_" -> "mero", "Kami11" bleibt "kami11" - nur Unterstriche und Punkte am Rand fallen weg (schluessel macht das schon).
  raus.delete('');
  return raus;
}

const datei = liesJson(DATEI, { eintraege: [] });
const archiv = liesJson(path.join(DATEN, 'verdienst-archiv.json'), { konten: {} }).konten ?? {};
const epicNamen = liesJson(path.join(DATEN, 'epic-namen.json'), {});
const spielerNamen = liesJson(path.join(DATEN, 'spieler-namen.json'), {});
const profis = liesJson(path.join(DATEN, 'spielerbilder.json'), []);

const verdiener = new Set(Object.keys(archiv));
for (const e of datei.eintraege) for (const s of e.spieler ?? []) verdiener.add(s.epicId);
for (const p of profis) if (p.epicId) verdiener.add(p.epicId);

/** Schluessel -> Konten, je Quelle. */
function verzeichnis(paare, mitLetztemWort = true) {
  const v = new Map();
  for (const [id, name] of paare) {
    if (!id || !name) continue;
    for (const k of schluesselVon(name, mitLetztemWort)) {
      if (!v.has(k)) v.set(k, new Set());
      v.get(k).add(id);
    }
  }
  return v;
}
const ausLan = verzeichnis(datei.eintraege.filter((e) => !LANS.some((l) => l.kennung === e.kennung))
  .flatMap((e) => (e.spieler ?? []).flatMap((s) => [[s.epicId, s.quellName], [s.epicId, s.name]])));
const ausProfis = verzeichnis(profis.flatMap((p) => [[p.epicId, p.name], [p.epicId, p.turniername]]));
const ausNamen = verzeichnis([
  ...Object.entries(spielerNamen).flatMap(([id, v]) => [...(v.namen ?? []), v.haupt].map((n) => [id, n])),
  ...Object.entries(epicNamen),
].filter(([id]) => verdiener.has(id)), false);

/** Wie nah ein Konto an der LAN gespielt hat: Spieltage mit Preisgeld in den 18 Monaten davor und danach. */
function naehe(id, datum) {
  const t = Date.parse(datum);
  return (archiv[id] ?? []).filter((e) => Math.abs(Date.parse(e[2]) - t) < 548 * 864e5).length;
}

function zuordnen(quellName, datum) {
  const k = schluessel(quellName);
  for (const [quelle, v] of [['lan', ausLan], ['profi', ausProfis]]) {
    const c = [...(v.get(k) ?? [])];
    if (c.length === 1) return { epicId: c[0], wie: quelle };
    if (c.length > 1) {
      const aktiv = c.filter((id) => naehe(id, datum) > 0);
      if (aktiv.length === 1) return { epicId: aktiv[0], wie: `${quelle}+zeit` };
    }
  }
  // Kurze Namen ("Aim", "nut") traegt im Namensverzeichnis fast immer auch jemand anderes - dort zaehlen sie nicht.
  const c = k.length >= 4 ? [...(ausNamen.get(k) ?? [])] : [];
  if (!c.length) return { epicId: null, kandidaten: 0 };
  const aktiv = c.filter((id) => naehe(id, datum) > 0);
  if (aktiv.length === 1) return { epicId: aktiv[0], wie: 'namen+zeit' };
  return { epicId: null, kandidaten: c.length };
}

/** Der Name, unter dem der Spieler bei uns steht (gepflegte LAN-Listen, Profi-Fotos) - nicht der aktuelle Epic-Name ("BIG Malitryona" ist Malibuca). */
const gepflegt = new Map();
for (const e of datei.eintraege) for (const x of e.spieler ?? []) if (x.name && !gepflegt.has(x.epicId)) gepflegt.set(x.epicId, x.name);
for (const p of profis) if (p.epicId && !gepflegt.has(p.epicId)) gepflegt.set(p.epicId, p.turniername || p.name);
const aktuellerName = (id) => gepflegt.get(id) ?? spielerNamen[id]?.haupt ?? epicNamen[id] ?? null;

let geaendert = 0;
for (const lan of LANS) {
  const text = await quelltext(lan.seite);
  const { teamGroesse, plaetze } = preisliste(text);
  const groesse = teamGroesse ?? 1;
  const vorher = datei.eintraege.find((e) => e.kennung === lan.kennung);
  const vonHand = new Map((process.argv.includes("--neu") ? [] : vorher?.spieler ?? []).map((s) => [schluessel(s.quellName), s]));
  const spieler = []; const offen = [];
  for (const p of plaetze) {
    if (!p.betrag) continue;
    const jePerson = Math.round(p.betrag / groesse);
    for (const n of p.namen) {
      const hand = vonHand.get(schluessel(n));
      if (hand?.epicId) { spieler.push({ ...hand, platz: p.platz, betrag: jePerson }); continue; }
      const z = zuordnen(n, lan.datum);
      if (z.epicId) spieler.push({ epicId: z.epicId, name: aktuellerName(z.epicId) ?? n, quellName: n, platz: p.platz, betrag: jePerson, zuordnung: z.wie });
      else offen.push({ quellName: n, platz: p.platz, betrag: jePerson, kandidaten: z.kandidaten });
    }
  }
  // Ein Konto zweimal in derselben LAN ist eine Verwechslung - dann beide offen lassen.
  const zaehler = new Map();
  for (const s of spieler) zaehler.set(s.epicId, (zaehler.get(s.epicId) ?? 0) + 1);
  const doppelt = spieler.filter((s) => zaehler.get(s.epicId) > 1);
  for (const s of doppelt) offen.push({ quellName: s.quellName, platz: s.platz, betrag: s.betrag, kandidaten: 'doppelt' });
  const sauber = spieler.filter((s) => zaehler.get(s.epicId) === 1);

  const gesamt = plaetze.reduce((a, p) => a + (p.betrag ?? 0), 0);
  const zugeordnet = sauber.reduce((a, s) => a + s.betrag, 0);
  console.log(`${lan.name}: ${plaetze.length} Plaetze, ${gesamt.toLocaleString('en')} $ - ${sauber.length} Spieler zugeordnet (${zugeordnet.toLocaleString('en')} $), offen ${offen.length}`);
  if (PROBE) {
    for (const s of sauber.filter((x) => process.env.ALLE || sauber.indexOf(x) < 6)) console.log(`   ${s.platz}. ${s.quellName} -> ${s.name} (${s.zuordnung ?? "Hand"})`);
    console.log(`   offen: ${offen.slice(0, 12).map((o) => `${o.quellName}(${o.kandidaten})`).join(', ')}`);
  }
  const eintrag = {
    kennung: lan.kennung, name: lan.name, season: lan.season, fenster: lan.fenster, datum: lan.datum, ort: lan.ort,
    quelle: `https://liquipedia.net/fortnite/${lan.seite.replace(/ /g, '_')}`, waehrung: 'USD',
    spieler: sauber.map(({ zuordnung, ...s }) => { void zuordnung; return s; }),
    offen,
  };
  const i = datei.eintraege.findIndex((e) => e.kennung === lan.kennung);
  if (i >= 0) datei.eintraege[i] = eintrag; else datei.eintraege.push(eintrag);
  geaendert += 1;
}

if (!PROBE && geaendert) {
  datei.hinweis = 'LAN prize money per player. Sources: Esports Charts (Reload Elite Series Championship 2026, per player), Esports Earnings (FNCS Summit 2026, Globals 2024/2025) and Liquipedia (LANs before 2024: World Cup 2019, Gamers8 2022/2023, FNCS Invitational 2022, Global Championship 2023; amount per team divided by team size, awards not included). Accounts were matched by name - first to accounts of other LAN lists, then to pros with a photo, then to the name index (only accounts with prize money, near the LAN date). Unmatched names are listed under "offen" with placement and amount - add them to "spieler" by hand, the epicId decides.';
  fs.writeFileSync(DATEI, JSON.stringify(datei, null, 1), 'utf8');
  console.log(`\n${geaendert} LANs nach ${path.relative(process.cwd(), DATEI)} geschrieben.`);
}
