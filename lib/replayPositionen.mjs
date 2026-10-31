// Positionen aller Spieler aus den CharacterSample-Ereignissen eines Server-Replays (31.10.2026).
//
// Jedes Server-Replay fuehrt neben dem Netzwerkstrom rund 35 Ereignisse "CharacterSample" - unverschluesselt, alle 40 Sekunden eines, darin je lebendem
// Spieler vier Proben im Abstand von 10 Sekunden. Aufbau (am FNCS-Solos-Finale EU entschluesselt, Gegenprobe: letzte Probe vor dem Tod im Median 10 m
// neben dem Todesort aus dem vollen Replay):
//
//   int32 Version (10), int32 Anzahl Spieler
//   je Spieler: int32 Laenge + Epic-Id (ASCII, mit Null), int32 Anzahl Proben
//   je Probe:   int32 Art, dann
//               Art 77-80:  int16 X, int16 Y, int16 Z, 1 Byte Zustand, uint16 Zeit (s)      = 9 Byte
//               Art 81-83:  int24 X, int24 Y, int16 Z, 1 Byte Bus, 1 Byte Zustand, uint16 Zeit = 12 Byte
//
// Zustand 5 = in der Luft (Bus, Fallen, Gleiten; die Hoehe laeuft dort ueber int16 hinaus und taugt nicht), 0/1/3 = am Boden. Daraus:
//   landung  die erste Bodenprobe nach dem Flug
//   fuss     die Strecke am Boden: Summe der Luftlinien zwischen aufeinanderfolgenden Bodenproben (Meter) - ein Mindestwert, Kurven zwischen zwei
//            Proben fehlen
//   luft     dasselbe in der Luft ohne den Bus

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const getDownloadLink = require('fortnite-serverreplay-downloader/src/getDownloadLink');
const BASIS = 'https://datastorage-public-service-live.ol.epicgames.com/api/v1/access/fnreplays/public/';
const LAENGE = { 77: 9, 78: 9, 79: 9, 80: 9, 81: 12, 82: 12, 83: 12 };

/** Ein CharacterSample-Block -> { epicId: [[zeit, x, y, z, zustand, bus]] } (an `spuren` angehaengt). */
export function liesProben(b, spuren = {}) {
  let o = 0;
  const i32 = () => { const v = b.readInt32LE(o); o += 4; return v; };
  i32(); const anz = i32();
  for (let p = 0; p < anz; p++) {
    const n = i32(); const id = b.toString('latin1', o, o + n - 1).toLowerCase(); o += n; const k = i32();
    for (let j = 0; j < k; j++) {
      const art = i32(); const len = LAENGE[art];
      if (!len) throw new Error(`unbekannte Probenart ${art}`);
      const r = b.subarray(o, o + len); o += len;
      const kurz = len === 9;
      (spuren[id] ??= []).push([
        r.readUInt16LE(len - 2),
        kurz ? r.readInt16LE(0) : r.readIntLE(0, 3),
        kurz ? r.readInt16LE(2) : r.readIntLE(3, 3),
        kurz ? r.readInt16LE(4) : r.readInt16LE(6),
        kurz ? r[6] : r[9],
        kurz ? 0 : r[8],
      ]);
    }
  }
  return spuren;
}

/** Alle Proben eines Matches holen. `ereignisse` = metadaten.Events (replayVorhanden). */
export async function holeSpuren(matchId, ereignisse) {
  const wahl = (ereignisse ?? []).filter((e) => e.Group === 'CharacterSample');
  if (!wahl.length) return {};
  const links = await getDownloadLink(`${BASIS}${matchId}/`, wahl.map((e) => `${e.Id}.bin`));
  const spuren = {};
  for (const e of wahl) {
    const l = links[`${e.Id}.bin`]?.readLink;
    if (!l) continue;
    const r = await fetch(l, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) continue;
    liesProben(Buffer.from(await r.arrayBuffer()), spuren);
  }
  for (const t of Object.values(spuren)) t.sort((a, b) => a[0] - b[0]);
  return spuren;
}

/** Je Spieler Landeort und Strecken (Meter) aus seinen Proben. */
export function auswerten(spuren) {
  const raus = {};
  for (const [id, t] of Object.entries(spuren)) {
    let fuss = 0, luft = 0, landung = null, warOben = false;
    for (let i = 0; i < t.length; i++) {
      const p = t[i];
      const oben = p[4] === 5;
      if (oben) warOben = true;
      if (!oben && !landung && warOben) landung = { x: p[1], y: p[2], t: p[0] };
      if (i === 0) continue;
      const v = t[i - 1];
      const d = Math.hypot(p[1] - v[1], p[2] - v[2]) / 100;
      // Mehr als 120 m/s ist ein Sprung in den Daten (Rift, Neuladen), keine Bewegung.
      if (d / Math.max(1, p[0] - v[0]) > 120) continue;
      if (!oben && v[4] !== 5) fuss += d;
      else if (oben && v[4] === 5 && !p[5] && !v[5]) luft += d;
    }
    raus[id] = { fuss: Math.round(fuss), luft: Math.round(luft), landung, proben: t.length };
  }
  return raus;
}

/**
 * Dieselben Proben aus einer fertig gebauten Replay-Datei (fortnite-serverreplay-downloader, buildReplay) - ohne einen einzigen weiteren Abruf bei
 * Epic. Ein Ereignis steht dort als FString Id, FString Gruppe, FString Metadaten, int32 Zeit1, int32 Zeit2, int32 Laenge, Daten; gesucht wird die
 * Gruppe "CharacterSample" (FString: int32 Laenge samt Null, Zeichen, Null).
 */
export function spurenAusReplay(puffer) {
  const marke = Buffer.concat([Buffer.from([16, 0, 0, 0]), Buffer.from('CharacterSample\0', 'latin1')]);
  const spuren = {};
  let ab = 0;
  for (;;) {
    const i = puffer.indexOf(marke, ab);
    if (i < 0) break;
    let o = i + marke.length;
    const metaLen = puffer.readInt32LE(o); o += 4 + Math.max(0, metaLen);
    o += 8; // Zeit1, Zeit2
    const len = puffer.readInt32LE(o); o += 4;
    if (len > 0 && o + len <= puffer.length) {
      try { liesProben(puffer.subarray(o, o + len), spuren); } catch { /* ein kaputter Block haelt den Rest nicht auf */ }
    }
    ab = o + Math.max(0, len);
  }
  for (const t of Object.values(spuren)) t.sort((a, b) => a[0] - b[0]);
  return spuren;
}
