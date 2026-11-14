/*
 * Tweets im Stil von Fortnite Tracker aus CompHubs Replay-Auswertung (Betreiber: "die Posts sollen genau so aussehen wie die von Fortnite Tracker"):
 * "Best Stats", "Most Damage Dealt (Ratio)" und "Most Eliminations (Damage)".
 *
 * Nur das Bauen der Texte - ohne Datei- oder Netzzugriff, damit dieselbe Regel in der Seite (lib/ftPostsDaten.ts, /api/admin/ft-posts) und im
 * Kommandozeilen-Werkzeug (scripts/ft-posts.mjs, mit node --experimental-strip-types) gilt. Deshalb hier keine "@/"-Importe und nur reine Typen.
 *
 * Woher die Werte kommen:
 *   - Schaden und erlittener Schaden je Spieler: clutch/<Fenster>.json, Feld "schaden" (scripts/clutch-berechnen.mjs).
 *   - Elims je Spieler: clutch-je/<Fenster>.json, Spalte "killsEcht" je Match aufsummiert. NICHT das Feld "solo" - das sind Clutch-Punkte.
 *   - Sieger, Siege und Elims je Team: Epics Bestenliste des Spieltags.
 *   - Flagge und @-Konto: spieler-profile.json (id -> x / land), Land ersatzweise aus szene-quelle/spielerliste.json.
 *   - Streamer (Twitch-Kanal aus dem Profil, der in streamers.json steht) erscheinen als twitch.tv/<kanal> statt mit @.
 */

export type FtJeZeile = Array<string | number | null>;

/** Was aus clutch/<Fenster>.json gebraucht wird. */
export interface FtClutch {
  schaden?: Record<string, { dmg?: number; erlitten?: number } | undefined>;
  spiele?: Record<string, number>;
  namen?: Record<string, string>;
  matches?: unknown[];
  gesamt?: number;
  teilweise?: unknown;
  je?: { spalten?: string[] };
}

/** Ein Team aus Epics Bestenliste. */
export interface FtTeam { ids: string[]; siege: number; spiele: number; elims: number; rang?: number }

/** Wie ein Spieler im Text erscheint - alle Schluessel klein geschrieben. */
export interface FtKonten {
  x: Record<string, string>;
  land: Record<string, string>;
  twitch: Record<string, string>;
  /** Der Name, wenn es weder @ noch Twitch gibt. */
  namen: Record<string, string>;
}

export interface FtEingabe {
  /** Kopfzeile ohne Pokal, z. B. "FNCS Solo Reload Round 2 EU". */
  titel: string;
  clutch: FtClutch;
  /** Id -> Zeilen je Match (lib/jeSpiel.mjs). */
  je: Record<string, FtJeZeile[]>;
  /** Die Spalten der Zeilen nach der Match-Id (clutch.je.spalten bzw. JE_SPALTEN). */
  spalten: string[];
  /** Teams aus Epics Bestenliste; ohne sie fehlen Winner, Most Wins und Most Kills/Match. */
  teams?: FtTeam[] | null;
  konten: FtKonten;
  /** Mindestzahl Spiele fuer Ratio und Kills/Match - sonst die Haelfte der meisten Spiele eines Spielers. */
  minSpiele?: number;
}

export type FtArt = 'best-stats' | 'damage' | 'elims';
export interface FtPost { art: FtArt; titel: string; text: string }
export interface FtErgebnis {
  posts: FtPost[];
  stand: { gelesen: number; gesamt: number | null; teilweise: boolean };
  minSpiele: number;
  spieler: number;
}

export const FT_PLATZ = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

export const ftFlagge = (c?: string | null): string => {
  const k = (c ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(k) ? String.fromCodePoint(...[...k].map((b) => 0x1f1a5 + b.charCodeAt(0))) : '';
};

const ftZahl = (n: number) => Math.round(n).toLocaleString('en-US');
const ohneAt = (s: string) => s.trim().replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '').replace(/^@/, '').replace(/[/?].*$/, '');
const ohneTwitch = (s: string) => s.trim().replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '').replace(/[/?].*$/, '');

interface ProfilRoh { id?: string; epicId?: string; x?: string; land?: string; twitch?: string; anzeige?: string; name?: string }
interface StreamerRoh { twitch?: string; twitter?: string }

