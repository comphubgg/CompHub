import { GET as katalogAbruf } from '@/app/api/cup-catalog/route';
import { GET as bestenlisteAbruf } from '@/app/api/cup-leaderboard/route';
import { GET as rosterAbruf } from '@/app/api/cup-roster/route';
import { kernname, ohneZierrat } from '@/lib/homoglyph';
import { spielerbildKlein } from '@/lib/spielerbildKlein';
import { sprechbar, aussprachePaare, setzeAussprachen } from '@/lib/aussprache';
import { zahlWort } from '@/lib/tiktokAnfrage';
import { kumulativeTage, tagNummer } from '@/lib/kumulativ';
import { profilKarte, type KatalogCup, type KatalogFenster } from '@/lib/ergebnisPosts';
import { holeKatalog, regionAus, wertungVon, punkteFuerRunde } from '@/lib/cupWertung';
import type { TiktokDaten, TiktokZeile } from '@/lib/tiktokDaten';

/*
 * Das Prognose-Video nach Tag 1 eines mehrtaegigen Finales (Aufgabe 164, Betreiber 27.10.2026: "ein Day-2-Prediction-Video, bis zwei Minuten, mit Begruendung des
 * Rankings").
 *
 * Wer gewinnt das Turnier? Gerechnet wird nur mit dem, was an den gespielten Tagen geschah - Epics Bestenliste mit jedem Spiel (Platz, Eliminierungen) und Epics
 * Punktewertung des Cups:
 *
 *   Form je Spieler   die Punkte je Spiel OHNE sein bestes Spiel (ein einzelner Sieg traegt nicht ueber den zweiten Tag; wer konstant punktet, schon)
 *   Hochrechnung      Punkte bisher + Spiele des naechsten Tages x Form
 *
 * Die fuenf mit der hoechsten Hochrechnung kommen ins Video, je mit Begruendung aus ihren echten Zahlen (Platz nach dem Tag, Siege, Top-10-Platzierungen,
 * Eliminierungen, Form). Es ist eine Hochrechnung und heisst im Video auch so - kein Ergebnis.
 *
 * Von selbst entsteht sie fuer Europa, sobald das Video zu Tag 1 fertig ist und Tag 2 noch nicht begonnen hat (Kennung "<Tag-1-Fenster>#prognose" in "ohne");
 * bestellt (/admin/tiktok: vorlage=prognose&region=...) fuer jede Region.
 */

const SEITE = 'https://www.thecomphub.com';
const STUNDEN = 20;
const MONATE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const REGION_GESPROCHEN: Record<string, string> = { EU: 'Europe', NAC: 'N A Central', NAW: 'N A West', BR: 'Brazil', ASIA: 'Asia', ME: 'the Middle East', OCE: 'Oceania' };

interface Spiel { placement?: number | null; elims?: number; endTime?: string }
interface Eintrag { rank: number; points: number; elims?: number; players?: Array<{ id?: string; name: string }>; matches?: Spiel[] }
interface Roster { teams?: Array<{ spieler: Array<{ id: string; img: string | null }> }> }

/** "first", "second", "twenty-third" - fuer die Stimme. */
export function ordnungWort(n: number): string {
  const besonders: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 5: 'fifth', 8: 'eighth', 9: 'ninth', 12: 'twelfth' };
  if (besonders[n]) return besonders[n];
  if (n > 20 && n < 100 && n % 10) return `${zahlWort(n - (n % 10))}-${ordnungWort(n % 10)}`;
  const w = zahlWort(n);
  return w.endsWith('y') ? `${w.slice(0, -1)}ieth` : `${w}th`;
}
const gross = (s: string) => `${s[0]?.toUpperCase() ?? ''}${s.slice(1)}`;

interface Kandidat { cup: KatalogCup; region: string; tag: KatalogFenster; bisher: KatalogFenster[]; naechster: KatalogFenster }

