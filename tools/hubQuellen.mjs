import fs from 'node:fs';
import path from 'node:path';

/*
 * Kleine Helfer des lokalen Hubs, die der Browser nicht selbst kann (Betreiber 27.11.2026: mehr News auch aeltere, Reddit ueber einen Proxy).
 * Laeuft als Vite-Plugin im Dev-Server (vite.config.ts) - alles unter /hub-quellen/...
 *
 *   /hub-quellen/news-archiv     Aeltere News: Epics oeffentlicher Blog-Feed (fortnite.com/news), Videos von Fortnites YouTube-Kanal (RSS) und
 *                                alle Spiel-News, die dieser Hub je gesehen hat (waechst von selbst, liegt in node_modules/.cache/comphub-hub).
 *   /hub-quellen/reddit?sub=..   Beitraege eines Subreddits (reddit.com/r/<sub>/hot.json) - serverseitig, weil Reddit Browser-Abfragen sperrt.
 *   /hub-quellen/status          Welche Quelle zuletzt geantwortet hat (zum Nachsehen, wenn etwas leer bleibt).
 *
 * Inselbilder, Spielerzahlen und Spieler-Stats kommen NICHT von hier, sondern von der Seite selbst (/api/fn-entdecken, /api/fn-inseln,
 * /api/fn-spieler ueber den /api-Proxy). Nichts aus der Ablage liegt im Repo (das Repo ist oeffentlich).
 */

const ABLAGE = path.resolve('node_modules/.cache/comphub-hub');
const UA = 'CompHubHub/1.0 (local preview; +https://www.thecomphub.com)';
const FN = process.env.HUB_FN_BASIS || 'https://www.fortnite.com';
const lesen = (n, start) => { try { return JSON.parse(fs.readFileSync(path.join(ABLAGE, n), 'utf8')); } catch { return start; } };
const schreiben = (n, w) => {
  try { fs.mkdirSync(ABLAGE, { recursive: true }); const z = path.join(ABLAGE, n); fs.writeFileSync(`${z}.tmp`, JSON.stringify(w)); fs.renameSync(`${z}.tmp`, z); } catch { /* Platte voll o. ae. - dann ohne Ablage */ }
};

