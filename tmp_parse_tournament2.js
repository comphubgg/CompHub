const fetch = globalThis.fetch;
(async () => {
  const url = 'https://nobleprac.com/tournaments/S41-FNCS';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const scriptMatch = html.match(/<script\s+defer\s+src=["']([^"']+)["']/i);
  if (!scriptMatch) return console.error('no script found');
  const jsUrl = new URL(scriptMatch[1], url).toString();
  console.error('jsUrl', jsUrl);
  const js = await (await fetch(jsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  const terms = ['"/api', "'/api", 'https://', 'fetch(', 'axios(', 'new URL(', '.json', 'window.__', 'initialState', 'props', 'data', 'teams', 'entries', 'players', 'tournament'];
  for (const term of terms) {
    let idx = -1;
    while ((idx = js.indexOf(term, idx + 1)) !== -1) {
      const start = Math.max(0, idx - 120);
      const snippet = js.slice(start, Math.min(js.length, idx + 260));
      console.log('TERM', term, 'idx', idx, snippet.replace(/\n/g, '\\n').slice(0, 260));
      if (term === 'https://' && idx > 0) break;
      if (term === '"/api' && idx > 0) break;
      if (term === "'/api" && idx > 0) break;
      if (term === 'window.__' && idx > 0) break;
      if (term === 'data' && idx > 5000000) break;
      if (term === 'players' && idx > 0) break;
      if (term === 'teams' && idx > 0) break;
      if (term === 'entries' && idx > 0) break;
      if (term === 'tournament' && idx > 0) break;
      if (term === '.json' && idx > 0) break;
    }
  }
})();
