/*
 * Replay-Werte: aus .replay-Dateien die Werte je einzelnem Spieler.
 *
 * Der Betreiber: "Stats pro EINZELNEM Spieler extrahieren, nicht pro Team.
 * Bei einem Squad = 4 separate Stats-Objekte." Und: "Ich weiss, man kann
 * Damage herausfinden, Mats Farmed herausfinden ... einfach, dass er eine
 * Replay-Datei hat. Nicht der Matchcode." Genau so arbeitet dieses Skript:
 * es liest Replay-Dateien - die eigenen Aufzeichnungen aus
 * %LOCALAPPDATA%\FortniteGame\Saved\Demos oder hochgeladene Dateien anderer
 * Spieler - und, wo Epic sie noch vorhaelt (31 Tage), die Server-Replays
 * eines Turniermatches.
 *
 * ------------------------------------------------------- Was drinsteht
 *
 * Gelesen wird mit dem C#-Leser (fortnite-replay-analysis, FortniteReplay-
 * Decompressor mit nativer Oodle-Entpackung) - er liest Fortnite 42.x, der
 * JavaScript-Parser nicht mehr. Nachgemessen an einer eigenen Aufzeichnung
 * vom 17.9.2026 (42.20), Feld fuer Feld:
 *
 *   FUER JEDEN SPIELER DER LOBBY (aus dem Netzwerk-Stream):
 *     Konto-Id, Name, Team, Mitspieler, Plattform, Level, Platz (sobald
 *     das Team raus ist), Kills, Team-Kills, Todesursache, Todeszeitpunkt,
 *     Kill-Feed mit Waffe, Entfernung, Knock oder Kill, Wiederbelebung.
 *
 *   NUR FUER DEN AUFZEICHNENDEN SPIELER (Stats-Ereignis des Replays):
 *     Eliminierungen, Trefferquote, Assists, Waffenschaden, sonstiger
 *     Schaden, Schaden an Spielern, erlittener Schaden, Schaden an Bauten,
 *     Material gesammelt, Material verbaut, zurueckgelegte Strecke, Revives.
 *
 * Das ist die Grenze der Quelle, nicht des Lesers: Epic legt die Werte des
 * Stats-Ereignisses nur fuer den ab, der aufzeichnet. Damage, Material und
 * Strecke eines Squads kommen deshalb aus VIER Replays, je eines je
 * Spieler - wie bei Osirion, wo jeder sein eigenes hochlaedt. Dieses Skript
 * fuehrt mehrere Replays desselben Matches zusammen (GameSessionId): jede
 * Datei steuert die vollen Werte ihres Aufzeichners bei.
 *
 * Was in KEINEM Replay steht, bleibt null und wird unter "nicht_im_replay"
 * benannt - nie mit Null oder einer Schaetzung gefuellt (Regel des
 * Betreibers: keine erfundenen Zahlen). Das sind: Schaden je Waffe,
 * Schuesse und Treffer einzeln, Kopftreffer, Heilung, Edits und Editzeit,
 * Bauteile, Material je Sorte, Sturm-Werte, Reboots durch andere.
 *
 * ------------------------------------------------------------- Aufruf
 *
 *   node scripts/replay-werte.mjs                      alle .replay aus dem Demos-Ordner
 *   node scripts/replay-werte.mjs --ordner C:\pfad     alle .replay aus diesem Ordner
 *   node scripts/replay-werte.mjs --datei a.replay b.replay
 *   node scripts/replay-werte.mjs --match <id> [...]   Server-Replays von Epic (31 Tage)
 *   node scripts/replay-werte.mjs --fenster S42_x_EU --event epicgames_S42_x_EU
 *                                                      alle Matches eines Spieltags
 *   --worker 10        parallele Leser (Voreinstellung 10)
 *   --versuche 3       Wiederholungen fuer "failed" nach dem ersten Durchgang
 *   --loeschen         .replay-Dateien nach erfolgreicher Auswertung loeschen
 *                      (aus: die eigenen Aufzeichnungen bleiben liegen;
 *                      heruntergeladene Server-Replays werden immer geloescht)
 *   --ziel <ordner>    Ausgabe (Voreinstellung data/replay-werte)
 *
 * Ausgabe: je Match eine JSON-Datei <match_id>.json im Zielordner, dazu
 * _zustand.json mit dem Stand jeder Datei ("done", "failed (n)").
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import process from 'process';
import { createRequire } from 'module';
import { leseReplay } from '../lib/replayLeser.mjs';
import { ABLAGE, matchIds, warte } from '../lib/replayKern.mjs';

// Derselbe Datenordner wie das Replay-Werkzeug (ABLAGE ist data/replays).
const DATEN_ORT = path.dirname(ABLAGE);

const require = createRequire(import.meta.url);
const { downloadReplay } = require('fortnite-serverreplay-downloader');

/* ------------------------------------------------------------ Argumente */

