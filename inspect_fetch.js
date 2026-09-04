const url = 'https://www.fortnite.com/competitive/power-rankings?region=EU&pageSize=100&page=1';

(async () => {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    console.log('status', res.status);
    const text = await res.text();
    console.log('length', text.length);
    console.log('first 4000 chars:');
    console.log(text.slice(0, 4000));

    const scriptUrls = Array.from(text.matchAll(/<script[^>]+src=["']([^"']+)/gi)).map(m => m[1]);
    console.log('script URLs:', scriptUrls.slice(0, 20));

    const markers = ['PR SCORE', 'power-rankings', 'name', 'points', 'score', 'rank', 'data', 'script'];
    for (const marker of markers) {
      const idx = text.toLowerCase().indexOf(marker.toLowerCase());
      if (idx !== -1) console.log(`${marker} found at ${idx}`);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
