// Die Scrims der Community-Server sammeln - Noble und Poyo, mit Leaderboard.
//
// Der Betreiber (25.9.2026): "von jedem Scrim Server, die du hast, von dieser
// Woche bis aktuell und nachher ab jetzt, dann machst du dann immer die
// neuesten hinzu einfach." Beide Seiten holen ihre Daten von offenen
// Adressen, ohne Anmeldung und ohne Schluessel:
//
//   Noble  tournament.nobleprac.com/guilds/<id>          die letzten 100 Sessions
//          tournament.nobleprac.com/tournaments/<id>     Leaderboard mit jeder Runde
//   Poyo   scrims.poyocup.com/api/view/servers            die Server
//          .../servers/<id>?date=YYYY-MM-DD                die Lobbys eines Tages
//          .../servers/<id>/lobby/<lobby>/leaderboard      Standings mit jeder Runde
//
// Warum ablegen und nicht nur live fragen: nobleprac.com gibt aeltere
// Leaderboards oft nicht mehr heraus ({"error": true}), und Poyo zeigt nur
// Tag fuer Tag. Was hier einmal vollstaendig geholt ist, bleibt.
//
// Abgelegt wird am GitHub-Release, nicht in Supabase (dort nur, was Nutzer
// selbst schreiben):
//
//   data/scrims/_index.json                     alle Sessions, kurz (fuer die Kacheln)
//   data/scrims/<YYYY-MM-DD>/<quelle>-<id>.json  je Server und Tag die Leaderboards
//
// Ein Tag wird bei jedem Lauf neu gebaut, solange er im Fenster liegt - aber
// was schon vollstaendig da war, geht dabei nie verloren: liefert die Quelle
// eine Session nicht mehr, bleibt die abgelegte stehen.
//
// Aufruf:  node scripts/scrims-holen.mjs                 die letzten drei Tage
//          node scripts/scrims-holen.mjs --seit 2026-09-21

import fs from 'node:fs';
import path from 'node:path';

const RELEASE = 'https://github.com/comphubgg/CompHub/releases/download';
const KOPF = { 'User-Agent': 'Mozilla/5.0 (CompHub scrims archive; +https://www.thecomphub.com)' };
const ZONE = 'Europe/Zurich';

const argumente = process.argv.slice(2);
const wert = (n) => { const i = argumente.indexOf(n); return i >= 0 ? argumente[i + 1] : undefined; };

/** Der Tag eines Zeitpunkts, wie man ihn in Mitteleuropa zaehlt. */
const tagVon = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date(ms));
const heute = tagVon(Date.now());
const seit = wert('--seit') ?? tagVon(Date.now() - 2 * 86400_000);
if (!/^\d{4}-\d{2}-\d{2}$/.test(seit)) { console.error('--seit JJJJ-MM-TT'); process.exit(1); }
const imFenster = (tag) => tag >= seit && tag <= heute;

const warte = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(url, versuche = 4) {
  for (let v = 1; ; v += 1) {
    let bremse = false;
    try {
      const r = await fetch(url, { headers: KOPF, signal: AbortSignal.timeout(30_000) });
      if (r.ok) return await r.json();
      if (r.status === 400 || r.status === 404) return null;
      // Zu viele Anfragen: laenger warten. Beim ersten Nachholen der Woche
      // kamen so 18 Poyo-Leaderboards nicht an, die es sehr wohl gab.
      bremse = r.status === 429 || r.status >= 500;
      if (v >= versuche) throw new Error(`${r.status}`);
    } catch (e) {
      if (v >= versuche) throw e;
    }
    await warte((bremse ? 10_000 : 3000) * v);
  }
}

/* --------------------------------------------------------- Kurzform */

/*
 * Ein Team, so knapp wie moeglich - ein Tag von Noble Practice hat drei
 * Leaderboards mit je rund 900 Teams. Die Kennzahlen (Siege, Schnitt ...)
 * rechnet die Seite beim Lesen aus den Runden (lib/scrimArchiv).
 *
 *   t  Team-Id          s  Spieler [Name, Epic-Id, Land, Discord-Id]
 *   p  Platz            P  Punkte     k  Kills
 *   g  Runden [Platz, Kills, Punkte, Zeitpunkt (s), Match-Id, Ueberlebt (s)]
 */
function team(t) {
  return {
    t: t.teamId, s: t.spieler, p: t.platz, P: t.punkte, k: t.kills,
    g: t.runden,
  };
}

/* ---------------------------------------------------------------- Noble */

const NOBLE = [
  ['854725181384556584', 'Noble Practice Scrims'], ['1098721307077652630', 'Noble Solos'],
  ['1403403384115040368', 'Noble Solos Closed'], ['1275856938940502047', 'Noble Division 0'],
  ['902656971113644132', 'Noble Division 3'], ['1539238647587405884', 'Noble Division 2'],
  ['757573638995050608', 'Noble Division 1'], ['797443677403217940', 'Noble Pro Scrims'],
  ['858831001663963156', 'Noble X'],
];

