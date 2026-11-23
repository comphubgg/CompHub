import { aendereJson, liesJson } from '@/lib/ablage';

/*
 * Vorschlaege und automatische Eintragungen des Socials-Finders (scripts/socials-finden.mjs) - gelesen und entschieden in /admin/flaggen.
 *
 *   socials-vorschlaege.json  { stand, zeilen: { <epicId>: { name, zeit, x?, twitch?, land?: { wert, belege, andere }, abgelehnt: { x: [..], ... } } } }
 *   socials-auto.json         { eintraege: [{ id, name, feld, wert, zeit, lauf, belege, status: 'offen' | 'geprueft' | 'rueckgaengig' }] }
 *
 * Eine Entscheidung (angenommen, abgelehnt, geprueft, zurueckgenommen) antwortet sofort und wird gesammelt geschrieben - ein Commit fuer alle, wie
 * lib/profilWarteschlange.ts (wer schnell durchklickt, soll nicht auf je einen Commit warten). Das Speichern des Werts selbst geht den gewohnten Weg
 * ueber die Profil-Warteschlange; hier steht nur, was der Finder sich merken soll: Abgelehntes schlaegt er nicht wieder vor, Zurueckgenommenes traegt er
 * nicht wieder ein.
 */

export const VORSCHLAG_DATEI = 'socials-vorschlaege.json';
export const AUTO_DATEI = 'socials-auto.json';

export type SocialFeld = 'x' | 'twitch' | 'land' | 'anzeige';
export interface Beleg { art: string; text: string; url?: string; stark?: boolean }
export interface Vorschlag { wert: string; belege: Beleg[]; andere?: Array<{ wert: string; belege: Beleg[] }> }
export interface VorschlagZeile { name: string; zeit?: number; lauf?: string; x?: Vorschlag; twitch?: Vorschlag; land?: Vorschlag; anzeige?: Vorschlag; abgelehnt?: Partial<Record<SocialFeld, string[]>> }
export interface VorschlagDatei { stand?: number; zeilen: Record<string, VorschlagZeile> }
export interface AutoEintrag { id: string; name: string; feld: SocialFeld; wert: string; zeit: number; lauf?: string; belege: Beleg[]; status: 'offen' | 'geprueft' | 'rueckgaengig'; entschieden?: number }
export interface AutoDatei { eintraege: AutoEintrag[] }

export type Entscheidung = 'angenommen' | 'abgelehnt' | 'geprueft' | 'rueckgaengig';
export interface Markierung { id: string; feld: SocialFeld; wert: string; entscheidung: Entscheidung }

export const liesVorschlaege = () => liesJson<VorschlagDatei>(VORSCHLAG_DATEI, { zeilen: {} });
export const liesAuto = () => liesJson<AutoDatei>(AUTO_DATEI, { eintraege: [] });

const klein = (s: string) => String(s ?? '').trim().toLowerCase();

/** Eine Entscheidung auf die beiden Dateien setzen (an Ort und Stelle). */
export function wendeMarkierungAn(v: VorschlagDatei, a: AutoDatei, m: Markierung): void {
  v.zeilen ??= {};
  const z = v.zeilen[m.id];
  if (m.entscheidung === 'angenommen' || m.entscheidung === 'abgelehnt') {
    if (z && z[m.feld] && klein(z[m.feld]!.wert) === klein(m.wert)) delete z[m.feld];
  }
  if (m.entscheidung === 'abgelehnt' || m.entscheidung === 'rueckgaengig') {
    const zeile = (v.zeilen[m.id] ??= { name: '', abgelehnt: {} });
    zeile.abgelehnt ??= {};
    const liste = (zeile.abgelehnt[m.feld] ??= []);
    if (!liste.includes(klein(m.wert))) liste.push(klein(m.wert));
  }
  if (m.entscheidung === 'geprueft' || m.entscheidung === 'rueckgaengig') {
    for (const e of a.eintraege ?? []) {
      if (e.id === m.id && e.feld === m.feld && klein(e.wert) === klein(m.wert) && e.status === 'offen') { e.status = m.entscheidung; e.entschieden = Date.now(); }
    }
  }
  const rest = v.zeilen[m.id];
  if (rest && !rest.x && !rest.twitch && !rest.land && !Object.values(rest.abgelehnt ?? {}).some((l) => l?.length)) delete v.zeilen[m.id];
}

/* ------------------------------------------------------------------ gesammelt schreiben */

interface Reihe { offen: Markierung[]; uhr: ReturnType<typeof setTimeout> | null; laeuft: boolean; fehlschlaege: number }
const g = globalThis as { __comphubSocialsReihe?: Reihe };
const r: Reihe = (g.__comphubSocialsReihe ??= { offen: [], uhr: null, laeuft: false, fehlschlaege: 0 });

function planen(ms = 1500) {
  if (r.uhr) clearTimeout(r.uhr);
  r.uhr = setTimeout(() => { r.uhr = null; void schreiben(); }, ms);
}

async function schreiben(): Promise<void> {
  if (r.laeuft || !r.offen.length) return;
  r.laeuft = true;
  const teil = r.offen.splice(0, r.offen.length);
  try {
    let auto: AutoDatei = { eintraege: [] };
    if (teil.some((m) => m.entscheidung === 'geprueft' || m.entscheidung === 'rueckgaengig')) {
      auto = await aendereJson<AutoDatei>(AUTO_DATEI, { eintraege: [] }, (a) => { for (const m of teil) wendeMarkierungAn({ zeilen: {} }, a, m); });
    }
    await aendereJson<VorschlagDatei>(VORSCHLAG_DATEI, { zeilen: {} }, (v) => { for (const m of teil) wendeMarkierungAn(v, auto, m); });
    r.fehlschlaege = 0;
  } catch {
    r.offen.unshift(...teil);
    r.fehlschlaege += 1;
  } finally {
    r.laeuft = false;
    if (r.offen.length) planen(r.fehlschlaege ? Math.min(60_000, 5000 * 2 ** (r.fehlschlaege - 1)) : 1500);
  }
}

/** Eine Entscheidung merken - antwortet sofort, geschrieben wird gesammelt. */
export function markieren(m: Markierung): void {
  r.offen.push(m);
  if (!r.laeuft) planen();
}

/** Noch nicht geschriebene Entscheidungen - damit ein Neuladen gleich danach nichts schon Entschiedenes wieder zeigt. */
export const offeneMarkierungen = (): Markierung[] => [...r.offen];
