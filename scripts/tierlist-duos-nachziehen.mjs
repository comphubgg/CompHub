// Die Duoliste der Tierlist nachziehen - und ausduennen.
//
// Zwei Aufgaben, beide vom Betreiber so verlangt:
//
// 1. NEUE DUOS AUFNEHMEN. Nach jedem Performance-Cup-Finale und jedem
//    Division-1-Finale stehen neue Paarungen fest. "Falls ein Spieler ein
//    neues Duo hat ... dann kommen die halt auch in die Tierlist." Ohne
//    diesen Lauf bleibt die Liste auf dem Stand vom Tag ihrer Entstehung.
//
// 2. UNBEKANNTE WEGRAEUMEN. "Leute ohne Flagge kannst Du entfernen, weil die
//    kennt legit niemand - hat eh viel zu viele Duos gerade. Mach nur die,
//    die mindestens einen im Team mit Flagge haben." Die gepflegte Flagge ist
//    das brauchbarste Zeichen dafuer, dass ein Konto zu einem bekannten
//    Spieler gehoert.
//
// WAS DIESES SKRIPT NIE TUT
//
// Es fasst keine Einstufung an. Ein Eintrag mit Stufe bleibt, auch ohne
// Flagge - wer dort steht, ist vom Betreiber eingeordnet worden, und das
// wiegt schwerer als jede Regel hier. Neue Duos kommen ungesetzt in den Pool;
// wohin sie gehoeren, entscheidet er.
//
// ZUORDNUNG UEBER DAS KONTO, NICHT UEBER DEN NAMEN
//
// Die Bestenliste fuehrt zu jedem Spieler seine Epic-Kennung. Ein Duo ist
// deshalb ein Paar von Kennungen, nicht von Namen - sonst stuende
// "FocusHD yhyh + Th0masHD yhyh" neben dem laengst vorhandenen
// "FOCUSHD + TH0MASHD", und die Liste wuechse mit jedem Cup um Dubletten.
//
// Aufruf:
//   node scripts/tierlist-duos-nachziehen.mjs             (nur zeigen)
//   node scripts/tierlist-duos-nachziehen.mjs --schreiben (anwenden)
//
// Mit COMPHUB_DATEN laesst sich der Datenordner der fertigen Anwendung
// angeben (siehe lib/datenOrt.ts).

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const WURZEL = path.join(path.dirname(new URL(import.meta.url).pathname)
  .replace(/^\/([A-Za-z]:)/, '$1'), '..');
const DATEN = process.env.COMPHUB_DATEN || path.join(WURZEL, 'data');
const DATEI = path.join(DATEN, 'tierlists.json');
const SICHERUNG = path.join(DATEN, '_sicherung');
const SERVER = process.env.COMPHUB_SERVER || 'http://127.0.0.1:3000';
const schreiben = process.argv.includes('--schreiben');

/* ------------------------------------------------- Namen vergleichbar machen */

const orgRoh = readFileSync(path.join(WURZEL, 'lib', 'orgtags.ts'), 'utf8');
const orgBlock = orgRoh.slice(orgRoh.indexOf('new Set(['), orgRoh.indexOf('])'));
const ORGTAGS = new Set([...orgBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]));
const ZWILLINGE = { 'ǃ': '!', 'ı': 'i', 'ł': 'l', 'ø': 'o', 'Ø': 'O', '０': '0' };
const vergleichbar = (t) => [...t.normalize('NFKC')]
  .map((z) => ZWILLINGE[z] ?? z).join('').toLowerCase();

