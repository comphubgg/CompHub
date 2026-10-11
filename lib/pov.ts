import { cookies } from 'next/headers';
import { liesJson, schreibJson } from '@/lib/ablage';
import { kontoAus, nachId, alleKonten, istVip } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { alleZugaenge, zugangNach, rechteVon } from '@/lib/vipZugaenge';

/*
 * Pro-POVs: Profis stellen ihr POV bereit und entscheiden, welche VIP-Streamer es sehen duerfen.
 *
 * Der Betreiber (11.10.2026): Profis haben ein eigenes Konto (normale Anmeldung) und sehen im Dashboard
 * nur POV und Settings. Unter POV gehen sie live, waehlen aus der Liste der VIPs, wer ihr POV sehen
 * darf, und stellen Qualitaet und ein kleines Namensbanner (HUD) ein.
 *
 * Das POV selbst laeuft ueber den Twitch-Kanal des Profis (kostenlos, mit Player-Einbettung, ohne eigene
 * Videotechnik). Hier liegt nur, wer es sehen darf und wie es dargestellt wird: die Freigabe gilt
 * auf der Streams-Seite - dort erscheint das POV nur in der Liste derer, die es sehen duerfen.
 * Gespeichert in einer Datei im Datenarchiv (pov-pros.json), je Profi ein Eintrag.
 */

const DATEI = 'pov-pros.json';
const KONTO_COOKIE = 'streamer_dashboard_konto';
const VIP_COOKIE = 'streamer_dashboard_auth';

export type PovQualitaet = 'max' | 'mittel' | 'niedrig';
export type HudOrt = 'oben' | 'unten' | 'links' | 'rechts';

export interface PovHud {
  an: boolean;
  ort: HudOrt;
  mitBild: boolean;
  /** Frei gewaehlter Text; leer = der Name des Profis. */
  text: string;
}

export interface PovPro {
  /** "k:<kontoId>" oder "z:<zugangsname>" - wer der Profi ist. */
  ident: string;
  name: string;
  /** Profilbild als Adresse oder Data-URL; null = keins. */
  bild: string | null;
  /** Der Twitch-Kanal, auf dem das POV laeuft. */
  twitch: string;
  /** Hat sich der Profi "live" gemeldet? */
  live: boolean;
  liveSeit: number | null;
  qualitaet: PovQualitaet;
  hud: PovHud;
  /** Wer zusehen darf - Kennungen wie bei "ident". */
  erlaubt: string[];
  aktualisiert: number;
}

export interface Wer {
  /** Alle Kennungen, unter denen dieser Besucher auftritt (Konto und/oder Zugangsschluessel). */
  idents: string[];
  name: string;
  rolle: 'admin' | 'manager' | 'pro' | null;
  vip: boolean;
  bild: string | null;
}

const NAME = /^[a-z0-9_]{3,25}$/;

export const HUD_STANDARD: PovHud = { an: true, ort: 'unten', mitBild: true, text: '' };

export function leererPro(ident: string, name: string, bild: string | null): PovPro {
  return {
    ident, name, bild, twitch: '', live: false, liveSeit: null, qualitaet: 'mittel',
    hud: { ...HUD_STANDARD }, erlaubt: [], aktualisiert: Date.now(),
  };
}

/** Wer fragt gerade - ueber Konto und/oder Zugangsschluessel. */
export async function wer(): Promise<Wer> {
  const laden = await cookies();
  const idents: string[] = [];
  let name = '';
  let rolle: Wer['rolle'] = null;
  let vip = false;
  let bild: string | null = null;

  const id = kontoAus(laden.get(KONTO_COOKIE)?.value);
  if (id) {
    const k = await nachId(id);
    if (k && !k.gesperrt) {
      idents.push(`k:${k.id}`);
      name = k.name;
      rolle = k.rolle ?? null;
      vip = istVip(k) || rolle === 'admin' || rolle === 'manager' || rolle === 'pro';
      bild = (k as { bild?: string | null }).bild ?? null;
    }
  }

  const wert = laden.get(VIP_COOKIE)?.value;
  if (istBetreiber(wert)) {
    idents.push('z:admin-juanito');
    return { idents, name: name || 'admin-juanito', rolle: 'admin', vip: true, bild };
  }
  const vipName = vipAus(wert);
  if (vipName) {
    idents.push(`z:${vipName.toLowerCase()}`);
    const z = await zugangNach(vipName);
    const darf = rechteVon(z);
    if (!rolle && darf.rolle) rolle = darf.rolle;
    if (!name) name = vipName;
    vip = true;
  }
  return { idents, name, rolle, vip, bild };
}

