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

const p = new URLSearchParams(); for (const s of treffer) p.append('id', s.user_id);
const nutzer = treffer.length ? (await (await fetch(`https://api.twitch.tv/helix/users?${p}`, { headers: H })).json()).data : [];
const bild = Object.fromEntries(nutzer.map((u) => [u.id, u.profile_image_url]));
const ORDNER = path.join('public', 'spielerbilder');
const fotos = fs.existsSync(ORDNER) ? fs.readdirSync(ORDNER) : [];
const daten = {
  stand: new Date().toISOString(),
  gesamt: streams.filter((s) => re.test(s.title) && EU.has(s.language)).length,
  zuschauer: streams.filter((s) => re.test(s.title) && EU.has(s.language)).reduce((a, s) => a + s.viewer_count, 0),
  streamer: treffer.map((s) => ({
    name: s.user_name, login: s.user_login, zuschauer: s.viewer_count, titel: s.title, sprache: s.language,
    vorschau: s.thumbnail_url.replace('{width}', '640').replace('{height}', '360'), avatar: bild[s.user_id] ?? null,
    foto: fotos.find((f) => f.replace(/\.(jpg|png)$/, '') === s.user_login.toLowerCase()) ?? null,
  })),
};
fs.writeFileSync(aus, `window.DATEN=${JSON.stringify(daten)};`);
console.log(JSON.stringify(daten, null, 1).slice(0, 4000));
