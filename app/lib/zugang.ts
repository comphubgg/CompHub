'use client';

import { useCallback, useEffect, useState } from 'react';
import { darf, type Bereich } from '@/lib/rechte';

// Wer darf was.
//
// Bisher kannte das Werkzeug nur zwei Zustaende: VIP oder Gast. Wer sich ein
// CompHub-Konto angelegt hatte, galt trotzdem als Gast und bekam an jeder
// Ecke den Hinweis, er solle sich anmelden - obwohl er das gerade getan
// hatte.
//
// Es gibt drei Stufen und dazu die einzelnen Bereiche:
//
//   gast    - kein Konto, nur Zuschauer
//   nutzer  - CompHub-Konto: eigene Ordner bespielen, Spieler hinzufuegen,
//             eigene Tierlists
//   vip     - dazu die Bereiche, die vergeben werden: Overlays, eigene
//             Ordner anlegen, Turnierfilter, Vergleich
//   manager - dazu genau die Verwaltungsbereiche, die der Admin angehakt hat
//   admin   - alles
//
// Warum sich das von selbst erneuert: der Nutzer wollte, dass vergebene
// Rechte sofort greifen, nicht erst nach einem Neuladen. Deshalb wird die
// Auskunft alle dreissig Sekunden und bei jeder Rueckkehr ins Fenster neu
// geholt. Haeufiger waere Unfug - eine Rechtevergabe ist kein Ereignis, das
// auf die Sekunde genau ankommt.

export interface Zugang {
  /** Noch nicht beantwortet - solange nichts sperren und nichts anpreisen. */
  laedt: boolean;
  gast: boolean;
  nutzer: boolean;
  vip: boolean;
  admin: boolean;
  manager: boolean;
  /** Profispieler - darf sich auf Karten selbst eintragen. */
  pro: boolean;
  /** Die angehakten Bereiche eines Managers. */
  rechte: string[];
  name: string;
  /** Darf dieses Konto in diesen Verwaltungsbereich? */
  darfBereich: (b: Bereich) => boolean;
}

const ANFANG: Zugang = {
  laedt: true, gast: true, nutzer: false, vip: false, admin: false,
  manager: false, pro: false, rechte: [], name: '', darfBereich: () => false,
};

/** Wie oft nachgefragt wird. */
const TAKT = 30_000;

export function useZugang(): Zugang {
  const [zugang, setZugang] = useState<Zugang>(ANFANG);

  const holen = useCallback(async (weg: () => boolean) => {
    let kontoName = '';
    let vipName = '';
    let rolle: 'admin' | 'manager' | 'pro' | null = null;
    let rechte: string[] = [];
    let vipKonto = false;
    /** Ein Zugang, dessen VIP-Frist abgelaufen ist. */
    let vipZugangOhneRecht = false;

    try {
      const j = await (await fetch('/api/konto', { cache: 'no-store' })).json();
      if (j?.angemeldet) {
        kontoName = String(j.konto?.name ?? '');
        rolle = j.konto?.rolle ?? null;
        rechte = Array.isArray(j.konto?.rechte) ? j.konto.rechte : [];
        vipKonto = Boolean(j.konto?.vip);
      }
    } catch { /* ohne Auskunft gilt: kein Konto */ }

    try {
      const r = await fetch('/api/auth/verify', {
        credentials: 'same-origin', cache: 'no-store',
      });
      if (r.ok) {
        const j = await r.json();
        if (j?.authorized && j?.user) {
          vipName = String(j.user);
          /*
           * Auch ein Zugang mit Schluessel kann eine Rolle tragen.
           *
           * Der Betreiber wollte diesen Konten dieselben Rechte geben
           * koennen wie gewoehnlichen. Bisher kam die Rolle nur vom
           * CompHub-Konto; wer sich mit einem Schluessel anmeldete, blieb
           * VIP und sonst nichts. Ein bereits gesetztes Kontorecht wird
           * nicht ueberschrieben - wer beides hat, behaelt das hoehere.
           */
          if (!rolle && j?.rolle) rolle = j.rolle;
          if (!rechte.length && Array.isArray(j?.rechte)) rechte = j.rechte;
          if (j?.vip === false) vipZugangOhneRecht = true;
        }
      }
    } catch { /* ohne Auskunft gilt: kein VIP */ }

    if (weg()) return;

    /*
     * VIP kommt aus zwei Quellen: dem alten Schluessel und dem neuen
     * Kontorecht. Beides zaehlt - wer auf einem der beiden Wege VIP ist,
     * ist es.
     */
    const nutzer = Boolean(kontoName) || Boolean(vipName);
    const admin = rolle === 'admin' || vipName.toLowerCase() === 'admin-juanito';

    /*
     * Wer ueber VIP steht, ist immer auch VIP.
     *
     * Die Stufen liegen uebereinander, nicht nebeneinander: Nutzer, VIP,
     * Pro, Manager, Admin - jede schliesst alles darunter ein. Zuerst galt
     * das nur fuer den Admin; ein Pro stand danach vor den Overlays und den
     * Streamer-Ordnern und bekam "nur fuer VIP" zu lesen, obwohl er nach
     * dem Admin die groessten Rechte hat. Ihm zusaetzlich VIP anzuhaken
     * waere eine Falle - niemand kommt auf die Idee, sich selbst noch eine
     * kleinere Stufe zu geben.
     */
    const ueberVip = admin || rolle === 'manager' || rolle === 'pro';
    const vip = ueberVip
      || (Boolean(vipName) && !vipZugangOhneRecht)
      || vipKonto;

    setZugang({
      laedt: false,
      gast: !nutzer,
      nutzer,
      vip,
      admin,
      manager: rolle === 'manager',
      pro: rolle === 'pro',
      rechte,
      name: kontoName || vipName,
      darfBereich: (b) => (admin ? true : darf(rolle, rechte, b)),
    });
  }, []);

  useEffect(() => {
    let fort = false;
    const weg = () => fort;

    // Einen Mikrotask spaeter: der Abruf setzt am Ende Zustand, und im
    // selben Durchlauf ergaebe das eine ueberfluessige zweite Zeichnung.
    void Promise.resolve().then(() => { if (!fort) return holen(weg); });

    // Regelmaessig und bei der Rueckkehr ins Fenster - so greift eine
    // Rechtevergabe binnen Sekunden, ohne dass jemand neu laden muss.
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

  return zugang;
}
