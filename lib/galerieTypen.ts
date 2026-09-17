/*
 * Das Archiv: Fotos und Videos zu Events und Spielern.
 *
 * Der Betreiber: "Player bzw. Events Archiv mit Pictures und Videos" - er
 * laedt Bilder hoch, haengt Videos an (YouTube, Twitch, X, TikTok) und
 * ordnet Spieler zu. Alles andere kommt aus dem, was schon da ist: Name,
 * Flagge und Foto eines Spielers aus den gepflegten Profilen, die Event-
 * Namen aus seiner eigenen Liste.
 *
 * Ein Event ist ein Ordner mit Namen, Ort und Datum (Globals 2025 in Lyon,
 * Reload Championship in Paris). Ein Eintrag ist ein Bild oder ein Video
 * darin, mit den Spielern, die darauf zu sehen sind. Nichts wird erfunden:
 * ein Bild ohne zugeordnete Spieler bleibt ohne Spieler.
 *
 * Die Bilder selbst liegen als Dateien unter galerie/<id>.<ext> in der
 * Ablage (Objektspeicher), das Verzeichnis in galerie.json daneben - das
 * steht in lib/galerie.ts. Hier nur, was auch der Browser braucht: die
 * Formen, die Kennung, das Erkennen eines Videos.
 */

export interface GalerieEvent {
  id: string;
  name: string;
  ort: string;
  /** Als YYYY-MM-DD - fuer die Reihenfolge und die Anzeige. */
  datum: string;
  beschreibung?: string;
  erstellt: number;
}

export interface GalerieEintrag {
  id: string;
  /**
   * Das Event, zu dem das Bild gehoert - oder leer: dann ist es das
   * allgemeine Archiv eines Spielers (mit der Trophaee, beim Signen bei
   * der Org, am Setup). Der Betreiber: "oben ist Allgemein-Archiv, unten
   * sind die spezifischen Events."
   */
  eventId: string;
  art: 'bild' | 'video';
  /** Bei Bildern: der Name der Datei in der Ablage (galerie/<id>.jpg). */
  datei?: string;
  typ?: string;
  bytes?: number;
  /** Bei Videos: die Adresse, so wie sie der Betreiber eingegeben hat. */
  url?: string;
  titel?: string;
  /** Die Konto-Ids der Spieler auf dem Bild oder im Video. */
  spieler: string[];
  erstellt: number;
}

export interface Galerie {
  events: GalerieEvent[];
  eintraege: GalerieEintrag[];
}

/** Eine kurze, eindeutige Kennung - Zeit plus Zufall, nur Kleinbuchstaben und Ziffern. */
export function neueId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Welches Video das ist - fuer das Einbetten. Erkannt werden YouTube,
 * Twitch (Clips und Videos), X und TikTok; alles andere bleibt ein Link.
 */
export function videoArt(url: string): { art: 'youtube' | 'twitch-clip' | 'twitch-video' | 'x' | 'tiktok' | 'link'; kennung: string } {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return { art: 'youtube', kennung: u.pathname.slice(1).split('/')[0] };
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const v = u.searchParams.get('v');
      if (v) return { art: 'youtube', kennung: v };
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/);
      if (m) return { art: 'youtube', kennung: m[1] };
    }
    if (host === 'clips.twitch.tv') return { art: 'twitch-clip', kennung: u.pathname.slice(1).split('/')[0] };
    if (host === 'twitch.tv') {
      const c = u.pathname.match(/\/clip\/([^/?]+)/);
      if (c) return { art: 'twitch-clip', kennung: c[1] };
      const v = u.pathname.match(/\/videos\/(\d+)/);
      if (v) return { art: 'twitch-video', kennung: v[1] };
    }
    if (host === 'x.com' || host === 'twitter.com') {
      const m = u.pathname.match(/\/status\/(\d+)/);
      if (m) return { art: 'x', kennung: m[1] };
    }
    if (host === 'tiktok.com' || host === 'vm.tiktok.com') {
      const m = u.pathname.match(/\/video\/(\d+)/);
      if (m) return { art: 'tiktok', kennung: m[1] };
    }
  } catch { /* keine Adresse */ }
  return { art: 'link', kennung: '' };
}
