import { NextResponse } from 'next/server';
import fs from '@/lib/ablageFs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';
import { zwischenspeichern } from '@/lib/zwischenspeicher';
import { szeneFenster, epicTag } from '@/lib/szeneStats';
import { liesLanKonten } from '@/lib/lanKonten';
import { liesJson } from '@/lib/ablage';
import { GLOBALS_TAGE, istGlobalsEvent, istGlobalsFenster } from '@/lib/globalsCup';
import { replayTag, replayTage, verwerfeReplayTage } from '@/lib/replaySchlank';
import { auswertungsStand, vorrangAnfordern } from '@/lib/replayVorrang';

/*
 * Ohne Replays: die Werte der Szene-Quelle.
 *
 * Bei einem LAN (Globals) gibt es keine Replays - die Profis spielen auf
 * Turnierkonten an fremden Rechnern. Die Szene-Quelle fuehrt die Werte je
 * Spieler trotzdem (Damage, Elims, Assists, ...), unter den echten Konten.
 * Team und Platz kommen aus Epics Bestenliste, verbunden ueber die
 * Zuordnung der Turnierkonten (lib/lanKonten). Beim Finale der Globals
 * zaehlen beide Tage zusammen.
 */
async function ausSzene(tage: string[], anzeige: Map<string, string>, land: Map<string, string>) {
  const sz = await szeneFenster(tage);
  if (!sz?.spieler.length) return null;
  const lan = await liesLanKonten();
  const echtVon = (id: string) => lan[id]?.echt ?? id;

  // Die Teams ueber alle Tage: Punkte zusammen, daraus der Platz.
  const teams = new Map<string, { spieler: string[]; punkte: number; platz?: number }>();
  for (const w of tage) {
    const tag = await epicTag(w);
    for (const t of tag?.teams ?? []) {
      const echte = (t.spieler ?? []).map(echtVon);
      const k = [...echte].sort().join('|');
      const da = teams.get(k) ?? { spieler: echte, punkte: 0 };
      da.punkte += t.punkte ?? 0;
      if (tage.length === 1) da.platz = t.platz;
      teams.set(k, da);
    }
  }
  if (tage.length > 1) {
    [...teams.values()].sort((a, b) => b.punkte - a.punkte).forEach((t, i) => { t.platz = i + 1; });
  }
  const teamVon = new Map<string, { spieler: string[]; platz?: number }>();
  for (const t of teams.values()) for (const id of t.spieler) teamVon.set(id, t);

  /*
   * Solo-Spieltage: die Eliminierungen aus Epics Bestenliste (Betreiber, 31.10.2026, Vergleich mit Osirion beim FNCS-Solos-Finale EU: die
   * Szene-Quelle fuehrte tjino mit 23, Epic und Osirion mit 27; shxrk 34 statt 35). Bei Solos ist das Team ein Spieler - Epics Zahl gilt je Konto.
   * Und ohne Reload gibt es im Solo weder Reboot noch Wiederbeleben - die Quelle fuehrte trotzdem vereinzelt "1".
   */
  const soloElims = new Map<string, number>();
  let solo = teams.size > 0;
  for (const w of tage) {
    const tag = await epicTag(w);
    for (const t of tag?.teams ?? []) {
      if ((t.spieler ?? []).length !== 1) { solo = false; continue; }
      const id = echtVon(t.spieler[0]);
      soloElims.set(id, (soloElims.get(id) ?? 0) + (t.teamElims ?? 0));
    }
  }
  const ohneReboots = solo && !tage.some((w) => /reload/i.test(w));

  /*
   * Solo Clutch Points, wo sie gerechnet sind (scripts/clutch-berechnen.mjs):
   * je Tag unter den Konten, die im Replay stehen - bei einem LAN die
   * Turnierkonten, hier auf die echten umgeschrieben.
   */
  const clutch = new Map<string, number>();
  let clutchDa = false;
  /*
   * Seit dem 28.9.2026 wieder sichtbar - der Betreiber will die Kachel.
   * Gerechnet aus Epics Server-Replays der gewerteten Spiele (bei den Globals
   * 6 + 6); Osirion zaehlt dort 13 Matches, die Werte weichen deshalb ab.
   */
  /*
   * Schaden, erlittener Schaden, Treffer, Sturm- und Ueberlebenszeit aus unseren vollen Replays statt aus der Szene-Quelle (31.10.2026, Vergleich mit
   * Osirion beim FNCS-Solos-Finale EU: die Replays treffen Osirions Reihenfolge fast genau - Quote tjino 2,10 zu Osirions 2,03, die Quelle hatte ghonzo
   * 1,55 vorn; Sturmzeit ghxstyah 1h 36m wie Osirion). Nur wenn jeder Tag ganz gelesen ist; Material, Bauteile, Strecke, Assists bleiben aus der Quelle.
   */
  const rep = new Map<string, { dmg: number; erlitten: number; treffer: number; sturm: number; leben: number }>();
  let repVoll = tage.length > 0;
  for (const w of tage) {
    const c = await liesJson<{ summe?: Record<string, number>; teilweise?: unknown; leben?: Record<string, number>;
      schaden?: Record<string, { dmg: number; erlitten: number; treffer: number; sturm?: number }> } | null>(`clutch/${w}.json`, null).catch(() => null);
    if (!c?.schaden || c.teilweise || !Object.keys(c.schaden).length) repVoll = false;
    for (const [id, d] of Object.entries(c?.schaden ?? {})) {
      const e = echtVon(id); const x = rep.get(e) ?? { dmg: 0, erlitten: 0, treffer: 0, sturm: 0, leben: 0 };
      x.dmg += d.dmg; x.erlitten += d.erlitten; x.treffer += d.treffer; x.sturm += d.sturm ?? 0; rep.set(e, x);
    }
    for (const [id, v] of Object.entries(c?.leben ?? {})) {
      const e = echtVon(id); const x = rep.get(e) ?? { dmg: 0, erlitten: 0, treffer: 0, sturm: 0, leben: 0 };
      x.leben += v; rep.set(e, x);
    }
    if (!c?.summe) continue;
    clutchDa = true;
    for (const [id, pkt] of Object.entries(c.summe)) {
      const e = echtVon(id);
      clutch.set(e, (clutch.get(e) ?? 0) + pkt);
    }
  }
  const ausRep = (id: string) => (repVoll ? rep.get(id.toLowerCase()) ?? rep.get(id) : undefined);

  const nameVon = (id: string) => anzeige.get(id)
    ?? sz.spieler.find((x) => x.epicId === id)?.username ?? id.slice(0, 8);
  const spieler = sz.spieler.map((x) => {
    const t = teamVon.get(x.epicId);
    const spiele = x.matchesPlayed || sz.matches || 0;
    const r = ausRep(x.epicId);
    return {
      epicId: x.epicId,
      name: nameVon(x.epicId),
      land: land.get(x.epicId) ?? '',
      spiele,
      kills: solo && soloElims.has(x.epicId) ? soloElims.get(x.epicId)! : x.eliminations ?? 0,
      knocks: 0, tode: 0, umgehauen: 0,
      assists: x.assists ?? 0,
      damage: Math.round(r ? r.dmg : x.damageDealt ?? 0),
      damageTaken: Math.round(r ? r.erlitten : x.damageTakenFromPlayers ?? 0),
      // Ausgeteilter geteilt durch von Spielern erlittenen Schaden - dieselbe
      // Rechnung wie ueberall im Werkzeug (lib/szeneStats, "quote"). Das Feld
      // "damageRatio" der Quelle passt zu keiner Formel (siehe dort).
      damageRatio: r ? (r.erlitten > 0 ? r.dmg / r.erlitten : null) : x.damageTakenFromPlayers ? (x.damageDealt ?? 0) / x.damageTakenFromPlayers : null,
      quote: r ? (r.erlitten > 0 ? r.dmg / r.erlitten : null) : x.damageTakenFromPlayers ? (x.damageDealt ?? 0) / x.damageTakenFromPlayers : null,
      genauigkeit: x.shots ? ((x.hitsToPlayers ?? 0) / x.shots) * 100 : null,
      clutch: clutchDa ? (clutch.get(x.epicId) ?? 0) : null,
      // Fuer die Kacheln (app/components/StatKacheln) - dieselben Summen wie
      // in der Statistik (lib/szeneStats): Meter, Sekunden, Stueck.
      hits: r ? r.treffer : x.hitsToPlayers ?? 0,
      headshots: x.headshots ?? 0,
      mats: (x.woodFarmed ?? 0) + (x.stoneFarmed ?? 0) + (x.metalFarmed ?? 0),
      builds: (x.woodBuildsPlaced ?? 0) + (x.stoneBuildsPlaced ?? 0) + (x.metalBuildsPlaced ?? 0),
      distanz: (x.distanceOnFoot ?? 0) + (x.distanceSkydiving ?? 0),
      timeInStorm: r && r.sturm > 0 ? Math.round(r.sturm) : x.timeInStorm ?? 0,
      timeAlive: r && r.leben > 0 ? Math.round(r.leben) : x.timeAlive ?? 0,
      // Fuer die Uebersicht (Show More) - was die Quelle je Spieler fuehrt.
      shots: x.shots ?? 0,
      reboots: ohneReboots ? 0 : x.rebootsAndRevives ?? 0,
      fallDamage: Math.round(x.fallDamage ?? 0),
      stormDamage: Math.round(x.stormDamage ?? 0),
      healthHealed: Math.round(x.healthHealed ?? 0),
      shieldHealed: Math.round(x.shieldHealed ?? 0),
      platz: t?.platz ?? null,
      partner: (t?.spieler ?? []).filter((id) => id !== x.epicId).map(nameVon),
    };
  }).sort((a, b) => b.damage - a.damage);
  return { vorhanden: true, quelle: 'szene', runden: sz.matches, rundenGesamt: sz.matches, lauf: null, clutch: clutchDa, spieler,
    aktualisiert: sz.aktualisiert };
}

