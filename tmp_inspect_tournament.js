const fetch = globalThis.fetch;
const url = 'https://nobleprac.com/tournaments/S41-FNCS';
(async () => {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.error('status', res.status);
    const html = await res.text();
    const scriptRegex = /<script\s+defer\s+src=["']([^"']+)["']/i;
    const scriptMatch = html.match(scriptRegex);
    console.error('script', scriptMatch ? scriptMatch[1] : 'none');
    const dataRegexes = [
      /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/i,
      /window\['__INITIAL_STATE__'\]\s*=\s*(\{[\s\S]*?\});/i,
      /JSON\.parse\(\s*['\"](\{[\s\S]*?\})['\"]\s*\)/i,
      /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
      /<script[^>]*>\s*window\.[A-Za-z0-9_]+\s*=\s*\{/gi,
      /<script[^>]*>\s*window\.__data\s*=\s*\{/gi,
    ];
    for (const regex of dataRegexes) {
      const match = html.match(regex);
      if (match) {
        console.error('found data regex', regex.toString());
        console.error('data snippet', match[0].slice(0, 1000));
      }
    }

    if (!scriptMatch) return;
    const jsUrl = new URL(scriptMatch[1], url).toString();
    console.error('jsUrl', jsUrl);
    const jsRes = await fetch(jsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.error('js status', jsRes.status);
    const js = await jsRes.text();
    const candidates = [
      'window.__INITIAL_STATE__',
      'window.__data',
      'window.__preloadedState',
      'window.__NUXT__',
      'window.__NEXT_DATA__',
      'window.initialData',
      'window.__APP_DATA__',
      'window.__REDUX_STATE__',
      'fetch(',
      'axios',
      'json(',
      'tournament',
      'entries',
      'map',
      'team',
      'player',
    ];
    for (const term of candidates) {
      const idx = js.indexOf(term);
      if (idx !== -1) console.error(term, idx);
    }
    const snippet = js.slice(0, 100000);
    console.log(snippet);
  } catch (e) {
    console.error('error', e);
  }
})();
