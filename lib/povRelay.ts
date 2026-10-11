import crypto from 'crypto';

/*
 * Der Weiterreicher fuer Pro-POVs - privat, ohne Twitch.
 *
 * Der Betreiber (11.10.2026): die Profis wollen nicht auf Twitch streamen, damit keine Fremden zusehen und
 * "griefen" koennen. Das POV soll nur sichtbar sein, wenn der freigegebene Streamer es in seinem Stream
 * zeigt. Deshalb teilt der Profi sein Bild direkt auf der Webseite (Bildschirm teilen im Browser), und der
 * Server reicht es nur an die weiter, die der Profi freigegeben hat.
 *
 * So geht es: der Browser des Profis nimmt sein Bild in kurzen, in sich vollstaendigen Stuecken auf
 * (etwa eine Sekunde, je Stueck ein eigener Film mit Schluesselbild) und schickt jedes Stueck hierher.
 * Zuschauer fragen nach dem naechsten Stueck, sobald sie eines abgespielt haben - der Server haelt die
 * Anfrage offen, bis eines da ist ("Long Polling"). Das laeuft ueber gewoehnliche Anfragen, hinter jedem
 * Proxy, ohne Zusatzdienst und ohne offene Ports. Wer spaet dazukommt, bekommt das neueste Stueck und ist
 * nach hoechstens einer Sekunde dabei.
 *
 * Alles liegt im Arbeitsspeicher dieses einen Servers (je Profi die letzten paar Stuecke). Das geht nur auf
 * einem dauerhaft laufenden Server - nicht bei Netlify, wo jede Anfrage ihre eigene Instanz haben kann.
 */

interface Stueck { seq: number; bytes: Buffer; zeit: number }

interface Sitzung {
  mime: string;
  seq: number;
  stuecke: Stueck[];
  wartende: Set<() => void>;
  zuletzt: number;
  seit: number;
  /** Zuschauer-Kennung -> wann zuletzt gesehen. */
  zuschauer: Map<string, number>;
  /** Wurde der Anfang dieser Sitzung schon gemeldet (Discord)? */
  gemeldet: boolean;
}

const G = globalThis as unknown as { __povSitzungen?: Map<string, Sitzung> };
const sitzungen: Map<string, Sitzung> = (G.__povSitzungen ??= new Map());

/** Wie viele Stuecke je Profi bleiben - genug fuer langsame Zuschauer, wenig Speicher. */
const BEHALTEN = 4;
/** Ein POV gilt als live, wenn das letzte Stueck juenger ist als das. */
export const LIVE_MS = 6_000;
/** Groesstes Stueck, das angenommen wird (Bytes). */
export const STUECK_MAX = 12 * 1024 * 1024;

function frisch(ident: string): Sitzung | null {
  const s = sitzungen.get(ident);
  if (!s) return null;
  // Eine Sitzung, die lange nichts mehr geliefert hat, ist vorbei.
  if (Date.now() - s.zuletzt > 120_000) { sitzungen.delete(ident); return null; }
  return s;
}

/** Ein neues Stueck des Profis ablegen und die Wartenden wecken. */
export function legeAb(ident: string, mime: string, bytes: Buffer): { seq: number; neuBeginn: boolean; zuschauer: number } {
  let s = frisch(ident);
  let neuBeginn = false;
  if (!s || Date.now() - s.zuletzt > LIVE_MS * 2) {
    // Ein neuer Anfang: der Profi hat gestoppt und wieder begonnen.
    s = { mime, seq: s?.seq ?? 0, stuecke: [], wartende: new Set(), zuletzt: Date.now(), seit: Date.now(), zuschauer: s?.zuschauer ?? new Map(), gemeldet: false };
    sitzungen.set(ident, s);
    neuBeginn = true;
  }
  if (s.mime !== mime) { s.mime = mime; s.stuecke = []; }
  s.seq += 1;
  s.zuletzt = Date.now();
  s.stuecke.push({ seq: s.seq, bytes, zeit: s.zuletzt });
  while (s.stuecke.length > BEHALTEN) s.stuecke.shift();
  for (const w of [...s.wartende]) w();
  return { seq: s.seq, neuBeginn: neuBeginn && !s.gemeldet, zuschauer: zaehle(s) };
}

