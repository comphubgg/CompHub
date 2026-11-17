import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import fs from '@/lib/ablageFs';
import path from 'path';
import { randomBytes } from 'crypto';
import { kontoAus, nachId } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach } from '@/lib/vipZugaenge';
import { DATEN_ORT } from '@/lib/datenOrt';
import { modName } from '@/lib/modName';
import { finestErlaubt, ichDarfFinest, sichtPasst, FINEST_KOEPFE } from '@/lib/finestZugang';

// Die Einstellungen eines Overlays - unter einer Adresse, die sich nie aendert.
//
//   GET  ?id=<kennung>      -> Einstellungen und Stand (oeffentlich)
//   GET  ?meine=1           -> die eigenen Overlays (angemeldet)
//   POST { id?, typ, name, config }  -> anlegen oder aendern (Besitzer)
//   GET  ?geloescht=1       -> die zuletzt geloeschten Overlays (angemeldet)
//   POST { id, loeschen: true }      -> entfernen (Besitzer)
//   POST { id, wiederherstellen: true } -> Loeschen zuruecknehmen (Besitzer)
//
// Loeschen ist ein Vormerken: der Eintrag bleibt mit "geloeschtAm" sieben Tage
// liegen und wird beim naechsten Schreiben danach endgueltig entfernt. Die
// Kennung - und damit die Adresse in OBS - bleibt so wiederherstellbar.
//
// Warum das noetig ist: bisher steckte jede Einstellung eines Overlays in
// seiner Adresse. Wer die Farbe aenderte, bekam eine neue Adresse und musste
// sie in OBS austauschen - mitten im Stream. Der Betreiber wollte "immer die
// gleiche URL, aber wenn man das anpasst, soll es in OBS direkt angepasst
// werden".
//
// Genau das geht jetzt, und zwar ohne Kunstgriff: die Adresse traegt nur noch
// eine Kennung, die Einstellungen stehen hier. Das Overlay fragt sie im Takt
// ab und zeichnet neu, sobald sich der "stand" erhoeht. In OBS bleibt die
// Browserquelle unberuehrt.
//
// Der Stand ist eine Zahl, kein Zeitstempel: das Overlay muss nur wissen, ob
// sich etwas geaendert hat, und eine Zahl laesst sich nicht durch eine
// schiefe Uhr verwirren.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DATEI = path.join(DATEN_ORT, 'overlays.json');

/** Wie viele Overlays ein Konto anlegen darf - gegen Unfug, nicht gegen ihn. */
const HOECHSTENS = 60;

/** Wie lange ein geloeschtes Overlay wiederherstellbar bleibt. */
const GALGENFRIST_MS = 7 * 86_400_000;

export interface OverlayEintrag {
  id: string;
  /** "standings", "teamkarte", "qual", "text" - was gezeichnet wird. */
  typ: string;
  /** Konto-Id des Besitzers. Nur er darf aendern. */
  besitzer: string;
  /** Wie es im Dashboard heisst. */
  name: string;
  /** Zaehlt bei jeder Aenderung hoch - daran erkennt das Overlay sie. */
  stand: number;
  geaendert: string;
  config: Record<string, unknown>;
  /*
   * Wer es angelegt und wer es zuletzt angefasst hat.
   *
   * Nur bei einem Manager-Zugang gefuellt. Der gehoert nicht einer Person -
   * mehrere teilen sich Name und Schluessel -, und der Streamer wollte
   * trotzdem sehen, "wer was erstellt hat, wer was geaendert hat". Beim
   * Anmelden gibt jeder deshalb seinen eigenen Namen an; der steht hier.
   *
   * Ein Schild, keine Beweisfuehrung: wer den Schluessel hat, kann jeden
   * Namen eintippen. Fuer den Zweck - "wen frage ich, warum das Overlay
   * anders aussieht" - genuegt das.
   */
  angelegtVon?: string;
  geaendertVon?: string;
  /** Gesetzt = geloescht (Millisekunden). Der Eintrag bleibt 7 Tage liegen. */
  geloeschtAm?: number;
  /**
   * Control key of a "custom" scoreboard: whoever has it may change the score
   * (the control page on a phone or a co-caster's PC), nothing else. Never
   * part of the public answer.
   */
  steuer?: string;
  /** Finest Creative overlays (private, lib/finestZugang): who with access saved it. */
  finestVon?: string[];
  /** Finest Creative overlays: secret view key - the overlay URL carries it (?k=). */
  sicht?: string;
}

