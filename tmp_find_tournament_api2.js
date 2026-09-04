const fetch = globalThis.fetch;
(async () => {
  const url = 'https://nobleprac.com/tournaments/S41-FNCS';
  const html = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  const scriptMatch = html.match(/<script\s+defer\s+src=['\"]([^'\"]+)['\"]/i);
  if (!scriptMatch) {
    console.error('no script tag found');
    process.exit(1);
  }
  const jsUrl = new URL(scriptMatch[1], url).toString();
  console.error('jsUrl', jsUrl);
  const js = await (await fetch(jsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  const pattern = /tournaments\.nobleprac\.com["'\\)\]\s,;:\?\!\<\>\|]*/g;
  const matches = Array.from(js.matchAll(pattern)).map((m) => m[0]);
  console.error('matches count', matches.length);
  for (const match of [...new Set(matches)].slice(0, 100)) {
    console.log(match);
  }
  const routePattern = /["'](\/tournaments(?:\/[\w\-\.%]+)*(?:\?[\w\-\.%=&;]*)?)["']/g;
  let routeCount = 0;
  for (const m of js.matchAll(routePattern)) {
    routeCount++;
    if (routeCount <= 100) console.log('route', m[1]);
  }
  console.error('route count', routeCount);
})();
