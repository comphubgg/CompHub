/*
 * Eine nachgebaute Epic-Schnittstelle fuer den Sofort-Test (Datenstroeme, lib/liveFenster, lib/epicFreundeStatus) - nie im Betrieb.
 *
 *   node scripts/sofort-test/epic-attrappe.mjs [port=4700] [teams=250]
 *
 * HTTP:  /account/api/oauth/token, /account/api/public/account, /api/v1/events/Fortnite/download/:konto, /api/v1/leaderboards/Fortnite/:e/:w/:konto
 *        POST /__aendern?n=1   -> ein neues Match fuer n Teams (Punkte steigen, Plaetze wechseln); Antwort { zeit }
 *        POST /__setze?team=k&punkte=p -> Team k bekommt genau p Punkte und ein neues Match
 *        POST /__presence      -> { from, sessionId } als XMPP-Status an alle verbundenen Clients; Antwort { zeit }
 *        POST /__xmpp?modus=normal|stumm|haengen&trennen=1  -> Stoerungen fuer die Wache des XMPP-Dienstes
 *        GET  /__zaehler       -> Anfragen je Art
 * WS:    XMPP ueber WebSocket (RFC 7395) - gerade genug fuer @xmpp/client: SASL PLAIN, Bind, Session, Ping, Presence.
 */
import http from 'http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.argv[2] ?? 4700);
const TEAMS = Number(process.argv[3] ?? 250);
const EVENT = 'S99_TestCup_EU';
const WINDOW = 'S99_TestCup_Heat1_EU';
const jetzt = Date.now();
const zaehler = {};
const zaehle = (k) => { zaehler[k] = (zaehler[k] ?? 0) + 1; };

const hex = (n) => n.toString(16).padStart(32, '0');
const teams = Array.from({ length: TEAMS }, (_, i) => ({ id: hex(i + 1), punkte: TEAMS - i, spiele: [] }));
let aktualisiert = new Date().toISOString();
let matchNr = 0;

function setze(team, punkte) {
  matchNr += 1;
  const t = teams[team];
  t.punkte = punkte;
  t.spiele.push({ sessionId: hex(0xabc000 + matchNr), endTime: new Date().toISOString(), trackedStats: { PLACEMENT_STAT_INDEX: 1, TEAM_ELIMS_STAT_INDEX: 9, TIME_ALIVE_STAT: 1200 } });
  aktualisiert = new Date().toISOString();
}

function aendern(n) {
  matchNr += 1;
  const sid = hex(0xabc000 + matchNr);
  for (let k = 0; k < n; k++) {
    const t = teams[Math.floor(Math.random() * teams.length)];
    t.punkte += 50 + Math.floor(Math.random() * 50);
    t.spiele.push({ sessionId: sid, endTime: new Date().toISOString(), trackedStats: { PLACEMENT_STAT_INDEX: 1 + k, TEAM_ELIMS_STAT_INDEX: 3, TIME_ALIVE_STAT: 900 } });
  }
  aktualisiert = new Date().toISOString();
}

function seite(p) {
  const sortiert = [...teams].sort((a, b) => b.punkte - a.punkte);
  const proSeite = 100;
  return {
    page: p, totalPages: Math.ceil(sortiert.length / proSeite), updatedTime: aktualisiert,
    entries: sortiert.slice(p * proSeite, (p + 1) * proSeite).map((t, i) => ({
      rank: p * proSeite + i + 1, pointsEarned: t.punkte, teamId: t.id, teamAccountIds: [t.id], sessionHistory: t.spiele,
    })),
  };
}

const json = (res, d, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(d)); };
const koerper = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => r(b)); });

