/*
 * Freundschaftsanfragen ANNEHMEN, die ein Streamer/Pro selbst an das Bot-Konto ("comphub.") geschickt hat - nur fuer Konten, die das ausdruecklich
 * freigegeben haben (Liste matchid-freigaben.json im Datenordner).
 *
 * Warum (Betreiber, 17.11.2026, EU LCQ Final): in kleinen Finals (40 Spieler) ist kein Freund des CompHub-Kontos in der Lobby; die Match-ID kommt dann
 * nur aus Epics Bestenliste - erst nachdem jemand gestorben ist und Epic neu gerechnet hat (heute Game 1: Bus 18:10:45, erste Zeile 18:24:12).
 * Der Status eines Freundes traegt die SessionId schon ab dem Warten auf der Startinsel.
 *
 * Was das NICHT ist: der Bot schickt niemandem eine Anfrage (abgeschaltet am 16.11.2026, #21, bleibt so). Er nimmt nur an, was ein freigegebenes
 * Konto selbst geschickt hat. Alles andere bleibt unberuehrt liegen (weder angenommen noch abgelehnt).
 *
 * Epic-Freundesdienst (dieselbe Adresse wie epicFreundeStatus.vollstaendigeFreunde):
 *   GET  /friends/api/v1/{konto}/incoming            -> [{ accountId, created, ... }]
 *   POST /friends/api/v1/{konto}/friends/{freund}    -> nimmt eine eingehende Anfrage an
 * VOR DEM ERSTEN ECHTEN LAUF PRUEFEN: beide Pfade sind aus den Community-Bibliotheken (fortnitepy), hier noch nicht gegen Epic gelaufen.
 */

const HEX32 = /^[0-9a-f]{32}$/;
export const FREUNDE_URL = 'https://friends-public-service-prod.ol.epicgames.com/friends/api/v1';

const norm = (id) => String(id ?? '').replace(/-/g, '').toLowerCase();

/** Die freigegebenen Epic-Ids aus dem Inhalt von matchid-freigaben.json ({ ids: [...] } oder [...]). */
export function freigabenAus(roh) {
  const liste = Array.isArray(roh) ? roh : Array.isArray(roh?.ids) ? roh.ids : [];
  return new Set(liste.map(norm).filter((x) => HEX32.test(x)));
}

/** Welche eingehenden Anfragen angenommen werden: nur freigegebene, ohne das eigene Konto, ohne Doppelte. */
export function anzunehmen(eingehend, freigaben, eigenesKonto = '') {
  const ich = norm(eigenesKonto);
  const raus = [];
  for (const e of Array.isArray(eingehend) ? eingehend : []) {
    const id = norm(e?.accountId);
    if (!HEX32.test(id) || id === ich || !freigaben.has(id) || raus.includes(id)) continue;
    raus.push(id);
  }
  return raus;
}

/**
 * Ein Durchgang: eingehende Anfragen holen, freigegebene annehmen. Gibt { angenommen, liegen, fehler } zurueck.
 * holen = fetch (fuer den Test austauschbar), basis = FREUNDE_URL.
 */
export async function annahmeDurchgang({ konto, token, freigaben, holen = fetch, basis = FREUNDE_URL }) {
  const auth = { Authorization: `bearer ${String(token).replace(/^bearer\s+/i, '')}` };
  const r = await holen(`${basis}/${konto}/incoming`, { headers: auth, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) return { angenommen: [], liegen: 0, fehler: `incoming HTTP ${r.status}` };
  const eingehend = await r.json();
  const ids = anzunehmen(eingehend, freigaben, konto);
  const angenommen = [];
  let fehler = null;
  for (const id of ids) {
    const a = await holen(`${basis}/${konto}/friends/${id}`, { method: 'POST', headers: auth, signal: AbortSignal.timeout(15_000) });
    if (a.ok) angenommen.push(id); else fehler = `annehmen ${id.slice(0, 6)}... HTTP ${a.status}`;
  }
  return { angenommen, liegen: (Array.isArray(eingehend) ? eingehend.length : 0) - angenommen.length, fehler };
}
