import { liesJson } from '@/lib/ablage';
import { namensSchluessel } from '@/lib/homoglyph';
import { PLATZHALTER_FOTO, spielerbildGross, spielerbildKlein } from '@/lib/spielerbildKlein';
import { anzeigenamen, anzeigenameEinsetzen } from '@/lib/anzeigenamen';

/*
 * Die eine, aktuelle Quelle fuer Spielerfotos (Betreiber, 17.11.2026: "ein neues Foto soll innerhalb von Minuten ueberall erscheinen").
 *
 * Die Ursache, warum Vico, Pixie und SwizzY auf der Startseite den Platzhalter zeigten, obwohl ihre Fotos schon oeffentlich waren: fast jede
 * Liste der Seite wird vorgerechnet (stuendlicher Lauf, lib/antwortSpeicher, lib/ueberdauernd, Merker der Routen) - und die Foto-Adresse wurde
 * dabei fest in die Antwort geschrieben. Ein Foto, das danach freigegeben wurde (Pool-Abgleich, Admin-Upload), kam erst mit der naechsten
 * Rechnung an; Antworten ueber das ganze Archiv (Preisgeld 2026, Startansicht der Statistik) rechnet nur der Laufrechner, also Stunden spaeter.
 * Lib/spielerbildKlein.fotosImJsonSperren nahm gesperrte Fotos heraus, setzte aber neue nie ein.
 *
 * Darum hier, beim Ausliefern: jedes Objekt mit einer Konto-Id (epicId / id / accountId) und einem Fotofeld (bild / img / foto) bekommt das Foto,
 * das spielerbilder.json JETZT fuer dieses Konto fuehrt (nur freie, echte Fotos - liesJson wendet lib/fotoSperre an), oder null, wenn es keines
 * gibt. Ueberschrieben wird nur, was ein Spielerfoto ist oder sein koennte (null, /spielerbilder..., der Platzhalter) - Logos, Banner und
 * Kartenbilder bleiben unberuehrt. Fehlt ein Fotofeld ganz, wird keines dazuerfunden.
 */

const KONTO = /^[0-9a-f]{32}$/i;
const ID_FELDER = ['epicId', 'id', 'accountId'] as const;
const FOTO_FELDER = ['bild', 'img', 'foto'] as const;
const FRIST_MS = 60_000;

interface Eintrag { datei?: string; epicId?: string; echtesFoto?: boolean; name?: string; turniername?: string }
interface Profil { name?: string; anzeige?: string; namen?: string[] }

export interface FotoStand {
  /** Konto-Id (klein) -> Dateiname aus spielerbilder.json, nur oeffentliche echte Fotos. */
  nachKonto: Map<string, string>;
  /** Namensschluessel -> Konto-Id, nur eindeutige Namen von Konten mit Foto (fuer Stellen, die nur einen Namen kennen). */
  nachName: Map<string, string>;
  /** Konto-Id (klein) -> gelaeufiger Name (spieler-anzeigenamen.json, lib/anzeigenamen) - beim Ausliefern statt des Epic-Namens. */
  anzeigenamen?: Map<string, string>;
}

let merker: { stand: FotoStand; bis: number } | null = null;
let unterwegs: Promise<FotoStand> | null = null;

