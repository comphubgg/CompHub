/*
 * VORUEBERGEHEND (28.11.2026) - wird mit dem letzten Commit dieser Arbeit wieder entfernt.
 *
 * Epics Dienste sind aus der Entwicklungsumgebung nicht erreichbar, nur vom Server der Seite. Diese Auskunft zeigt, was sie auf die festen Anfragen
 * der Routen antworten - als Gerippe: Schluessel, Anzahlen, einzelne Felder. Keine frei waehlbaren Adressen, kein Zugang, hoechstens einmal je Minute.
 */

import { getToken } from '@/lib/epicCups';
import { epicAbruf, mitSpeicher } from '@/lib/fnEpic';
import { ENTDECKEN, fassung, marke } from '@/lib/fnEntdecken';

const LINKS = 'https://links-public-service-live.ol.epicgames.com/links/api/fn/mnemonic';

const CODES = [
  'experience_br', 'experience_reload', 'experience_og', 'playlist_defaultsolo', 'playlist_nobuildbr_solo', 'playlist_habanerosolo',
  'playlist_punchberryduo', 'playlist_sunflowerduo', 'playlist_piperbootduo', 'playlist_figmentduo', 'playlist_forbiddenfruitnobuildbrduo',
  'playlist_dashberryduo', 'playlist_matchmistduo', 'playlist_habanero_sourspawn_duos', 'playlist_showdownalt_solo', 'playlist_playgroundv2',
  'playlist_juno', 'campaign', 'reference_surface_category_br', 'reference_panel_1v1', 'playlist_bots_defaultduo', 'playlist_solidgold_duos',
];

interface Reihe { panelName?: string; panelDisplayName?: string; firstPage?: { results?: Array<{ linkCode?: string; globalCCU?: number }>; hasMore?: boolean } }
interface Flaeche { testVariantName?: string; panels?: Reihe[] }

export function diagnose(): Promise<unknown> {
  return mitSpeicher('entdecken|diagnose2', 60_000, async () => {
    const aus: Record<string, unknown> = {};
    const f = await fassung();
    const { accountId } = await getToken();
    const kopf = { 'X-Epic-Access-Token': await marke(f), 'User-Agent': f.agent };
    const strom = `?appId=Fortnite&stream=${encodeURIComponent(f.zweig)}`;
    const wer = { playerId: accountId, partyMemberIds: [accountId], locale: 'en', matchmakingRegion: 'EU', platform: 'Windows', isCabined: false, numLocalPlayers: 1, ratingAuthority: 'USK', rating: 'USK_AGE_12' };

    // 1. Was der Links-Dienst zu Modi und Spiellisten sagt (nur die Felder, nach denen gruppiert werden soll).
    try {
      const a = await epicAbruf<Array<{ mnemonic?: string; linkType?: string; accountId?: string; metadata?: Record<string, unknown> }>>(`${LINKS}?ignoreFailures=true`, {
        body: CODES.map((mnemonic) => ({ mnemonic, type: '', filter: false, v: '' })),
      });
      aus.links = (a.daten ?? []).map((l) => {
        const m = l.metadata ?? {};
        const liste = (w: unknown) => (Array.isArray(w) ? `${w.length}: ${w.slice(0, 40).join(',')}` : w ?? null);
        return {
          code: l.mnemonic, typ: l.linkType, konto: l.accountId, titel: m.title, parent_set: m.parent_set ?? null, parent_experience: m.parent_experience ?? null,
          product_tag: m.product_tag ?? null, sub_link_codes: liste(m.sub_link_codes), ccu_source_links: liste(m.ccu_source_links),
          default_sub_link_code: m.default_sub_link_code ?? null, schluessel: Object.keys(m).join(','),
        };
      });
      aus.linksFehlen = CODES.filter((c) => !(a.daten ?? []).some((l) => l.mnemonic === c));
    } catch (e) { aus.links = { fehler: (e as Error).message }; }

    // 2. Die Browse-Flaeche: Titel der Reihen, eine Folgeseite, und wie viele Codes link-entries in einer Anfrage nimmt.
    try {
      const a = await epicAbruf<Flaeche>(`${ENTDECKEN}/surface/CreativeDiscoverySurface_Browse${strom}`, { body: wer, kopf, ms: 20_000 });
      const panels = a.daten?.panels ?? [];
      aus.browseTitel = panels.slice(0, 12).map((p) => `${p.panelName}=${p.panelDisplayName}`);
      const mitMehr = panels.find((p) => p.firstPage?.hasMore);
      if (mitMehr) {
        for (const seite of [1, 2, 3]) {
          const s = await epicAbruf<{ results?: Array<{ linkCode?: string; globalCCU?: number }>; hasMore?: boolean }>(`${ENTDECKEN}/surface/CreativeDiscoverySurface_Browse/page${strom}`, {
            body: { ...wer, testVariantName: a.daten?.testVariantName, panelName: mitMehr.panelName, pageIndex: seite }, kopf,
          });
          aus[`seite${seite}`] = { reihe: mitMehr.panelName, status: s.status, treffer: s.daten?.results?.length ?? s.text, mehr: s.daten?.hasMore,
            erste: (s.daten?.results ?? []).slice(0, 4).map((t) => `${t.linkCode}=${t.globalCCU}`) };
        }
      }
      const alle = [...new Set(panels.flatMap((p) => (p.firstPage?.results ?? []).map((t) => t.linkCode ?? '')).filter((c) => /^\d{4}-/.test(c)))];
      aus.browseCodes = alle.length;
      for (const n of [100, 250]) {
        const start = Date.now();
        const e = await epicAbruf<Record<string, { globalCCU?: number } | null>>(`${ENTDECKEN}/link-entries`, { body: { linkCodes: alle.slice(0, n) }, kopf });
        aus[`eintraege${n}`] = { gefragt: Math.min(n, alle.length), status: e.status, bekommen: e.daten && e.status === 200 ? Object.keys(e.daten).length : e.text, ms: Date.now() - start };
      }
    } catch (e) { aus.browse = { fehler: (e as Error).message }; }

    // 3. Epics Seite ganz.
    try {
      const a = await epicAbruf<Flaeche>(`${ENTDECKEN}/surface/CreativeDiscoverySurface_EpicPage${strom}`, { body: wer, kopf, ms: 20_000 });
      aus.epicSeite = (a.daten?.panels ?? []).map((p) => `${p.panelName}=${p.panelDisplayName}: ${(p.firstPage?.results ?? []).map((t) => `${t.linkCode}=${t.globalCCU}`).join(',')}`);
    } catch (e) { aus.epicSeite = { fehler: (e as Error).message }; }
    return aus;
  });
}