export function markiereGemeldet(ident: string) {
  const s = sitzungen.get(ident);
  if (s) s.gemeldet = true;
}

function zaehle(s: Sitzung): number {
  const grenze = Date.now() - 12_000;
  let n = 0;
  for (const [k, t] of s.zuschauer) { if (t < grenze) s.zuschauer.delete(k); else n += 1; }
  return n;
}

export function istLive(ident: string): boolean {
  const s = frisch(ident);
  return !!s && Date.now() - s.zuletzt < LIVE_MS;
}

export function liveSeit(ident: string): number | null {
  const s = frisch(ident);
  return s && istLive(ident) ? s.seit : null;
}

export function zuschauerZahl(ident: string): number {
  const s = frisch(ident);
  return s ? zaehle(s) : 0;
}

export function beende(ident: string): void {
  const s = sitzungen.get(ident);
  if (!s) return;
  s.zuletzt = 0;
  for (const w of [...s.wartende]) w();
  sitzungen.delete(ident);
}

/**
 * Das naechste Stueck nach "nach" - oder bei nach = 0 das neueste. Wartet bis zu "warteMs", dann null.
 * "zuschauer" ist eine Kennung des Zuschauers, damit der Profi sieht, wie viele zusehen.
 */
export async function holeNach(ident: string, nach: number, zuschauer: string, warteMs: number): Promise<{ stueck: Stueck; mime: string } | { live: boolean } > {
  const ende = Date.now() + warteMs;
  for (;;) {
    const s = frisch(ident);
    if (s) {
      s.zuschauer.set(zuschauer, Date.now());
      const neuer = s.stuecke.filter((x) => x.seq > nach);
      if (neuer.length && Date.now() - s.zuletzt < LIVE_MS * 2) {
        // Wer hinterherhinkt, bekommt das neueste, nicht jedes verpasste.
        const stueck = nach === 0 || neuer.length > 2 ? neuer[neuer.length - 1] : neuer[0];
        return { stueck, mime: s.mime };
      }
    }
    const rest = ende - Date.now();
    if (rest <= 0) return { live: istLive(ident) };
    await new Promise<void>((fertig) => {
      const sitz = frisch(ident);
      const weck = () => { clearTimeout(uhr); sitz?.wartende.delete(weck); fertig(); };
      const uhr = setTimeout(weck, Math.min(rest, 2_000));
      sitz?.wartende.add(weck);
    });
  }
}

/* ------------------------------------------------------------------ Zugangsschluessel */

/*
 * Ein Link fuer OBS.
 *
 * Ein Streamer will das POV als Browserquelle in OBS zeigen - und dort ist er nicht angemeldet. Deshalb
 * gibt es einen Link mit einem Schluessel: er nennt den Profi und den Zuschauer und ist mit dem
 * Geheimnis des Servers beglaubigt. Ob der Zuschauer noch freigegeben ist, wird bei jedem Abruf gegen die
 * Freigabeliste des Profis geprueft - nimmt der Profi ihn heraus, ist der Link tot.
 */
const GEHEIMNIS = process.env.AUTH_COOKIE_SECRET
  || process.env.DISCORD_CLIENT_SECRET
  || process.env.TWITCH_CLIENT_SECRET
  || 'streamer-dashboard-secret';

const b64 = (t: string) => Buffer.from(t, 'utf8').toString('base64url');

/** Zuschauerkennung im Link eines Admins: er darf alles sehen. */
export const ADMIN_LINK = 'admin';

export function schluesselFuer(profi: string, zuschauer: string): string {
  const nutzlast = b64(JSON.stringify({ p: profi, v: zuschauer }));
  const sig = crypto.createHmac('sha256', GEHEIMNIS).update(`pov|${nutzlast}`).digest('base64url');
  return `${nutzlast}.${sig}`;
}

export function schluesselLesen(schluessel: string): { profi: string; zuschauer: string } | null {
  const [nutzlast, sig] = schluessel.split('.');
  if (!nutzlast || !sig) return null;
  const soll = crypto.createHmac('sha256', GEHEIMNIS).update(`pov|${nutzlast}`).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(soll);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const j = JSON.parse(Buffer.from(nutzlast, 'base64url').toString('utf8')) as { p?: string; v?: string };
    return j.p && j.v ? { profi: j.p, zuschauer: j.v } : null;
  } catch { return null; }
}