function groesseAusName(name) {
  const n = name.toLowerCase();
  if (/\bsolos?\b/.test(n)) return 1;
  if (/\bduos?\b/.test(n)) return 2;
  if (/\btrios?\b/.test(n)) return 3;
  if (/\bsquads?\b/.test(n)) return 4;
  return 0;
}

async function nobleServer(guildId, name, alt) {
  const liste = await json(`https://tournament.nobleprac.com/guilds/${guildId}`);
  const sitzungen = [];
  for (const s of Array.isArray(liste) ? liste : []) {
    const beginn = Date.parse(s.startDate) || 0;
    const ende = Date.parse(s.endDate) || 0;
    const tag = tagVon(beginn);
    if (!imFenster(tag)) continue;
    // Was noch laeuft, holt die Seite live - abgelegt wird erst, was vorbei ist.
    if (ende > Date.now()) continue;
    const vorher = alt.get(s.id);
    // Schon vollstaendig abgelegt? Beendete Sessions aendern sich nicht mehr.
    if (vorher && !vorher.nichtDa) { sitzungen.push(vorher); continue; }
    await warte(500);
    const t = await json(`https://tournament.nobleprac.com/tournaments/${s.id}`).catch(() => null);
    const basis = {
      id: s.id, quelle: 'noble', guildId, server: name, name: s.name.trim(), tag, beginn, ende,
      teamGroesse: groesseAusName(s.name),
      beschreibung: t?.description ? String(t.description).replace(/\\n/g, '\n')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') : undefined,
    };
    if (!t || !Array.isArray(t.leaderboard)) {
      // Die Quelle gibt es gerade nicht heraus - frueher Geholtes bleibt.
      sitzungen.push(vorher ?? { ...basis, nichtDa: true, teams: [] });
      continue;
    }
    const teams = t.leaderboard
      .filter((x) => (x.games ?? []).length)
      .map((x) => team({
        teamId: x.teamId, platz: x.placement, punkte: x.points, kills: x.kills,
        spieler: (x.players ?? []).map((p) => [p.displayName, p.accountId || null,
          p.country && p.country !== 'global' ? p.country.toUpperCase() : null, null]),
        runden: (x.games ?? []).map((g) => [g.placement, g.kills, g.score,
          Math.round((Date.parse(g.timestamp) || 0) / 1000), g.sessionId, Math.round(g.survivalTime || 0)]),
      }));
    if (!teams.length) continue; // nicht gespielt
    const groesse = t.leaderboard.find((x) => x.players?.length)?.players.length ?? 0;
    sitzungen.push({ ...basis, teamGroesse: groesse || basis.teamGroesse, teams });
  }
  return sitzungen;
}

/* ----------------------------------------------------------------- Poyo */

const POYO = 'https://scrims.poyocup.com/api/view/servers';
const GROESSE = { Solo: 1, Duo: 2, Trio: 3, Squad: 4 };

async function poyoServer(guildId, name, alt) {
  const erst = await json(`${POYO}/${guildId}`);
  const tage = (erst?.availableDays ?? []).filter(imFenster);
  // Heute steht nicht immer in availableDays, solange noch nichts vorbei ist.
  if (imFenster(heute) && !tage.includes(heute)) tage.push(heute);
  const sitzungen = [];
  for (const tag of tage) {
    await warte(300);
    const d = await json(`${POYO}/${guildId}?date=${tag}`).catch(() => null);
    for (const s of d?.sessions ?? []) {
      if (s.status !== 'ended') continue;
      const vorher = alt.get(s._id);
      if (vorher && !vorher.nichtDa) { sitzungen.push(vorher); continue; }
      await warte(700);
      const lb = await json(`${POYO}/${guildId}/lobby/${s._id}/leaderboard`).catch(() => null);
      const beginn = Date.parse(s.registrationTime || s.createdAt) || 0;
      const basis = {
        id: s._id, quelle: 'poyo', guildId, server: name, tag, beginn, ende: 0,
        name: lb?.tournament?.name || `Session ${s.sessionNumber} Lobby ${s.lobbyNumber}`,
        teamGroesse: GROESSE[s.teamSize] ?? 0, modus: s.gameMode || null,
        beschreibung: lb?.tournament?.description || undefined,
      };
      if (!lb || lb.available === false) {
        sitzungen.push(vorher ?? { ...basis, nichtDa: true, teams: [] });
        continue;
      }
      const teams = (lb.standings ?? [])
        .filter((x) => (x.games ?? []).length)
        .map((x) => team({
          teamId: x.teamId, platz: x.rank, punkte: x.totalScore, kills: x.totalKills,
          spieler: (x.players ?? []).map((p) => [p.name, null, null, p.discordId || null]),
          runden: (x.games ?? []).map((g) => [g.placement, g.kills, g.score, 0, g.sessionId, 0]),
        }));
      if (!teams.length) continue; // Lobby ohne gespielte Runde
      sitzungen.push({ ...basis, teams });
    }
  }
  return sitzungen;
}

