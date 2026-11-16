/*
 * X-, Twitch-Konten und Flaggen der wichtigen Spieler finden (Betreiber, 16.11.2026) - Logik in lib/socialsFinder.mjs, die Liste in /admin/flaggen.
 *
 * Nur oeffentliche Schnittstellen, keine Anmeldung:
 *   X       api.fxtwitter.com/<handle> (FixTweet, wie lib/xHandles.mjs) und, wo erreichbar, die letzten Posts des Kontos
 *   Twitch  gql.twitch.tv mit der oeffentlichen Web-Client-Id (Kanal, Beschreibung, Socials, Panels, zuletzt gespieltes Spiel); wenn das nicht geht,
 *           Helix mit TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET (nur Kanal und Beschreibung)
 * Hoeflich: hoechstens eine Anfrage je Sekunde und Host, bei 429 eine Minute Pause und dann immer laenger.
 *
 * Geschrieben wird ins Archiv (comphub-daten) ueber lib/ablage aendereJson - dieselbe sichere Schreibweise wie die Warteschlange der Admin-Seite
 * (frisch gelesen, mit dem Stand geschrieben, bei Konflikt neu daraufgesetzt):
 *   spieler-profile.json      nur stark belegte Werte, nur in LEERE Felder (lib/spielerProfil wendeAn), nie ueberschrieben
 *   socials-auto.json         jede automatische Eintragung mit Belegen - zum Pruefen und Zuruecknehmen in /admin/flaggen
 *   socials-vorschlaege.json  alles Schwaechere je Spieler, mit Belegen; angenommen/abgelehnt setzt die Admin-Seite
 *   socials-geprueft.json     wann welcher Spieler zuletzt abgesucht wurde (der Lauf setzt dort fort, wo er aufhoerte)
 *
 *   node scripts/socials-finden.mjs --plan [--minuten 300] [--tage 30] [--nur <epicId,...>]   suchen, nichts schreiben
 *   node scripts/socials-finden.mjs --anwenden ...                                          suchen und schreiben
 *   node scripts/socials-finden.mjs --probe 30                                              blind an Spielern mit bekanntem X/Twitch messen
 *   node scripts/socials-finden.mjs --endpunkte <handle> <twitch>                            die Schnittstellen einmal ansehen
 * Laeuft in .github/workflows/socials-finden.yml (der Sandkasten der Agenten erreicht x.com, FixTweet und Twitch nicht).
 *
 * Gemessen (16.11.2026, blind: X und Twitch der Probespieler ausgeblendet, auch in streamers.json und den Org-Kadern; --probe 30, drei getrennte
 * Stichproben aus den 138 Kernspielern mit bekanntem X):
 *   - Erste Regel (stark = auch Link X<->Twitch): X automatisch 12 von 14 richtig - @VicoTTV fuer "Vico", @Panzer_fn fuer "panzer" (Link + Name, kein
 *     Fortnite-Bezug). Dann Link + Fortnite + Name: 7 von 9 (@PeterbotFNR, @pablofnbr). Darum jetzt: automatisch nur mit Anker (Platz in einem Post,
 *     Mitspieler erwaehnt, unsere Daten, Link auf unseren gespeicherten Kanal) - in allen drei Stichproben 19 von 19 richtig, mit dem
 *     endgueltigen Code (Stichprobe 3, --versatz 1): X 7 von 7, Twitch 1 von 1 pruefbar, Flagge 20 von 20.
 *   - Flaggen-Quellen einzeln (Stichprobe 2, an den bekannten X/Twitch-Konten von Spielern mit gepflegtem Land): X-Ort (Flagge oder Landname) 8 von 8,
 *     Twitch-Beschreibung 2 von 2, Bio allein 20 von 23 (RS/DE statt RU) - die Bio zaehlt deshalb nur, wenn die Szene-Liste oder Epics Power Ranking
 *     dasselbe Land nennt.
 *   - Vorschlaege sind schwach (der erste Kandidat stimmt selten: X 1 von 20) - sie zeigen deshalb auch die anderen Kandidaten.
 *   - Kosten: im Lauf rund 24 Anfragen je Spieler (FixTweet und Twitch je hoechstens eine je Sekunde), rund 160 Spieler je Stunde - die rund 7.300
 *     offenen Kernspieler brauchen etwa zehn taegliche Laeufe, danach nur noch neue Spieler (alle 30 Tage erneut).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createJiti } from 'jiti';
import * as S from '../lib/socialsFinder.mjs';

const PROJEKT = path.resolve(import.meta.dirname, '..');
for (const z of (() => { try { return fs.readFileSync(path.join(PROJEKT, '.env.local'), 'utf8').split('\n'); } catch { return []; } })()) {
  const m = z.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}
// Nur die Namen (nie Werte): welche Schluessel der Lauf hat und welcher Speicher gilt.
console.error(`Umgebung: ${Object.keys(process.env).filter((k) => /TOKEN|ABLAGE|DATEN|TWITCH|GITHUB_REPO/.test(k)).sort().join(', ') || '-'}`);
const jiti = createJiti(import.meta.url, { alias: { '@': PROJEKT }, interopDefault: true });
const { liesJson, aendereJson } = await jiti.import(path.join(PROJEKT, 'lib/ablage.ts'));
const { PROFIL_DATEI, wendeAn } = await jiti.import(path.join(PROJEKT, 'lib/spielerProfil.ts'));
const { kernname, namensSchluessel } = await jiti.import(path.join(PROJEKT, 'lib/homoglyph.ts'));
const { landAusEingabe } = await jiti.import(path.join(PROJEKT, 'lib/laender.ts'));
const { regionVonLand } = await jiti.import(path.join(PROJEKT, 'lib/landRegion.ts'));
const { gitDatenAktiv } = await jiti.import(path.join(PROJEKT, 'lib/ablageGitDaten.ts'));

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const hat = (n) => process.argv.includes(n);
const ANWENDEN = hat('--anwenden');
const PROBE = Number(arg('--probe', 0));
const MINUTEN = Number(arg('--minuten', 300));
const TAGE = Number(arg('--tage', 30));
const NUR = String(arg('--nur', '') ?? '').split(',').map((x) => x.trim().toLowerCase()).filter((x) => /^[0-9a-f]{32}$/.test(x));
const X_JE_SPIELER = Number(arg('--x-je-spieler', 24));
const LAUF = `${new Date().toISOString().slice(0, 16)}Z`;
const ENDE = Date.now() + MINUTEN * 60e3;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error(...a);

/* ------------------------------------------------------------------ Hoeflich abrufen: eine Anfrage je Sekunde und Host */