/** Types that carry a control key for live score updates. */
const MIT_STEUER = new Set(['custom', 'finest']);

/**
 * May this caller read a Finest Creative overlay? With its view key (OBS has
 * no login) or signed in with the "finest" tick - and only while the overlay's
 * owner still has access. Other types: always.
 */
async function finestLesbar(e: OverlayEintrag, k: string | null): Promise<boolean> {
  if (e.typ !== 'finest') return true;
  if (!(await finestErlaubt(e))) return false;
  return sichtPasst(e, k) || (await ichDarfFinest()).length > 0;
}

/*
 * The score of the custom scoreboards, kept in memory.
 *
 * The scoreboard in OBS asks every few seconds whether the score changed. That
 * answer must be cheap: no file read, a few bytes. The map is filled on the
 * first question (one read) and updated on every write in this process.
 */
/** fin: a Finest Creative overlay - never answered from here, see GET. */
interface Kurzstand { p1: number; p2: number; stand: number; bis: number; fin?: boolean }
const KURZ = new Map<string, Kurzstand | null>();
const KURZ_MS = 10 * 60_000;
function kurzMerken(e: OverlayEintrag | undefined, id: string) {
  if (!e || e.geloeschtAm) { KURZ.set(id, null); return; }
  KURZ.set(id, {
    p1: Number(e.config?.punkte1) || 0, p2: Number(e.config?.punkte2) || 0,
    stand: e.stand, bis: Date.now() + KURZ_MS, fin: e.typ === 'finest',
  });
  if (KURZ.size > 2000) KURZ.delete(KURZ.keys().next().value as string);
}

/**
 * Das Namensschild aus dem Cookie - oder nichts.
 *
 * Leer bei jedem gewoehnlichen Zugang: dort ist ohnehin klar, wer es war.
 */
async function schild(): Promise<string> {
  const laden = await cookies();
  return modName(laden.get('streamer_dashboard_mod')?.value);
}

async function lies(): Promise<Record<string, OverlayEintrag>> {
  try {
    return JSON.parse(await fs.readFile(DATEI, 'utf8'));
  } catch {
    return {};
  }
}

async function schreibe(alles: Record<string, OverlayEintrag>): Promise<void> {
  // Geloeschtes, das die Frist hinter sich hat, endgueltig entfernen.
  const grenze = Date.now() - GALGENFRIST_MS;
  for (const [k, e] of Object.entries(alles)) {
    if (typeof e.geloeschtAm === 'number' && e.geloeschtAm < grenze) delete alles[k];
  }
  await fs.mkdir(path.dirname(DATEI), { recursive: true });
  await fs.writeFile(DATEI, JSON.stringify(alles, null, 1), 'utf8');
  for (const id of KURZ.keys()) kurzMerken(alles[id], id);
}

