import fs from '@/lib/ablageFs';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';
import { ersatzSeit, liesJson, schreibJson } from '@/lib/ablage';
import { nobleKarte } from '@/lib/nobleKarte';
import { vitalAlsNoble, VITAL_REGIONEN, regionAusKennung } from '@/lib/vitalScrims';
import { istGrossesTurnier, istFinaleTag } from '@/lib/turnierArt';
import { kartenTitel } from '@/lib/rundenName';
import { inselAusPlaylist } from '@/lib/inseln';
import { schickeAdminAufgabe } from '@/lib/discord';
import type { CupGruppe, CupFensterDetail } from '@/lib/epicCups';
import type { Turnierkarte, KartenTeam, Spot } from '@/app/api/turnier-karten/route';

/*
 * Turnierkarten von selbst (Betreiber, 29.10.2026): "fuer jeden Performance-Cup-Final, jeden Division-1-Final oder allgemein so grosse Finale, wie
 * Solo-FNCS-Finale, [wird] eine Art Tournament-Map automatisch erstellt ... fuer jede Region, wo wir eingestellt haben, und wenn es dann mal nicht klappt,
 * dann laesst du es und schickst mir ... Admin to do ... sobald die Open-Runde vorbei ist, reloadest du das jede 10 Minuten nochmal neu. Und wenn das Finale
 * gestartet hat, 10 Minuten nach dem Start, tust du es nochmal neu laden ... und dann speicherst du es und fertig."
 *
 * Ablauf je Finaltag und Region (der Anstoss kommt alle zehn Minuten aus dem Ablauf "Discord live"):
 *   - vor dem Ende der Runde davor: nichts (die Aufstellung steht noch nicht)
 *   - danach bis zehn Minuten nach Beginn des Finales: bei jedem Anstoss neu laden und die Karte erneuern
 *   - zehn Minuten nach Beginn: ein letztes Mal laden, speichern, fertig - danach wird die Karte nie wieder von selbst angefasst
 *   - klappt es bis dahin nicht: einmal "Fuer dich zu tun" in #to-do-for-admin, der Admin waehlt den Spieltag dann von Hand
 *
 * Eine Karte, die der Betreiber angefasst hat (sie ist nicht von hier oder wurde seither geaendert), bleibt, wie sie ist - die Zuordnungen sind seine Sache.
 * Formen und Spieler kommen aus denselben Quellen wie "Generate map"; welche das sind, steht nirgends oeffentlich.
 */

const DATEI = path.join(DATEN_ORT, 'turnier-karten.json');
const STAND = 'karten-automatik.json';

/** Die Regionen mit einer Quelle fuer Landepunkte: Europa ueber Noble, NA, Middle East und Ozeanien ueber Vital. */
export const AUTO_REGIONEN = ['EU', ...VITAL_REGIONEN] as const;

const FARBEN = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#22d3ee', '#f472b6', '#84cc16'];
const ZEHN_MIN = 10 * 60_000;

export type AutoKarte = Turnierkarte & {
  /** Von hier angelegt - mit dem Stand (geaendert), den die Automatik zuletzt geschrieben hat. */
  automatisch?: { stand: number; quelle: string };
};

interface FensterStand { zustand: 'laeuft' | 'fertig' | 'fehlgeschlagen' | 'von-hand'; versuche: number; zuletzt: number; kartenId?: string; grund?: string }
type Stand = Record<string, FensterStand>;

export interface Ziel { cup: CupGruppe; f: CupFensterDetail; region: string; ab: number }

/** Endet die Kennung auf eine Region ("..._NAC"), muss es diese sein; ohne Endung (Globals) passt jede. */
const passtRegion = (windowId: string, region: string) => { const r = regionAusKennung(windowId); return !r || r === region; };

/** Kartentitel immer englisch, wie die von Hand angelegten ("Event 9 · Round 2") - kartenTitel spricht ohne Uebersetzer deutsch. */
const ENGLISCH: Record<string, string> = { Runde: 'Round', Tag: 'Day', Finale: 'Finals' };
const titelVon = (z: Ziel) => kartenTitel(z.cup.titel, z.f, (w) => ENGLISCH[w] ?? w) || z.cup.titel;

