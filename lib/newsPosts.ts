import { liesJson, schreibJson } from '@/lib/ablage';
import { GET as katalogAbruf } from '@/app/api/cup-catalog/route';
import { kernname, ohneZierrat, lateinisch } from '@/lib/homoglyph';

/*
 * Neue Cups für den Kanal #news (Betreiber, 11.10.2026: "#news-Kanal in Discord, Competitive-News mit Grafik im Fortnite-Official-Stil - neue Cups, Power-Ranking-Update usw.").
 *
 * Alle zehn Minuten (Ablauf "Discord live", /api/cron/news) vergleicht dieser Lauf den Katalog mit dem, was schon gemeldet ist (news-verlauf.json). Ein Cup, der neu im
 * Katalog steht, bekommt einen Beitrag: Name, erster Start, Regionen und die Grafik (/api/news-bild: das Vorschaubild, das Epic selbst für den Cup führt, mit Titel darüber).
 * Beim allerersten Lauf wird nur der Bestand vermerkt - sonst käme die ganze Liste auf einmal. Gemeldet wird nichts, was Epic nicht ankündigt.
 */

const SEITE = 'https://www.thecomphub.com';
const VERLAUF = 'news-verlauf.json';

interface KatalogCup { id: string; titel: string; bild?: string | null; farbe?: string; art?: string; naechsterStart: number | null; regionen?: Record<string, unknown[]>; live?: boolean; vorbei?: boolean }
interface Verlauf { gesehen: string[]; start: number; /** Epics Stand der zuletzt gemeldeten Power Rankings. */ ranking?: string }

export interface NewsBeitrag { schluessel: string; titel: string; text: string; url: string; bildUrl: string }

const REGION_NAME: Record<string, string> = { EU: 'Europe', NAC: 'NA Central', NAW: 'NA West', BR: 'Brazil', ASIA: 'Asia', ME: 'Middle East', OCE: 'Oceania' };

const datum = (ms: number) => new Date(ms).toLocaleString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' UTC';

/** Die neuen Cups seit dem letzten Lauf - und vermerkt sie als gemeldet. Beim ersten Lauf: leer. */
export async function neueCupsFuerNews(max = 3): Promise<NewsBeitrag[]> {
  let katalog: { cups?: KatalogCup[] } = {};
  try { katalog = await (await katalogAbruf(new Request(`${SEITE}/api/cup-catalog?modus=standard`))).json(); } catch { return []; }
  // Antwortet die Ablage nicht, kommt kein Katalog - dann nichts vermerken (sonst wäre alles "neu" oder "gesehen").
  if (!Array.isArray(katalog.cups) || !katalog.cups.length) return [];

  const verlauf = await liesJson<Verlauf | null>(VERLAUF, null);
  const jetzt = Array.isArray(katalog.cups) ? katalog.cups : [];
  if (!verlauf) {
    await schreibJson(VERLAUF, { gesehen: jetzt.map((c) => c.id), start: Date.now() } satisfies Verlauf);
    return [];
  }
  const bekannt = new Set(verlauf.gesehen);
  const neu = jetzt.filter((c) => !bekannt.has(c.id) && !c.vorbei && c.naechsterStart && c.naechsterStart > Date.now() - 6 * 3_600_000).slice(0, max);
  // Alles Neue als gesehen vermerken - auch das, was nicht gemeldet wird (ein altes Archiv-Fenster, das plötzlich im Katalog auftaucht).
  const alleNeuen = jetzt.filter((c) => !bekannt.has(c.id)).map((c) => c.id);
  if (alleNeuen.length) await schreibJson(VERLAUF, { ...verlauf, gesehen: [...verlauf.gesehen, ...alleNeuen].slice(-2000) } satisfies Verlauf);

  return neu.map((c) => {
    const regionen = Object.keys(c.regionen ?? {}).map((r) => REGION_NAME[r] ?? r);
    const bild = c.bild ? (c.bild.startsWith('http') ? c.bild : `${SEITE}${c.bild}`) : '';
    const zeile = `${c.naechsterStart ? `First start: ${datum(c.naechsterStart)}` : ''}${regionen.length ? ` · ${regionen.join(', ')}` : ''}`;
    return {
      schluessel: `news:${c.id}`, titel: c.titel,
      text: `New on the schedule: **${c.titel}**.\n${zeile}\nLeaderboards, maps and stats as soon as it starts: ${SEITE}/events/${encodeURIComponent(c.id)}`,
      url: `${SEITE}/events/${encodeURIComponent(c.id)}`,
      // Mit dem offiziellen Vorschaubild des Cups wird genau das gesendet (Betreiber, 26.10.2026: "da muessen echte Grafiken sein, das offizielle Bild"); nur ohne eines entsteht die eigene Karte.
      bildUrl: bild ? bild : `${SEITE}/api/news-bild?bild=${encodeURIComponent(bild)}&titel=${encodeURIComponent(c.titel)}&zeile=${encodeURIComponent(zeile.slice(0, 90))}&farbe=${encodeURIComponent((c.farbe ?? '#38bdf8').replace('#', ''))}`,
    };
  });
}