export async function liesPros(): Promise<Record<string, PovPro>> {
  return liesJson<Record<string, PovPro>>(DATEI, {});
}

export async function schreibePros(daten: Record<string, PovPro>): Promise<void> {
  await schreibJson(DATEI, daten);
}

/** Alle VIPs, die zusehen koennten - Konten mit VIP und Zugaenge mit Schluessel. */
export async function alleVips(): Promise<Array<{ ident: string; name: string }>> {
  const raus = new Map<string, { ident: string; name: string }>();
  try {
    for (const k of await alleKonten()) {
      if (k.gesperrt) continue;
      if (k.vip || k.rolle === 'admin' || k.rolle === 'manager' || k.rolle === 'pro') {
        raus.set(`k:${k.id}`, { ident: `k:${k.id}`, name: k.name });
      }
    }
  } catch { /* ohne Konten bleibt die Liste der Zugaenge */ }
  try {
    for (const z of await alleZugaenge()) {
      const n = String((z as { name?: string }).name ?? '').trim();
      if (n) raus.set(`z:${n.toLowerCase()}`, { ident: `z:${n.toLowerCase()}`, name: n });
    }
  } catch { /* nur die Konten */ }
  return [...raus.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Aus einer Eingabe die gueltigen, bereinigten Felder machen - nie mehr, als der Profi aendern darf. */
export function bereinige(alt: PovPro, teil: Record<string, unknown>, gueltigeVips: Set<string>): PovPro {
  const neu: PovPro = { ...alt, hud: { ...alt.hud }, erlaubt: [...alt.erlaubt] };

  if (typeof teil.twitch === 'string') {
    const t = teil.twitch.trim().toLowerCase()
      .replace(/^(https?:\/\/)?(www\.)?twitch\.tv\//, '').replace(/[/?#].*$/, '').replace(/^@/, '');
    neu.twitch = NAME.test(t) ? t : '';
  }
  if (typeof teil.live === 'boolean') {
    if (teil.live && !neu.live) neu.liveSeit = Date.now();
    if (!teil.live) neu.liveSeit = null;
    neu.live = teil.live;
  }
  if (teil.qualitaet === 'max' || teil.qualitaet === 'mittel' || teil.qualitaet === 'niedrig') {
    neu.qualitaet = teil.qualitaet;
  }
  const h = teil.hud as Partial<PovHud> | undefined;
  if (h && typeof h === 'object') {
    if (typeof h.an === 'boolean') neu.hud.an = h.an;
    if (h.ort === 'oben' || h.ort === 'unten' || h.ort === 'links' || h.ort === 'rechts') neu.hud.ort = h.ort;
    if (typeof h.mitBild === 'boolean') neu.hud.mitBild = h.mitBild;
    if (typeof h.text === 'string') neu.hud.text = h.text.slice(0, 40);
  }
  if (Array.isArray(teil.erlaubt)) {
    neu.erlaubt = [...new Set((teil.erlaubt as unknown[]).map(String).filter((x) => gueltigeVips.has(x)))];
  }
  if (typeof teil.bild === 'string' || teil.bild === null) {
    // Nur ein kleines Bild: Data-URL (aus dem Dashboard auf 256 px verkleinert) oder eine eigene Adresse.
    const b = teil.bild as string | null;
    neu.bild = b && b.length < 120_000 && /^(data:image\/(webp|png|jpeg);base64,|\/)/.test(b) ? b : null;
  }
  neu.aktualisiert = Date.now();
  return neu;
}

/** Was ein Besucher von einem POV sehen darf - ohne die Freigabeliste. */
export function oeffentlichPov(p: PovPro) {
  return {
    ident: p.ident, name: p.name, bild: p.bild, twitch: p.twitch,
    live: p.live, liveSeit: p.liveSeit, hud: p.hud,
  };
}
