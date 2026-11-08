import { liesJson } from '@/lib/ablage';
import { GET as katalogAbruf } from '@/app/api/cup-catalog/route';
import { holeSeite, holeMarken } from '@/lib/epicCups';
import { profilKarte, type KatalogCup } from '@/lib/ergebnisPosts';
import { kernname, ohneZierrat } from '@/lib/homoglyph';
import type { TagesPost } from '@/lib/tagesposts';

/*
 * Der Heats-Post (Betreiber, 8.11.2026: "erstellen wir immer auch einen Post fuer die Heats instant, wenn man die Heats kennt").
 *
 * Wer in welchen Heat kommt, sagt Epic ueber Marken: die letzte Qualifier-Runde vergibt "<Serie>_Heats_<Region>" an die Besten, spaeter teilt Epic
 * sie mit "<Serie>_Heat1_<Region>" / "_Heat2_" auf die Heats auf. Dieser Lauf (alle zehn Minuten im Ablauf der Ergebnis-Posts) fragt die Marken der
 * Qualifizierten bei Epic ab; sobald (fast) alle eine Heat-Marke tragen, steht die Einteilung fest und der Post entsteht - einmal je Heats-Event.
 * Nichts wird geraten: wer keine Heat-Marke traegt, steht nicht drin.
 */

const SEITE = 'https://www.thecomphub.com';
const VERLAUF = 'posts-verlauf.json';

type Fenster = { windowId: string; eventId: string; status?: string; begin?: number; end?: number; tokens?: string[]; marken?: Array<{ token: string; bis: number }> };

export interface HeatSpieler { id: string; name: string; land: string; x?: string; rang: number; punkte: number }
export interface HeatsDaten {
  cupId: string; titel: string; region: string; eventId: string;
  heats: Array<{ nr: number; windowId: string; begin: number; spieler: HeatSpieler[] }>;
  /** So viele vergab die Qualifikation in die Heats - und so viele tragen schon eine Heat-Marke. */
  erwartet: number; gefunden: number;
  /** Kurzname der Runde, aus der die Plaetze stammen ("R3"), und ob Epics Marken schon da sind (sonst nach der Regel eingeteilt). */
  quelle: string; ausMarken: boolean;
}

const flagge = (land?: string | null) => (land && /^[A-Za-z]{2}$/.test(land)
  ? [...land.toUpperCase()].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join('') : '');

export const heatTag = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Berlin' });

