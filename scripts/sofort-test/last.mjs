/*
 * Sofort-Test, Teil Server: viele EventSource-Clients auf einem Spieltag (app/api/live/stream) und auf der Match-ID (app/api/streams/match-id/stream).
 *
 *   node scripts/sofort-test/last.mjs <seite=http://127.0.0.1:3300> <epic=http://127.0.0.1:4700> [clients=200] [aenderungen=10] [cookie]
 *
 * Misst je Aenderung bei der Epic-Attrappe:
 *   gesamt   = Aenderung bei "Epic" -> Ereignis beim Client (enthaelt den Abfragetakt des Servers, im Mittel PROBE/2)
 *   push     = Server hat den neuen Stand (stand.zeit) -> Ereignis beim Client  (das, was "when the server has it" heisst)
 * dazu Speicher/CPU des Serverprozesses (pid aus /proc, Argument 6) und die Epic-Anfragen je Sekunde (Zaehler der Attrappe).
 */
import http from 'http';
import fs from 'fs';

const [SEITE = 'http://127.0.0.1:3300', EPIC = 'http://127.0.0.1:4700', N = '200', AEND = '10', COOKIE = '', PID = ''] = process.argv.slice(2);
const EVENT = 'S99_TestCup_EU', WINDOW = 'S99_TestCup_Heat1_EU';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ein minimaler EventSource-Client: ruft beiEreignis(name, daten, ankunftMs) auf. */
function sse(url, beiEreignis, kopf = {}) {
  const u = new URL(url);
  let zu = false;
  const req = http.get({ host: u.hostname, port: u.port, path: u.pathname + u.search, headers: { Accept: 'text/event-stream', 'Accept-Encoding': 'gzip, br', ...kopf }, agent: false }, (res) => {
    beiEreignis('__status', { status: res.statusCode, koepfe: res.headers }, Date.now());
    let puffer = '';
    res.setEncoding('utf8');
    res.on('data', (c) => {
      puffer += c;
      let i;
      while ((i = puffer.indexOf('\n\n')) >= 0) {
        const block = puffer.slice(0, i); puffer = puffer.slice(i + 2);
        let name = 'message', daten = '';
        for (const z of block.split('\n')) { if (z.startsWith('event: ')) name = z.slice(7); else if (z.startsWith('data: ')) daten += z.slice(6); }
        if (daten) { let d = daten; try { d = JSON.parse(daten); } catch { /* text */ } beiEreignis(name, d, Date.now()); }
      }
    });
    res.on('end', () => { if (!zu) beiEreignis('__ende', null, Date.now()); });
  });
  req.on('error', (e) => { if (!zu) beiEreignis('__fehler', e.message, Date.now()); });
  return () => { zu = true; req.destroy(); };
}

const holJson = async (url, opt) => (await fetch(url, opt)).json();
function prozess(pid) {
  if (!pid) return null;
  try {
    const st = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const rss = Number(/VmRSS:\s+(\d+)/.exec(st)?.[1] ?? 0) / 1024;
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
    return { rssMb: Math.round(rss), cpuS: (Number(stat[11]) + Number(stat[12])) / 100 };
  } catch { return null; }
}
const stats = (xs) => { const s = [...xs].sort((a, b) => a - b); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { n: s.length, min: s[0], p50: q(0.5), p95: q(0.95), max: s[s.length - 1], mittel: Math.round(s.reduce((a, b) => a + b, 0) / s.length) }; };

const zahl = Number(N);
console.log(`== ${zahl} Clients auf ${WINDOW}`);
const vor = prozess(PID);
const clients = [];
const empfang = new Map(); // v -> [ankunft]
let kopfGeprueft = false;
let hallo = 0;
let staende = new Map(); // v -> stand.zeit
for (let i = 0; i < zahl; i++) {
  clients.push(sse(`${SEITE}/api/live/stream?event=${EVENT}&window=${WINDOW}&what=leaderboard,matches,qual`, (name, d, t) => {
    if (name === '__status' && !kopfGeprueft) { kopfGeprueft = true; console.log('Status', d.status, 'Koepfe:', JSON.stringify({ 'content-type': d.koepfe['content-type'], 'cache-control': d.koepfe['cache-control'], 'x-accel-buffering': d.koepfe['x-accel-buffering'], 'content-encoding': d.koepfe['content-encoding'] ?? '(keine)' })); }
    if (name === 'hallo') hallo += 1;
    if (name === 'leaderboard') { if (!empfang.has(d.v)) empfang.set(d.v, []); empfang.get(d.v).push(t); staende.set(d.v, d.zeit); }
    if (name === '__fehler' || name === '__ende') console.log('Client', i, name, d);
  }));
}
await warte(4000);
console.log(`hallo erhalten: ${hallo}/${zahl}`);
const mitte = prozess(PID);
const epic0 = (await holJson(`${EPIC}/__zaehler`)).zaehler.seite ?? 0;
const t0 = Date.now();

const gesamt = [], push = [], vollstaendig = [];
for (let k = 0; k < Number(AEND); k++) {
  const vorV = Math.max(0, ...empfang.keys());
  const { zeit } = await holJson(`${EPIC}/__aendern?n=5`, { method: 'POST' });
  // warten, bis alle Clients den neuen Stand haben (hoechstens 10 s)
  const bis = Date.now() + 10_000;
  let v = null;
  while (Date.now() < bis) {
    v = [...empfang.keys()].find((x) => x > vorV && empfang.get(x).length >= zahl);
    if (v) break;
    await warte(20);
  }
  if (!v) { const neu = [...empfang.keys()].filter((x) => x > vorV); console.log(`Aenderung ${k}: nicht bei allen angekommen`, neu.map((x) => empfang.get(x).length)); continue; }
  const an = empfang.get(v);
  for (const t of an) { gesamt.push(t - zeit); push.push(t - staende.get(v)); }
  vollstaendig.push(Math.max(...an) - staende.get(v));
  await warte(1000 + Math.random() * 3000);
}
const dauer = (Date.now() - t0) / 1000;
const epic1 = (await holJson(`${EPIC}/__zaehler`)).zaehler.seite ?? 0;
const nach = prozess(PID);
console.log('Latenz Epic-Aenderung -> Client (ms):', JSON.stringify(stats(gesamt)));
console.log('Latenz Server hat Stand -> Client (ms):', JSON.stringify(stats(push)));
console.log('Letzter von allen Clients (ms nach Server-Stand):', JSON.stringify(stats(vollstaendig)));
console.log(`Epic-Seitenabrufe: ${epic1 - epic0} in ${dauer.toFixed(1)} s = ${((epic1 - epic0) / dauer).toFixed(2)}/s (unabhaengig von ${zahl} Clients)`);
if (vor) console.log('Server vorher', vor, 'mit Clients', mitte, 'nach Test', nach, `CPU im Test ${(nach.cpuS - mitte.cpuS).toFixed(2)} s in ${dauer.toFixed(1)} s = ${(100 * (nach.cpuS - mitte.cpuS) / dauer).toFixed(1)} %`);
console.log('Status:', JSON.stringify((await holJson(`${SEITE}/api/live/status`)), null, 0));
for (const c of clients) c();
await warte(1500);
console.log('Nach dem Schliessen:', JSON.stringify((await holJson(`${SEITE}/api/live/status`)).stroeme));
await warte(32_000);
console.log('35 s spaeter (Abruf beendet?):', JSON.stringify((await holJson(`${SEITE}/api/live/status`)).live.fenster));
process.exit(0);
