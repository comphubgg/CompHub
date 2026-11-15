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
  // Der Weg fuer verknuepfte Konten (lib/discordEpicKonto) mit der Geraete-Anmeldung des Werkzeugs selbst - nur lesen, nichts speichern, nichts widerrufen.
  if (eventId && cup?.startsWith('w:')) {
    try {
      const auth = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'epic-auth.json'), 'utf8'));
      const V = jiti('../lib/discordEpicKonto.ts');
      t = Date.now();
      const g = await V.probeEintrag(auth, eventId, cup.slice(2));
      console.log('PROBE eigenes Konto', Date.now() - t, 'ms', g ? `rang ${g.rank} punkte ${g.points} spiele ${g.games}` : 'kein Eintrag in diesem Spieltag (Konto hat nicht gespielt?)');
      const E = jiti('../lib/epicCups.ts');
      const { token, accountId } = await E.getToken();
      const h = await fetch(`${E.EVENTS}/api/v1/events/Fortnite/${encodeURIComponent(eventId)}/history/${accountId}`, { headers: { Authorization: token } });
      const hj = await h.json().catch(() => null);
      console.log('PROBE history eigenes Konto', h.status, Array.isArray(hj) ? `${hj.length} Eintraege, Fenster: ${hj.slice(0, 5).map((x) => x.scoreKey?.eventWindowId + ' #' + x.rank).join(', ')}` : JSON.stringify(hj).slice(0, 200));
      const l = await fetch(`${E.EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(eventId)}/${encodeURIComponent(cup.slice(2))}/${accountId}?page=0&rank=0&teamAccountIds=${accountId}`, { headers: { Authorization: token } });
      const lj = await l.json().catch(() => null);
      console.log('PROBE bestenliste eigenes Team', l.status, lj?.entries ? `${lj.entries.length} Eintraege, erster #${lj.entries[0]?.rank}` : JSON.stringify(lj).slice(0, 200));
    } catch (e) { console.log('PROBE eigenes Konto Fehler', String(e).slice(0, 200)); }
  }
  try { console.log('PROBE ablage', await jiti('../lib/discordEpicKonto.ts').probeAblage()); } catch (e) { console.log('PROBE ablage Fehler', String(e).slice(0, 200)); }
  try {
    const S2 = jiti('../lib/discordStats.ts');
    const a2 = await S2.verknuepfenAnleitung('0');
    console.log('PROBE link-anleitung', JSON.stringify(a2).slice(0, 300));
    const a3 = await S2.verknuepfenAntwort('0', 'kein code');
    console.log('PROBE link ohne code', JSON.stringify(a3).slice(0, 200));
    const a4 = await S2.verknuepfenAntwort('0', '0123456789abcdef0123456789abcdef');
    console.log('PROBE link falscher code', JSON.stringify(a4).slice(0, 200));
    const a5 = await S2.trennenAntwort('0');
    console.log('PROBE unlink ohne link', JSON.stringify(a5).slice(0, 200));
  } catch (e) { console.log('PROBE link Fehler', String(e).slice(0, 200)); }
  process.exit(0);
})().catch((e) => { console.error('PROBE Fehler', e); process.exit(1); });
