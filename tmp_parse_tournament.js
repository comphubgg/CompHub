const fetch = globalThis.fetch;
const url = 'https://nobleprac.com/tournaments/S41-FNCS';
(async () => {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.error('status', res.status);
    const html = await res.text();
    console.error('html length', html.length);
    const scriptRegex = /<script\s+defer\s+src=["']([^"']+)["']/i;
    const scriptMatch = html.match(scriptRegex);
    console.error('script', scriptMatch ? scriptMatch[1] : 'none');
    const dataSnippets = ['window.__INITIAL_STATE__', 'window.__NEXT_DATA__', 'window.__PRELOADED_STATE__', 'window.__DATA__', 'window.__NUXT__', 'window.processed', '<script type="application/json"', 'var initial', 'const initial', 'document.getElementById', 'fetch(', 'axios(', 'GraphQL'];
    for (const term of dataSnippets) {
      const idx = html.indexOf(term);
      if (idx !== -1) {
        console.error('HTML contains', term, 'at', idx);
      }
    }

    const jsUrl = scriptMatch ? new URL(scriptMatch[1], url).toString() : null;
    if (!jsUrl) return;
    console.error('jsUrl', jsUrl);
    const jsRes = await fetch(jsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const js = await jsRes.text();
    console.error('js length', js.length);
    const searches = ['fetch(', 'axios(', 'new URL(', 'api/', 'graphql', 'window.__', 'initialState', 'payload', 'data:', 'entries', 'teams', 'players', 'tournament', 'map'];
    for (const term of searches) {
      const idx = js.indexOf(term);
      if (idx !== -1) {
        console.error(term, 'at', idx);
      }
    }
    const patterns = [/https?:\/\/[^"'\s)]+/g, /\{\s*"[A-Za-z0-9_]+"\s*:\s*\[/g, /\[\s*\{[^\}]+"id"/g, /\"players\"\s*:\s*\[/g];
    for (const pattern of patterns) {
      const m = js.match(pattern);
      if (m) console.error('pattern', pattern, 'found sample', m[0].slice(0, 200));
    }

    // search for URLs with route data
    const urlMatches = Array.from(js.matchAll(/https?:\/\/[^"'\s)]+/g)).slice(0, 50).map(m => m[0]);
    console.error('first urls', urlMatches.slice(0, 20));
  } catch (err) {
    console.error('error', err);
  }
})();
