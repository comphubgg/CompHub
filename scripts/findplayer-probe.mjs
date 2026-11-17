// Probe (17.11.2026): gibt Epics Sitzungssuche (matchmaking/session/findPlayer) die laufende Sitzung FREMDER Konten heraus?
// Bisher zweimal leer gemessen (29.10.2026 an Clix live, 7.11.2026). Diese Probe fragt je Konto einmal, ohne Freundschaft, mit dem Geraete-Zugang
// der Seite (wie lib/matchFinder.sitzungVon) und zur Gegenprobe mit dem App-Token. Nur lesen. Hoechstens 50 Konten, eine Anfrage je Sekunde.
//   node scripts/findplayer-probe.mjs <epicId> [<epicId> ...]
import { holeNutzerToken, holeAppToken } from '../lib/replayKern.mjs';
const FINDE = 'https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/matchmaking/session/findPlayer/';
const ids = process.argv.slice(2).flatMap((x) => x.split(/[\s,]+/)).filter((x) => /^[0-9a-f]{32}$/i.test(x)).slice(0, 50);
const { token, accountId } = await holeNutzerToken();
const app = await holeAppToken().catch(() => null);
console.log(`Konten ${ids.length}, angemeldet als ${String(accountId).slice(0, 6)}...`);
for (const id of [accountId, ...ids]) {
  for (const [art, t] of [['geraet', token], ['app', app]]) {
    if (!t) continue;
    const r = await fetch(FINDE + id, { headers: { Authorization: t }, signal: AbortSignal.timeout(10_000) }).catch((e) => ({ ok: false, status: e.message }));
    let text = r.ok ? await r.text() : (r.text ? (await r.text()).slice(0, 160) : '');
    let n = '-';
    try { const j = JSON.parse(text); if (Array.isArray(j)) { n = j.length; text = j.map((s) => `${s.id} started=${s.started} ${s.attributes?.PLAYLISTNAME_s ?? ''}`).join(' | '); } } catch { /* Text bleibt */ }
    console.log(`${new Date().toISOString().slice(11, 19)} ${id === accountId ? 'EIGENES ' : ''}${id.slice(0, 8)} ${art}: HTTP ${r.status} Eintraege ${n} ${text.slice(0, 200)}`);
  }
  await new Promise((r) => setTimeout(r, 1000));
}
