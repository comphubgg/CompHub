// Probe (17.11.2026): gibt Epics Sitzungssuche (matchmaking/session/findPlayer) die laufende Sitzung FREMDER Konten heraus?
// Bisher zweimal leer gemessen (29.10.2026 an Clix live, 7.11.2026). Gefragt wird mit dem Geraete-Zugang der Seite (wie lib/matchFinder.sitzungVon),
// ohne Freundschaft. Nur lesen. Hoechstens 50 Konten, eine Anfrage je Sekunde, nacheinander.
//
//   node scripts/findplayer-probe.mjs <datei mit "epicId name" je Zeile | epicIds ...>
//   Umgebung: PROBE_MIN (Dauer in Minuten, Standard 0 = eine Runde), PROBE_TAKT_S (Pause zwischen Runden, 20),
//             PROBE_ABLEGEN=1 -> jeder Treffer sofort als findplayer-treffer.txt an den Release "signale" (live lesbar)
//
// Jede NEUE nicht-leere Sitzung: eine Zeile "TREFFER <name> <sessionId> <utc>".
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { holeNutzerToken, verwirfNutzerToken } from '../lib/replayKern.mjs';

const FINDE = 'https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/matchmaking/session/findPlayer/';
const DAUER_MS = Number(process.env.PROBE_MIN || 0) * 60_000;
const TAKT_MS = Number(process.env.PROBE_TAKT_S || 20) * 1000;
const ABLEGEN = process.env.PROBE_ABLEGEN === '1';
const REPO = process.env.GITHUB_REPOSITORY || 'comphubgg/CompHub';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const uhr = () => new Date().toISOString().slice(11, 19);

const args = process.argv.slice(2);
const zeilen = args.length === 1 && fs.existsSync(args[0]) ? fs.readFileSync(args[0], 'utf8').split('\n') : [args.join(' ')];
const konten = [];
for (const z of zeilen) {
  // Entweder "id name" je Zeile oder viele Ids in einer Zeile.
  const teile = z.trim().split(/\s+/).filter(Boolean);
  if (teile.length >= 2 && /^[0-9a-f]{32}$/i.test(teile[0]) && !/^[0-9a-f]{32}$/i.test(teile[1])) konten.push({ id: teile[0].toLowerCase(), name: teile.slice(1).join(' ') });
  else for (const t of teile) if (/^[0-9a-f]{32}$/i.test(t)) konten.push({ id: t.toLowerCase(), name: t.slice(0, 8) });
}
const liste = konten.slice(0, 50);

const treffer = new Map(); // sessionId -> Zeilen
function ablegen() {
  if (!ABLEGEN) return;
  const datei = '/tmp/findplayer-treffer.txt';
  fs.writeFileSync(datei, [...treffer.values()].flat().join('\n') + '\n');
  const r = spawnSync('gh', ['release', 'upload', 'signale', datei, '--clobber', '-R', REPO], { encoding: 'utf8' });
  if (r.status !== 0) console.log(`  (Ablegen ging nicht: ${String(r.stderr).trim().slice(0, 160)})`);
}

async function frage(id) {
  for (let v = 0; v < 2; v++) {
    const { token } = await holeNutzerToken();
    const r = await fetch(FINDE + id, { headers: { Authorization: token }, signal: AbortSignal.timeout(10_000) }).catch((e) => ({ ok: false, status: e.message, text: async () => '' }));
    if (r.status === 401 && v === 0) { verwirfNutzerToken(); continue; }
    const text = await r.text().catch(() => '');
    let liste = null;
    try { const j = JSON.parse(text); if (Array.isArray(j)) liste = j; } catch { /* kein JSON */ }
    return { status: r.status, liste, text };
  }
  return { status: 401, liste: null, text: '' };
}

const { accountId } = await holeNutzerToken();
console.log(`${uhr()} Konten ${liste.length}, angemeldet als ${String(accountId).slice(0, 6)}..., Dauer ${DAUER_MS / 60_000} min, Takt ${TAKT_MS / 1000} s`);
const ende = Date.now() + DAUER_MS;
let runde = 0;
do {
  runde += 1;
  const zaehler = { leer: 0, voll: 0, fehler: 0 };
  // Erste Runde: auch das eigene Konto als Gegenprobe (Form der Antwort).
  for (const k of runde === 1 ? [{ id: String(accountId).toLowerCase(), name: 'EIGENES' }, ...liste] : liste) {
    const a = await frage(k.id);
    if (!a.liste) { zaehler.fehler += 1; if (runde === 1 || zaehler.fehler <= 3) console.log(`${uhr()} ${k.name}: HTTP ${a.status} ${a.text.slice(0, 160)}`); }
    else if (!a.liste.length) zaehler.leer += 1;
    else {
      zaehler.voll += 1;
      for (const s of a.liste) {
        const sid = String(s.id ?? '');
        const z = `TREFFER ${k.name} ${sid} ${new Date().toISOString()} started=${s.started} playlist=${s.attributes?.PLAYLISTNAME_s ?? '?'} konto=${k.id}`;
        if (!treffer.has(sid)) { treffer.set(sid, [z]); console.log(z); ablegen(); }
        else if (!treffer.get(sid).some((x) => x.includes(k.id))) { treffer.get(sid).push(z); console.log(z); }
      }
    }
    await warte(1000);
  }
  console.log(`${uhr()} Runde ${runde}: ${zaehler.voll} mit Sitzung, ${zaehler.leer} leer, ${zaehler.fehler} Fehler`);
  if (Date.now() + TAKT_MS < ende) await warte(TAKT_MS);
} while (Date.now() < ende);
console.log(`${uhr()} Ende: ${treffer.size} verschiedene Sitzungen`);
