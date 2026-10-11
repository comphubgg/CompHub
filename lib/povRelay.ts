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
 *
 * Zwei Wege (Betreiber, 11.10.2026: "sehr viel Delay, Haenger, Ton schlecht"):
 *
 *   - Strom (neu, Normalfall): der Browser des Profis nimmt ohne Unterbrechung auf, packt das Bild in
 *     kleine MP4-Fragmente (etwa alle 100 ms, app/pov/fmp4.ts) und schickt sie her. Der Server haelt das
 *     Init-Segment und die Fragmente seit dem letzten Schluesselbild und schiebt sie jedem Zuschauer ueber
 *     eine offene Antwort (Streaming) sofort zu. Verzoegerung gut eine Sekunde, kein Neustart des Rekorders,
 *     und endet der Profi, endet auch die Antwort - der Zuschauer sieht "offline" ohne Wartezeit.
 *   - Stuecke (alt, Rueckfall fuer Browser ohne H.264 in WebM): ganze Ein-Sekunden-Filme, Long Polling.
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

/** Ein Zuschauer, dem der Strom gerade zugeschoben wird. */
interface Abo { id: string; schiebe: (b: Uint8Array) => boolean; zu: () => void }

/** Ein laufender Strom eines Profis (siehe oben). */
interface Strom {
  mime: string;
  init: Buffer;
  /** Die Fragmente seit dem letzten Schluesselbild - damit ein spaeter Zuschauer dort einsteigen kann. */
  gop: Buffer[];
  gopBytes: number;
  abos: Set<Abo>;
  zuletzt: number;
  seit: number;
  zuschauer: Map<string, number>;
  gemeldet: boolean;
  fragmente: number;
}

const G = globalThis as unknown as { __povSitzungen?: Map<string, Sitzung>; __povStroeme?: Map<string, Strom> };
const sitzungen: Map<string, Sitzung> = (G.__povSitzungen ??= new Map());
const stroeme: Map<string, Strom> = (G.__povStroeme ??= new Map());

/** Ein Strom gilt als live, solange das letzte Fragment juenger ist als das (es kommen zehn je Sekunde). */
export const STROM_LIVE_MS = 3_500;
const GOP_MAX_BYTES = 24 * 1024 * 1024;
const GOP_MAX_STUECKE = 400;

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

function stromLebt(ident: string): Strom | null {
  const t = stroeme.get(ident);
  if (!t) return null;
  if (Date.now() - t.zuletzt > STROM_LIVE_MS) { schliesseStrom(ident); return null; }
  return t;
}

export function istLive(ident: string): boolean {
  if (stromLebt(ident)) return true;
  const s = frisch(ident);
  return !!s && Date.now() - s.zuletzt < LIVE_MS;
}

export function liveSeit(ident: string): number | null {
  const t = stromLebt(ident);
  if (t) return t.seit;
  const s = frisch(ident);
  return s && istLive(ident) ? s.seit : null;
}

function zaehleStrom(t: Strom): number {
  const ids = new Set<string>();
  for (const a of t.abos) ids.add(a.id);
  return ids.size;
}

export function zuschauerZahl(ident: string): number {
  const t = stroeme.get(ident);
  if (t) return zaehleStrom(t);
  const s = frisch(ident);
  return s ? zaehle(s) : 0;
}

export function beende(ident: string): void {
  schliesseStrom(ident);
  const s = sitzungen.get(ident);
  if (!s) return;
  s.zuletzt = 0;
  for (const w of [...s.wartende]) w();
  sitzungen.delete(ident);
}

/* ------------------------------------------------------------------ Strom */

