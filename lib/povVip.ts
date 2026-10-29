import crypto from 'crypto';
import { liesJson, schreibJson } from '@/lib/ablage';
import { aendern, nachId } from '@/lib/konten';
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
 * Gespeichert im Datenarchiv (pov-einladungen.json), je Einladung ein Eintrag; ein Link gilt vierzehn Tage und einmal.
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
}

const lies = () => liesJson<Record<string, ProEinladung>>(DATEI, {});
const schreibe = (d: Record<string, ProEinladung>) => schreibJson(DATEI, d);

export const gueltig = (e: ProEinladung) => !e.angenommen && Date.now() - e.erstellt < GUELTIG_MS;

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
  if (!e || e.angenommen || !e.vip.some((v) => ich.idents.includes(v))) return false;
  delete alle[code];
  await schreibe(alle);
  return true;
}

/**
 * Eine Einladung annehmen: das Konto wird Pro (eine hoehere Rolle bleibt), und der einladende VIP darf zusehen.
 * Nur mit einem Konto - ein VIP-Zugang hat keine Rolle, die sich hier setzen liesse.
 */
export async function annehmen(code: string, kontoId: string): Promise<{ ok: true; vipName: string } | { ok: false; fehler: string }> {
  const alle = await lies();
  const e = alle[code];
  if (!e) return { ok: false, fehler: 'Diese Einladung gibt es nicht.' };
  if (!gueltig(e)) return { ok: false, fehler: e.angenommen ? 'Diese Einladung wurde schon angenommen.' : 'Diese Einladung ist abgelaufen.' };
  const k = await nachId(kontoId);
  if (!k || k.gesperrt) return { ok: false, fehler: 'Erst anmelden.' };
  const ident = `k:${k.id}`;
  if (e.vip.includes(ident)) return { ok: false, fehler: 'Das ist deine eigene Einladung.' };
  if (!k.rolle) await aendern(k.id, { rolle: 'pro' });
  await sichereProEintrag(ident, k.name);
  const pros = await liesPros();
  const p = pros[ident];
  if (p) {
    p.erlaubt = [...new Set([...(p.erlaubt ?? []), ...e.vip])];
    p.aktualisiert = Date.now();
    await schreibePros(pros);
  }
  e.angenommen = { ident, name: k.name, zeit: Date.now() };
  alle[code] = e;
  await schreibe(alle);
  return { ok: true, vipName: e.vipName };
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
