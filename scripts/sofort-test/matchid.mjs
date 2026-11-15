/*
 * Sofort-Test, Match-ID: XMPP-Status bei der Epic-Attrappe -> Ereignis im Strom /api/streams/match-id/stream (als Admin).
 *
 *   node scripts/sofort-test/matchid.mjs <seite> <epic> <cookie> [runden=10] [clients=50]
 */
import http from 'http';
const [SEITE, EPIC, COOKIE, RUNDEN = '10', N = '50'] = process.argv.slice(2);
const FREUND = '00000000000000000000000000000fff';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const zuletzt = new Map(); // client -> { id, t }
let offen = 0;
for (let i = 0; i < Number(N); i++) {
  const u = new URL(`${SEITE}/api/streams/match-id/stream?kanal=teststreamer`);
  http.get({ host: u.hostname, port: u.port, path: u.pathname + u.search, agent: false, headers: { Cookie: `streamer_dashboard_auth=${COOKIE}` } }, (res) => {
    if (res.statusCode === 200) offen += 1;
    let p = ''; res.setEncoding('utf8');
    res.on('data', (c) => { p += c; let k; while ((k = p.indexOf('\n\n')) >= 0) { const b = p.slice(0, k); p = p.slice(k + 2); const d = /data: (.*)/.exec(b)?.[1]; if (/event: matchid/.test(b) && d) zuletzt.set(i, { id: JSON.parse(d).matchId, t: Date.now() }); } });
  });
}
await warte(2000);
console.log(`offene Stroeme: ${offen}/${N}`);
const lat = [];
for (let r = 0; r < Number(RUNDEN); r++) {
  const sid = (r % 3 === 2) ? null : [...Array(32)].map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
  const { zeit } = await (await fetch(`${EPIC}/__presence`, { method: 'POST', body: JSON.stringify({ from: FREUND, sessionId: sid }) })).json();
  const bis = Date.now() + 5000;
  while (Date.now() < bis && [...zuletzt.values()].filter((x) => x.id === sid && x.t >= zeit).length < Number(N)) await warte(5);
  const an = [...zuletzt.values()].filter((x) => x.id === sid && x.t >= zeit).map((x) => x.t - zeit);
  console.log(`Runde ${r}: ${sid ?? '(kein Game)'} bei ${an.length}/${N}, ${an.length ? `${Math.min(...an)}-${Math.max(...an)} ms` : '-'}`);
  lat.push(...an);
  await warte(500);
}
lat.sort((a, b) => a - b);
console.log(`XMPP-Status -> Client: n=${lat.length} p50=${lat[Math.floor(lat.length / 2)]} ms max=${lat[lat.length - 1]} ms`);
process.exit(0);
