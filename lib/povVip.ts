import crypto from 'crypto';
import { liesJson, schreibJson } from '@/lib/ablage';
import { aendern, anlegen, nachId, nachName } from '@/lib/konten';
import { zugangNach } from '@/lib/vipZugaenge';
import { istLive } from '@/lib/povRelay';
import { liesPros, schreibePros, sichereProEintrag, type Wer } from '@/lib/pov';

/*
 * Der POV-Bereich der VIPs (/pov).
 *
 * Der Betreiber (27./29.10.2026): "die VIPs sollen auch die POV-Seite sehen, einfach nur wie sie funktioniert + die koennen Pros anmelden, sodass die Pros
 * einen Account haben, wo dann der VIP, der ihren Account angemeldet hat, ihre POVs sehen kann". Ein VIP erstellt dafuer einen Einladungslink; wer ihn
 * oeffnet und sich anmeldet, bekommt die Rolle Pro, und der einladende VIP darf sein POV von Anfang an sehen. Mehr nicht: der Pro entscheidet danach
 * selbst, wer zusehen darf, und der Admin kann die Rolle jederzeit wieder nehmen.
 *
 * Gespeichert im Datenarchiv (pov-einladungen.json), je Einladung ein Eintrag.
 *
 * Seit dem 29.10.2026 (Betreiber: "man soll direkt automatisch in ein Pro-Account geladen werden, Passwort und Name sieht man dann im Dashboard ... man soll
 * sich nicht selber einloggen muessen ... mit dem Link kommt man immer auf den gleichen Account ... im Dashboard steht, wer sein Chef ist"): das erste
 * Oeffnen legt ein eigenes Pro-Konto an (Name, erzeugtes Passwort) und meldet an; jedes weitere Oeffnen meldet in dasselbe Konto an. Der Link ist damit
 * der Schluessel zu diesem Konto - zieht der VIP ihn zurueck, oeffnet er nichts mehr (das Konto bleibt). Das erste Oeffnen muss binnen vierzehn Tagen sein.
 */

const DATEI = 'pov-einladungen.json';
const GUELTIG_MS = 14 * 864e5;

export interface ProEinladung {
  code: string;
  /** Alle Kennungen des einladenden VIPs - dieselbe Person kann als Konto und als Zugang auftreten. */
  vip: string[];
  vipName: string;
  /** Wen der VIP einladen wollte (frei, nur zur Erinnerung). */
  name: string;
  erstellt: number;
  angenommen?: { ident: string; name: string; zeit: number };
  /** Das Konto, das der Link oeffnet - mit den Anmeldedaten, die der Pro in seinem Dashboard sieht. */
  konto?: { id: string; login: string; passwort: string };
  /** Vom VIP zurueckgezogen: der Link oeffnet nichts mehr. */
  gesperrt?: boolean;
}

const lies = () => liesJson<Record<string, ProEinladung>>(DATEI, {});
const schreibe = (d: Record<string, ProEinladung>) => schreibJson(DATEI, d);

/** Oeffnet der Link (noch) etwas? Vor dem ersten Oeffnen vierzehn Tage, danach so lange, bis der VIP ihn zurueckzieht. */
export const gueltig = (e: ProEinladung) => !e.gesperrt && (Boolean(e.konto) || Date.now() - e.erstellt < GUELTIG_MS);

export async function einladungenVon(ich: Wer): Promise<ProEinladung[]> {
  const alle = await lies();
  return Object.values(alle).filter((e) => e.vip.some((v) => ich.idents.includes(v))).sort((a, b) => b.erstellt - a.erstellt);
}

export async function einladungNach(code: string): Promise<ProEinladung | null> {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(code)) return null;
  return (await lies())[code] ?? null;
}

export async function neueEinladung(ich: Wer, name: string): Promise<ProEinladung> {
  const alle = await lies();
  // Hoechstens zwanzig offene Einladungen je VIP - mehr braucht niemand, und es haelt Ausprobieren in Grenzen.
  const offen = Object.values(alle).filter((e) => gueltig(e) && e.vip.some((v) => ich.idents.includes(v)));
  if (offen.length >= 20) throw new Error('Höchstens 20 offene Einladungen - zieh erst eine alte zurück.');
  const e: ProEinladung = {
    code: crypto.randomBytes(12).toString('base64url'), vip: ich.idents, vipName: ich.name,
    name: name.trim().slice(0, 40), erstellt: Date.now(),
  };
  alle[e.code] = e;
  await schreibe(alle);
  return e;
}

export async function zurueckziehen(ich: Wer, code: string): Promise<boolean> {
  const alle = await lies();
  const e = alle[code];
  if (!e || !e.vip.some((v) => ich.idents.includes(v))) return false;
  // Noch nie geoeffnet: weg damit. Schon ein Konto dahinter: nur sperren - der Pro behaelt sein Konto, der Link oeffnet es nicht mehr.
  if (e.konto) alle[code] = { ...e, gesperrt: true }; else delete alle[code];
  await schreibe(alle);
  return true;
}