function istOrgtag(wort) {
  const rein = wort.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (rein.length < 2 || rein.length > 8) return false;
  if (ORGTAGS.has(rein)) return true;
  return /^[A-Z0-9]{2,6}[.!]?$/.test(wort);
}
function kernname(name) {
  let teile = String(name ?? '').trim().split(/\s+/)
    .filter((t) => !/^\[.*\]$/.test(t)).filter((t) => !/^\d+[!ǃ.]?$/.test(t));
  if (!teile.length) return String(name ?? '').trim();
  if (teile.length > 1 && istOrgtag(teile[0])) teile = teile.slice(1);
  return teile.join(' ');
}
const schluessel = (n) => vergleichbar(kernname(n)).replace(/[^a-z0-9]/g, '');

/* --------------------------------------------------------------- Abholen */

async function hole(pfad) {
  const r = await fetch(SERVER + pfad, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`${pfad} -> HTTP ${r.status}`);
  return r.json();
}

/** Die Finalspieltage, um die es geht - Performance und Division 1. */
function interessanteFenster(cups) {
  const raus = [];
  for (const c of cups) {
    const titel = String(c.titel ?? '');
    const zaehlt = /performance/i.test(titel)
      || /division\s*1/i.test(titel);
    if (!zaehlt) continue;
    for (const [region, fenster] of Object.entries(c.regionen ?? {})) {
      for (const f of fenster) {
        /*
         * Nur die Finalrunde, und nur was gelaufen ist oder laeuft.
         *
         * "istFinale" allein genuegt nicht: beim Performance Evaluation Cup
         * steht es auf false, obwohl die zweite Runde das Finale ist - die
         * Eventseite nennt sie auch so. Genau dadurch fielen die neuen Duos
         * eines ganzen Cups durch das Raster. Die zweite Runde ist deshalb
         * ausdruecklich mitgemeint.
         */
        const istFinalrunde = f.istFinale || /round2/i.test(String(f.windowId ?? ''));
        if (!istFinalrunde || f.status === 'kommt') continue;
        raus.push({ region, titel, eventId: f.eventId, windowId: f.windowId, begin: f.begin });
      }
    }
  }
  // Die juengsten zuerst - dort stehen die aktuellen Paarungen.
  return raus.sort((a, b) => (b.begin ?? 0) - (a.begin ?? 0));
}

/* ------------------------------------------------------------------ Lauf */

const kontoNachName = await hole('/api/spieler-namen?nachName=1')
  .then((j) => j.nachName ?? {}).catch(() => ({}));
const laender = await hole('/api/spieler-laender?namen=1')
  .then((j) => j.nachName ?? {}).catch(() => ({}));
const profile = await hole('/api/spieler-profile')
  .then((j) => j.profile ?? {}).catch(() => ({}));

/** Land zu einem Namen - dieselbe Auflösung wie in der Oberflaeche. */
const profilLand = new Map();
for (const pr of Object.values(profile)) {
  if (!pr?.land) continue;
  for (const n of [...(pr.namen ?? []), pr.name ?? '', pr.anzeige ?? '']) {
    if (n) profilLand.set(String(n).toLowerCase().replace(/[^a-z0-9]/g, ''),
      String(pr.land).toLowerCase());
  }
}
function landVon(name) {
  const k = String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!k) return '';
  return profilLand.get(k) ?? (laender[k] ? String(laender[k]).toLowerCase() : '');
}

/** Die Kennung hinter einem Namen, sofern eindeutig. */
const kontoVon = (name) => kontoNachName[schluessel(name)] ?? '';

const d = JSON.parse(readFileSync(DATEI, 'utf8'));
const listenId = Object.keys(d.lists ?? {})[0];
const liste = d.lists[listenId];
const feld = Array.isArray(liste.entries) ? 'entries' : 'items';
const eintraege = liste[feld];

/** Ein Duo als Paar - ueber die Kennung, wenn bekannt, sonst ueber den Namen. */
const paarSchluessel = (a, b) => [a, b].sort().join('+');
const seite = (name, id) => (id || kontoVon(name) || `n:${schluessel(name)}`);