/** Wer fragt gerade - oder null. */
async function wer(): Promise<string | null> {
  const laden = await cookies();

  // 1. Das gewoehnliche CompHub-Konto.
  const id = kontoAus(laden.get('streamer_dashboard_konto')?.value);
  if (id) {
    const konto = await nachId(id);
    if (konto) return id;
  }

  /*
   * 2. Der alte VIP-Weg.
   *
   * Ohne ihn stand der Betreiber vor seinem eigenen Werkzeug: die
   * Overlay-Seite laesst ihn herein, denn die Sperre dort fragt useZugang,
   * und das kennt beide Wege. Diese Schnittstelle kannte nur den einen -
   * also erschien die Seite vollstaendig, und beim Klick auf "Create" kam
   * "nicht angemeldet". Ein Werkzeug, das einen hereinlaesst und dann sagt,
   * man sei nicht angemeldet, ist schlicht kaputt.
   *
   * Die Kennung muss dabei bestaendig sein, sonst gehoerten die gespeicherten
   * Overlays beim naechsten Anmelden niemandem mehr. Der Betreiber bekommt
   * deshalb "betreiber", ein VIP seinen Namen mit Vorsatz.
   */
  const vipWert = laden.get('streamer_dashboard_auth')?.value;
  if (vipWert) {
    if (istBetreiber(vipWert)) return 'betreiber';
    const name = vipAus(vipWert);
    if (name) {
      const zugang = await zugangNach(name);
      if (zugang) {
        /*
         * Ein Manager arbeitet auf der Ablage seines Streamers.
         *
         * Nicht auf einer eigenen: die Overlays gehoeren dem Streamer, und
         * mehrere Manager teilen sich denselben Zugang. Gaebe die
         * Schnittstelle hier den Manager-Namen zurueck, haette jeder
         * Manager-Zugang seine eigene, leere Sammlung - und der Streamer
         * saehe von der Arbeit seiner Manager nichts.
         *
         * Geprueft wird gegen den Streamer-Zugang: wurde der geloescht,
         * verwaltet der Manager nichts mehr und bekommt auch nichts.
         */
        const fuer = (zugang.verwaltet ?? '').trim();
        if (fuer) {
          if (fuer.toLowerCase() === 'betreiber') return 'betreiber';
          return await zugangNach(fuer) ? `vip:${fuer}` : null;
        }
        return `vip:${name}`;
      }
    }
  }

  return null;
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;

  /*
   * The cheap question of the custom scoreboard: score and version only.
   * Answered from memory; the full settings are fetched only when the
   * version moves.
   */
  const kurzId = p.get('id');
  if (kurzId && p.get('nur') === 'stand') {
    let k = KURZ.get(kurzId);
    if (k === undefined || (k && k.bis < Date.now())) {
      kurzMerken((await lies())[kurzId], kurzId);
      k = KURZ.get(kurzId);
    }
    if (!k) return NextResponse.json({ error: 'Unknown overlay' }, { status: 404 });
    /*
     * Finest Creative (private): only with the view key or the tick, checked
     * on every poll, never cached by a CDN - and read fresh, so the score from
     * the control page shows within a second.
     */
    if (k.fin) {
      const e = (await lies())[kurzId];
      if (!e || e.geloeschtAm || !(await finestLesbar(e, p.get('k')))) {
        return NextResponse.json({ error: 'Unknown overlay' }, { status: 404, headers: FINEST_KOEPFE });
      }
      return NextResponse.json({ p1: Number(e.config?.punkte1) || 0, p2: Number(e.config?.punkte2) || 0, stand: e.stand }, { headers: FINEST_KOEPFE });
    }
    return NextResponse.json({ p1: k.p1, p2: k.p2, stand: k.stand }, {
      headers: { 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'max-age=1', 'Vercel-CDN-Cache-Control': 'max-age=1' },
    });
  }

  const alles = await lies();

  const id = p.get('id');
  if (id) {
    const e = alles[id];
    // Ein geloeschtes Overlay ist fuer OBS genauso weg wie ein entferntes.
    if (!e || e.geloeschtAm) {
      return NextResponse.json({ error: 'Unknown overlay' }, { status: 404 });
    }
    // Finest Creative (private): as if it did not exist without key or tick.
    if (e.typ === 'finest') {
      if (!(await finestLesbar(e, p.get('k')))) {
        return NextResponse.json({ error: 'Unknown overlay' }, { status: 404, headers: FINEST_KOEPFE });
      }
      return NextResponse.json({ id: e.id, typ: e.typ, stand: e.stand, config: e.config }, { headers: FINEST_KOEPFE });
    }
    /*
     * Oeffentlich, aber ohne den Besitzer.
     *
     * Das Overlay laeuft in OBS ohne Anmeldung - es muss die Einstellungen
     * lesen koennen. Wer es angelegt hat, geht dabei niemanden etwas an, und
     * die Kennung selbst ist lang genug, dass sie niemand errraet.
     */
    return NextResponse.json({
      id: e.id, typ: e.typ, stand: e.stand, config: e.config,
    }, {
      /*
       * Jedes Overlay in OBS fragt alle paar Sekunden nach, stundenlang.
       * Vercels Zwischenspeicher beantwortet das; eine Aenderung im Studio
       * kommt nach hoechstens zehn Sekunden an (lib/zwischenspeicher).
       */
      headers: { 'Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'max-age=10, stale-while-revalidate=60', 'CDN-Cache-Control': 'max-age=10, stale-while-revalidate=60' },
    });
  }

  if (p.get('meine')) {
    /*
     * Finest Creative overlays are private: never in the general list (the
     * dashboard archive), only with ?typ=finest for someone with the tick -
     * then also those a person with access saved for this owner.
     */
    const finest = p.get('typ') === 'finest' ? await ichDarfFinest() : [];
    if (p.get('typ') === 'finest' && !finest.length) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: FINEST_KOEPFE });
    const ich = await wer();
    if (!ich) return NextResponse.json({ overlays: [] });
    return NextResponse.json({
      overlays: Object.values(alles)
        .filter((e) => !e.geloeschtAm && (finest.length
          ? e.typ === 'finest' && (e.besitzer === ich || finest.includes(e.besitzer) || (e.finestVon ?? []).some((x) => finest.includes(x)))
          : e.besitzer === ich && e.typ !== 'finest'))
        .sort((a, b) => b.geaendert.localeCompare(a.geaendert))
        .map((e) => ({
          id: e.id, typ: e.typ, name: e.name, stand: e.stand,
          geaendert: e.geaendert, config: e.config,
          angelegtVon: e.angelegtVon ?? null,
          geaendertVon: e.geaendertVon ?? null,
          // Only the owner sees the control key of a scoreboard.
          steuer: e.steuer ?? null,
          ...(e.typ === 'finest' ? { sicht: e.sicht ?? null } : {}),
        })),
    }, finest.length ? { headers: FINEST_KOEPFE } : undefined);
  }

  if (p.get('geloescht')) {
    const ich = await wer();
    if (!ich) return NextResponse.json({ geloescht: [] });
    const grenze = Date.now() - GALGENFRIST_MS;
    return NextResponse.json({
      geloescht: Object.values(alles)
        .filter((e) => e.besitzer === ich && e.typ !== 'finest' && e.geloeschtAm && e.geloeschtAm >= grenze)
        .sort((a, b) => (b.geloeschtAm ?? 0) - (a.geloeschtAm ?? 0))
        .map((e) => ({ id: e.id, typ: e.typ, name: e.name, geloeschtAm: e.geloeschtAm })),
    });
  }

  return NextResponse.json({ error: 'id, meine=1 or geloescht=1 is required' }, { status: 400 });
}

