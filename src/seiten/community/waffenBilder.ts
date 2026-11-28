import { useEffect, useState } from 'react';

/*
 * Eigene Bilder ALLER Waffen, die es je gab (Betreiber 28.11.2026: "kein einziges Fragezeichen mehr ... jede Waffe ... als PNG").
 * Der Runner (main: scripts/waffen-bilder-alle.mjs, .github/workflows/waffen-bilder-alle.yml) liest die Waffenliste genau wie waffenWiki.ts, laedt je
 * Waffe (und Seltenheit, wo das Wiki eigene Bilder hat) das beste Bild - bevorzugt freigestellt, durchsichtige Raender abgeschnitten - und legt es
 * auf der echten Seite ab: /waffen/alle/*.webp, Zuordnung in /waffen/alle.json (im Hub ueber den Proxy /waffen). Der Browser laedt nichts mehr
 * vom Wiki selbst (vorher: viele leere Karten, Quadrate mit Hintergrund).
 *
 * alle.json: { stand, quelle, waffen: { <id wie in waffenWiki.ts>: { n: Name, k: Klasse, b: "alle/x.webp", f: 1 = freigestellt / 0 = Quadrat mit
 * Hintergrund, q: Wiki-Datei, w, h, r?: { <seltenheit>: { b, f, q } } } } }
 */
export interface EigenesBild { b: string; f: number; q?: string }
export interface BildEintrag extends EigenesBild { n: string; k?: string; w?: number; h?: number; r?: Record<string, EigenesBild> }
export interface BilderTafel { nachId: Map<string, BildEintrag>; nachName: Map<string, BildEintrag> }

const nameKey = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Bilder mit Hintergrund (f: 0) - WaffenBild zeigt sie als ganzes Quadrat mit runden Ecken statt randlos. */
export const QUADRATE = new Set<string>();
export const pfad = (b: EigenesBild) => `/waffen/${b.b}`;

let tafel: BilderTafel | null = null;
let laden: Promise<BilderTafel | null> | null = null;
function holen(): Promise<BilderTafel | null> {
  laden ??= fetch('/waffen/alle.json').then((r) => (r.ok ? r.json() : null)).then((j: { waffen?: Record<string, BildEintrag> } | null) => {
    if (!j?.waffen) return null;
    const t: BilderTafel = { nachId: new Map(), nachName: new Map() };
    for (const [id, e] of Object.entries(j.waffen)) {
      t.nachId.set(id, e);
      if (!t.nachName.has(nameKey(e.n))) t.nachName.set(nameKey(e.n), e);
      for (const x of [e, ...Object.values(e.r ?? {})]) if (!x.f) QUADRATE.add(pfad(x));
    }
    tafel = t; return t;
  }).catch(() => { laden = null; return null; });
  return laden;
}
/** Die Tafel (einmal je Sitzung geladen); null, solange sie laedt oder wenn die Seite sie nicht hat. */
export function useWaffenBilder(): BilderTafel | null {
  const [t, setT] = useState<BilderTafel | null>(tafel);
  useEffect(() => { let weg = false; if (!tafel) holen().then((x) => { if (!weg) setT(x); }); return () => { weg = true; }; }, []);
  return t;
}
/** Eintrag einer Waffe: nach Kennung (wiki_...), sonst nach Namen (Spieldateien-Export, Turnier-Bauplaene). */
export const eintragVon = (t: BilderTafel | null | undefined, w: { id?: string; name: string }) => (t ? (w.id ? t.nachId.get(w.id) : undefined) ?? t.nachName.get(nameKey(w.name)) : undefined);
