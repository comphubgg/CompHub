import { NextResponse } from 'next/server';
import { liesJson } from '@/lib/ablage';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { namensSchluessel } from '@/lib/homoglyph';
import { landNach } from '@/lib/laender';
import { liesLanKonten } from '@/lib/lanKonten';
import { PROFIL_DATEI, pruefeAenderung, EingabeFehler, type SpielerProfil } from '@/lib/spielerProfil';
import { einreihen, mitWartendem, status } from '@/lib/profilWarteschlange';
import { liesAuto, liesVorschlaege, markieren, offeneMarkierungen, wendeMarkierungAn, type AutoEintrag, type Entscheidung, type SocialFeld, type Vorschlag, type VorschlagDatei } from '@/lib/socialsVorschlaege';

/*
 * Flaggen und X-Konten der wichtigen Spieler nachtragen (Betreiber, 16.11.2026) - nur fuer den Admin, die Seite dazu ist /admin/flaggen.
 *
 *   GET   -> { stand, regeln, zeilen: [...], ausgeschlossen }  jeder wichtige Spieler (scripts/flaggen-wichtig.mjs, spieler-kreis/_wichtig.json), dem in
 *            spieler-profile.json die Flagge oder das X-Konto fehlt; dazu, woher eine automatische Flagge kaeme (Szene-Liste, Epics Power Ranking).
 *   POST  { id, name, land?, x?, twitch? }  -> geprueft und eingereiht, Antwort sofort { status: 'wartet' }; ein Feld, das fehlt, bleibt, wie es ist;
 *         "" loescht. Geschrieben wird gesammelt, ein Commit fuer alle wartenden Zeilen (lib/profilWarteschlange.ts).
 *   GET   ?status=<id>,<id>  -> je Zeile 'wartet' | 'gespeichert' (mit dem Eintrag) | 'fehler'; fehlt eine Id, kennt der Server sie nicht (neu schicken).
 *   POST  { aktion: 'markieren', id, feld, wert, entscheidung }  -> eine Entscheidung zu einem Vorschlag oder einer automatischen Eintragung des
 *         Socials-Finders (scripts/socials-finden.mjs, lib/socialsVorschlaege.ts): angenommen | abgelehnt | geprueft | rueckgaengig. Den Wert selbst
 *         speichert die Seite wie jede Eingabe (POST oben); hier merkt sich nur der Finder, was er nicht wieder vorschlagen bzw. eintragen soll.
 *
 * Je Zeile dazu: vorschlag (was der Finder fuer ein leeres Feld vorschlaegt, mit Belegen) und auto (was er selbst eingetragen hat und noch niemand
 * geprueft hat). Eine Zeile mit offener automatischer Eintragung bleibt in der Liste, auch wenn sie sonst vollstaendig waere.
 *
 * Die Profile werden bei jedem Aufruf frisch gelesen, die Liste der wichtigen Spieler kommt vom Release (alle sechs Stunden neu, spieler-kreis.yml).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** [punkte, final, semi, heat, runde, cup, besteFinal, letzte, region, name, prRang, weg] - siehe scripts/flaggen-wichtig.mjs. */
type Wichtig = [number, number, number, number, number, number, number | null, number | null, string, string, number | null, (1 | undefined)?];
interface WichtigDatei { stand: number; regeln: unknown; konten: Record<string, Wichtig> }
interface SzeneSpieler { ID?: string; NAME?: string; COUNTRY?: string }
interface PrDatei { spieler?: Array<{ id?: string; land?: string; rank?: number }> }

