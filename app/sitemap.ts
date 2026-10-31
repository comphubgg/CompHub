import type { MetadataRoute } from 'next';

// Die Seitenkarte fuer Suchmaschinen.
//
// Nur die oeffentlichen Seiten. Der Admin-Bereich, das eigene Konto und die
// Anmeldung stehen bewusst nicht darin - sie haben in keiner Trefferliste
// etwas verloren.
//
// "priority" ist ein Hinweis, kein Befehl: Google gewichtet laengst nach
// eigenen Regeln. Die Startseite steht trotzdem oben, weil sie das ist,
// wonach jemand sucht, der "CompHub" eingibt.

/*
 * Alle sechs Stunden neu (vorher einmal beim Bauen, fest): dazu kommen die Profile der bekanntesten Spieler und alle Cup-Seiten, damit
 * Google Seiten wie "Peterbot earnings" findet. Beides kommt aus den fertigen Antworten der Seite selbst; ist eine nicht erreichbar,
 * bleiben die festen Seiten - nie eine leere oder ausgedachte Liste.
 */
export const revalidate = 21600;

function wurzel() {
  return (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
    .trim().replace(/\/+$/, '');
}

async function holeJson<T>(adresse: string): Promise<T | null> {
  try {
    const r = await fetch(adresse, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    return r.ok ? await r.json() as T : null;
  } catch {
    return null;
  }
}

/** Die Spieler aus den Bestenlisten "alle Zeit" (je Liste bis 200 Plätze), ohne Doppelte, in der Reihenfolge der Listen. */
async function spielerSeiten(w: string): Promise<string[]> {
  const d = await holeJson<{ listen?: Array<{ plaetze?: Array<{ epicId?: string }> }> }>(
    `${w}/api/szene-stats?ansicht=jahr&jahr=alle`);
  const ids = new Set<string>();
  for (const l of d?.listen ?? []) {
    for (const p of l.plaetze ?? []) if (p.epicId && /^[0-9a-f]{32}$/i.test(p.epicId)) ids.add(p.epicId);
  }
  return [...ids].map((id) => `/statistics?spieler=${id}`);
}

async function cupSeiten(w: string): Promise<string[]> {
  const d = await holeJson<{ cups?: Array<{ id?: string }> }>(`${w}/api/cup-catalog?modus=alle`);
  return (d?.cups ?? []).map((c) => c.id).filter((id): id is string => Boolean(id))
    .map((id) => `/events/${encodeURIComponent(id)}`);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const w = wurzel();
  const jetzt = new Date();

  const seiten: Array<[string, number, MetadataRoute.Sitemap[0]['changeFrequency']]> = [
    ['', 1, 'weekly'],
    ['/statistics', 0.9, 'daily'],
    ['/events', 0.8, 'daily'],
    ['/power-rankings', 0.8, 'daily'],
    ['/tierlist', 0.6, 'weekly'],
    ['/streams', 0.5, 'weekly'],
    ['/overlays', 0.4, 'monthly'],
    ['/tournament-maps', 0.5, 'weekly'],
    ['/fncs', 0.5, 'weekly'],
    ['/replays', 0.6, 'daily'],
    ['/privacy', 0.2, 'yearly'],
    ['/terms', 0.2, 'yearly'],
  ];

  const [spieler, cups] = await Promise.all([spielerSeiten(w), cupSeiten(w)]);
  return [
    ...seiten.map(([pfad, priority, changeFrequency]) => ({
      url: `${w}${pfad}`,
      lastModified: jetzt,
      changeFrequency,
      priority,
    })),
    ...spieler.map((pfad) => ({ url: `${w}${pfad}`, lastModified: jetzt, changeFrequency: 'daily' as const, priority: 0.5 })),
    ...cups.map((pfad) => ({ url: `${w}${pfad}`, lastModified: jetzt, changeFrequency: 'weekly' as const, priority: 0.4 })),
  ];
}