const naechste = new Map();
const zaehler = { anfragen: 0, '429': 0, fehler: 0, jeHost: {} };
async function hole(url, init = {}, { versuche = 4 } = {}) {
  const host = new URL(url).host;
  for (let v = 0; v < versuche; v += 1) {
    const frei = naechste.get(host) ?? 0;
    if (frei > Date.now()) await warte(frei - Date.now());
    naechste.set(host, Date.now() + 1000);
    zaehler.anfragen += 1; zaehler.jeHost[host] = (zaehler.jeHost[host] ?? 0) + 1;
    try {
      const r = await fetch(url, { ...init, headers: { 'User-Agent': 'CompHub/1.0 (+https://thecomphub.com)', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) });
      if (r.status === 429) {
        zaehler['429'] += 1;
        const pause = Math.min(15 * 60e3, 60e3 * 2 ** v);
        log(`  429 von ${host} - ${pause / 1000} s Pause`);
        naechste.set(host, Date.now() + pause);
        continue;
      }
      if (r.status >= 500) { await warte(2000 * (v + 1)); continue; }
      return r;
    } catch { zaehler.fehler += 1; await warte(2000 * (v + 1)); }
  }
  return null;
}

/* ------------------------------------------------------------------ X ueber FixTweet */

const xCache = new Map();
/** { sn, name, bio, ort, web, folger, posts, geschuetzt } | { fehlt: true } | null (nicht erreichbar) */
async function xKonto(handle) {
  const h = handle.toLowerCase();
  if (xCache.has(h)) return xCache.get(h);
  const r = await hole(`https://api.fxtwitter.com/${encodeURIComponent(h)}`);
  let k = null;
  if (r?.status === 404) k = { fehlt: true };
  else if (r?.ok) {
    const u = (await r.json().catch(() => null))?.user;
    k = u ? {
      sn: u.screen_name, name: u.name ?? '', bio: u.description ?? '', ort: u.location ?? '',
      web: [u.website?.url, u.website?.display_url, ...(u.raw_description?.facets ?? []).map((f) => `${f.replacement ?? ''} ${f.display ?? ''} ${f.original ?? ''}`)].filter(Boolean).join(' '),
      xid: u.id ?? null,
      folger: u.followers ?? 0, posts: u.tweets ?? 0, geschuetzt: !!u.protected, seit: u.joined ?? null,
    } : { fehlt: true };
  }
  xCache.set(h, k);
  return k;
}

/*
 * Die letzten Posts eines Kontos. FixTweet bietet dafuer (Stand 11/2026) /2/profile/<handle>/statuses; ist das nicht erreichbar, bleibt es bei
 * Profil-Belegen (das steht dann in der Zusammenfassung unter "posts").
 */
const postsZaehler = { versucht: 0, ok: 0, leer: 0 };
const postsCache = new Map();
const alsPost = (t) => ({
  id: String(t.id ?? ''), zeit: t.created_timestamp ? t.created_timestamp * 1000 : new Date(t.created_at ?? 0).getTime(),
  text: t.raw_text?.text ?? t.text ?? '', autor: String(t.author?.screen_name ?? '').toLowerCase(),
  erwaehnt: (t.raw_text?.facets ?? []).filter((f) => f.type === 'mention').map((f) => String(f.original ?? '').toLowerCase()).filter(Boolean),
});
/**
 * Die letzten Posts eines Kontos. FixTweet: /2/profile/<handle>/statuses (liefert fuer manche Konten 404, Stand 16.11.2026), sonst /2/search?q=from:<handle>
 * (eigene Posts samt Antworten). Nur Posts, deren Autor das Konto ist.
 */
async function xPosts(sn) {
  const h = sn.toLowerCase();
  if (postsCache.has(h)) return postsCache.get(h);
  let posts = [];
  for (const w of [`https://api.fxtwitter.com/2/profile/${encodeURIComponent(sn)}/statuses`, `https://api.fxtwitter.com/2/search?q=${encodeURIComponent(`from:${sn}`)}`]) {
    postsZaehler.versucht += 1;
    const r = await hole(w, {}, { versuche: 2 });
    const j = r?.ok ? await r.json().catch(() => null) : null;
    posts = (j?.results ?? []).filter((t) => t?.type === 'status' || t?.id).map(alsPost).filter((t) => t.id && t.zeit && (!t.autor || t.autor === h));
    if (posts.length) break;
  }
  if (posts.length) postsZaehler.ok += 1; else postsZaehler.leer += 1;
  postsCache.set(h, posts);
  return posts;
}

/* ------------------------------------------------------------------ Twitch */