const argumente = process.argv.slice(2);
const wert = (name, standard = '') => {
  const i = argumente.indexOf(name);
  return i >= 0 ? (argumente[i + 1] ?? standard) : standard;
};
const werte = (name) => {
  const raus = [];
  for (let i = 0; i < argumente.length; i += 1) {
    if (argumente[i] !== name) continue;
    for (let j = i + 1; j < argumente.length && !argumente[j].startsWith('--'); j += 1) raus.push(argumente[j]);
  }
  return raus;
};

const WORKER = Math.max(1, Number(wert('--worker', '10')) || 10);
const VERSUCHE = Math.max(1, Number(wert('--versuche', '3')) || 3);
const LOESCHEN = argumente.includes('--loeschen');
const ZIEL = wert('--ziel') || path.join(DATEN_ORT, 'replay-werte');
const DEMOS = path.join(process.env.LOCALAPPDATA || '', 'FortniteGame', 'Saved', 'Demos');

/* ------------------------------------------------------------- Enums */

// ASSUMPTION: GunType im Elim-Ereignis und DeathCause im Kill-Feed folgen
// EFortWeaponType bzw. EDeathCause des Decompressors (Werte 2..6 sind in
// beiden gleich belegt: Pistol, Shotgun, Rifle, SMG, Sniper). Nachgeprueft
// an der eigenen Aufzeichnung: zwei Shotgun-Kills stehen in beiden als 3.
const WAFFEN_ART = require('fortnite-replay-parser/Enums/EFortWeaponType.json');
const TODESURSACHE = require('fortnite-replay-parser/Enums/EDeathCause.json');

const waffe = (n) => (n === null || n === undefined ? null : (WAFFEN_ART[String(n)] ?? `Unbekannt(${n})`));
const ursache = (n) => (n === null || n === undefined ? null : (TODESURSACHE[String(n)] ?? `Unbekannt(${n})`));

/* ------------------------------------------------------- Umrechnung */

const rund = (x, stellen = 2) => (typeof x === 'number' && Number.isFinite(x)
  ? Math.round(x * 10 ** stellen) / 10 ** stellen : null);

/**
 * Die Teamgroesse - abgelesen, nie angenommen.
 *
 * ASSUMPTION: Die Teamgroesse ist die haeufigste Groesse der menschlichen
 * Teams (TeamIndex-Gruppen ohne Bots). GameData.TeamSize taugt nicht: es
 * stand bei einem Solo-Match auf 100. Unvollstaendige Teams (ein Duo, dessen
 * Partner nie geladen hat) veraendern das Ergebnis nicht, weil der Modus
 * zaehlt, nicht das Maximum.
 */
function teamGroesse(spieler) {
  const je = new Map();
  for (const p of spieler) je.set(p.TeamIndex, (je.get(p.TeamIndex) ?? 0) + 1);
  const haeufigkeit = new Map();
  for (const n of je.values()) haeufigkeit.set(n, (haeufigkeit.get(n) ?? 0) + 1);
  let beste = 1; let anzahl = -1;
  for (const [n, h] of haeufigkeit) if (h > anzahl || (h === anzahl && n > beste)) { beste = n; anzahl = h; }
  return beste;
}

/**
 * Ein gelesenes Replay in Werte je Spieler uebersetzen.
 *
 * @param roh   Ausgabe des C#-Lesers.
 * @param quelle 'client' (eigene Aufzeichnung) oder 'server' (Epic).
 */
