import { NextResponse } from 'next/server';
import fs from '@/lib/ablageFs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';
import { zwischenspeichern } from '@/lib/zwischenspeicher';
import { szeneFenster, epicTag } from '@/lib/szeneStats';
import { liesLanKonten } from '@/lib/lanKonten';
import { liesJson } from '@/lib/ablage';
import { GLOBALS_TAGE, istGlobalsEvent, istGlobalsFenster } from '@/lib/globalsCup';
import { replayTag } from '@/lib/replaySchlank';

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
  for (const w of tage) {
    const c = await liesJson<{ summe?: Record<string, number> } | null>(`clutch/${w}.json`, null).catch(() => null);
    if (!c?.summe) continue;
    clutchDa = true;
    for (const [id, pkt] of Object.entries(c.summe)) {
      const e = echtVon(id);
      clutch.set(e, (clutch.get(e) ?? 0) + pkt);
    }
  }

  const nameVon = (id: string) => anzeige.get(id)
    ?? sz.spieler.find((x) => x.epicId === id)?.username ?? id.slice(0, 8);
  const spieler = sz.spieler.map((x) => {
    const t = teamVon.get(x.epicId);
    const spiele = x.matchesPlayed || sz.matches || 0;
    return {
      epicId: x.epicId,
      name: nameVon(x.epicId),
      land: land.get(x.epicId) ?? '',
      spiele,
      kills: x.eliminations ?? 0,
      knocks: 0, tode: 0, umgehauen: 0,
      assists: x.assists ?? 0,
      damage: Math.round(x.damageDealt ?? 0),
      damageTaken: Math.round(x.damageTakenFromPlayers ?? 0),
      // Ausgeteilter geteilt durch von Spielern erlittenen Schaden - dieselbe
      // Rechnung wie ueberall im Werkzeug (lib/szeneStats, "quote"). Das Feld
      // "damageRatio" der Quelle passt zu keiner Formel (siehe dort).
      damageRatio: x.damageTakenFromPlayers ? (x.damageDealt ?? 0) / x.damageTakenFromPlayers : null,
      genauigkeit: x.shots ? ((x.hitsToPlayers ?? 0) / x.shots) * 100 : null,
      clutch: clutchDa ? (clutch.get(x.epicId) ?? 0) : null,
      // Fuer die Kacheln (app/components/StatKacheln) - dieselben Summen wie
      // in der Statistik (lib/szeneStats): Meter, Sekunden, Stueck.
      hits: x.hitsToPlayers ?? 0,
      headshots: x.headshots ?? 0,
      mats: (x.woodFarmed ?? 0) + (x.stoneFarmed ?? 0) + (x.metalFarmed ?? 0),
      builds: (x.woodBuildsPlaced ?? 0) + (x.stoneBuildsPlaced ?? 0) + (x.metalBuildsPlaced ?? 0),
      distanz: (x.distanceOnFoot ?? 0) + (x.distanceSkydiving ?? 0),
      timeInStorm: x.timeInStorm ?? 0,
      timeAlive: x.timeAlive ?? 0,
      // Fuer die Uebersicht (Show More) - was die Quelle je Spieler fuehrt.
      shots: x.shots ?? 0,
      reboots: x.rebootsAndRevives ?? 0,
      fallDamage: Math.round(x.fallDamage ?? 0),
      stormDamage: Math.round(x.stormDamage ?? 0),
      healthHealed: Math.round(x.healthHealed ?? 0),
      shieldHealed: Math.round(x.shieldHealed ?? 0),
      platz: t?.platz ?? null,
      partner: (t?.spieler ?? []).filter((id) => id !== x.epicId).map(nameVon),
    };
  }).sort((a, b) => b.damage - a.damage);
  return { vorhanden: true, quelle: 'szene', runden: sz.matches, rundenGesamt: sz.matches, lauf: null, clutch: clutchDa, spieler };
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

/** Die gepflegten Anzeigenamen - dieselben wie ueberall sonst im Werkzeug. */
async function namen(): Promise<Map<string, string>> {
  const karte = new Map<string, string>();
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'spieler-namen.json'), 'utf8')) as
      Record<string, { haupt?: string; namen?: string[] }>;
    for (const [id, e] of Object.entries(roh)) {
      const n = e.haupt || e.namen?.[0];
      if (n) karte.set(id, n);
    }
  } catch { /* kein Verzeichnis da */ }

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

