import { cookies } from 'next/headers';
import { liesJson, schreibJson } from '@/lib/ablage';
import { kontoAus, nachId, alleKonten, istVip } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { alleZugaenge, zugangNach, rechteVon } from '@/lib/vipZugaenge';
import { istLive, liveSeit } from '@/lib/povRelay';
import { spielerbildKlein } from '@/lib/spielerbildKlein';
import { gildenDerVips, kuendigeAn } from '@/lib/discordGilden';

/*
 * Pro-POVs: Profis stellen ihr POV bereit und entscheiden, welche VIP-Streamer es sehen duerfen.
 *
 * Der Betreiber (11.10.2026): Profis haben ein eigenes Konto (normale Anmeldung) und sehen im Dashboard
 * nur POV und Settings. Dort teilen sie ihr Bild, waehlen aus der Liste der VIPs - einzeln -, wer es sehen
 * darf, und stellen die Qualitaet ein. Das Namensbanner (HUD) stellt NICHT der Profi ein, sondern jeder
 * zuschauende VIP selbst in den Einstellungen der Streams-Seite (Position, mit/ohne Profilbild); das Feld
 * "hud" im Profil bleibt nur fuer alte Eintraege.
 *
 * Nichts davon laeuft ueber Twitch - die Profis wollen nicht oeffentlich streamen, damit keine Fremden
 * zusehen und sie nicht griefen koennen. Das Bild geht direkt vom Browser des Profis an den Server und von
 * dort nur an die Freigegebenen (lib/povRelay.ts). Hier liegt, wer das darf und wie es dargestellt wird;
 * gespeichert in einer Datei im Datenarchiv (pov-pros.json), je Profi ein Eintrag.
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
  /** Frueher der Twitch-Kanal - das POV laeuft nicht mehr ueber Twitch; das Feld bleibt nur fuer alte Eintraege. */
  twitch: string;
  /** Ob der Profi gerade sendet, weiss der Weiterreicher (lib/povRelay.ts); hier steht nur der alte Merker. */
  live: boolean;
  liveSeit: number | null;
  qualitaet: PovQualitaet;
  hud: PovHud;
  /** Wer zusehen darf - Kennungen wie bei "ident". */
  erlaubt: string[];
  /**
   * Fuer jeden freigegeben (Betreiber, 26.10.2026: "die Pros koennten das POV fuer alle oeffentlich machen - jeder, der auf der Webseite ist und sich eingeloggt hat, kann es
   * angucken"). Gilt fuer jeden Angemeldeten (Konto oder Zugang); wer nicht angemeldet ist, sieht auch hier nichts. Die Liste "erlaubt" bleibt daneben bestehen.
   */
  fuerAlle?: boolean;
  /**
   * Frueher ein Discord-Webhook des Profis. Der Betreiber (11.10.2026): keine Webhooks je Kanal - Ankuendigungen
   * laufen jetzt ueber den Bot (siehe "gilden"). Das Feld bleibt nur fuer alte Eintraege und wird nicht mehr benutzt.
   */
  webhook: string;
  /**
   * Die Discord-Server, auf denen das POV angekuendigt wird, wenn der Profi live geht (Kennungen). Auf jedem
   * dieser Server muss CompHub eingeladen und ein Meldungs-Kanal gewaehlt sein (lib/discordGilden.ts). Das Bild
   * selbst sehen nur die Freigegebenen auf CompHub (Discord laesst Bots keine Bildschirmuebertragung empfangen).
   */
  gilden: string[];
  /**
   * Das Discord-Konto des Profis (Konto-Id und Anzeigename im CompHub-Server). Damit sieht der Bot, wann er in
   * einem Sprachkanal streamt (lib/povDiscord.ts). Leer = das Konto, mit dem das Konto ohnehin verknuepft ist.
   */
  discordId: string;
  discordName: string;
  aktualisiert: number;
}

