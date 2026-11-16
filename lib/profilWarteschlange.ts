import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { wirfWeg } from '@/lib/antwortSpeicher';
import { profileAendern, vereinige, wendeAn, type ProfilAenderung, type SpielerProfil } from '@/lib/spielerProfil';

/*
 * Speichern ohne Warten (Betreiber, 16.11.2026, live auf /admin/flaggen: "HTTP 524" und "HTTP 502" bei fast jeder Zeile, eine hing auf "speichert ...").
 *
 * Vorher wartete jede Zeile auf ihren eigenen Commit im GitHub-Archiv. Wer zuegig durch die Tabelle tabbt, schickt viele Zeilen gleichzeitig; sie standen
 * hintereinander in der einen Schreibreihe des Servers (lib/ablageGitDaten nacheinander), jede mit Lesen + Schreiben + bei Konflikt neuem Lesen - die
 * letzte wartete laenger als die 100 Sekunden, nach denen Cloudflare abbricht.
 *
 * Jetzt: die Anfrage prueft die Eingabe, legt die Aenderung hier ab und antwortet sofort ("wartet"). Gesammelt wird kurz (SAMMELN_MS nach der letzten
 * Aenderung, hoechstens HOECHSTENS_MS nach der ersten); dann gehen alle wartenden Zeilen in EINEM Commit hinaus - zusammengefuehrt auf den frisch
 * gelesenen Stand und mit dessen sha geschrieben (lib/ablage aendereJson; bewegt sich die Datei, wird neu gelesen und alles erneut daraufgesetzt).
 * Zwei Aenderungen derselben Zeile werden Feld fuer Feld vereint, die spaetere gewinnt. Scheitert das Schreiben, bleibt alles hier und es geht nach
 * 5, 10, 20 ... Sekunden (hoechstens einer Minute) noch einmal. Die Seite fragt den Stand je Zeile ab (status()).
 *
 * Gegen einen Neustart dazwischen liegt das Wartende zusaetzlich auf der Platte und wird beim ersten Gebrauch wieder eingereiht; die Seite schickt
 * ausserdem jede Zeile noch einmal, deren Stand der Server nicht kennt.
 */

const SAMMELN_MS = 1500;
const HOECHSTENS_MS = 5000;

export type ZeilenStand = { art: 'wartet' | 'gespeichert' | 'fehler'; version: number; profil?: SpielerProfil | null; fehler?: string; zeit: number };

interface Zustand {
  offen: Map<string, { a: ProfilAenderung; version: number }>;
  stand: Map<string, ZeilenStand>;
  version: number;
  uhr: ReturnType<typeof setTimeout> | null;
  erstes: number;
  laeuft: boolean;
  fehlschlaege: number;
  geladen: boolean;
}
// Ueber globalThis: der Entwicklungsserver laedt jede Route als eigenes Bauteil, und es darf nur eine Reihe geben.
const g = globalThis as { __comphubProfilReihe?: Zustand };
const z: Zustand = (g.__comphubProfilReihe ??= {
  offen: new Map(), stand: new Map(), version: 0, uhr: null, erstes: 0, laeuft: false, fehlschlaege: 0, geladen: false,
});

const PLATTE = path.join(process.env.ABLAGE_ZWISCHEN || path.join(os.tmpdir(), 'comphub-ablage-zwischen'), 'profil-reihe.json');
function sichern(): void {
  const daten = JSON.stringify([...z.offen.values()]);
  void fsp.mkdir(path.dirname(PLATTE), { recursive: true }).then(() => fsp.writeFile(PLATTE, daten)).catch(() => undefined);
}
async function laden(): Promise<void> {
  if (z.geladen) return;
  z.geladen = true;
  try {
    const alt = JSON.parse(await fsp.readFile(PLATTE, 'utf8')) as Array<{ a: ProfilAenderung; version: number }>;
    for (const e of alt) if (!z.offen.has(e.a.schluessel)) einreihenIntern(e.a);
  } catch { /* nichts liegen geblieben */ }
}

