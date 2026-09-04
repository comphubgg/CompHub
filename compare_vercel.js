const fetch = global.fetch;
const urls = [
  'https://streamer-dashboard-one.vercel.app/tierlist',
  'https://streamer-dashboard-mpyg6rz9q-juanitofnr-8042s-projects.vercel.app/tierlist'
];
(async () => {
  for (const url of urls) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      const html = await res.text();
      const title = (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || 'n/a';
      const scripts = [...html.matchAll(/<script[^>]+src=\"([^\"]+)\"/g)].map(m => m[1]);
      const nextDataMatch = html.match(/<script id=\"__NEXT_DATA__\" type=\"application\/json\">([\s\S]*?)<\/script>/i);
      console.log('URL:', url);
      console.log('Status:', res.status);
      console.log('Title:', title);
      console.log('Script count:', scripts.length);
      console.log('First scripts:', scripts.slice(0, 10).join(', '));
      console.log('Has __NEXT_DATA__:', Boolean(nextDataMatch));
      if (nextDataMatch) {
        try {
          const data = JSON.parse(nextDataMatch[1]);
          console.log('Next page:', data.page || 'n/a', 'buildId:', data.buildId || 'n/a');
        } catch (e) {
          console.log('NextData parse failed:', e.message);
        }
      }
      console.log('---');
    } catch (e) {
      console.error('ERROR', url, e.message);
    }
  }
})();
