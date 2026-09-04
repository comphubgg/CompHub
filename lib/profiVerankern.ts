import { promises as fs } from 'fs';
import path from 'path';
import { gesamtSummen } from '@/lib/szeneStats';
import { DATEN_ORT } from './datenOrt';

/*
 * Einen Profi an seiner Konto-Id festmachen.
 *
 * Der Anlass, in seinen Worten: "wenn ein Pro z.B. Vico eine ID bekommt,
 * dass er im ganzen Tool genau die gleiche Id überall hat, also bei
 * Statistics, Leaderboard usw., da sie ja jederzeit ihren Ingame-Namen
 * ändern könnten, so dass ich es richtig zuweisen kann und es fix bleibt,
 * solange er die Pro-Rolle hat."
 *
 * Genau das ist das Problem: der Ingame-Name eines Profis ist kein
 * Bezeichner. Mal steht ein Teamkuerzel davor, mal ein Turniertag
 * ("[EWC2026] AGAL Scroll 10!"), mal ein Zeichen, das sich nicht tippen
 * laesst. Die Konto-Id dagegen aendert sich nie.
 *
 * Sobald der Betreiber einem Konto eine Epic-Id zuweist, wird deshalb hier
 * ein Profil unter genau dieser Id angelegt - mit dem Namen, unter dem der
 * Spieler heute im Archiv steht, als Anzeigenamen. Von da an zeigt das
 * Werkzeug ueberall diesen Namen: in der Statistik, im Leaderboard, auf den
 * Karten. Aendert der Spieler morgen seinen Ingame-Namen, bleibt die
 * Zuordnung stehen, weil sie nie am Namen hing.
 *
 * Was hier NICHT passiert: einen Namen erfinden. Findet sich die Id nicht
 * im Archiv, entsteht ein Profil ohne Anzeigenamen - dann traegt der
 * Betreiber ihn selbst ein, und bis dahin steht da, was Epic liefert. Ein
 * geratener Name waere schlimmer als gar keiner.
 *
 * Ein vorhandenes Profil wird nie ueberschrieben. Was der Betreiber von
 * Hand gepflegt hat - Flagge, X-Konto, Anzeigename - ist seine Arbeit.
 */

const DATEI = path.join(DATEN_ORT, 'spieler-profile.json');

interface Profil {
  id?: string;
  name?: string;
  namen?: string[];
  land?: string;
  x?: string;
  region?: string;
  anzeige?: string;
}

async function lies(): Promise<Record<string, Profil>> {
  try {
    return JSON.parse(await fs.readFile(DATEI, 'utf8')) as Record<string, Profil>;
  } catch {
    return {};
  }
}

async function schreib(profile: Record<string, Profil>): Promise<void> {
  await fs.mkdir(path.dirname(DATEI), { recursive: true });
  await fs.writeFile(DATEI, JSON.stringify(profile, null, 2), 'utf8');
}

/** Wie dieser Spieler heute im Archiv heisst - oder nichts. */
async function nameAusArchiv(epicId: string): Promise<{
  name: string; namen: string[];
} | null> {
  try {
    const treffer = (await gesamtSummen()).find((x) => x.epicId === epicId);
    if (!treffer) return null;
    return { name: treffer.name, namen: treffer.namen ?? [] };
  } catch {
    return null;
  }
}

/**
 * Sorgt dafuer, dass es zu dieser Konto-Id ein Profil gibt.
 *
 * @returns was danach unter dieser Id steht - oder null, wenn nichts
 *          angelegt wurde, weil schon etwas da war.
 */
export async function verankereProfi(epicId: string): Promise<Profil | null> {
  const id = (epicId ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) return null;

  const profile = await lies();
  // Steht schon etwas da, bleibt es stehen - das ist gepflegte Arbeit.
  if (profile[id]) return null;

  const gefunden = await nameAusArchiv(id);

  profile[id] = {
    id,
    name: gefunden?.name ?? id,
    ...(gefunden?.namen.length ? { namen: gefunden.namen } : {}),
    // Der heutige Name wird zum festen Anzeigenamen. Ab jetzt aendert ihn
    // nur noch der Betreiber selbst.
    ...(gefunden?.name ? { anzeige: gefunden.name } : {}),
  };

  await schreib(profile);
  return profile[id];
}