const kontoSchluessel = (ids: string[]) => {
  const echte = ids.filter(Boolean);
  return echte.length ? `k:${[...echte].sort().join('_')}` : null;
};

/**
 * Die Finaltage, fuer die eine Karte entstehen soll. `ab` ist das Ende der Runde davor (die offene Runde) - vorher steht die Aufstellung nicht fest.
 * Ohne Runde davor: drei Stunden vor Beginn.
 */
export function zieleAus(cups: CupGruppe[], nurPerformance = false): Ziel[] {
  const ziele: Ziel[] = [];
  for (const cup of cups) {
    if (!istGrossesTurnier(cup.titel)) continue;
    if (nurPerformance && !/performance/i.test(cup.titel)) continue;
    for (const [region, liste] of Object.entries(cup.regionen ?? {})) {
      if (!(AUTO_REGIONEN as readonly string[]).includes(region)) continue;
      // Nur Spieltage dieser Region: Epic fuehrt beim Duo-Cup unter NA West auch die Fenster von NA Central ("..._NAC").
      const sortiert = [...liste].filter((f) => passtRegion(f.windowId, region)).sort((a, b) => a.begin - b.begin);
      sortiert.forEach((f, i) => {
        if (!istFinaleTag(cup.titel, f.istFinale, f.windowId)) return;
        const davor = sortiert.slice(0, i).reverse().find((w) => !istFinaleTag(cup.titel, w.istFinale, w.windowId));
        const ab = davor?.end ?? f.begin - 3 * 3600_000;
        ziele.push({ cup, f, region, ab });
      });
    }
  }
  return ziele;
}

async function liesKarten(): Promise<AutoKarte[]> {
  let roh: string;
  try { roh = await fs.readFile(DATEI, 'utf8'); } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
    throw e;
  }
  // Aus der Ersatzkopie wird nie geschrieben - sonst gingen neuere Karten verloren.
  if (ersatzSeit('turnier-karten.json') !== null) throw new Error('Ablage antwortet nicht');
  return JSON.parse(roh) as AutoKarte[];
}

