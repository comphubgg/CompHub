'use client';

import { useCallback, useEffect, useState } from 'react';
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

/** Wie oft nachgefragt wird. */
const TAKT = 10_000;

/**
 * @param anfang Der Stand, den der Server schon mitgeliefert hat.
 *
 * Damit stimmt bereits die erste Zeichnung: kein abgeschalteter Bereich
 * blitzt in der Leiste auf, und wer die Seite ohne Javascript ansieht,
 * bekommt trotzdem das Richtige.
 */
export function useSektionen(anfang?: Partial<SektionenStand>): SektionenStand {
  const [stand, setStand] = useState<SektionenStand>(
    anfang ? { ...ANFANG, ...anfang, laedt: false } : ANFANG);

  const holen = useCallback(async (weg: () => boolean) => {
    try {
      const j = await (await fetch('/api/sektionen', { cache: 'no-store' })).json();
      if (weg()) return;
      setStand({
        laedt: false,
        admin: Boolean(j?.admin),
        sektionen: Array.isArray(j?.sektionen) ? j.sektionen : [],
        staende: j?.staende ?? {},
      });
    } catch {
      /*
       * Keine Auskunft heisst: alles offen.
       *
       * Ein Netzfehler darf nicht dazu fuehren, dass das halbe Werkzeug
       * verschwindet. Lieber einmal zu viel gezeigt als eine Seite, die
       * grundlos zu ist.
       */
      if (!weg()) setStand((v) => ({ ...v, laedt: false }));
    }
  }, []);

  useEffect(() => {
    let fort = false;
    const weg = () => fort;

    void Promise.resolve().then(() => { if (!fort) return holen(weg); });

    const uhr = setInterval(() => { void holen(weg); }, TAKT);
    const beiRueckkehr = () => {
      if (document.visibilityState === 'visible') void holen(weg);
    };
    document.addEventListener('visibilitychange', beiRueckkehr);
    window.addEventListener('focus', beiRueckkehr);

    return () => {
      fort = true;
      clearInterval(uhr);
      document.removeEventListener('visibilitychange', beiRueckkehr);
      window.removeEventListener('focus', beiRueckkehr);
    };
  }, [holen]);

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
