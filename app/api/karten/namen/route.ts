import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { gesamtSummen } from '@/lib/szeneStats';
import { gefaltet, namensSchluessel } from '@/lib/homoglyph';
import { DATEN_ORT } from '@/lib/datenOrt';

/*
 * Rohe Woerter aus einer Texterkennung zu Spielern aufloesen.
 *
 *   POST { woerter: ["Skyjump", "5cro11", "Hintergrund"] }
 *     -> { treffer: [{ roh, name, land, epicId, guete }, ...] }
 *
 * Wozu das dient: der Betreiber legt den Screenshot einer fremden Karte auf
 * seine eigene und will die Namen daraus uebernehmen, ohne fuenfzig Duos
 * abzutippen. Eine Texterkennung liefert dabei nie sauberen Text - sie liest
 * "Sky]ump", "5CROLL", "Ritua1". Die vorhandene Suche der Statistikseite
 * arbeitet mit Teilzeichenketten und findet so etwas nicht.
 *
 * Deshalb hier ein eigener, unscharfer Abgleich. Zwei Dinge sind dabei
 * wichtig:
 *
 *   - Es wird nichts erfunden. Zurueck kommen ausschliesslich Konten, die im
 *     Archiv stehen; ein Wort ohne Treffer faellt weg und wird nicht als
 *     Spieler ausgegeben. Ein falscher Name auf einer Karte, die er postet,
 *     waere schlimmer als eine Luecke.
 *   - Der Rohtext bleibt dabei. In der Oberflaeche steht neben jedem
 *     Vorschlag, woraus er entstanden ist - so sieht er selbst, ob die
 *     Zuordnung stimmt, bevor er sie uebernimmt.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Profil {
  id?: string; name: string; land?: string; anzeige?: string; x?: string;
}

/**
 * Buchstaben zusammenlegen, die eine Texterkennung verwechselt.
 *
 * Das sind nicht irgendwelche Aehnlichkeiten, sondern die immer gleichen:
 * ein kleines L, ein grosses i und eine Eins sehen in fast jeder Schrift
 * identisch aus, ebenso O und Null. `gefaltet` deckt davon schon die
 * Ziffern ab; hier kommt der Rest dazu, und zwar auf beiden Seiten des
 * Vergleichs.
 *
 * Der Gewinn ist gross: "Vlco" und "Vico" sind danach dasselbe Wort, ohne
 * dass der Vergleich einen einzigen Fehler zulassen muss. Genau darum geht
 * es - erlaubte Fehler treffen auch Namen, die sich wirklich unterscheiden
 * ("Zone" und "Ozone"), eine Faltung dagegen nur die, die gleich aussehen.
 */
function ocrFaltung(schluessel: string): string {
  return schluessel
    .replace(/[ijl]/g, 'i')
    .replace(/[oq]/g, 'o')
    .replace(/[uv]/g, 'u')
    .replace(/rn/g, 'm');
}

/**
 * Wieviele Zeichen duerfen danebengehen.
 *
 * Kurze Namen bekommen keinen Spielraum: bei "Zone" waere schon ein
 * einziger Fehler auch "Ozone", und der Unterschied zwischen zwei Profis
 * verschwaende in der Toleranz. Je laenger ein Name, desto eindeutiger ist
 * er - und desto eher darf die Texterkennung sich vertan haben, ohne dass
 * die Zuordnung zweifelhaft wird.
 *
 * Die verwechselten Buchstaben braucht dieser Spielraum nicht abzudecken,
 * die sind vorher schon zusammengelegt.
 */
function erlaubterAbstand(laenge: number): number {
  if (laenge <= 4) return 0;
  if (laenge <= 8) return 1;
  if (laenge <= 12) return 2;
  return 3;
}

/**
 * Levenshtein-Abstand, mit Abbruch.
 *
 * Sobald in einer Zeile kein Wert mehr unter der Grenze liegt, kann das
 * Ergebnis die Grenze nicht mehr unterschreiten - dann lohnt der Rest nicht.
 * Ohne diesen Abbruch dauert der Abgleich gegen zehntausende Namen spuerbar
 * laenger, ohne ein anderes Ergebnis zu liefern.
 */