/** Holt eine Adresse mit Zeitgrenze. Status 0 = keine Antwort. */
async function holen(url, { ms = 12_000, kopf = {} } = {}) {
  const ab = new AbortController(); const t = setTimeout(() => ab.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json, text/xml, */*', ...kopf }, redirect: 'follow', signal: ab.signal });
    return { status: r.status, text: r.ok ? await r.text() : '' };
  } catch { return { status: 0, text: '' }; } finally { clearTimeout(t); }
}

/* ---------------------------------------------------------------- News-Archiv */
const blogUmbau = (j) => (Array.isArray(j?.blogList) ? j.blogList : []).map((b) => ({
  id: `blog:${b.slug ?? b._id ?? b.title}`, quelle: 'blog', titel: String(b.title ?? b.gridTitle ?? b._title ?? '').trim(),
  text: String(b.shareDescription ?? b._metaTags?.match?.(/name="description" content="([^"]*)"/)?.[1] ?? b.short ?? '').trim(),
  bild: b.shareImage ?? b.trendingImage ?? b.image ?? null, zeit: Date.parse(b.date ?? '') || null,
  link: b.slug ? `https://www.fortnite.com/news/${b.slug}` : null,
})).filter((b) => b.titel);
async function blogLaden() {
  const alle = [];
  for (const basis of [`${FN}/api/blog/getPosts`, 'https://www.epicgames.com/fortnite/api/blog/getPosts']) {
    for (let versatz = 0; versatz < 160; versatz += 40) {
      const r = await holen(`${basis}?category=&postsPerPage=40&offset=${versatz}&locale=en-US&rootPageSlug=blog`);
      if (r.status !== 200) break;
      let l = []; try { l = blogUmbau(JSON.parse(r.text)); } catch { break; }
      alle.push(...l); if (l.length < 40) break;
    }
    if (alle.length) return { liste: alle, stand: 'ok' };
  }
  return { liste: [], stand: 'no answer' };
}
const text1 = (s, tag) => new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(s)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() ?? '';
async function videosLaden() {
  const r = await holen('https://www.youtube.com/feeds/videos.xml?channel_id=UClG8odDC8TS6Zpqk9CGVQiQ', { kopf: { Accept: 'application/atom+xml' } });
  if (r.status !== 200) return { liste: [], stand: 'no answer' };
  // Sicherung: nur uebernehmen, wenn der Kanal wirklich Fortnite heisst.
  if (!/fortnite/i.test(text1(r.text.split('<entry>')[0], 'title'))) return { liste: [], stand: 'unexpected channel' };
  const liste = r.text.split('<entry>').slice(1).map((e) => {
    const id = text1(e, 'yt:videoId');
    return { id: `video:${id}`, quelle: 'video', titel: text1(e, 'title'), text: text1(e, 'media:description').split('\n')[0].slice(0, 280), bild: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, zeit: Date.parse(text1(e, 'published')) || null, link: `https://www.youtube.com/watch?v=${id}` };
  }).filter((v) => v.titel && v.id.length > 8);
  return { liste, stand: 'ok' };
}
/** Spiel-News (fortnite-api.com) mit dem Tag merken, an dem dieser Hub sie zum ersten Mal sah - so entsteht ein eigenes Archiv. */
async function spielNewsMerken() {
  const gesehen = lesen('news-gesehen.json', {});
  const r = await holen('https://fortnite-api.com/v2/news');
  const aktuell = new Set();
  if (r.status === 200) {
    try {
      const d = JSON.parse(r.text).data ?? {};
      for (const [art, feed] of Object.entries(d)) for (const m of [...(feed?.motds ?? []), ...(feed?.messages ?? [])]) {
        if (m.hidden || !m.title) continue;
        const id = `spiel:${m.id ?? `${art}-${m.title}`}`; aktuell.add(id);
        if (!gesehen[id]) gesehen[id] = { id, quelle: 'spiel', art, titel: m.title, text: m.body ?? '', bild: m.image ?? m.tileImage ?? null, zeit: Date.now(), link: null };
      }
      schreiben('news-gesehen.json', gesehen);
    } catch { /* Antwort unlesbar - Archiv bleibt, wie es ist */ }
  }
  return { liste: Object.values(gesehen).filter((n) => !aktuell.has(n.id)), stand: r.status === 200 ? 'ok' : 'no answer' };
}
let archiv = null;
async function newsArchiv() {
  if (archiv && Date.now() - archiv.t < 30 * 60_000) return archiv.j;
  const [blog, videos, spiel] = await Promise.all([blogLaden(), videosLaden(), spielNewsMerken()]);
  const j = { stand: Date.now(), quellen: { blog: blog.stand, video: videos.stand, spiel: spiel.stand }, eintraege: [...blog.liste, ...videos.liste, ...spiel.liste].sort((a, b) => (b.zeit ?? 0) - (a.zeit ?? 0)) };
  // Fehlschlaege nur kurz merken, damit ein spaeterer Versuch wieder fragt
  archiv = { t: blog.stand === 'ok' || videos.stand === 'ok' ? Date.now() : Date.now() - 25 * 60_000, j };
  return j;
}

/* ---------------------------------------------------------------- Reddit */
const SUBS = ['FortniteCompetitive', 'FortNiteBR', 'FortniteLeaks', 'FortniteCreative', 'FortniteFashion', 'FortniteFestival', 'FortniteSavetheWorld'];
const redditCache = new Map();
async function reddit(sub) {
  const da = redditCache.get(sub);
  if (da && Date.now() - da.t < 3 * 60_000) return da.j;
  let j = { ok: false, grund: 'no answer', beitraege: [] };
  for (const host of ['https://www.reddit.com', 'https://old.reddit.com']) {
    const r = await holen(`${host}/r/${sub}/hot.json?limit=40&raw_json=1`);
    if (r.status !== 200) { j.grund = `reddit answered ${r.status || 'nothing'}`; continue; }
    try {
      const kinder = JSON.parse(r.text)?.data?.children ?? [];
      const beitraege = kinder.map((k) => k.data).filter((b) => b && !b.stickied && !b.over_18).map((b) => {
        const vorschau = b.preview?.images?.[0];
        const bild = vorschau?.resolutions?.filter((x) => x.width <= 960).at(-1)?.url ?? vorschau?.source?.url ?? (Object.values(b.media_metadata ?? {})[0]?.p?.at?.(-1)?.u) ?? (/^https?:\/\//.test(b.thumbnail ?? '') ? b.thumbnail : null);
        return { id: b.id, title: b.title, author: b.author, permalink: b.permalink, score: b.score, num_comments: b.num_comments, created_utc: b.created_utc, link_flair_text: b.link_flair_text ?? null, bild: bild ?? null, video: !!b.is_video, text: (b.selftext ?? '').slice(0, 260) };
      });
      j = { ok: true, beitraege }; break;
    } catch { j.grund = 'unreadable answer'; }
  }
  redditCache.set(sub, { t: j.ok ? Date.now() : Date.now() - 2 * 60_000, j });
  return j;
}

/* ---------------------------------------------------------------- Plugin */
const json = (res, j, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(j)); };

export default function hubQuellen() {
  return {
    name: 'comphub-hub-quellen',
    configureServer(server) {
      server.middlewares.use('/hub-quellen', async (req, res) => {
        try {
          const u = new URL(req.url ?? '/', 'http://x'); const q = u.searchParams;
          if (u.pathname === '/news-archiv') return json(res, await newsArchiv());
          if (u.pathname === '/reddit') {
            const sub = SUBS.find((s) => s.toLowerCase() === (q.get('sub') ?? '').toLowerCase());
            return sub ? json(res, await reddit(sub)) : json(res, { ok: false, grund: 'unknown subreddit', beitraege: [] }, 400);
          }
          if (u.pathname === '/status') return json(res, { news: archiv?.j?.quellen ?? null, reddit: Object.fromEntries([...redditCache].map(([k, v]) => [k, v.j.ok ? 'ok' : v.j.grund])) });
          json(res, { fehler: 'unknown' }, 404);
        } catch (e) { json(res, { fehler: String(e?.message ?? e) }, 500); }
      });
    },
  };
}