/** Ein lesbares Passwort ohne leicht verwechselbare Zeichen (0/O, 1/l/I), drei Gruppen zu vier. */
function neuesProPasswort(): string {
  const z = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.randomBytes(12);
  return [0, 4, 8].map((i) => Array.from(b.subarray(i, i + 4), (x) => z[x % z.length]).join('')).join('-');
}

/** Ein freier Kontoname aus dem Wunschnamen des VIPs (sonst "pro-..."). */
async function freierName(wunsch: string, code: string): Promise<string> {
  const basis = wunsch.normalize('NFKD').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 20) || `pro-${code.slice(0, 6).toLowerCase()}`;
  for (let i = 0; i < 50; i += 1) {
    const name = i ? `${basis}${i + 1}` : basis;
    if (!await nachName(name)) return name;
  }
  return `pro-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Den Link oeffnen: beim ersten Mal ein eigenes Pro-Konto anlegen (der einladende VIP darf zusehen), danach immer dasselbe Konto. Zurueck kommt die
 * Konto-Id, mit der die Route die Sitzung setzt.
 */
export async function oeffnen(code: string): Promise<{ ok: true; kontoId: string; neu: boolean } | { ok: false; fehler: string }> {
  const alle = await lies();
  const e = alle[code];
  if (!e) return { ok: false, fehler: 'Diese Einladung gibt es nicht.' };
  if (e.gesperrt) return { ok: false, fehler: 'Diese Einladung wurde zurückgezogen.' };
  if (e.konto) {
    const k = await nachId(e.konto.id);
    if (!k || k.gesperrt) return { ok: false, fehler: 'Das Konto zu dieser Einladung gibt es nicht mehr.' };
    return { ok: true, kontoId: k.id, neu: false };
  }
  if (!gueltig(e)) return { ok: false, fehler: 'Diese Einladung ist abgelaufen.' };
  const name = await freierName(e.name, code);
  const passwort = neuesProPasswort();
  const r = await anlegen({ email: `pro-${crypto.randomBytes(6).toString('hex')}@pro.thecomphub.com`, name, passwort, bestaetigt: true });
  if ('fehler' in r) return { ok: false, fehler: r.fehler };
  await aendern(r.konto.id, { rolle: 'pro' });
  const ident = `k:${r.konto.id}`;
  await sichereProEintrag(ident, name);
  const pros = await liesPros();
  const p = pros[ident];
  if (p) {
    p.erlaubt = [...new Set([...(p.erlaubt ?? []), ...e.vip])];
    p.aktualisiert = Date.now();
    await schreibePros(pros);
  }
  e.angenommen = { ident, name, zeit: Date.now() };
  e.konto = { id: r.konto.id, login: name, passwort };
  alle[code] = e;
  await schreibe(alle);
  return { ok: true, kontoId: r.konto.id, neu: true };
}

/** Fuer das Dashboard des Pros: sein Chef (der einladende VIP) und seine Anmeldedaten - null, wenn er nicht ueber eine Einladung kam. */
export async function zugangVon(ich: Wer): Promise<{ chef: string; login: string; passwort: string; seit: number } | null> {
  const e = Object.values(await lies()).find((x) => x.konto && x.angenommen && ich.idents.includes(x.angenommen.ident));
  return e?.konto ? { chef: e.vipName, login: e.konto.login, passwort: e.konto.passwort, seit: e.angenommen?.zeit ?? e.erstellt } : null;
}

/** Das Discord-Konto des VIPs - aus dem Konto (mit Discord angemeldet) oder dem VIP-Zugang. Leer, wenn keines. */
export async function discordIdVon(ich: Wer): Promise<string> {
  for (const ident of ich.idents) {
    try {
      if (ident.startsWith('k:')) {
        const id = (await nachId(ident.slice(2)))?.dienste?.discord;
        if (id) return id;
      } else if (ident.startsWith('z:')) {
        const id = (await zugangNach(ident.slice(2)))?.discordId;
        if (id) return id;
      }
    } catch { /* naechste Kennung */ }
  }
  return '';
}

/** Die Pros, die diesen VIP zusehen lassen - mit Live-Stand und ob sie ueber seine Einladung kamen. */
export async function prosVon(ich: Wer): Promise<Array<{ ident: string; name: string; bild: string | null; live: boolean; fuerAlle: boolean; eingeladen: boolean }>> {
  const [pros, einladungen] = await Promise.all([liesPros(), einladungenVon(ich)]);
  const eingeladen = new Set(einladungen.map((e) => e.angenommen?.ident).filter(Boolean) as string[]);
  return Object.values(pros)
    .filter((p) => !ich.idents.includes(p.ident) && ((p.erlaubt ?? []).some((e) => ich.idents.includes(e)) || eingeladen.has(p.ident)))
    .map((p) => ({ ident: p.ident, name: p.name, bild: p.bild, live: istLive(p.ident), fuerAlle: p.fuerAlle === true, eingeladen: eingeladen.has(p.ident) }))
    .sort((a, b) => Number(b.live) - Number(a.live) || a.name.localeCompare(b.name));
}