/** Welcher Tag eine Prognose bekommt: der letzte gespielte Tag einer mehrtaegigen Gruppe, deren naechster Tag noch nicht begonnen hat. */
function kandidaten(cups: KatalogCup[], opt: { ohne?: string[]; nur?: string; region?: string; pruefen?: boolean }): Kandidat[] {
  const jetzt = Date.now();
  const raus: Kandidat[] = [];
  for (const cup of cups) {
    if (cup.art !== 'championship' && cup.art !== 'division') continue;
    for (const [region, fenster] of Object.entries(cup.regionen ?? {})) {
      const tage = kumulativeTage(fenster.map((f) => ({ ...f, istFinale: f.istFinale ?? /final/i.test(f.windowId) })));
      for (let i = 0; i < tage.length - 1; i += 1) {
        const tag = tage[i]; const naechster = tage[i + 1];
        // pruefen: auch ein schon gespielter naechster Tag - so laesst sich die Hochrechnung am echten Ergebnis messen (nur mit "nur")
        if (tag.status !== 'vorbei' || (naechster.status === 'vorbei' && !(opt.pruefen && opt.nur)) || !tag.end) continue;
        if (opt.nur) { if (tag.windowId !== opt.nur) continue; } else if (opt.region) { if (region !== opt.region) continue; } else {
          // Von selbst: nur Europa, erst nach dem Video zum Tag, hoechstens 20 Stunden danach, und nur, solange der naechste Tag nicht laeuft.
          if (region !== 'EU' || tag.end > jetzt - 30 * 60_000 || tag.end < jetzt - STUNDEN * 3_600_000) continue;
          if (naechster.status === 'laeuft' || naechster.status === 'live') continue;
          if (!opt.ohne?.includes(tag.windowId) || opt.ohne.includes(`${tag.windowId}#prognose`)) continue;
        }
        raus.push({ cup, region, tag, bisher: tage.slice(0, i + 1), naechster });
      }
    }
  }
  return raus.sort((a, b) => (b.tag.end ?? 0) - (a.tag.end ?? 0));
}