export interface FlaggenZeile {
  rang: number; id: string; name: string; namen: string[]; region: string;
  punkte: number; final: number; semi: number; heat: number; runde: number; cup: number; besteFinal: number | null; letzte: number | null; pr: number | null;
  land: string; x: string; twitch: string;
  /** Was die Seite ohne gepflegtes Land zeigen wuerde - nur ein Vorschlag, nie gespeichert. */
  auto: { land: string; quelle: string } | null;
  /** Das Profil liegt noch unter dem Namen (ohne Konto-Id) - beim Speichern wandert es unter die Id. */
  alterEintrag: string | null;
  /** Woher land/x/twitch kommen: '' = unter dieser Konto-Id, sonst das Zweitkonto oder der Alteintrag (gespeichert, aber nicht unter dieser Id). */
  quelle: { land: string; x: string; twitch: string };
  /** Turnierkonten desselben Spielers mit eigenem Profil - beim Speichern werden sie mitgezogen. */
  konten: string[];
  /** Mindestens ein Wert steht nur auf einem Zweitkonto oder im Alteintrag. */
  nurZweit: boolean;
  /** Was unter der Konto-Id fehlt (beim Laden) - danach filtert die Seite. */
  fehlt: { land: boolean; x: boolean };
  /** Der Name, der beim Speichern mitgeht (findet den Alteintrag). */
  speicherName: string;
  /** Vorschlaege des Socials-Finders fuer leere Felder (mit Belegen). */
  vorschlag: Partial<Record<SocialFeld, Vorschlag>>;
  /** Automatisch eingetragen, noch nicht geprueft. */
  autoGespeichert: Partial<Record<SocialFeld, Pick<AutoEintrag, 'wert' | 'belege' | 'zeit'>>>;
}

const nein = () => NextResponse.json({ ok: false, error: 'Nur für Admins.' }, { status: 403 });