// Werte je einzelnem Spieler - aus den Replays.
//
//   ?window=<windowId>[&saison=S42]
//
// Warum nicht aus dem Leaderboard: Epic zaehlt dort je Team. Bei einem Duo
// steht "9 Elims" fuer beide zusammen, und wer davon acht geholt hat, ist
// daraus nicht zu erfahren. Genau deshalb sammelt das Werkzeug ohnehin schon
// die Replays ein (scripts/replays-holen.mjs); dort steht jeder einzelne
// Abschuss mit Taeter, Opfer, Waffe und Zeit, und der planmaessige Lauf legt
// daraus je Spieltag ein _aggregat.json an.
//
// Diese Schnittstelle liest dieses Aggregat und gibt es mit den gepflegten
// Namen heraus. Gerechnet wird hier nichts nach - was der Sammler
// festgehalten hat, gilt.
//
// Ohne ausgewertete Replays gibt es hier nichts, und dann steht das auch so
// da, statt Teamwerte als Spielerwerte auszugeben.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ABLAGE = path.join(DATEN_ORT, 'replays');

/** Das alte Namensverzeichnis - nur noch, wenn Epic einen Namen nicht herausgibt. */
async function verzeichnis(): Promise<Map<string, string>> {
  const karte = new Map<string, string>();
  try {
    const roh = JSON.parse(await fs.readFile(path.join(DATEN_ORT, 'spieler-namen.json'), 'utf8')) as Record<string, { haupt?: string; namen?: string[] }>;
    for (const [id, e] of Object.entries(roh)) { const n = e.haupt || e.namen?.[0]; if (n) karte.set(id, n); }
  } catch { /* kein Verzeichnis da */ }
  return karte;
}

