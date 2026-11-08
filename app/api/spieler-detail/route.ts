import { NextResponse } from 'next/server';
import { promises as nodeFs } from 'fs';
import path from 'path';
import { gunzipSync } from 'zlib';
import { DATEN_ORT } from '@/lib/datenOrt';
import { findeSpieler, holeSeite, getToken, loeseNamenAuf, MAX_PAGES, type CupEintrag } from '@/lib/epicCups';
import { szeneFenster } from '@/lib/szeneStats';
import { zwischenspeichern } from '@/lib/zwischenspeicher';
import { replayTag } from '@/lib/replaySchlank';
import { liesJson, liesBereich } from '@/lib/ablage';
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

/*
 * Die ganze Bestenliste aus dem Vorrat (app/api/cup-leaderboard legt sie gepackt auf die Platte): die Suche braucht damit keine Abfrage bei Epic mehr. Vorher las sie bis zu sechzig Seiten
 * bei Epic, ehe "nicht gefunden" kam (7.11.2026: 2,8 Sekunden). Die letzten drei Spieltage bleiben zwei Minuten im Speicher.
 */
type GanzeZeile = { rank: number; points: number; players?: Array<{ id: string; name: string }> };
const LISTEN = new Map<string, { bis: number; zeilen: GanzeZeile[] }>();
async function ganzeListe(w: string): Promise<GanzeZeile[] | null> {
  const da = LISTEN.get(w);
  if (da && da.bis > Date.now()) return da.zeilen;
  try {
    const datei = path.join(DATEN_ORT, 'vorrat', 'bestenliste-ganz', `${w.replace(/[^\w.-]/g, '_')}.json.gz`);
    const d = JSON.parse(gunzipSync(await nodeFs.readFile(datei)).toString('utf8')) as { entries?: GanzeZeile[] };
    if (!d.entries?.length) return null;
    if (LISTEN.size >= 3) LISTEN.delete(LISTEN.keys().next().value as string);
    LISTEN.set(w, { bis: Date.now() + 120_000, zeilen: d.entries });
    return d.entries;
  } catch { return null; }
}