function uebersetze(roh, quelle) {
  const alle = (roh.PlayerData ?? []).filter((p) => p && p.TeamIndex !== null && p.TeamIndex !== undefined);
  const menschen = alle.filter((p) => !p.IsBot);
  const laengeS = typeof roh.Info?.LengthInMs === 'number' ? roh.Info.LengthInMs / 1000 : null;
  const eigener = alle.find((p) => p.IsReplayOwner) ?? null;
  const stats = roh.Stats && typeof roh.Stats === 'object' ? roh.Stats : null;

  /*
   * Die Weltzeit, bei der die Aufzeichnung beginnt.
   *
   * ASSUMPTION: Der Kill-Feed nennt Todeszeitpunkte als Weltzeit des
   * Servers (ReplicatedWorldTimeSeconds), die schon in der Lobby laeuft.
   * Eine eigene Aufzeichnung endet mit dem eigenen Ausscheiden; ihr Anfang
   * liegt also bei (eigener Todeszeitpunkt - Laenge der Aufzeichnung). Bei
   * einem Server-Replay (kein Aufzeichner) gilt der fruehste Todeszeitpunkt
   * minus die Zeit bis dahin nicht - dort bleibt die Lebenszeit relativ
   * zum ersten Ereignis. Beides steht als "zeitbasis" in der Ausgabe, damit
   * die Herkunft der Zahl nachvollziehbar bleibt.
   */
  let weltzeitStart = null; let zeitbasis = null;
  if (eigener && typeof eigener.DeathTimeDouble === 'number' && laengeS) {
    weltzeitStart = eigener.DeathTimeDouble - laengeS;
    zeitbasis = 'eigener Todeszeitpunkt minus Laenge der Aufzeichnung';
  } else {
    const zeiten = (roh.KillFeed ?? []).map((k) => k.ReplicatedWorldTimeSecondsDouble).filter((t) => typeof t === 'number');
    if (zeiten.length) { weltzeitStart = Math.min(...zeiten); zeitbasis = 'fruehester Eintrag im Kill-Feed (relativ)'; }
  }

  const nachId = new Map(alle.map((p) => [p.Id, p]));
  const teams = new Map();
  for (const p of alle) {
    if (!teams.has(p.TeamIndex)) teams.set(p.TeamIndex, []);
    teams.get(p.TeamIndex).push(p);
  }

  // Kill-Feed je Spieler: was er anderen antat, was ihm geschah.
  const getan = new Map();   // Id -> Eintraege als Taeter
  const erlitten = new Map(); // Id -> Eintraege als Opfer
  for (const k of roh.KillFeed ?? []) {
    if (k.FinisherOrDowner !== null && k.FinisherOrDowner !== undefined) {
      if (!getan.has(k.FinisherOrDowner)) getan.set(k.FinisherOrDowner, []);
      getan.get(k.FinisherOrDowner).push(k);
    }
    if (k.PlayerId !== null && k.PlayerId !== undefined) {
      if (!erlitten.has(k.PlayerId)) erlitten.set(k.PlayerId, []);
      erlitten.get(k.PlayerId).push(k);
    }
  }

  const spieler = menschen.map((p) => {
    const team = teams.get(p.TeamIndex) ?? [];
    const taten = getan.get(p.Id) ?? [];
    const kills = taten.filter((k) => !k.IsDowned && k.PlayerId !== p.Id);
    const knocks = taten.filter((k) => k.IsDowned && k.PlayerId !== p.Id);
    const jeWaffe = {};
    for (const k of kills) { const w = ursache(k.DeathCause) ?? 'Unbekannt'; jeWaffe[w] = (jeWaffe[w] ?? 0) + 1; }
    const geschehen = erlitten.get(p.Id) ?? [];
    const gestorben = typeof p.DeathTimeDouble === 'number' && p.DeathCause !== null && p.DeathCause !== undefined;
    const tode = gestorben ? 1 : 0;
    const lebenszeit = gestorben && weltzeitStart !== null ? Math.max(0, p.DeathTimeDouble - weltzeitStart) : null;
    const istEigener = Boolean(p.IsReplayOwner) && stats !== null;
    const s = istEigener ? stats : null;
    const kd = kills.length / Math.max(1, tode);
    const entfernungen = kills.map((k) => k.Distance).filter((d) => typeof d === 'number' && d > 0);

    return {
      player_id: p.EpicId ? String(p.EpicId).toLowerCase() : null,
      name: p.PlayerName ?? null,
      team: p.TeamIndex,
      team_mates: team.filter((m) => m.Id !== p.Id).map((m) => (m.EpicId ? String(m.EpicId).toLowerCase() : m.PlayerName)),
      platform: p.Platform ?? null,
      level: p.SeasonLevelUIDisplay ?? p.Level ?? null,
      placement: typeof p.Placement === 'number' ? p.Placement : null,
      is_replay_owner: Boolean(p.IsReplayOwner),
      /** Woher die vollen Werte stammen - oder dass es nur den Stream gibt. */
      quelle: istEigener ? 'eigenes Replay (Stats-Ereignis + Netzwerk-Stream)' : 'Netzwerk-Stream',

      combat: {
        eliminations: kills.length,
        eliminations_by_weapon: jeWaffe,
        knocks: knocks.length,
        // Epics eigener Zaehler am Spieler - zur Gegenprobe zum Kill-Feed.
        kills_per_epic: typeof p.Kills === 'number' ? p.Kills : null,
        team_kills_per_epic: typeof p.TeamKills === 'number' ? p.TeamKills : null,
        deaths: tode,
        death_cause: gestorben ? ursache(p.DeathCause) : null,
        kd_ratio: rund(kd),
        avg_elimination_distance_m: entfernungen.length ? rund(entfernungen.reduce((a, b) => a + b, 0) / entfernungen.length / 100) : null,
        damage_to_players: s ? s.DamageToPlayers ?? null : null,
        damage_to_players_by_weapon: null,
        weapon_damage: s ? s.WeaponDamage ?? null : null,
        other_damage: s ? s.OtherDamage ?? null : null,
        damage_from_players: s ? s.DamageTaken ?? null : null,
        damage_ratio: s && s.DamageTaken > 0 ? rund((s.DamageToPlayers ?? 0) / s.DamageTaken) : null,
        damage_to_structures: s ? s.DamageToStructures ?? null : null,
        shots: null,
        hits_to_players: null,
        player_accuracy: null,
        overall_accuracy: s && typeof s.Accuracy === 'number' ? rund(s.Accuracy, 4) : null,
        headshots: null,
        weakpoint_accuracy: null,
      },
      healing: { health_healed: null, shield_healed: null, overshield_healed: null },
      building: { edit_accuracy: null, avg_edit_time_ms: null, builds_placed: null, mats_used: s ? s.MaterialsUsed ?? null : null, mats_used_wood: null, mats_used_metal: null, mats_used_brick: null },
      materials_farmed: { wood: null, stone: null, metal: null, total: s ? s.MaterialsGathered ?? null : null },
      materials_collected: { wood: null, stone: null, metal: null, total: null },
      storm: { time_in_storm_s: null, storm_damage_taken: null, surge_hits: null },
      survival: {
        time_alive_s: lebenszeit !== null ? rund(lebenszeit, 1) : null,
        death_world_time_s: gestorben ? rund(p.DeathTimeDouble, 1) : null,
        assists: s ? s.Assists ?? null : null,
      },
      revive: {
        players_revived: s ? s.Revives ?? null : null,
        got_revived: geschehen.filter((k) => k.IsDowned && k.IsRevived).length,
        players_rebooted: null,
        got_rebooted: typeof p.RebootCounter === 'number' ? p.RebootCounter : null,
      },
      movement: { distance_traveled_km: s && typeof s.TotalTraveled === 'number' ? rund(s.TotalTraveled / 100000, 3) : null },
    };
  });

  const ende = roh.GameData?.MatchEndTime ?? null;
  return {
    match_id: roh.GameData?.GameSessionId ?? null,
    match_start_time: roh.GameData?.UtcTimeStartedMatch ?? null,
    match_end_time: ende,
    recorded_at: roh.Info?.Timestamp ?? null,
    replay_length_s: laengeS !== null ? rund(laengeS, 1) : null,
    fortnite_version: roh.Header?.Branch ?? null,
    playlist: roh.GameData?.CurrentPlaylist ?? null,
    is_tournament_round: roh.GameData?.IsTournamentRound ?? null,
    quelle,
    zeitbasis,
    team_size: teamGroesse(menschen),
    total_players: menschen.length,
    bots: alle.length - menschen.length,
    /**
     * Deckt die Aufzeichnung das ganze Match ab? Eine eigene Aufzeichnung
     * endet mit dem Ausscheiden des Aufzeichners; wer danach noch lebte,
     * hat keinen Platz. Ehrlich gesagt statt still ergaenzt.
     */
    complete: spieler.every((p) => p.placement !== null),
    players_without_placement: spieler.filter((p) => p.placement === null).length,
    nicht_im_replay: [
      'damage_to_players_by_weapon', 'shots', 'hits_to_players', 'player_accuracy', 'headshots',
      'weakpoint_accuracy', 'healing.*', 'building.edit_accuracy', 'building.avg_edit_time_ms',
      'building.builds_placed', 'building.mats_used_by_type', 'materials_farmed.by_type',
      'materials_collected.*', 'storm.*', 'revive.players_rebooted',
      'Fuer alle ausser dem Aufzeichner ausserdem: damage_*, overall_accuracy, assists, mats_*, players_revived, distance_traveled_km',
    ],
    players: spieler,
  };
}

