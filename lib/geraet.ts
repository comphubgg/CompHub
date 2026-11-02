/*
 * Welches Geraet eine Sitzung hatte - grob (Betreiber, 2.11.2026: "pro Sitzung grob mitschreiben ... wie das Geraet heisst", um zu sehen,
 * ob ein VIP-Schluessel von seinem Inhaber oder von jemand anderem benutzt wird).
 *
 * Bewusst nur das Noetigste: Geraeteart, System, Browser, bei Android das Modell (soweit der Browser es nennt) und das Land, das Cloudflare
 * mitschickt. KEINE IP-Adresse, kein genauer Ort. Einen Namen wie "Juans iPhone" gibt ein Browser grundsaetzlich nicht heraus.
 * In der Datenschutzerklaerung (app/privacy) steht es dabei.
 */

export interface Geraet {
  /** "Handy", "Tablet" oder "Computer". */
  art: 'Handy' | 'Tablet' | 'Computer';
  /** "iOS 18", "Android 14", "Windows", "macOS", "Linux", "ChromeOS" ... */
  system: string;
  /** "Chrome", "Safari", "Firefox", "Edge", "Samsung Internet", "Opera" ... */
  browser: string;
  /** Das Modell, wenn der Browser es nennt (Android, z. B. "SM-S918B"). */
  modell?: string;
  /** Zweistelliges Land von Cloudflare, z. B. "CH". */
  land?: string;
}

const kopf = (h: Headers, name: string) => (h.get(name) ?? '').replace(/^"|"$/g, '').trim();

export function geraetAus(h: Headers): Geraet | null {
  const ua = h.get('user-agent') ?? '';
  if (!ua) return null;

  let system = 'Unbekannt';
  const ios = /(?:iPhone|iPad|iPod).*? OS (\d+)/.exec(ua);
  const android = /Android (\d+)/.exec(ua);
  if (ios) system = `iOS ${ios[1]}`;
  else if (android) {
    // Chrome nennt im Kennungstext seit 2023 immer "Android 10; K" - die echte Version nur auf Nachfrage (Client Hint).
    const echt = kopf(h, 'sec-ch-ua-platform-version').split('.')[0];
    system = /Android 10; K\)/.test(ua) ? (echt ? `Android ${echt}` : 'Android') : `Android ${android[1]}`;
  }
  else if (/Windows NT/.test(ua)) system = 'Windows';
  else if (/CrOS/.test(ua)) system = 'ChromeOS';
  else if (/Mac OS X|Macintosh/.test(ua)) system = 'macOS';
  else if (/Linux/.test(ua)) system = 'Linux';

  // Reihenfolge zaehlt: Edge, Opera und Samsung nennen sich zusaetzlich "Chrome", Chrome nennt sich zusaetzlich "Safari".
  const browser = /EdgA?\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /FxiOS|Firefox\//.test(ua) ? 'Firefox'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Anderer Browser';

  const tablet = /iPad|Tablet/.test(ua) || (android !== null && !/Mobile/.test(ua));
  const handy = !tablet && (/iPhone|iPod|Mobile/.test(ua) || kopf(h, 'sec-ch-ua-mobile') === '?1');
  const art: Geraet['art'] = tablet ? 'Tablet' : handy ? 'Handy' : 'Computer';

  // Das Modell: aus dem Client-Hint (Chrome auf Android, nach Accept-CH in next.config) oder aus der alten Android-Kennung "; SM-S918B Build/".
  let modell = kopf(h, 'sec-ch-ua-model');
  if (!modell && android) {
    const m = /Android [\d.]+; ([^;)]+?)(?: Build\/|\))/.exec(ua);
    if (m && m[1] !== 'K' && !/^wv$/i.test(m[1])) modell = m[1].trim();
  }
  if (ios && /iPhone/.test(ua)) modell = modell || 'iPhone';
  if (ios && /iPad/.test(ua)) modell = modell || 'iPad';

  const land = kopf(h, 'cf-ipcountry').toUpperCase();
  return {
    art, system, browser,
    ...(modell ? { modell: modell.slice(0, 40) } : {}),
    ...(/^[A-Z]{2}$/.test(land) && land !== 'XX' && land !== 'T1' ? { land } : {}),
  };
}

/** Eine Zeile zum Lesen: "Handy · iPhone · iOS 18 · Safari · CH". */
export function geraetText(g: Geraet | undefined | null): string {
  if (!g) return '';
  return [g.art, g.modell, g.system, g.browser, g.land].filter(Boolean).join(' · ');
}

/** Woran zwei Sitzungen als dasselbe Geraet gelten (ohne Land - das wechselt mit dem Netz). */
export function geraetSchluessel(g: Geraet | undefined | null): string {
  if (!g) return '';
  return [g.art, g.modell ?? '', g.system.replace(/ \d+$/, ''), g.browser].join('|');
}
