import { aendereJson, liesJson } from '@/lib/ablage';

/*
 * Wer hat ein Spielerfoto gemacht, und duerfen wir es zeigen (Betreiber, 16./17.11.2026)?
 *
 * Die alten, uebernommenen Fotos sind entfernt; der Betreiber laedt neue hoch (/admin/fotos-credits) und traegt dabei ein, von wem sie sind. Dafuer diese
 * kleine Tafel in der Ablage (comphub-daten, wie spieler-profile.json), je Fotodatei (spielerbilder.json "datei", z. B. "vico-1a2b3c4d-mvx1.webp"):
 *
 *   foto-credits.json   { "<datei>": { quelle?, fotograf?, link?, lizenz?, bestaetigt, wahrscheinlich?, notiz?, geaendert? } }
 *
 *   quelle         Eigentuemer/Herkunft, z. B. "Epic Games" oder "ESL".
 *   fotograf       Die Person hinter der Kamera.
 *   handle         Das X-Konto ohne "@" ("KonkolMichal") - des Fotografen, oder der Org, wenn kein Fotograf eingetragen ist.
 *   link           Ein Verweis zum Fotografen (X, Portfolio) - fehlt er, gilt x.com/<handle>.
 *   lizenz         Nur intern: unter welcher Erlaubnis wir es zeigen ("Erlaubnis per Mail 18.11.", "Epic Media Kit", "CC BY 4.0").
 *   bestaetigt     Intern: Angabe geprueft. Oeffentlich steht seit 17.11.2026 jede benannte Quelle in der Liste "Photos from"
 *                  (lib/fotoQuellen.ts); am einzelnen Foto nur kleine Quellen oder "einzeln".
 *   einzeln        Den kleinen Credit am Foto auch bei einer grossen Quelle zeigen (lib/fotoQuellen.ts).
 *   wahrscheinlich Nur intern: eine Vermutung. Geht nie an die oeffentliche Schnittstelle.
 *   notiz          Nur intern.
 */

export const CREDIT_DATEI = 'foto-credits.json';

export interface FotoCredit {
  quelle?: string;
  fotograf?: string;
  /** X-Konto ohne "@". */
  handle?: string;
  link?: string;
  /** Nur intern. */
  lizenz?: string;
  bestaetigt: boolean;
  /** Den kleinen Credit am Foto auch zeigen, wenn die Quelle gross ist (lib/fotoQuellen.ts). */
  einzeln?: boolean;
  /** Nur intern: wer es vermutlich war. */
  wahrscheinlich?: string;
  /** Nur intern. */
  notiz?: string;
  geaendert?: number;
}
export type CreditTafel = Record<string, FotoCredit>;
export const CREDIT_FELDER = ['quelle', 'fotograf', 'handle', 'link', 'lizenz', 'bestaetigt', 'einzeln', 'wahrscheinlich', 'notiz'] as const;
export type CreditEingabe = Partial<Record<typeof CREDIT_FELDER[number], unknown>>;

/** Dateinamen, wie sie in spielerbilder.json stehen - ohne Ordner. */
export const DATEI_MUSTER = /^[A-Za-z0-9._ ()-]{1,100}\.(?:jpe?g|png|webp)$/i;

const text = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

/** Nur http(s)-Adressen - ein "javascript:"-Link am Foto waere ein Loch. */
export function sauberLink(v: unknown): string {
  const s = text(v, 300);
  if (!s) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : '';
  } catch { return ''; }
}

/** "@KonkolMichal", "x.com/KonkolMichal", "https://twitter.com/KonkolMichal" -> "KonkolMichal"; sonst "". */
export function sauberHandle(v: unknown): string {
  const s = text(v, 120).replace(/^https?:\/\//i, '').replace(/^(?:www\.)?(?:x|twitter)\.com\//i, '').replace(/^@/, '').split(/[/?#\s]/)[0];
  return /^[A-Za-z0-9_]{1,15}$/.test(s) ? s : '';
}

/** Eine Eingabe in einen gueltigen Eintrag verwandeln. Felder, die fehlen (undefined), bleiben wie im alten Eintrag; "" loescht. null = nichts mehr da. */
export function mitAenderung(alt: FotoCredit | undefined, e: CreditEingabe): FotoCredit | null {
  const neu: FotoCredit = { ...(alt ?? { bestaetigt: false }) };
  for (const f of ['quelle', 'fotograf', 'lizenz', 'wahrscheinlich', 'notiz'] as const) {
    if (e[f] !== undefined) { const v = text(e[f], f === 'notiz' || f === 'lizenz' ? 300 : 80); if (v) neu[f] = v; else delete neu[f]; }
  }
  if (e.handle !== undefined) { const v = sauberHandle(e.handle); if (v) neu.handle = v; else delete neu.handle; }
  if (e.link !== undefined) { const v = sauberLink(e.link); if (v) neu.link = v; else delete neu.link; }
  if (e.bestaetigt !== undefined) neu.bestaetigt = e.bestaetigt === true || e.bestaetigt === 'true' || e.bestaetigt === '1';
  if (e.einzeln !== undefined) { if (e.einzeln === true || e.einzeln === 'true' || e.einzeln === '1') neu.einzeln = true; else delete neu.einzeln; }
  // Ohne Namen gibt es nichts zu bestaetigen.
  if (!neu.quelle && !neu.fotograf && !neu.handle) neu.bestaetigt = false;
  neu.geaendert = Date.now();
  const leer = !neu.quelle && !neu.fotograf && !neu.handle && !neu.link && !neu.lizenz && !neu.wahrscheinlich && !neu.notiz;
  return leer ? null : neu;
}

/** Nur die Credit-Felder aus einer Eingabe (Formular oder JSON) - was fehlt, bleibt undefined. */
export function creditEingabe(hol: (feld: string) => unknown): CreditEingabe {
  const aus: CreditEingabe = {};
  for (const f of CREDIT_FELDER) { const v = hol(f); if (v !== undefined && v !== null) aus[f] = v; }
  return aus;
}

export async function liesCredits(): Promise<CreditTafel> {
  const t = await liesJson<CreditTafel>(CREDIT_DATEI, {});
  return t && typeof t === 'object' && !Array.isArray(t) ? t : {};
}

/** Mehrere Dateien auf einmal aendern (Mehrfachauswahl). Gibt die neuen Eintraege zurueck. */
export async function setzeCredits(dateien: string[], e: CreditEingabe): Promise<Record<string, FotoCredit | null>> {
  const tafel = await aendereJson<CreditTafel>(CREDIT_DATEI, {}, (t) => {
    for (const d of dateien) { const n = mitAenderung(t[d], e); if (n) t[d] = n; else delete t[d]; }
  });
  return Object.fromEntries(dateien.map((d) => [d, tafel[d] ?? null]));
}
