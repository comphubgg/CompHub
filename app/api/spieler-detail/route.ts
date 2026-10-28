import { NextResponse } from 'next/server';
import { findeSpieler, holeSeite, getToken, loeseNamenAuf, MAX_PAGES, type CupEintrag } from '@/lib/epicCups';
import { szeneFenster } from '@/lib/szeneStats';
import { zwischenspeichern } from '@/lib/zwischenspeicher';
import { replayTag } from '@/lib/replaySchlank';
import { liesJson } from '@/lib/ablage';
import { spielerKontext } from '@/lib/globalsSolos';
import { fensterOk, kontoOk, leseErgebnis } from '@/lib/eigeneAuswertung';

/*
 * Die Werte eines Spielers - und seines Teams - in einem Cup, fuer die Ansichten "Solo Stats" und "Team Stats" auf der Cup-Seite (wie bei
 * Osirion: bei einem Team stehen die Mitspieler nebeneinander).
 *
 *   GET ?event=&window=&q=NAME         -> Treffer in der Bestenliste (bis zu zehn), zum Auswaehlen
 *   GET ?event=&window=&id=EPIC-ID     -> der Spieler, sein Team (mitglieder) und die Werte jedes Mitglieds
 *
 * Quellen, jede mit dem, was sie wirklich hat:
 *   - Epics Bestenliste (jeder Cup): Platz, Punkte - getrennt nach Platzierung und Eliminierungen -, je Spiel Platz, Eliminierungen,
 *     Ueberlebenszeit je TEAM; bei manchen Cups auch Schaden, Kopftreffer, Heilung, Strecke.
 *   - Die Szene-Quelle (die Spieltage, die sie fuehrt, vor allem Finals): je SPIELER Schaden, Treffer, Schuesse, Heilung, Material, Sturm,
 *     Strecke ... Je Spieltag zusammen, nicht je Spiel.
 *   - Die Replays (die Spieltage, die ausgewertet sind): je SPIELER Eliminierungen, Knocks, Tode und - wo gelesen - Schaden, Treffer, Kopftreffer.
 *   - Die Auswertung der eigenen Lobbys (lib/eigeneAuswertung): wer sich mit Epic verifiziert hat und seine Stats ansieht, bestellt damit die Replays
 *     seiner Lobbys; Schaden, Treffer und Kopftreffer des ganzen Teams kommen daraus, auch wo der Cup zu gross fuer die Auswertung aller Lobbys ist.
 * Was keine Quelle kennt (Edit-Werte, Surge-Treffer, Reboots einzeln), liefert diese Schnittstelle nicht - die Ansicht sagt es.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const normId = (s: string) => s.replace(/-/g, '').toLowerCase();

/** Die Konten zu einem Namen aus dem Verzeichnis der Szene - leer, wenn es keines kennt oder nicht antwortet. */
async function kontenZumNamen(origin: string, q: string): Promise<string[]> {
  try {
    const r = await fetch(`${origin}/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!r.ok) return [];
    const j = await r.json() as { spieler?: Array<{ epicId?: string }> };
    return (j.spieler ?? []).map((x) => x.epicId ?? '').filter(Boolean).slice(0, 25);
  } catch { return []; }
}

export interface ReplayWerte { kills: number | null; knocks: number | null; tode: number | null; spiele: number | null; damage?: number; damageTaken?: number; hits?: number; headshots?: number; sturmSek?: number; wiederbelebt?: number; rebootet?: number }

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const event = p.get('event') ?? '';
  const fenster = p.get('window') ?? '';
  const id = normId(p.get('id') ?? '');
  const q = (p.get('q') ?? '').trim();
  if (!event || !fenster || (!id && q.length < 2)) {
    return NextResponse.json({ ok: false, error: 'Cup und Spieler fehlen.' }, { status: 400 });
  }
  try {
    if (!id) {
      /*
       * Erst ueber die Konten aus dem Verzeichnis, dann ueber den Text - und beide durch die ganze Liste.
       *
       * Frueher las die Suche nur die ersten vierzig Seiten (4000 Teams) und suchte darin den Text: wer in einem offenen Cup weiter hinten stand, war "in
       * diesem Cup nicht gefunden" (Betreiber, 19.10.2026: Spieler an jedem Platz muessen sich finden lassen). Die Konten zum Namen kennt das Verzeichnis; mit ihnen
       * laeuft die Suche ohne Namensaufloesung durch alle hundert Seiten in wenigen Sekunden (siehe findeSpieler). Nur wer im Verzeichnis fehlt, wird ueber den Text
       * gesucht - dann gibt es keinen anderen Weg.
       */
      const kandidaten = await kontenZumNamen(new URL(request.url).origin, q);
      let r = kandidaten.length
        ? await findeSpieler(event, fenster, [], kandidaten, MAX_PAGES)
        : { entries: [] as CupEintrag[], scannedPages: 0, totalPages: 0 };
      if (!r.entries.length) r = await findeSpieler(event, fenster, [q], [], 60);
      const gesucht = new Set(kandidaten.map(normId));
      const treffer = r.entries.flatMap((e) => e.players
        .filter((pl) => gesucht.has(normId(pl.id)) || pl.name.toLowerCase().includes(q.toLowerCase()))
        .map((pl) => ({ id: pl.id, name: pl.name, rank: e.rank, points: e.points, team: e.players.filter((x) => x.id !== pl.id).map((x) => x.name) })))
        .slice(0, 10);
      return NextResponse.json({ ok: true, treffer, gesucht: r.scannedPages, seiten: r.totalPages }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const r = await findeSpieler(event, fenster, [], [id], MAX_PAGES);
    const eintrag: CupEintrag | undefined = r.entries[0];
    const ids = eintrag ? eintrag.players.map((x) => normId(x.id)) : [id];

    // Namen: aus der Bestenliste, sonst frisch bei Epic (wer den Cup nicht gespielt hat, steht dort nicht).
    const namen = new Map<string, string>();
    for (const x of eintrag?.players ?? []) namen.set(normId(x.id), x.name);
    if (ids.some((i) => !namen.get(i))) {
      try {
        const { token } = await getToken();
        const frisch = await loeseNamenAuf(ids.filter((i) => !namen.get(i)), token);
        for (const [i, n] of Object.entries(frisch)) if (n && n !== i.slice(0, 8)) namen.set(normId(i), n);
      } catch { /* ohne Namen bleibt die Id */ }
    }
    const name = namen.get(id) ?? '';

    // Wie viele Teilnehmer der Cup hat - fuer "Top x %".
    let gesamt = 0; let aktualisiert: string | null = null;
    try {
      const erste = await holeSeite(event, fenster, 0, true);
      aktualisiert = erste.updated ?? null;
      const proSeite = erste.entries.length;
      if (erste.totalPages > 1 && proSeite) {
        const letzte = await holeSeite(event, fenster, erste.totalPages - 1, true);
        gesamt = (erste.totalPages - 1) * proSeite + letzte.entries.length;
      } else gesamt = proSeite;
    } catch { /* ohne Gesamtzahl keine Prozentangabe */ }

    // Die Szene-Quelle und die Replays - je Spieler.
    const szeneVon = new Map<string, Record<string, number>>();
    let szeneStand: string | null = null; let szeneMatches = 0;
    try {
      const sz = await szeneFenster([fenster]);
      for (const s of sz?.spieler ?? []) {
        const werte: Record<string, number> = {};
        for (const [k, v] of Object.entries(s)) if (typeof v === 'number') werte[k] = v;
        szeneVon.set(normId(s.epicId), werte);
      }
      szeneStand = sz?.aktualisiert ?? null; szeneMatches = sz?.matches ?? 0;
    } catch { /* ohne Szene-Quelle bleibt es bei Epics Werten */ }

    const saison = /^(S\d+)_/i.exec(fenster)?.[1]?.toUpperCase() ?? '';
    const rep = saison ? await replayTag(saison, fenster).catch(() => null) : null;
    const clutch = await liesJson<{ schaden?: Record<string, { dmg: number; erlitten: number; treffer: number; krit: number; sturm?: number; wiederbelebt?: number; rebootet?: number }> } | null>(`clutch/${fenster}.json`, null).catch(() => null);

    // Fenster und Konto werden zu einem Dateinamen - nur das Uebliche zulassen.
    const eigene = fensterOk(fenster) && kontoOk(id) ? await leseErgebnis(fenster, id) : null;
    const eigeneKomplett = !!eigene && eigene.gelesen >= eigene.sitzungen;
    const kontext = await spielerKontext().catch(() => null);
    const mitglieder = ids.map((i) => {
      const roh = namen.get(i) ?? '';
      const k = kontext?.(i, roh);
      let replay: ReplayWerte | null = null;
      if (rep) {
        const e = rep.spieler.find((x) => normId(x.epicId) === i);
        const d = clutch?.schaden?.[i];
        replay = {
          kills: e?.kills ?? 0, knocks: e?.knocks ?? 0, tode: e ? e.gestorben : null, spiele: e ? e.matches : null,
          ...(d ? { damage: Math.round(d.dmg), damageTaken: Math.round(d.erlitten), hits: d.treffer, headshots: d.krit } : {}),
          ...(d && typeof d.sturm === 'number' ? { sturmSek: Math.round(d.sturm), wiederbelebt: d.wiederbelebt ?? 0, rebootet: d.rebootet ?? 0 } : {}),
        };
      }
      // Die eigene Auswertung fuellt, was die anderen Quellen nicht haben. Eliminierungen, Knocks und Tode nur, wenn alle bestellten Lobbys gelesen sind
      // (sonst stuende eine Teilsumme neben Epics Zahl).
      const o = eigene?.spieler?.[i];
      if (o) {
        replay = {
          kills: eigeneKomplett ? o.kills : (replay?.kills ?? null), knocks: eigeneKomplett ? o.knocks : (replay?.knocks ?? null),
          tode: eigeneKomplett ? o.tode : (replay?.tode ?? null), spiele: eigeneKomplett ? o.spiele : (replay?.spiele ?? o.spiele),
          damage: replay?.damage ?? Math.round(o.dmg), damageTaken: replay?.damageTaken ?? Math.round(o.erlitten),
          hits: replay?.hits ?? o.treffer, headshots: replay?.headshots ?? o.krit,
          ...(typeof o.sturm === 'number' ? { sturmSek: Math.round(o.sturm) } : {}),
          ...(typeof o.wiederbelebt === 'number' ? { wiederbelebt: o.wiederbelebt, rebootet: o.rebootet ?? 0 } : {}),
        };
      }
      return {
        id: i, name: k?.anzeige || roh || i.slice(0, 8), land: k?.land ?? null, ich: i === id,
        szene: szeneVon.get(i) ?? null, replay,
      };
    });

    const antwort = {
      ok: true, id, name: mitglieder.find((m) => m.ich)?.name || name, dabei: !!eintrag,
      rank: eintrag?.rank ?? null, gesamt,
      // Epics Perzentil (Osirion zeigt dasselbe: Rang 4200 = Top 2,3 %); Rang durch die 10.000 Plaetze der Liste ergab 42 %.
      top: eintrag && typeof eintrag.percentile === 'number' && eintrag.percentile > 0 ? +(eintrag.percentile * 100).toFixed(1)
        : eintrag && gesamt ? +((eintrag.rank / gesamt) * 100).toFixed(1) : null,
      eintrag: eintrag ?? null,
      mitglieder,
      aktualisiert, szeneStand, szeneMatches,
      eigeneAuswertung: eigene ? { gelesen: eigene.gelesen, sitzungen: eigene.sitzungen, gerechnet: eigene.gerechnet, grund: eigene.grund ?? null, fassung: eigene.version ?? 0 } : null,
    };
    return zwischenspeichern(NextResponse.json(antwort, { headers: { 'Cache-Control': 'no-store' } }), 60);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'Epic liefert gerade nichts.' }, { status: 424, headers: { 'Cache-Control': 'no-store' } });
  }
}