/** Die Karte aus Formen und Spielern der Quelle bauen - so wie "Generate map" auf der Kartenseite. */
function baueKarte(
  z: Ziel, quelle: { formen: Array<{ punkte: Array<{ x: number; y: number }>; teams: Array<{ ids: string[]; namen: string[] }> }>; ohneForm: Array<{ ids: string[]; namen: string[] }> },
  profile: Record<string, { anzeige?: string }>, bild: { id: string; titel: string }, alt: AutoKarte | undefined,
): AutoKarte {
  const teams: KartenTeam[] = [];
  const team = (e: { ids: string[]; namen: string[] }) => {
    const id = kontoSchluessel(e.ids) ?? `noble-${e.ids.join('_')}`;
    let t = teams.find((x) => x.id === id);
    if (!t) {
      t = { id, spieler: e.namen.map((n, i) => profile[e.ids[i] ?? '']?.anzeige || n), ids: e.ids, farbe: FARBEN[teams.length % FARBEN.length], quelle: 'noble' };
      teams.push(t);
    }
    return t.id;
  };
  const jetzt = Date.now().toString(36);
  const spots: Spot[] = quelle.formen.map((fo, i) => {
    const xs = [...new Set(fo.punkte.map((p) => p.x))];
    const ys = [...new Set(fo.punkte.map((p) => p.y))];
    const rechteck = fo.punkte.length === 4 && xs.length === 2 && ys.length === 2;
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return {
      id: `noble-${jetzt}-${i}`,
      form: rechteck ? 'rechteck' : 'polygon',
      punkte: rechteck ? [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] : fo.punkte,
      teams: fo.teams.map(team),
    } as Spot;
  });
  for (const e of quelle.ohneForm) team(e);
  // Hoechstens so viele Teams, wie in ein Spiel passen - wer auf einer Form steht, bleibt immer.
  const groesse = Math.max(1, ...teams.map((t) => t.spieler.length));
  const platziert = new Set(spots.flatMap((s) => s.teams));
  const grenze = Math.floor(100 / groesse);
  const gekuerzt = teams.length <= grenze ? teams
    : [...teams.filter((t) => platziert.has(t.id)), ...teams.filter((t) => !platziert.has(t.id))].slice(0, Math.max(grenze, platziert.size));

  const titel = titelVon(z);
  const id = alt?.id ?? (`${titel} ${z.f.windowId} ${bild.id || 'br'}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'karte');
  const geaendert = Date.now();
  return {
    id, titel, cupId: z.cup.id, cupTitel: z.cup.titel, region: z.region, eventId: z.f.eventId, windowId: z.f.windowId,
    bildId: bild.id, bildTitel: bild.titel, bildAutomatisch: true, namenSichtbar: false, gesperrt: false,
    spots, teams: gekuerzt, geaendert, oeffentlich: true,
    automatisch: { stand: geaendert, quelle: 'auto' },
  };
}

export interface Lauf { geprueft: number; geladen: string[]; fertig: string[]; fehlgeschlagen: string[]; uebersprungen: string[]; wartet: number }

/**
 * Ein Durchlauf. `cups` ist der Katalog (wie /api/cup-catalog?modus=alle), `inseln`/`bilder` die Kartenbilder (wie /api/karten-bild).
 * Mit `nachholen` werden vergangene Performance-Finals nachgetragen, fuer die es noch keine Karte gibt - je Spieltag genau einmal.
 */
export async function kartenAutomatik(
  cups: CupGruppe[], inseln: Record<string, string>, bilder: Array<{ id: string; titel: string }>, nachholen = false,
): Promise<Lauf> {
  const jetzt = Date.now();
  const lauf: Lauf = { geprueft: 0, geladen: [], fertig: [], fehlgeschlagen: [], uebersprungen: [], wartet: 0 };
  const stand = await liesJson<Stand>(STAND, {}).catch(() => ({} as Stand));
  const profile = await liesJson<Record<string, { anzeige?: string }>>('spieler-profile.json', {}).catch(() => ({}));
  let karten = await liesKarten();
  const vorher = JSON.stringify(stand);
  let kartenGeaendert = false;
  const gescheitert: string[] = [];

  // Unberuehrte Karten von hier zu einem Spieltag einer anderen Region (der erste Lauf legte NA Central unter NA West an) wieder weg.
  const falsch = karten.filter((k) => k.automatisch && k.automatisch.stand === k.geaendert && k.region && !passtRegion(k.windowId ?? '', k.region));
  if (falsch.length) { karten = karten.filter((k) => !falsch.includes(k)); kartenGeaendert = true; }

  // Unberuehrte Karten von hier tragen den aktuellen Titel (die ersten hiessen noch "Runde 2").
  for (const z of zieleAus(cups)) {
    const k = karten.find((x) => x.windowId === z.f.windowId && x.region === z.region && x.automatisch && x.automatisch.stand === x.geaendert);
    if (k && k.titel !== titelVon(z)) {
      const geaendert = Date.now();
      karten = karten.map((x) => (x === k ? { ...x, titel: titelVon(z), geaendert, automatisch: { ...k.automatisch!, stand: geaendert } } : x));
      kartenGeaendert = true;
    }
  }

  const alle = zieleAus(cups, nachholen).filter((z) => nachholen
    // Nachholen: was vorbei ist (seit hoechstens sechzig Tagen - aelter fuehren die Quellen nicht mehr).
    ? z.f.begin + ZEHN_MIN < jetzt && z.f.begin > jetzt - 60 * 86400_000
    // Sonst nur, was gerade dran ist: ab dem Ende der offenen Runde bis zum letzten Laden; was davor liegt, wartet.
    : z.f.begin > jetzt - 2 * 86400_000);

  for (const z of alle) {
    const schluessel = `${z.f.windowId}|${z.region}`;
    const s = stand[schluessel];
    if (s && s.zustand !== 'laeuft') continue;
    if (!nachholen && jetzt < z.ab) { lauf.wartet++; continue; }
    lauf.geprueft++;
    const name = `${titelVon(z)} (${z.region})`;

    // Eine Karte zu diesem Spieltag, die nicht von hier ist oder seither von Hand geaendert wurde, bleibt.
    const vorhanden = karten.find((k) => k.windowId === z.f.windowId && (k.region ?? z.region) === z.region);
    if (vorhanden && (!vorhanden.automatisch || vorhanden.automatisch.stand !== vorhanden.geaendert || vorhanden.gesperrt)) {
      stand[schluessel] = { zustand: 'von-hand', versuche: s?.versuche ?? 0, zuletzt: jetzt, kartenId: vorhanden.id };
      lauf.uebersprungen.push(name);
      continue;
    }

    const insel = inselAusPlaylist(z.f.playlist);
    const bildId = insel.art === 'reload' && insel.schluessel ? (inseln[insel.schluessel] ?? '') : (inseln.BR ?? '');
    const bild = { id: bildId, titel: bilder.find((b) => b.id === bildId)?.titel ?? 'Battle Royale' };

    let quelle: Awaited<ReturnType<typeof nobleKarte>> | Awaited<ReturnType<typeof vitalAlsNoble>> = null;
    let grund = '';
    try {
      quelle = z.region === 'EU'
        ? await nobleKarte(z.f.windowId, undefined, undefined, { titel: z.cup.titel, begin: z.f.begin })
        : await vitalAlsNoble(z.f.windowId, z.f.begin, z.f.end ?? null, z.region);
      if (!quelle) grund = 'Spieltag in der Quelle nicht gefunden';
      else if (!quelle.formen.length) { grund = 'Noch keine Landepunkte eingetragen'; quelle = null; }
    } catch (e) { grund = `Quelle nicht erreichbar: ${(e as Error).message}`; }

    const letzterVersuch = nachholen || jetzt >= z.f.begin + ZEHN_MIN;
    if (quelle) {
      const neu = baueKarte(z, quelle, profile, bild, vorhanden);
      karten = vorhanden ? karten.map((k) => (k.id === vorhanden.id ? neu : k)) : [...karten, neu];
      kartenGeaendert = true;
      lauf.geladen.push(name);
      stand[schluessel] = { zustand: letzterVersuch ? 'fertig' : 'laeuft', versuche: (s?.versuche ?? 0) + 1, zuletzt: jetzt, kartenId: neu.id };
      if (letzterVersuch) lauf.fertig.push(name);
    } else if (letzterVersuch) {
      // Hat es schon einmal geklappt, bleibt die letzte Karte stehen - fertig ist sie trotzdem.
      const zustand = vorhanden ? 'fertig' : 'fehlgeschlagen';
      stand[schluessel] = { zustand, versuche: (s?.versuche ?? 0) + 1, zuletzt: jetzt, kartenId: vorhanden?.id, grund };
      if (zustand === 'fehlgeschlagen') { lauf.fehlgeschlagen.push(name); gescheitert.push(`• **${name}** - ${grund}`); }
      else lauf.fertig.push(name);
    } else {
      stand[schluessel] = { zustand: 'laeuft', versuche: (s?.versuche ?? 0) + 1, zuletzt: jetzt, grund };
    }
  }

  if (kartenGeaendert) {
    await fs.mkdir(path.dirname(DATEI), { recursive: true });
    await fs.writeFile(DATEI, JSON.stringify(karten, null, 2), 'utf8');
  }
  if (JSON.stringify(stand) !== vorher) await schreibJson(STAND, stand);

  // Was nicht geklappt hat, einmal als Aufgabe an den Admin - beim Nachholen gesammelt in einer Nachricht.
  if (gescheitert.length) {
    await schickeAdminAufgabe({
      titel: gescheitert.length === 1 ? 'Turnierkarte bitte von Hand' : `${gescheitert.length} Turnierkarten bitte von Hand`,
      text: 'Die Karte liess sich nicht von selbst anlegen. Bitte unter /maps den Cup öffnen und den Spieltag bei „Generate map“ von Hand auswählen.\n\n'
        + gescheitert.slice(0, 30).join('\n') + (gescheitert.length > 30 ? `\n… und ${gescheitert.length - 30} weitere` : ''),
    }).catch(() => null);
  }
  return lauf;
}