function abstand(a: string, b: string, grenze: number): number {
  if (Math.abs(a.length - b.length) > grenze) return grenze + 1;
  let vorige = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const zeile = [i];
    let kleinstes = i;
    for (let j = 1; j <= b.length; j += 1) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1;
      const wert = Math.min(
        zeile[j - 1] + 1,
        vorige[j] + 1,
        vorige[j - 1] + kosten,
      );
      zeile.push(wert);
      if (wert < kleinstes) kleinstes = wert;
    }
    if (kleinstes > grenze) return grenze + 1;
    vorige = zeile;
  }
  return vorige[b.length];
}

/**
 * X-Konto zu Spieler.
 *
 * In uebernommenen Beitraegen stehen Spieler oft nur als "@venofn". Das ist
 * kein Name, den ein Namensvergleich finden koennte - aber es ist eine
 * eindeutige Angabe, sobald das Konto in einem gepflegten Profil steht.
 * Damit wird aus einem fremden Beitrag eine Liste echter Spieler, ohne dass
 * irgendetwas geraten wird.
 */
async function liesXKonten(): Promise<Map<string, string>> {
  const karte = new Map<string, string>();
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'spieler-profile.json'), 'utf8')) as Record<string, Profil>;
    for (const [schluessel, pr] of Object.entries(roh)) {
      const id = pr.id || (/^[0-9a-f]{32}$/i.test(schluessel) ? schluessel : '');
      const x = (pr.x ?? '').trim().toLowerCase().replace(/^@/, '');
      if (id && x) karte.set(x, id);
    }
  } catch { /* noch keine Profile */ }
  return karte;
}

async function liesProfile(): Promise<Map<string, Profil>> {
  const karte = new Map<string, Profil>();
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'spieler-profile.json'), 'utf8')) as Record<string, Profil>;
    for (const [schluessel, pr] of Object.entries(roh)) {
      const id = pr.id || (/^[0-9a-f]{32}$/i.test(schluessel) ? schluessel : '');
      if (id) karte.set(id, pr);
    }
  } catch { /* noch keine Profile gepflegt */ }
  return karte;
}

async function liesSzene(): Promise<Map<string, { name: string; land: string }>> {
  const karte = new Map<string, { name: string; land: string }>();
  try {
    const roh = JSON.parse(await fs.readFile(
      path.join(DATEN_ORT, 'szene-quelle', 'spielerliste.json'), 'utf8')) as
      Array<{ ID?: string; NAME?: string; COUNTRY?: string }>;
    for (const p of roh) {
      if (!p.ID || !p.NAME) continue;
      karte.set(p.ID, { name: p.NAME, land: (p.COUNTRY || '').toUpperCase() });
    }
  } catch { /* keine Kopie da */ }
  return karte;
}

interface Eintrag {
  epicId: string; anzeige: string; land: string; matches: number;
  /** Alle Schreibweisen dieses Kontos, gefaltet - danach wird verglichen. */
  schluessel: string[];
}

/*
 * Der Namensspeicher.
 *
 * Er wird aus denselben Quellen gebaut wie die Suche der Statistikseite:
 * dem eigenen Archiv, den gepflegten Profilen und der offenen Spielerliste
 * der Szene-Quelle. Weil das einen Moment dauert, bleibt er eine Minute
 * lang liegen - laenger nicht, damit ein frisch gepflegter Name nicht erst
 * nach einem Neustart ankommt.
 */
let speicher: Eintrag[] | null = null;
let speicherBis = 0;

async function namensSpeicher(): Promise<Eintrag[]> {
  if (speicher && Date.now() < speicherBis) return speicher;
  const [summen, profile, szene] = await Promise.all([
    gesamtSummen(), liesProfile(), liesSzene(),
  ]);

  const liste: Eintrag[] = summen.map((x) => {
    const pr = profile.get(x.epicId);
    const sz = szene.get(x.epicId);
    const anzeige = pr?.anzeige || pr?.name || sz?.name || x.name;
    const alle = new Set<string>();
    for (const n of [anzeige, x.name, sz?.name ?? '', ...x.namen]) {
      const s = gefaltet(namensSchluessel(n));
      if (s.length >= 2) alle.add(s);
    }
    return {
      epicId: x.epicId,
      anzeige,
      land: pr?.land || sz?.land || '',
      matches: x.matches,
      schluessel: [...alle],
    };
  });

  speicher = liste;
  speicherBis = Date.now() + 60_000;
  return liste;
}