/**
 * Zwei Auswertungen desselben Matches zusammenfuehren.
 *
 * Jede Datei steuert die vollen Werte ihres Aufzeichners bei; fuer alle
 * anderen gilt: was schon dasteht, bleibt - ein Wert wird nur aufgefuellt,
 * wo er bisher null war (etwa der Platz eines Teams, das in der einen
 * Aufzeichnung noch lebte und in der anderen schon raus war).
 */
function fuehreZusammen(alt, neu) {
  if (!alt) return neu;
  const nachId = new Map(alt.players.map((p) => [p.player_id ?? p.name, p]));
  const fuelle = (ziel, quelle) => {
    for (const [k, v] of Object.entries(quelle)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) { ziel[k] = ziel[k] && typeof ziel[k] === 'object' ? ziel[k] : {}; fuelle(ziel[k], v); }
      else if (ziel[k] === null || ziel[k] === undefined) ziel[k] = v;
    }
  };
  for (const p of neu.players) {
    const k = p.player_id ?? p.name;
    const da = nachId.get(k);
    if (!da) { alt.players.push(p); nachId.set(k, p); continue; }
    if (p.is_replay_owner) {
      // Die vollen Werte des Aufzeichners ersetzen den Stream-Stand.
      Object.assign(da, p);
    } else {
      fuelle(da, p);
    }
  }
  alt.replays = [...new Set([...(alt.replays ?? []), ...(neu.replays ?? [])])];
  alt.complete = alt.players.every((p) => p.placement !== null);
  alt.players_without_placement = alt.players.filter((p) => p.placement === null).length;
  if (!alt.match_end_time && neu.match_end_time) alt.match_end_time = neu.match_end_time;
  return alt;
}

