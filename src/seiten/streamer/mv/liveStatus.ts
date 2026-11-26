export function normalizeLiveStatusUsername(value: string): string {
  return (value || '').trim().toLowerCase();
}

export function detectTwitchLiveStatusFromHtml(html: string, username: string) {
  const normalizedUsername = normalizeLiveStatusUsername(username);
  const lowerHtml = (html || '').toLowerCase();

  // Prefer explicit title/OG-title markers that include the word "live" next to the username.
  // This avoids false positives coming from generic query params or preview image classes.
  let isLive = false;

  try {
    // Check <title>...</title>
    const titleMatch = lowerHtml.match(/<title>([^<]+)<\/title>/);
    if (titleMatch && titleMatch[1]) {
      const title = titleMatch[1].trim();
      if (title.includes(normalizedUsername) && title.includes('live')) {
        isLive = true;
      }
    }

    // Check meta property og:title or meta name="title"
    const ogTitleMatch = lowerHtml.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/) || lowerHtml.match(/<meta[^>]*name=["']title["'][^>]*content=["']([^"']+)["']/);
    if (!isLive && ogTitleMatch && ogTitleMatch[1]) {
      const ogTitle = ogTitleMatch[1].trim();
      if (ogTitle.toLowerCase().includes(normalizedUsername) && ogTitle.toLowerCase().includes('live')) {
        isLive = true;
      }
    }
  } catch (e) {
    // On any parsing error, fall back to conservative false
    isLive = false;
  }

  return { isLive, viewers: 0 };
}

export function shouldLoadLiveStatus({ isMounted, isGuest }: { isMounted: boolean; isGuest: boolean }) {
  return Boolean(isMounted);
}