export interface Wer {
  /** Alle Kennungen, unter denen dieser Besucher auftritt (Konto und/oder Zugangsschluessel). */
  idents: string[];
  name: string;
  rolle: 'admin' | 'manager' | 'pro' | null;
  vip: boolean;
  bild: string | null;
  /** Die angehakten Bereiche (lib/rechte) - u. a. die VIP-Werkzeuge propov, matchfinder, twitchstatistik, twitchbot. */
  rechte: string[];
}

/** Darf dieser Besucher ein VIP-Werkzeug nutzen? Der Admin immer, ein VIP nur mit dem Haken (lib/rechte VIP_BEREICHE). */
export function vipWerkzeug(ich: Wer, bereich: string): boolean {
  return ich.rolle === 'admin' || (ich.vip && ich.rechte.includes(bereich));
}

const NAME = /^[a-z0-9_]{3,25}$/;

export const HUD_STANDARD: PovHud = { an: true, ort: 'unten', mitBild: true, text: '' };

export function leererPro(ident: string, name: string, bild: string | null): PovPro {
  return {
    ident, name, bild, twitch: '', live: false, liveSeit: null, qualitaet: 'mittel',
    hud: { ...HUD_STANDARD }, erlaubt: [], webhook: '', gilden: [], discordId: '', discordName: '', aktualisiert: Date.now(),
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
  const rechte: string[] = [];

  const id = kontoAus(laden.get(KONTO_COOKIE)?.value);
  if (id) {
    const k = await nachId(id);
    if (k && !k.gesperrt) {
      idents.push(`k:${k.id}`);
      name = k.name;
      rolle = k.rolle ?? null;
      vip = istVip(k) || rolle === 'admin' || rolle === 'manager' || rolle === 'pro';
      bild = (k as { bild?: string | null }).bild ?? null;
      rechte.push(...((k as { rechte?: string[] }).rechte ?? []));
    }
  }

  const wert = laden.get(VIP_COOKIE)?.value;
  if (istBetreiber(wert)) {
    idents.push('z:admin-juanito');
    return { idents, name: name || 'admin-juanito', rolle: 'admin', vip: true, bild, rechte };
  }
  const vipName = vipAus(wert);
  if (vipName) {
    idents.push(`z:${vipName.toLowerCase()}`);
    const z = await zugangNach(vipName);
    const darf = rechteVon(z);
    if (!rolle && darf.rolle) rolle = darf.rolle;
    if (!name) name = vipName;
    rechte.push(...(darf.rechte ?? []));
    vip = true;
  }
  return { idents, name, rolle, vip, bild, rechte: [...new Set(rechte)] };
}

export async function liesPros(): Promise<Record<string, PovPro>> {
  return liesJson<Record<string, PovPro>>(DATEI, {});
}

export async function schreibePros(daten: Record<string, PovPro>): Promise<void> {
  await schreibJson(DATEI, daten);
}

export interface VipEintrag {
  /** Die Hauptkennung dieses VIPs (Konto vor Zugang). */
  ident: string;
  name: string;
  /** Alle Kennungen dieses VIPs - dieselbe Person kann als Konto und als Zugang auftreten. */
  auch: string[];
}

/**
 * Alle VIPs, die zusehen koennten - jeder einzelne mit VIP-Status.
 *
 * Der Betreiber (11.10.2026): in der Liste des Profis standen nur vier Konten. Ursache: die VIP-Zugaenge
 * (Anmeldename + Schluessel - dort liegen die meisten VIPs) wurden ueber ein Feld "name" gelesen, das es
 * dort nicht gibt (es heisst "username"), und fielen deshalb alle heraus. Jetzt stehen sie drin; gesperrte
 * und abgelaufene nicht. Dieselbe Person als Konto und als Zugang (gleicher Name) steht einmal da; das
 * Anhaken gibt dann beide Kennungen frei, damit sie zusehen kann, womit auch immer sie sich anmeldet.
 */
export async function alleVips(): Promise<VipEintrag[]> {
  const nachName = new Map<string, VipEintrag>();
  const trage = (ident: string, name: string) => {
    const schluessel = name.trim().toLowerCase();
    if (!schluessel) return;
    const da = nachName.get(schluessel);
    if (da) {
      if (!da.auch.includes(ident)) da.auch.push(ident);
      // Das Konto geht vor: seine Kennung ist die Hauptkennung.
      if (ident.startsWith('k:') && !da.ident.startsWith('k:')) da.ident = ident;
    } else {
      nachName.set(schluessel, { ident, name: name.trim(), auch: [ident] });
    }
  };
  try {
    for (const k of await alleKonten()) {
      if (k.gesperrt) continue;
      if (k.vip || k.rolle === 'admin' || k.rolle === 'manager' || k.rolle === 'pro') trage(`k:${k.id}`, k.name);
    }
  } catch { /* ohne Konten bleibt die Liste der Zugaenge */ }
  try {
    for (const z of await alleZugaenge()) {
      // Gesperrte und abgelaufene Zugaenge sind keine VIPs mehr.
      if (z.status === 'disabled') continue;
      if (typeof z.vipBis === 'number' && z.vipBis > 0 && z.vipBis <= Date.now()) continue;
      const u = String(z.username ?? '').trim();
      if (u) trage(`z:${u.toLowerCase()}`, u);
    }
  } catch { /* nur die Konten */ }
  return [...nachName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

interface Bildeintrag { datei: string; epicId: string; echtesFoto?: boolean }

/** Das Spielerfoto zu einem Epic-Konto (kleine Fassung) - oder nichts. */
const fotoMerk = new Map<string, { bis: number; pfad: string | null }>();

export async function spielerFoto(epicId: string | null | undefined): Promise<string | null> {
  const id = String(epicId ?? '').replace(/-/g, '').toLowerCase();
  if (!id) return null;
  // Fuenf Minuten gemerkt: die Streams-Seite fragt alle zwanzig Sekunden, die Bilderliste ist gross.
  const da = fotoMerk.get(id);
  if (da && da.bis > Date.now()) return da.pfad;
  const bilder = await liesJson<Bildeintrag[]>('spielerbilder.json', []);
  const gleich = bilder.filter((b) => String(b.epicId ?? '').replace(/-/g, '').toLowerCase() === id);
  const b = gleich.find((x) => x.echtesFoto) ?? gleich[0];
  const pfad = b ? spielerbildKlein(b.datei) : null;
  fotoMerk.set(id, { bis: Date.now() + 5 * 60_000, pfad });
  return pfad;
}

/**
 * Das Profilbild, das ein Profi ohne eigene Wahl bekommt: sein Spielerfoto ueber das verknuepfte Epic-Konto
 * (der Betreiber: "ich mache Vico zum Pro, dann hat er sowieso ein Bild - gib ihm das"), sonst das Bild
 * seines Kontos. Ein selbst gewaehltes Bild geht immer vor.
 */
export async function standardBild(ident: string): Promise<string | null> {
  try {
    if (ident.startsWith('z:')) {
      const z = await zugangNach(ident.slice(2));
      return await spielerFoto(z?.epicId);
    }
    if (!ident.startsWith('k:')) return null;
    const k = await nachId(ident.slice(2));
    if (!k) return null;
    return (await spielerFoto(k.epicId)) ?? ((k as { bild?: string | null }).bild ?? null);
  } catch { return null; }
}

/**
 * Den Eintrag eines Profis anlegen, wenn er noch keinen hat - sobald er sendet.
 *
 * Bisher entstand der Eintrag erst, wenn jemand im Dashboard etwas speicherte. Wer ohne das sendete (der Admin beim
 * Ausprobieren, ein neuer Profi), stand in keiner Liste: der Betreiber (12.10.2026) schaute auf den Eintrag "juanito"
 * (sein Profi-Konto, offline), waehrend sein Admin-Konto sendete - und sah nichts. Mit dem Eintrag taucht jedes
 * sendende POV fuer den Admin im Ordner POVs auf.
 */
export async function sichereProEintrag(ident: string, name: string): Promise<PovPro> {
  const alle = await liesPros();
  if (alle[ident]) return alle[ident];
  const neu = leererPro(ident, name, await standardBild(ident));
  alle[ident] = neu;
  await schreibePros(alle);
  return neu;
}

/**
 * Das Epic-Konto eines Profis, sofern eines verknuepft oder zugewiesen ist (Konto oder Zugang) - leer, wenn keines.
 * Nur wer eines hat, kann seine Werte auf dem POV zeigen.
 */
export async function epicIdVon(ident: string): Promise<string> {
  try {
    let id: string | undefined;
    if (ident.startsWith('z:')) id = (await zugangNach(ident.slice(2)))?.epicId;
    else if (ident.startsWith('k:')) id = (await nachId(ident.slice(2)))?.epicId;
    return String(id ?? '').replace(/-/g, '').toLowerCase();
  } catch { return ''; }
}

/** Aus einer Eingabe die gueltigen, bereinigten Felder machen - nie mehr, als der Profi aendern darf. */
export function bereinige(alt: PovPro, teil: Record<string, unknown>, gueltigeVips: Set<string>): PovPro {
  const neu: PovPro = { ...alt, hud: { ...alt.hud }, erlaubt: [...alt.erlaubt], gilden: [...(alt.gilden ?? [])] };

  if (typeof teil.twitch === 'string') {
    const t = teil.twitch.trim().toLowerCase()
      .replace(/^(https?:\/\/)?(www\.)?twitch\.tv\//, '').replace(/[/?#].*$/, '').replace(/^@/, '');
    neu.twitch = NAME.test(t) ? t : '';
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
  if (typeof teil.fuerAlle === 'boolean') neu.fuerAlle = teil.fuerAlle;
  if (Array.isArray(teil.gilden)) {
    // Nur Server-Kennungen; ob der Bot dort sitzt, prueft die Ankuendigung beim Live-Gehen.
    neu.gilden = [...new Set((teil.gilden as unknown[]).map(String).filter((x) => /^\d{15,25}$/.test(x)))].slice(0, 50);
  }
  if (typeof teil.discordId === 'string') {
    // Die Pruefung, ob es ein Mitglied des Servers ist, macht die Schnittstelle (sie fragt Discord); hier nur die Form.
    const d = teil.discordId.trim();
    neu.discordId = /^\d{15,25}$/.test(d) ? d : '';
    if (!neu.discordId) neu.discordName = '';
  }
  if (typeof teil.discordName === 'string' && neu.discordId) neu.discordName = teil.discordName.trim().slice(0, 60);
  if (typeof teil.bild === 'string' || teil.bild === null) {
    // Nur ein kleines Bild: Data-URL (aus dem Dashboard auf 256 px verkleinert) oder eine eigene Adresse.
    const b = teil.bild as string | null;
    neu.bild = b && b.length < 120_000 && /^(data:image\/(webp|png|jpeg);base64,|\/)/.test(b) ? b : null;
  }
  neu.aktualisiert = Date.now();
  return neu;
}

/** Was ein Besucher von einem POV sehen darf - ohne die Freigabeliste. Ob es live ist, weiss der Weiterreicher. */
export function oeffentlichPov(p: PovPro) {
  return {
    ident: p.ident, name: p.name, bild: p.bild,
    live: istLive(p.ident), liveSeit: liveSeit(p.ident), hud: p.hud,
  };
}

/**
 * Den Discord-Servern des Profis sagen, dass er live ist - ohne dass ein Fehler hier etwas blockiert. Dazu die Server der VIPs, die ihm zusehen duerfen
 * und dort die Meldungen ihrer Pros eingeschaltet haben (POV-Bereich des VIPs, 29.10.2026).
 */
export async function meldeLive(p: PovPro, seite: string): Promise<void> {
  let gilden = [...(p.gilden ?? [])];
  try { gilden = [...new Set([...gilden, ...await gildenDerVips(p.erlaubt ?? [])])]; } catch { /* dann nur die eigenen */ }
  if (!gilden.length) return;
  try { await kuendigeAn(p.ident, p.name, gilden, seite); } catch { /* die Meldung ist ein Zusatz */ }
}