/* ------------------------------------------------------------ Zustand */

const zustandPfad = () => path.join(ZIEL, '_zustand.json');
async function liesZustand() {
  try { return JSON.parse(await fs.readFile(zustandPfad(), 'utf8')); } catch { return { dateien: {} }; }
}
async function schreibeZustand(z) {
  await fs.mkdir(ZIEL, { recursive: true });
  const tmp = zustandPfad() + '.neu';
  await fs.writeFile(tmp, JSON.stringify(z, null, 1));
  await fs.rename(tmp, zustandPfad());
}

/* --------------------------------------------------------- Ein Replay */

/**
 * Eine Datei auswerten und ablegen. Wirft bei Fehlern - der Aufrufer
 * merkt sich "failed (n)".
 */
async function werteAus(quelleDatei, art) {
  const roh = await leseReplay(quelleDatei, 180_000);
  if (!roh || !Array.isArray(roh.PlayerData) || !roh.PlayerData.length) {
    throw new Error('Leser lieferte keine Spieler - Datei beschaedigt oder unvollstaendig');
  }
  const werte = uebersetze(roh, art);
  // ASSUMPTION: Die GameSessionId ("CK-760093|<uuid>") ist je Match eindeutig
  // und in jeder Aufzeichnung desselben Matches gleich. Fehlt sie, gilt der
  // Dateiname als Kennung, damit nichts verloren geht.
  const kennung = (werte.match_id ?? path.basename(quelleDatei, '.replay')).replace(/[^A-Za-z0-9_.-]/g, '_');
  werte.replays = [path.basename(quelleDatei)];
  const ziel = path.join(ZIEL, `${kennung}.json`);
  let vorhanden = null;
  try { vorhanden = JSON.parse(await fs.readFile(ziel, 'utf8')); } catch { vorhanden = null; }
  const fertig = fuehreZusammen(vorhanden, werte);
  const tmp = ziel + '.neu';
  await fs.writeFile(tmp, JSON.stringify(fertig, null, 1));
  await fs.rename(tmp, ziel);
  // Speicher sofort frei: die Rohausgabe des Lesers (bis 200 MB) wird nicht weiter gehalten.
  return { kennung, spieler: fertig.players.length, teamgroesse: fertig.team_size, complete: fertig.complete };
}