const GQL_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'; // die oeffentliche Client-Id der Twitch-Webseite (ohne Anmeldung)
let gqlGeht = true;
const twCache = new Map();
const twLinks = (u) => {
  const texte = [u.description ?? '', ...(u.channel?.socialMedias ?? []).map((s) => `${s.url ?? ''} ${s.title ?? ''}`),
    ...(u.panels ?? []).map((p) => `${p.linkURL ?? ''} ${p.description ?? ''} ${p.title ?? ''}`)].join(' ');
  return { links: [...new Set(S.xLinks(texte))], twitchLinks: S.twitchLinks(texte) };
};
async function gql(query, variables) {
  const r = await hole('https://gql.twitch.tv/gql', { method: 'POST', headers: { 'Client-Id': GQL_ID, 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ query, variables }) });
  if (!r?.ok) return null;
  const j = await r.json().catch(() => null);
  return j?.data ? j.data : null;
}
let helix = null;
async function helixToken() {
  if (helix !== null) return helix;
  const id = process.env.TWITCH_CLIENT_ID; const geheim = process.env.TWITCH_CLIENT_SECRET;
  helix = '';
  if (!id || !geheim) return helix;
  const r = await hole('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: id, client_secret: geheim, grant_type: 'client_credentials' }) });
  if (r?.ok) helix = (await r.json()).access_token ?? '';
  return helix;
}
/** Kanaele zu Logins: login -> { login, name, beschreibung, folger, spiel, links: [x-handles], twitchLinks } (nur die, die es gibt). */
async function twitchKanaele(logins) {
  const raus = {};
  const offen = [...new Set(logins.map((l) => l.toLowerCase()))].filter((l) => { if (twCache.has(l)) { if (twCache.get(l)) raus[l] = twCache.get(l); return false; } return true; });
  for (let i = 0; i < offen.length; i += 40) {
    const teil = offen.slice(i, i + 40);
    let gefunden = null;
    if (gqlGeht) {
      const d = await gql('query($l:[String!]){users(logins:$l){id login displayName description followers{totalCount} lastBroadcast{startedAt game{name}} channel{socialMedias{name title url}}}}', { l: teil });
      if (d?.users) gefunden = d.users.filter(Boolean);
      else { gqlGeht = false; log('  Twitch-GQL nicht erreichbar - weiter mit Helix'); }
    }
    if (!gefunden) {
      const t = await helixToken();
      if (!t) { for (const l of teil) twCache.set(l, null); continue; }
      const r = await hole(`https://api.twitch.tv/helix/users?${teil.map((l) => `login=${encodeURIComponent(l)}`).join('&')}`, { headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID, Authorization: `Bearer ${t}` } });
      gefunden = r?.ok ? ((await r.json()).data ?? []).map((u) => ({ login: u.login, displayName: u.display_name, description: u.description })) : [];
    }
    const da = new Set();
    for (const u of gefunden) {
      const l = String(u.login).toLowerCase();
      da.add(l);
      const k = { login: l, name: u.displayName ?? l, beschreibung: u.description ?? '', folger: u.followers?.totalCount ?? 0, spiel: u.lastBroadcast?.game?.name ?? '', zuletzt: u.lastBroadcast?.startedAt ?? null, ...twLinks(u) };
      twCache.set(l, k); raus[l] = k;
    }
    for (const l of teil) if (!da.has(l)) twCache.set(l, null);
  }
  return raus;
}
/** Panels eines Kanals (dort stehen oft die X-Links) - nur fuer Kanaele, die zum Namen passen. */
async function twitchPanels(k) {
  if (!gqlGeht || k.panels) return k;
  const d = await gql('query($l:String!){user(login:$l){panels{id type ... on DefaultPanel{title description linkURL}}}}', { l: k.login });
  k.panels = d?.user?.panels ?? [];
  const p = twLinks({ panels: k.panels });
  k.links = [...new Set([...k.links, ...p.links])];
  k.twitchLinks = [...new Set([...(k.twitchLinks ?? []), ...p.twitchLinks])];
  return k;
}

/* ------------------------------------------------------------------ Daten */

const kern = (w) => w[1] + w[2] + w[3] >= 2 || w[4] >= 3;
const leer = (v) => !String(v ?? '').trim();