/** Die Konten zu einem Namen aus dem Verzeichnis der Szene - leer, wenn es keines kennt oder nicht antwortet. */
async function kontenZumNamen(origin: string, q: string): Promise<Array<{ id: string; name: string }>> {
  // Zuerst der Server selbst: hinter dem Tunnel fuehrt die Adresse der Anfrage ins Leere, und die Suche kannte dann keinen einzigen Spieler aus dem Verzeichnis (7.11.2026: Glubschi).
  for (const basis of [`http://127.0.0.1:${process.env.PORT || 3100}`, origin]) {
    try {
      const r = await fetch(`${basis}/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
      if (!r.ok) continue;
      const j = await r.json() as { spieler?: Array<{ epicId?: string; name?: string }> };
      if (Array.isArray(j.spieler)) return j.spieler.filter((x) => x.epicId).map((x) => ({ id: x.epicId!, name: x.name ?? '' })).slice(0, 25);
    } catch { /* naechste Adresse */ }
  }
  return [];
}

/** Dieselbe Streuung wie lib/jeSpiel.mjs (FNV-1a, 256 Stuecke). */
function jeStueck(id: string): number {
  let h = 2166136261;
  const s = id.toLowerCase();
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h % 256;
}
type JeZeile = Array<string | number | null>;
/** Die alten Zeilen (nur kleine Spieltage, bis 7.11.2026). */
const ALTE_SPALTEN = ['killsEcht', 'dmg', 'erlitten', 'heilHp', 'schildHeilEcht', 'krit', 'treffer', 'schussEcht', 'matsAlt'];
/**
 * Die Werte je Match der Spieler einer Ansicht (Kurven wie bei Osirion): aus clutch-je/<Fenster>.json nur die Stuecke dieser Spieler, als Teilanfrage.
 */
async function jeSpielHolen(fenster: string, clutch: unknown, ids: string[]): Promise<{ spalten: string[]; zeilen: Map<string, JeZeile[]> }> {
  const c = clutch as { je?: { spalten: string[]; lage: Array<[number, number]> }; jeSpiel?: Record<string, JeZeile[]> } | null;
  const zeilen = new Map<string, JeZeile[]>();
  const je = c?.je;
  if (je?.lage?.length) {
    const stuecke = new Map<number, Record<string, JeZeile[]>>();
    await Promise.all([...new Set(ids.map(jeStueck))].map(async (s) => {
      const [a, l] = je.lage[s] ?? [0, 0];
      if (!l) return;
      const b = await liesBereich(`clutch-je/${fenster}.json`, a, l).catch(() => null);
      if (!b) return;
      try { stuecke.set(s, JSON.parse(b.toString('utf8'))); } catch { /* ohne Kurven */ }
    }));
    for (const i of ids) { const z = stuecke.get(jeStueck(i))?.[i]; if (z) zeilen.set(i, z); }
    return { spalten: je.spalten, zeilen };
  }
  for (const i of ids) if (c?.jeSpiel?.[i]) zeilen.set(i, c.jeSpiel[i]);
  return { spalten: ALTE_SPALTEN, zeilen };
}

export interface ReplayWerte { kills: number | null; knocks: number | null; tode: number | null; spiele: number | null; farmHolz?: number; farmStein?: number; farmMetall?: number; samHolz?: number; samStein?: number; samMetall?: number; killsNachAus?: number; jeSpiel?: Array<Array<string | number | null>>; schussEcht?: number; editOk?: number; schildHeilEcht?: number; schildWegEcht?: number; sturmSchaden?: number; busDank?: number; lebenWeg?: number; schadenAlle?: number; schadenBoden?: number; selbstHolz?: number; selbstStein?: number; selbstMetall?: number; editZahl?: number; editSek?: number; heilHp?: number; schildWeg?: number; schuss?: number; axt?: number; bauHolz?: number; bauStein?: number; bauMetall?: number; clutch?: number; lebenSek?: number; streckeM?: number; damage?: number; damageTaken?: number; hits?: number; headshots?: number; sturmSek?: number; wiederbelebt?: number; rebootet?: number }

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
      const [bekannt, liste] = await Promise.all([kontenZumNamen(new URL(request.url).origin, q), ganzeListe(fenster)]);
      const kandidaten = bekannt.map((x) => x.id);
      // Mit dem Vorrat ist die Antwort sofort da. Nennt das Verzeichnis jemanden, der hier nicht steht, sagt die Seite das - statt nur "nicht gefunden" (Betreiber: "Glubschi").
      if (liste) {
        const ids = new Set(kandidaten.map(normId));
        // Grosses I und kleines l sehen gleich aus und werden gern getauscht: "GIubschii" soll auch auf "glubschi" passen.
        const glatt = (x: string) => x.toLowerCase().replace(/[il1|]/g, 'l');
        const text = glatt(q);
        const treffer = liste.flatMap((e) => (e.players ?? [])
          .filter((pl) => ids.has(normId(pl.id)) || glatt(pl.name ?? '').includes(text))
          .map((pl) => ({ id: pl.id, name: pl.name, rank: e.rank, points: e.points, team: (e.players ?? []).filter((x) => x.id !== pl.id).map((x) => x.name) })))
          .slice(0, 10);
        return NextResponse.json({ ok: true, treffer, bekannt: treffer.length ? [] : bekannt.slice(0, 3).map((x) => x.name).filter(Boolean) }, { headers: { 'Cache-Control': 'no-store' } });
      }
      let r = kandidaten.length
        ? await findeSpieler(event, fenster, [], kandidaten, MAX_PAGES)
        : { entries: [] as CupEintrag[], scannedPages: 0, totalPages: 0 };
      if (!r.entries.length) r = await findeSpieler(event, fenster, [q], [], 60);
      const gesucht = new Set(kandidaten.map(normId));
      const treffer = r.entries.flatMap((e) => e.players
        .filter((pl) => gesucht.has(normId(pl.id)) || pl.name.toLowerCase().includes(q.toLowerCase()))
        .map((pl) => ({ id: pl.id, name: pl.name, rank: e.rank, points: e.points, team: e.players.filter((x) => x.id !== pl.id).map((x) => x.name) })))
        .slice(0, 10);
      return NextResponse.json({ ok: true, treffer, bekannt: treffer.length ? [] : bekannt.slice(0, 3).map((x) => x.name).filter(Boolean), gesucht: r.scannedPages, seiten: r.totalPages }, { headers: { 'Cache-Control': 'no-store' } });
    }

    /*
     * Epic zeigt je Spieltag nur die besten 10.000. Steht der Spieler nicht in der ganzen Liste aus dem Vorrat, waere die Suche durch hundert Seiten bei Epic
     * nur langsam und ebenso leer - dann gleich ohne Eintrag weiter: die Werte kommen aus den Replays, die jedes Match lesen (Betreiber, 8.11.2026: "kann
     * sein, dass ich unter Top 10.000 bin ... sollte trotzdem gehen").
     */
    const vorrat = await ganzeListe(fenster);
    const imVorrat = !vorrat || vorrat.some((e) => (e.players ?? []).some((pl) => normId(pl.id) === id));
    const r = imVorrat ? await findeSpieler(event, fenster, [], [id], MAX_PAGES) : { entries: [] as CupEintrag[] };
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
    const clutch = await liesJson<{ summe?: Record<string, number>; leben?: Record<string, number>; epicZeit?: Record<string, number>; epicTeamZeit?: Record<string, number>; strecke?: Record<string, [number, number]>; epicStrecke?: Record<string, number>; schaden?: Record<string, { dmg: number; erlitten: number; treffer: number; krit: number; sturm?: number; wiederbelebt?: number; rebootet?: number }> } | null>(`clutch/${fenster}.json`, null).catch(() => null);

    // Fenster und Konto werden zu einem Dateinamen - nur das Uebliche zulassen.
    const eigene = fensterOk(fenster) && kontoOk(id) ? await leseErgebnis(fenster, id) : null;
    const eigeneKomplett = !!eigene && eigene.gelesen >= eigene.sitzungen;
    const kontext = await spielerKontext().catch(() => null);
    const soloEpic = !!eintrag && eintrag.players.length === 1;
    const je = await jeSpielHolen(fenster, clutch, ids).catch(() => ({ spalten: ALTE_SPALTEN, zeilen: new Map<string, JeZeile[]>() }));
    const mitglieder = ids.map((i) => {
      const roh = namen.get(i) ?? '';
      const k = kontext?.(i, roh);
      let replay: ReplayWerte | null = null;
      if (rep) {
        const e = rep.spieler.find((x) => normId(x.epicId) === i);
        const d = clutch?.schaden?.[i];
        replay = {
          kills: e?.kills ?? 0, knocks: e?.knocks ?? 0, tode: e ? e.gestorben : null, spiele: e ? e.matches : null,
          /*
           * Solo: der Schaden direkt aus Epics Bestenliste dieses Spielers (frisch bei jedem Abruf; Focus, FNCS Solo Reload: 25.406 zu Osirions 25.455). Die gespeicherte
           * Kopie (epicDmg) war mitten im Cup gezogen worden und stand bei 14.080. Kopftreffer bleiben aus dem Replay: Epic zaehlt 31, Osirion 90, das Replay 89.
           */
          ...(d ? { damage: Math.round(soloEpic && (eintrag?.damage ?? 0) > 0 ? eintrag!.damage : d.dmg), damageTaken: Math.round(d.erlitten), hits: d.treffer, headshots: d.krit } : {}),
          ...(d && typeof d.sturm === 'number' ? { sturmSek: d.sturm < 1e6 ? Math.round(d.sturm) : undefined, wiederbelebt: d.wiederbelebt ?? 0, rebootet: d.rebootet ?? 0 } : {}),
          // Die Osirion-Werte aus dem vollen Auslesen (scripts/clutch-berechnen.mjs).
          ...(d ? (() => {
            const w = d as unknown as Record<string, number | undefined>;
            return typeof w.editZahl === 'number' ? { editZahl: w.editZahl, editSek: Math.round(w.editSek ?? 0), heilHp: Math.round(w.heilHp ?? 0), schildWeg: Math.round(w.schildWeg ?? 0), schuss: w.schuss ?? 0, axt: w.axt ?? 0 } : {};
          })() : {}),
          // Aus dem Inventar. Nur wenn alle Spiele dieses Spielers die Werte haben: halbe Summen stehen nicht auf der Seite.
          ...(d ? (() => {
            const w = d as unknown as Record<string, number | undefined>;
            const spielZahl = (clutch as unknown as { spiele?: Record<string, number> } | null)?.spiele?.[i] ?? 0;
            if (!w.invSpiele || w.invSpiele < spielZahl) return {};
            return { farmHolz: w.farmHolz ?? 0, farmStein: w.farmStein ?? 0, farmMetall: w.farmMetall ?? 0, samHolz: w.samHolz ?? 0, samStein: w.samStein ?? 0, samMetall: w.samMetall ?? 0, ...(typeof w.killsEcht === 'number' ? { kills: w.killsEcht, tode: w.todeEcht ?? 0, killsNachAus: w.killsNachAus ?? 0 } : {}), schussEcht: w.schussEcht ?? 0, editOk: w.editOk ?? 0, schildHeilEcht: w.schildHeilEcht === undefined ? undefined : Math.round(w.schildHeilEcht), schildWegEcht: w.schildWegEcht === undefined ? undefined : Math.round(w.schildWegEcht), sturmSchaden: w.sturmSchaden, busDank: w.busDank, lebenWeg: w.lebenWeg, schadenAlle: w.dmgAlle, schadenBoden: typeof w.dmgAlle === 'number' && typeof w.dmg === 'number' ? Math.max(0, w.dmgAlle - w.dmg) : undefined, selbstHolz: w.selbstHolz ?? 0, selbstStein: w.selbstStein ?? 0, selbstMetall: w.selbstMetall ?? 0 };
          })() : {}),
          ...(je.zeilen.get(i) ? { jeSpiel: je.zeilen.get(i) } : {}),
          // Gebaute Teile: Solo je Spieler, im Team die Summe des Teams.
          ...(d ? (() => {
            const w = d as unknown as Record<string, number | undefined>;
            const holz = w.teamHolz ?? w.bauHolz; const stein = w.teamStein ?? w.bauStein; const metall = w.teamMetall ?? w.bauMetall;
            return holz || stein || metall ? { bauHolz: holz ?? 0, bauStein: stein ?? 0, bauMetall: metall ?? 0 } : {};
          })() : {}),
          // Aus dem vollen Auslesen: Clutch, Zeit und Strecke (dieselbe Rechnung wie in app/api/cup-spieler: Teamzeit als Obergrenze, Strecke bei Team-Cups hochgerechnet).
          ...(d ? {
            clutch: clutch?.summe?.[i] ?? 0,
            ...(typeof (clutch?.epicZeit?.[i] ?? clutch?.leben?.[i]) === 'number' ? { lebenSek: Math.round(Math.min((clutch?.epicZeit?.[i] ?? clutch?.leben?.[i]) as number, clutch?.epicTeamZeit?.[i] ?? Infinity)) } : {}),
            // Solo: Epics Strecke am Boden (frisch, in cm) plus die Strecke in der Luft aus dem Replay - Focus 38,4 km + Luft zu Osirions 41,3 km; unsere Proben alle 10 s ergaben 21,5 km.
            ...(soloEpic && (eintrag?.strecke ?? 0) > 0 ? { streckeM: Math.round(eintrag!.strecke / 100 + (clutch?.strecke?.[i]?.[1] ?? 0)) }
              : typeof clutch?.epicStrecke?.[i] === 'number' ? { streckeM: clutch.epicStrecke[i] }
              : clutch?.strecke?.[i] ? { streckeM: Math.round(((clutch.strecke[i][0] ?? 0) + (clutch.strecke[i][1] ?? 0)) / 0.685) } : {}),
          } : {}),
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
      // Dabei ist auch, wer unter den besten 10.000 fehlt, aber in den gelesenen Replays spielt.
      ok: true, id, name: mitglieder.find((m) => m.ich)?.name || name,
      dabei: !!eintrag || ((clutch as unknown as { spiele?: Record<string, number> } | null)?.spiele?.[id] ?? 0) > 0 || !!eigene?.spieler?.[id],
      ausserhalbListe: !eintrag,
      rank: eintrag?.rank ?? null, gesamt,
      // Epics Perzentil (Osirion zeigt dasselbe: Rang 4200 = Top 2,3 %); Rang durch die 10.000 Plaetze der Liste ergab 42 %.
      top: eintrag && typeof eintrag.percentile === 'number' && eintrag.percentile > 0 ? +(eintrag.percentile * 100).toFixed(1)
        : eintrag && gesamt ? +((eintrag.rank / gesamt) * 100).toFixed(1) : null,
      eintrag: eintrag ?? null,
      mitglieder,
      aktualisiert, szeneStand, szeneMatches,
      jeSpalten: je.spalten,
      replayTeil: (clutch as unknown as { teilweise?: { matches?: number; vonMindestens?: number } } | null)?.teilweise ?? null,
      eigeneAuswertung: eigene ? { gelesen: eigene.gelesen, sitzungen: eigene.sitzungen, gerechnet: eigene.gerechnet, grund: eigene.grund ?? null, fassung: eigene.version ?? 0 } : null,
    };
    return zwischenspeichern(NextResponse.json(antwort, { headers: { 'Cache-Control': 'no-store' } }), 60);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message || 'Epic liefert gerade nichts.' }, { status: 424, headers: { 'Cache-Control': 'no-store' } });
  }
}
