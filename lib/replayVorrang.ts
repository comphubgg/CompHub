import { liesJson, schreibJson } from '@/lib/ablage';

/*
 * Ein Spieltag, den jemand ansieht und der noch keine Replay-Auswertung hat, bekommt Vorrang (Betreiber, 28.10.2026: "bei Player Stats koennen nicht
 * Team Stats sein ... du kannst auch nicht einfach loeschen"). Die Seite legt eine kleine Anfrage ins Datenarchiv (replay-vorrang/<Fenster>.json); die
 * Replay-Rechner (.github/workflows/replays-nacharbeiten.yml) holen den Ordner vor jedem Durchgang und nehmen diese Spieltage vor allen anderen dran
 * (scripts/replays-holen.mjs). Je Spieltag hoechstens alle sechs Stunden eine neue Anfrage.
 */
const MERKEN_MS = 6 * 3600_000;
const gemerkt = new Map<string, number>();

export async function vorrangAnfordern(windowId: string, eventId: string | null): Promise<void> {
  const jetzt = Date.now();
  if ((gemerkt.get(windowId) ?? 0) > jetzt - MERKEN_MS) return;
  gemerkt.set(windowId, jetzt);
  try {
    const da = await liesJson<{ zeit?: number } | null>(`replay-vorrang/${windowId}.json`, null);
    if (da?.zeit && da.zeit > jetzt - MERKEN_MS) return;
    await schreibJson(`replay-vorrang/${windowId}.json`, { windowId, eventId, zeit: jetzt });
  } catch {
    // Beim naechsten Aufruf noch einmal - ein Aussetzer des Archivs haelt die Seite nicht auf.
    gemerkt.delete(windowId);
  }
}

/** Wie weit die Auswertung eines Spieltags ist - aus dem Zustand des Sammlers; null, wenn er noch nicht begonnen hat. */
export async function auswertungsStand(saison: string, windowId: string): Promise<{ ausgewertet: number; gesamt: number } | null> {
  try {
    const z = await liesJson<{ matches?: Record<string, { stand?: string }> } | null>(`replays/${saison}/${windowId}/_zustand.json`, null);
    const alle = Object.values(z?.matches ?? {});
    if (!alle.length) return null;
    return { ausgewertet: alle.filter((m) => m.stand === 'PARSED').length, gesamt: alle.length };
  } catch { return null; }
}
