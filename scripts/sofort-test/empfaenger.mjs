// Probe der Sofortspur ohne die Seite: nimmt POST /api/sofort/match an wie app/api/sofort/match (Bearer, gzip), legt jeden Koerper unveraendert als
// <ordner>/<windowId>__<matchId>.json.gz ab und antwortet { ok, angenommen, ms }. Damit laesst sich der Lauf auf GitHub (scripts/live-spur.mjs mit
// LIVE_SENDEN_URL) samt Senden pruefen und die Teile spaeter gegen eine lokale Seite (next start) wiederholen (scripts/sofort-test/nachsenden.mjs).
//
//   node scripts/sofort-test/empfaenger.mjs <ordner> [port]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [ordner = 'sofort-empfang', port = '39200'] = process.argv.slice(2);
fs.mkdirSync(ordner, { recursive: true });
const soll = (process.env.SOFORT_SECRET || '').trim();

http.createServer((q, a) => {
  const t0 = performance.now();
  const teile = [];
  q.on('data', (d) => teile.push(d));
  q.on('end', () => {
    const antwort = (status, x) => { a.writeHead(status, { 'content-type': 'application/json' }); a.end(JSON.stringify({ ...x, ms: +(performance.now() - t0).toFixed(1) })); };
    if (q.method !== 'POST') return antwort(405, { fehler: 'nur POST' });
    if (soll && (q.headers.authorization ?? '') !== `Bearer ${soll}`) return antwort(401, { fehler: 'nicht erlaubt' });
    const roh = Buffer.concat(teile);
    let teil;
    try { teil = JSON.parse((roh[0] === 0x1f && roh[1] === 0x8b ? zlib.gunzipSync(roh) : roh).toString('utf8')); } catch { return antwort(400, { fehler: 'kein JSON' }); }
    const id = teil?.matches?.[0]?.id;
    if (!teil?.windowId || !id) return antwort(400, { fehler: 'kein Teil' });
    fs.writeFileSync(path.join(ordner, `${teil.windowId}__${id}.json.gz`), roh[0] === 0x1f ? roh : zlib.gzipSync(roh));
    console.log(new Date().toISOString().slice(11, 19), 'angenommen', teil.windowId, id, roh.length, 'B');
    return antwort(200, { ok: true, angenommen: true, windowId: teil.windowId, matchId: id });
  });
}).listen(Number(port), '127.0.0.1', () => console.log(`Empfaenger auf ${port}, Ablage ${ordner}`));
