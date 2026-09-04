const fetch = globalThis.fetch;
(async () => {
  try {
    const url = 'https://nobleprac.com/tournaments/S41-FNCS';
    const html = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
    const scriptMatch = html.match(/<script\s+defer\s+src=['\"]([^'\"]+)['\"]/i);
    if (!scriptMatch) {
      console.error('no script tag found');
      return;
    }
    const jsUrl = new URL(scriptMatch[1], url).toString();
    console.error('jsUrl', jsUrl);
    const js = await (await fetch(jsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
    const regexes = [
      /https:\/\/tournaments\.nobleprac\.com[^"'\s\)\]]*/g,
      /https:\/\/map\.nobleprac\.com[^"'\s\)\]]*/g,
      /https:\/\/auth\.nobleprac\.com[^"'\s\)\]]*/g,
      /https:\/\/tickets\.nobleprac\.com[^"'\s\)\]]*/g,
      /fetch\s*\(\s*['\"]([^'\"]+)['\"]/g,
      /axios\s*\.get\s*\(\s*['\"]([^'\"]+)['\"]/g,
      /axios\s*\.post\s*\(\s*['\"]([^'\"]+)['\"]/g,
      /axios\s*\(\s*['\"]([^'\"]+)['\"]/g,
      /['\"]\/tournaments\/[^'\"]+['\"]/g,
      /['\"]\/api\/[^'\"]+['\"]/g,
    ];
    const found = new Map();
    for (const regex of regexes) {
      let m;
      while ((m = regex.exec(js))) {
        const value = m[1] || m[0];
        if (!found.has(value)) {
          found.set(value, []);
        }
        found.get(value).push({ regex: regex.toString(), index: m.index });
        if (found.size >= 200) break;
      }
    }
    console.error('found count', found.size);
    for (const [value, entries] of Array.from(found.entries()).slice(0, 80)) {
      console.log(value);
    }
    if (found.size === 0) console.error('nothing found');
  } catch (err) {
    console.error('error', err);
  }
})();