async function holeRoh(request: Request) {
  const p = new URL(request.url).searchParams;
  const fenster = p.get('window');
  if (!fenster) {
    return NextResponse.json({ error: 'window ist noetig' }, { status: 400 });
  }
  const saison = p.get('saison')
    ?? /^(S\d+)_/i.exec(fenster)?.[1]?.toUpperCase() ?? '';

  // Das Finale der Globals: beide Tage (siehe ausSzene).
  const event = p.get('event');
  const tage = istGlobalsEvent(event, fenster) && !istGlobalsFenster(fenster)
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
  const rep = tage.length === 1 && saison ? await replayTag(saison, fenster) : null;
  const szene = await ausSzene(tage, anzeige, land).catch(() => null);
  if (szene) {
    if (rep?.spieler.length) {
      const knocks = new Map(rep.spieler.map((x) => [x.epicId, x.knocks]));
      for (const x of szene.spieler) x.knocks = knocks.get(x.epicId) ?? x.knocks;
    }
    return NextResponse.json({ ...szene, gesamt: szene.spieler.length });
  }
  if (!rep?.spieler.length) {
    return NextResponse.json({
      vorhanden: false, spieler: [], runden: 0, lauf: await letzterLauf(),
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
  const gezeigt = auswahl.slice(0, limit);

  const zumTeam = new Map<string, { partner: string[]; platz: number | null }>();
  const gesucht = new Set(gezeigt.map((x) => x.epicId));
  for (const t of rep.teams ?? []) {
    if (!(t.spieler ?? []).some((id) => gesucht.has(id))) continue;
    for (const id of t.spieler ?? []) {
      zumTeam.set(id, {
        partner: (t.spieler ?? []).filter((x) => x !== id),
        platz: typeof t.platz === 'number' ? t.platz : null,
      });
    }
  }

  // Namen bei Epic nur fuer die gezeigten Zeilen und ihre Mitspieler.
  const offen = [...new Set([
    ...gezeigt.map((x) => x.epicId),
    ...gezeigt.flatMap((x) => zumTeam.get(x.epicId)?.partner ?? []),
  ])].filter((id) => id && !anzeige.has(id));
  if (offen.length) {
    try {
      const { getToken, loeseNamenAuf } = await import('@/lib/epicCups');
      const { token } = await getToken();
      const aufgeloest = await loeseNamenAuf(offen, token);
      for (const [id, name] of Object.entries(aufgeloest)) {
        // Was Epic nicht kennt, kommt als gekuerzte Id zurueck - die soll
        // nicht als Name durchgehen.
        if (name && name !== id.slice(0, 8)) anzeige.set(id, name);
      }
    } catch { /* ohne Epic-Anmeldung bleibt die gekuerzte Id stehen */ }
  }

  // Der Platz im ganzen Feld (nach Kills) - auch fuer Treffer einer Suche.
  const rangVon = q ? new Map(rep.spieler.map((x, i) => [x.epicId, i + 1])) : null;
  const spieler = gezeigt.map((x, i) => {
    const team = zumTeam.get(x.epicId);
    return {
      rang: rangVon ? rangVon.get(x.epicId) ?? null : i + 1,
      epicId: x.epicId,
      name: anzeige.get(x.epicId) ?? x.epicId.slice(0, 8),
      land: land.get(x.epicId) ?? '',
      spiele: x.matches,
      kills: x.kills,
      knocks: x.knocks,
      tode: x.gestorben,
      umgehauen: x.umgehauen,
      platz: team?.platz ?? null,
      partner: (team?.partner ?? []).map((id) => anzeige.get(id) ?? id.slice(0, 8)),
    };
  });

  return NextResponse.json({
    vorhanden: true,
    runden: rep.matches ?? 0,
    rundenGesamt: rep.rundenGesamt,
    gerechnet: rep.gerechnet ?? null,
    aktualisiert: rep.gerechnet ?? null,
    spieler,
    /** Wie viele Spieler mit Kill oder Knock es insgesamt gibt - gezeigt sind die besten. */
    gesamt: q ? auswahl.length : rep.spieler.length,
    gekuerzt: !q && rep.spieler.length > gezeigt.length,
    suche: q || null,
    hinweis: 'Counted from the replays of this match day, per player.',
  });
}

export async function GET(request: Request) {
  return zwischenspeichern(await holeRoh(request), 60);
}