export async function POST(request: Request) {
  const koerper = await request.json().catch(() => ({}));

  /*
   * ------------------------------------------------ Score of a scoreboard
   *
   * { id, punkte: { p1, p2 }, steuer? } - the control page. Allowed with the
   * control key (no account needed: a co-caster on another PC or a phone) or
   * for the owner. Only the two numbers change; nothing else can be written
   * this way.
   */
  if (typeof koerper.id === 'string' && koerper.punkte && typeof koerper.punkte === 'object') {
    const alles = await lies();
    const e = alles[koerper.id];
    if (!e || e.geloeschtAm) return NextResponse.json({ error: 'Unknown overlay' }, { status: 404 });
    const mitSchluessel = typeof koerper.steuer === 'string' && Boolean(e.steuer) && koerper.steuer === e.steuer;
    if (e.typ === 'finest') {
      // Gated: the person needs access themselves AND the key (or be the owner), and the overlay must still be allowed.
      if (!(await ichDarfFinest()).length || !(await finestErlaubt(e))) {
        return NextResponse.json({ error: 'No access to Finest Creative overlays' }, { status: 403 });
      }
    }
    if (!mitSchluessel && e.besitzer !== await wer()) {
      return NextResponse.json({ error: 'Wrong control key' }, { status: 403 });
    }
    const zahl = (v: unknown) => Math.max(0, Math.min(999, Math.round(Number(v) || 0)));
    const extra: Record<string, unknown> = {};
    // Round and series travel with the score (box fights); only numbers.
    for (const k of ['runde', 'serie1', 'serie2'] as const) {
      if (koerper.punkte[k] !== undefined) extra[k] = zahl(koerper.punkte[k]);
    }
    // Scoreboards with 3-4 teams.
    if (koerper.punkte.p3 !== undefined) extra.punkte3 = zahl(koerper.punkte.p3);
    if (koerper.punkte.p4 !== undefined) extra.punkte4 = zahl(koerper.punkte.p4);
    if (typeof koerper.punkte.serieZeigen === 'boolean') extra.serieZeigen = koerper.punkte.serieZeigen;
    /*
     * The map header of a Finest Creative scoreboard (title, search term,
     * island code, clip) may be changed from the control page too - plain
     * short strings and http(s) links only.
     */
    if (e.typ === 'finest' && koerper.kopf && typeof koerper.kopf === 'object') {
      const text = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, n);
      const link = (v: unknown) => { const u = String(v ?? '').trim().slice(0, 500); return /^(https?:\/\/|\/)/.test(u) || !u ? u : ''; };
      if ('karte' in koerper.kopf) extra.karte = text(koerper.kopf.karte, 40);
      if ('suche' in koerper.kopf) extra.suche = text(koerper.kopf.suche, 24);
      if ('code' in koerper.kopf) extra.code = text(koerper.kopf.code, 20);
      if ('clip' in koerper.kopf) extra.clip = link(koerper.kopf.clip);
      if (koerper.kopf.bild !== undefined) extra.bild = link(koerper.kopf.bild);
    }
    /*
     * Line-up of a Finest Creative scoreboard from the control page: 2-4
     * teams, 1-4 players each, optional team names - short strings only.
     */
    if (e.typ === 'finest' && koerper.aufstellung && typeof koerper.aufstellung === 'object') {
      const a = koerper.aufstellung as Record<string, unknown>;
      const text = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
      extra.teams = Math.max(2, Math.min(4, Math.round(Number(a.teams) || 2)));
      for (const i of [1, 2, 3, 4]) {
        const sp = a[`spieler${i}`];
        if (Array.isArray(sp)) extra[`spieler${i}`] = sp.slice(0, 4).map((x) => text(x, 24));
        if (a[`name${i}`] !== undefined) extra[`name${i}`] = text(a[`name${i}`], 28);
      }
    }
    e.config = { ...e.config, ...extra, punkte1: zahl(koerper.punkte.p1), punkte2: zahl(koerper.punkte.p2) };
    e.stand += 1;
    e.geaendert = new Date().toISOString();
    try {
      await schreibe(alles);
    } catch {
      return NextResponse.json({ error: 'Storage not available' }, { status: 424 });
    }
    kurzMerken(e, e.id);
    return NextResponse.json({ ok: true, p1: e.config.punkte1, p2: e.config.punkte2, stand: e.stand, config: e.config });
  }

  const ich = await wer();
  if (!ich) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const alles = await lies();

  // ------------------------------------------------ New control key (owner)
  if (koerper.neuerSteuer && typeof koerper.id === 'string') {
    const e = alles[koerper.id];
    if (!e || e.geloeschtAm) return NextResponse.json({ error: 'Unknown overlay' }, { status: 404 });
    if (e.besitzer !== ich) return NextResponse.json({ error: 'Not yours' }, { status: 403 });
    e.steuer = randomBytes(12).toString('base64url');
    try {
      await schreibe(alles);
    } catch {
      return NextResponse.json({ error: 'Storage not available' }, { status: 424 });
    }
    return NextResponse.json({ ok: true, steuer: e.steuer });
  }

  // ------------------------------------------------------------ Entfernen
  if (koerper.loeschen && typeof koerper.id === 'string') {
    const e = alles[koerper.id];
    if (!e) return NextResponse.json({ error: 'Unknown overlay' }, { status: 404 });
    if (e.besitzer !== ich) {
      return NextResponse.json({ error: 'Not yours' }, { status: 403 });
    }
    if (!e.geloeschtAm) e.geloeschtAm = Date.now();
    try {
      await schreibe(alles);
    } catch {
      return NextResponse.json({ error: 'Storage not available' }, { status: 424 });
    }
    return NextResponse.json({ ok: true });
  }

  // ------------------------------------------------- Wiederherstellen
  if (koerper.wiederherstellen && typeof koerper.id === 'string') {
    const e = alles[koerper.id];
    if (!e) return NextResponse.json({ error: 'Unknown overlay' }, { status: 404 });
    if (e.besitzer !== ich) {
      return NextResponse.json({ error: 'Not yours' }, { status: 403 });
    }
    if (e.geloeschtAm) {
      delete e.geloeschtAm;
      try {
        await schreibe(alles);
      } catch {
        return NextResponse.json({ error: 'Storage not available' }, { status: 424 });
      }
    }
    return NextResponse.json({ ok: true, id: e.id });
  }

  const typ = String(koerper.typ ?? '').trim();
  if (!typ) return NextResponse.json({ error: 'A type is required' }, { status: 400 });
  const name = String(koerper.name ?? '').trim().slice(0, 60) || typ;
  const config = (koerper.config && typeof koerper.config === 'object')
    ? koerper.config as Record<string, unknown> : {};
  // A logo can travel as a small data URL; everything together stays small.
  if (JSON.stringify(config).length > 400_000) {
    return NextResponse.json({ error: 'Settings too large (logo image too big?)' }, { status: 413 });
  }
  let finestIdents: string[] = [];
  const warFinest = typeof koerper.id === 'string' && alles[koerper.id]?.typ === 'finest';
  if (typ === 'finest' || warFinest) {
    finestIdents = await ichDarfFinest();
    if (!finestIdents.length) {
      return NextResponse.json({ error: 'No access to Finest Creative overlays' }, { status: 403 });
    }
  }

  // ------------------------------------------------------------- Aendern
  if (typeof koerper.id === 'string' && alles[koerper.id] && !alles[koerper.id].geloeschtAm) {
    const e = alles[koerper.id];
    // Finest: the operator may be signed in by account or by VIP key - either of his idents owns it.
    if (e.besitzer !== ich && !(e.typ === 'finest' && finestIdents.includes(e.besitzer))) {
      return NextResponse.json({ error: 'Not yours' }, { status: 403 });
    }
    e.typ = typ;
    e.name = name;
    e.config = config;
    e.stand += 1;
    e.geaendert = new Date().toISOString();
    if (MIT_STEUER.has(typ) && !e.steuer) e.steuer = randomBytes(12).toString('base64url');
    if (typ === 'finest') {
      e.finestVon = [...new Set([...(e.finestVon ?? []), ...finestIdents])].slice(-10);
      if (!e.sicht) e.sicht = randomBytes(18).toString('base64url');
    }
    const wers = await schild();
    if (wers) e.geaendertVon = wers;
    try {
      await schreibe(alles);
    } catch {
      return NextResponse.json({ error: 'Storage not available' }, { status: 424 });
    }
    kurzMerken(e, e.id);
    return NextResponse.json({ id: e.id, stand: e.stand, steuer: e.steuer ?? null, ...(e.sicht ? { sicht: e.sicht } : {}) });
  }

  // ------------------------------------------------------------- Anlegen
  const meine = Object.values(alles).filter((e) => e.besitzer === ich && !e.geloeschtAm);
  if (meine.length >= HOECHSTENS) {
    return NextResponse.json({
      error: `No more than ${HOECHSTENS} overlays.`,
    }, { status: 400 });
  }

  const wer_es_war = await schild();

  // Zwoelf Zeichen aus dem Zufallsgenerator: kurz genug fuer eine Adresse,
  // lang genug, dass niemand fremde Overlays durchprobiert.
  const neu: OverlayEintrag = {
    id: randomBytes(9).toString('base64url'),
    typ,
    besitzer: ich,
    name,
    stand: 1,
    geaendert: new Date().toISOString(),
    config,
    // Einmal lesen, nicht zweimal - und nur setzen, wenn wirklich eines da ist.
    ...(wer_es_war ? { angelegtVon: wer_es_war, geaendertVon: wer_es_war } : {}),
    ...(MIT_STEUER.has(typ) ? { steuer: randomBytes(12).toString('base64url') } : {}),
    ...(typ === 'finest' ? { finestVon: finestIdents, sicht: randomBytes(18).toString('base64url') } : {}),
  };
  alles[neu.id] = neu;
  try {
    await schreibe(alles);
  } catch {
    return NextResponse.json({ error: 'Storage not available' }, { status: 424 });
  }
  return NextResponse.json({ id: neu.id, stand: neu.stand, steuer: neu.steuer ?? null, ...(neu.sicht ? { sicht: neu.sicht } : {}) });
}