export async function tagZweiPrognose(opt: { ohne?: string[]; nur?: string; region?: string; pruefen?: boolean } = {}): Promise<TiktokDaten> {
  let katalog: { cups?: KatalogCup[] } = {};
  try { katalog = await (await katalogAbruf(new Request(`${SEITE}/api/cup-catalog?modus=standard`))).json(); } catch { throw new Error('Katalog nicht erreichbar'); }
  if (!Array.isArray(katalog.cups)) throw new Error('Katalog nicht erreichbar');
  const k = kandidaten(katalog.cups, opt)[0];
  if (!k) return { keinCup: true, grund: opt.nur || opt.region ? 'Gerade gibt es kein mehrtaegiges Finale, dessen naechster Tag noch kommt' : 'Kein Finaltag, nach dem eine Prognose faellig ist' };

  const tagNr = tagNummer(k.tag.windowId);
  const fensterListe = k.bisher.map((x) => x.windowId);
  const abfrage = fensterListe.length > 1 ? `windows=${fensterListe.map(encodeURIComponent).join(',')}` : `window=${encodeURIComponent(k.tag.windowId)}`;
  const lb = await (await bestenlisteAbruf(new Request(`${SEITE}/api/cup-leaderboard?event=${encodeURIComponent(k.tag.eventId)}&${abfrage}`))).json() as { entries?: Eintrag[] };
  const feld = (lb.entries ?? []).slice(0, 40);
  if (feld.length < 10) return { keinCup: true, grund: 'Zu wenige Plaetze in der Bestenliste' };

  // Punkte je Spiel nach Epics Wertung des Cups; ohne Wertung der Schnitt aus den Gesamtpunkten.
  let wertung: ReturnType<typeof wertungVon> = [];
  try { wertung = wertungVon(await holeKatalog(regionAus(k.naechster.windowId)), k.naechster.windowId, k.naechster.eventId); } catch { /* ohne Wertung */ }
  if (!wertung.length) { try { wertung = wertungVon(await holeKatalog(regionAus(k.tag.windowId)), k.tag.windowId, k.tag.eventId); } catch { /* ohne Wertung */ } }

  // Wie viele Spiele ein Tag hat: die haeufigste Zahl unter den Besten, durch die Zahl der Tage.
  const zaehl = new Map<number, number>();
  for (const e of feld.slice(0, 30)) { const n = (e.matches ?? []).length; zaehl.set(n, (zaehl.get(n) ?? 0) + 1); }
  const spieleBisher = [...zaehl.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const spieleJeTag = Math.max(1, Math.round(spieleBisher / k.bisher.length));

  const gerechnet = feld.map((e) => {
    const spiele = [...(e.matches ?? [])].sort((a, b) => (Date.parse(a.endTime ?? '') || 0) - (Date.parse(b.endTime ?? '') || 0));
    const je = spiele.map((m) => punkteFuerRunde(wertung, m.placement ?? null, m.elims ?? 0));
    const vollstaendig = je.length > 0 && je.every((x): x is number => typeof x === 'number');
    const schnitt = spiele.length ? e.points / spiele.length : 0;
    const bestes = vollstaendig ? Math.max(...(je as number[])) : null;
    // Ohne das beste Spiel - wo die Wertung fehlt oder zu wenige Spiele gespielt sind, der einfache Schnitt.
    const form = vollstaendig && spiele.length >= 3 ? (e.points - (bestes as number)) / (spiele.length - 1) : schnitt;
    const siege = spiele.map((m, j) => (m.placement === 1 ? j + 1 : 0)).filter((n) => n > 0);
    const top10 = spiele.filter((m) => (m.placement ?? 99) <= 10).length;
    const elims = typeof e.elims === 'number' ? e.elims : spiele.reduce((s, m) => s + (m.elims ?? 0), 0);
    const plaetze = spiele.map((m) => m.placement).filter((p): p is number => typeof p === 'number');
    const schnittPlatz = plaetze.length ? plaetze.reduce((a, b) => a + b, 0) / plaetze.length : null;
    return { e, spiele: spiele.length, form, schnitt, bestes, siege, top10, elims, schnittPlatz, hoch: Math.round(e.points + spieleJeTag * form) };
  });
  const prognose = [...gerechnet].sort((a, b) => b.hoch - a.hoch || a.e.rank - b.e.rank).slice(0, 5);
  const fuehrend = feld[0];

  // Namen, Flaggen, Fotos wie im Tagesvideo.
  const karte = await profilKarte();
  setzeAussprachen([...karte.profile.values()].flatMap((p) => (p.aussprache ? [[ohneZierrat(kernname(p.anzeige || p.name || '')), p.aussprache] as [string, string]] : [])));
  const bild = new Map<string, string>();
  try {
    const ro = await (await rosterAbruf(new Request(`${SEITE}/api/cup-roster?event=${encodeURIComponent(k.tag.eventId)}&window=${encodeURIComponent(k.tag.windowId)}&limit=40`))).json() as Roster;
    for (const t of ro.teams ?? []) for (const s of t.spieler) if (s.img) bild.set(s.id.toLowerCase(), s.img);
  } catch { /* ohne Fotos die Silhouette */ }
  const tagWort = k.bisher.length > 1 ? `day ${zahlWort(tagNr)}` : 'day one';
  const tagKurz = k.bisher.length > 1 ? `DAY 1-${tagNr}` : 'DAY 1';

  const zeilen: TiktokZeile[] = prognose.map((g, i) => {
    const rang = i + 1;
    const spieler = g.e.players ?? [];
    const namen = spieler.map((p) => {
      const id = (p.id ?? '').toLowerCase();
      const pr = karte.profile.get(id); const sz = karte.szene.get(id);
      return (ohneZierrat(kernname(pr?.anzeige || pr?.name || sz?.name || p.name)).trim() || p.name).toUpperCase();
    });
    const laender = spieler.map((p) => karte.profile.get((p.id ?? '').toLowerCase())?.land || karte.szene.get((p.id ?? '').toLowerCase())?.land || '');
    const fotos = spieler.map((p) => {
      const img = bild.get((p.id ?? '').toLowerCase());
      return img ? `${SEITE}${spielerbildKlein(decodeURIComponent(img.replace(/^\/spielerbilder\//, '')))}` : null;
    });
    const wer = namen.map(sprechbar).join(' and ');
    const saetze: string[] = [];
    saetze.push(rang === 1 ? `Our pick to win it all. ${wer}.` : `Number ${zahlWort(rang)}. ${wer}.`);
    const abstand = fuehrend.points - g.e.points;
    const vorsprung = feld[1] ? g.e.points - feld[1].points : 0;
    saetze.push(g.e.rank === 1
      ? `Leads after ${tagWort} with ${zahlWort(g.e.points)} points${vorsprung > 0 ? `, ${zahlWort(vorsprung)} clear of second` : ''}.`
      :`Sits ${ordnungWort(g.e.rank)} after ${tagWort} with ${zahlWort(g.e.points)} points, ${zahlWort(abstand)} behind the lead.`);
    if (g.siege.length) saetze.push(`${g.siege.length === 1 ? 'A win' : `${gross(zahlWort(g.siege.length))} wins`} already, in game ${g.siege.map((n) => zahlWort(n)).join(' and game ')}.`);
    if (g.spiele) saetze.push(`${gross(zahlWort(g.top10))} top ten finish${g.top10 === 1 ? '' : 'es'} in ${zahlWort(g.spiele)} games, ${zahlWort(g.elims)} elimination${g.elims === 1 ? '' : 's'}.`);
    if (g.bestes !== null && g.spiele >= 3) {
      saetze.push(`Take away the best game and it is still ${zahlWort(Math.round(g.form))} points a game.`);
    } else saetze.push(`That is ${zahlWort(Math.round(g.schnitt))} points a game.`);
    // Wer in der Hochrechnung steigt oder faellt - und warum.
    if (g.e.rank > rang) saetze.push(`That form lifts ${spieler.length > 1 ? 'them' : 'this player'} from ${ordnungWort(g.e.rank)} to ${ordnungWort(rang)}.`);
    else if (g.e.rank < rang && g.bestes !== null) saetze.push(`${gross(zahlWort(Math.round(g.bestes)))} of the points came from one game, so the projection drops to ${ordnungWort(rang)}.`);
    saetze.push(`Projected finish: ${zahlWort(g.hoch)} points.`);
    const beschreibung = [
      `${tagKurz} #${g.e.rank} · ${g.e.points} pts`,
      g.siege.length ? `${g.siege.length} win${g.siege.length === 1 ? '' : 's'}` : `${g.top10} top 10s`,
      `${g.form.toFixed(1)} pts/game form`,
    ].join(' · ');
    return {
      rang, namen, gesprochen: wer, aussprache: aussprachePaare(namen), punkte: g.hoch, laender, fotos,
      wertText: g.hoch.toLocaleString('en-US'), einheit: 'PROJECTED', beschreibung, satz: saetze.join(' '),
      untertitel: g.schnittPlatz !== null ? `AVG PLACE ${g.schnittPlatz.toFixed(1)} · ${g.elims} ELIMS` : `${g.elims} ELIMS`,
      pkt: g.e.points, elims: g.elims, siegSpiele: g.siege,
    } as TiktokZeile;
  });

  const cupName = (k.cup.titel ?? '').replace(/\s+/g, ' ').trim();
  const regionWort = REGION_GESPROCHEN[k.region] ?? k.region;
  const naechsterNr = tagNummer(k.naechster.windowId);
  const d = new Date(k.tag.end ?? Date.now());
  const hashtags = '#Fortnite #FNCS #FortniteCompetitive #CompHub';
  return {
    vorlage: 'prognose',
    eventId: k.tag.eventId,
    // Eigene Kennung: das Video zum Tag hat die Kennung des Fensters, die Prognose dazu "#prognose" - so kennt der Ablauf beide.
    windowId: `${k.tag.windowId}#prognose`,
    titel: `${cupName} · Day ${naechsterNr} Prediction`,
    cupName, spieltag: `Day ${naechsterNr} Prediction`, stufe: 'Finals', marken: [`Day ${naechsterNr}`, 'Prediction', 'Finals'], region: k.region, finale: true,
    datum: `${d.getUTCDate()} ${MONATE[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    seite: `${SEITE}/events/${encodeURIComponent(k.cup.id)}`,
    chip: 'Prediction', brettMarke: 'Projected',
    introSatz: `${cupName.replace(/[^A-Za-z0-9 .,&-]/g, ' ')}, ${regionWort}. Day ${zahlWort(naechsterNr)} prediction. Who wins it all? Here is our top five, projected from ${tagWort} form: points per game without each player's best game, times the ${zahlWort(spieleJeTag)} games still to play.`,
    outroSatz: 'A projection from real day one numbers, not a result. Live standings, maps and stats on the comp hub dot com.',
    text: `${cupName} ${k.region} - Day ${naechsterNr} prediction 🔮\n\nProjected from ${tagKurz.toLowerCase()} form (points per game without each player's best game x ${spieleJeTag} games to play):\n${zeilen.map((z) => `${z.rang}. ${z.namen.join(' & ')} - ${z.wertText} pts projected (${z.beschreibung})`).join('\n')}\n\nWho is your pick? Live standings on thecomphub.com\n${hashtags}`,
    dateiName: `prognose-${k.region.toLowerCase()}-day${naechsterNr}`,
    zeilen,
  } as TiktokDaten;
}