/** Vom Release direkt (wie lib/xHandles.mjs) - falls die Ablage im Lauf nicht auf das Release zeigt. */
async function vomRelease(name) {
  const anhang = name.replace(/\//g, '__');
  for (const tag of ['daten-rangliste', 'daten-spieltage', 'daten']) {
    const r = await fetch(`https://github.com/comphubgg/CompHub/releases/download/${tag}/${encodeURIComponent(anhang)}`, { redirect: 'follow', signal: AbortSignal.timeout(120_000) }).catch(() => null);
    if (r?.ok) return r.json().catch(() => null);
  }
  return null;
}
const releaseJson = async (name, standard) => (await liesJson(name, null).catch(() => null)) ?? (await vomRelease(name)) ?? standard;

async function ladeDaten() {
  const [wichtig, profile, namen, streamers, orgs, lan, szene, pr] = await Promise.all([
    releaseJson('spieler-kreis/_wichtig.json', null), liesJson(PROFIL_DATEI, {}), releaseJson('spieler-namen.json', {}),
    liesJson('streamers.json', {}), liesJson('orgs.json', {}), liesJson('lan-konten.json', {}),
    releaseJson('szene-quelle/spielerliste.json', []), releaseJson('power-rankings/global.json', null),
  ]);
  // Laender, die die Szene-Liste / Epics Power Ranking nennen - sie bestaetigen eine Flagge aus der Bio, entscheiden aber nie allein.
  const bekanntLand = new Map();
  for (const x of pr?.spieler ?? []) { const id = String(x.id ?? '').replace(/-/g, '').toLowerCase(); const l = String(x.land ?? '').trim().toUpperCase(); if (id && /^[A-Z]{2}$/.test(l)) bekanntLand.set(id, { code: l, quelle: 'Epics Power Ranking' }); }
  for (const x of szene ?? []) { const id = String(x.ID ?? '').trim().toLowerCase(); const l = String(x.COUNTRY ?? '').trim().toUpperCase(); if (id && /^[A-Z]{2}$/.test(l)) bekanntLand.set(id, { code: l, quelle: 'die Szene-Liste' }); }
  if (!wichtig?.konten) throw new Error('spieler-kreis/_wichtig.json fehlt');
  // Schreiben nur ins GitHub-Archiv (DATEN_TOKEN, oder GITHUB_TOKEN mit COMPHUB_ABLAGE=github wie im Lauf) und nur, wenn die Profile lesbar waren.
  if (ANWENDEN && (!gitDatenAktiv() || !Object.keys(profile).length)) throw new Error('--anwenden braucht das GitHub-Archiv (DATEN_TOKEN oder GITHUB_TOKEN mit COMPHUB_ABLAGE=github) und eine lesbare spieler-profile.json - nichts geschrieben');
  log(`Daten: ${Object.keys(wichtig.konten).length} wichtige, ${Object.keys(profile).length} Profile, ${Object.keys(namen).length} Namen, ${Object.keys(orgs?.orgs ?? {}).length} Orgs, ${Object.keys(lan).length} LAN-Konten`);
  return { wichtig, profile, namen, streamers, orgs, lan, bekanntLand };
}

/** Je Konto-Id alles, was wir schon wissen: Profil (auch Turnierkonten und Alteintrag), Namen, Org. */
function sichten(d, { blind = new Set() } = {}) {
  const nachId = new Map();
  const nachName = new Map();
  for (const [k, p] of Object.entries(d.profile)) {
    const id = String(p.id || (/^[0-9a-f]{32}$/i.test(k) ? k : '')).toLowerCase();
    if (id) nachId.set(id, p); else nachName.set(k, p);
  }
  const lanJe = new Map();
  for (const [lanId, k] of Object.entries(d.lan ?? {})) { const e = String(k?.echt ?? '').toLowerCase(); if (e) (lanJe.get(e) ?? lanJe.set(e, []).get(e)).push(lanId.toLowerCase()); }
  const lanIds = new Set(Object.keys(d.lan ?? {}).map((x) => x.toLowerCase()));
  // Wer welches X-Konto / welchen Kanal schon hat (ohne die Blinden im Probelauf).
  const xHalter = new Map(); const twHalter = new Map(); const xVon = new Map();
  for (const [id, p] of nachId) {
    const echt = String(d.lan?.[id]?.echt ?? id).toLowerCase();
    if (blind.has(echt)) continue;
    if (p.x) { xHalter.set(p.x.toLowerCase(), echt); xVon.set(id, p.x.toLowerCase()); xVon.set(echt, p.x.toLowerCase()); }
    if (p.twitch) twHalter.set(p.twitch.toLowerCase(), echt);
  }
  // Org-Kader: Org je Spieler, und X/Twitch aus dem Kader als Daten-Beleg.
  const orgJe = new Map(); const xQuellen = new Map(); const paare = new Set();
  for (const o of Object.values(d.orgs?.orgs ?? {})) {
    for (const s of o.spieler ?? []) {
      const id = String(s.epicId ?? '').toLowerCase();
      if (!id) continue;
      (orgJe.get(id) ?? orgJe.set(id, []).get(id)).push({ name: o.name, x: o.x || null });
      if (s.x && !blind.has(id)) (xQuellen.get(s.x.toLowerCase()) ?? xQuellen.set(s.x.toLowerCase(), []).get(s.x.toLowerCase())).push({ id, text: `Kader von ${o.name}` });
    }
  }
  // Im Probelauf darf die Antwort nicht ueber unsere eigenen Listen hereinkommen: Paare mit dem X-Konto oder Kanal eines Blinden fallen weg.
  const blindWerte = new Set();
  for (const id of blind) for (const p of [nachId.get(id), ...(lanJe.get(id) ?? []).map((l) => nachId.get(l))]) { if (p?.x) blindWerte.add(p.x.toLowerCase()); if (p?.twitch) blindWerte.add(p.twitch.toLowerCase()); }
  for (const liste of Object.values(d.streamers?.streamers ?? {})) {
    for (const s of liste ?? []) {
      if (!s?.twitch || !s?.twitter || blindWerte.has(s.twitch.toLowerCase()) || blindWerte.has(s.twitter.toLowerCase())) continue;
      paare.add(`${s.twitch.toLowerCase()}|${s.twitter.toLowerCase()}`);
    }
  }
  return { nachId, nachName, lanJe, lanIds, xHalter, twHalter, xVon, orgJe, xQuellen, paare };
}

/** Was unter einem Konto schon gespeichert ist (Hauptkonto, Turnierkonten, Alteintrag unter dem Namen) - wie /api/admin/flaggen. */
function gespeichert(id, alleNamen, s) {
  const quellen = [s.nachId.get(id), ...(s.lanJe.get(id) ?? []).map((l) => s.nachId.get(l))];
  for (const n of alleNamen) { const p = s.nachName.get(namensSchluessel(n)); if (p) { quellen.push(p); break; } }
  const feld = (f) => quellen.map((p) => String(p?.[f] ?? '').trim()).find(Boolean) ?? '';
  return { land: feld('land').toUpperCase(), x: feld('x'), twitch: feld('twitch') };
}

const reihenCache = new Map();
async function reihen(id) {
  const vorne = id.slice(0, 2);
  if (!reihenCache.has(vorne)) reihenCache.set(vorne, await releaseJson(`spieler-kreis/${vorne}.json`, {}));
  return (reihenCache.get(vorne)?.[id] ?? []).map((r) => ({ datum: r.datum, platz: r.platz, punkte: r.punkte, titel: r.titel ?? r.event ?? '', mitspieler: r.mitspieler ?? [] }));
}

/* ------------------------------------------------------------------ Ein Spieler */

/**
 * Sucht X, Twitch und Flagge fuer einen Spieler. p: { id, name, namen, region, final, pr, hat: { x, twitch, land } }
 * Rueckgabe: { x, twitch, land } je { wert, stufe: 'auto'|'vorschlag', belege, andere? } oder null; dazu anfragen.
 */
async function finde(p, s, { abgelehnt = {} } = {}) {
  const start = zaehler.anfragen;
  const formen = [];
  for (const n of [p.name, ...p.namen]) for (const f of S.grundformen(n, kernname)) if (!formen.includes(f)) formen.push(f);
  const haupt = formen.slice(0, 4);
  const woerter = S.spielerWoerter(formen);
  const ctx = { id: p.id, formen, woerter, orgs: s.orgJe.get(p.id) ?? [], final: p.final, pr: p.pr, gespeichertTwitch: p.hat.twitch.toLowerCase() || null };
  const quellen = { xQuellen: s.xQuellen, paare: s.paare };
  const nein = (feld, w) => (abgelehnt[feld] ?? []).includes(String(w).toLowerCase());
  const raus = { x: null, twitch: null, land: null, notiz: [] };

  // 1. Twitch: der gespeicherte Kanal oder die Kandidaten, in einem Zug.
  const twLogins = p.hat.twitch ? [p.hat.twitch.toLowerCase()] : S.twitchKandidaten(haupt);
  const tw = await twitchKanaele(twLogins);
  for (const k of Object.values(tw)) {
    k.namePasst = S.namePasst(k.name, woerter) || S.namePasst(k.login, woerter);
    if (k.namePasst || k.login === ctx.gespeichertTwitch) await twitchPanels(k);
  }
  const fremdTw = (l) => { const h = s.twHalter.get(l); return h && h !== p.id; };

  // 2. X: das gespeicherte Konto (fuer Flagge/Twitch), sonst was Twitch verlinkt, dann die Muster.
  const xGeprueft = [];
  let xWahl = null;
  if (p.hat.x) {
    const k = await xKonto(p.hat.x);
    if (k && !k.fehlt) xWahl = { wert: k.sn, k, stufe: 'gespeichert', belege: [] };
  } else {
    const verlinkt = Object.values(tw).filter((k) => k.namePasst || k.login === ctx.gespeichertTwitch).flatMap((k) => k.links);
    const liste = [...new Set([...verlinkt, ...S.xKandidaten(haupt, X_JE_SPIELER)])];
    for (const h of liste) {
      if (Date.now() > ENDE && xGeprueft.length) break;
      const halter = s.xHalter.get(h);
      if (halter && halter !== p.id) { raus.notiz.push(`@${h} gehoert schon ${halter}`); continue; }
      const k = await xKonto(h);
      if (!k || k.fehlt) continue;
      // X verlinkt einen Twitch-Kanal, den wir noch nicht kennen: nachladen.
      const neu = S.twitchLinks(`${k.bio} ${k.web}`).filter((l) => !(l in tw) && !twCache.has(l));
      if (neu.length) for (const [l, kk] of Object.entries(await twitchKanaele(neu))) { kk.namePasst = S.namePasst(kk.name, woerter) || S.namePasst(l, woerter); tw[l] = kk; if (kk.namePasst) await twitchPanels(kk); }
      const belege = S.xBelege(k, tw, ctx, { daten: quellen });
      xGeprueft.push({ wert: k.sn, k, belege, stufe: S.stufe(belege) });
      // Fruehes Ende: ein Konto mit Link, Fortnite-Bezug und passendem Namen - weiter zu suchen kostet nur Anfragen.
      const arten = new Set(belege.map((b) => b.art));
      if ((arten.has('link') || arten.has('daten')) && arten.has('fn') && arten.has('name')) break;
    }
    // Posts nur fuer die plausiblen Kandidaten ohne starken Beleg (hoechstens drei).
    // Auch Kandidaten nur mit passendem Namen - ihr Anker kommt oft erst aus den Posts (Platz, Mitspieler).
    const plausibel = xGeprueft.filter((c) => c.stufe && !c.belege.some((b) => ['platz', 'partner', 'daten'].includes(b.art))).sort((a, b) => S.punkte(b.belege) - S.punkte(a.belege)).slice(0, 3);
    if (plausibel.length) {
      const r = await reihen(p.id);
      if (r.length) {
        for (const c of plausibel) {
          const posts = await xPosts(c.wert);
          const pb = S.postsPruefen(posts, r, s.xVon, c.wert);
          if (pb.length) { c.belege.push(...pb); c.stufe = S.stufe(c.belege); }
          if (posts.length) {
            const juengster = Math.max(...posts.map((x) => x.zeit));
            const letzter = Math.max(...r.map((x) => x.datum ?? 0));
            c.belege.push({ art: 'aktiv', text: `letzter Post ${new Date(juengster).toISOString().slice(0, 10)}, letztes Ergebnis ${letzter ? new Date(letzter).toISOString().slice(0, 10) : '-'}` });
          }
        }
      }
    }
    const kand = xGeprueft.filter((c) => c.stufe && !nein('x', c.wert)).sort((a, b) => S.punkte(b.belege) - S.punkte(a.belege));
    if (kand.length) {
      const [best, zweit] = kand;
      let stufe = best.stufe;
      // Zwei gleich gute Kandidaten: keiner wird automatisch genommen.
      if (stufe === 'auto' && zweit && (zweit.stufe === 'auto' || S.punkte(zweit.belege) >= S.punkte(best.belege))) {
        stufe = 'vorschlag'; best.belege.push({ art: 'widerspruch', text: `auch @${zweit.wert} passt` });
      }
      xWahl = { wert: best.k.sn, k: best.k, stufe, belege: best.belege, andere: kand.slice(1, 4).map((c) => ({ wert: c.k.sn, belege: c.belege })) };
      raus.x = { wert: xWahl.wert, stufe, belege: xWahl.belege, andere: xWahl.andere };
    }
  }

  // 3. Twitch waehlen (nur, wenn noch keiner gespeichert ist).
  if (!p.hat.twitch) {
    const kand = Object.values(tw).filter((k) => !fremdTw(k.login) && !nein('twitch', k.login)).map((k) => {
      const belege = S.twitchBelege(k, ctx, { xGewaehlt: xWahl?.wert ?? null, xProfil: xWahl?.k ?? null, daten: quellen });
      // Automatisch nur ueber das X-Konto: dessen Link zaehlt nur, wenn das X-Konto selbst fest ist (gespeichert oder auto).
      const stufe = S.stufeTwitch(belege, !!xWahl && (xWahl.stufe === 'auto' || xWahl.stufe === 'gespeichert'));
      return { wert: k.login, stufe, belege };
    }).filter((c) => c.stufe).sort((a, b) => S.punkte(b.belege) - S.punkte(a.belege));
    if (kand.length) {
      const [best, zweit] = kand;
      let stufe = best.stufe;
      if (stufe === 'auto' && zweit && zweit.stufe === 'auto') { stufe = 'vorschlag'; best.belege.push({ art: 'widerspruch', text: `auch ${zweit.wert} passt` }); }
      raus.twitch = { wert: best.wert, stufe, belege: best.belege, andere: kand.slice(1, 4).map((c) => ({ wert: c.wert, belege: c.belege })) };
    }
  }

  // 4. Flagge aus dem X-Konto - automatisch nur, wenn das X-Konto fest ist.
  const twFest = p.hat.twitch ? tw[p.hat.twitch.toLowerCase()] : raus.twitch?.stufe === 'auto' ? tw[raus.twitch.wert] : null;
  if (!p.hat.land && (xWahl?.k || twFest)) {
    const f = S.flaggeAus(xWahl?.k ?? null, p.region, { landAusEingabe, regionVonLand }, { twitch: twFest ?? null, bekannt: daten.bekanntLand.get(p.id) ?? null });
    if (f && !nein('land', f.code)) {
      // Die Quelle muss selbst fest sein: das X-Konto (gespeichert/auto) oder der Twitch-Kanal (gespeichert/auto).
      const xFest = !!xWahl && (xWahl.stufe === 'auto' || xWahl.stufe === 'gespeichert');
      const quelleFest = f.quellen.every((q) => (q.art === 'twitch' ? !!twFest : xFest));
      raus.land = { wert: f.code, stufe: f.stufe === 'auto' && quelleFest ? 'auto' : 'vorschlag', quellen: f.quellen, belege: [...f.belege, ...(quelleFest ? [] : [{ art: 'hinweis', text: xWahl ? `X-Konto @${xWahl.wert} ist selbst nur ein Vorschlag` : 'Quelle nur ein Vorschlag' }])] };
    }
  }
  raus.anfragen = zaehler.anfragen - start;
  raus.xGeprueft = xGeprueft.length;
  return raus;
}

/* ------------------------------------------------------------------ Liste der Spieler */

function spielerListe(d, s, { blind = new Set() } = {}) {
  const liste = [];
  for (const [id, w] of Object.entries(d.wichtig.konten)) {
    if (s.lanIds.has(id) || w[11] || !kern(w)) continue;
    const b = d.namen[id];
    const alle = [...new Set([w[9], b?.haupt ?? '', ...(b?.namen ?? [])].map((n) => String(n ?? '').trim()).filter(Boolean))];
    for (const l of s.lanJe.get(id) ?? []) { const n = s.nachId.get(l)?.name; if (n) alle.push(n); }
    const eigen = s.nachId.get(id);
    const name = eigen?.anzeige || alle[0] || '';
    if (!name) continue;
    const hat = blind.has(id) ? { land: gespeichert(id, alle, s).land, x: '', twitch: '' } : gespeichert(id, alle, s);
    liste.push({ id, name, namen: alle.filter((n) => n !== name).slice(0, 6), region: eigen?.region || w[8] || '', punkte: w[0], final: w[1], pr: w[10], hat, speicherName: alle[0] || name });
  }
  return liste.sort((a, b) => b.punkte - a.punkte);
}

/* ------------------------------------------------------------------ Schreiben */

async function eintragen(fertig) {
  // fertig: [{ p, feld, wert, belege }] - nur leere Felder, gegen den frischen Stand; zurueck, was wirklich eingetragen wurde.
  const eingetragen = [];
  await aendereJson(PROFIL_DATEI, {}, (profile) => {
    eingetragen.length = 0;
    const s = sichten({ profile, lan: daten.lan, orgs: {}, streamers: {} });
    for (const f of fertig) {
      const jetzt = gespeichert(f.p.id, [f.p.name, ...f.p.namen], s);
      if (!leer(jetzt[f.feld])) continue;
      if (f.feld === 'x') { const h = s.xHalter.get(f.wert.toLowerCase()); if (h && h !== f.p.id) continue; }
      if (f.feld === 'twitch') { const h = s.twHalter.get(f.wert.toLowerCase()); if (h && h !== f.p.id) continue; }
      wendeAn(profile, { id: f.p.id, name: f.p.speicherName, schluessel: f.p.id, felder: { [f.feld]: f.wert } });
      eingetragen.push(f);
      // Damit derselbe Lauf denselben Handle nicht einem zweiten Spieler gibt
      if (f.feld === 'x') s.xHalter.set(f.wert.toLowerCase(), f.p.id);
      if (f.feld === 'twitch') s.twHalter.set(f.wert.toLowerCase(), f.p.id);
    }
  });
  if (eingetragen.length) {
    await aendereJson('socials-auto.json', { eintraege: [] }, (a) => {
      a.eintraege ??= [];
      for (const f of eingetragen) {
        if (a.eintraege.some((e) => e.id === f.p.id && e.feld === f.feld && e.wert === f.wert)) continue;
        a.eintraege.push({ id: f.p.id, name: f.p.name, feld: f.feld, wert: f.wert, zeit: Date.now(), lauf: LAUF, belege: f.belege, status: 'offen' });
      }
    });
  }
  return eingetragen;
}

async function ablegen(ergebnisse, geprueft) {
  await aendereJson('socials-vorschlaege.json', { zeilen: {} }, (v) => {
    v.zeilen ??= {};
    for (const [id, e] of ergebnisse) {
      const z = v.zeilen[id] ?? { name: e.name, abgelehnt: {} };
      z.name = e.name; z.zeit = Date.now(); z.lauf = LAUF;
      for (const f of ['x', 'twitch', 'land']) {
        const r = e[f];
        if (r && r.stufe === 'vorschlag') z[f] = { wert: r.wert, belege: r.belege, andere: r.andere ?? [] };
        else if (z[f] && !(z[f].status)) delete z[f];
      }
      if (z.x || z.twitch || z.land || Object.keys(z.abgelehnt ?? {}).length) v.zeilen[id] = z; else delete v.zeilen[id];
    }
    v.stand = Date.now();
  });
  await aendereJson('socials-geprueft.json', {}, (g) => { for (const [id, t] of geprueft) g[id] = t; });
}

/* ------------------------------------------------------------------ Laeufe */

let daten = null;

async function endpunkte(xh, twl) {
  for (const [h, l] of [['Cringefn_', 'cringefn'], ['volkofn', 'volkofn'], ['scrollSZN', 'scrollszn']]) {
    const k = await xKonto(h); const t = await twitchKanaele([l]); if (t[l]) await twitchPanels(t[l]);
    console.log('paar', h, JSON.stringify({ web: k?.web, bio: k?.bio, ort: k?.ort, name: k?.name }), JSON.stringify({ ...t[l], panels: undefined }));
    for (const w of [`https://api.fxtwitter.com/2/profile/${k?.xid}/statuses`, `https://api.fxtwitter.com/2/profile/${h}/statuses?count=20`, `https://api.fxtwitter.com/2/profile/${h.toLowerCase()}/statuses`, `https://api.fxtwitter.com/2/timeline/${h}`, `https://api.fxtwitter.com/2/search?q=from%3A${h}`]) {
      const r = await hole(w, {}, { versuche: 1 }); const tx = r ? await r.text() : '';
      console.log('posts', w.replace(h, '<h>'), r?.status, tx.slice(0, 300));
    }
  }
  const r1 = await hole(`https://api.fxtwitter.com/${xh}`);
  const j1 = r1 ? await r1.json().catch(() => null) : null;
  console.log('fxtwitter profil', r1?.status, JSON.stringify(j1?.user ? Object.fromEntries(Object.entries(j1.user).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 80) : v])) : j1).slice(0, 1500));
  for (const w of [`https://api.fxtwitter.com/2/profile/${xh}/statuses`, `https://api.fxtwitter.com/2/profile/${xh}`]) {
    const r = await hole(w, {}, { versuche: 1 });
    const t = r ? await r.text() : '';
    console.log('fxtwitter', w.replace(xh, '<h>'), r?.status, t.slice(0, 600));
  }
  const g = await twitchKanaele([twl]);
  console.log('twitch gql', gqlGeht, JSON.stringify(g).slice(0, 800));
  if (g[twl]) console.log('panels', JSON.stringify((await twitchPanels(g[twl])).panels).slice(0, 600));
}

