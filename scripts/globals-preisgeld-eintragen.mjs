/*
 * Das Preisgeld der Global Championship 2026 von selbst eintragen.
 *
 * Der Betreiber: "nach jedem Cup sollten ja eigentlich die Earnings direkt
 * zugefuegt werden." Bei den LANs stand das Preisgeld bisher von Hand in
 * data/lan-preisgelder.json (Epic fuehrt dort nur Turnierkonten). Fuer die
 * Globals 2026 laesst es sich ohne Handarbeit rechnen:
 *
 *   Endstand   Epics Gesamtwertung, falls es eine gibt (2025 hiess sie
 *              "..._CumulativeLeaderboard"); sonst Tag 1 + Tag 2, geordnet
 *              nach Epics Regeln bei Gleichstand: Punkte, Siege, Elims je
 *              Spiel, Schnittplatz.
 *   Betrag     Epics Auszahlungstabelle (/api/globals-preisgeld, je Spieler)
 *   Konto      das LAN-Konto zum gewoehnlichen Konto (/api/globals-teams)
 *
 * Steht an einer Preisgrenze ein Gleichstand, den diese Regeln nicht
 * aufloesen, wird nichts eingetragen - dann geht eine Meldung an
 * #admin-alarm, statt eine geratene Zahl in die Earnings zu schreiben.
 *
 * Laeuft im stuendlichen Lauf gegen dessen Server, erst eine Stunde nach
 * dem Ende von Tag 2, und nur einmal (die Kennung steht dann in der Datei).
 * Nach dem Eintragen: je Spieler Name und Betrag nach #admin-zahlen.
 *
 * Aufruf:  node scripts/globals-preisgeld-eintragen.mjs http://localhost:3000 [--probe]
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const DATEN = process.env.COMPHUB_DATEN || path.join(PROJEKT, 'data');
const DATEI = path.join(DATEN, 'lan-preisgelder.json');
const SERVER = (process.argv.find((a) => a.startsWith('http')) || 'http://localhost:3000').replace(/\/+$/, '');
const PROBE = process.argv.includes('--probe');

const EVENT = 'epicgames_MannekenPis_Official';
const TAGE = ['MannekenPis_Day1', 'MannekenPis_Day2'];
const KENNUNG = 'fncs-global-championship-2026';
const API = 'https://discord.com/api/v10';

function umgebung() {
  const raus = {};
  try {
    for (const z of fs.readFileSync(path.join(PROJEKT, '.env.local'), 'utf8').split('\n')) {
      const m = z.match(/^([A-Z_]+)=(.*)$/); if (m) raus[m[1]] = m[2].trim().replace(/^"|"$/g, '');
    }
  } catch { /* keine Datei */ }
  return { ...raus, ...process.env };
}
const U = umgebung();
const TOKEN = U.DISCORD_BOT_TOKEN || '';
const SERVER_ID = U.DISCORD_SERVER_ID || '1529205620287344783';

const hole = (weg) => fetch(`${SERVER}${weg}`, { cache: 'no-store', signal: AbortSignal.timeout(90_000) })
  .then((r) => (r.ok ? r.json() : null)).catch(() => null);