/** Die Heat-Einteilungen der kommenden Heats einer Region - nur die, bei denen Epic die Marken schon vergeben hat (oder alle mit nurEvent und alle=true). */
export async function heatsDaten(region = 'EU', nurEvent?: string, alle = false): Promise<HeatsDaten[]> {
  let katalog: { cups?: Array<Omit<KatalogCup, 'regionen'> & { regionen?: Record<string, Fenster[]> }> } = {};
  try { katalog = await (await katalogAbruf(new Request(`${SEITE}/api/cup-catalog?modus=alle-aktuell`))).json(); } catch { return []; }
  const jetzt = Date.now();
  const alleFenster = (katalog.cups ?? []).flatMap((c) => (c.regionen?.[region] ?? []).map((f) => ({ c, f })));
  const gruppen = new Map<string, { c: { id: string; titel: string }; fenster: Fenster[] }>();
  for (const { c, f } of alleFenster) {
    if (!/Heat\d+/i.test(f.windowId) || (nurEvent && f.eventId !== nurEvent)) continue;
    if (!nurEvent && (f.status === 'vorbei' || (f.begin ?? 0) < jetzt - 3_600_000)) continue;
    const g = gruppen.get(f.eventId) ?? { c, fenster: [] };
    g.fenster.push(f); gruppen.set(f.eventId, g);
  }
  const raus: HeatsDaten[] = [];
  for (const [eventId, { c, fenster }] of gruppen) {
    const heatMarke = new Map<string, Fenster>();
    for (const f of fenster) { const t = (f.tokens ?? []).find((x) => /_Heat\d+_/i.test(x)); if (t) heatMarke.set(t, f); }
    if (!heatMarke.size) continue;
    const serie = [...heatMarke.keys()][0].replace(/_Heat\d+_.*$/i, '');
    // Die Runden, die in die Heats fuehren: ihre Marke heisst "<Serie>_Heats..."
    // Erst eine halbe Stunde nach dem Ende: bis dahin koennen spaete Spiele die Plaetze noch verschieben.
    const zubringer = alleFenster.map(({ f }) => f).filter((f) => f.status === 'vorbei' && (f.end ?? 0) < jetzt - 30 * 60_000 && (f.marken ?? []).some((m) => m.token.startsWith(`${serie}_Heats`)));
    if (!zubringer.length) continue;
    const erwartet = zubringer.reduce((a, f) => a + Math.max(...(f.marken ?? []).filter((m) => m.token.startsWith(`${serie}_Heats`)).map((m) => m.bis)), 0);
    const kandidaten = new Map<string, { name: string; rang: number; punkte: number }>();
    for (const f of zubringer) {
      const bis = Math.max(...(f.marken ?? []).map((m) => m.bis));
      for (let s = 0; s * 100 < bis + 20; s++) {
        try {
          const seite = await holeSeite(f.eventId, f.windowId, s);
          for (const e of seite.entries) {
            if (e.rank > bis + 20) continue;
            for (const p of e.players) if (!kandidaten.has(p.id)) kandidaten.set(p.id, { name: p.name, rang: e.rank, punkte: e.points });
          }
        } catch { /* fehlt eine Seite, fehlen ihre Spieler - der Anteil unten entscheidet */ }
      }
    }
    if (!kandidaten.size) continue;
    let marken: Map<string, string[]> = new Map();
    try { marken = await holeMarken([...kandidaten.keys()]); } catch { /* dann nach der Regel */ }
    const karte = await profilKarte();
    /*
     * Die Regel, nach der Epic einteilt (an Noble und EU Competitive geprueft, FNCS Solos Reload S43: 40 von 40 je Heat): nach dem Platz der letzten Runde im Zickzack -
     * Platz 1 Heat 1, Platz 2 und 3 Heat 2, Platz 4 und 5 Heat 1 ... So steht die Einteilung sofort nach der Runde fest (Betreiber, 8.11.2026: "Noble hat das schon");
     * sobald Epic die Heat-Marken vergeben hat, gelten die Marken.
     */
    const heatListe = [...heatMarke.keys()].sort((a, b) => Number(/_Heat(\d+)_/i.exec(a)?.[1] ?? 0) - Number(/_Heat(\d+)_/i.exec(b)?.[1] ?? 0));
    const n = heatListe.length;
    const nachRegel = (rang: number) => { const block = Math.floor((rang - 1) / n); const pos = (rang - 1) % n; return heatListe[block % 2 === 0 ? pos : n - 1 - pos]; };
    const einRunde = zubringer.length === 1;
    const zubringerBis = einRunde ? Math.max(...(zubringer[0].marken ?? []).filter((m) => m.token.startsWith(`${serie}_Heats`)).map((m) => m.bis)) : 0;
    const markenDa = [...kandidaten.keys()].some((id) => (marken.get(id) ?? []).some((x) => heatMarke.has(x)));
    const heats = new Map<string, HeatSpieler[]>();
    for (const [id, k] of kandidaten) {
      const t = markenDa ? (marken.get(id) ?? []).find((x) => heatMarke.has(x)) : einRunde && k.rang <= zubringerBis ? nachRegel(k.rang) : undefined;
      if (!t) continue;
      const pr = karte.profile.get(id.toLowerCase()); const sz = karte.szene.get(id.toLowerCase());
      const name = ohneZierrat(kernname(pr?.anzeige || pr?.name || sz?.name || k.name)).trim() || k.name;
      const liste = heats.get(t) ?? [];
      liste.push({ id, name, land: pr?.land || sz?.land || '', x: pr?.x?.replace(/^@/, '') || undefined, rang: k.rang, punkte: k.punkte });
      heats.set(t, liste);
    }
    const gefunden = [...heats.values()].reduce((a, l) => a + l.length, 0);
    if (!alle && gefunden < erwartet * 0.9) continue;
    raus.push({
      cupId: c.id, titel: c.titel, region, eventId, erwartet, gefunden, ausMarken: markenDa,
      quelle: einRunde ? `R${/Round(\d+)/i.exec(zubringer[0].windowId)?.[1] ?? ''}` : 'Q',
      heats: [...heatMarke.entries()].map(([t, f]) => ({
        nr: Number(/_Heat(\d+)_/i.exec(t)?.[1] ?? 0), windowId: f.windowId, begin: f.begin ?? 0,
        spieler: (heats.get(t) ?? []).sort((a, b) => a.rang - b.rang),
      })).sort((a, b) => a.nr - b.nr),
    });
  }
  return raus;
}

/** Der fertige Post zu jedem Heats-Event, dessen Einteilung neu feststeht - einmal je Event (Schluessel "heats:<eventId>"). */
export async function heatsPostsFinden(region = 'EU'): Promise<TagesPost[]> {
  const benutzt = new Set(await liesJson<string[]>(VERLAUF, []));
  const neu: TagesPost[] = [];
  for (const d of await heatsDaten(region).catch(() => [])) {
    const schluessel = `heats:${d.eventId}`;
    if (benutzt.has(schluessel)) continue;
    const wer = (s: HeatSpieler) => `${flagge(s.land)} ${s.x ? `@${s.x}` : s.name.toUpperCase()}`.trim();
    const zeilen = d.heats.map((h) => `Heat ${h.nr} · ${heatTag(h.begin)} (${h.spieler.length} players)\n${h.spieler.slice(0, 3).map(wer).join(', ')}${h.spieler.length > 3 ? ' & more' : ''}`);
    neu.push({
      nr: 0, art: 'cup', schluessel, titel: `Heats: ${d.titel} (${d.region})`,
      text: `${d.titel} ${d.region} - the heats are set 👀\n\n${zeilen.join('\n\n')}\n\nWho plays when: ${SEITE}/events/${encodeURIComponent(d.cupId)}?region=${d.region}`,
      bild: { art: 'heats', event: d.eventId, region: d.region },
    });
  }
  return neu;
}
