const fetch = globalThis.fetch;
const url = 'https://nobleprac.com/tournaments/S41-FNCS';
(async () => {
  const html = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  const scriptMatch = html.match(/<script\s+defer\s+src=['\"]([^'\"]+)['\"]/i);
  if (!scriptMatch) {
    console.error('no script tag found');
    return;
  }
  const jsUrl = new URL(scriptMatch[1], url).toString();
  console.error('jsUrl', jsUrl);
  const js = await (await fetch(jsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  const needle = 'tournaments.nobleprac.com';
  const index = js.indexOf(needle);
  if (index === -1) {
    console.error('domain not found');
    return;
  }
  const lines = js.split(/\n/);
  const contexts = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) {
      const start = Math.max(0, i - 3);
      const end = Math.min(lines.length - 1, i + 3);
      contexts.push(lines.slice(start, end + 1).join('\n'));
    }
  }
  console.log('found contexts:', contexts.length);
  contexts.forEach((ctx, idx) => {
    console.log('--- context', idx, '---');
    console.log(ctx);
  });
})();