/*
 * Power-Ranking-Update (Aufgabe 118: "#news ... neue Cups, Power-Ranking-Update usw."): rechnet Epic die weltweite Rangliste neu (power-rankings/global.json,
 * "epicStand"), kommt ein Beitrag mit den ersten fuenf und dem groessten Aufsteiger unter den ersten hundert. Beim ersten Lauf wird nur der Stand vermerkt.
 */
interface PrSpieler { rank: number; name: string; land?: string; wertung: number; deltaPlatz?: number }
const flagge = (land?: string) => (land && /^[a-z]{2}$/i.test(land) ? String.fromCodePoint(...land.toUpperCase().split('').map((z) => 127397 + z.charCodeAt(0))) : '');
const prName = (n: string) => lateinisch(ohneZierrat(kernname(n)).trim() || n).toUpperCase();

export async function rankingFuerNews(): Promise<NewsBeitrag | null> {
  const pr = await liesJson<{ spieler?: PrSpieler[]; epicStand?: string | number } | null>('power-rankings/global.json', null);
  if (!pr?.spieler?.length || !pr.epicStand) return null;
  const verlauf = await liesJson<Verlauf | null>(VERLAUF, null);
  if (!verlauf) return null;
  const stand = String(pr.epicStand);
  if (verlauf.ranking === stand) return null;
  await schreibJson(VERLAUF, { ...verlauf, ranking: stand } satisfies Verlauf);
  if (!verlauf.ranking) return null;
  const top = pr.spieler.slice(0, 5);
  const pfeil = (d?: number) => (d && d > 0 ? ` ▲${d}` : d && d < 0 ? ` ▼${-d}` : '');
  const kletterer = pr.spieler.slice(0, 100).filter((s) => (s.deltaPlatz ?? 0) > 0).sort((a, b) => (b.deltaPlatz ?? 0) - (a.deltaPlatz ?? 0))[0];
  const zeile = `#1 ${prName(top[0].name)} · ${top[0].wertung.toLocaleString('en-US')} pts`;
  return {
    schluessel: `ranking:${stand}`, titel: 'Power Rankings update',
    text: `**Power Rankings updated** 📈\n${top.map((s) => `${s.rank}. ${flagge(s.land)} ${prName(s.name)} - ${s.wertung.toLocaleString('en-US')}${pfeil(s.deltaPlatz)}`).join('\n')}${kletterer ? `\n\nBiggest climber in the top 100: ${flagge(kletterer.land)} ${prName(kletterer.name)} (▲${kletterer.deltaPlatz} to #${kletterer.rank})` : ''}\nFull ranking: ${SEITE}/power-rankings`,
    url: `${SEITE}/power-rankings`,
    bildUrl: `${SEITE}/api/news-bild?titel=${encodeURIComponent('Power Rankings')}&zeile=${encodeURIComponent(zeile.slice(0, 90))}&farbe=38bdf8`,
  };
}
