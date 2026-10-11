'use client';

import { useEffect, useState } from 'react';
import { sichtbarerTakt } from './takt';
import type { Sektion, Staende, Zustand } from '@/lib/sektionen';

/*
 * Was gerade offen ist - fuer die Kopfzeile und die Sperrseite.
 *
 * Der Betreiber wollte, dass eine Umschaltung "sofort für alle User
 * wirksam" ist. Ohne einen Server, der von sich aus etwas schickt, heisst
 * das: kurz getaktet nachfragen. Zehn Sekunden sind ein guter Kompromiss -
 * schnell genug, dass niemand vor einer Seite sitzt, die es nicht mehr
 * geben soll, und sparsam genug, dass es nicht auffaellt. Die Antwort ist
 * ein kleines Objekt, kein Datenbestand.
 *
 * Dazu bei jeder Rueckkehr ins Fenster: wer den Reiter wieder aufmacht,
 * sieht sofort den neuen Stand.
 */

export interface SektionenStand {
  /** Noch keine Antwort - solange nichts verstecken und nichts sperren. */
  laedt: boolean;
  admin: boolean;
  sektionen: Sektion[];
  staende: Staende;
}

const ANFANG: SektionenStand = {
  laedt: true, admin: false, sektionen: [], staende: {},
};

/**
 * Wie oft nachgefragt wird.
 *
 * Eine halbe Minute (vorher fuenfzehn Sekunden): bei Netlify kostet jede Anfrage an die Seite Punkte aus einem
 * knappen Monatskontingent (300), und diese Frage stellte jede offene Seite mehrfach. Eine Umschaltung des
 * Admins greift damit nach hoechstens dreissig Sekunden - und sofort beim Zurueckkehren ins Fenster.
 */
const TAKT = 30_000;

/*
 * Ein gemeinsamer Stand fuer alle Stellen der Seite.
 *
 * Kopfzeile, Sperrseite und weitere Bauteile riefen "useSektionen" je fuer sich auf - und jedes fragte im Takt
 * nach: auf einer einzigen Seite ein Dutzend gleiche Anfragen in der Minute (am 11.10.2026 gemessen). Jetzt
 * gibt es EINE Abfrage fuer die ganze Seite; die Bauteile hoeren nur mit.
 */
let geteilt: SektionenStand = ANFANG;
let ganzGeholt = false;
const hoerer = new Set<(s: SektionenStand) => void>();
let stopp: (() => void) | null = null;
let unterwegs: Promise<void> | null = null;

function setzeGeteilt(neu: SektionenStand) {
  geteilt = neu;
  hoerer.forEach((f) => f(neu));
}

function holenGeteilt(): Promise<void> {
  if (unterwegs) return unterwegs;
  unterwegs = (async () => {
    try {
      if (ganzGeholt) {
        const j = await (await fetch('/api/sektionen?nur=staende')).json();
        if (!j?.staende) return;
        setzeGeteilt({ ...geteilt, laedt: false, staende: j.staende });
        return;
      }
      const j = await (await fetch('/api/sektionen', { cache: 'no-store' })).json();
      ganzGeholt = true;
      setzeGeteilt({
        laedt: false,
        admin: Boolean(j?.admin),
        sektionen: Array.isArray(j?.sektionen) ? j.sektionen : [],
        staende: j?.staende ?? {},
      });
    } catch {
      /*
       * Keine Auskunft heisst: alles offen.
       *
       * Ein Netzfehler darf nicht dazu fuehren, dass das halbe Werkzeug verschwindet. Lieber einmal zu viel
       * gezeigt als eine Seite, die grundlos zu ist.
       */
      setzeGeteilt({ ...geteilt, laedt: false });
    } finally { unterwegs = null; }
  })();
  return unterwegs;
}

/**
 * @param anfang Der Stand, den der Server schon mitgeliefert hat.
 *
 * Damit stimmt bereits die erste Zeichnung: kein abgeschalteter Bereich
 * blitzt in der Leiste auf, und wer die Seite ohne Javascript ansieht,
 * bekommt trotzdem das Richtige.
 */
export function useSektionen(anfang?: Partial<SektionenStand>): SektionenStand {
  const [stand, setStand] = useState<SektionenStand>(
    () => (geteilt !== ANFANG ? geteilt : anfang ? { ...ANFANG, ...anfang, laedt: false } : ANFANG));

  useEffect(() => {
    hoerer.add(setStand);
    // Wer spaeter dazukommt, bekommt sofort, was schon bekannt ist.
    if (geteilt !== ANFANG) setStand(geteilt);
    if (!stopp) {
      void holenGeteilt();
      stopp = sichtbarerTakt(() => { void holenGeteilt(); }, TAKT);
    }
    return () => {
      hoerer.delete(setStand);
      if (!hoerer.size && stopp) { stopp(); stopp = null; }
    };
  }, []);

  return stand;
}

/**
 * Was fuer diesen Besucher gilt.
 *
 * Der Admin sieht alles, egal was dransteht - das ist der Zweck der Sache:
 * er soll einen Bereich im Hintergrund weiterbauen koennen, waehrend
 * niemand sonst ihn sieht.
 */
export function zustandFuer(
  stand: SektionenStand, schluessel: string,
): Zustand {
  if (stand.admin) return 'online';
  return stand.staende[schluessel]?.zustand ?? 'online';
}