async function probe(n) {
  // Spieler mit bekanntem X (unter der Konto-Id), gestreut ueber die Wichtigkeit - blind gesucht.
  const voll = sichten(daten);
  const alle = spielerListe(daten, voll).filter((p) => p.hat.x && voll.nachId.get(p.id)?.x);
  const schritt = Math.max(1, Math.floor(alle.length / n));
  const versatz = Number(arg('--versatz', 0)) % schritt;
  log(`Probe: ${alle.length} Kernspieler mit bekanntem X, jeder ${schritt}. ab ${versatz}`);
  const auswahl = alle.filter((_, i) => i % schritt === versatz).slice(0, n);
  const blind = new Set(auswahl.map((p) => p.id));
  const s = sichten(daten, { blind });
  const liste = spielerListe(daten, s, { blind }).filter((p) => blind.has(p.id));
  const wahr = new Map(auswahl.map((p) => [p.id, p.hat]));
  const zeilen = [];
  for (const p of liste) {
    const e = await finde(p, s);
    const w = wahr.get(p.id);
    const z = { id: p.id, name: p.name, region: p.region, wahr: w, x: e.x && { wert: e.x.wert, stufe: e.x.stufe, belege: e.x.belege.map((b) => b.art).join('+') }, twitch: e.twitch && { wert: e.twitch.wert, stufe: e.twitch.stufe, belege: e.twitch.belege.map((b) => b.art).join('+') }, anfragen: e.anfragen };
    zeilen.push(z);
    const ok = (f) => (z[f] ? (z[f].wert.toLowerCase() === String(w[f] ?? '').toLowerCase() ? 'RICHTIG' : w[f] ? 'FALSCH' : 'unbekannt') : '-');
    log(`  ${p.name.padEnd(24)} X ${z.x ? `${z.x.stufe} @${z.x.wert} [${z.x.belege}] ${ok('x')}` : '-'} (wahr @${w.x}) · Twitch ${z.twitch ? `${z.twitch.stufe} ${z.twitch.wert} [${z.twitch.belege}] ${ok('twitch')}` : '-'} (wahr ${w.twitch || '-'}) · ${e.anfragen} Anfragen`);
  }
  // Flagge: an den bekannten X-Konten der Spieler mit gespeichertem Land
  const flagge = [];
  for (const p of alle.filter((q) => q.hat.land).slice(0, 80)) {
    const k = await xKonto(p.hat.x);
    const twl = (voll.nachId.get(p.id)?.twitch ?? '').toLowerCase();
    const t = twl ? (await twitchKanaele([twl]))[twl] ?? null : null;
    if ((!k || k.fehlt) && !t) continue;
    const f = S.flaggeAus(k && !k.fehlt ? k : null, p.region, { landAusEingabe, regionVonLand }, { twitch: t, bekannt: daten.bekanntLand.get(p.id) ?? null });
    if (f) flagge.push({ name: p.name, region: p.region, wahr: p.hat.land, wert: f.code, stufe: f.stufe, quellen: f.quellen, beleg: f.belege.map((b) => b.text).join(' | ') });
  }
  const jeQuelle = {};
  for (const f of flagge) for (const q of f.quellen) { const z = (jeQuelle[q.art] ??= { genannt: 0, richtig: 0, falsch: [] }); z.genannt += 1; if (q.code === f.wahr) z.richtig += 1; else z.falsch.push(`${f.name}: ${q.code} statt ${f.wahr}`); }
  const mass = (f) => {
    const r = {};
    for (const st of ['auto', 'vorschlag']) {
      const t = zeilen.filter((z) => z[f]?.stufe === st && zeilen.find((y) => y === z));
      const richtig = t.filter((z) => z[f].wert.toLowerCase() === String(z.wahr[f] ?? '').toLowerCase()).length;
      const pruefbar = t.filter((z) => z.wahr[f]).length;
      r[st] = { genannt: t.length, pruefbar, richtig, praezision: pruefbar ? +(richtig / pruefbar).toFixed(3) : null };
    }
    r.mitWahrheit = zeilen.filter((z) => z.wahr[f]).length;
    return r;
  };
  const fm = {};
  for (const st of ['auto', 'vorschlag']) { const t = flagge.filter((f) => f.stufe === st); fm[st] = { genannt: t.length, richtig: t.filter((f) => f.wert === f.wahr).length }; }
  return { probe: zeilen.length, x: mass('x'), twitch: mass('twitch'), flagge: fm, flaggeJeQuelle: jeQuelle, flaggeZeilen: flagge, zeilen };
}

