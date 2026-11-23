import { ORGTAGS } from '@/lib/orgtags';
import { vergleichbar, lateinisch, ohneZierrat } from '@/lib/homoglyph';

/*
 * Rohe Ingame-Namen zu sauberen Szene-Namen machen - OHNE Team-/Org-Kuerzel davor und OHNE angehaengte Clan-Zeichen/Satzzeichen (Betreiber, 23.11.2026:
 * "die Anzeigenamen sollen der saubere Szene-Name sein"; Beispiele: "100T Arkhram." -> "Arkhram", "7VEN GMoneyǃ" -> "GMoney", "ATC HELLO" -> "HELLO").
 *
 * Zweite Quelle neben Liquipedia (lib/liquipediaInfobox.mjs / scripts/liquipedia-flaggen.mjs): fuer die vielen Spieler OHNE Liquipedia-Seite, die noch
 * ihren rohen Namen zeigen. Rein aus dem Namen gerechnet, kein Abruf. Bewusst vorsichtig - im Zweifel NICHT aendern:
 *   SICHER (automatisch -> anzeige, protokolliert in socials-auto.json): ein bekannter Team-Tag und/oder eine Turnierklammer faellt weg und uebrig
 *          bleibt genau EIN sauberer lateinischer Namensteil (Zierrat hinten darf mitgefallen sein). "100T Arkhram." -> "Arkhram".
 *   VORSCHLAG (-> socials-vorschlaege.json, der Betreiber bestaetigt mit einem Klick): zwei klar lesbare Namensteile ("Aryan Yagami" -> "Aryan"),
 *          ein Rest aus mehreren Teilen nach dem Tag ("Scroll 10" -> "Scroll"), ein einzelner Name, dem nur hinten ein Satzzeichen genommen wurde.
 *   UNVERAENDERT: alles mit fremder Schrift/unbekannten Zeichen ("4zr 谷"), unklare Einzeltoken ("9una", "5AALD"), seltsame Praefixe ("a. lawliet"),
 *          und angehaengte Zahl-/Buchstaben-Suffixe ("adapter2x", "tayson5x") - die hebt sich der Liquipedia-Lauf auf.
 *
 * Das eigentliche Abschneiden nutzt dieselben, erprobten Bausteine wie der Rest der Seite (lib/homoglyph): kernname faellt hier bewusst weg, weil er auch
 * unbekannte Grossbuchstaben-Token und angehaengte Zahlen raet - hier wird nur ein BEKANNTER Tag entfernt (ORGTAGS + die vom Betreiber benannten Kuerzel
 * + die aus orgs.json abgeleiteten), nie geraten.
 */

/*
 * Vom Betreiber am 23.11.2026 ausdruecklich benannte Fortnite-Team-Kuerzel, die in den Namen vorkommen und noch nicht in ORGTAGS stehen (dort sind nur die
 * aus >= 2 Konten des Namensverzeichnisses abgeleiteten). Kleingeschrieben, Vergleich ohne Schreibweise.
 */
export const KURATIERTE_TAGS: readonly string[] = [
  '100t', '1tr', '313', '1st', '7ven', 'atc', 'atl', 'asc', 'nrg', 'm8', 'xset', 'solary', 'dig', 'faze', 'tsm', 'gen',
  'void', 'fear', 'rxb', 'n8', 'cvx', 'ego', 'opi', 'leaf', 'dzd', 'detect', 'vp', 'kos', 'nto', 'flcn', 'qtd', 'havok',
  'gambit', 'evn', 'evr', 'jogo', 'stna', 'fx', 'ftk', 'umplify', 'twis', 'g2', 'og', 'flc', 'ast', 'hwk', 'sfg', 'bpro',
  'vantic', 'wooka', 'ryze', 'fly', 'bglory', 'glore', '1up', 'atlantic',
];

/** Normalform eines Tag-Kandidaten: Fremdschrift-Zwillinge auf Latein, alles klein, nur Buchstaben/Ziffern. */
export function tagSchluessel(wort: string): string {
  return vergleichbar(wort).replace(/[^a-z0-9]/g, '');
}

