const fetch = globalThis.fetch;
(async () => {
  const url = 'https://nobleprac.com/tournaments/S41-FNCS';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const scriptMatch = html.match(/<script\s+defer\s+src=["']([^"']+)["']/i);
  if (!scriptMatch) return console.error('no script');
  const jsUrl = new URL(scriptMatch[1], url).toString();
  const js = await (await fetch(jsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  const terms = ['https://tournaments.nobleprac.com', 'REACT_APP_PROD_TOURNAMENT_SERVER_URL', 'REACT_APP_DEV_TOURNAMENT_SERVER_URL', 'window.__INITIAL_STATE__', 'window.__NEXT_DATA__'];
  for (const term of terms) {
    const idx = js.indexOf(term);
    console.error(term, idx);
    if (idx !== -1) {
      const start = Math.max(0, idx - 200);
      const snippet = js.slice(start, Math.min(js.length, idx + 400));
      console.log('SNIPPET', snippet.replace(/\n/g,'\\n'));
    }
  }
})();
