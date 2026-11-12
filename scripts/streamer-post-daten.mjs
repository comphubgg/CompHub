// Wer streamt gerade den Cup? Fortnite-Streams von Twitch, nach Titel gefiltert (Perf/Cup/Trio...), die meisten Zuschauer zuerst.
//   node scripts/streamer-post-daten.mjs <aus.js> [titel-regex]
import fs from 'node:fs';
import path from 'node:path';

const [aus, muster = 'perf|eval|cup|trio|pec|turnier|tourn'] = process.argv.slice(2);
const U = { ...process.env };
try {
  for (const z of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = z.match(/^([A-Z_]+)=(.*)$/); if (m && !U[m[1]]) U[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
} catch { /* ohne */ }
const tok = await fetch('https://id.twitch.tv/oauth2/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: U.TWITCH_CLIENT_ID || '', client_secret: U.TWITCH_CLIENT_SECRET || '', grant_type: 'client_credentials' }),
}).then((r) => r.json());
if (!tok.access_token) throw new Error('Twitch: kein Token');
const H = { 'Client-ID': U.TWITCH_CLIENT_ID, Authorization: `Bearer ${tok.access_token}` };

const EU = new Set(['de', 'en', 'fr', 'es', 'it', 'pl', 'nl', 'pt', 'tr', 'sv', 'da', 'no', 'fi', 'cs', 'ru', 'uk', 'el', 'hu', 'ro', 'other']);
const streams = [];
let nach = '';
for (let i = 0; i < 10; i++) {
  const r = await fetch(`https://api.twitch.tv/helix/streams?game_id=33214&first=100${nach ? `&after=${nach}` : ''}`, { headers: H });
  if (!r.ok) throw new Error(`Twitch: ${r.status}`);
  const j = await r.json();
  streams.push(...j.data);
  nach = j.pagination?.cursor; if (!nach) break;
}
const re = new RegExp(muster, 'i');
const zuschauen = /watch|react|cast|co-?stream|viewing/i;
let treffer = streams.filter((s) => re.test(s.title) && EU.has(s.language) && !zuschauen.test(s.title));

// Bekannte Pros bevorzugen: Twitch-Logins aus den Spielerprofilen.
let profile = {};
try { profile = await (await fetch('https://github.com/comphubgg/CompHub/releases/download/daten/spieler-profile.json')).json(); } catch { /* ohne */ }
const proLogin = new Map();
for (const [id, p] of Object.entries(profile?.profile ?? profile ?? {})) {
  const t = p?.twitch ?? p?.links?.twitch;
  if (t) proLogin.set(String(t).toLowerCase().replace(/^.*twitch\.tv\//, '').replace(/[/@]/g, ''), { id, ...p });
}
treffer = treffer.map((s) => ({ ...s, pro: proLogin.has(s.user_login.toLowerCase()) }))
  .sort((a, b) => b.viewer_count - a.viewer_count).slice(0, 6)
  .sort((a, b) => b.viewer_count - a.viewer_count);

// Feste Auswahl (STREAMER="a,b|b2,..."; mit | getrennte Schreibweisen): diese Kanaele, live oder nicht, in dieser Reihenfolge.
if (U.STREAMER) {
  const gruppen = U.STREAMER.split(',').map((g) => g.split('|').map((x) => x.trim().toLowerCase()).filter(Boolean));
  const q1 = new URLSearchParams(); for (const l of gruppen.flat()) q1.append('login', l);
  const da = (await (await fetch(`https://api.twitch.tv/helix/users?${q1}`, { headers: H })).json()).data ?? [];
  const wahl = gruppen.map((g) => g.map((l) => da.find((u) => u.login === l)).find(Boolean)).filter(Boolean);
  console.log('Gefunden:', wahl.map((u) => u.login).join(', '), '| fehlt:', gruppen.filter((g) => !g.some((l) => da.some((u) => u.login === l))).map((g) => g.join('/')).join(', '));
  const q2 = new URLSearchParams(); for (const u of wahl) q2.append('user_id', u.id);
  const live = wahl.length ? (await (await fetch(`https://api.twitch.tv/helix/streams?${q2}&first=100`, { headers: H })).json()).data ?? [] : [];
  treffer = wahl.map((u) => { const st = live.find((x) => x.user_id === u.id); return st ?? { user_id: u.id, user_name: u.display_name, user_login: u.login, viewer_count: null, title: '', language: '', thumbnail_url: '' }; });
}
const p = new URLSearchParams(); for (const s of treffer) p.append('id', s.user_id);
const nutzer = treffer.length ? (await (await fetch(`https://api.twitch.tv/helix/users?${p}`, { headers: H })).json()).data : [];
const bild = Object.fromEntries(nutzer.map((u) => [u.id, u.profile_image_url]));
const ORDNER = path.join('public', 'spielerbilder');
const fotos = fs.existsSync(ORDNER) ? fs.readdirSync(ORDNER) : [];
const kern = (l) => l.toLowerCase().replace(/^(fn|ftn|ttv)_?|_?(fn|ftn|ttv|tv|_fn)$/g, '').replace(/_/g, '');
const fotoVon = (l) => { for (const k of [l.toLowerCase(), kern(l)]) { const f = fotos.find((x) => x.replace(/\.(jpg|png)$/, '') === k); if (f) return f; } return null; };
// Vorschaubild pruefen: Twitch liefert bei frischem Stream einen Platzhalter oder ein schwarzes Bild (sehr klein).
const echteVorschau = async (u) => {
  try { const r = await fetch(u, { redirect: 'manual' }); if (!r.ok) return null; const b = await r.arrayBuffer(); return b.byteLength > 14000 ? u : null; } catch { return null; }
};
for (const s of treffer) s.echt = s.thumbnail_url && await echteVorschau(s.thumbnail_url.replace('{width}', '640').replace('{height}', '360'));
const daten = {
  stand: new Date().toISOString(),
  gesamt: streams.filter((s) => re.test(s.title) && EU.has(s.language)).length,
  zuschauer: streams.filter((s) => re.test(s.title) && EU.has(s.language)).reduce((a, s) => a + s.viewer_count, 0),
  streamer: treffer.map((s) => ({
    name: s.user_name, login: s.user_login, zuschauer: s.viewer_count, titel: s.title, sprache: s.language,
    vorschau: s.echt, avatar: bild[s.user_id] ?? null, foto: fotoVon(s.user_login),
  })),
};
fs.writeFileSync(aus, `window.DATEN=${JSON.stringify(daten)};`);
console.log(JSON.stringify(daten, null, 1).slice(0, 4000));
