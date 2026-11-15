// Test fuer /link-account (lib/discordEpicKonto + app/api/auth/epic/authorize + callback) - ohne Netz: Epic wird mit einer festen Antwort ersetzt.
//   node scripts/discord-link-test.cjs
// Prueft: Marke unterschreiben/pruefen (gueltig, veraendert, abgelaufen), authorize setzt den Discord-Weg nur mit gueltiger Marke, der Rueckweg speichert
// Discord-Id -> Epic-Id (verschluesselt, einmal), und der bisherige Weg "Verify with Epic Games" ohne Konto (Gast-Cookie) bleibt, wie er war.
const fs = require('fs');
const os = require('os');
const path = require('path');
const daten = fs.mkdtempSync(path.join(os.tmpdir(), 'comphub-link-'));
Object.assign(process.env, {
  COMPHUB_DATEN: daten, COMPHUB_KEIN_HINTERGRUND: '1', AUTH_COOKIE_SECRET: 'test-geheimnis', EPIC_CLIENT_ID: 'test-client', EPIC_CLIENT_SECRET: 'test-secret',
  NODE_ENV: 'test',
});
delete process.env.LINK_SECRET; delete process.env.DISCORD_BOT_TOKEN; delete process.env.DATEN_TOKEN; delete process.env.COMPHUB_ABLAGE;
const jiti = require('jiti')(__filename, { alias: { '@': path.join(__dirname, '..') }, interopDefault: true });

let fehler = 0;
const pruef = (name, ok, extra = '') => { console.log(`${ok ? 'OK  ' : 'FEHL'} ${name}${extra ? ` - ${extra}` : ''}`); if (!ok) fehler += 1; };

// Epic ersetzen: Token-Austausch und userInfo, wie Epic sie liefert (account_id ohne Striche, preferred_username).
const EPIC_ID = '8224fc7512ad42818f381e262e4a6a2b';
const echtesFetch = global.fetch;
const anfragen = [];
global.fetch = async (url, init) => {
  const u = String(url);
  anfragen.push(u);
  if (u === 'https://api.epicgames.dev/epic/oauth/v2/token') {
    const body = String(init?.body ?? '');
    if (!body.includes('code=gueltiger-code')) return new Response(JSON.stringify({ errorCode: 'invalid_grant' }), { status: 400 });
    return new Response(JSON.stringify({ access_token: 'tok', account_id: EPIC_ID, token_type: 'bearer' }), { status: 200 });
  }
  if (u === 'https://api.epicgames.dev/epic/oauth/v2/userInfo') return new Response(JSON.stringify({ sub: EPIC_ID, preferred_username: 'iL juanit0' }), { status: 200 });
  if (u.includes('/friends')) return new Response('[]', { status: 200 });
  if (u.startsWith('https://discord.com/')) return new Response('{}', { status: 200 });
  return echtesFetch ? new Response('{}', { status: 404 }) : null;
};

