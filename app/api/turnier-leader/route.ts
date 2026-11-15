import { NextResponse } from 'next/server';
import { GET as cupSpieler } from '@/app/api/cup-spieler/route';
import { baueLeader } from '@/lib/turnierLeader';
import { liesJson } from '@/lib/ablage';
import { kumulativeTage } from '@/lib/kumulativ';
import { zwischenspeichern } from '@/lib/zwischenspeicher';
import { cupBild } from '@/lib/mapsTyp';
import { epicTag, saisonName } from '@/lib/szeneStats';

/*
 * Tournament Leaders (lib/turnierLeader.ts) - Event MVP und die besten fuenf je Kennzahl.
 *
 *   ?window=<windowId>&event=<eventId>[&windows=a,b]   ein Spieltag, oder mehrere Tage eines Finales zusammen
 *   ?fncs=1[&region=EU]                                 alle FNCS-Spieltage (auch vergangene) zur Auswahl, neueste zuerst
 *
 * Die Zahlen holt die Route bei app/api/cup-spieler (dieselbe Abfrage wie die Player Stats, ?kennzahl=...&pro=50) - so stehen in den Leaders nie
 * andere Werte als in den Player Stats.
 */

export const runtime = 'nodejs';

interface ArchivCup { id?: string; eventId: string; windowId: string; region: string; begin: number; end?: number; titel?: string; istFinale?: boolean }

async function fncsListe(region: string) {
  const archiv = await liesJson<ArchivCup[]>('cup-archiv.json', []).catch(() => []);
  const jetzt = Date.now();
  const fncs = archiv.filter((c) => /FNCS/i.test(c.windowId) && !/FNCSCup|TealKnight|Mobile/i.test(c.windowId) && (!region || c.region === region) && c.begin <= jetzt);
  const raus: Array<{ schluessel: string; titel: string; cup: string; event: string; window: string; windows?: string[]; begin: number; region: string }> = [];
  const nachEvent = new Map<string, ArchivCup[]>();
  for (const c of fncs) nachEvent.set(c.eventId, [...(nachEvent.get(c.eventId) ?? []), c]);
  for (const [event, liste] of nachEvent) {
    const tage = kumulativeTage(liste.map((c) => ({ ...c, status: c.begin > jetzt ? 'kommt' : undefined })));
    // Das ganze Event (Day 1 + Day 2 ...) zuerst, darunter jeder Tag.
    if (tage.length > 1) {
      const letzter = tage[tage.length - 1];
      raus.push({ schluessel: `${event}|alle`, cup: letzter.id ?? '', titel: `${letzter.titel ?? 'FNCS'} · ${tage.map((t) => `Day ${/Day(\d+)/i.exec(t.windowId)?.[1] ?? ''}`).join(' + ')}`, event, window: letzter.windowId, windows: tage.map((t) => t.windowId), begin: letzter.begin + 1, region: letzter.region });
    }
    for (const c of liste) {
      const teil = /Heat(\d+)/i.exec(c.windowId)?.[0]?.replace(/Heat/i, 'Heat ') ?? /Round(\d+)/i.exec(c.windowId)?.[0]?.replace(/Round/i, 'Round ') ?? '';
      const tag = /Day(\d+)/i.exec(c.windowId)?.[1];
      raus.push({ schluessel: `${event}|${c.windowId}`, cup: c.id ?? '', titel: [c.titel ?? 'FNCS', teil, tag ? `Day ${tag}` : ''].filter(Boolean).join(' · '), event, window: c.windowId, begin: c.begin, region: c.region });
    }
  }
  return raus.sort((a, b) => b.begin - a.begin).slice(0, 120);
}

