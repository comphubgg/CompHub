/*
 * Die Landepunkte eines Turniers, wie Noble Practice sie fuehrt (nobleprac.com/tournaments).
 *
 * Der Betreiber (11.10.2026): "Ich habe einen Button, generate the map. Und nachher innerhalb von fuenf
 * Minuten generierst du die Map von alleine, indem du von Noble guckst, wo wer eingetragen ist ... und
 * die Formen muessen auch ungefaehr gleich sein."
 *
 * Gelesen wird die offene Schnittstelle, von der die Seite von Noble selbst ihre Daten holt
 * (tournaments.nobleprac.com, ohne Anmeldung): je Fenster (Fast Tracks, Heat 1, Finals ...) die Teams mit
 * Spielern (Konto-Id, Name) und ihrer Form als Polygon in Kartenkoordinaten.
 *
 * Noble legt das Kartenbild als Leaflet-Bild zwischen die Ecken (-82, -124) und (79, 155) in
 * Web-Mercator. Das Bild ist dasselbe Fortnite-Bild wie unser fortnite-api.com-Bild (quadratisch,
 * 2048 px) - mit denselben Raendern -, also genuegt die Umrechnung in Prozent des Bildes. Geprueft am
 * 11.10.2026 durch Ueberlagerung: die Formen liegen auf den Landflaechen.
 */

const BASIS = 'https://tournaments.nobleprac.com/api';

const SUED = -82;
const NORD = 79;
const WEST = -124;
const OST = 155;

const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/** Kartenkoordinate [Breite, Laenge] in Prozent des Bildes (0 bis 100, y von oben). */
export function inProzent([lat, lng]: [number, number]): { x: number; y: number } {
  const x = ((lng - WEST) / (OST - WEST)) * 100;
  const y = ((merc(NORD) - merc(lat)) / (merc(NORD) - merc(SUED))) * 100;
  const rund = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 100) / 100;
  return { x: rund(x), y: rund(y) };
}

/* ------------------------------------------------------------ Abruf mit Kurzspeicher */

const vorrat = new Map<string, { bis: number; wert: unknown }>();
const FRIST_MS = 2 * 60_000;