/**
 * Ein Server-Replay von Epic holen - mit Backoff bei Drosselung.
 *
 * ASSUMPTION: Eine Drosselung meldet sich als Fehler mit "429" oder einem
 * 5xx im Text; dann wird 2, 4, 8, 16, 32 Sekunden gewartet und neu versucht.
 */
async function ladeServerReplay(matchId) {
  let fehler = null;
  for (let versuch = 0; versuch < 6; versuch += 1) {
    try {
      return await downloadReplay({ matchId, dataCount: 100000, checkpointCount: 100000, eventCount: 100000 });
    } catch (e) {
      fehler = e;
      const text = String(e?.message ?? e);
      if (!/429|5\d\d|ECONNRESET|ETIMEDOUT|rate/i.test(text)) throw e;
      await warte(2000 * 2 ** versuch);
    }
  }
  throw fehler;
}

/* ------------------------------------------------------------- Pool */

/** N Aufgaben gleichzeitig, jede ein eigener Leser-Prozess. */
async function pool(aufgaben, n, eine) {
  let i = 0;
  const arbeiter = Array.from({ length: Math.min(n, aufgaben.length) }, async () => {
    while (i < aufgaben.length) {
      const a = aufgaben[i]; i += 1;
      await eine(a);
    }
  });
  await Promise.all(arbeiter);
}

/* ------------------------------------------------------------- Lauf */