/** Kopf fuer Abschnitt und Bild: Cup, Runde, Saison, Region, Datum und das Cup-Bild (eigene Datei unter /cups, sonst null). */
async function kopfVon(fenster: string, windows: string[]) {
  const archiv = await liesJson<ArchivCup[]>('cup-archiv.json', []).catch(() => []);
  const c = archiv.find((x) => x.windowId === fenster);
  const saison = /^(?:RegionLock_)?(S\d+)_/i.exec(fenster)?.[1]?.toUpperCase() ?? '';
  const heat = /Heat(\d+)/i.exec(fenster)?.[1];
  const runde = /Round(\d+)/i.exec(fenster)?.[1];
  const tage = windows.length > 1 ? windows.map((w) => /Day(\d+)/i.exec(w)?.[1]).filter(Boolean) : [];
  const tag = /Day(\d+)/i.exec(fenster)?.[1];
  const titel = (c?.titel ?? fenster).replace(/\s+Heats$/i, '');
  const teil = heat ? `Heat ${heat}` : /lastchance/i.test(fenster) ? (/lobby/i.test(fenster) ? 'Last Chance Lobby' : 'Last Chance') : runde ? `Round ${runde}` : /final/i.test(fenster) ? 'Final' : '';
  const tagText = tage.length ? `Day ${tage.join(' + ')}` : tag ? `Day ${tag}` : '';
  return {
    titel: [titel.replace(/\s+Finals?$/i, ''), teil, tagText].filter(Boolean).join(' · '),
    saison: saison ? saisonName(saison) : '',
    region: c?.region ?? /_([A-Z]{2,4})$/.exec(fenster)?.[1] ?? '',
    datum: c?.begin ?? null,
    bild: cupBild(c?.titel ?? fenster),
  };
}

async function holeRoh(request: Request) {
  const p = new URL(request.url).searchParams;
  if (p.get('fncs') === '1') {
    return NextResponse.json({ fenster: await fncsListe((p.get('region') ?? 'EU').toUpperCase()) });
  }
  const fenster = p.get('window');
  if (!fenster) return NextResponse.json({ error: 'window ist noetig' }, { status: 400 });
  const event = p.get('event') ?? '';
  const windows = (p.get('windows') ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6);
  const basis = new URL(request.url);
  const epicPlatz = (async () => {
    const m = new Map<string, number>();
    if (windows.length > 1) return m;
    const tag = await epicTag(fenster).catch(() => null);
    for (const t of tag?.teams ?? []) for (const id of t.spieler ?? []) if (typeof t.platz === 'number') m.set(String(id).toLowerCase(), t.platz);
    return m;
  })();
  let replayStand: { gelesen: number; gesamt: number } | null = null;
  const hole = async (kennzahl: string, pro: number) => {
    const u = new URL('/api/cup-spieler', basis);
    u.searchParams.set('window', fenster);
    if (event) u.searchParams.set('event', event);
    if (windows.length > 1) u.searchParams.set('windows', windows.join(','));
    u.searchParams.set('kennzahl', kennzahl);
    u.searchParams.set('pro', String(pro));
    const r = await cupSpieler(new Request(u));
    const j = await r.json().catch(() => null) as { zeilen?: Array<Record<string, unknown> & { epicId: string }>; replayStand?: { gelesen: number; gesamt: number } | null } | null;
    if (j?.replayStand) replayStand = j.replayStand;
    const platz = await epicPlatz;
    // Fehlt der Platz in den Replay-Werten (Auswertung laeuft noch), Epics Endplatz aus dem abgelegten Spieltag (epic-spieltage/<Saison>/<window>.json).
    const zeilen = (j?.zeilen ?? []).map((z) => (typeof z.platz === 'number' ? z : { ...z, platz: platz.get(z.epicId.toLowerCase()) ?? null }));
    return Object.assign(zeilen, { gesamt: (j as { gesamt?: number } | null)?.gesamt });
  };
  try {
    const [d, kopf] = await Promise.all([baueLeader(hole, { replayHinten: () => !!replayStand }), kopfVon(fenster, windows)]);
    return NextResponse.json({ ...d, kopf, replayStand, window: fenster, windows: windows.length > 1 ? windows : null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return zwischenspeichern(await holeRoh(request), 60);
}