/**
 * Die Namen der Player Stats: das gepflegte Profil, sonst der heutige Epic-Name, ganz (Betreiber, 29.10.2026: "Edgy Axolo, du hast Edgy Ox ... wieso
 * wird sein Name immer abgeschnitten" - das alte Verzeichnis fuehrte einen gekuerzten Namen). Die Pros stehen taeglich erneuert in epic-namen.json, alle
 * anderen fragt namenNachholen bei Epic; erst wenn Epic schweigt, das Verzeichnis.
 */
async function namen(): Promise<Map<string, string>> {
  const karte = new Map<string, string>();
  try {
    const roh = JSON.parse(await fs.readFile(path.join(DATEN_ORT, 'epic-namen.json'), 'utf8')) as Record<string, string>;
    for (const [id, n] of Object.entries(roh)) if (n) karte.set(id, n);
  } catch { /* noch keine erneuerten Namen */ }

  // Ein selbst gepflegtes Profil schlaegt das Verzeichnis - der Betreiber
  // entscheidet, wie jemand heisst.
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'spieler-profile.json'), 'utf8')) as
      Record<string, { id?: string; name?: string; anzeige?: string; land?: string }>;
    for (const [schluessel, pr] of Object.entries(roh)) {
      const id = pr.id || (/^[0-9a-f]{32}$/i.test(schluessel) ? schluessel : '');
      const n = pr.anzeige || pr.name;
      if (id && n) karte.set(id, n);
    }
  } catch { /* noch keine Profile */ }

  return karte;
}

/** Die Laender aus den gepflegten Profilen - fuer die Flagge in der Liste. */
async function laender(): Promise<Map<string, string>> {
  const karte = new Map<string, string>();
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'spieler-profile.json'), 'utf8')) as
      Record<string, { id?: string; land?: string }>;
    for (const [schluessel, pr] of Object.entries(roh)) {
      const id = pr.id || (/^[0-9a-f]{32}$/i.test(schluessel) ? schluessel : '');
      if (id && pr.land) karte.set(id, pr.land);
    }
  } catch { /* noch keine Profile */ }
  return karte;
}

/**
 * Wann der Sammler zuletzt gelaufen ist - und ob er durchkam.
 *
 * scripts/replays-holen.mjs legt das nach jedem Lauf ab. Ohne diese Angabe
 * stand in der Oberflaeche nur "noch keine Replays, die kommen planmaessig".
 * Das war einmal schlicht falsch: der Lauf fragte auf dem falschen Port ins
 * Leere und holte tagelang nichts, waehrend die Oberflaeche zum Warten riet.
 */
