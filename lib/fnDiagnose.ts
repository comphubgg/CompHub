/*
 * VORUEBERGEHEND (28.11.2026) - wird mit dem letzten Commit dieser Arbeit wieder entfernt.
 *
 * Epics Entdecken-Dienst ist aus der Entwicklungsumgebung nicht erreichbar, nur vom Server der Seite. Der erste Stand von /api/fn-entdecken kam mit
 * 200 und leerer Liste zurueck. Diese Auskunft zeigt, was der Dienst auf die festen Anfragen der Route (und ein paar Abwandlungen des Anfragetexts)
 * antwortet - als Gerippe: Schluessel, Anzahlen, das erste Element. Keine frei waehlbaren Adressen, kein Zugang, hoechstens einmal je Minute.
 */

import { getToken } from '@/lib/epicCups';
import { epicAbruf, mitSpeicher } from '@/lib/fnEpic';
import { ENTDECKEN, fassung, marke } from '@/lib/fnEntdecken';

function gerippe(w: unknown, tiefe = 0): unknown {
  if (Array.isArray(w)) return w.length ? [gerippe(w[0], tiefe + 1), `... ${w.length} insgesamt`] : [];
  if (w && typeof w === 'object') {
    if (tiefe > 6) return '{...}';
    return Object.fromEntries(Object.entries(w).slice(0, 40).map(([k, v]) => [k, gerippe(v, tiefe + 1)]));
  }
  if (typeof w === 'string') return w.length > 70 ? `${w.slice(0, 70)}...` : w;
  return w;
}

interface Reihe { panelName?: string; panelType?: string; firstPage?: { results?: Array<{ linkCode?: string; globalCCU?: number }>; hasMore?: boolean } }

function kurz(a: { status: number; daten: unknown; text: string }) {
  const d = a.daten as { panels?: Reihe[]; results?: unknown[] } | null;
  const panels = Array.isArray(d?.panels) ? d!.panels! : null;
  return {
    status: a.status,
    schluessel: d && typeof d === 'object' ? Object.keys(d) : a.text.slice(0, 200),
    panels: panels?.length ?? null,
    treffer: panels ? panels.reduce((n, p) => n + (p.firstPage?.results?.length ?? 0), 0) : (Array.isArray(d?.results) ? d!.results!.length : null),
    reihen: panels?.slice(0, 60).map((p) => `${p.panelName}|${p.panelType}|${p.firstPage?.results?.length ?? '-'}|${p.firstPage?.hasMore ? 'mehr' : ''}|${
      (p.firstPage?.results ?? []).slice(0, 3).map((t) => `${t.linkCode}=${t.globalCCU}`).join(',')}`),
  };
}

export function diagnose(): Promise<unknown> {
  return mitSpeicher('entdecken|diagnose', 60_000, async () => {
    const aus: Record<string, unknown> = {};
    const f = await fassung();
    aus.fassung = f;
    const { accountId } = await getToken();
    const kopf = { 'X-Epic-Access-Token': await marke(f), 'User-Agent': f.agent };
    aus.marke = true;
    const strom = `?appId=Fortnite&stream=${encodeURIComponent(f.zweig)}`;
    const wer = { playerId: accountId, partyMemberIds: [accountId], locale: 'en', matchmakingRegion: 'EU', platform: 'Windows', isCabined: false, numLocalPlayers: 1 };
    const versuch = async (name: string, adresse: string, body: unknown, k: Record<string, string> = kopf, voll = false) => {
      try {
        const a = await epicAbruf(adresse, { body, kopf: k, ms: 20_000 });
        aus[name] = voll ? { ...kurz(a), gerippe: gerippe(a.daten) } : kurz(a);
      } catch (e) { aus[name] = { fehler: (e as Error).message }; }
    };
    const flaeche = `${ENTDECKEN}/CreativeDiscoverySurface_Frontend`;
    await versuch('usk12', `${flaeche}${strom}`, { ...wer, accountLevel: 100, battlepassLevel: 1, ratingAuthority: 'USK', rating: 'USK_AGE_12' }, kopf, true);
    await versuch('esrbT', `${flaeche}${strom}`, { ...wer, accountLevel: 100, battlepassLevel: 1, ratingAuthority: 'ESRB', rating: 'ESRB_T' });
    await versuch('ohneRating', `${flaeche}${strom}`, { ...wer, accountLevel: 100, battlepassLevel: 1 });
    await versuch('leer', `${flaeche}${strom}`, {});
    await versuch('ohneStrom', `${flaeche}?appId=Fortnite`, { ...wer, ratingAuthority: 'USK', rating: 'USK_AGE_12' });
    await versuch('ohneMarke', `${flaeche}${strom}`, { ...wer, ratingAuthority: 'USK', rating: 'USK_AGE_12' }, { 'User-Agent': f.agent });
    await versuch('browse', `${ENTDECKEN}/CreativeDiscoverySurface_Browse${strom}`, { ...wer, ratingAuthority: 'USK', rating: 'USK_AGE_12' });
    await versuch('epicSeite', `${ENTDECKEN}/CreativeDiscoverySurface_EpicPage${strom}`, { ...wer, ratingAuthority: 'USK', rating: 'USK_AGE_12' });
    await versuch('seite0', `${flaeche}/page${strom}`, { ...wer, ratingAuthority: 'USK', rating: 'USK_AGE_12', testVariantName: 'Baseline', panelName: 'Featured', pageIndex: 0 }, kopf, true);
    await versuch('eintraege', `${ENTDECKEN.replace('/surface', '')}/link-entries`, { linkCodes: ['playlist_defaultsolo', 'playlist_defaultsquad', '1111-1111-1111', 'set_br_playlists', 'campaign'] }, kopf, true);
    return aus;
  });
}