async function lauf() {
  const s = sichten(daten);
  const [geprueftAlt, vorschlaege] = await Promise.all([liesJson('socials-geprueft.json', {}), liesJson('socials-vorschlaege.json', { zeilen: {} })]);
  let liste = spielerListe(daten, s).filter((p) => !p.hat.x || !p.hat.twitch || !p.hat.land);
  if (NUR.length) liste = liste.filter((p) => NUR.includes(p.id));
  else liste = liste.filter((p) => (geprueftAlt[p.id]?.zeit ?? 0) < Date.now() - TAGE * 864e5);
  log(`${liste.length} Kernspieler offen (X, Twitch oder Flagge fehlt, nicht in den letzten ${TAGE} Tagen abgesucht). Budget ${MINUTEN} min.`);
  const summe = { spieler: 0, auto: { x: 0, twitch: 0, land: 0 }, vorschlag: { x: 0, twitch: 0, land: 0 }, eingetragen: { x: 0, twitch: 0, land: 0 }, beispiele: [] };
  let puffer = []; let ergebnisse = []; let geprueft = [];
  const leeren = async () => {
    if (ANWENDEN) {
      const ein = puffer.length ? await eintragen(puffer) : [];
      for (const f of ein) summe.eingetragen[f.feld] += 1;
      // Was nicht eingetragen werden konnte (inzwischen belegt), ist auch kein Vorschlag mehr.
      await ablegen(ergebnisse, geprueft);
    }
    puffer = []; ergebnisse = []; geprueft = [];
  };
  for (const p of liste) {
    if (Date.now() > ENDE) { log('Budget erreicht - der naechste Lauf setzt fort.'); break; }
    const e = await finde(p, s, { abgelehnt: vorschlaege.zeilen?.[p.id]?.abgelehnt ?? {} });
    summe.spieler += 1;
    for (const f of ['x', 'twitch', 'land']) {
      const r = e[f];
      if (!r) continue;
      summe[r.stufe][f] += 1;
      if (r.stufe === 'auto') {
        puffer.push({ p, feld: f, wert: r.wert, belege: r.belege });
        if (f === 'x') s.xHalter.set(r.wert.toLowerCase(), p.id);
        if (f === 'twitch') s.twHalter.set(r.wert.toLowerCase(), p.id);
      }
      if (summe.beispiele.length < 40) summe.beispiele.push({ name: p.name, feld: f, wert: r.wert, stufe: r.stufe, belege: r.belege.map((b) => b.text) });
    }
    ergebnisse.push([p.id, { name: p.name, ...e }]);
    geprueft.push([p.id, { zeit: Date.now(), x: e.x?.stufe ?? null, twitch: e.twitch?.stufe ?? null, land: e.land?.stufe ?? null, n: e.anfragen }]);
    log(`  ${summe.spieler}. ${p.name} - X ${e.x ? `${e.x.stufe} @${e.x.wert}` : '-'} · Twitch ${e.twitch ? `${e.twitch.stufe} ${e.twitch.wert}` : '-'} · Flagge ${e.land ? `${e.land.stufe} ${e.land.wert}` : '-'} (${e.anfragen} Anfragen)`);
    if (ergebnisse.length >= 25) await leeren();
  }
  await leeren();
  return summe;
}

daten = await ladeDaten();
let ergebnis;
if (hat('--endpunkte')) { await endpunkte(arg('--endpunkte', 'ninja'), process.argv[process.argv.indexOf('--endpunkte') + 2] || 'ninja'); ergebnis = {}; }
else if (PROBE) ergebnis = await probe(PROBE);
else ergebnis = await lauf();
console.log(JSON.stringify({ lauf: LAUF, anwenden: ANWENDEN, ...ergebnis, anfragen: zaehler, posts: postsZaehler, twitchGql: gqlGeht }, null, 1));
