import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { GET as cupSpieler } from '@/app/api/cup-spieler/route';
import { GET as cupStats } from '@/app/api/cup-stats/route';
import { baueLeader, TAFELN } from '@/lib/turnierLeader';
import { fertigeAntwort, legeAntwortAb, alterMinuten } from '@/lib/antwortSpeicher';
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
 * Die Zahlen: bei Solo-Spieltagen dieselben wie app/api/cup-stats (Epics Bestenliste + volle Replays), sonst app/api/cup-spieler - siehe rechneLeader.
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
  try {
    // Alle Regionen desselben Spieltags (Betreiber, 15.11.2026: Region MVPs und Regionenvergleich): die Regionskennung am Ende austauschen.
    if (p.get('regionen') === '1') {
      const REG = /_(EU|NAC|NAW|BR|ASIA|ME|OCE)$/i;
      if (!REG.test(fenster)) return NextResponse.json({ error: 'Spieltag ohne Region' }, { status: 400 });
      const regionen = await Promise.all(['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'].map(async (r) => {
        const w = fenster.replace(REG, `_${r}`);
        const e = REG.test(event) ? event.replace(REG, `_${r}`) : event;
        const ws = windows.map((x) => x.replace(REG, `_${r}`));
        const x = await leaderFuer(basis, w, e, ws).catch(() => null);
        return { region: r, window: w, vorhanden: !!x?.d.vorhanden, mvp: x?.d.mvp ?? null, tafeln: x?.d.tafeln ?? [], replayStand: x?.replayStand ?? null, gewertet: x?.d.gewertet ?? 0 };
      }));
      // Regionenvergleich: je Kennzahl die besten fuenf ueber alle Regionen (rohe Werte - das Rating ist je Spieltag normiert und taugt dafuer nicht).
      const VERGLEICH = ['elims', 'damage', 'quote', 'headshots', 'hits', 'builds', 'timeAlive', 'damageTaken', 'reboots'];
      const vergleich = VERGLEICH.map((k) => {
        const zeilen = regionen.flatMap((r) => (r.tafeln.find((t) => t.schluessel === k)?.zeilen ?? []).map((z) => ({ ...z, region: r.region })));
        const t0 = regionen.flatMap((r) => r.tafeln).find((t) => t.schluessel === k);
        if (!t0 || !zeilen.length) return null;
        const top = zeilen.sort((a, b2) => b2.wert - a.wert).slice(0, 5);
        const raenge: number[] = [];
        top.forEach((z, i) => raenge.push(i > 0 && top[i - 1].wert === z.wert ? raenge[i - 1] : i + 1));
        return { schluessel: k, titel: t0.titel, nachkomma: t0.nachkomma, zeit: t0.zeit ?? false, zeilen: top.map((z, i) => ({ ...z, rang: raenge[i] })) };
      }).filter(Boolean);
      return NextResponse.json({ regionen: regionen.map((r) => ({ ...r, tafeln: undefined })), vergleich });
    }
    const { d, kopf, replayStand } = await leaderFuer(basis, fenster, event, windows, p.get('neu') === '1');
    return NextResponse.json({ ...d, kopf, replayStand, window: fenster, windows: windows.length > 1 ? windows : null });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Die Kennzahlen, die baueLeader abfragt (Feld in cup-spieler). */
const FELDER = TAFELN.filter((t) => t.feld !== 'rating' && t.feld !== 'lowest').map((t) => (t.feld === 'kills' ? 'elims' : t.feld));

/*
 * Woher die Zahlen kommen (16.11.2026, Betreiber: dieselben vollen Werte je Spieler wie /api/cup-stats).
 *
 * Bis dahin las diese Route alles aus app/api/cup-spieler - und dort steht Damage nur, wenn jedes Spiel des Spielers voll gelesen ist oder Epics Schaden
 * (epicDmg) in der Clutch-Datei liegt. Wird ein Spieltag neu gelesen (neue Leser-Fassung: am 16.11. ab 05:16 UTC Fassung 20 fuer alle kleinen Spieltage der
 * letzten 14 Tage), faengt seine Clutch-Datei leer an, epicDmg fehlt, und bis alle Rechner durch sind, sind nur Spieler mit wenigen Spielen "ganz gelesen".
 * Genau das zeigte FNCS Solos Reload Heat 2 EU: Damage 0 beim MVP, "Most Damage Dealt" mit drei Spielern (Nova, skinny covx, Kami - wenig Spiele), Laender
 * und Performance Board auf 0. Die Event-Seite (app/api/cup-stats) nimmt Damage, Elims, Ueberlebenszeit und Kopftreffer aus Epics Bestenliste und war deshalb
 * richtig.
 *
 * Jetzt bei Solo-Spieltagen (Epic fuehrt die Werte je Team, im Solo ist das der Spieler) genau die Zahlen von app/api/cup-stats: Damage Dealt, Eliminations,
 * Time Alive und Headshots aus Epics Bestenliste, Hits, Builds und Damage Taken aus den vollen Replays mit derselben Regel (nur ganz Gelesene), die Ratio =
 * Epics Damage / Damage Taken, der Platz aus Epics Bestenliste. Aus cup-spieler kommen nur Name, Land und Reboots - und bei Team-Cups alles (Epic hat dort keine
 * Werte je Spieler). Was fuer zu wenige Spieler da ist, zeigt lib/turnierLeader.ts nicht als Tafel, sondern nennt es (fehlend).
 */
async function rechneLeader(basis: URL, fenster: string, event: string, windows: string[]) {
  const mehrtaegig = windows.length > 1;
  const epicPlatz = (async () => {
    const m = new Map<string, number>();
    if (mehrtaegig) return m;
    const tag = await epicTag(fenster).catch(() => null);
    for (const t of tag?.teams ?? []) for (const id of t.spieler ?? []) if (typeof t.platz === 'number') m.set(String(id).toLowerCase(), t.platz);
    return m;
  })();
  type Z = Record<string, unknown> & { epicId: string };
  const adresse = (pfad: string, mehr: Record<string, string>) => {
    const u = new URL(pfad, basis);
    u.search = '';
    u.searchParams.set('window', fenster);
    if (event) u.searchParams.set('event', event);
    if (mehrtaegig) u.searchParams.set('windows', windows.join(','));
    for (const [k, v] of Object.entries(mehr)) u.searchParams.set(k, v);
    return new Request(u);
  };
  // Beide Quellen zugleich, jede genau einmal (vorher neun Aufrufe von cup-spieler hintereinander gerechnet).
  const [sp, st] = await Promise.all([
    cupSpieler(adresse('/api/cup-spieler', { kennzahlen: FELDER.join(','), pro: '50' })).then((r) => r.json()).catch(() => null) as Promise<{
      listen?: Record<string, Z[]>; gesamt?: Record<string, number>; replayStand?: { gelesen: number; gesamt: number } | null; schadenDa?: boolean;
    } | null>,
    event ? cupStats(adresse('/api/cup-stats', { top: '5' })).then((r) => r.json()).catch(() => null) as Promise<{
      bestenlisten?: Array<{ schluessel: string; alle?: Array<{ ids: string[]; spieler: string[]; rank: number; spiele?: number; roh: number }> }>;
    } | null> : Promise.resolve(null),
  ]);
  const platz = await epicPlatz;
  const listen = sp?.listen ?? {};
  const replayStand = sp?.replayStand ?? null;

  // Solo: jede Zeile der Bestenlisten von cup-stats gehoert genau einem Spieler.
  const stListen = st?.bestenlisten ?? [];
  const solo = stListen.length > 0 && stListen.every((b) => (b.alle ?? []).every((x) => (x.ids?.length ?? 0) === 1));
  let hole: (kennzahl: string, pro: number) => Promise<Z[] & { gesamt?: number }>;
  if (solo) {
    // Feld in cup-stats -> Feld der Leaders. Epics Werte sind fuer jeden Eintrag da (fehlt er in der Liste, ist er 0); Replay-Werte nur bei ganz Gelesenen.
    const EPIC: Record<string, string> = { damage: 'damage', elims: 'kills', timeAlive: 'timeAlive', headshots: 'headshots' };
    const REPLAY: Record<string, string> = { treffer: 'hits', builds: 'builds', damageTaken: 'damageTaken' };
    const ausSpieler = new Map<string, Z>();
    for (const zeilen of Object.values(listen)) for (const z of zeilen) if (z?.epicId && !ausSpieler.has(z.epicId.toLowerCase())) ausSpieler.set(z.epicId.toLowerCase(), z);
    const zeilen = new Map<string, Z>();
    const zeileVon = (id0: string, name: string, rank: number, spiele: number | undefined) => {
      const id = id0.toLowerCase();
      let z = zeilen.get(id);
      if (!z) {
        const s0 = ausSpieler.get(id);
        z = {
          epicId: s0?.epicId ?? id0, name: s0?.name ?? name, land: s0?.land ?? '', reboots: s0?.reboots ?? null,
          platz: rank || platz.get(id) || null, spiele: spiele ?? s0?.spiele ?? 0,
          kills: 0, elims: 0, damage: 0, timeAlive: 0, headshots: 0, hits: null, builds: null, damageTaken: null, quote: null,
        };
        zeilen.set(id, z);
      }
      if (typeof spiele === 'number' && spiele > Number(z.spiele ?? 0)) z.spiele = spiele;
      return z;
    };
    for (const b of stListen) {
      const feld = EPIC[b.schluessel] ?? REPLAY[b.schluessel];
      for (const x of b.alle ?? []) {
        const z = zeileVon(x.ids[0], x.spieler?.[0] ?? '', x.rank, x.spiele);
        if (!feld) continue;
        z[feld] = x.roh;
        if (feld === 'kills') z.elims = x.roh;
      }
    }
    for (const z of zeilen.values()) {
      const dmg = Number(z.damage) || 0; const erl = typeof z.damageTaken === 'number' ? z.damageTaken : null;
      // Die Ratio wie die Kachel "Damage Ratio" von cup-stats: Epics Damage durch den Schaden von Spielern aus dem Replay.
      z.quote = erl && erl > 0 ? dmg / erl : null;
    }
    const alle = [...zeilen.values()];
    hole = async (kennzahl, pro) => {
      const f = kennzahl === 'elims' ? 'kills' : kennzahl;
      const mit = alle.filter((z) => typeof z[f] === 'number' && (z[f] as number) > 0).sort((a, b) => (b[f] as number) - (a[f] as number));
      return Object.assign(mit.slice(0, pro), { gesamt: kennzahl === 'elims' ? alle.length : mit.length });
    };
  } else {
    hole = async (kennzahl) => {
      // Fehlt der Platz in den Replay-Werten (Auswertung laeuft noch), Epics Endplatz aus dem abgelegten Spieltag (epic-spieltage/<Saison>/<window>.json).
      const z0 = (listen[kennzahl] ?? []).map((z) => (typeof z.platz === 'number' ? z : { ...z, platz: platz.get(z.epicId.toLowerCase()) ?? null }));
      return Object.assign(z0, { gesamt: sp?.gesamt?.[kennzahl] });
    };
  }
  const [d, kopf] = await Promise.all([
    baueLeader(hole, { replayHinten: () => !!replayStand, schadenDa: () => solo || sp?.schadenDa !== false }),
    kopfVon(fenster, windows),
  ]);
  return { d: { ...d, ...(solo ? { quelle: 'cup-stats' } : { quelle: 'cup-spieler' }) }, kopf, replayStand };
}

/**
 * Die Leaders eines Spieltags (oder mehrerer Tage) - einmal gerechnet und aufgehoben (lib/antwortSpeicher: im Speicher, beim Laufrechner in der Ablage),
 * danach sofort ausgeliefert und nur im Hintergrund erneuert. Ein beendeter Spieltag aendert sich kaum noch: lange Frist; waehrend und kurz nach dem Cup
 * kurz, weil die Replays laufend dazukommen.
 */
async function leaderFuer(basis: URL, fenster: string, event: string, windows: string[], neu = false) {
  // Der Dateiname wird bei 120 Zeichen gekappt (lib/antwortSpeicher) - Event und Tage deshalb als Pruefsumme, sonst fielen "Day 2" und "Day 1 + Day 2" zusammen.
  const schluessel = `leader|${fenster}|${createHash('sha256').update(`${event}|${windows.join(',')}`).digest('hex').slice(0, 16)}`;
  const frist = await fristFuer(fenster, windows);
  const rechne = () => rechneLeader(basis, fenster, event, windows);
  // ?neu=1 (Vorwaermen nach dem Ablegen neuer Replay-Werte, scripts/leader-vorwaermen.mjs): neu rechnen, wenn die aufgehobene Antwort aelter als 5 Minuten ist.
  if (neu) {
    const alter = await alterMinuten(schluessel).catch(() => null);
    if (alter === null || alter >= 5) {
      const w = await rechne();
      await legeAntwortAb(schluessel, w).catch(() => {});
      return w;
    }
  }
  return fertigeAntwort(schluessel, rechne, frist.ms);
}

/** Wie lange eine Antwort frisch ist und wie lange der Rand (Cloudflare) sie halten darf - nach dem Alter des Spieltags. */
async function fristFuer(fenster: string, windows: string[]) {
  const archiv = await liesJson<ArchivCup[]>('cup-archiv.json', []).catch(() => []);
  const enden = (windows.length > 1 ? windows : [fenster]).map((w) => archiv.find((c) => c.windowId === w)).map((c) => (c ? (c.end ?? c.begin + 4 * 3600_000) : null));
  const ende = enden.some((e) => e === null) ? null : Math.max(...(enden as number[]));
  const her = ende === null ? 0 : Date.now() - ende;
  // Laenger als zwei Tage vorbei: die Replays sind gelesen - zwoelf Stunden frisch, eine Stunde am Rand. Bis dahin 10 Minuten (Replays kommen nach), laufend 1 Minute.
  if (her > 2 * 864e5) return { ms: 12 * 3600_000, rand: 3600 };
  if (her > 0) return { ms: 10 * 60_000, rand: 300 };
  return { ms: 60_000, rand: 60 };
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const fenster = p.get('window');
  const windows = (p.get('windows') ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 6);
  const rand = fenster && p.get('regionen') !== '1' ? (await fristFuer(fenster, windows)).rand : 60;
  return zwischenspeichern(await holeRoh(request), rand);
}
