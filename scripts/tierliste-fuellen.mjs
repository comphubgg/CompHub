// Die Tierlist einmal aus echten Turnierdaten neu aufsetzen.
//
// Gesammelt wird aus den Spieltagen, die der Nutzer benannt hat: das Finale
// der Performance Evaluation vom 23.08. und alle vier Tage der Reload Elite
// Series. Jedes Duo kommt als Duo hinein, dieselben Spieler zusaetzlich
// einzeln in die Solo-Liste.
//
// Erfunden wird nichts: Namen und Zusammensetzung stammen aus Epics
// Leaderboards, die Flagge allein aus den von Hand gepflegten Profilen. Wo
// keine Herkunft gepflegt ist, bleibt das Feld leer - die Oberflaeche zeigt
// dort die Weltkugel.
//
// Aufruf:  node scripts/tierliste-fuellen.mjs [--schreiben]
// Ohne --schreiben wird nur berichtet, was entstehen wuerde.

import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const BASIS = 'http://localhost:3000';

/** Welche Spieltage gehen ein? */
const QUELLEN = [
  { event: 'epicgames_S42_PerformanceEvaluation_EU',
    window: 'S42_PerformanceEvaluation_Event1Round2_EU', region: 'EU',
    titel: 'Performance Evaluation — Finale 23.08.' },
  { event: 'epicgames_Escargo_Official', window: 'Escargo_Day1', region: 'GLOBAL',
    titel: 'Reload Elite Series — Tag 1' },
  { event: 'epicgames_Escargo_Official', window: 'Escargo_Day2', region: 'GLOBAL',
    titel: 'Reload Elite Series — Tag 2' },
  { event: 'epicgames_Escargo_Official', window: 'Escargo_Day3', region: 'GLOBAL',
    titel: 'Reload Elite Series — Tag 3' },
  { event: 'epicgames_Escargo_Official', window: 'Escargo_Day4', region: 'GLOBAL',
    titel: 'Reload Elite Series — Tag 4' },
];

/* ------------------------------------------------------------ Namensregeln */

const ZWILLINGE = {
  'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o',
  'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j',
  'ѕ': 's', 'ԁ': 'd', 'ɡ': 'g', 'ѵ': 'v', 'ԛ': 'q', 'ղ': 'n',
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O',
  'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X', 'І': 'I', 'Ј': 'J',
  'Ѕ': 'S', 'Ԛ': 'Q', 'Ԁ': 'D', 'Г': 'r', 'Ф': 'o',
  'α': 'a', 'β': 'b', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ο': 'o', 'ρ': 'p',
  'τ': 't', 'υ': 'u', 'χ': 'x', 'ν': 'v',
  'ǃ': '!', 'ı': 'i', 'ł': 'l', 'ø': 'o', 'Ø': 'O', '０': '0',
};

const vergleichbar = (t) => [...t.normalize('NFKC')]
  .map((z) => ZWILLINGE[z] ?? z).join('').toLowerCase();

/** Angehaengte Zierzeichen abschneiden - "Morlezǃ" wird zu "Morlez". */
function ohneZierrat(name) {
  let ende = name.length;
  while (ende > 0 && !/^[a-z0-9]$/.test(vergleichbar(name[ende - 1]))) ende--;
  return name.slice(0, ende).trimEnd() || name;
}

let ORGTAGS = new Set();

function istOrgtag(wort) {
  const rein = wort.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (rein.length < 2 || rein.length > 8) return false;
  if (ORGTAGS.has(rein)) return true;
  return /^[A-Z0-9]{2,6}[.!]?$/.test(wort);
}

/** Turniermarkierung, Orgtag und Startnummer fallen weg. */
function kernname(name) {
  let teile = name.trim().split(/\s+/)
    .filter((t) => !/^\[.*\]$/.test(t))
    .filter((t) => !/^\d+[!ǃ.]?$/.test(t));
  if (!teile.length) return name.trim();
  if (teile.length > 1 && istOrgtag(teile[0])) teile = teile.slice(1);
  return teile.join(' ');
}

const namensSchluessel = (n) => vergleichbar(kernname(n)).replace(/[^a-z0-9]/g, '');

/* ------------------------------------------------------------------ Ablauf */

async function hole(pfad) {
  const r = await fetch(BASIS + pfad);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `Fehler bei ${pfad}`);
  return j;
}

