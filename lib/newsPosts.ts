import { liesJson, schreibJson } from '@/lib/ablage';
import { GET as katalogAbruf } from '@/app/api/cup-catalog/route';

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
interface Verlauf { gesehen: string[]; start: number }

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
  if (alleNeuen.length) await schreibJson(VERLAUF, { gesehen: [...verlauf.gesehen, ...alleNeuen].slice(-2000), start: verlauf.start } satisfies Verlauf);

  return neu.map((c) => {
    const regionen = Object.keys(c.regionen ?? {}).map((r) => REGION_NAME[r] ?? r);
    const bild = c.bild ? (c.bild.startsWith('http') ? c.bild : `${SEITE}${c.bild}`) : '';
    const zeile = `${c.naechsterStart ? `First start: ${datum(c.naechsterStart)}` : ''}${regionen.length ? ` · ${regionen.join(', ')}` : ''}`;
    return {
      schluessel: `news:${c.id}`, titel: c.titel,
      text: `New on the schedule: **${c.titel}**.\n${zeile}\nLeaderboards, maps and stats as soon as it starts: ${SEITE}/events/${encodeURIComponent(c.id)}`,
      url: `${SEITE}/events/${encodeURIComponent(c.id)}`,
      bildUrl: `${SEITE}/api/news-bild?bild=${encodeURIComponent(bild)}&titel=${encodeURIComponent(c.titel)}&zeile=${encodeURIComponent(zeile.slice(0, 90))}&farbe=${encodeURIComponent((c.farbe ?? '#38bdf8').replace('#', ''))}`,
    };
  });
}
