// Probe fuer /stats (Betreiber, 15.11.2026): die Antwort des Bots fuer einen Spieler und Cup genau so bauen, wie die Route sie schickt - mit den
// echten Daten (Ablage, Epic). Gibt die Einbettungen als JSON aus, dazu Epics eigenen Eintrag des Teams (Platz, Punkte) als Gegenprobe.
//   node scripts/discord-stats-probe.cjs "<Spieler>" ["w:<Fenster>" | <Cup-Id>] [<eventId>]
const fs = require('fs');
const path = require('path');
for (const z of (() => { try { return fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n'); } catch { return []; } })()) {
  const m = z.match(/^([A-Za-z_0-9]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}
process.env.COMPHUB_KEIN_HINTERGRUND = '1';
const jiti = require('jiti')(__filename, { alias: { '@': process.cwd() }, interopDefault: true });
(async () => {
  const [spieler, cup, eventId] = process.argv.slice(2);
  const S = jiti('../lib/discordStats.ts');
  const K = jiti('../lib/discordSpielerSuche.ts');
  let t = Date.now();
  const v1 = await S.cupVorschlaege('', spieler);
  console.log('PROBE vorschlaege kalt', Date.now() - t, 'ms', v1.length, JSON.stringify(v1.slice(0, 3)));
  t = Date.now();
  await K.kontoErgebnisse(/^[0-9a-f]{32}$/i.test(spieler) ? spieler : '00000000000000000000000000000000');
  console.log('PROBE bestand', Date.now() - t, 'ms');
  t = Date.now();
  const v2 = await S.cupVorschlaege('', spieler);
  console.log('PROBE vorschlaege warm', Date.now() - t, 'ms', v2.length, JSON.stringify(v2.slice(0, 5)));
  t = Date.now();
  const a = await S.statsAntwort(spieler, cup || undefined);
  console.log('PROBE antwort', Date.now() - t, 'ms');
  console.log('PROBE JSON', JSON.stringify(a));
  for (const e of a.embeds ?? []) {
    console.log('PROBE ---', e.title, e.url);
    console.log(String(e.description ?? '').split('\n').map((x) => `PROBE | ${x}`).join('\n'));
    for (const f of e.fields ?? []) console.log(`PROBE [${f.name}] ${String(f.value).replace(/\n/g, ' / ')}`);
    if (e.footer) console.log('PROBE footer', e.footer.text);
  }
  if (eventId && cup?.startsWith('w:') && /^[0-9a-f]{32}$/i.test(spieler)) {
    const E = jiti('../lib/epicCups.ts');
    t = Date.now();
    const r = await E.findeSpieler(eventId, cup.slice(2), [], [spieler.toLowerCase()]);
    const x = r.entries[0];
    console.log('PROBE epic', Date.now() - t, 'ms', x ? `rang ${x.rank} punkte ${x.points} (platz ${x.punktePlatz} + elims ${x.punkteElims}) spiele ${x.games} siege ${x.wins} team ${x.players.map((p) => p.name).join(' + ')}` : 'nicht gefunden');
  }
  process.exit(0);
})().catch((e) => { console.error('PROBE Fehler', e); process.exit(1); });
