import { aendereJson } from '@/lib/ablage';
import { namensSchluessel } from '@/lib/homoglyph';
import { EingabeFehler, xNormal, twitchNormal, landNormal } from '@/lib/profilEingabe';

/*
 * Ein Spielerprofil (spieler-profile.json) aendern - fuer /api/spieler-profile (Player Center) und /api/admin/flaggen.
 *
 * Zusammenfuehren statt ersetzen (Betreiber, 16.11.2026). Bis heute nahm das Speichern fuer jedes Feld, das die Anfrage nicht nannte, nur den Wert eines
 * alten Eintrags unter dem Namen - nie den des Eintrags selbst. Eine Anfrage nur mit { id, name, x } schrieb deshalb einen Eintrag ohne Flagge und ohne
 * Twitch: das Land war weg. Jetzt gilt fuer jedes Feld:
 *   - nicht in der Anfrage  -> es bleibt, was dasteht (im Eintrag, sonst im alten Namenseintrag)
 *   - leer ("")             -> geloescht (so leert das Player Center ein Feld)
 *   - gesetzt               -> neu, geprueft und vereinheitlicht
 * Gerechnet wird auf dem frisch gelesenen Stand und mit dem Stand der Datei geschrieben (lib/ablage aendereJson): hat sie sich bewegt, wird neu gelesen
 * und die Aenderung erneut daraufgesetzt - ein X-Konto, das ein Lauf auf GitHub (lib/xHandles.mjs) eben eingetragen hat, geht so nicht verloren.
 */

export const PROFIL_DATEI = 'spieler-profile.json';

export interface SpielerProfil {
  /** Epic-Konto-ID, sofern bekannt - der eigentliche Schluessel. */
  id?: string;
  /** Der Name, unter dem das Profil zuletzt gepflegt wurde. */
  name: string;
  /** Alle Namen, unter denen dieser Spieler schon angetreten ist. */
  namen?: string[];
  /** Laenderkuerzel nach ISO, etwa "RO" oder "US". */
  land?: string;
  /** Konto auf X, ohne das @. */
  x?: string;
  /** Twitch-Kanal, ohne die Adresse davor. Nur von Hand gepflegt, nie geraten. */
  twitch?: string;
  /** Wettkampfregion. Nur noetig, wo das Land nicht eindeutig ist (NAC/NAW). */
  region?: string;
  /** Selbst gesetzter Anzeigename - schlaegt jeden automatischen Vorschlag. */
  anzeige?: string;
}

export type ProfilEingang = Partial<Record<'id' | 'name' | 'land' | 'x' | 'twitch' | 'region' | 'anzeige', string | null>>;

export { EingabeFehler, xNormal, twitchNormal, landNormal } from '@/lib/profilEingabe';

export type ProfilFeld = 'land' | 'x' | 'twitch' | 'region' | 'anzeige';
/** Eine gepruefte Aenderung: nur die Felder in `felder` werden angefasst. */
export interface ProfilAenderung { id: string; name: string; schluessel: string; felder: Partial<Record<ProfilFeld, string>> }

/** Pruefen und vereinheitlichen - wirft EingabeFehler, bevor irgendetwas gelesen oder geschrieben wird. */
export function pruefeAenderung(eingang: ProfilEingang): ProfilAenderung {
  const name = (eingang.name ?? '').trim();
  const id = (eingang.id ?? '').trim().toLowerCase();
  if (!name && !id) throw new EingabeFehler('name oder id fehlt');
  if (id && !/^[0-9a-f]{32}$/.test(id)) throw new EingabeFehler('id ist keine Epic-Konto-Id');
  // Am fehlenden Feld laesst sich ablesen, dass nichts geaendert werden soll, am leeren, dass geloescht werden soll.
  const felder: ProfilAenderung['felder'] = {};
  if (eingang.land != null) felder.land = landNormal(eingang.land);
  if (eingang.x != null) felder.x = xNormal(eingang.x);
  if (eingang.twitch != null) felder.twitch = twitchNormal(eingang.twitch);
  if (eingang.region != null) felder.region = eingang.region.trim().toUpperCase();
  if (eingang.anzeige != null) felder.anzeige = eingang.anzeige.trim();
  // Die Konto-ID gewinnt. Ohne sie bleibt es beim Namensschluessel.
  return { id, name, schluessel: id || namensSchluessel(name), felder };
}