/** Lateinische Buchstaben ohne latein-zerlegbare Grundform (wie lib/homoglyph, dort privat) - zaehlen als Buchstabe, nicht als Fremdschrift. */
const EIGENE = new Set(['ß', 'ø', 'ł', 'đ', 'æ', 'œ', 'þ', 'ð', 'ı', 'ħ', 'ŋ', 'ĸ']);

/**
 * Den Satz bekannter Team-Tags bauen: ORGTAGS (aus den Daten) + die kuratierten + die aus orgs.json ableitbaren (einteilige Slugs wie "xset", "xp42";
 * mehrteilige wie "havok-by-vitality" werden uebergangen, weil daraus kein eindeutiges Kuerzel wird).
 */
export function teamTags(orgs?: { orgs?: Array<{ id?: string }> } | null): Set<string> {
  const s = new Set<string>([...ORGTAGS, ...KURATIERTE_TAGS]);
  for (const o of orgs?.orgs ?? []) {
    const id = String(o?.id ?? '');
    if (!id || id.includes('-')) continue;
    const k = tagSchluessel(id);
    if (k.length >= 2 && k.length <= 8) s.add(k);
  }
  return s;
}

/** Ist das ein sauberer, rein lateinischer Namensteil (Ziffern erlaubt, Akzente erlaubt)? "leоzin" (kyrillisches o) zaehlt, "谷" und "a." nicht. */
export function istLateinWort(wort: string): boolean {
  if (!wort) return false;
  const v = vergleichbar(wort);
  const ohneAkzent = v.normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const z of ohneAkzent) {
    if (/[a-z0-9]/.test(z)) continue;
    if (EIGENE.has(z)) continue;
    return false;
  }
  return /[a-z0-9]/.test(ohneAkzent);
}

/**
 * Traegt der Name einen Buchstaben aus fremder Schrift, der sich nicht auf Latein zurueckfuehren laesst (CJK, Arabisch ...)? Dann wird der Name gar nicht
 * angefasst (Betreiber: unbekannte Zeichen stehen lassen). Getarnte Satzzeichen wie "ǃ" (ein Klicklaut, Unicode-Buchstabe) zaehlen NICHT - sie fallen ueber
 * die Zwillingstabelle auf "!" und sind damit kein Buchstabe mehr.
 */
export function hatFremdschrift(name: string): boolean {
  for (const c of name.normalize('NFC')) {
    const v = vergleichbar(c);
    if (!/\p{L}/u.test(v)) continue; // nach dem Falten kein Buchstabe mehr -> Zierrat/Satzzeichen/Ziffer, egal
    if (/^[a-z]$/.test(v)) continue; // schlichtes Latein
    const ohne = v.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/^[a-z]+$/.test(ohne)) continue; // Latein mit Akzent
    if (EIGENE.has(v)) continue;
    return true;
  }
  return false;
}

export type SaeuberStatus = 'angewendet' | 'vorschlag' | 'unveraendert';

export interface Saeuberung {
  vorher: string;
  nachher: string;
  status: SaeuberStatus;
  grund: string;
  /** Welcher Team-Tag vorn weggefallen ist (fuer den Beleg), oder null. */
  tag: string | null;
}

const unver = (vorher: string, grund: string): Saeuberung => ({ vorher, nachher: vorher, status: 'unveraendert', grund, tag: null });

/** Ein reines Nummern-Token (Startnummer/Trikotnummer), evtl. mit Zierrat hinten: "21", "10ǃ", "7!". */
function istNummer(t: string): boolean {
  const k = vergleichbar(t).replace(/[^a-z0-9]/g, '');
  return /^[0-9]+$/.test(k);
}

/** Sieht ein Token wie ein (unbekanntes) Org-Kuerzel aus? Kurz und durchgehend GROSS/Ziffern - wie das Sicherheitsnetz in lib/homoglyph. */
function tagFoermig(t: string): boolean {
  return /^[A-Z0-9]{2,6}$/.test(t.replace(/[.!\-]+$/, ''));
}

/**
 * Aus mehreren Teilen den wahrscheinlichen Szene-Namen waehlen (nur fuer Vorschlaege). Hinten angehaengte Nummern fallen weg; steht vorn ein org-foermiges
 * Kuerzel und dahinter ein normales Wort, gewinnt das Wort ("RVNS SkyJump" -> "SkyJump"), sonst der erste Teil ("Aryan Yagami" -> "Aryan").
 */