/** Der aktuelle Foto-Stand, je Prozess hoechstens eine Minute alt. */
export async function fotoStand(): Promise<FotoStand> {
  if (merker && Date.now() < merker.bis) return merker.stand;
  if (unterwegs) return unterwegs;
  unterwegs = (async () => {
    try {
      const [liste, profile, namenTafel] = await Promise.all([
        liesJson<Eintrag[]>('spielerbilder.json', []),
        liesJson<Record<string, Profil>>('spieler-profile.json', {}).catch(() => ({} as Record<string, Profil>)),
        anzeigenamen().catch(() => new Map<string, string>()),
      ]);
      const nachKonto = new Map<string, string>();
      const namen = new Map<string, Set<string>>();
      const merk = (n: unknown, id: string) => {
        const k = namensSchluessel(String(n ?? ''));
        if (k.length >= 3) (namen.get(k) ?? namen.set(k, new Set()).get(k)!).add(id);
      };
      for (const e of Array.isArray(liste) ? liste : []) {
        const id = String(e?.epicId ?? '').toLowerCase();
        if (!KONTO.test(id) || !e.datei || !e.echtesFoto) continue;
        nachKonto.set(id, e.datei);
        merk(e.name, id); merk(e.turniername, id);
      }
      for (const [roh, p] of Object.entries(profile ?? {})) {
        const id = roh.toLowerCase();
        if (!nachKonto.has(id)) continue;
        for (const n of [p?.name, p?.anzeige, ...(Array.isArray(p?.namen) ? p.namen : [])]) merk(n, id);
      }
      // Auch der gelaeufige Name findet das Foto ("916Gon" statt "FURIA 916Gon").
      for (const [id, n] of namenTafel) if (nachKonto.has(id)) merk(n, id);
      const nachName = new Map<string, string>();
      for (const [k, ids] of namen) if (ids.size === 1) nachName.set(k, [...ids][0]);
      const stand: FotoStand = { nachKonto, nachName, anzeigenamen: namenTafel };
      // Eine leere Liste (Ablage kurz nicht erreichbar) nicht eine Minute lang festhalten.
      merker = { stand, bis: Date.now() + (nachKonto.size ? FRIST_MS : 5_000) };
      return stand;
    } finally { unterwegs = null; }
  })();
  return unterwegs;
}

/** Die Adresse des aktuellen Fotos eines Kontos - oder null. */
export function fotoFuerKonto(stand: FotoStand, epicId: string | null | undefined, gross = false): string | null {
  const datei = epicId ? stand.nachKonto.get(String(epicId).toLowerCase()) : undefined;
  if (!datei) return null;
  const url = gross ? spielerbildGross(datei) : spielerbildKlein(datei);
  return url === PLATZHALTER_FOTO ? null : url;
}

/** Die Konto-Id zu einem Namen, wenn er eindeutig einem Konto mit Foto gehoert. */
export function kontoZuName(stand: FotoStand, name: string): string | null {
  return stand.nachName.get(namensSchluessel(name)) ?? null;
}

/** Steht in diesem Feld ein Spielerfoto (oder keines)? Nur dann darf es ersetzt werden. */
function istSpielerfotoFeld(wert: unknown): boolean {
  if (wert === null) return true;
  if (typeof wert !== 'string') return false;
  return wert === PLATZHALTER_FOTO || /^(?:https?:\/\/[^/]+)?\/spielerbild(?:er|er-klein|-platzhalter)/.test(wert);
}

/** Ein Original (JPG/PNG unter /spielerbilder/) - dann bleibt es beim Original. */
const istOriginal = (wert: unknown) => typeof wert === 'string' && /\/spielerbilder\/[^?]+\.(?:jpe?g|png)(?:\?|$)/i.test(wert);

/**
 * Alle Spielerfotos in einem Wert auf den aktuellen Stand bringen (veraendert den Wert selbst und gibt ihn zurueck).
 * gross: fehlende Fotos als Original statt als kleine Fassung einsetzen (Spielerprofil).
 */
