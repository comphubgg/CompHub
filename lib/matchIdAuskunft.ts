import { liesJson } from '@/lib/ablage';
import { freundesStatus, type FreundStatus } from '@/lib/epicFreundeStatus';

/*
 * Die Antwort des Match-ID-Finders zu einem Twitch-Kanal - dieselbe fuer die Abfrage (app/api/streams/match-id) und den Datenstrom
 * (app/api/streams/match-id/stream). Der Zugang (Admin oder VIP mit Match-ID-Finder) wird vorher in der Route geprueft.
 */

export type MatchIdAntwort = Record<string, unknown> & { matchId: string | null; grund: string | null };

/** Kanal -> Epic-Konto ueber die Spielerprofile (Twitch-Feld). */
export async function epicZuKanal(kanal: string): Promise<string | null> {
  const profile = await liesJson<Record<string, { id?: string; twitch?: string }>>('spieler-profile.json', {}).catch(() => ({} as Record<string, { id?: string; twitch?: string }>));
  return Object.entries(profile).map(([k, v]) => ({ id: (v.id || (/^[0-9a-f]{32}$/i.test(k) ? k : '')).toLowerCase(), tw: (v.twitch ?? '').toLowerCase() }))
    .find((x) => x.id && x.tw === kanal)?.id ?? null;
}

/** Aus dem Status eines Freundes die Antwort machen (genau die Felder der bisherigen Abfrage). */
export function antwortAus(epic: string, f: FreundStatus | null | undefined, verbunden: boolean): MatchIdAntwort {
  if (!f) return { matchId: null, grund: verbunden ? 'kein-freund-oder-offline' : 'nicht-verbunden', epicId: epic };
  return { matchId: f.sessionId, playlist: f.playlist, seit: f.seit, zeile: f.zeile, epicId: epic, grund: f.sessionId ? null : 'nicht-im-game' };
}

export async function matchIdAuskunft(kanal: string): Promise<{ antwort: MatchIdAntwort; epic: string | null }> {
  if (!kanal) return { antwort: { matchId: null, grund: 'kein-kanal' }, epic: null };
  const epic = await epicZuKanal(kanal);
  if (!epic) return { antwort: { matchId: null, grund: 'kein-epic-konto' }, epic: null };
  const { freunde, verbunden } = await freundesStatus().catch(() => ({ freunde: new Map<string, FreundStatus>(), verbunden: false }));
  return { antwort: antwortAus(epic, freunde.get(epic), verbunden), epic };
}
