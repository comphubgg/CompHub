import { liesJson, schreibJson } from '@/lib/ablage';

/*
 * Ein Spieltag, den jemand ansieht und der noch keine Replay-Auswertung hat, bekommt Vorrang (Betreiber, 28.10.2026: "bei Player Stats koennen nicht
 * Team Stats sein ... du kannst auch nicht einfach loeschen"). Die Seite legt eine kleine Anfrage ins Datenarchiv (replay-vorrang/<Fenster>.json); die
 * Replay-Rechner (.github/workflows/replays-nacharbeiten.yml) holen den Ordner vor jedem Durchgang und nehmen diese Spieltage vor allen anderen dran
 * (scripts/replays-holen.mjs). Je Spieltag hoechstens alle sechs Stunden eine neue Anfrage.
 */
const MERKEN_MS = 6 * 3600_000;
const gemerkt = new Map<string, number>();

/*
 * Seit dem 29.10.2026 stoesst die Anfrage auch gleich die Schnellspur an (.github/workflows/replays-schnell.yml): die Nacharbeits-Rechner hatten den Vorrang
 * nie gesehen, und beim Inoxtag Icon Cup EU stand vier Tage nach dem Cup noch "requested". Die Schnellspur liest die Anfragen selbst (replay-vorrang/), der
 * Anstoss sorgt nur dafuer, dass sie gleich laeuft - hoechstens alle dreissig Minuten je Spieltag, solange er ohne Auswertung angesehen wird.
 */
const ANSTOSS_MS = 30 * 60_000;
const angestossen = new Map<string, number>();

async function schnellspurAnstossen(windowId: string): Promise<void> {
  const token = (process.env.GITHUB_TOKEN || process.env.DATEN_TOKEN || '').trim();
  if (!token) return;
  try {
    const r = await fetch('https://api.github.com/repos/comphubgg/CompHub/actions/workflows/replays-schnell.yml/dispatches', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'comphub-replays', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main', inputs: { fenster: windowId } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status !== 204) angestossen.delete(windowId);
  } catch { angestossen.delete(windowId); }
}

export async function vorrangAnfordern(windowId: string, eventId: string | null): Promise<void> {
  const jetzt = Date.now();
  if ((angestossen.get(windowId) ?? 0) < jetzt - ANSTOSS_MS) {
    angestossen.set(windowId, jetzt);
    void schnellspurAnstossen(windowId);
  }
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
