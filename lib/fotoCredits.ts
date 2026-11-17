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
 *   link           Ein Verweis zum Fotografen (X, Portfolio).
 *   lizenz         Nur intern: unter welcher Erlaubnis wir es zeigen ("Erlaubnis per Mail 18.11.", "Epic Media Kit", "CC BY 4.0").
 *   bestaetigt     Nur dann steht oeffentlich etwas am Foto: "Foto: Epic Games / Michal Konkol", oder nur "Foto: Epic Games".
 *   wahrscheinlich Nur intern: eine Vermutung. Geht nie an die oeffentliche Schnittstelle.
 *   notiz          Nur intern.
 */

export const CREDIT_DATEI = 'foto-credits.json';

export interface FotoCredit {
  quelle?: string;
  fotograf?: string;
  link?: string;
  /** Nur intern. */
  lizenz?: string;
  bestaetigt: boolean;
  /** Nur intern: wer es vermutlich war. */
  wahrscheinlich?: string;
  /** Nur intern. */
  notiz?: string;
  geaendert?: number;
}
export type CreditTafel = Record<string, FotoCredit>;
export const CREDIT_FELDER = ['quelle', 'fotograf', 'link', 'lizenz', 'bestaetigt', 'wahrscheinlich', 'notiz'] as const;
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

/** Eine Eingabe in einen gueltigen Eintrag verwandeln. Felder, die fehlen (undefined), bleiben wie im alten Eintrag; "" loescht. null = nichts mehr da. */
export function mitAenderung(alt: FotoCredit | undefined, e: CreditEingabe): FotoCredit | null {
  const neu: FotoCredit = { ...(alt ?? { bestaetigt: false }) };
  for (const f of ['quelle', 'fotograf', 'lizenz', 'wahrscheinlich', 'notiz'] as const) {
    if (e[f] !== undefined) { const v = text(e[f], f === 'notiz' || f === 'lizenz' ? 300 : 80); if (v) neu[f] = v; else delete neu[f]; }
  }
  if (e.link !== undefined) { const v = sauberLink(e.link); if (v) neu.link = v; else delete neu.link; }
  if (e.bestaetigt !== undefined) neu.bestaetigt = e.bestaetigt === true || e.bestaetigt === 'true' || e.bestaetigt === '1';
  // Ohne Namen gibt es nichts zu bestaetigen.
  if (!neu.quelle && !neu.fotograf) neu.bestaetigt = false;
  neu.geaendert = Date.now();
  const leer = !neu.quelle && !neu.fotograf && !neu.link && !neu.lizenz && !neu.wahrscheinlich && !neu.notiz;
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

/** Was oeffentlich am Foto steht: "Epic Games / Michal Konkol" - oder null. Nur bestaetigte Eintraege. */
export function creditText(c: FotoCredit | undefined): string | null {
  if (!c?.bestaetigt) return null;
  const teile = [c.quelle, c.fotograf].map((x) => (x ?? '').trim()).filter(Boolean);
  return teile.length ? teile.join(' / ') : null;
}

/** Die oeffentliche Fassung: je Dateistamm ("vico-1a2b3c4d-mvx1") Text und Link - nichts Internes (Lizenz, Vermutung, Notiz). */
export function oeffentlich(t: CreditTafel): Record<string, { text: string; link?: string }> {
  const aus: Record<string, { text: string; link?: string }> = {};
  for (const [datei, c] of Object.entries(t)) {
    const s = creditText(c);
    if (!s) continue;
    aus[datei.replace(/\.(jpe?g|png|webp)$/i, '').toLowerCase()] = c.link ? { text: s, link: c.link } : { text: s };
  }
  return aus;
}
