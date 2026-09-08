/*
 * Aus Epics Aktenzeichen einen Gegenstand machen.
 *
 * In der Auszahlungstabelle eines Cups steht nicht "Mega Man X", sondern
 * "AthenaCharacter:character_dunebriefshift" - Epics interner Deckname fuer
 * den Skin. Bisher wurde daraus nur die Zeichenkette entziert, und in der
 * Anzeige stand "Character Dunebriefshift". Der Betreiber hat das auf seinem
 * Bild danebengehalten: Epic selbst zeigt an derselben Stelle "Mega Man X"
 * mit Bild.
 *
 * fortnite-api.com kennt diese Zuordnung und gibt sie ohne Anmeldung und ohne
 * Schluessel heraus - geprueft, bevor hier Code dafuer entstand:
 *
 *   character_dunebriefshift  -> Mega Man X          (Outfit)
 *   backpack_dunebriefshift   -> E-Tank Power Pack   (Back Bling)
 *
 * Nicht jede Kennung ist dort zu finden; Emoticons und manche Spitzhacken
 * fehlen. Dann bleibt es beim entzierten Decknamen - erfunden wird nichts.
 *
 * Nachgeschlagen wird einmal je Gegenstand. Das Ergebnis liegt in der Ablage,
 * denn es aendert sich nie: ein Skin bekommt keinen neuen Namen.
 */

import { liesJson, schreibJson } from '@/lib/ablage';

export interface Gegenstand {
  /** Der Name, unter dem ihn jeder kennt. */
  name: string;
  /** "Outfit", "Back Bling", "Emoticon" - wie Epic die Art nennt. */
  art: string | null;
  /** Adresse des Bildes, oder null. */
  bild: string | null;
}

/** Wo die nachgeschlagenen Gegenstaende liegen. */
const ABLAGE = 'gegenstaende.json';

/** Im laufenden Vorgang, damit eine Seite mit zehn Preisen einmal liest. */
let vorrat: Record<string, Gegenstand> | null = null;
/** Was in diesem Vorgang dazugekommen ist und noch abgelegt werden muss. */
let neuDabei = false;

/** Der Teil hinter dem Doppelpunkt, klein geschrieben. */
function kennungAus(wert: string): string {
  return (wert ?? '').split(':').pop()?.trim().toLowerCase() ?? '';
}

/**
 * Der Notname, wenn nichts gefunden wird.
 *
 * "AthenaCharacter:character_dunebriefshift" wird zu "Dunebriefshift" - nicht
 * schoen, aber ehrlich: es ist das, was in den Daten steht.
 */
export function notName(wert: string): string {
  const teil = kennungAus(wert);
  return teil
    .replace(/^(athena|cid|eid|bid|pickaxe|glider|wrap|character|backpack|emoji)[_-]?/i, '')
    .replace(/^id[_-]?/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (z) => z.toUpperCase())
    .trim() || wert;
}

async function laden(): Promise<Record<string, Gegenstand>> {
  if (vorrat) return vorrat;
  vorrat = await liesJson<Record<string, Gegenstand>>(ABLAGE, {});
  return vorrat;
}

async function sichern(): Promise<void> {
  if (!neuDabei || !vorrat) return;
  neuDabei = false;
  try {
    await schreibJson(ABLAGE, vorrat);
  } catch { /* beim naechsten Mal wieder */ }
}

async function nachschlagen(kennung: string): Promise<Gegenstand | null> {
  try {
    const r = await fetch(
      `https://fortnite-api.com/v2/cosmetics/br/search?id=${encodeURIComponent(kennung)}`,
      { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = await r.json() as {
      data?: { name?: string; type?: { displayValue?: string };
               images?: { smallIcon?: string; icon?: string } };
    };
    const d = j.data;
    if (!d?.name) return null;
    return {
      name: d.name,
      art: d.type?.displayValue ?? null,
      bild: d.images?.smallIcon ?? d.images?.icon ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Mehrere Gegenstaende auf einmal - so wie sie in einer Preistabelle stehen.
 *
 * Nachgeschlagen wird nur, was noch nicht bekannt ist, und die Abfragen
 * laufen nebeneinander: bei einem Skin-Cup sind es vier bis sechs, und
 * nacheinander waeren das ein paar Sekunden fuer nichts.
 */
export async function holeGegenstaende(
  werte: string[],
): Promise<Map<string, Gegenstand>> {
  const bekannt = await laden();
  const raus = new Map<string, Gegenstand>();
  const offen: string[] = [];

  for (const wert of new Set(werte)) {
    const k = kennungAus(wert);
    if (!k) continue;
    if (bekannt[k]) raus.set(wert, bekannt[k]);
    else offen.push(wert);
  }

  if (offen.length) {
    const ergebnisse = await Promise.all(
      offen.map(async (wert) => [wert, await nachschlagen(kennungAus(wert))] as const));
    for (const [wert, gefunden] of ergebnisse) {
      const k = kennungAus(wert);
      /*
       * Auch ein Fehlschlag wird gemerkt.
       *
       * Sonst fragt jede Anfrage erneut bei fortnite-api.com nach einer
       * Kennung, die es dort nicht gibt - und das sind bei Emoticons alle.
       * Gemerkt wird dann der Notname, damit die Anzeige etwas hat.
       */
      const eintrag: Gegenstand = gefunden
        ?? { name: notName(wert), art: null, bild: null };
      bekannt[k] = eintrag;
      raus.set(wert, eintrag);
      neuDabei = true;
    }
    void sichern();
  }

  return raus;
}