function waehleName(teile: string[]): string {
  let t = teile.slice();
  while (t.length > 1 && istNummer(t[t.length - 1])) t = t.slice(0, -1);
  if (t.length === 1) return t[0];
  if (tagFoermig(t[0])) {
    const wort = t.find((x) => !tagFoermig(x) && !istNummer(x));
    if (wort) return wort;
  }
  return t[0];
}

/**
 * Einen rohen Namen zu einem sauberen Szene-Namen machen und einordnen. `tags` ist der Satz bekannter Team-Kuerzel (teamTags()).
 * Rechnet nichts ab, ruft nichts ab - rein aus dem Namen.
 */
export function saeubere(name: string, tags: Set<string>): Saeuberung {
  const vorher = String(name ?? '');
  const roh = vorher.trim();
  if (!roh) return unver(vorher, 'leer');
  if (hatFremdschrift(roh)) return unver(vorher, 'fremdschrift');

  // 1. Fuehrende Turnierklammer(n) weg: "[EWC2026] ..."
  let rest = roh;
  let klammer = false;
  const mKl = rest.match(/^(?:\s*\[[^\]]*\]\s*)+/);
  if (mKl && mKl[0].trim()) { rest = rest.slice(mKl[0].length); klammer = true; }

  let tokens = rest.split(/\s+/).filter(Boolean);
  if (!tokens.length) return unver(vorher, 'nur-klammer');

  // 2. Genau EINEN fuehrenden, BEKANNTEN Team-Tag weg (nur wenn danach noch etwas uebrig bliebe).
  let tag: string | null = null;
  if (tokens.length >= 2) {
    const k = tagSchluessel(tokens[0]);
    if (k.length >= 1 && tags.has(k)) { tag = tokens[0]; tokens = tokens.slice(1); }
  }

  // 3. Zierrat/Satzzeichen hinten weg (homoglyph-bewusst, nur am Ende).
  const verbunden = tokens.join(' ');
  const ohne = ohneZierrat(verbunden);
  const zierratWeg = ohne !== verbunden;

  const strukturell = klammer || !!tag;
  const teile = ohne.split(/\s+/).filter(Boolean);
  if (!teile.length) return unver(vorher, 'leer-nach-schnitt');

  const vorschlag = (wert: string, grund: string): Saeuberung => ({ vorher, nachher: wert, status: 'vorschlag', grund, tag });
  const anwenden = (wert: string, grund: string): Saeuberung => ({ vorher, nachher: wert, status: 'angewendet', grund, tag });

  // Ein sauberer Einzelname?
  if (teile.length === 1) {
    const eins = lateinisch(teile[0]).trim();
    if (!istLateinWort(teile[0]) || eins.length < 2) return unver(vorher, 'unklares-token');
    if (eins === vorher) return unver(vorher, 'gleich');
    // Sicher (auto): ein bekannter Tag und/oder eine Turnierklammer ist weggefallen.
    if (strukturell) return anwenden(eins, klammer && tag ? 'klammer+tag' : (tag ? 'tag' : 'klammer'));
    // Kein Tag/keine Klammer - nur hinten ein Satzzeichen genommen: auch sicher (Betreiber: "... und/oder trailing punctuation"), ABER nie, wenn eine Ziffer
    // drinsteckt - das waere ein angehaengtes Suffix wie "tayson5x." -> "Tayson", das der Liquipedia-Lauf macht, nicht wir.
    if (zierratWeg && !/[0-9]/.test(eins)) return anwenden(eins, 'nur-zierrat');
    return unver(vorher, zierratWeg ? 'zierrat-mit-ziffer' : 'nichts-entfernt');
  }

  // Mehrere Teile: NIE automatisch schneiden - immer nur ein Vorschlag, und nie den Org-Tag selbst (waehleName nimmt den Spielernamen, nicht "RVNS").
  if (teile.every((t) => istLateinWort(t) || istNummer(t))) {
    const cand = lateinisch(waehleName(teile)).trim();
    if (istLateinWort(cand) && cand.length >= 2 && cand !== vorher) return vorschlag(cand, strukturell ? 'tag+mehrteilig' : 'mehrteilig');
  }
  return unver(vorher, 'mehrdeutig');
}
