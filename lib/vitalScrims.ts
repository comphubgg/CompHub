import { inProzentVital } from '@/lib/vitalKoordinaten';
import type { NobleForm, NobleKarte } from '@/lib/nobleKarte';
import { liesJson, schreibJson } from '@/lib/ablage';

/*
 * Die Landepunkte der Regionen, die Noble Practice nicht fuehrt - von Vital Scrims (vitalscrims.com/competitive).
 *
 * Der Betreiber (19.10.2026): "bei Vital Scrims gibt es wirklich jede einzelne Region - NA Central, NA West, Middle East, Ozeanien (nur Asien nicht).
 * Du nimmst die Map jeweils von dort, angepasst an meinen Stil - und sie gehoert auch unter die weiteren Cups, wenn ich Map holen gehe."
 *
 * Wie Vital die Daten liefert: die Liste der Turniere steht in der Seite /competitive (je Region, mit Beginn und Ende); die Landepunkte eines Turniers
 * kommen ueber einen Websocket (wss://vitalscrims.com/api/websocket?lobbyId=<Turnier>&competitive=true), der gleich nach dem Oeffnen alle Teams mit
 * ihrer Form schickt. Die Seite verlangt dafuer nur den Herkunftskopf (Origin) - keine Anmeldung. Vitals Kartenbild tragen ein Wasserzeichen und kommt
 * deshalb nie auf unsere Karten: nur die Formen (Koordinaten) werden uebernommen, gezeichnet wird auf unserer sauberen Karte (lib/vitalKoordinaten).
 *
 * Gelesen wird nur, was offen im Netz steht; nichts wird angemeldet, nichts geschrieben.
 */

export const VITAL_REGIONEN = ['NAC', 'NAW', 'ME', 'OCE'] as const;
export type VitalRegion = (typeof VITAL_REGIONEN)[number];
export const istVitalRegion = (r: string): r is VitalRegion => (VITAL_REGIONEN as readonly string[]).includes(r);

const BASIS = 'https://vitalscrims.com';

export interface VitalTurnier {
  id: string;
  name: string;
  region: string;
  /** ms */
  start: number;
  ende: number;
  bild: string | null;
}

export interface VitalTeam {
  /** Vitals Team-Kennung (bei Solos die Epic-Konto-Id). */
  id: string;
  spieler: Array<{ id: string; name: string }>;
  /** Ecken in Vitals Koordinaten [lat, lng]. */
  ecken: Array<[number, number]>;
}

export interface VitalKarte {
  name: string;
  start: number | null;
  ende: number | null;
  /** Die Version der Karte, die Vital zeigt ("42.312"). */
  kartenVersion: string | null;
  teams: VitalTeam[];
}

/* ------------------------------------------------------------------ Liste */

let listeMerker: { bis: number; liste: VitalTurnier[] } | null = null;
const LISTE_DATEI = 'vital-liste.json';

/** Der Text der Seite, so wie ihn Next als Zeichenketten-Teile einbettet (self.__next_f.push([1,"..."])). */
function nutzlast(html: string): string {
  let text = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try { text += JSON.parse(m[1]) as string; } catch { /* Teil ueberspringen */ }
  }
  return text;
}

/**
 * Die Seite /competitive nennt je Gruppe nur das juengste Turnier ("Solo FNCS Heat 2 (NAC)"); dessen eigene Seite fuehrt alle Geschwister der Gruppe
 * ("windows": Heat 1 und Heat 2) - ohne Endzeit, die uebernehmen wir vom juengsten.
 */