const sockets = new Set();
/** XMPP-Stoerungen fuer die Wache: 'normal' | 'stumm' (keine Antworten mehr, Verbindung bleibt offen) | 'haengen' (nach dem Oeffnen keine Antwort -> nie online). */
let xmppModus = 'normal';
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/account/api/oauth/token') { zaehle('token'); return json(res, { access_token: 'attrappe', account_id: hex(0), displayName: 'Attrappe', expires_in: 7200 }); }
  if (u.pathname === '/account/api/public/account') { zaehle('namen'); return json(res, u.searchParams.getAll('accountId').map((id) => ({ id, displayName: `Spieler_${id.slice(-4)}` }))); }
  if (u.pathname.startsWith('/api/v1/events/Fortnite/download/')) {
    zaehle('katalog');
    return json(res, { events: [{ eventId: EVENT, displayDataId: EVENT, eventWindows: [{ eventWindowId: WINDOW, beginTime: new Date(jetzt - 3_600_000).toISOString(), endTime: new Date(jetzt + 6 * 3_600_000).toISOString() }] }], templates: [], payoutTables: {} });
  }
  const m = /^\/api\/v1\/leaderboards\/Fortnite\/([^/]+)\/([^/]+)\//.exec(u.pathname);
  if (m) {
    zaehle('seite');
    if (decodeURIComponent(m[2]) !== WINDOW) return json(res, { errorCode: 'not_found', errorMessage: 'Event window not found' }, 404);
    return json(res, seite(Number(u.searchParams.get('page') ?? 0)));
  }
  if (u.pathname === '/__setze' && req.method === 'POST') { setze(Number(u.searchParams.get('team')), Number(u.searchParams.get('punkte'))); return json(res, { zeit: Date.now(), updated: aktualisiert }); }
  if (u.pathname === '/__aendern' && req.method === 'POST') { aendern(Number(u.searchParams.get('n') ?? 1)); return json(res, { zeit: Date.now(), updated: aktualisiert }); }
  if (u.pathname === '/__presence' && req.method === 'POST') {
    const d = JSON.parse((await koerper(req)) || '{}');
    const status = JSON.stringify({ Status: d.sessionId ? 'Battle Royale - 64 Left' : 'Lobby', bIsPlaying: !!d.sessionId, SessionId: d.sessionId ?? '', Properties: { FortGameplayStats_j: { playlist: 'Playlist_Test', numKills: 1 } } });
    const xml = `<presence xmlns="jabber:client" from="${d.from}@prod.ol.epicgames.com/V2:Fortnite:WIN::A" to="${hex(0)}@prod.ol.epicgames.com"><status>${status.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</status></presence>`;
    if (xmppModus === 'normal') for (const s of sockets) s.send(xml);
    return json(res, { zeit: Date.now(), an: sockets.size });
  }
  if (u.pathname === '/__xmpp' && req.method === 'POST') {
    const m = u.searchParams.get('modus');
    if (m) xmppModus = m;
    if (u.searchParams.get('trennen') === '1') for (const w of wss.clients) w.terminate();
    return json(res, { modus: xmppModus, verbindungen: wss.clients.size });
  }
  if (u.pathname === '/__zaehler') return json(res, { zaehler, sockets: sockets.size });
  json(res, { error: 'unbekannt ' + u.pathname }, 404);
});

const wss = new WebSocketServer({ server, handleProtocols: (p) => (p.has('xmpp') ? 'xmpp' : false) });
wss.on('connection', (ws) => {
  let authed = false;
  zaehle('xmpp-verbindung');
  ws.on('message', (raw) => {
    if (xmppModus !== 'normal') return;
    const t = raw.toString();
    const id = /\bid=["']([^"']+)["']/.exec(t)?.[1];
    if (t.startsWith('<open')) {
      ws.send(`<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" from="prod.ol.epicgames.com" id="s${Date.now()}" version="1.0" xml:lang="en"/>`);
      ws.send(authed
        ? '<stream:features xmlns:stream="http://etherx.jabber.org/streams"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"/><session xmlns="urn:ietf:params:xml:ns:xmpp-session"><optional/></session></stream:features>'
        : '<stream:features xmlns:stream="http://etherx.jabber.org/streams"><mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>PLAIN</mechanism></mechanisms></stream:features>');
    } else if (t.startsWith('<auth')) {
      authed = true; zaehle('xmpp-auth');
      ws.send('<success xmlns="urn:ietf:params:xml:ns:xmpp-sasl"/>');
    } else if (t.startsWith('<iq') && t.includes('xmpp-bind')) {
      ws.send(`<iq xmlns="jabber:client" type="result" id="${id}"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><jid>${hex(0)}@prod.ol.epicgames.com/V2:Fortnite:WIN::T</jid></bind></iq>`);
    } else if (t.startsWith('<iq')) {
      ws.send(`<iq xmlns="jabber:client" type="result" id="${id}"/>`);
    } else if (t.startsWith('<presence')) {
      sockets.add(ws); zaehle('xmpp-presence');
    } else if (t.startsWith('<close')) {
      ws.send('<close xmlns="urn:ietf:params:xml:ns:xmpp-framing"/>'); ws.close();
    }
  });
  ws.on('close', () => sockets.delete(ws));
});

server.listen(PORT, '127.0.0.1', () => console.log(`Epic-Attrappe auf ${PORT}, ${TEAMS} Teams, ${EVENT} / ${WINDOW}`));