/* ------------------------------------------------------ Ablage lesen */

const anhangName = (name) => name.replace(/\//g, '__').replace(/=/g, '-eq-');
/** Wie scripts/ablage-github.mjs: Tagesdateien je Monat ein Release. */
function tagFuer(name) {
  const m = name.match(/^scrims\/(\d{4}-\d{2})-\d{2}\//);
  return m ? `daten-scrims-${m[1]}` : 'daten-scrims';
}

/** Eine abgelegte Datei - erst hier auf der Platte, sonst vom Release. */
async function abgelegt(name) {
  const hier = path.join(process.cwd(), 'data', name);
  try { return JSON.parse(fs.readFileSync(hier, 'utf8')); } catch { /* dann vom Release */ }
  try {
    const r = await fetch(`${RELEASE}/${tagFuer(name)}/${encodeURIComponent(anhangName(name))}`,
      { headers: KOPF, redirect: 'follow', signal: AbortSignal.timeout(60_000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

function schreib(name, wert) {
  const ziel = path.join(process.cwd(), 'data', name);
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, JSON.stringify(wert));
}

/* ---------------------------------------------------------------- Lauf */

async function main() {
  console.log(`Scrims von ${seit} bis ${heute}`);
  const index = (await abgelegt('scrims/_index.json')) ?? { sitzungen: [] };

  const server = [
    ...NOBLE.map(([id, name]) => ({
      quelle: 'noble', guildId: id, name, region: 'EU',
      // Noble X ist gerade inaktiv (der Betreiber, und die Quelle antwortet mit 400).
      ...(name === 'Noble X' ? { inaktiv: true } : {}),
    })),
  ];
  const poyo = await json(POYO).catch(() => null);
  for (const s of Array.isArray(poyo) ? poyo : []) {
    server.push({ quelle: 'poyo', guildId: s.discordGuildId, name: s.name, region: 'EU',
      bild: s.icon || null, farbe: s.color || null, einladung: s.invite || null, mitglieder: s.memberCount || null });
  }

  // Die Tage im Fenster, je Server: was schon abgelegt ist, als Grundlage.
  const tageImFenster = [];
  for (let t = Date.parse(`${seit}T12:00:00Z`); tagVon(t) <= heute; t += 86400_000) tageImFenster.push(tagVon(t));

  let neu = 0; let gesamt = 0; let fehlen = 0;
  const kurz = new Map(index.sitzungen.map((s) => [s.id, s]));

  for (const sv of server) {
    const alt = new Map();
    const alteTage = new Map();
    for (const tag of tageImFenster) {
      const datei = await abgelegt(`scrims/${tag}/${sv.quelle}-${sv.guildId}.json`);
      alteTage.set(tag, datei);
      for (const s of datei?.sitzungen ?? []) alt.set(s.id, s);
    }
    let sitzungen = [];
    try {
      sitzungen = sv.quelle === 'noble'
        ? await nobleServer(sv.guildId, sv.name, alt)
        : await poyoServer(sv.guildId, sv.name, alt);
    } catch (e) {
      console.warn(`  ${sv.name}: ${e.message} - der abgelegte Stand bleibt`);
      continue;
    }
    // Was frueher abgelegt war und jetzt fehlt (die Quelle hat es vergessen), bleibt.
    const jetzt = new Set(sitzungen.map((s) => s.id));
    for (const s of alt.values()) if (!jetzt.has(s.id)) sitzungen.push(s);

    const jeTag = new Map();
    for (const s of sitzungen) (jeTag.get(s.tag) ?? jeTag.set(s.tag, []).get(s.tag)).push(s);
    for (const [tag, liste] of jeTag) {
      liste.sort((a, b) => a.beginn - b.beginn);
      schreib(`scrims/${tag}/${sv.quelle}-${sv.guildId}.json`, {
        quelle: sv.quelle, guildId: sv.guildId, server: sv.name, tag, sitzungen: liste,
      });
      for (const s of liste) {
        if (!alt.has(s.id)) neu += 1;
        if (s.nichtDa) fehlen += 1;
        gesamt += 1;
        kurz.set(s.id, {
          id: s.id, quelle: s.quelle, guildId: s.guildId, server: s.server, name: s.name,
          tag: s.tag, beginn: s.beginn, ende: s.ende, teamGroesse: s.teamGroesse,
          modus: s.modus ?? null, teams: s.teams.length,
          runden: new Set(s.teams.flatMap((x) => x.g.map((g) => g[4]))).size,
          ...(s.nichtDa ? { nichtDa: true } : {}),
        });
      }
    }
    console.log(`  ${sv.name.padEnd(24)} ${sitzungen.length} Sessions`);
  }

  schreib('scrims/_index.json', {
    stand: Date.now(), server,
    sitzungen: [...kurz.values()].sort((a, b) => b.beginn - a.beginn),
  });
  console.log(`Fertig: ${gesamt} Sessions im Fenster, ${neu} neu, ${fehlen} gibt die Quelle gerade nicht heraus.`);
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