async function letzterLauf() {
  try {
    return JSON.parse(await fs.readFile(
      path.join(ABLAGE, '_lauf.json'), 'utf8')) as {
        zeitpunkt?: string; art?: string; ok?: boolean; fehler?: string;
      };
  } catch { return null; }
}

/** Namen bei Epic fuer Konten, die das Verzeichnis nicht kennt (100 je Anfrage, siehe loeseNamenAuf). */
async function namenNachholen(ids: string[], anzeige: Map<string, string>): Promise<void> {
  const offen = [...new Set(ids)].filter((id) => id && !anzeige.has(id));
  if (!offen.length) return;
  try {
    const { getToken, loeseNamenAuf } = await import('@/lib/epicCups');
    const { token } = await getToken();
    const aufgeloest = await loeseNamenAuf(offen, token);
    for (const [id, name] of Object.entries(aufgeloest)) {
      // Was Epic nicht kennt, kommt als gekuerzte Id zurueck - die soll nicht als Name durchgehen.
      if (name && name !== id.slice(0, 8)) anzeige.set(id, name);
    }
  } catch { /* ohne Epic-Anmeldung bleibt die gekuerzte Id stehen */ }
  // Was Epic nicht herausgab: der Name aus dem alten Verzeichnis, besser als die gekuerzte Id.
  const fehlt = offen.filter((id) => !anzeige.has(id));
  if (fehlt.length) {
    const alt = await verzeichnis();
    for (const id of fehlt) { const n = alt.get(id); if (n) anzeige.set(id, n); }
  }
}

/*
 * Eine Kennzahl ganz (Betreiber, 29.10.2026: "wenn ich Fullscreen gehe und auf All druecke, soll es wirklich alle laden, also bei Open Cups ...
 * alle 10.000 Spieler"). Sortiert wird ueber alle Spieler mit einem Wert; heraus geht eine Seite, mit dem Platz in dieser Kennzahl.
 */
type Zeile = Record<string, unknown> & { epicId: string };
const KLEIN_BESSER = new Set<string>([]);
function seiteVon<T extends Zeile>(alle: T[], feld: string, seite: number, pro: number, treffer: ((z: T) => boolean) | null) {
  const wert = (z: T) => Number(z[feld === 'elims' ? 'kills' : feld]);
  const sortiert = alle.filter((z) => Number.isFinite(wert(z)) && wert(z) > 0)
    .sort((a, b) => (KLEIN_BESSER.has(feld) ? wert(a) - wert(b) : wert(b) - wert(a)))
    .map((z, i) => ({ ...z, statRang: i + 1 }));
  const gefiltert = treffer ? sortiert.filter(treffer) : sortiert;
  const seiten = Math.max(1, Math.ceil(gefiltert.length / pro));
  const nr = Math.min(Math.max(1, seite), seiten);
  return { gesamt: sortiert.length, gefunden: gefiltert.length, seiten, seite: nr, zeilen: gefiltert.slice((nr - 1) * pro, nr * pro) };
}