/** Ein Strom beginnt (oder beginnt neu): alle bisherigen Zuschauer werden getrennt und holen sich den neuen. */
export function stromStart(ident: string, mime: string, init: Buffer): { neuBeginn: boolean } {
  const alt = stroeme.get(ident);
  const neuBeginn = !alt || Date.now() - alt.zuletzt > STROM_LIVE_MS;
  if (alt) for (const a of [...alt.abos]) a.zu();
  stroeme.set(ident, {
    mime, init, gop: [], gopBytes: 0, abos: new Set(), zuletzt: Date.now(), seit: Date.now(),
    zuschauer: new Map(), gemeldet: !neuBeginn && alt ? alt.gemeldet : false, fragmente: 0,
  });
  // Ein altes Stueck-POV desselben Profis ist damit ersetzt.
  const s = sitzungen.get(ident);
  if (s) { s.zuletzt = 0; for (const w of [...s.wartende]) w(); sitzungen.delete(ident); }
  return { neuBeginn };
}

/** Ein Fragment des Profis: merken (ab Schluesselbild) und sofort an alle Zuschauer schieben. */
export function stromFragment(ident: string, key: boolean, bytes: Buffer): { ok: boolean; zuschauer: number } {
  const t = stroeme.get(ident);
  if (!t) return { ok: false, zuschauer: 0 };
  t.zuletzt = Date.now();
  t.fragmente += 1;
  if (key) { t.gop = []; t.gopBytes = 0; }
  t.gop.push(bytes); t.gopBytes += bytes.length;
  if (t.gopBytes > GOP_MAX_BYTES || t.gop.length > GOP_MAX_STUECKE) { t.gop = [bytes]; t.gopBytes = bytes.length; }
  const daten = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (const a of [...t.abos]) {
    // Wer nicht mitkommt, wird getrennt und steigt neu ein - lieber ein Sprung als eine wachsende Verzoegerung.
    if (!a.schiebe(daten)) { t.abos.delete(a); a.zu(); }
  }
  return { ok: true, zuschauer: zaehleStrom(t) };
}

export function markiereStromGemeldet(ident: string) {
  const t = stroeme.get(ident);
  if (t) t.gemeldet = true;
}

function schliesseStrom(ident: string) {
  const t = stroeme.get(ident);
  if (!t) return;
  stroeme.delete(ident);
  for (const a of [...t.abos]) a.zu();
}

/** Gibt es gerade einen Strom (und ist er frisch)? Mit der Aufnahmeart. */
export function stromDa(ident: string): { mime: string } | null {
  const t = stromLebt(ident);
  return t ? { mime: t.mime } : null;
}

/** Ein offener Strom fuer einen Zuschauer: erst Init und die Fragmente seit dem letzten Schluesselbild, dann live. */
export function stromOeffnen(ident: string, zuschauer: string): ReadableStream<Uint8Array> | null {
  const t = stromLebt(ident);
  if (!t) return null;
  let abo: Abo | null = null;
  return new ReadableStream<Uint8Array>({
    start(c) {
      abo = {
        id: zuschauer,
        // Ein Zuschauer, dessen Warteschlange um mehr als ein paar MB waechst, kommt nicht mit.
        schiebe: (b) => {
          if ((c.desiredSize ?? 1) < -3 * 1024 * 1024) return false;
          try { c.enqueue(b); return true; } catch { return false; }
        },
        zu: () => { try { c.close(); } catch { /* war schon zu */ } },
      };
      const roh = (b: Buffer) => new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
      c.enqueue(roh(t.init));
      for (const g of t.gop) c.enqueue(roh(g));
      t.abos.add(abo);
      t.zuschauer.set(zuschauer, Date.now());
    },
    cancel() { if (abo) t.abos.delete(abo); },
  }, { highWaterMark: 4 * 1024 * 1024, size: (b) => b.byteLength });
}

/** Wartet, bis der Profi sendet (Strom oder alte Stuecke) - hoechstens "ms". */
export async function warteAufProfi(ident: string, ms: number): Promise<'strom' | 'stuecke' | null> {
  const ende = Date.now() + ms;
  for (;;) {
    if (stromDa(ident)) return 'strom';
    if (istLive(ident)) return 'stuecke';
    if (Date.now() >= ende) return null;
    await new Promise((x) => setTimeout(x, 250));
  }
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