async function main() {
  const beginn = Date.now();
  const aufgaben = [];

  const dateien = werte('--datei');
  const ordner = wert('--ordner');
  const matches = werte('--match');
  const fenster = wert('--fenster');
  const event = wert('--event');

  if (fenster) {
    if (!event) { console.error('--fenster braucht --event (Epic-Ereigniskennung).'); process.exit(1); }
    const ids = await matchIds(event, fenster);
    for (const id of ids) matches.push(id);
    console.log(`  Spieltag ${fenster}: ${ids.length} Matches`);
  }
  for (const m of matches) aufgaben.push({ art: 'server', matchId: m, name: m });

  const quellOrdner = ordner || (!dateien.length && !matches.length ? DEMOS : '');
  if (quellOrdner) {
    let namen = [];
    try { namen = (await fs.readdir(quellOrdner)).filter((n) => n.toLowerCase().endsWith('.replay')); }
    catch { console.error(`Ordner nicht lesbar: ${quellOrdner}`); process.exit(1); }
    for (const n of namen) aufgaben.push({ art: 'client', datei: path.join(quellOrdner, n), name: n });
  }
  for (const d of dateien) aufgaben.push({ art: 'client', datei: path.resolve(d), name: path.basename(d) });

  if (!aufgaben.length) { console.log('  Nichts zu tun - keine Replays gefunden.'); return; }

  const zustand = await liesZustand();
  zustand.dateien ??= {};
  // Schon fertig Ausgewertetes wird nicht noch einmal gelesen.
  const offen = aufgaben.filter((a) => zustand.dateien[a.name]?.status !== 'done');

  console.log('');
  console.log(`  Replays     : ${aufgaben.length} (${offen.length} offen, ${aufgaben.length - offen.length} schon fertig)`);
  console.log(`  Worker      : ${WORKER}`);
  console.log(`  Ziel        : ${ZIEL}`);
  console.log(`  Loeschen    : ${LOESCHEN ? 'ja (nach erfolgreicher Auswertung)' : 'nein (nur heruntergeladene Server-Replays)'}`);
  console.log('');

  const tmpOrdner = path.join(os.tmpdir(), 'comphub-replay-werte');
  await fs.mkdir(tmpOrdner, { recursive: true });
  await fs.mkdir(ZIEL, { recursive: true });

  let fertig = 0; let ok = 0; let schief = 0;
  const eine = async (a, versuch) => {
    let datei = a.datei;
    let geladen = false;
    try {
      if (a.art === 'server') {
        const puffer = await ladeServerReplay(a.matchId);
        datei = path.join(tmpOrdner, `${a.matchId}.replay`);
        await fs.writeFile(datei, puffer);
        geladen = true;
      }
      const ergebnis = await werteAus(datei, a.art);
      zustand.dateien[a.name] = { status: 'done', versuche: versuch, match: ergebnis.kennung, spieler: ergebnis.spieler, team_size: ergebnis.teamgroesse, complete: ergebnis.complete, zeit: new Date().toISOString() };
      ok += 1;
      if (LOESCHEN && a.art === 'client') await fs.unlink(datei).catch(() => {});
    } catch (e) {
      zustand.dateien[a.name] = { status: `failed (${versuch})`, versuche: versuch, fehler: String(e?.message ?? e).slice(0, 300), zeit: new Date().toISOString() };
      schief += 1;
    } finally {
      if (geladen) await fs.unlink(datei).catch(() => {});
      fertig += 1;
      if (fertig % 10 === 0 || fertig === offen.length) {
        process.stdout.write(`\r  ${String(fertig).padStart(5)}/${offen.length}  ok ${ok}  failed ${schief}`);
        await schreibeZustand(zustand);
      }
    }
  };

  // Erster Durchgang: alles Offene.
  await pool(offen, WORKER, (a) => eine(a, 1));
  console.log('');

  /*
   * Danach nur noch, was "failed" ist - zwei-, dreimal. Der Betreiber:
   * "sobald du alle anderen Statistiken hast, probierst du es nochmal 2,3
   * mal ... wenn es dann nicht geht, okay, markier die dann mit failed
   * (wie oft du es versucht hast)."
   */
  for (let versuch = 2; versuch <= VERSUCHE; versuch += 1) {
    const nochmal = offen.filter((a) => String(zustand.dateien[a.name]?.status ?? '').startsWith('failed'));
    if (!nochmal.length) break;
    console.log(`  Durchgang ${versuch}: ${nochmal.length} noch einmal`);
    fertig = 0; schief = 0;
    await pool(nochmal, WORKER, (a) => eine(a, versuch));
    console.log('');
  }
  await schreibeZustand(zustand);

  const staende = Object.values(zustand.dateien);
  const done = staende.filter((s) => s.status === 'done').length;
  const failed = staende.filter((s) => String(s.status).startsWith('failed'));
  console.log('');
  console.log(`  Fertig      : ${done}`);
  console.log(`  Failed      : ${failed.length}`);
  for (const [name, s] of Object.entries(zustand.dateien)) {
    if (String(s.status).startsWith('failed')) console.log(`    - ${name}: ${s.status} - ${s.fehler}`);
  }
  console.log(`  Dauer       : ${Math.round((Date.now() - beginn) / 1000)} s`);
  console.log('');
}

main().catch((e) => { console.error(e); process.exit(1); });