async function holeRoh(request: Request) {
  const p = new URL(request.url).searchParams;
  const fenster = p.get('window');
  if (p.get('frisch') === '1') verwerfeReplayTage();
  if (!fenster) {
    return NextResponse.json({ error: 'window ist noetig' }, { status: 400 });
  }
  const saison = p.get('saison')
    ?? /^(S\d+)_/i.exec(fenster)?.[1]?.toUpperCase() ?? '';

  // Das Finale der Globals: beide Tage (siehe ausSzene).
  const event = p.get('event');
  const kennzahl = (p.get('kennzahl') ?? '').trim();
  const seite = Number(p.get('seite')) || 1;
  const pro = Math.min(Math.max(Number(p.get('pro')) || 50, 10), 200);
  // Mehrere Tage eines Finales zusammen (?windows=a,b, Betreiber 28.10.2026: kumulatives Turnier); sonst nur der Spieltag - oder bei den Globals ihre zwei Tage.
  const tageWunsch = (p.get('windows') ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6);
  const tage = tageWunsch.length > 1 ? tageWunsch : istGlobalsEvent(event, fenster) && !istGlobalsFenster(fenster)
    ? GLOBALS_TAGE.map((t) => t.windowId) : [fenster];

  /*
   * Die Werte der Szene-Quelle (Damage, Treffer, Material, Zeit ...) gibt es
   * zu jedem Spieltag, den sie fuehrt - Finals, Cash Cups, LANs; es sind
   * hoechstens ein paar hundert Spieler. Der Betreiber (28.9.2026): die
   * Player Stats "bei jedem alten und zukuenftigen Cup ... immer". Wo es sie
   * gibt, gehen sie vor, die Knocks kommen aus den Replays dazu. Sonst die
   * Replays allein (Kills, Knocks, Tode).
   */
  const [anzeige, land] = await Promise.all([namen(), laender()]);
  const rep = tage.length === 1 && saison ? await replayTag(saison, fenster) : (tageWunsch.length > 1 && saison ? await replayTage(saison, tageWunsch) : null);
  const szene = await ausSzene(tage, anzeige, land).catch(() => null);
  if (szene) {
    if (rep?.spieler.length) {
      const ausRep = new Map(rep.spieler.map((x) => [x.epicId, x]));
      for (const x of szene.spieler) {
        const r = ausRep.get(x.epicId);
        x.knocks = r?.knocks ?? x.knocks;
        // Wie bei allen anderen Cups: Eliminierungen je Match und K/D (Tode aus den Replays), ab fuenf Spielen.
        if (r) x.tode = r.gestorben;
        // Im Finale spielt jeder alle Spiele - dort reicht die Zahl der Spiele des Finales (Performance: vier).
        if (x.spiele >= Math.min(5, szene.runden || 5)) Object.assign(x, { elimsJeMatch: x.kills / x.spiele, ...(r ? { kd: x.kills / Math.max(1, r.gestorben) } : {}) });
      }
    }
    if (kennzahl) {
      const q = (p.get('q') ?? '').trim().toLowerCase();
      return NextResponse.json({ kennzahl, ...seiteVon(szene.spieler.map((x) => ({ ...x, elims: x.kills })), kennzahl, seite, pro,
        q ? (z) => String(z.name ?? '').toLowerCase().includes(q) : null) });
    }
    return NextResponse.json({ ...szene, gesamt: szene.spieler.length });
  }
  if (!rep?.spieler.length) {
    // Noch keine Werte je Spieler: der Spieltag bekommt Vorrang bei den Replay-Rechnern, und die Seite zeigt, wie weit die Auswertung ist (lib/replayVorrang).
    if (tage.length === 1 && saison) void vorrangAnfordern(fenster, event);
    return NextResponse.json({
      vorhanden: false, spieler: [], runden: 0, lauf: await letzterLauf(),
      stand: tage.length === 1 && saison ? await auswertungsStand(saison, fenster) : null,
      vorrang: tage.length === 1 && !!saison,
    });
  }

  /*
   * Nur die Zeilen, die gezeigt werden.
   *
   * Ein offener Cup hat bis zu 85.000 Spieler mit Kill oder Knock. Alle an
   * den Browser zu schicken und alle Namen bei Epic zu erfragen (tausend
   * Abfragen) waere fuer die Seite wie fuer Render zu viel. Es gehen die
   * besten `limit` heraus; eine Suche (`q`) sucht auf dem Server im ganzen
   * Feld - in den bekannten Namen und, ueber Epics Namensaufloesung, nach dem
   * genauen Epic-Namen, auch weit hinter Platz 10.000.
   */
  const limit = Math.min(Math.max(Number(p.get('limit')) || 500, 50), 2000);
  const q = (p.get('q') ?? '').trim().toLowerCase();
  let auswahl = rep.spieler;
  if (q) {
    const ids = new Set(rep.spieler
      .filter((x) => (anzeige.get(x.epicId) ?? '').toLowerCase().includes(q) || x.epicId === q)
      .map((x) => x.epicId));
    if (q.length >= 3) {
      try {
        const { getToken } = await import('@/lib/epicCups');
        const { token } = await getToken();
        const r = await fetch('https://account-public-service-prod.ol.epicgames.com/account/api/public/account/displayName/'
          + encodeURIComponent(q), { headers: { Authorization: token }, signal: AbortSignal.timeout(8_000) });
        if (r.ok) {
          const konto = await r.json() as { id?: string; displayName?: string };
          if (konto.id) { ids.add(konto.id); if (konto.displayName) anzeige.set(konto.id, konto.displayName); }
        }
      } catch { /* ohne Epic bleibt es bei den bekannten Namen */ }
    }
    auswahl = rep.spieler.filter((x) => ids.has(x.epicId));
  }
  /*
   * Solo Clutch Points auch hier, wo sie fuer diesen Spieltag gerechnet sind
   * (.github/workflows/clutch-rechnen.yml, jeder Team-Spieltag bis 60
   * Matches). Der Betreiber: "Clutch Points muessen immer dort sein."
   */
  type ClutchDatei = {
    summe?: Record<string, number>;
    schaden?: Record<string, { dmg: number; erlitten: number; treffer: number; krit: number; sturm?: number; wiederbelebt?: number; rebootet?: number }>;
    /** Ueberlebenszeit je Spieler in Sekunden (scripts/clutch-leben.mjs). */
    leben?: Record<string, number>;
    /** Wie viele Spiele je Spieler gelesen sind. */
    spiele?: Record<string, number>;
    /** Noch nicht jedes Match voll gelesen (scripts/clutch-zusammen.mjs) - Werte nur bei Spielern, deren Spiele alle gelesen sind. */
    teilweise?: { teams: number; matches: number; vonMindestens?: number };
    /** Plattform je Spieler aus den vollen Replays (WIN, PS5, XSX, SWT, IOS ...). */
    plattform?: Record<string, string>;
  } | null;
  const clutchEinzeln = (w: string) => liesJson<ClutchDatei>(`clutch/${w}.json`, null).catch(() => null);
  // Mehrere Tage zusammen: Clutch-Punkte und Schaden je Spieler addiert.
  const clutchDatei: ClutchDatei = tage.length > 1
    ? (await Promise.all(tage.map(clutchEinzeln))).reduce<ClutchDatei>((a, c) => {
      // Teilweise gelesene Tage (grosse offene Runden) taugen nicht fuer Summen ueber mehrere Tage.
      if (!c || c.teilweise) return a;
      const raus = a ?? { summe: {}, schaden: {}, leben: {} };
      for (const [id, v] of Object.entries(c.leben ?? {})) raus.leben![id] = (raus.leben![id] ?? 0) + v;
      for (const [id, v] of Object.entries(c.summe ?? {})) raus.summe![id] = (raus.summe![id] ?? 0) + v;
      for (const [id, d] of Object.entries(c.schaden ?? {})) {
        const da = raus.schaden![id] ?? { dmg: 0, erlitten: 0, treffer: 0, krit: 0, sturm: 0, wiederbelebt: 0, rebootet: 0 };
        raus.schaden![id] = {
          dmg: da.dmg + d.dmg, erlitten: da.erlitten + d.erlitten, treffer: da.treffer + d.treffer, krit: da.krit + d.krit,
          sturm: (da.sturm ?? 0) + (d.sturm ?? 0), wiederbelebt: (da.wiederbelebt ?? 0) + (d.wiederbelebt ?? 0), rebootet: (da.rebootet ?? 0) + (d.rebootet ?? 0),
        };
      }
      return raus;
    }, null)
    : await clutchEinzeln(fenster);
  // Leer bei Solo-Tagen (dort gibt es keine Clutch-Punkte) - dann gar keine Zahl.
  const clutchVon = clutchDatei?.summe && Object.keys(clutchDatei.summe).length
    ? new Map(Object.entries(clutchDatei.summe)) : null;
  /*
   * Schaden, Treffer und Kopftreffer aus den vollen Replays, wo der Spieltag
   * gelesen ist (tools/replay-voll, SchadenLeser) - gezaehlt ohne Treffer auf
   * Umgehauene; an den Globals gegen Epics Werte geprueft: im Mittel 6 %
   * darunter. Die Anzeige sagt, dass es gezaehlt ist.
   */
  const schadenVon = clutchDatei?.schaden ? new Map(Object.entries(clutchDatei.schaden)) : null;
  // Im Solo ohne Reload gibt es weder Reboot noch Wiederbeleben (Betreiber, 31.10.2026: "wie kann es in einem Solo-Cup Reboots geben?").
  const soloOhneReload = !tage.some((w) => /reload/i.test(w))
    && (rep?.teams?.length ? rep.teams.every((x) => (x.spieler?.length ?? 1) <= 1) : tage.every((w) => /solo/i.test(w)));
  // Bei einem teilweise gelesenen Spieltag zaehlt ein Wert nur, wenn jedes Spiel dieses Spielers gelesen ist - sonst waere er zu niedrig.
  const teil = clutchDatei?.teilweise ?? null;
  const ganzGelesen = (id: string, spiele: number) => !teil || (clutchDatei?.spiele?.[id.toLowerCase()] ?? 0) >= spiele;
  const lebenVon = clutchDatei?.leben && Object.keys(clutchDatei.leben).length ? new Map(Object.entries(clutchDatei.leben)) : null;
  /*
   * Plattformen des Spieltags (Betreiber, 30.10.2026: einbauen, wenn es echte Statistiken sind): aus dem Feld Platform jedes vollen Replays, je Spieler
   * einmal gezaehlt - nur wenn jedes Match gelesen ist; ein halb gelesener Spieltag zeigte ein schiefes Bild.
   */
  const plattformen = (() => {
    const p = tage.length > 1 ? null : clutchDatei?.plattform;
    if (!p || teil || !Object.keys(p).length) return null;
    const GRUPPE: Record<string, string> = { WIN: 'PC', MAC: 'Mac', PS5: 'PlayStation', PSN: 'PlayStation', PS4: 'PlayStation', XSX: 'Xbox', XBL: 'Xbox', XB1: 'Xbox',
      SWT: 'Switch', SWT2: 'Switch', IOS: 'iOS', AND: 'Android' };
    const raus: Record<string, number> = {};
    for (const code of Object.values(p)) { const g = GRUPPE[code.toUpperCase()] ?? code; raus[g] = (raus[g] ?? 0) + 1; }
    return raus;
  })();

  /** Alle Werte eines Spielers aus Replays und vollen Replays - ohne Namen und Team (die kommen nur fuer gezeigte Zeilen dazu). */
  const werte = (x: (typeof rep.spieler)[number]) => ({
    epicId: x.epicId,
    spiele: x.matches,
    kills: x.kills,
    elims: x.kills,
    knocks: x.knocks,
    tode: x.gestorben,
    umgehauen: x.umgehauen,
    // Erst ab fuenf Spielen - sonst fuehrt einer mit einem einzigen guten Spiel.
    ...(x.matches >= 5 ? { elimsJeMatch: x.kills / x.matches, kd: x.kills / Math.max(1, x.gestorben) } : {}),
    clutch: clutchVon && ganzGelesen(x.epicId, x.matches) ? (clutchVon.get(x.epicId.toLowerCase()) ?? 0) : null,
    // Ueberlebenszeit ab dem Absprung, ohne die Zeit zwischen Tod und Reboot (lib/clutchLeben.mjs; Median 0,3 % neben der Szene-Quelle).
    ...(lebenVon && ganzGelesen(x.epicId, x.matches) && lebenVon.has(x.epicId.toLowerCase()) ? { timeAlive: lebenVon.get(x.epicId.toLowerCase()) } : {}),
    ...(() => {
      const d = schadenVon?.get(x.epicId.toLowerCase());
      if (!d || !ganzGelesen(x.epicId, x.matches)) return {};
      return {
        damage: Math.round(d.dmg), damageTaken: Math.round(d.erlitten),
        // Dasselbe Feld wie die Szene-Quelle (quote) - so liest die Kachel "Damage Ratio" beide.
        damageRatio: d.erlitten > 0 ? d.dmg / d.erlitten : null, quote: d.erlitten > 0 ? d.dmg / d.erlitten : null,
        hits: d.treffer, headshots: d.krit, schadenAusReplay: true,
        // Zeit im Sturm und Reboots/Revives aus demselben Lauf (an vier Finals gegen die Szene-Werte geprueft, 95-100 von 100).
        ...(typeof d.sturm === 'number' ? { timeInStorm: Math.round(d.sturm) } : {}),
        ...(typeof d.wiederbelebt === 'number' && !soloOhneReload ? { reboots: (d.wiederbelebt ?? 0) + (d.rebootet ?? 0) } : {}),
      };
    })(),
  });

  /** Team (Platz, Mitspieler) fuer eine Menge Spieler. */
  const teamsFuer = (ids: Set<string>) => {
    const raus = new Map<string, { partner: string[]; platz: number | null }>();
    for (const t of rep.teams ?? []) {
      if (!(t.spieler ?? []).some((id) => ids.has(id))) continue;
      for (const id of t.spieler ?? []) {
        raus.set(id, { partner: (t.spieler ?? []).filter((x) => x !== id), platz: typeof t.platz === 'number' ? t.platz : null });
      }
    }
    return raus;
  };

  // Eine Kennzahl ganz, seitenweise - ueber alle Spieler des Spieltags, nicht nur die gezeigten.
  if (kennzahl) {
    const imFeld = q ? new Set(auswahl.map((x) => x.epicId)) : null;
    const s1 = seiteVon(rep.spieler.map(werte), kennzahl, seite, pro, imFeld ? (z) => imFeld.has(z.epicId) : null);
    const ids = new Set(s1.zeilen.map((z) => z.epicId));
    const teams = teamsFuer(ids);
    await namenNachholen([...ids, ...[...ids].flatMap((id) => teams.get(id)?.partner ?? [])], anzeige);
    return NextResponse.json({
      kennzahl, ...s1, schadenTeil: teil,
      zeilen: s1.zeilen.map((z) => ({
        ...z, name: anzeige.get(z.epicId) ?? z.epicId.slice(0, 8), land: land.get(z.epicId) ?? '',
        platz: teams.get(z.epicId)?.platz ?? null,
        partner: (teams.get(z.epicId)?.partner ?? []).map((id) => anzeige.get(id) ?? id.slice(0, 8)),
      })),
    });
  }

  // Die besten nach Eliminierungen - dazu die Spitze bei Knocks, Eliminierungen je Match und K/D (ab fuenf Spielen), damit jede Bestenliste stimmt.
  const gezeigt = (() => {
    const basis = auswahl.slice(0, limit);
    if (q) return basis;
    const drin = new Set(basis.map((x) => x.epicId));
    const mit = (liste: typeof auswahl) => { for (const x of liste) if (!drin.has(x.epicId)) { drin.add(x.epicId); basis.push(x); } };
    const genug = rep.spieler.filter((x) => x.matches >= 5);
    mit([...rep.spieler].sort((a, b) => b.knocks - a.knocks).slice(0, 25));
    mit([...genug].sort((a, b) => b.kills / b.matches - a.kills / a.matches).slice(0, 25));
    mit([...genug].sort((a, b) => b.kills / Math.max(1, b.gestorben) - a.kills / Math.max(1, a.gestorben)).slice(0, 25));
    /*
     * Die Spitze jeder Kennzahl aus den vollen Replays (Betreiber, 29.10.2026: "wieso sind die einzigen Stats Elimination, Knocks ... und KD?").
     * Bei grossen Tagen sind nur die besten Teams voll gelesen; die Liste oben (nach Kills) traf deren Spieler oft nicht, und die Kacheln blieben leer.
     */
    const voll = rep.spieler.filter((x) => ganzGelesen(x.epicId, x.matches));
    const spitze = (wert: (x: (typeof voll)[number]) => number | null | undefined) =>
      mit(voll.filter((x) => (wert(x) ?? 0) > 0).sort((a, b) => (wert(b) ?? 0) - (wert(a) ?? 0)).slice(0, 25));
    const sch = (x: (typeof voll)[number]) => schadenVon?.get(x.epicId.toLowerCase());
    if (schadenVon) {
      spitze((x) => sch(x)?.dmg);
      spitze((x) => { const d = sch(x); return d && d.erlitten > 0 ? d.dmg / d.erlitten : null; });
      spitze((x) => sch(x)?.treffer);
      spitze((x) => sch(x)?.sturm);
      if (!soloOhneReload) spitze((x) => { const d = sch(x); return d ? (d.wiederbelebt ?? 0) + (d.rebootet ?? 0) : null; });
    }
    if (clutchVon) spitze((x) => clutchVon.get(x.epicId.toLowerCase()));
    if (lebenVon) spitze((x) => lebenVon.get(x.epicId.toLowerCase()));
    return basis;
  })();

  const zumTeam = teamsFuer(new Set(gezeigt.map((x) => x.epicId)));

  // Namen bei Epic nur fuer die gezeigten Zeilen und ihre Mitspieler.
  const offen = [...new Set([
    ...gezeigt.map((x) => x.epicId),
    ...gezeigt.flatMap((x) => zumTeam.get(x.epicId)?.partner ?? []),
  ])].filter((id) => id && !anzeige.has(id));
  await namenNachholen(offen, anzeige);

  // Der Platz im ganzen Feld (nach Kills) - auch fuer Treffer einer Suche.
  const rangVon = new Map(rep.spieler.map((x, i) => [x.epicId, i + 1]));
  const spieler = gezeigt.map((x, i) => {
    const team = zumTeam.get(x.epicId);
    return {
      ...werte(x),
      rang: rangVon ? rangVon.get(x.epicId) ?? null : i + 1,
      name: anzeige.get(x.epicId) ?? x.epicId.slice(0, 8),
      land: land.get(x.epicId) ?? '',
      platz: team?.platz ?? null,
      partner: (team?.partner ?? []).map((id) => anzeige.get(id) ?? id.slice(0, 8)),
    };
  });

  /** Die Summen ueber alle Spieler des Spieltags (nicht nur die gezeigten) - fuer die Kacheln oben unter "Alle Spieler". */
  const summen = q ? null : rep.spieler.reduce((a, x) => {
    a.spiele += x.matches || 0; a.elims += x.kills || 0; a.knocks += x.knocks || 0; a.tode += x.gestorben || 0; a.umgehauen += x.umgehauen || 0;
    return a;
  }, { spiele: 0, elims: 0, knocks: 0, tode: 0, umgehauen: 0 });

  return NextResponse.json({
    vorhanden: true,
    clutch: !!clutchVon,
    schadenAusReplay: !!schadenVon,
    runden: rep.matches ?? 0,
    rundenGesamt: rep.rundenGesamt,
    gerechnet: rep.gerechnet ?? null,
    aktualisiert: rep.gerechnet ?? null,
    spieler,
    /** Wie viele Spieler mit Kill oder Knock es insgesamt gibt - gezeigt sind die besten. */
    gesamt: q ? auswahl.length : rep.spieler.length,
    gekuerzt: !q && rep.spieler.length > gezeigt.length,
    summen,
    schadenTeil: teil,
    plattformen,
    suche: q || null,
    hinweis: 'Counted from the replays of this match day, per player.',
  });
}

export async function GET(request: Request) {
  return zwischenspeichern(await holeRoh(request), 60);
}