async function main() {
  const schreiben = process.argv.includes('--schreiben');

  ORGTAGS = new Set(JSON.parse(
    await fs.readFile(path.join(process.cwd(), 'data', 'orgtags.json'), 'utf8'))
    .map?.((x) => String(x).toLowerCase()) ?? []);

  const profileRoh = await hole('/api/spieler-profile');
  const profile = profileRoh.profile ?? {};

  // Nachschlagewerk ueber Konto-Id und ueber beobachtete Namen.
  const nachName = new Map();
  for (const p of Object.values(profile)) {
    for (const n of (p.namen ?? [p.name ?? ''])) {
      const s = namensSchluessel(n);
      if (s && !nachName.has(s)) nachName.set(s, p);
    }
  }
  const profilVon = (name, id) => (id && profile[id]) || nachName.get(namensSchluessel(name));

  /**
   * Wie der Spieler heissen soll.
   *
   * Der gepflegte Anzeigename geht vor dem Turnierauftritt - aber auch er
   * laeuft durch dieselben Regeln. Viele gepflegte Namen tragen den Orgtag
   * naemlich noch mit sich ("HvK IDrop", "[EWC2026] DFM Rainy"); auf der
   * Karte faellt der weg, und in der Tierlist soll derselbe Name stehen.
   */
  const anzeige = (name, id) => {
    const p = profilVon(name, id);
    return ohneZierrat(kernname(p?.anzeige || name));
  };

  const duos = new Map();     // Schluessel -> Duo
  const solos = new Map();    // Schluessel -> Spieler
  const herkunft = [];

  for (const q of QUELLEN) {
    const d = await hole(`/api/cup-leaderboard?event=${encodeURIComponent(q.event)}`
      + `&window=${encodeURIComponent(q.window)}&limit=200`);
    const eintraege = d.entries ?? [];
    let neueDuos = 0, neueSolos = 0;

    for (const e of eintraege) {
      const spieler = (e.players ?? []).filter((p) => p.name);
      if (!spieler.length) continue;

      const aufbereitet = spieler.map((p) => {
        const pr = profilVon(p.name, p.id);
        return {
          epicId: p.id ?? '',
          name: anzeige(p.name, p.id),
          schluessel: namensSchluessel(p.name),
          countryCode: (pr?.land ?? '').toLowerCase(),
        };
      });

      // Solo-Liste: jeder einmal.
      for (const sp of aufbereitet) {
        const s = sp.epicId || sp.schluessel;
        if (!s || solos.has(s)) continue;
        // Auch ueber den Namen sperren: derselbe Mensch tritt in zwei Cups
        // unter zwei Konten auf, und doppelte Namen will der Nutzer nicht.
        if ([...solos.values()].some((x) => x.schluessel === sp.schluessel)) continue;
        solos.set(s, sp);
        neueSolos++;
      }

      // Duo-Liste: nur echte Zweierteams.
      if (aufbereitet.length !== 2) continue;
      const schl = aufbereitet.map((x) => x.epicId || x.schluessel).sort().join('|');
      if (duos.has(schl)) continue;
      duos.set(schl, { region: q.region, spieler: aufbereitet });
      neueDuos++;
    }

    herkunft.push(`${q.titel}: ${eintraege.length} Zeilen, +${neueDuos} Duos, +${neueSolos} Spieler`);
  }

  /* --------------------------------------------------- Eintraege bauen */

  const entries = [];
  for (const duo of duos.values()) {
    const id = randomUUID();
    entries.push({
      id,
      data: {
        id,
        region: duo.region,
        player1: {
          id: randomUUID(), name: duo.spieler[0].name,
          region: duo.region, countryCode: duo.spieler[0].countryCode,
        },
        player2: {
          id: randomUUID(), name: duo.spieler[1].name,
          region: duo.region, countryCode: duo.spieler[1].countryCode,
        },
        isGlobal: duo.region === 'GLOBAL',
      },
      tier: null, isDuo: true, localOnly: false,
    });
  }
  for (const sp of solos.values()) {
    const id = randomUUID();
    entries.push({
      id,
      data: {
        id, name: sp.name, region: 'EU',
        isGlobal: false, countryCode: sp.countryCode,
      },
      tier: null, isDuo: false, localOnly: false,
    });
  }

  const mitFlagge = [...solos.values()].filter((x) => x.countryCode).length;
  console.log('--- Herkunft der Daten ---');
  herkunft.forEach((z) => console.log('  ' + z));
  console.log('--- Ergebnis ---');
  console.log('  Duos :', duos.size);
  console.log('  Solos:', solos.size, `(${mitFlagge} mit gepflegter Flagge)`);
  console.log('  Eintraege gesamt:', entries.length);

  // Gegenprobe: kein Name doppelt.
  const namen = [...solos.values()].map((x) => x.schluessel);
  const doppelt = namen.filter((n, i) => namen.indexOf(n) !== i);
  console.log('  doppelte Namen:', doppelt.length ? doppelt : 'keine');

  if (!schreiben) {
    console.log('\nNur Bericht. Mit --schreiben wird data/tierlists.json ersetzt.');
    return;
  }

  const datei = path.join(process.cwd(), 'data', 'tierlists.json');
  const alt = JSON.parse(await fs.readFile(datei, 'utf8'));
  const liste = alt.lists?.[0] ?? {};
  const neu = {
    ...alt,
    lists: [{
      ...liste,
      listId: liste.listId ?? 'static-tierlist',
      listName: liste.listName ?? 'Tierlist',
      tierLabels: liste.tierLabels ?? { S: 'S', A: 'A', B: 'B', C: 'C', D: 'D', E: 'E', F: 'F' },
      entries,
      updatedAt: Date.now(),
    }],
  };
  await fs.writeFile(datei, JSON.stringify(neu, null, 2), 'utf8');
  console.log('\ndata/tierlists.json ersetzt.');
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
