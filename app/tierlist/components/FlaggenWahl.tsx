'use client';

// Ein Land auswaehlen - ueber die Flagge, nicht ueber das Kuerzel.
//
// "RO" sagt beim Ueberfliegen nichts; die Flagge erkennt man sofort. Der
// Knopf zeigt die gewaehlte, ein Klick klappt alle vorhandenen auf. Das
// Kuerzel steht weiterhin im Mouseover, falls es doch einmal gebraucht wird.

import React from 'react';
import { FLAG_CODES } from '../utils/constants';
import { useT } from '@/app/components/SprachProvider';

/**
 * Die Weltkugel steht vorn: die ehrliche Wahl, wenn nichts bekannt ist.
 *
 * Die feste Liste im Code taugt nur als Rueckfall. Sie fuehrte zwoelf Laender
 * auf, zu denen keine Datei vorliegt - Philippinen, Indonesien, Malaysia,
 * Singapur, Suedafrika, Kenia, Chile, Pakistan, Bangladesch, Irak, Katar und
 * Jordanien -, und genau die erschienen in der Auswahl als kaputtes Bild.
 * Umgekehrt fehlten dort dreizehn Flaggen, die es tatsaechlich gibt.
 * Massgeblich ist deshalb der Ordner selbst.
 */
export const FLAGGEN_MIT_GLOBUS = [
  'flag-GLOBE',
  ...FLAG_CODES.filter((c) => c !== 'flag-GLOBE'),
];

/** Was wirklich als Datei vorliegt - einmal geholt und dann gemerkt. */
let ordnerListe: string[] | null = null;

export function useFlaggenListe(): string[] {
  const [liste, setListe] = React.useState<string[]>(
    ordnerListe ?? FLAGGEN_MIT_GLOBUS);

  React.useEffect(() => {
    if (ordnerListe) return;
    fetch('/api/flaggen')
      .then((r) => r.json())
      .then((j) => {
        const codes: string[] = j.flaggen ?? [];
        if (!codes.length) return;
        ordnerListe = ['flag-GLOBE', ...codes];
        setListe(ordnerListe);
      })
      .catch(() => { /* dann bleibt es beim Rueckfall */ });
  }, []);

  return liste;
}

export const FlaggenWahl: React.FC<{
  wert: string;
  codes?: string[];
  aus?: boolean;
  groesse?: number;
  onWahl: (code: string) => void;
}> = ({ wert, codes, aus, groesse = 32, onWahl }) => {
  const t = useT();
  const [offen, setOffen] = React.useState(false);
  const ausOrdner = useFlaggenListe();
  const auswahl = codes ?? ausOrdner;

  return (
    <div className="flaggenwahl" style={{ flex: `0 0 ${groesse + 2}px` }}>
      <button type="button" className="flaggenwahl-knopf" disabled={aus}
        style={{ width: groesse + 2, height: groesse + 2 }}
        title={wert && wert !== 'flag-GLOBE' ? wert.toUpperCase() : t('Land wählen')}
        onClick={(e) => { e.stopPropagation(); setOffen((o) => !o); }}>
        <img src={`/flags/${wert || 'flag-GLOBE'}.png`} alt={wert}
          style={{ width: groesse, height: groesse }} />
      </button>
      {offen && !aus && (
        <>
          {/* Ein Klick daneben schliesst wieder. */}
          <div className="flaggenwahl-hinterher"
            onClick={(e) => { e.stopPropagation(); setOffen(false); }} />
          <div className="flaggenwahl-raster" onClick={(e) => e.stopPropagation()}>
            {auswahl.map((code) => (
              <button key={code} type="button" title={code.toUpperCase()}
                className={code === wert ? 'gewaehlt' : ''}
                onClick={(e) => {
                  e.stopPropagation();
                  onWahl(code); setOffen(false);
                }}>
                <img src={`/flags/${code}.png`} alt={code} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default FlaggenWahl;
