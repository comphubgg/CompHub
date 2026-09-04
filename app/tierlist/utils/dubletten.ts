import { gefaltet, namensSchluessel } from '@/lib/homoglyph';
import type { TierListEntry } from '../types';

/*
 * Dieselbe Person darf nur einmal in der Liste stehen.
 *
 * Die Tierlist fuehrte ihre Eintraege ueber den rohen Turniernamen. Derselbe
 * Spieler stand darin mehrfach, sobald sein Name einmal einen Orgtag oder
 * eine Startnummer trug:
 *
 *     "Sky + Scroll"              (Stufe C, dk/dk)
 *     "AG Sky. + AG Scroll 10ǃ"   (ungesetzt, ohne Flaggen)
 *
 * Fuer Epic sind das dieselben zwei Konten. Der Betreiber dazu: "die weiss
 * umkreisten Leute, das sind die gleichen Personen. Das darf es nicht
 * zweimal haben. Es darf nicht, es kann nicht."
 *
 * Warum das hier steht und nicht in einem Aufraeumskript:
 *
 * Ein Skript raeumt eine Datei auf. Die fertige Anwendung fuehrt aber ihren
 * eigenen Datenbestand - unter "Program Files" darf sie nicht schreiben und
 * zieht deshalb nach %APPDATA% um. Ein aufgeraeumter Projektordner erreicht
 * diesen Bestand nie, und die Dublette stand nach dem Aufraeumen weiterhin
 * im Programm. Beim Laden zusammenzulegen wirkt dagegen ueberall und immer,
 * auch bei allem, was erst morgen aus einem Cup dazukommt.
 *
 * Einstufungen bleiben unberuehrt: ein gesetzter Eintrag gewinnt immer, und
 * bei zwei verschiedenen Stufen bleibt die Gruppe stehen - das ist die
 * Entscheidung des Betreibers, nicht die dieser Funktion.
 */

/**
 * Der Schluessel, unter dem zwei Schreibweisen dieselbe Person sind.
 *
 * Zuerst die Konto-Id, wenn das Namensverzeichnis den Namen kennt. Das ist
 * der einzige Weg fuer den Fall, an dem jede Namensbereinigung scheitert:
 * derselbe Spieler tritt unter "VICO" und unter "BIG TRYONA" an, und die
 * beiden haben keinen Buchstaben gemeinsam. Im Verzeichnis stehen sie unter
 * einer Kennung, und damit fallen sie hier zusammen.
 *
 * Ohne Treffer bleibt es beim bereinigten Namen - der faengt weiterhin die
 * Faelle ab, in denen sich nur ein Orgtag oder eine Startnummer
 * unterscheidet ("Sky + Scroll" gegen "AG Sky. + AG Scroll 10ǃ").
 */
function personenSchluessel(name: unknown, konten?: Record<string, string>): string {
  const rein = namensSchluessel(String(name ?? ''));
  const konto = konten?.[rein];
  return konto ? `k:${konto}` : gefaltet(rein);
}

/** Ein Duo unabhaengig davon, wer von beiden vorn steht. */
function gruppenSchluessel(e: any, konten?: Record<string, string>): string {
  if (e?.isDuo) {
    const paar = [
      personenSchluessel(e.data?.player1?.name, konten),
      personenSchluessel(e.data?.player2?.name, konten),
    ].sort().join('+');
    return `duo:${paar}`;
  }
  return `solo:${personenSchluessel(e?.data?.name, konten)}`;
}

/** Wie viele Flaggen an diesem Eintrag gepflegt sind. */
function flaggen(e: any): number {
  const werte = e?.isDuo
    ? [e.data?.player1?.countryCode, e.data?.player2?.countryCode]
    : [e?.data?.countryCode];
  return werte.filter(Boolean).length;
}

function rohName(e: any): string {
  return e?.isDuo
    ? `${e.data?.player1?.name ?? ''} ${e.data?.player2?.name ?? ''}`
    : String(e?.data?.name ?? '');
}

/**
 * Welcher von zwei Eintraegen bleibt?
 *
 * Zuerst der mit Stufe - er ist gesetzt und darf nie verschwinden. Sonst der
 * mit den meisten Flaggen, weil dort mehr gepflegt ist. Bei Gleichstand der
 * mit dem kuerzesten Rohnamen: das ist die Fassung ohne Orgtag und
 * Startnummer, also die, die man lesen will.
 */
function besserer(a: any, b: any): any {
  if (Boolean(a.tier) !== Boolean(b.tier)) return a.tier ? a : b;
  if (flaggen(a) !== flaggen(b)) return flaggen(a) > flaggen(b) ? a : b;
  return rohName(a).length <= rohName(b).length ? a : b;
}

/** Fehlende Flaggen von den Geschwistern uebernehmen - dieselbe Person. */
function mitFlaggenDerGruppe(behalten: any, gruppe: any[]): any {
  const hole = (welcher: 'player1' | 'player2' | null) => {
    for (const e of gruppe) {
      const quelle = welcher ? e.data?.[welcher] : e.data;
      if (quelle?.countryCode) return String(quelle.countryCode);
    }
    return undefined;
  };

  if (behalten.isDuo) {
    const p1 = behalten.data?.player1;
    const p2 = behalten.data?.player2;
    const l1 = p1?.countryCode || hole('player1');
    const l2 = p2?.countryCode || hole('player2');
    if (l1 === p1?.countryCode && l2 === p2?.countryCode) return behalten;
    return {
      ...behalten,
      data: {
        ...behalten.data,
        player1: p1 ? { ...p1, countryCode: l1 ?? p1.countryCode } : p1,
        player2: p2 ? { ...p2, countryCode: l2 ?? p2.countryCode } : p2,
      },
    };
  }

  const land = behalten.data?.countryCode || hole(null);
  if (land === behalten.data?.countryCode) return behalten;
  return { ...behalten, data: { ...behalten.data, countryCode: land } };
}

/**
 * Die Liste ohne Dubletten.
 *
 * Die Reihenfolge bleibt: jede Gruppe erscheint dort, wo ihr erster Eintrag
 * stand. Sonst spraenge die Liste bei jedem Laden umher.
 */
export function ohneDubletten(
  eintraege: TierListEntry[],
  /** Namensschluessel -> Konto-Id, aus /api/spieler-namen?nachName=1. */
  konten?: Record<string, string>,
): TierListEntry[] {
  const gruppen = new Map<string, any[]>();
  const reihenfolge: string[] = [];

  for (const e of eintraege as any[]) {
    // Eigene Eintraege eines Nutzers bleiben unberuehrt: die gehoeren ihm,
    // und zwei Nutzer duerfen denselben Spieler getrennt fuehren.
    const k = e?.localOnly ? `eigen:${e.id}` : gruppenSchluessel(e, konten);
    if (!gruppen.has(k)) { gruppen.set(k, []); reihenfolge.push(k); }
    gruppen.get(k)!.push(e);
  }

  const heraus: any[] = [];
  for (const k of reihenfolge) {
    const gruppe = gruppen.get(k)!;
    if (gruppe.length === 1) { heraus.push(gruppe[0]); continue; }

    // Zwei verschiedene Stufen fuer dieselbe Person: nicht unsere
    // Entscheidung. Dann bleibt alles stehen, damit nichts verloren geht.
    const stufen = new Set(gruppe.filter((e) => e.tier).map((e) => e.tier));
    if (stufen.size > 1) { heraus.push(...gruppe); continue; }

    heraus.push(mitFlaggenDerGruppe(gruppe.reduce(besserer), gruppe));
  }
  return heraus as TierListEntry[];
}