function planen(nachMs?: number): void {
  if (z.uhr) clearTimeout(z.uhr);
  const jetzt = Date.now();
  const warte = nachMs ?? Math.max(0, Math.min(SAMMELN_MS, z.erstes + HOECHSTENS_MS - jetzt));
  z.uhr = setTimeout(() => { z.uhr = null; void schreiben(); }, warte);
}

function einreihenIntern(a: ProfilAenderung): number {
  z.version += 1;
  const vorher = z.offen.get(a.schluessel);
  if (!z.offen.size) z.erstes = Date.now();
  z.offen.set(a.schluessel, { a: vorher ? vereinige(vorher.a, a) : a, version: z.version });
  z.stand.set(a.schluessel, { art: 'wartet', version: z.version, zeit: Date.now() });
  sichern();
  if (!z.laeuft && z.fehlschlaege === 0) planen();
  return z.version;
}

/** Eine (schon gepruefte) Aenderung einreihen. Antwortet sofort. */
export async function einreihen(a: ProfilAenderung): Promise<{ schluessel: string; version: number }> {
  await laden();
  return { schluessel: a.schluessel, version: einreihenIntern(a) };
}

async function schreiben(): Promise<void> {
  if (z.laeuft || !z.offen.size) return;
  z.laeuft = true;
  const zug = [...z.offen.values()];
  z.offen.clear();
  try {
    const ergebnis = await profileAendern(zug.map((e) => e.a));
    z.fehlschlaege = 0;
    for (const e of zug) {
      const s = z.stand.get(e.a.schluessel);
      // Kam waehrenddessen eine neuere Aenderung dieser Zeile, bleibt sie "wartet".
      if (!s || s.version <= e.version) z.stand.set(e.a.schluessel, { art: 'gespeichert', version: e.version, profil: ergebnis.get(e.a.schluessel) ?? null, zeit: Date.now() });
    }
    void wirfWeg('center|');
    void wirfWeg('szene_spieler=');
  } catch (f) {
    z.fehlschlaege += 1;
    const text = String((f as Error)?.message ?? f).slice(0, 200);
    // Nichts verlieren: zurueck in die Reihe, Neueres derselben Zeile gewinnt Feld fuer Feld.
    for (const e of zug) {
      const neuer = z.offen.get(e.a.schluessel);
      z.offen.set(e.a.schluessel, neuer ? { a: vereinige(e.a, neuer.a), version: neuer.version } : e);
      const s = z.stand.get(e.a.schluessel);
      z.stand.set(e.a.schluessel, { art: 'fehler', version: s?.version ?? e.version, fehler: `${text} - neuer Versuch läuft`, zeit: Date.now() });
    }
  } finally {
    z.laeuft = false;
    sichern();
    // Alte Staende vergessen (eine Stunde reicht der Seite).
    for (const [k, s] of z.stand) if (s.art === 'gespeichert' && Date.now() - s.zeit > 3_600_000) z.stand.delete(k);
    if (z.offen.size) planen(z.fehlschlaege ? Math.min(60_000, 5000 * 2 ** (z.fehlschlaege - 1)) : undefined);
  }
}

/** Der Stand je Schluessel - "unbekannt" (fehlt im Ergebnis), wenn dieser Server die Zeile nicht kennt (Neustart): dann schickt die Seite sie noch einmal. */
export function status(schluessel: string[]): Record<string, ZeilenStand> {
  const raus: Record<string, ZeilenStand> = {};
  for (const k of schluessel) { const s = z.stand.get(k); if (s) raus[k] = s; }
  return raus;
}

/** Was noch wartet, auf einen gelesenen Stand gelegt - damit die Liste nach dem Neuladen schon zeigt, was gleich gespeichert wird. */
export function mitWartendem(profile: Record<string, SpielerProfil>): Record<string, SpielerProfil> {
  if (!z.offen.size) return profile;
  const kopie = structuredClone(profile);
  for (const { a } of z.offen.values()) wendeAn(kopie, a);
  return kopie;
}

/** Fuer Tests und den Betrieb: alles Wartende jetzt schreiben. */
export async function jetztSchreiben(): Promise<void> {
  if (z.uhr) { clearTimeout(z.uhr); z.uhr = null; }
  await schreiben();
}