/**
 * Die Zuordnung Id -> @-Konto, Land, Twitch und Name aus den gepflegten Dateien.
 *   profile:  spieler-profile.json (Objekt oder Liste)
 *   liste:    szene-quelle/spielerliste.json ([{ ID, COUNTRY }])
 *   streamer: streamers.json ({ streamers: { EU: [...], NA: [...] } }) - null: jeder Twitch-Kanal im Profil zaehlt als Streamer
 *   namen:    spieler-namen.json (id -> { haupt })
 */
export function ftKonten(
  profile: Record<string, ProfilRoh> | ProfilRoh[] | null | undefined,
  liste: Array<{ ID?: string; COUNTRY?: string }> | null | undefined,
  streamer: { streamers?: Record<string, StreamerRoh[] | undefined> } | null | undefined,
  namen?: Record<string, { haupt?: string } | undefined> | null,
): FtKonten {
  const k: FtKonten = { x: {}, land: {}, twitch: {}, namen: {} };
  const kanaele = new Set<string>();
  const xZuTwitch = new Map<string, string>();
  for (const l of Object.values(streamer?.streamers ?? {})) {
    for (const s of l ?? []) {
      const tw = ohneTwitch(String(s.twitch ?? '')).toLowerCase();
      if (!tw) continue;
      kanaele.add(tw);
      const x = ohneAt(String(s.twitter ?? '')).toLowerCase();
      if (x) xZuTwitch.set(x, tw);
    }
  }
  const mitListe = !!streamer?.streamers;
  const eintraege = Array.isArray(profile) ? profile.map((p) => [p.id ?? p.epicId ?? '', p] as const) : Object.entries(profile ?? {});
  for (const [schluessel, p] of eintraege) {
    const id = String(p?.id || p?.epicId || schluessel || '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(id)) continue;
    const x = p.x ? ohneAt(p.x) : '';
    if (x) k.x[id] = x;
    if (p.land) k.land[id] = p.land;
    const eigen = p.twitch ? ohneTwitch(p.twitch) : '';
    // Ohne Streamer-Liste geht das @-Handle vor; twitch.tv nur, wenn es kein X-Konto gibt.
    const tw = eigen && (mitListe ? kanaele.has(eigen.toLowerCase()) : !x) ? eigen : (x ? xZuTwitch.get(x.toLowerCase()) ?? '' : '');
    if (tw) k.twitch[id] = tw;
    if (p.anzeige) k.namen[id] = p.anzeige;
  }
  for (const r of liste ?? []) {
    const id = String(r?.ID ?? '').toLowerCase();
    if (id && r.COUNTRY && !k.land[id]) k.land[id] = r.COUNTRY;
  }
  // Der gepflegte Hauptname geht vor dem Anzeigenamen aus dem Profil (wie bisher im Werkzeug).
  for (const [id, n] of Object.entries(namen ?? {})) if (n?.haupt) k.namen[id.toLowerCase()] = n.haupt;
  return k;
}

/** Die drei Texte. */
export function ftPosts(e: FtEingabe): FtErgebnis {
  const d = e.clutch ?? {};
  const k = e.konten;
  const klein = (id: string) => id.toLowerCase();
  const name = (id: string) => k.namen[klein(id)] ?? d.namen?.[id] ?? id.slice(0, 8);
  const konto = (id: string) => {
    const i = klein(id);
    if (k.twitch[i]) return `twitch.tv/${k.twitch[i]}`;
    if (k.x[i]) return `@${k.x[i]}`;
    return name(id);
  };
  const wer = (id: string) => [ftFlagge(k.land[klein(id)]), konto(id)].filter(Boolean).join(' ');
  const team = (ids: string[]) => ids.map(wer).join(' + ');

  const ki = 1 + e.spalten.indexOf('killsEcht');
  const spiele = d.spiele ?? {};
  const meiste = Math.max(0, ...Object.values(spiele));
  const minSpiele = e.minSpiele && e.minSpiele > 0 ? e.minSpiele : Math.max(1, Math.round(meiste / 2));
  const spieler = Object.keys(d.schaden ?? {}).map((id) => ({
    id,
    dmg: d.schaden?.[id]?.dmg ?? 0,
    erlitten: d.schaden?.[id]?.erlitten ?? 0,
    spiele: spiele[id] ?? 0,
    elims: ki > 0 ? (e.je[id] ?? []).reduce((a, z) => a + (Number(z[ki]) || 0), 0) : 0,
  }));
  type S = (typeof spieler)[number];
  const ratio = (s: S) => (s.erlitten ? s.dmg / s.erlitten : 0);
  const top = (f: (s: S) => number, n = 10, filt: (s: S) => boolean = () => true) => spieler.filter(filt).sort((a, b) => f(b) - f(a)).slice(0, n);
  const nachElims = (s: S) => s.elims * 1e6 + s.dmg;

  const kopf = `🏆 ${e.titel.trim()}`;
  const dmgText = [kopf, '💥 Most Damage Dealt (Ratio)', '',
    ...top((s) => s.dmg).map((s, i) => `${FT_PLATZ[i]} ${wer(s.id)}: ${ftZahl(s.dmg)} (${ratio(s).toFixed(2)})`)].join('\n');
  const elimText = [kopf, '📊 Most Eliminations (Damage)', '',
    ...top(nachElims).map((s, i) => `${FT_PLATZ[i]} ${wer(s.id)}: ${s.elims} (${ftZahl(s.dmg)})`)].join('\n');

  const teams = [...(e.teams ?? [])].filter((t) => t.ids?.length).sort((a, b) => (a.rang ?? Infinity) - (b.rang ?? Infinity));
  const zeilen = [kopf, '⭐ Best Stats', ''];
  if (teams[0]) zeilen.push(`🥇 Winner: ${team(teams[0].ids)}`);
  const [e1] = top(nachElims, 1); if (e1) zeilen.push(`⚔️ Most Eliminations: ${wer(e1.id)} - ${e1.elims}`);
  const [d1] = top((s) => s.dmg, 1); if (d1) zeilen.push(`💥 Most Dmg Dealt: ${wer(d1.id)} - ${ftZahl(d1.dmg)}`);
  const [r1] = top(ratio, 1, (s) => s.spiele >= minSpiele && s.erlitten > 0); if (r1) zeilen.push(`📊 Best Dmg Ratio: ${wer(r1.id)} - ${ratio(r1).toFixed(2)}`);
  const [g1] = top((s) => s.erlitten, 1); if (g1) zeilen.push(`🛡️ Most Dmg Received: ${wer(g1.id)} - ${ftZahl(g1.erlitten)}`);
  if (teams.length) {
    const meisteSiege = Math.max(...teams.map((t) => t.siege));
    const w = teams.find((t) => t.siege === meisteSiege && meisteSiege > 0);
    if (w) zeilen.push(`👑 Most Wins: ${team(w.ids)} - ${w.siege}`);
    const kpm = teams.filter((t) => t.spiele >= minSpiele && t.spiele > 0).sort((a, b) => b.elims / b.spiele - a.elims / a.spiele)[0];
    if (kpm) zeilen.push(`🎯 Most Kills/Match: ${team(kpm.ids)} - ${(kpm.elims / kpm.spiele).toFixed(1)}`);
  }

  return {
    posts: [
      { art: 'best-stats', titel: 'Best Stats', text: zeilen.join('\n') },
      { art: 'damage', titel: 'Most Damage Dealt (Ratio)', text: dmgText },
      { art: 'elims', titel: 'Most Eliminations (Damage)', text: elimText },
    ],
    stand: { gelesen: d.matches?.length ?? 0, gesamt: typeof d.gesamt === 'number' ? d.gesamt : null, teilweise: !!d.teilweise },
    minSpiele,
    spieler: spieler.length,
  };
}

/**
 * Laenge eines Tweets, wie X sie zaehlt (twitter-text, Gewichtung v3): Adressen 23 Zeichen, Emoji (auch Flaggen und Ziffern-Tasten) 2,
 * lateinische Schrift und gaengige Satzzeichen 1, alles andere 2.
 */
export function tweetLaenge(text: string): number {
  let n = 0;
  const ohneAdressen = text.replace(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:tv|com|gg|net|org|io|de|co|me|ly)(?:\/[^\s)]*)?/gi, () => { n += 23; return ''; });
  const leicht = (c: number) => (c <= 0x10ff) || (c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037);
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
  const teile = Seg ? [...new Seg(undefined, { granularity: 'grapheme' }).segment(ohneAdressen)].map((s) => s.segment) : [...ohneAdressen];
  for (const g of teile) {
    if (/\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(g)) { n += 2; continue; }
    for (const ch of g) n += leicht(ch.codePointAt(0) ?? 0) ? 1 : 2;
  }
  return n;
}