async function hole<T>(adresse: string, frischMs = FRIST_MS): Promise<T> {
  const da = vorrat.get(adresse);
  if (da && da.bis > Date.now()) return da.wert as T;
  const r = await fetch(adresse, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
  if (!r.ok) throw new Error(`Noble antwortet mit ${r.status}`);
  const wert = await r.json() as T;
  vorrat.set(adresse, { bis: Date.now() + frischMs, wert });
  return wert;
}

export interface RohTurnier {
  id: string; tournamentName: string; status: string; earliestStart?: string;
  regions?: Array<{ code: string }>;
}
interface RohFenster { windowId: string; name: string; startDate?: string; endDate?: string }
interface RohTeam {
  teamId: string;
  coordinates?: Array<[number, number]>;
  players?: Array<{ accountId: string; username?: string }>;
}
export interface RohDetail {
  tournamentData?: { id: string; tournamentName: string; windows?: RohFenster[] };
  windowData?: { windowId: string; windowName?: string; windowFullName?: string; teams?: RohTeam[] };
}

export interface NobleFenster {
  turnierId: string; turnier: string; region: string;
  windowId: string; name: string; start: string | null; status: string;
}

/** Noble liefert Namen, deren UTF-8-Bytes als Latin-1 gelesen wurden ("Ψ" kommt als "Î¨"). */
export function namenRepariert(roh: string): string {
  if (!/[Â-ô]/.test(roh)) return roh;
  if ([...roh].some((c) => c.charCodeAt(0) > 255)) return roh;
  try {
    const neu = Buffer.from(roh, 'latin1').toString('utf8');
    return neu.includes('�') ? roh : neu;
  } catch { return roh; }
}

/** Die jüngsten Turniere von Noble, neueste zuerst. */
export async function jungeTurniere(anzahl: number): Promise<RohTurnier[]> {
  const j = await hole<{ tournaments?: RohTurnier[] }>(`${BASIS}/tournaments`);
  return [...(j.tournaments ?? [])]
    .sort((a, b) => String(b.earliestStart ?? '').localeCompare(String(a.earliestStart ?? '')))
    .slice(0, anzahl);
}

export async function detail(id: string, region: string, windowId?: string): Promise<RohDetail> {
  const q = `id=${encodeURIComponent(id)}&region=${encodeURIComponent(region)}`
    + (windowId ? `&windowId=${encodeURIComponent(windowId)}` : '');
  return hole<RohDetail>(`${BASIS}/tournament?${q}`);
}

/** Alle Fenster der jüngsten Turniere - fuer die Auswahl, wenn die Kennung nicht gleich ist. */
export async function nobleFenster(anzahl = 10): Promise<NobleFenster[]> {
  const turniere = await jungeTurniere(anzahl);
  const raus: NobleFenster[] = [];
  await Promise.all(turniere.map(async (t) => {
    for (const r of t.regions ?? []) {
      try {
        const d = await detail(t.id, r.code);
        for (const w of d.tournamentData?.windows ?? []) {
          raus.push({
            turnierId: t.id, turnier: t.tournamentName, region: r.code,
            windowId: w.windowId, name: w.name, start: w.startDate ?? null, status: t.status,
          });
        }
      } catch { /* dieses Turnier ueberspringen */ }
    }
  }));
  return raus.sort((a, b) => String(b.start ?? '').localeCompare(String(a.start ?? '')));
}

export interface NobleForm {
  /** Ecken in Prozent des Kartenbildes (ohne den schliessenden Punkt). */
  punkte: Array<{ x: number; y: number }>;
  teams: Array<{ ids: string[]; namen: string[] }>;
}

export interface NobleKarte {
  turnier: { id: string; name: string };
  fenster: { windowId: string; name: string };
  region: string;
  formen: NobleForm[];
  /** Teams, fuer die Noble noch keine Form hat. */
  ohneForm: Array<{ ids: string[]; namen: string[] }>;
  anzahlTeams: number;
}

/** Aus dem Fenster eines Turniers die Formen (mit ihren Teams) und die Teams ohne Form. */
export function formenAus(d: RohDetail): { formen: NobleForm[]; ohneForm: NobleKarte['ohneForm']; anzahlTeams: number } {
  const gruppen = new Map<string, NobleForm>();
  const ohneForm: NobleKarte['ohneForm'] = [];
  const teams = d.windowData?.teams ?? [];
  for (const t of teams) {
    const spieler = (t.players ?? []).filter((p) => p.accountId);
    if (!spieler.length) continue;
    const eintrag = {
      ids: spieler.map((p) => p.accountId),
      namen: spieler.map((p) => namenRepariert(p.username ?? '')),
    };
    let ecken = (t.coordinates ?? []).filter((c) => Array.isArray(c) && c.length === 2);
    // Der schliessende Punkt (gleich dem ersten) gehoert nicht in die Liste.
    if (ecken.length > 3) {
      const a = ecken[0]; const b = ecken[ecken.length - 1];
      if (a[0] === b[0] && a[1] === b[1]) ecken = ecken.slice(0, -1);
    }
    if (ecken.length < 3) { ohneForm.push(eintrag); continue; }
    const schluessel = JSON.stringify(ecken);
    let form = gruppen.get(schluessel);
    if (!form) {
      form = { punkte: ecken.map((c) => inProzent(c)), teams: [] };
      gruppen.set(schluessel, form);
    }
    form.teams.push(eintrag);
  }

  return { formen: [...gruppen.values()], ohneForm, anzahlTeams: teams.length };
}

/**
 * Die Karte eines Fensters. Gesucht wird in den jüngsten Turnieren das Fenster mit derselben Kennung
 * (Epics windowId); ohne Treffer kann der Aufrufer Turnier und Region selbst nennen.
 */
export async function nobleKarte(windowId: string, turnierId?: string, region?: string): Promise<NobleKarte | null> {
  let treffer: { id: string; name: string; region: string } | null = null;

  if (turnierId && region) {
    treffer = { id: turnierId, name: turnierId, region };
  } else {
    const turniere = await jungeTurniere(14);
    await Promise.all(turniere.map(async (t) => {
      if (treffer) return;
      const codes = (t.regions ?? []).map((r) => r.code);
      // Die Kennung endet auf die Region - die zuerst probieren.
      codes.sort((a, b) => Number(windowId.endsWith(`_${b}`)) - Number(windowId.endsWith(`_${a}`)));
      for (const code of codes) {
        try {
          const d = await detail(t.id, code);
          if ((d.tournamentData?.windows ?? []).some((w) => w.windowId === windowId)) {
            treffer ??= { id: t.id, name: d.tournamentData?.tournamentName ?? t.tournamentName, region: code };
            return;
          }
        } catch { /* naechste Region */ }
      }
    }));
  }
  if (!treffer) return null;

  const d = await detail(treffer.id, treffer.region, windowId);
  if (!d.windowData || d.windowData.windowId !== windowId) return null;
  const fensterName = d.windowData.windowFullName || d.windowData.windowName || windowId;

  const { formen, ohneForm, anzahlTeams } = formenAus(d);

  return {
    turnier: { id: treffer.id, name: d.tournamentData?.tournamentName ?? treffer.name },
    fenster: { windowId, name: fensterName },
    region: treffer.region,
    formen,
    ohneForm,
    anzahlTeams,
  };
}

/** Den Kurzspeicher leeren - fuer "Aktualisieren" kurz vor einem Cup. */
export function leereNoble(): void {
  vorrat.clear();
}
