import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from './datenOrt';

// Die Zugangsdaten der Anmeldedienste - eintragbar statt einzutippen.
//
// Bis hierher standen Client-Id und Secret ausschliesslich in .env.local.
// Das hat zwei Haken: der Betreiber muss eine Datei im Projektordner
// bearbeiten, und jede Aenderung verlangt einen Neustart des Servers, weil
// process.env beim Start eingelesen wird. Deshalb liegt daneben eine
// Ablage, die sich im Werkzeug selbst fuellen laesst - einmal einfuegen,
// fertig.
//
// Vorrang hat, was eingetragen wurde; fehlt dort etwas, gilt weiter die
// Umgebung. So bleibt eine bestehende Einrichtung unangetastet.
//
// Die Datei enthaelt Geheimnisse und gehoert deshalb nicht in die
// Versionsverwaltung - sie steht in .gitignore.

const DATEI = path.join(DATEN_ORT, 'dienst-zugaenge.json');

export type Dienst = 'twitch' | 'discord' | 'google';

interface Eintrag { id?: string; secret?: string }
type Ablage = Partial<Record<Dienst, Eintrag>>;

/** Platzhalter aus der Beispieldatei zaehlen nicht als eingetragen. */
export function echterWert(wert: string | undefined | null): boolean {
  if (!wert) return false;
  const w = String(wert).trim();
  if (!w) return false;
  return !/^(REDACTED|your_|YOUR_|xxx|changeme)/i.test(w);
}

async function lies(): Promise<Ablage> {
  try { return JSON.parse(await fs.readFile(DATEI, 'utf8')) as Ablage; }
  catch { return {}; }
}

const AUS_UMGEBUNG: Record<Dienst, [string | undefined, string | undefined]> = {
  twitch: [process.env.TWITCH_CLIENT_ID, process.env.TWITCH_CLIENT_SECRET],
  discord: [process.env.DISCORD_CLIENT_ID, process.env.DISCORD_CLIENT_SECRET],
  google: [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET],
};

/** Client-Id und Secret eines Dienstes - Ablage zuerst, dann Umgebung. */
export async function holeDienst(name: Dienst): Promise<{
  id: string; secret: string; woher: 'eingetragen' | 'umgebung' | 'fehlt';
}> {
  const ablage = (await lies())[name] ?? {};
  if (echterWert(ablage.id) && echterWert(ablage.secret)) {
    return { id: ablage.id!.trim(), secret: ablage.secret!.trim(),
      woher: 'eingetragen' };
  }
  const [uId, uSecret] = AUS_UMGEBUNG[name];
  if (echterWert(uId) && echterWert(uSecret)) {
    return { id: uId!.trim(), secret: uSecret!.trim(), woher: 'umgebung' };
  }
  return { id: '', secret: '', woher: 'fehlt' };
}

/** Eintragen oder loeschen - ein leerer Wert entfernt den Eintrag. */
export async function setzeDienst(
  name: Dienst, id: string, secret: string,
): Promise<void> {
  const alles = await lies();
  if (!id.trim() && !secret.trim()) delete alles[name];
  else alles[name] = { id: id.trim(), secret: secret.trim() };
  await fs.mkdir(path.dirname(DATEI), { recursive: true });
  await fs.writeFile(DATEI, JSON.stringify(alles, null, 2), 'utf8');
}
