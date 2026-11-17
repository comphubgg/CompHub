import { liesJson, schreibJson } from '@/lib/ablage';

/*
 * Der gelaeufige Name eines Profis (Betreiber, 17.11.2026: "Pros mit Foto sollen mit ihrem normalen Namen erscheinen, nicht mit dem rohen
 * Epic-Namen" - "FURIA 916Gon" heisst 916Gon, "twis boltzZzero0" heisst Boltz).
 *
 * Eine kleine Tafel in der Ablage (comphub-daten): spieler-anzeigenamen.json, { "<epicId>": "<Anzeigename>" }. Gefuellt fuer alle Spieler mit
 * oeffentlichem Foto, aus (1) dem gepflegten Anzeigenamen der Profile, (2) dem Namen, den der Betreiber dem Foto gab (Foto-Pool, Plaene),
 * (3) sonst dem Epic-Namen; bearbeitbar in /admin/fotos-pool. Der Epic-Name bleibt erhalten (Feld "epicName" bzw. "name") und auffindbar.
 *
 * Eingesetzt wird beim Ausliefern (lib/aktuelleFotos.fotosEinsetzen, dieselbe Stelle, die die Fotos nachfuehrt): jedes Objekt mit einer
 * Konto-Id, fuer die hier ein Name steht, bekommt ihn in "anzeige" (falls vorhanden), sonst in "name" bzw. "displayName".
 */

export const ANZEIGENAMEN_DATEI = 'spieler-anzeigenamen.json';
const KONTO = /^[0-9a-f]{32}$/;
const FRIST_MS = 60_000;

let merker: { namen: Map<string, string>; bis: number } | null = null;
let unterwegs: Promise<Map<string, string>> | null = null;

/** Die gepflegten Anzeigenamen (Konto-Id klein -> Name), je Prozess hoechstens eine Minute alt. */
export async function anzeigenamen(): Promise<Map<string, string>> {
  if (merker && Date.now() < merker.bis) return merker.namen;
  if (unterwegs) return unterwegs;
  unterwegs = (async () => {
    try {
      const roh = await liesJson<Record<string, unknown>>(ANZEIGENAMEN_DATEI, {}).catch(() => ({} as Record<string, unknown>));
      const namen = new Map<string, string>();
      for (const [id, n] of Object.entries(roh ?? {})) {
        const k = id.toLowerCase();
        if (KONTO.test(k) && typeof n === 'string' && n.trim()) namen.set(k, n.trim());
      }
      merker = { namen, bis: Date.now() + (namen.size ? FRIST_MS : 5_000) };
      return namen;
    } finally { unterwegs = null; }
  })();
  return unterwegs;
}

/** Der Anzeigename eines Kontos - oder der mitgegebene Ersatz (meist der Epic-Name). */
export function anzeigenameFuer(namen: Map<string, string>, epicId: string | null | undefined, ersatz = ''): string {
  return (epicId && namen.get(String(epicId).toLowerCase())) || ersatz;
}

/** Einen Namen setzen oder (leer) entfernen - fuer das Admin-Werkzeug. Gibt die ganze Tafel zurueck. */
export async function anzeigenameSetzen(epicId: string, name: string): Promise<Record<string, string>> {
  const id = String(epicId).toLowerCase();
  if (!KONTO.test(id)) throw new Error('Keine gueltige Konto-Id.');
  const tafel = await liesJson<Record<string, string>>(ANZEIGENAMEN_DATEI, {});
  const sauber = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (sauber) tafel[id] = sauber; else delete tafel[id];
  const sortiert = Object.fromEntries(Object.entries(tafel).sort(([a], [b]) => a.localeCompare(b)));
  await schreibJson(ANZEIGENAMEN_DATEI, sortiert);
  merker = null;
  return sortiert;
}

/** Ein Objekt mit Konto-Id: den Anzeigenamen einsetzen. true, wenn sich etwas geaendert hat. */
export function anzeigenameEinsetzen(r: Record<string, unknown>, id: string, namen: Map<string, string>): boolean {
  const neu = namen.get(id.toLowerCase());
  if (!neu) return false;
  if (typeof r.anzeige === 'string') {
    if (r.anzeige === neu) return false;
    r.anzeige = neu;
    return true;
  }
  for (const f of ['name', 'displayName'] as const) {
    const alt = r[f];
    if (typeof alt !== 'string' || alt === neu) continue;
    // Den Epic-Namen nicht verlieren: Suche und die kleine graue Zeile im Profil brauchen ihn.
    if (!('epicName' in r)) r.epicName = alt;
    r[f] = neu;
    return true;
  }
  return false;
}
