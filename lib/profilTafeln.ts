/*
 * Die FNCS-Tafel und die Erfolge eines Spielerprofils.
 *
 * Der Betreiber (28.9.2026) nach dem Vorbild eucompetitive: "das mit FNCS ist
 * sehr geil, dass du so jeden FNCS von jemals auflisten kannst. Und DNQ
 * bedeutet didn't qualify ... die Platzierungen sollst du unbedingt wissen,
 * mit wem er gespielt hat, ist auch sehr wichtig."
 *
 * Quellen, alle aus dem eigenen Archiv:
 *   - die Spielerliste der Szene-Quelle: Platz je FNCS-Finale seit CH1 SX
 *     (0 = nicht qualifiziert), reicht bis zu den Globals 2025
 *   - die Akte des Spielers: Epics Bestenlisten seit CH3 (S19), mit Platz und
 *     Mitspielern, dazu die Tage der Szene-Quelle
 *   - die LAN-Preislisten: Globals, Summit - Platz je Spieler, der Mitspieler
 *     ist, wer denselben Platz hat
 * Ein Rating gibt es nicht: das rechnet nur das Vorbild, nach eigener Formel.
 */

export interface ProfilZeile {
  windowId: string; season: string; titel: string; datum: number | null;
  platz: number | null; mitspieler: string[];
}
export interface LanListe { kennung: string; name: string; season: string; fenster: string; spieler: Array<{ epicId: string; platz: number }> }

export interface TafelZeile {
  saison: string;
  /** 0 = nicht qualifiziert (DNQ). */
  platz: number;
  typ: 'LAN' | 'ONLINE';
  mitspieler: string[];
  datum: number | null;
}

const LAN_FENSTER = /^(BambiRaptor|Dinosauron|MannekenPis|Acrocanthosaurus)_Day(\d+)$/i;

/** Ist das der (letzte) Tag eines FNCS-Finales - nicht Gruppe, Heat, Semis, Division? */
export function fncsFinalTag(windowId: string): number | null {
  if (!/FNCS/i.test(windowId)) return null;
  if (/Semis|Group|Heat|Divisional|Division|Solo|LastChance|Practice|Qual|Round\d|Summit/i.test(windowId)) return null;
  if (!/(Finals?(_|$)|GrandFinals?|GrandFinalDay|_Final_Day)/i.test(windowId)) return null;
  return Number(/Day(\d+)/i.exec(windowId)?.[1] ?? 1);
}

/** "S19" -> "CH3 S1" (aus saisonKurz "CH3S1"). */
export const mitLeerzeichen = (kurz: string) => kurz.toUpperCase().replace(/^(CH\d+)(S\d+)$/, '$1 $2');

const istLanLabel = (label: string) => /^(GLOBALS|INVITATIONAL)|SUMMIT/i.test(label);

export function fncsTafel(opt: {
  quelle: Array<{ saison: string; platz: number }>;
  zeilen: ProfilZeile[];
  lan: LanListe[];
  spieler: string;
  /** Kennung -> "CH3 S1". */
  label: (kennung: string) => string;
  /** "CH3 S1" -> Kennung, wo bekannt. */
  kennungVon: (label: string) => string | undefined;
  /** Saisons, in denen es ein FNCS-Finale gab, das die Quelle noch nicht fuehrt. */
  weitereFinals: string[];
}): TafelZeile[] {
  const { quelle, zeilen, lan, spieler, label, kennungVon } = opt;
  const nr = (k?: string) => (k && /^S\d+$/.test(k) ? Number(k.slice(1)) : NaN);

  // Je Saison der letzte Tag des Finales, den der Spieler gespielt hat.
  const jeSaison = new Map<string, ProfilZeile & { tag: number }>();
  for (const z of zeilen) {
    const tag = fncsFinalTag(z.windowId);
    if (!tag) continue;
    const da = jeSaison.get(z.season);
    if (!da || tag > da.tag || (tag === da.tag && (z.mitspieler.length > da.mitspieler.length))) jeSaison.set(z.season, { ...z, tag });
  }
  // Die LANs der FNCS (Globals, Summit), je Kennung.
  const lans = lan.filter((e) => /global championship|summit|invitational/i.test(e.name));
  const lanLabel = (e: LanListe) => (/global championship/i.test(e.name)
    ? `GLOBALS ${/(\d{4})/.exec(e.name)?.[1] ?? ''}`.trim()
    : `${label(e.season)} MID SUMMIT`);
  const lanTeam = (e: LanListe) => {
    const ich = e.spieler.find((s) => s.epicId === spieler);
    return ich ? { platz: ich.platz, mit: e.spieler.filter((s) => s.platz === ich.platz && s.epicId !== spieler).map((s) => s.epicId) } : null;
  };

  const raus = new Map<string, TafelZeile & { schluessel: number }>();
  // 1) Die Liste der Szene-Quelle - in ihrer Reihenfolge, mit Mitspielern wo bekannt.
  let vorige = 0;
  for (const q of quelle) {
    const kennung = kennungVon(q.saison);
    const schluessel = Number.isFinite(nr(kennung)) ? nr(kennung) : vorige + 0.1;
    vorige = schluessel;
    const z = kennung ? jeSaison.get(kennung) : undefined;
    const lanE = istLanLabel(q.saison) ? lans.find((e) => lanLabel(e) === q.saison) : undefined;
    const lanT = lanE ? lanTeam(lanE) : null;
    raus.set(q.saison, {
      saison: q.saison, platz: q.platz, typ: istLanLabel(q.saison) ? 'LAN' : 'ONLINE',
      mitspieler: q.platz ? (lanT?.mit ?? z?.mitspieler ?? []) : [],
      datum: z?.datum ?? null, schluessel,
    });
  }
  // 2) Finals, die die Quelle noch nicht fuehrt - aus der Akte.
  for (const [kennung, z] of jeSaison) {
    const l = label(kennung);
    if (raus.has(l) || !z.platz) continue;
    raus.set(l, { saison: l, platz: z.platz, typ: 'ONLINE', mitspieler: z.mitspieler, datum: z.datum, schluessel: nr(kennung) });
  }
  // ... und Finals der Saisons danach, zu denen er nicht qualifiziert war (DNQ).
  for (const kennung of opt.weitereFinals) {
    const l = label(kennung);
    if (!raus.has(l)) raus.set(l, { saison: l, platz: 0, typ: 'ONLINE', mitspieler: [], datum: null, schluessel: nr(kennung) });
  }
  // 3) Die LANs der FNCS.
  for (const e of lans) {
    const l = lanLabel(e);
    const t = lanTeam(e);
    const vorher = raus.get(l);
    if (vorher && (vorher.platz || !t)) {
      if (t && !vorher.mitspieler.length) vorher.mitspieler = t.mit;
      continue;
    }
    raus.set(l, { saison: l, platz: t?.platz ?? 0, typ: 'LAN', mitspieler: t?.mit ?? [], datum: null, schluessel: nr(e.season) + 0.5 });
  }
  return [...raus.values()].sort((a, b) => a.schluessel - b.schluessel)
    .map(({ schluessel: _s, ...r }) => { void _s; return r; });
}