export async function GET(request: Request) {
  if (!await istAdminAnfrage()) return nein();
  const nachStatus = new URL(request.url).searchParams.get('status');
  if (nachStatus != null) {
    const ids = nachStatus.split(',').map((x) => x.trim().toLowerCase()).filter((x) => /^[0-9a-f]{32}$/.test(x)).slice(0, 500);
    return NextResponse.json({ ok: true, status: status(ids) }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  const [wichtig, profile, namen, szene, pr, vorschlaege, autoDatei] = await Promise.all([
    liesJson<WichtigDatei | null>('spieler-kreis/_wichtig.json', null),
    liesJson<Record<string, SpielerProfil>>(PROFIL_DATEI, {}).then(mitWartendem),
    liesJson<Record<string, { namen?: string[]; haupt?: string }>>('spieler-namen.json', {}),
    liesJson<SzeneSpieler[]>('szene-quelle/spielerliste.json', []),
    liesJson<PrDatei | null>('power-rankings/global.json', null),
    liesVorschlaege().catch((): VorschlagDatei => ({ zeilen: {} })),
    liesAuto().catch(() => ({ eintraege: [] as AutoEintrag[] })),
  ]);
  // Entscheidungen, die noch nicht geschrieben sind, gleich mit anwenden - sonst kaeme ein eben Abgelehntes nach dem Neuladen zurueck.
  for (const m of offeneMarkierungen()) wendeMarkierungAn(vorschlaege, autoDatei, m);
  const autoJe = new Map<string, AutoEintrag[]>();
  for (const e of autoDatei.eintraege ?? []) if (e.status === 'offen') (autoJe.get(e.id) ?? autoJe.set(e.id, []).get(e.id)!).push(e);
  const lan = await liesLanKonten().catch(() => ({}) as Awaited<ReturnType<typeof liesLanKonten>>);
  if (!wichtig?.konten) {
    return NextResponse.json({ ok: false, error: 'Die Liste der wichtigen Spieler ist noch nicht gerechnet (spieler-kreis/_wichtig.json fehlt am Release). Sie entsteht im Lauf "Spieler-Kreis".' }, { status: 503 });
  }

  const nachId = new Map<string, SpielerProfil>();
  const nachName = new Map<string, [string, SpielerProfil]>();
  for (const [k, p] of Object.entries(profile)) {
    const id = (p.id || (/^[0-9a-f]{32}$/i.test(k) ? k : '')).toLowerCase();
    if (id) nachId.set(id, p);
    else nachName.set(k, [k, p]);
  }
  const szeneLand = new Map<string, string>();
  for (const s of szene) {
    const id = String(s.ID ?? '').trim().toLowerCase();
    const l = String(s.COUNTRY ?? '').trim().toUpperCase();
    if (id && landNach(l)) szeneLand.set(id, l);
  }
  const prLand = new Map<string, string>();
  for (const s of pr?.spieler ?? []) {
    const id = String(s.id ?? '').replace(/-/g, '').toLowerCase();
    const l = String(s.land ?? '').trim().toUpperCase();
    if (id && landNach(l)) prLand.set(id, l);
  }

  /*
   * Ein Spieler, mehrere Konten (Betreiber, 16.11.2026: "[EWC2026] DIG Khanada" trug KR / Khanada / khanada_, die Zeile von Khanada stand trotzdem leer).
   * Zu jeder Zeile gehoeren: das Konto selbst, die LAN-Turnierkonten, die lib/lanKonten ihm zuordnet, und ein alter Eintrag unter dem Namen. Was eins davon
   * gespeichert hat, gilt als gespeichert; steht es nicht unter dem Hauptkonto, zeigt die Seite das und uebernimmt es beim Speichern dorthin.
   */
  const zweitKonten = new Map<string, string[]>();
  for (const [lanId, k] of Object.entries(lan)) {
    const echt = String(k?.echt ?? '').toLowerCase();
    if (echt && nachId.has(lanId.toLowerCase())) (zweitKonten.get(echt) ?? zweitKonten.set(echt, []).get(echt)!).push(lanId.toLowerCase());
  }
  const lanIds = new Set(Object.keys(lan).map((x) => x.toLowerCase()));
  /*
   * Turnierkonten, die lib/lanKonten (noch) nicht kennt - etwa "[EWC2026] DIG Khanada": Name ohne die Marke in Klammern, verglichen wie ueberall
   * (namensSchluessel, ohne Orgtag). Zugeordnet nur, wenn genau eine Zeile diesen Namen traegt - sonst lieber gar nicht.
   */
  const turnier = new Map<string, string[]>();
  for (const [id, p] of nachId) {
    const m = String(p.name ?? '').match(/^\[[^\]]+\]\s*(.+)$/);
    if (!m || lanIds.has(id) || wichtig.konten[id]) continue;
    const k = namensSchluessel(m[1]);
    if (k.length >= 3) (turnier.get(k) ?? turnier.set(k, []).get(k)!).push(id);
  }
  const zeilenJeName = new Map<string, Set<string>>();
  for (const [id, w] of Object.entries(wichtig.konten)) {
    const b = namen[id];
    const alle = [...new Set([w[9], b?.haupt ?? '', ...(b?.namen ?? [])].map((n) => namensSchluessel(String(n ?? ''))).filter((k) => k.length >= 3))];
    for (const k of alle) if (turnier.has(k)) (zeilenJeName.get(k) ?? zeilenJeName.set(k, new Set()).get(k)!).add(id);
  }
  // Tragen mehrere Zeilen denselben Kern ("acorn"), entscheidet der volle Name samt Orgtag ("TWIS Acorn") - und auch der nur, wenn er eindeutig ist.
  const voll = (n: string) => String(n ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [k, zeilenIds] of zeilenJeName) {
    let kandidaten = [...zeilenIds];
    if (kandidaten.length > 1) {
      const turnierVoll = new Set((turnier.get(k) ?? []).map((t) => voll(String(nachId.get(t)?.name ?? '').replace(/^\[[^\]]+\]\s*/, ''))));
      kandidaten = kandidaten.filter((id) => {
        const b = namen[id];
        return [wichtig.konten[id][9], b?.haupt ?? '', ...(b?.namen ?? [])].some((n) => turnierVoll.has(voll(n)));
      });
    }
    // Immer noch mehrere: Namensklauer tragen den Namen eines Profis eine Weile ("twis acornǃ" auf einem fremden Konto). Dann gilt das Konto mit klar
    // mehr Punkten (mindestens doppelt so viele wie das naechste) - sonst keins.
    if (kandidaten.length > 1) {
      const p = kandidaten.map((id) => [id, wichtig.konten[id][0]] as const).sort((x, y) => y[1] - x[1]);
      kandidaten = p[0][1] >= 2 * p[1][1] ? [p[0][0]] : [];
    }
    if (kandidaten.length !== 1) continue;
    const echt = kandidaten[0];
    for (const t of turnier.get(k) ?? []) { const l = zweitKonten.get(echt) ?? []; if (!l.includes(t)) l.push(t); zweitKonten.set(echt, l); }
  }

  const ausgeschlossen = { geloescht: 0, turnierkonto: 0, vollstaendig: 0, ohneName: 0 };
  const zeilen: FlaggenZeile[] = [];
  const sortiert = Object.entries(wichtig.konten).sort((a, b) => b[1][0] - a[1][0]);
  let rang = 0;
  for (const [id, w] of sortiert) {
    if (lanIds.has(id)) continue; // Turnierkonten zaehlen beim echten Konto
    rang += 1;
    const [punkte, final, semi, heat, runde, cup, besteFinal, letzte, region, epicName, prRang, weg] = w;
    const bekannt = namen[id];
    const alle = [...new Set([epicName, bekannt?.haupt ?? '', ...(bekannt?.namen ?? [])].map((n) => String(n ?? '').trim()).filter(Boolean))];
    const eigen = nachId.get(id);
    const konten = (zweitKonten.get(id) ?? []).map((k) => ({ id: k, p: nachId.get(k)! }));
    let alt: SpielerProfil | undefined;
    let alterEintrag: string | null = null;
    let speicherName = '';
    for (const n of alle) { const t = nachName.get(namensSchluessel(n)); if (t) { alterEintrag = t[0]; alt = t[1]; speicherName = n; break; } }
    const name = eigen?.anzeige || alt?.anzeige || alle[0] || '';
    if (weg && !eigen && !alt && !konten.length) { ausgeschlossen.geloescht += 1; continue; }
    if (!name) ausgeschlossen.ohneName += 1;
    if (!eigen && !alt && !konten.length && /^\[[^\]]+\]/.test(name)) { ausgeschlossen.turnierkonto += 1; continue; }
    // Gespeichert = erstes nicht leeres Feld: Hauptkonto, dann Turnierkonten, dann der Alteintrag. quelle sagt, woher.
    const quellen: Array<[string, SpielerProfil | undefined]> = [['', eigen], ...konten.map((k) => [k.p.name || k.id, k.p] as [string, SpielerProfil]), [`Alteintrag „${alterEintrag}“`, alt]];
    const feld = (f: 'land' | 'x' | 'twitch') => {
      for (const [q, p] of quellen) { const v = String(p?.[f] ?? '').trim(); if (v) return { wert: f === 'land' ? v.toUpperCase() : v, quelle: q }; }
      return { wert: '', quelle: '' };
    };
    const land = feld('land'); const x = feld('x'); const twitch = feld('twitch');
    const nurZweit = [land, x, twitch].some((v) => v.wert && v.quelle);
    // Automatisch Eingetragenes zaehlt nur, solange es noch so dasteht (sonst hat es jemand schon geaendert).
    const autoGespeichert: FlaggenZeile['autoGespeichert'] = {};
    for (const e of autoJe.get(id) ?? []) {
      const jetzt = { x, twitch, land }[e.feld].wert;
      if (jetzt && jetzt.toLowerCase() === e.wert.toLowerCase()) autoGespeichert[e.feld] = { wert: e.wert, belege: e.belege, zeit: e.zeit };
    }
    if (land.wert && x.wert && !nurZweit && !Object.keys(autoGespeichert).length) { ausgeschlossen.vollstaendig += 1; continue; }
    const vz = vorschlaege.zeilen?.[id];
    const vorschlag: FlaggenZeile['vorschlag'] = {};
    for (const f of ['x', 'twitch', 'land'] as const) {
      const v = vz?.[f];
      if (v?.wert && !{ x, twitch, land }[f].wert && !(vz?.abgelehnt?.[f] ?? []).includes(v.wert.toLowerCase())) vorschlag[f] = v;
    }
    const auto = land.wert ? null
      : szeneLand.has(id) ? { land: szeneLand.get(id)!, quelle: 'Szene-Liste' }
        : prLand.has(id) ? { land: prLand.get(id)!, quelle: 'Power Ranking' } : null;
    zeilen.push({
      rang, id, name, namen: alle.filter((n) => n !== name).slice(0, 6), region: eigen?.region || alt?.region || region || '',
      punkte, final, semi, heat, runde, cup, besteFinal, letzte, pr: prRang,
      land: land.wert, x: x.wert, twitch: twitch.wert, auto, alterEintrag,
      quelle: { land: land.quelle, x: x.quelle, twitch: twitch.quelle }, konten: konten.map((k) => k.id), nurZweit,
      fehlt: { land: !land.wert, x: !x.wert }, speicherName: speicherName || epicName || name, vorschlag, autoGespeichert,
    });
  }
  return NextResponse.json({ ok: true, stand: wichtig.stand, regeln: wichtig.regeln, wichtig: sortiert.length, zeilen, ausgeschlossen },
    { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage()) return nein();
  let e: { id?: string; name?: string; land?: string; x?: string; twitch?: string; konten?: string[]; aktion?: string; feld?: string; wert?: string; entscheidung?: string };
  try { e = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'Kein JSON' }, { status: 400 }); }
  if (!/^[0-9a-f]{32}$/i.test(e.id ?? '')) return NextResponse.json({ ok: false, error: 'Epic-Konto-Id fehlt' }, { status: 400 });
  if (e.aktion === 'markieren') {
    const feld = e.feld as SocialFeld;
    const entscheidung = e.entscheidung as Entscheidung;
    if (!['x', 'twitch', 'land'].includes(feld) || !['angenommen', 'abgelehnt', 'geprueft', 'rueckgaengig'].includes(entscheidung) || !String(e.wert ?? '').trim()) {
      return NextResponse.json({ ok: false, error: 'feld, wert oder entscheidung ungueltig' }, { status: 400 });
    }
    markieren({ id: e.id!.toLowerCase(), feld, wert: String(e.wert).trim().slice(0, 40), entscheidung });
    return NextResponse.json({ ok: true, status: 'wartet' });
  }
  try {
    // Nur die Felder, die die Zeile wirklich schickt - alles andere im Profil bleibt (lib/spielerProfil.ts). Geprueft wird hier, geschrieben gesammelt.
    const a = pruefeAenderung({
      id: e.id, name: e.name ?? '',
      ...(e.land !== undefined ? { land: e.land } : {}),
      ...(e.x !== undefined ? { x: e.x } : {}),
      ...(e.twitch !== undefined ? { twitch: e.twitch } : {}),
    });
    const { schluessel, version } = await einreihen(a);
    // Die Turnierkonten desselben Spielers bekommen dieselben Felder - sonst zeigte die Bestenliste eines LAN weiter den alten Wert.
    for (const k of (e.konten ?? []).map((x) => String(x).toLowerCase()).filter((x) => /^[0-9a-f]{32}$/.test(x) && x !== schluessel).slice(0, 10)) {
      await einreihen({ ...a, id: k, name: '', schluessel: k });
    }
    return NextResponse.json({ ok: true, status: 'wartet', schluessel, version, felder: a.felder });
  } catch (f) {
    if (f instanceof EingabeFehler) return NextResponse.json({ ok: false, error: f.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: `Einreihen gescheitert: ${(f as Error).message}` }, { status: 503 });
  }
}