async function geschwister(v: VitalTurnier): Promise<VitalTurnier[]> {
  try {
    const r = await fetch(`${BASIS}/competitive/${v.id}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20_000), cache: 'no-store' });
    if (!r.ok) return [];
    const text = nutzlast(await r.text());
    const m = /"windows":(\[[^\]]*\])/.exec(text);
    if (!m) return [];
    const arr = JSON.parse(m[1]) as Array<{ id?: string; name?: string; startTime?: string }>;
    const dauer = Math.max(3_600_000, v.ende - v.start);
    return arr.flatMap((w) => {
      const start = Date.parse(w.startTime ?? '');
      return w.id && w.id !== v.id && Number.isFinite(start)
        ? [{ id: w.id, name: String(w.name ?? v.name), region: v.region, start, ende: start + dauer, bild: v.bild }] : [];
    });
  } catch { return []; }
}

/** Alle Turniere, die Vital fuehrt - zehn Minuten im Speicher. Fehlt die Seite, bleibt der alte Stand (oder eine leere Liste). */
export async function vitalTurniere(): Promise<VitalTurnier[]> {
  if (listeMerker && listeMerker.bis > Date.now()) return listeMerker.liste;
  try {
    const r = await fetch(`${BASIS}/competitive`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20_000), cache: 'no-store' });
    if (!r.ok) throw new Error(`Vital antwortet mit ${r.status}`);
    const text = nutzlast(await r.text());
    const liste: VitalTurnier[] = [];
    const gesehen = new Set<string>();
    let region = '';
    const re = /"region":"([A-Z]+)"|\{"id":"([0-9a-f-]{20,40})","name":"((?:[^"\\]|\\.)*)","startTime":"([^"]+)","endTime":"([^"]+)"(?:,"imageUrl":"([^"]*)")?/g;
    for (const m of text.matchAll(re)) {
      if (m[1]) { region = m[1]; continue; }
      if (!m[2] || gesehen.has(m[2])) continue;
      gesehen.add(m[2]);
      const start = Date.parse(m[4]); const ende = Date.parse(m[5]);
      if (!Number.isFinite(start)) continue;
      liste.push({ id: m[2], name: m[3], region, start, ende: Number.isFinite(ende) ? ende : start + 3 * 3_600_000, bild: m[6] || null });
    }
    // Die Geschwister jeder Gruppe: je Gruppe eine Seite, sechs gleichzeitig.
    const gruppenKopf = [...liste];
    for (let i = 0; i < gruppenKopf.length; i += 6) {
      const teil = await Promise.all(gruppenKopf.slice(i, i + 6).map(geschwister));
      for (const g of teil.flat()) if (!gesehen.has(g.id)) { gesehen.add(g.id); liste.push(g); }
    }
    liste.sort((a, b) => b.start - a.start);
    listeMerker = { bis: Date.now() + 30 * 60_000, liste };
    try { await schreibJson(LISTE_DATEI, { stand: Date.now(), liste }); } catch { /* ohne Ablage bleibt es im Speicher */ }
    return liste;
  } catch {
    // Vital antwortet nicht: der zuletzt gesicherte Stand gilt weiter.
    if (listeMerker?.liste.length) return listeMerker.liste;
    try {
      const alt = await liesJson<{ liste?: VitalTurnier[] }>(LISTE_DATEI, {});
      if (alt.liste?.length) { listeMerker = { bis: Date.now() + 5 * 60_000, liste: alt.liste }; return alt.liste; }
    } catch { /* leer */ }
    return [];
  }
}

/* ------------------------------------------------------------------ Eine Karte */

const kartenMerker = new Map<string, { bis: number; wert: VitalKarte | null }>();

/** Die Teams eines Turniers mit ihren Formen - ueber den Websocket, hoechstens fuenfzehn Sekunden Wartezeit. */
export async function vitalKarte(id: string, vorbei: boolean): Promise<VitalKarte | null> {
  const da = kartenMerker.get(id);
  if (da && da.bis > Date.now()) return da.wert;
  const wert = await new Promise<VitalKarte | null>((fertig) => {
    let erledigt = false;
    const ende = (v: VitalKarte | null) => { if (erledigt) return; erledigt = true; try { ws.close(); } catch { /* ok */ } fertig(v); };
    // Der globale WebSocket von Node (undici) nimmt als zweiten Wert Optionen mit eigenen Kopfzeilen.
    const Ctor = WebSocket as unknown as new (u: string, o?: unknown) => WebSocket;
    let ws: WebSocket;
    try {
      ws = new Ctor(`wss://vitalscrims.com/api/websocket?lobbyId=${encodeURIComponent(id)}&competitive=true`, { headers: { Origin: BASIS, 'User-Agent': 'Mozilla/5.0' } });
    } catch { fertig(null); return; }
    const uhr = setTimeout(() => ende(null), 15_000);
    ws.onmessage = (e: MessageEvent) => {
      try {
        const j = JSON.parse(typeof e.data === 'string' ? e.data : String(e.data)) as {
          mapInfo?: { name?: string }; players?: Array<{ teamId?: string; marker?: { type?: string; coordinates?: Array<[number, number]> }; users?: Array<{ id?: string; name?: string }> }>;
          tileFolder?: string; startTime?: string; endTime?: string;
        };
        if (!Array.isArray(j.players)) return;
        clearTimeout(uhr);
        const teams: VitalTeam[] = [];
        for (const p of j.players) {
          const spieler = (p.users ?? []).filter((u) => u.id).map((u) => ({ id: String(u.id), name: String(u.name ?? '') }));
          if (!spieler.length) continue;
          const ecken = (p.marker?.type === 'SHAPE' ? p.marker.coordinates ?? [] : []).filter((c) => Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])) as Array<[number, number]>;
          teams.push({ id: String(p.teamId ?? spieler[0].id), spieler, ecken });
        }
        ende({
          name: j.mapInfo?.name ?? '',
          start: j.startTime ? Date.parse(j.startTime) : null, ende: j.endTime ? Date.parse(j.endTime) : null,
          kartenVersion: j.tileFolder ?? null, teams,
        });
      } catch { /* die naechste Nachricht abwarten */ }
    };
    ws.onerror = () => { clearTimeout(uhr); ende(null); };
    ws.onclose = () => { clearTimeout(uhr); ende(null); };
  });
  // Ein vergangenes Turnier aendert sich nicht mehr; ein laufendes oder kommendes wird von Vital laufend erweitert.
  kartenMerker.set(id, { bis: Date.now() + (wert ? (vorbei ? 6 * 3_600_000 : 2 * 60_000) : 60_000), wert });
  return wert;
}