/**
 * Ein lesbarer Turniername aus Kennung oder Kuerzel der Quelle:
 * "CH7S2FNCSDivision1FinalsWeek3" -> "FNCS Division 1 Finals Week 3",
 * "S17_CashCup_EU_Event2" -> "Cash Cup Event 2".
 */
export function titelAus(windowId: string, event: string): string {
  const roh = /^CH\d+S\d+[A-Z]/.test(event) ? event.replace(/^CH\d+S\d+/, '')
    : /[a-z]/.test(event) && /\s/.test(event) && !/·/.test(event) ? event
      : windowId.replace(/^S\d+_/, '').replace(/_(EU|NAC|NAW|NAE|BR|ASIA|ME|OCE|GLOBAL)(?=_|$)/g, '');
  return roh
    .replace(/_/g, ' ')
    .replace(/FNCS(?=[A-Z])/g, 'FNCS ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Erfolg { titel: string; season: string; platz: number; typ: 'LAN' | 'ONLINE'; mitspieler: string[]; datum: number | null }

/**
 * Die Top-3-Plaetze ausserhalb der FNCS-Finals ("Others" beim Vorbild):
 * Cash Cups, Performance Cups, Reload Elite und was sonst gewertet wird.
 */
export function andereErfolge(zeilen: ProfilZeile[], lan: LanListe[], spieler: string): Erfolg[] {
  const raus: Erfolg[] = [];
  const gesehen = new Set<string>();
  for (const z of zeilen) {
    if (!z.platz || z.platz > 3 || fncsFinalTag(z.windowId)) continue;
    // Vorrunden nicht - aber die zweite Runde eines Cash oder Performance Cups
    // ist dessen Finale ("Event4Round2").
    if (/Semis|Group|Heat|Qual|Round1(?!\d)/i.test(z.windowId) && !/Final/i.test(z.windowId)) continue;
    // Bei zweitaegigen Finals nur der letzte Tag.
    const schluessel = z.windowId.replace(/_?Day\d+/i, '');
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    raus.push({
      titel: titelAus(z.windowId, z.titel), season: z.season, platz: z.platz, typ: LAN_FENSTER.test(z.windowId) ? 'LAN' : 'ONLINE',
      mitspieler: z.mitspieler, datum: z.datum,
    });
  }
  for (const e of lan) {
    if (/global championship|summit|invitational/i.test(e.name)) continue;
    const ich = e.spieler.find((s) => s.epicId === spieler);
    if (!ich || ich.platz > 3) continue;
    raus.push({
      titel: e.name, season: e.season, platz: ich.platz, typ: 'LAN',
      mitspieler: e.spieler.filter((s) => s.platz === ich.platz && s.epicId !== spieler).map((s) => s.epicId), datum: null,
    });
  }
  return raus.sort((a, b) => a.platz - b.platz || (b.datum ?? 0) - (a.datum ?? 0));
}
