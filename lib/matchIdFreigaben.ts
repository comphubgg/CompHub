import { liesJson, aendereJson } from '@/lib/ablage';

/*
 * Die Freigabeliste fuer das Bot-Konto "comphub." (Betreiber, 17.11.2026, EU LCQ Final: "bau das direkt mal ein").
 *
 * In kleinen Finals ist oft kein Freund unserer Konten in der Lobby - die Match-ID kommt dann erst aus Epics Bestenliste, nach dem ersten Tod
 * (heute 2,4 bis 13,5 min nach dem Bus). Ein Freund in der Lobby nennt sie schon auf der Startinsel. Deshalb: Streamer/Pros, die das wollen, schicken
 * dem Bot-Konto SELBST eine Freundschaftsanfrage; steht ihr Konto hier, nimmt der XMPP-Dienst sie an (lib/freundAnnahme.mjs). Der Bot schickt nie
 * eine Anfrage (#21).
 *
 * Abgelegt als matchid-freigaben.json ({ eintraege: [{ id, name, seit, von }] }). Bei jedem Aendern - und bei jedem Verbinden der Seite mit dem Dienst
 * (lib/epicFreundeStatus) - geht die Liste an den XMPP-Dienst (POST /freigaben).
 */

export interface Freigabe { id: string; name: string; seit: string; von: string }
interface Datei { eintraege: Freigabe[] }

const DATEI = 'matchid-freigaben.json';
const HEX32 = /^[0-9a-f]{32}$/;
const DIENST = (process.env.XMPP_DIENST_URL || '').replace(/\/+$/, '');

export const epicIdNorm = (id: string) => String(id ?? '').replace(/-/g, '').trim().toLowerCase();

export async function freigaben(): Promise<Freigabe[]> {
  const d = await liesJson<Datei>(DATEI, { eintraege: [] }).catch(() => ({ eintraege: [] } as Datei));
  return (d.eintraege ?? []).filter((e) => HEX32.test(e?.id ?? ''));
}

/** Die Liste an den XMPP-Dienst geben. Ohne Dienst (lokal) oder wenn er nicht antwortet: false - beim naechsten Verbinden wird erneut gesendet. */
export async function freigabenSenden(liste?: Freigabe[]): Promise<boolean> {
  if (!DIENST) return false;
  try {
    const ids = (liste ?? await freigaben()).map((e) => e.id);
    const r = await fetch(`${DIENST}/freigaben`, {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(5_000),
      headers: { 'Content-Type': 'application/json', ...(process.env.XMPP_DIENST_GEHEIM ? { Authorization: `Bearer ${process.env.XMPP_DIENST_GEHEIM}` } : {}) },
      body: JSON.stringify({ ids }),
    });
    return r.ok;
  } catch { return false; }
}

/** Ein Konto aufnehmen (oder seinen Namen erneuern). */
export async function freigabeDazu(id: string, name: string, von: string): Promise<{ liste: Freigabe[]; gesendet: boolean }> {
  const k = epicIdNorm(id);
  if (!HEX32.test(k)) throw new Error('Keine gueltige Epic-Konto-Id');
  const d = await aendereJson<Datei>(DATEI, { eintraege: [] }, (w) => {
    w.eintraege = (w.eintraege ?? []).filter((e) => e.id !== k);
    w.eintraege.push({ id: k, name: name.slice(0, 60) || k.slice(0, 8), seit: new Date().toISOString(), von: von.slice(0, 60) });
  });
  return { liste: d.eintraege, gesendet: await freigabenSenden(d.eintraege) };
}

export async function freigabeWeg(id: string): Promise<{ liste: Freigabe[]; gesendet: boolean }> {
  const k = epicIdNorm(id);
  const d = await aendereJson<Datei>(DATEI, { eintraege: [] }, (w) => { w.eintraege = (w.eintraege ?? []).filter((e) => e.id !== k); });
  return { liste: d.eintraege, gesendet: await freigabenSenden(d.eintraege) };
}
