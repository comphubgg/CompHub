/*
 * X-Handles aus den eigenen Posts von @CompHub_gg ernten (Betreiber, 15.11.2026).
 * Die Zuordnung Handle -> Spieler macht lib/xHandles.mjs; hier werden die Beitraege gesammelt:
 *   - alle Beitrags-Links in #social-posts und #admin-posts (mit --alle-kanaele: in jedem Kanal des Servers),
 *   - mit --entdecken dazu das Wayback-Archiv (web.archive.org, Schnappschuesse von twitter.com/CompHub_gg/status/...), Suchmaschinen, Syndication,
 *   - mit --ids weitere Nummern von Hand, und Zitate/Antworten eigener Beitraege (Fadenkette).
 * Jeder Beitrag kommt ueber FixTweet (api.fxtwitter.com, wie scripts/discord-tweets.mjs), samt raw_text.facets (Erwaehnungen mit X-Id).
 *
 *   node scripts/x-handles.mjs --sammeln --entdecken --konten > tweets.json     nur sammeln
 *   ... --abgleich                                                              zuordnen und zeigen, was ins Profil ginge
 *   ... --abgleich --anwenden                                                   und eintragen (nur leere Felder)
 *   ... --ohne-discord --ids 2122083157608444171 --abgleich                     einzelne Beitraege
 * Laeuft in .github/workflows/x-handles.yml (der Sandkasten erreicht x.com und FixTweet nicht). Neue Posts erntet scripts/discord-tweets.mjs von selbst.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { ernte, erwaehnt, xKonten } from '../lib/xHandles.mjs';

const PROJEKT = path.resolve(import.meta.dirname, '..');
const API = 'https://discord.com/api/v10';
function umgebung() {
  const raus = {};
  try {
    for (const z of fs.readFileSync(path.join(PROJEKT, '.env.local'), 'utf8').split('\n')) {
      const m = z.match(/^([A-Z_]+)=(.*)$/); if (m) raus[m[1]] = m[2].trim().replace(/^"|"$/g, '');
    }
  } catch { /* keine Datei */ }
  return { ...raus, ...process.env };
}
const U = umgebung();
const TOKEN = (U.DISCORD_BOT_TOKEN || '').trim();
const SERVER = U.DISCORD_SERVER_ID || '1529205620287344783';
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function ruf(weg) {
  for (let versuch = 0; versuch < 6; versuch += 1) {
    const r = await fetch(`${API}${weg}`, { headers: { Authorization: `Bot ${TOKEN}` } });
    if (r.status === 429) { const j = await r.json().catch(() => ({})); await warte(Math.ceil((j.retry_after ?? 2) * 1000) + 250); continue; }
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`GET ${weg}: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
    return j;
  }
  throw new Error(`GET ${weg}: zu oft gedrosselt`);
}

export async function beitrag(id) {
  for (const weg of [`https://api.fxtwitter.com/i/status/${id}`, `https://api.fxtwitter.com/status/${id}`]) {
    for (let versuch = 0; versuch < 3; versuch += 1) {
      try {
        const r = await fetch(weg, { headers: { 'User-Agent': 'CompHub/1.0' }, signal: AbortSignal.timeout(20_000) });
        if (r.status === 404) break;
        if (r.ok) { const j = await r.json(); if (j?.tweet) return j.tweet; }
      } catch { /* noch einmal */ }
      await warte(800 * (versuch + 1));
    }
  }
  return null;
}

const kern = (s) => String(s ?? '').toLowerCase().replace(/^[^a-z0-9]+/, '').trim();

/** Alle Nachrichten eines Kanals, rueckwaerts bis zum Anfang. */
async function alle(kanal) {
  const raus = [];
  let vor = '';
  for (;;) {
    const seite = await ruf(`/channels/${kanal}/messages?limit=100${vor ? `&before=${vor}` : ''}`);
    if (!seite.length) break;
    raus.push(...seite);
    vor = seite[seite.length - 1].id;
    if (seite.length < 100) break;
  }
  return raus;
}