export function fotosEinsetzen<T>(wert: T, stand: FotoStand, gross = false): T {
  const besuche = (o: unknown, tiefe: number): void => {
    if (!o || typeof o !== 'object' || tiefe > 40) return;
    if (Array.isArray(o)) { for (const x of o) besuche(x, tiefe + 1); return; }
    const r = o as Record<string, unknown>;
    let id: string | null = null;
    for (const f of ID_FELDER) {
      const v = r[f];
      if (typeof v === 'string' && KONTO.test(v)) { id = v; break; }
    }
    if (id) {
      // Der gelaeufige Name statt des rohen Epic-Namens (lib/anzeigenamen) - der Epic-Name bleibt in "name"/"epicName".
      if (stand.anzeigenamen?.size && anzeigenameEinsetzen(r, id, stand.anzeigenamen) && 'gepflegt' in r) r.gepflegt = true;
      let gesetzt = false;
      for (const f of FOTO_FELDER) {
        if (!(f in r) || !istSpielerfotoFeld(r[f])) continue;
        const neu = fotoFuerKonto(stand, id, gross || istOriginal(r[f]));
        if (neu) { r[f] = neu; gesetzt = true; continue; }
        /*
         * Kein aktuelles Foto: der Platzhalter bleibt, wie die Route ihn setzt (manche brauchen eine Adresse), und ein Foto, das eine Org
         * selbst fuer ihren Spieler hochgeladen hat ("...-org-....webp", app/api/orgs), gehoert nicht in spielerbilder.json und bleibt.
         * Jedes andere alte Spielerfoto ist nicht mehr oeffentlich (der Pool loescht abgeloeste Kopien) - dann null, also der Platzhalter.
         */
        const alt = r[f];
        if (alt === null || alt === PLATZHALTER_FOTO || (typeof alt === 'string' && /-org-[0-9a-z]+\.webp/.test(alt))) continue;
        r[f] = null;
        gesetzt = true;
      }
      if (gesetzt && 'echtesFoto' in r) r.echtesFoto = FOTO_FELDER.some((f) => typeof r[f] === 'string' && r[f] !== PLATZHALTER_FOTO);
    }
    for (const v of Object.values(r)) if (v && typeof v === 'object') besuche(v, tiefe + 1);
  };
  besuche(wert, 0);
  return wert;
}

/** Dasselbe fuer einen JSON-Text. Ist er kein JSON, bleibt er, wie er ist. */
export async function fotosImTextEinsetzen(text: string, gross = false): Promise<string> {
  let wert: unknown;
  try { wert = JSON.parse(text); } catch { return text; }
  try {
    return JSON.stringify(fotosEinsetzen(wert, await fotoStand(), gross));
  } catch { return text; }
}

/**
 * Eine fertige Antwort einer Route mit aktuellen Fotos ausliefern: JSON wird nachgefuehrt, alles andere geht unveraendert durch.
 * Die Koepfe (Cache-Control, CDN-Fristen) bleiben die der Route.
 */
export async function antwortMitAktuellenFotos(antwort: Response, gross = false): Promise<Response> {
  if (antwort.status !== 200 || !(antwort.headers.get('content-type') ?? '').includes('json')) return antwort;
  const text = await antwort.text();
  const koepfe = new Headers(antwort.headers);
  koepfe.delete('content-length');
  return new Response(await fotosImTextEinsetzen(text, gross), { status: antwort.status, statusText: antwort.statusText, headers: koepfe });
}

/** Alle oeffentlichen Spielerfotos (kleine Fassung) - fuer den Hintergrund der Startseite. */
export async function alleOeffentlichenFotos(): Promise<Array<{ id: string; bild: string }>> {
  const stand = await fotoStand();
  const aus: Array<{ id: string; bild: string }> = [];
  for (const id of stand.nachKonto.keys()) {
    const bild = fotoFuerKonto(stand, id);
    if (bild) aus.push({ id, bild });
  }
  return aus;
}

/**
 * Die Bytes eines Spielerfotos fuer Bilder, die der Server selbst zeichnet (Beitragsbilder, Mosaik): mitgelieferte Fotos liegen in
 * public/spielerbilder, Fotos aus dem Pool und hochgeladene nur im Objektspeicher (spielerfotos/) - dort holt sie dieselbe Stelle, die auch
 * /spielerbilder/<datei> ausliefert (app/api/spielerbild/hochladen). Null, wenn es die Datei nirgends gibt.
 */
export async function fotoBytes(datei: string): Promise<Buffer | null> {
  const name = String(datei).replace(/^spielerfotos\//, '');
  if (!name || name.includes('/') || name.includes('\\') || name.startsWith('.')) return null;
  const { promises: fs } = await import('fs');
  const path = await import('path');
  const platte = await fs.readFile(path.join(process.cwd(), 'public', 'spielerbilder', name)).catch(() => null);
  if (platte) return platte;
  const { speicher } = await import('@/lib/ablage');
  return speicher.lies(`spielerfotos/${name}`).catch(() => null);
}