async function discord(kanalName, einbettung) {
  if (!TOKEN || PROBE) return;
  const h = { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' };
  const kanaele = await fetch(`${API}/guilds/${SERVER_ID}/channels`, { headers: h }).then((r) => r.json());
  const k = Array.isArray(kanaele) && kanaele.find((x) => x.type === 0 && x.name === kanalName);
  if (!k) { console.log(`#${kanalName} fehlt`); return; }
  await fetch(`${API}/channels/${k.id}/messages`, { method: 'POST', headers: h, body: JSON.stringify({ embeds: [einbettung] }) });
}

/** Alle Eintraege eines Fensters (Epic gibt je Seite 100 heraus - 50 Teams passen auf eine). */
async function wertung(fenster) {
  const j = await hole(`/api/cup-leaderboard?event=${EVENT}&window=${encodeURIComponent(fenster)}`);
  return Array.isArray(j?.entries) ? j.entries : null;
}

const teamSchluessel = (e) => (e.players ?? []).map((p) => p.id).sort().join('|');

async function main() {
  const liste = JSON.parse(fs.readFileSync(DATEI, 'utf8'));
  if ((liste.eintraege ?? []).some((e) => e.kennung === KENNUNG)) {
    console.log('Globals 2026 stehen schon in lan-preisgelder.json.');
    return;
  }

  // Erst eine Stunde nach dem Ende von Tag 2 - dann hat Epic abgeschlossen.
  const katalog = await hole('/api/cup-catalog');
  const tag2 = (katalog?.cups ?? []).flatMap((c) => Object.values(c.regionen ?? {}).flat())
    .find((f) => f.windowId === TAGE[1]);
  if (!tag2) { console.log('Tag 2 steht nicht im Katalog.'); return; }
  if (!(tag2.status === 'vorbei' && tag2.end < Date.now() - 60 * 60_000)) {
    console.log(`Globals noch nicht vorbei (Tag 2: ${tag2.status}).`);
    return;
  }

  /* ------------------------------------------------------- Endstand */
  let stand = null; let herkunft = '';
  const gesamt = await wertung(`${EVENT}_CumulativeLeaderboard`);
  if (gesamt?.length >= 40) {
    stand = gesamt.map((e) => ({ schluessel: teamSchluessel(e), spieler: e.players, platz: e.rank, punkte: e.points }));
    herkunft = "Epic's cumulative leaderboard";
  } else {
    const [a, b] = await Promise.all(TAGE.map(wertung));
    if (!a?.length || !b?.length) { console.log('Eine Tageswertung fehlt - nichts eingetragen.'); return; }
    const teams = new Map();
    for (const e of [...a, ...b]) {
      const k = teamSchluessel(e);
      const t = teams.get(k) ?? { schluessel: k, spieler: e.players, punkte: 0, siege: 0, elims: 0, spiele: 0, plaetze: 0 };
      t.punkte += e.points ?? 0; t.siege += e.wins ?? 0; t.elims += e.elims ?? 0;
      t.spiele += e.games ?? 0; t.plaetze += (e.avgPlace ?? 0) * (e.games ?? 0);
      teams.set(k, t);
    }
    const reihe = [...teams.values()].map((t) => ({
      ...t, elimsJeSpiel: t.spiele ? t.elims / t.spiele : 0, schnitt: t.spiele ? t.plaetze / t.spiele : 99,
    })).sort((x, y) => y.punkte - x.punkte || y.siege - x.siege || y.elimsJeSpiel - x.elimsJeSpiel || x.schnitt - y.schnitt);
    // Ein Gleichstand in allen vier Werten laesst sich nicht aufloesen.
    const ungeloest = reihe.findIndex((t, i) => i > 0 && ['punkte', 'siege', 'elimsJeSpiel', 'schnitt']
      .every((f) => Math.abs(t[f] - reihe[i - 1][f]) < 1e-9));
    stand = reihe.map((t, i) => ({ ...t, platz: i + 1 }));
    herkunft = "Epic's Day 1 + Day 2 leaderboards, Epic's tiebreakers";
    if (ungeloest >= 0) {
      const grund = `Tie between places ${ungeloest} and ${ungeloest + 1} that the tiebreakers do not resolve.`;
      console.log(grund);
      await discord('admin-alarm', {
        title: 'Globals 2026 prize money not entered', color: 0xf97316,
        description: `${grund} Nothing was written to the earnings - please check the official final standings.`,
      });
      return;
    }
  }

  /* ------------------------------------------------ Betrag und Konto */
  const preis = await hole('/api/globals-preisgeld');
  const jePlatz = new Map((preis?.plaetze ?? []).map((p) => [p.platz, p.proSpieler]));
  if (!jePlatz.size) { console.log('Keine Auszahlungstabelle - nichts eingetragen.'); return; }
  const feld = await hole(`/api/globals-teams?fenster=${TAGE[0]}`);
  const konto = new Map();
  for (const t of feld?.teams ?? []) for (const s of t.spieler ?? []) {
    if (s.turnierId) konto.set(s.turnierId, { epicId: s.epicId ?? null, name: s.anzeige || s.name });
  }

  const spieler = []; const ohneKonto = [];
  for (const t of stand) {
    const betrag = jePlatz.get(t.platz) ?? 0;
    for (const p of t.spieler ?? []) {
      const k = konto.get(p.id);
      if (!k?.epicId) { ohneKonto.push(`${p.name} (#${t.platz})`); continue; }
      spieler.push({ epicId: k.epicId, name: k.name, platz: t.platz, betrag });
    }
  }
  spieler.sort((x, y) => x.platz - y.platz);

  const eintrag = {
    kennung: KENNUNG, name: 'FNCS Global Championship 2026', season: 'S42', fenster: TAGE[1],
    ort: 'Antwerp', waehrung: 'USD',
    quelle: `${herkunft}; payout table from Epic's tournament catalog (per player). Entered automatically by scripts/globals-preisgeld-eintragen.mjs.`,
    spieler,
  };
  console.log(`${spieler.length} Spieler, ${ohneKonto.length} ohne Konto, Summe ${spieler.reduce((a, s) => a + s.betrag, 0)} $ (${herkunft})`);
  if (PROBE) { console.log(JSON.stringify(spieler.slice(0, 6), null, 1)); return; }

  liste.eintraege = [...(liste.eintraege ?? []), eintrag];
  fs.writeFileSync(DATEI, JSON.stringify(liste, null, 2));

  // Je Spieler Name und Betrag nach #admin-zahlen (Vorgabe des Betreibers, 22.9.2026).
  const zeilen = spieler.filter((s) => s.betrag > 0)
    .map((s) => `\`${String(s.platz).padStart(2)}.\` ${s.name} · +${s.betrag.toLocaleString('en-US')} $`);
  for (let i = 0; i < zeilen.length; i += 40) {
    await discord('admin-zahlen', {
      title: i ? 'FNCS Global Championship 2026 · earnings (cont.)' : 'FNCS Global Championship 2026 · earnings added',
      color: 0x0ea5e9,
      description: zeilen.slice(i, i + 40).join('\n')
        + (i + 40 >= zeilen.length && ohneKonto.length
          ? `\n\nNo account found (not added): ${ohneKonto.join(', ')}` : ''),
      footer: { text: herkunft },
    });
  }
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