if (process.argv.includes('--sammeln')) {
  const kanaele = process.argv.includes('--ohne-discord') ? [] : await ruf(`/guilds/${SERVER}/channels`);
  const ids = new Map();
  const quellen = {};
  const ALLE = process.argv.includes('--alle-kanaele');
  const ziel = ALLE ? kanaele.filter((c) => c.type === 0 || c.type === 5) : ['social-posts', 'admin-posts'].map((name) => kanaele.find((c) => (c.type === 0 || c.type === 5) && kern(c.name) === name)).filter(Boolean);
  for (const k of ziel) {
    const name = kern(k.name);
    let n = [];
    try { n = await alle(k.id); } catch (e) { console.error(`#${name}: ${e.message.slice(0, 80)}`); continue; }
    quellen[name] = n.length;
    if (name === 'admin-posts' && process.argv.includes('--zeigen')) {
      for (const m of n) console.error(`  [${m.timestamp?.slice(0, 16)}] ${m.author?.username}${m.author?.bot ? '(bot)' : ''}: ${String(m.content ?? '').replace(/\s+/g, ' ').slice(0, 160)} | embeds ${(m.embeds ?? []).map((e) => e.url ?? e.type).join(' ')} | att ${(m.attachments ?? []).map((a) => a.filename).join(' ')}`);
    }
    for (const m of n) {
      const texte = [m.content ?? '', ...(m.embeds ?? []).flatMap((e) => [e.url ?? '', e.description ?? ''])];
      for (const t of texte) {
        for (const a of String(t).matchAll(/(?:twitter|x|fxtwitter|vxtwitter|fixupx|fixvx)\.com\/([A-Za-z0-9_]+)\/status(?:es)?\/(\d{5,25})/gi)) {
          if (!ids.has(a[2])) ids.set(a[2], { konto: a[1], kanal: name });
        }
      }
    }
  }
  console.error(`Nachrichten: ${JSON.stringify(quellen)} · Beitraege: ${ids.size}`);
  // Weitere Nummern von Hand (--ids 1,2,3) und aus oeffentlichen Verzeichnissen (Wayback-Archiv, Suchmaschinen, Syndication).
  const ii = process.argv.indexOf('--ids');
  for (const n of String(ii >= 0 ? process.argv[ii + 1] : U.IDS ?? '').split(/[\s,]+/).filter((x) => /^\d{5,25}$/.test(x))) if (!ids.has(n)) ids.set(n, { konto: 'CompHub_gg', kanal: 'hand' });
  if (process.argv.includes('--entdecken')) {
    const H = 'CompHub_gg';
    const wege = [
      ...['x.com', 'twitter.com', 'mobile.twitter.com', 'mobile.x.com', 'www.x.com', 'www.twitter.com'].map((d) => `https://web.archive.org/cdx/search/cdx?url=${d}/${H}/status/*&output=txt&fl=original&collapse=urlkey&limit=20000`),
      ...['x.com', 'twitter.com'].map((d) => `https://web.archive.org/cdx/search/cdx?url=${d}/${H}/status/&matchType=prefix&output=txt&fl=original&collapse=urlkey&limit=20000`),
      ...['x.com', 'twitter.com'].map((d) => `https://web.archive.org/cdx/search/cdx?url=${d}/${H}&matchType=prefix&output=txt&fl=original&collapse=urlkey&limit=20000&from=2026`),
      `https://web.archive.org/web/timemap/link/https://x.com/${H}`,
      `https://syndication.twitter.com/srv/timeline-profile/screen-name/${H}`,
      `https://syndication.twitter.com/srv/timeline-profile/screen-name/${H}?showReplies=true`,
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`"${H}/status"`)}`,
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:x.com/${H}/status`)}`,
      `https://www.bing.com/search?q=${encodeURIComponent(`site:x.com/${H}/status`)}&count=50`,
      `https://www.bing.com/search?q=${encodeURIComponent(`"x.com/${H}/status"`)}&count=50`,
      `https://xcancel.com/${H}/rss`, `https://nitter.privacydev.net/${H}/rss`, `https://nitter.poast.org/${H}/rss`,
      `https://api.fxtwitter.com/2/profile/${H}/statuses`, `https://api.fxtwitter.com/2/profile/${H}`,
    ];
    for (const w of wege) {
      let text = ''; let code = 0;
      for (let v = 0; v < 3 && !text; v += 1) {
        try { const r = await fetch(w, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' }, signal: AbortSignal.timeout(60_000) }); code = r.status; if (r.ok) text = await r.text(); } catch (e) { code = String(e.message).slice(0, 40); }
        if (!text) await warte(3000 * (v + 1));
      }
      let neu = 0;
      for (const a of text.matchAll(/(?:twitter|x)\.com(?:%2F|\/)CompHub_gg(?:%2F|\/)status(?:es)?(?:%2F|\/)(\d{15,25})/gi)) if (!ids.has(a[1])) { ids.set(a[1], { konto: H, kanal: new URL(w).hostname }); neu += 1; }
      for (const a of text.matchAll(/"(?:id_str|conversation_id_str)":"(\d{15,25})"/g)) if (!ids.has(a[1])) { ids.set(a[1], { konto: H, kanal: new URL(w).hostname }); neu += 1; }
      console.error(`  ${code} ${text.length} B, ${neu} neu: ${w.slice(0, 110)}`);
    }
  }
  const tweets = [];
  const fertig = new Set();
  const offen = () => [...ids].filter(([id]) => !fertig.has(id)).sort((a, b) => (BigInt(a[0]) < BigInt(b[0]) ? -1 : 1));
  for (let runde = offen(); runde.length; runde = offen()) for (const [id, q] of runde) {
    fertig.add(id);
    const tw = await beitrag(id);
    // Zitate und Antworten eigener Beitraege mitnehmen (Fadenkette).
    for (const n of [tw?.quote?.author?.screen_name === 'CompHub_gg' ? tw.quote.id : null, tw?.replying_to === 'CompHub_gg' ? tw.replying_to_status : null]) if (n && !ids.has(String(n))) ids.set(String(n), { konto: 'CompHub_gg', kanal: `kette:${id}` });
    if (!tw) { console.error(`  x ${id} (${q.konto}): FixTweet lieferte nichts`); tweets.push({ id, ...q, fehlt: true }); continue; }
    tweets.push({
      id, ...q, autor: tw.author?.screen_name, zeit: tw.created_at, text: tw.text,
      raw: tw.raw_text ?? null, zitat: tw.quote ? { id: tw.quote.id, autor: tw.quote.author?.screen_name, text: tw.quote.text } : null,
      antwortAuf: tw.replying_to ?? null, antwortAufId: tw.replying_to_status ?? null,
    });
    await warte(300);
  }
  // Was FixTweet beim ersten Mal nicht lieferte, noch einmal (AGENTS.md: ein Fehlschlag ist kein Beweis).
  for (const t of tweets.filter((x) => x.fehlt)) {
    await warte(2000);
    const tw = await beitrag(t.id);
    if (tw) Object.assign(t, { fehlt: false, autor: tw.author?.screen_name, zeit: tw.created_at, text: tw.text, raw: tw.raw_text ?? null });
  }
  const da = tweets.filter((t) => !t.fehlt);
  console.error(`Beitraege gelesen: ${da.length} von ${tweets.length} (eigene: ${da.filter((t) => t.autor === 'CompHub_gg').length}), fehlen: ${tweets.filter((t) => t.fehlt).map((t) => t.id).join(' ') || '-'}`);
  // Die X-Konten hinter den Erwaehnungen (Anzeigename) - fuer den Abgleich mit den Epic-Namen.
  const konten = process.argv.includes('--konten') || process.argv.includes('--abgleich') ? await xKonten(da.flatMap(erwaehnt)) : {};
  console.error(`Konten: ${Object.values(konten).filter((k) => k.name).length} von ${new Set(da.flatMap(erwaehnt)).size} mit Anzeigename`);
  let bericht = null;
  if (process.argv.includes('--abgleich')) {
    const e = await ernte(U, da, { anwenden: process.argv.includes('--anwenden'), konten, log: (z) => console.error(z) });
    const nm = (id) => e.d.pro[id]?.haupt || e.d.epic[id] || id;
    console.error(`\nZugeordnet (${e.fest.length}):`);
    for (const f of e.fest) console.error(`  @${f.handle} -> ${nm(f.id)} (${f.id}) · ${f.belege.length} Post(s): ${[...new Set(f.belege.map((b) => b.grund))].join('; ')}`);
    console.error(`\n${e.angewendet ? 'Geschrieben' : 'Wuerde schreiben'} (${e.geschrieben.length}):`);
    for (const g of e.geschrieben) console.error(`  ${g.name} (${g.id}) -> @${g.handle}`);
    console.error(`\nUebersprungen (${e.uebersprungen.length}):`);
    for (const g of e.uebersprungen) console.error(`  @${g.handle} -> ${nm(g.id)}: ${g.grund}`);
    const offen = new Map();
    for (const x of e.unklar) { const k = x.handle.toLowerCase(); if (!e.fest.some((f) => f.handle.toLowerCase() === k)) offen.set(k, x); }
    console.error(`\nUnklar (${offen.size} Handles):`);
    for (const x of offen.values()) console.error(`  @${x.handle}: ${x.grund}${x.kandidaten?.length ? ` [${x.kandidaten.slice(0, 4).map(nm).join(', ')}]` : ''}${x.zeile ? ` | ${x.zeile.slice(0, 80)}` : ''}`);
    bericht = { fest: e.fest.map((f) => ({ handle: f.handle, id: f.id, name: nm(f.id), belege: f.belege })), geschrieben: e.geschrieben, uebersprungen: e.uebersprungen, unklar: [...offen.values()], angewendet: e.angewendet };
  }
  process.stdout.write(JSON.stringify({ quellen, tweets, konten, bericht }, null, 1));
}