(async () => {
  const K = jiti('../lib/discordEpicKonto.ts');
  const { NextRequest } = jiti('next/server');
  const authorize = jiti('../app/api/auth/epic/authorize/route.ts');
  const callback = jiti('../app/api/auth/epic/callback/route.ts');
  const DISCORD = '123456789012345678';

  /* ---- Marke */
  const marke = K.verlinkeMarke(DISCORD);
  pruef('Marke wird erstellt', typeof marke === 'string' && marke.includes('.'));
  pruef('gueltige Marke wird gelesen', K.leseMarke(marke)?.discordId === DISCORD);
  const [inhalt, sig] = marke.split('.');
  const fremd = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(inhalt, 'base64url').toString()), d: '999999999999999999' })).toString('base64url');
  pruef('veraenderte Discord-Id wird abgelehnt', K.leseMarke(`${fremd}.${sig}`) === null);
  pruef('veraenderte Unterschrift wird abgelehnt', K.leseMarke(`${inhalt}.${sig.slice(0, -2)}AA`) === null);
  pruef('abgelaufene Marke wird abgelehnt (11 min)', K.leseMarke(K.verlinkeMarke(DISCORD, Date.now() - 11 * 60_000)) === null);
  pruef('Unsinn wird abgelehnt', K.leseMarke('abc') === null && K.leseMarke('') === null);
  pruef('keine Marke fuer eine ungueltige Discord-Id', K.verlinkeMarke('abc') === null);

  /* ---- authorize */
  const hin = async (q, cookie = '') => authorize.GET(new NextRequest(`https://www.thecomphub.com/api/auth/epic/authorize${q}`, { headers: cookie ? { cookie } : {} }));
  const a1 = await hin(`?discord=${encodeURIComponent(marke)}`);
  pruef('authorize mit Marke: weiter zu Epic', a1.status === 307 && /epicgames\.com\/id\/authorize/.test(a1.headers.get('location') ?? ''));
  pruef('authorize mit Marke: epic_oauth_art=discord', a1.cookies.get('epic_oauth_art')?.value === 'discord');
  pruef('authorize mit Marke: Marke im Cookie', a1.cookies.get('epic_discord')?.value === marke);
  const state1 = a1.cookies.get('epic_oauth_state')?.value;
  const a2 = await hin(`?discord=${encodeURIComponent(`${inhalt}.xx`)}`);
  pruef('authorize mit falscher Marke: normaler Weg (kein discord)', a2.cookies.get('epic_oauth_art')?.value === '' && !a2.cookies.get('epic_discord')?.value);
  const a3 = await hin('?zurueck=/events/s43_trios_cash');
  pruef('authorize ohne Marke: wie bisher (art geloescht, Rueckweg gesetzt)', a3.cookies.get('epic_oauth_art')?.value === '' && a3.cookies.get('epic_rueck')?.value === '/events/s43_trios_cash');

  /* ---- callback, Discord-Weg */
  const zurueck = async (code, state, cookies) => callback.GET(new NextRequest(`https://www.thecomphub.com/api/auth/epic/callback?code=${code}&state=${state}`,
    { headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ') } }));
  const c1 = await zurueck('gueltiger-code', state1, { epic_oauth_state: state1, epic_oauth_art: 'discord', epic_discord: marke });
  const html1 = await c1.text();
  pruef('callback Discord: Erfolgsseite', c1.status === 200 && /Epic account linked/.test(html1) && /iL juanit0/.test(html1), `HTTP ${c1.status}`);
  pruef('callback Discord: kein Gast-/Sitzungs-Cookie gesetzt', !c1.cookies.get('comphub_epic')?.value && !c1.cookies.get('streamer_dashboard_konto')?.value);
  const v = await K.verknuepfungVon(DISCORD);
  pruef('Zuordnung gespeichert: Discord -> Epic-Id von Epic', v?.epicId === EPIC_ID && v?.displayName === 'iL juanit0');
  const dateien = fs.readdirSync(path.join(daten, 'discord-epic-links'));
  const inhaltAlle = dateien.map((d) => fs.readFileSync(path.join(daten, 'discord-epic-links', d), 'utf8')).join('');
  pruef('Ablage ohne Klartext (keine Discord-/Epic-Id, kein Name)', !inhaltAlle.includes(DISCORD) && !inhaltAlle.includes(EPIC_ID) && !inhaltAlle.includes('juanit0')
    && !dateien.some((d) => d.includes(DISCORD) || d.includes(EPIC_ID)), dateien.join(','));
  const c2 = await zurueck('gueltiger-code', state1, { epic_oauth_state: state1, epic_oauth_art: 'discord', epic_discord: marke });
  pruef('dieselbe Marke ein zweites Mal: abgelehnt', c2.status === 400 && /already used/.test(await c2.text()));
  const alt = K.verlinkeMarke(DISCORD, Date.now() - 11 * 60_000);
  const c3 = await zurueck('gueltiger-code', state1, { epic_oauth_state: state1, epic_oauth_art: 'discord', epic_discord: alt });
  pruef('abgelaufene Marke im Rueckweg: abgelehnt', c3.status === 400 && /expired/.test(await c3.text()));
  const c4 = await zurueck('gueltiger-code', 'anderer-state', { epic_oauth_state: state1, epic_oauth_art: 'discord', epic_discord: K.verlinkeMarke(DISCORD) });
  pruef('falscher state: wie bisher abgelehnt (?epic=state)', c4.status === 307 && /epic=state/.test(c4.headers.get('location') ?? ''));

  /* ---- callback, bisheriger Weg "Verify with Epic Games" ohne Konto */
  const a4 = await hin('?zurueck=/events/s43_trios_cash');
  const s4 = a4.cookies.get('epic_oauth_state')?.value;
  const c5 = await zurueck('gueltiger-code', s4, { epic_oauth_state: s4, epic_rueck: '/events/s43_trios_cash' });
  pruef('Verify with Epic (ohne Konto): zurueck zur Cup-Seite mit ?epic=verbunden', c5.status === 307 && /\/events\/s43_trios_cash\?epic=verbunden/.test(c5.headers.get('location') ?? ''), c5.headers.get('location'));
  pruef('Verify with Epic (ohne Konto): Gast-Cookie gesetzt', !!c5.cookies.get('comphub_epic')?.value);
  const c6 = await zurueck('falscher-code', s4, { epic_oauth_state: s4 });
  pruef('Verify with Epic: abgelehnter Code -> ?epic=token', c6.status === 307 && /epic=token/.test(c6.headers.get('location') ?? ''));

  /* ---- unlink */
  const t = await K.trennen(DISCORD);
  pruef('unlink: geloescht', t.war && !(await K.verknuepfungVon(DISCORD)));
  const t2 = await K.trennen(DISCORD);
  pruef('unlink ohne Verknuepfung: nichts zu tun', t2.ok && !t2.war);

  fs.rmSync(daten, { recursive: true, force: true });
  console.log(fehler ? `${fehler} FEHLER` : 'Alle Pruefungen bestanden.');
  process.exit(fehler ? 1 : 0);
})().catch((e) => { console.error('Abbruch', e); process.exit(1); });