export async function POST(request: Request) {
  try {
    const koerper = await request.json() as { woerter?: unknown };
    const woerter = Array.isArray(koerper.woerter)
      ? koerper.woerter.filter((w): w is string => typeof w === 'string').slice(0, 400)
      : [];
    if (!woerter.length) {
      return NextResponse.json({ success: true, treffer: [] });
    }

    const liste = await namensSpeicher();
    const xKonten = await liesXKonten();
    const nachId = new Map(liste.map((e) => [e.epicId, e]));

    /*
     * Zuerst der genaue Weg.
     *
     * Die allermeisten Woerter, die die Texterkennung sauber gelesen hat,
     * treffen ueber die gefaltete Schreibweise sofort. Nur was hier
     * durchfaellt, geht in den teuren unscharfen Vergleich.
     */
    const genau = new Map<string, Eintrag[]>();
    const gefalten = new Map<string, Eintrag[]>();
    for (const e of liste) {
      for (const s of e.schluessel) {
        const vorhanden = genau.get(s);
        if (vorhanden) vorhanden.push(e); else genau.set(s, [e]);
        const g = ocrFaltung(s);
        const auch = gefalten.get(g);
        if (auch) auch.push(e); else gefalten.set(g, [e]);
      }
    }

    /** Bei mehreren Konten mit demselben Namen gewinnt das meistgespielte. */
    const staerkster = (kandidaten: Eintrag[]) =>
      kandidaten.reduce((a, b) => (b.matches > a.matches ? b : a));

    const treffer: Array<{
      roh: string; name: string; land: string; epicId: string; guete: number;
      /** Wie oft dieses Konto im Archiv angetreten ist. */
      matches: number;
    }> = [];

    for (const roh of woerter) {
      /*
       * Ein @-Konto zuerst.
       *
       * Es ist die sicherste Angabe von allen: kein Vergleich, kein
       * Spielraum, sondern eine gepflegte Zuordnung. Erst wenn dazu nichts
       * steht, wird ueber den Namen gesucht.
       */
      const alsKonto = /^@/.test(roh.trim())
        ? xKonten.get(roh.trim().toLowerCase().replace(/^@/, '')) : undefined;
      if (alsKonto) {
        const e = nachId.get(alsKonto);
        if (e) {
          treffer.push({
            roh, name: e.anzeige, land: e.land, epicId: e.epicId, guete: 1,
            matches: e.matches,
          });
          continue;
        }
      }

      const suchschluessel = gefaltet(namensSchluessel(roh));
      if (suchschluessel.length < 3) continue;

      let bester: Eintrag | null = null;
      let besteGuete = 0;

      /*
       * Drei Stufen, von sicher nach unsicher.
       *
       * Zuerst die Schreibweise, wie sie dasteht. Dann dieselbe mit
       * zusammengelegten Verwechslungsbuchstaben - das faengt die Haelfte
       * aller Lesefehler ohne jede Unschaerfe ab. Erst zuletzt der
       * unscharfe Vergleich, und der nur, wenn der Name lang genug ist, um
       * einen Fehler zu vertragen.
       */
      const gleich = genau.get(suchschluessel);
      const gefaltetGleich = gefalten.get(ocrFaltung(suchschluessel));
      if (gleich) {
        bester = staerkster(gleich);
        besteGuete = 1;
      } else if (gefaltetGleich) {
        bester = staerkster(gefaltetGleich);
        besteGuete = 0.9;
      } else {
        const gesucht = ocrFaltung(suchschluessel);
        const grenze = erlaubterAbstand(gesucht.length);
        if (!grenze) continue;
        for (const [s, kandidaten] of gefalten) {
          if (Math.abs(s.length - gesucht.length) > grenze) continue;
          const d = abstand(gesucht, s, grenze);
          if (d > grenze) continue;
          const guete = 0.9 * (1 - d / Math.max(s.length, gesucht.length));
          const e = staerkster(kandidaten);
          if (guete > besteGuete
            || (guete === besteGuete && bester && e.matches > bester.matches)) {
            bester = e; besteGuete = guete;
          }
        }
      }

      if (!bester || besteGuete < 0.6) continue;
      treffer.push({
        roh,
        name: bester.anzeige,
        land: bester.land,
        epicId: bester.epicId,
        guete: Math.round(besteGuete * 100) / 100,
        matches: bester.matches,
      });
    }

    return NextResponse.json({ success: true, treffer });
  } catch (fehler) {
    return NextResponse.json(
      { success: false, fehler: (fehler as Error).message }, { status: 500 });
  }
}
