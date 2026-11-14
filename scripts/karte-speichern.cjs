// Eine Noble-Karte (tools/posts/karte-daten.js aus scripts/noble-karte-daten.mjs) als oeffentliche Turnierkarte in die Ablage schreiben
// (turnier-karten.json, Format wie app/api/turnier-karten) - damit der Reiter "Karte" beim Spieltag erscheint, auch ohne den Editor.
//   node scripts/karte-speichern.cjs <karte-daten.js> <eventId> <titel> <bildId> <bildTitel>
const fs = require('fs');
for (const z of (fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '').split('\n')) {
  const m = z.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}
const jiti = require('jiti')(__filename, { alias: { '@': process.cwd() } });
(async () => {
  const [datei, eventId, titel, bildId, bildTitel] = process.argv.slice(2);
  const K = JSON.parse(fs.readFileSync(datei, 'utf8').replace(/^window\.KARTE=/, '').replace(/;\s*$/, ''));
  const { speicher } = jiti('../lib/ablage.ts');
  const roh = await speicher.lies('turnier-karten.json');
  if (roh === null) throw new Error('turnier-karten.json nicht lesbar - nichts geschrieben');
  const karten = JSON.parse(String(roh));
  const windowId = K.fenster.windowId;
  const id = `noble-${windowId}`;
  const teams = []; const spots = [];
  K.formen.forEach((f, i) => {
    const ids = [];
    for (const t of f.teams) {
      const tid = t.ids.join('-');
      teams.push({ id: tid, spieler: t.namen, farbe: '#ffffff', ids: t.ids, quelle: 'noble' });
      ids.push(tid);
    }
    spots.push({ id: `s${i + 1}`, form: 'polygon', punkte: f.punkte, teams: ids });
  });
  const karte = { id, titel, region: K.region, eventId, windowId, bildId, bildTitel, namenSichtbar: true, gesperrt: false, spots, teams, geaendert: Date.now(), oeffentlich: true };
  const rest = karten.filter((k) => k.id !== id && !(k.windowId === windowId && k.bildId === bildId));
  rest.push(karte);
  await speicher.schreib('turnier-karten.json', Buffer.from(JSON.stringify(rest, null, 1)));
  console.log(`gespeichert: ${id} (${spots.length} Spots, ${teams.length} Teams) - jetzt ${rest.length} Karten`);
})().catch((e) => { console.error(e); process.exit(1); });
