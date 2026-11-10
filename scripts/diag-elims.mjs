// Diagnose: Elims, wie die Seite sie rechnet (lib/vollSchaden.mjs), aus den Leser-Ausgaben /tmp/aus-<match>.json - je Spieler summiert.
import fs from 'node:fs';
import { schadenAus } from '../lib/vollSchaden.mjs';
const muster = new RegExp(process.argv[2] ?? '.', 'i');
const sum = {};
for (const f of fs.readdirSync('/tmp').filter((x) => /^aus-[0-9a-f]{32}\.json$/.test(x))) {
  const d = JSON.parse(fs.readFileSync('/tmp/' + f, 'utf8'));
  const namen = Object.fromEntries((d.spieler ?? []).map((p) => [p.epic, p.name]));
  const team = Object.fromEntries((d.spieler ?? []).map((p) => [p.id, p.team]));
  for (const [epic, v] of Object.entries(schadenAus(d) ?? {})) {
    const n = namen[epic]; if (!n || !muster.test(n)) continue;
    const p = (d.spieler ?? []).find((x) => x.epic === epic);
    const zaehler = ((d.killVerlauf?.[p.id] ?? []).slice(-1)[0] ?? [0, 0])[1];
    const feed = (d.feed ?? []).filter((f) => f.art === 'tot' && f.taeter === p.id && f.opfer !== p.id && team[f.opfer] !== p.team).length;
    const a = sum[n] ??= { elims: 0, nachAus: 0, spiele: 0, zaehler: 0, feed: 0, je: [] }; a.elims += v.killsEcht ?? 0; a.nachAus += v.killsNachAus ?? 0; a.spiele++; a.zaehler += zaehler; a.feed += feed;
    a.je.push(`${f.slice(4, 12)}:z${zaehler}/f${feed}/platz${p.platz}`);
  }
}
for (const [n, a] of Object.entries(sum)) console.log('ELIMS', n, JSON.stringify(a));
