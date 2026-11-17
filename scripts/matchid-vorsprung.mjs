// Wie frueh hatten wir die Match-ID? Je Match eines Spieltags: Busstart (endTime - timeAlive, Median ueber die Spieler), erster Tod,
// erste Sichtung in der Bestenliste (wenn bekannt) und - falls mitgegeben - die erste Sichtung im Status eines Freundes (XMPP).
//
//   node scripts/matchid-vorsprung.mjs <bestenliste.json> [sichtungen.json]
//
// bestenliste.json: die Antwort von /api/cup-leaderboard (entries[].matches[] mit sessionId, endTime, timeAlive, placement) - ein fertiger Spieltag.
// sichtungen.json (optional): { "<matchId>": { "bestenliste": "<ISO>", "freund": "<ISO>" } } - z. B. aus dem Protokoll des XMPP-Dienstes.
// Nur lesen, nichts ablegen.
import fs from 'node:fs';

export function matchZeiten(daten) {
  const je = new Map();
  for (const e of daten?.entries ?? []) {
    for (const m of e.matches ?? []) {
      const ende = Date.parse(m.endTime ?? '');
      if (!m.sessionId || !Number.isFinite(ende)) continue;
      const a = je.get(m.sessionId) ?? { matchId: m.sessionId, starts: [], enden: [] };
      a.starts.push(ende - (Number(m.timeAlive) || 0) * 1000);
      a.enden.push({ t: ende, platz: m.placement ?? null });
      je.set(m.sessionId, a);
    }
  }
  return [...je.values()].map((a) => {
    const s = [...a.starts].sort((x, y) => x - y);
    const e = [...a.enden].sort((x, y) => x.t - y.t);
    return { matchId: a.matchId, spieler: s.length, bus: s[Math.floor(s.length / 2)], ersterTod: e[0].t, ersterTodPlatz: e[0].platz, letztesEnde: e[e.length - 1].t };
  }).sort((a, b) => a.bus - b.bus);
}

const uhr = (t) => (Number.isFinite(t) ? new Date(t).toISOString().slice(11, 19) : '-');
const min = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? `${((a - b) / 60_000).toFixed(1)} min` : '-');

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [datei, sicht] = process.argv.slice(2);
  if (!datei) { console.log('node scripts/matchid-vorsprung.mjs <bestenliste.json> [sichtungen.json]'); process.exit(1); }
  const daten = JSON.parse(fs.readFileSync(datei, 'utf8'));
  const s = sicht ? JSON.parse(fs.readFileSync(sicht, 'utf8')) : {};
  console.log(`${daten.windowId ?? datei}: Stand ${daten.updated ?? '?'}`);
  console.log('Match                             Spieler  Bus       ersterTod (Platz)  +Bus     Bestenliste +Bus    Freund   +Bus     Vorsprung');
  for (const z of matchZeiten(daten)) {
    const b = Date.parse(s[z.matchId]?.bestenliste ?? ''), f = Date.parse(s[z.matchId]?.freund ?? '');
    console.log(`${z.matchId}  ${String(z.spieler).padStart(5)}  ${uhr(z.bus)}  ${uhr(z.ersterTod)} (${z.ersterTodPlatz ?? '?'})`.padEnd(70)
      + `${min(z.ersterTod, z.bus).padEnd(9)}${uhr(b)}  ${min(b, z.bus).padEnd(9)}${uhr(f)}  ${min(f, z.bus).padEnd(9)}${min(b, f)}`);
  }
}
