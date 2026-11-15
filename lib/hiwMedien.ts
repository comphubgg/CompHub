/*
 * Die Videos der Seite /how-it-works: welche Dateien es gibt und wo sie liegen (Release "medien", ausgeliefert ueber app/media/[datei]/route.ts).
 * Liegt eine Datei (noch) nicht am Release, zeigt die Seite an ihrer Stelle nichts (verfuegbareMedien).
 */

const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';

export const MEDIEN: Record<string, string> = {
  'hiw-stats-agent.mp4': 'video/mp4',
  'hiw-stats-agent.jpg': 'image/jpeg',
  'hiw-match-replays.mp4': 'video/mp4',
  'hiw-match-replays.jpg': 'image/jpeg',
  'hiw-prediction.mp4': 'video/mp4',
  'hiw-prediction.jpg': 'image/jpeg',
};

export function medienQuelle(datei: string) {
  return `https://github.com/${REPO}/releases/download/medien/${encodeURIComponent(datei)}`;
}

/** Welche Videos samt Vorschaubild am Release liegen - je zehn Minuten neu gefragt. Ohne Antwort: keines (die Seite zeigt dann keine Videos). */
export async function verfuegbareMedien(namen: string[]): Promise<string[]> {
  const da = await Promise.all(namen.map(async (n) => {
    const ok = async (datei: string) => {
      try {
        const r = await fetch(medienQuelle(datei), { method: 'HEAD', redirect: 'follow', next: { revalidate: 600 }, signal: AbortSignal.timeout(8_000) });
        return r.ok;
      } catch { return false; }
    };
    return (await ok(`${n}.mp4`)) && (await ok(`${n}.jpg`)) ? n : null;
  }));
  return da.filter((n): n is string => n !== null);
}