/* ------------------------------------------------------------------ Zuordnung zu Epics Fenstern */

/** Die Region aus Epics Kennung ("..._Heat2_NAC" -> "NAC"). */
export const regionAusKennung = (windowId: string): string => /_([A-Z]{2,4})$/.exec(windowId)?.[1] ?? '';

/**
 * Welches Vital-Turnier zu einem Spieltag gehoert: dieselbe Region, und der Spieltag liegt im Zeitraum des Turniers (eine halbe Stunde Spielraum).
 * Gibt es keinen solchen, gilt das juengste Turnier der Region, das hoechstens 36 Stunden vorher begann (ein zweiter Finaltag nutzt die Karte des ersten).
 */
export async function vitalFuer(region: string, begin: number, ende?: number | null): Promise<VitalTurnier | null> {
  if (!istVitalRegion(region) || !Number.isFinite(begin)) return null;
  const liste = (await vitalTurniere()).filter((t) => t.region === region);
  const bis = ende && ende > begin ? ende : begin + 3_600_000;
  const drin = liste.filter((t) => t.start - 1_800_000 <= bis && t.ende + 1_800_000 >= begin);
  const ausw = (l: VitalTurnier[]) => [...l].sort((a, b) => Math.abs(a.start - begin) - Math.abs(b.start - begin))[0] ?? null;
  if (drin.length) return ausw(drin);
  return ausw(liste.filter((t) => t.start <= begin && begin - t.start <= 36 * 3_600_000));
}

/* ------------------------------------------------------------------ Umrechnung */

/**
 * Vitals Teams als Formen: Teams mit derselben Form stehen auf einer Stelle (wie bei Noble). Ecken in Prozent des Kartenbildes.
 */
export function vitalFormen(k: VitalKarte, namenVon?: (id: string, roh: string) => string): { formen: NobleForm[]; ohneForm: NobleKarte['ohneForm']; anzahlTeams: number } {
  const gruppen = new Map<string, NobleForm>();
  const ohneForm: NobleKarte['ohneForm'] = [];
  for (const t of k.teams) {
    const eintrag = { ids: t.spieler.map((s) => s.id), namen: t.spieler.map((s) => (namenVon ? namenVon(s.id, s.name) : s.name)) };
    let ecken = t.ecken;
    if (ecken.length > 3) {
      const a = ecken[0]; const b = ecken[ecken.length - 1];
      if (a[0] === b[0] && a[1] === b[1]) ecken = ecken.slice(0, -1);
    }
    if (ecken.length < 3) { ohneForm.push(eintrag); continue; }
    const schluessel = ecken.map((c) => `${c[0]},${c[1]}`).join(';');
    let form = gruppen.get(schluessel);
    if (!form) { form = { punkte: ecken.map((c) => inProzentVital(c)), teams: [] }; gruppen.set(schluessel, form); }
    form.teams.push(eintrag);
  }
  return { formen: [...gruppen.values()], ohneForm, anzahlTeams: k.teams.length };
}

/**
 * Dieselbe Antwort wie nobleKarte() - fuer "Von Noble holen" in den Editoren, wenn die Region nicht zu Noble gehoert. Zugeordnet wird ueber Region und Datum.
 */
export async function vitalAlsNoble(windowId: string, begin: number | undefined, ende: number | null | undefined, regionWunsch?: string): Promise<(NobleKarte & { zugeordnet: 'datum'; quelle: 'vital' }) | null> {
  const region = regionWunsch && istVitalRegion(regionWunsch) ? regionWunsch : regionAusKennung(windowId);
  if (!istVitalRegion(region) || !begin) return null;
  const t = await vitalFuer(region, begin, ende);
  if (!t) return null;
  const k = await vitalKarte(t.id, t.ende < Date.now());
  if (!k) return null;
  const { formen, ohneForm, anzahlTeams } = vitalFormen(k);
  return {
    turnier: { id: t.id, name: t.name }, fenster: { windowId, name: t.name }, region,
    formen, ohneForm, anzahlTeams, zugeordnet: 'datum', quelle: 'vital',
  };
}
