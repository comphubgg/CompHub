// Holt fuer die Heat-Fenster: Endstand (epic-spieltage), Wertung (clutch regeln), Match-Ids (aggregat), je Match das volle Replay (schlank gespeichert).
import fs from 'node:fs';
import path from 'node:path';
const { tagsFuer } = await import(new URL('../../lib/releaseTags.mjs', import.meta.url).href);
const REPO = 'comphubgg/CompHub';
const ZIEL = process.argv[2];
const anhang = (n) => n.replace(/\//g, '__').replace(/=/g, '-eq-');
async function hol(tag, name) {
  for (let v = 0; v < 3; v++) {
    try {
      const r = await fetch(`https://github.com/${REPO}/releases/download/${tag}/${encodeURIComponent(anhang(name))}`, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return JSON.parse(Buffer.from(await r.arrayBuffer()).toString('utf8'));
    } catch (e) { if (v === 2) throw e; await new Promise((r) => setTimeout(r, 2000)); }
  }
}
async function holIrgendwo(name, tags = tagsFuer(name)) { for (const t of tags) { const d = await hol(t, name); if (d) return d; } return null; }
const fenster = process.argv.slice(3);
for (const w of fenster) {
  const datei = path.join(ZIEL, `${w}.json`);
  if (fs.existsSync(datei)) { console.log('da', w); continue; }
  const s = /^(S\d+)_/.exec(w)[1];
  const end = await holIrgendwo(`epic-spieltage/${s}/${w}.json`);
  const clutch = await holIrgendwo(`clutch/${w}.json`);
  const agg = await holIrgendwo(`replays/${s}/${w}/_aggregat.json`);
  if (!agg) { console.log('FEHLT', w, !!end, !!agg); continue; }
  const monat = new Date(agg.von ?? end?.datum).toISOString().slice(0, 7);
  const ids = agg.matchIds ?? [];
  const matches = [];
  await Promise.all(ids.map(async (id) => {
    let rv = await holIrgendwo(`replay-voll/${monat}/${w}/${id}.json`);
    if (!rv) { const m2 = new Date((agg.bis ?? 0)).toISOString().slice(0, 7); if (m2 !== monat) rv = await holIrgendwo(`replay-voll/${m2}/${w}/${id}.json`); }
    if (!rv) { console.log('  Match fehlt', w, id); return; }
    matches.push({ id, beginn: rv.beginn, laenge: rv.laenge, ende: rv.ende, sieger: rv.sieger,
      spieler: (rv.spieler ?? []).map((p) => ({ epic: p.epic, platz: p.platz, kills: p.kills, teamKills: p.teamKills, team: p.team, tod: p.tod ?? null })) });
  }));
  matches.sort((a, b) => String(a.beginn).localeCompare(String(b.beginn)));
  fs.writeFileSync(datei, JSON.stringify({ windowId: w, teams: end?.teams ?? null, regeln: clutch?.regeln ?? null, matchIds: ids, von: agg.von, bis: agg.bis, matches }));
  console.log('ok', w, 'matches', matches.length, '/', ids.length, 'teams', end?.teams?.length);
}
