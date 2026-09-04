const fetch = globalThis.fetch;
(async () => {
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
  const urlRegex = /https?:\/\/[^"'\s)]+/g;
  const urls = new Set();
  let m;
  while ((m = urlRegex.exec(js))) {
    const candidate = m[0];
    if (candidate.includes('tournaments.nobleprac.com') || candidate.includes('map.nobleprac.com') || candidate.includes('auth.nobleprac.com')) {
      urls.add(candidate);
    }
  }
  console.error('found urls', Array.from(urls).slice(0, 50));
  for (const candidate of urls) {
    if (candidate.includes('tournaments.nobleprac.com')) {
      console.error('probing', candidate);
      try {
        const r = await fetch(candidate, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
        console.error('head', candidate, r.status);
      } catch (err) {
        console.error('head error', candidate, err.message || err);
      }
    }
  }
})();