/** Zwei Aenderungen desselben Spielers zu einer: die spaetere gewinnt Feld fuer Feld. */
export function vereinige(frueher: ProfilAenderung, spaeter: ProfilAenderung): ProfilAenderung {
  return { ...spaeter, name: spaeter.name || frueher.name, felder: { ...frueher.felder, ...spaeter.felder } };
}

/**
 * Eine Aenderung auf den (frisch gelesenen) Stand setzen - an Ort und Stelle. Gibt den Eintrag zurueck, wie er danach dasteht (null: weg, weil leer).
 *
 * Einen alten, nur ueber den Namen gefuehrten Eintrag nimmt sie mit: wird mit ID gespeichert, wandert er mit und verschwindet von seinem Namensplatz (beim
 * Namen "peterbot" bekam sonst ein Nachahmer die Flagge des Profis). Ein Namenseintrag, der selbst eine ID traegt, gehoert jemand anderem.
 */
export function wendeAn(profile: Record<string, SpielerProfil>, a: ProfilAenderung): SpielerProfil | null {
  const { id, name, schluessel, felder } = a;
  const alterSchluessel = id && name ? namensSchluessel(name) : '';
  const alter = alterSchluessel && alterSchluessel !== schluessel && profile[alterSchluessel] && !profile[alterSchluessel].id
    ? profile[alterSchluessel] : undefined;
  const jetzt = profile[schluessel];
  const namen = [...new Set([...(jetzt?.namen ?? []), ...(alter?.namen ?? []), alter?.name ?? '', name].filter(Boolean))];
  const wert = (f: ProfilFeld): string => (f in felder ? felder[f]! : (jetzt?.[f] || alter?.[f] || ''));
  const neu: SpielerProfil = {
    ...(jetzt ?? {}),
    ...(id ? { id } : {}),
    name: name || jetzt?.name || alter?.name || schluessel,
    ...(namen.length ? { namen } : {}),
  };
  for (const f of ['land', 'x', 'twitch', 'region', 'anzeige'] as const) {
    const w = wert(f);
    if (w) neu[f] = w; else delete neu[f];
  }
  if (alter && alterSchluessel) delete profile[alterSchluessel];
  // Bleibt nichts uebrig als der Name, faellt der ganze Eintrag weg.
  if (!neu.land && !neu.x && !neu.twitch && !neu.region && !neu.anzeige) {
    delete profile[schluessel];
    return null;
  }
  profile[schluessel] = neu;
  return neu;
}

/**
 * Mehrere Aenderungen in einem Zug (ein Commit) - gegen den frisch gelesenen Stand; hat sich die Datei bewegt, werden alle neu daraufgesetzt.
 * @returns je Schluessel der Eintrag danach
 */
export async function profileAendern(aenderungen: ProfilAenderung[]): Promise<Map<string, SpielerProfil | null>> {
  const raus = new Map<string, SpielerProfil | null>();
  await aendereJson<Record<string, SpielerProfil>>(PROFIL_DATEI, {}, (profile) => {
    raus.clear();
    for (const a of aenderungen) raus.set(a.schluessel, wendeAn(profile, a));
  });
  return raus;
}

/**
 * Anlegen oder aendern (ein Spieler, sofort). Wirft EingabeFehler bei unbrauchbarer Eingabe (dann wird nichts geschrieben).
 * @returns der Schluessel und der Eintrag, wie er danach in der Datei steht (null: der Eintrag ist weg, weil nichts mehr drin stand)
 */
export async function profilAendern(eingang: ProfilEingang): Promise<{ schluessel: string; profil: SpielerProfil | null }> {
  const a = pruefeAenderung(eingang);
  const raus = await profileAendern([a]);
  return { schluessel: a.schluessel, profil: raus.get(a.schluessel) ?? null };
}

/** Einen Eintrag entfernen - ebenfalls gegen den frisch gelesenen Stand. */
export async function profilLoeschen(schluessel: string): Promise<void> {
  await aendereJson<Record<string, SpielerProfil>>(PROFIL_DATEI, {}, (profile) => { delete profile[schluessel]; });
}