const vorhanden = new Map();
for (const e of eintraege) {
  if (!e.isDuo) continue;
  const k = paarSchluessel(seite(e.data?.player1?.name), seite(e.data?.player2?.name));
  if (!vorhanden.has(k)) vorhanden.set(k, e);
}

const katalog = await hole('/api/cup-catalog?modus=alle');
const fenster = interessanteFenster(katalog.cups ?? katalog.katalog ?? []);
console.log(`${fenster.length} Finalspieltage gefunden (Performance / Division 1).`);

const neue = [];
const gesehen = new Set();
// Nur die juengsten je Region - aeltere Paarungen sind ueberholt.
const proRegion = new Map();
for (const f of fenster) {
  if (proRegion.has(f.region)) continue;
  proRegion.set(f.region, f);
}

for (const f of proRegion.values()) {
  let lb;
  try {
    lb = await hole(`/api/cup-leaderboard?event=${encodeURIComponent(f.eventId)}`
      + `&window=${encodeURIComponent(f.windowId)}`);
  } catch (e) { console.log(`  ${f.region}: ${e.message}`); continue; }

  const teams = (lb.entries ?? []).filter((t) => (t.players ?? []).length === 2);
  let dazu = 0;
  for (const t of teams) {
    const [p1, p2] = t.players;
    const k = paarSchluessel(seite(p1.name, p1.id), seite(p2.name, p2.id));
    if (vorhanden.has(k) || gesehen.has(k)) continue;
    gesehen.add(k);

    const l1 = landVon(p1.name);
    const l2 = landVon(p2.name);
    // Wen niemand kennt, kommt gar nicht erst hinein.
    if (!l1 && !l2) continue;

    const id = randomUUID();
    neue.push({
      id,
      data: {
        id,
        region: f.region,
        player1: { id: randomUUID(), name: p1.name, region: f.region, countryCode: l1 },
        player2: { id: randomUUID(), name: p2.name, region: f.region, countryCode: l2 },
        isGlobal: false,
      },
      tier: null,
      isDuo: true,
      localOnly: false,
    });
    dazu += 1;
  }
  console.log(`  ${f.region}: ${teams.length} Duos im Finale, ${dazu} davon neu`);
}

/* ------------------------------------------------- Unbekannte wegraeumen */

const hatFlagge = (e) => {
  if (e.isDuo) {
    return Boolean(landVon(e.data?.player1?.name) || e.data?.player1?.countryCode
      || landVon(e.data?.player2?.name) || e.data?.player2?.countryCode);
  }
  return Boolean(landVon(e.data?.name) || e.data?.countryCode);
};

const behalten = eintraege.filter((e) => e.tier || e.localOnly || hatFlagge(e));
const weg = eintraege.length - behalten.length;

console.log(`\nOhne jede Flagge und ungesetzt: ${weg} Eintraege fallen weg.`);
console.log(`Neue Duos aus den Finals: ${neue.length}`);
console.log(`Bestand: ${eintraege.length} -> ${behalten.length + neue.length}`);

const gesetztVorher = eintraege.filter((e) => e.tier).length;
const gesetztNachher = behalten.filter((e) => e.tier).length;
console.log(`Eingestuft: ${gesetztVorher} -> ${gesetztNachher}`
  + (gesetztVorher === gesetztNachher ? '  (unveraendert)' : '  ACHTUNG'));

if (!schreiben) {
  console.log('\nNur gezeigt. Mit --schreiben wird es angewendet.');
} else {
  mkdirSync(SICHERUNG, { recursive: true });
  const marke = new Date().toISOString().replace(/[:.]/g, '-');
  const ziel = path.join(SICHERUNG, `tierlists-vor-nachziehen-${marke}.json`);
  copyFileSync(DATEI, ziel);
  liste[feld] = [...behalten, ...neue];
  writeFileSync(DATEI, `${JSON.stringify(d, null, 2)}\n`, 'utf8');
  console.log(`\nGesichert nach ${path.basename(ziel)} und geschrieben.`);
}
