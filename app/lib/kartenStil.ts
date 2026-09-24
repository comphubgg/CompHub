import { useEffect, useMemo, useState } from 'react';
import { Alata } from 'next/font/google';
import { kernname, ohneZierrat } from '@/lib/homoglyph';

/*
 * Wie jede Turnierkarte aussieht - im Karten-Werkzeug, in der Prognose und
 * unter /globals/map.
 *
 * Der Betreiber (24.9.2026) hat die Karte von eucompetitive.com/globals als
 * Vorbild genannt: "die Animation mit den Spielernamen, die Schriftart, wie
 * die zoomt ... fuer alle Maps", dazu die Rotfarbe der Formen. Nachgemessen
 * an der Seite selbst:
 *
 *   - Schrift Alata, halbfett, weiss mit einer ein Pixel starken schwarzen
 *     Kontur. Sie bleibt beim Hineinzoomen auf dem Bildschirm gleich gross.
 *   - Umkaempfte Form (zwei Teams und mehr): Rot mit 40 Prozent Deckung,
 *     Rand #d32f2f. Sonst Schwarz mit 40 Prozent und schwarzem Rand.
 *   - Beim Ueberfahren waechst die Form um zwei Prozent und bekommt einen
 *     weichen Schein in ihrer Farbe.
 *   - Der Rand bleibt beim Zoomen gleich duenn. Der Betreiber: "clean duenn,
 *     aber nicht allzu duenn" - anderthalb Pixel.
 *
 * Die Masse, die gegen den Zoom gerechnet werden, lesen die Stile aus der
 * CSS-Variablen --z der Zoom-Ebene (siehe globals.css, .karten-name und
 * .karten-form). So folgt alles dem Zoom, ohne dass die Seite dafuer neu
 * zeichnen muss - das Neuzeichnen bei jedem Radstoss war es, was ruckelte.
 */

export const kartenSchrift = Alata({
  weight: '400', subsets: ['latin'], display: 'swap', variable: '--font-karte',
});

/**
 * Ein Name, wie er auf der Karte steht: ohne Turniermarke, Orgtag und
 * angehaengte Zierzeichen, und komplett in Grossbuchstaben. Der Betreiber:
 * "Mach alle Buchstaben immer komplett gross geschrieben. Alle, alle."
 * Umgeschrieben wird nur die Anzeige.
 */
export function kartenName(name: string): string {
  return ohneZierrat(kernname(String(name ?? ''))).slice(0, 16).toUpperCase();
}

/** Fuellung und Rand einer Form, nach Zahl der Teams darauf. */
export function formFarbe(belegt: number, eigene?: string | null) {
  // Eine selbst gesetzte Farbe hat immer Vorrang.
  if (eigene && /^#[0-9a-f]{6}$/i.test(eigene)) {
    const r = parseInt(eigene.slice(1, 3), 16);
    const g = parseInt(eigene.slice(3, 5), 16);
    const b = parseInt(eigene.slice(5, 7), 16);
    return { fuellung: `rgba(${r},${g},${b},0.4)`, rand: eigene, rot: false };
  }
  if (belegt >= 2) return { fuellung: 'rgba(255,0,0,0.4)', rand: '#d32f2f', rot: true };
  if (belegt === 1) return { fuellung: 'rgba(0,0,0,0.4)', rand: '#000', rot: false };
  // Leer: nur angedeutet, damit man sieht, wo noch Platz ist.
  return { fuellung: 'rgba(0,0,0,0.14)', rand: 'rgba(0,0,0,0.7)', rot: false };
}

/**
 * Die ueberfahrene Form hervorheben - direkt am Element, ohne die Seite neu
 * zu zeichnen. Jede Form traegt data-form mit ihrer Id.
 */
export function hebeFormHervor(wurzel: HTMLElement | null, alt: string | null, neu: string | null) {
  if (!wurzel || alt === neu) return;
  if (alt) {
    wurzel.querySelectorAll(`[data-form="${CSS.escape(alt)}"]`)
      .forEach((el) => el.classList.remove('ist-hover'));
  }
  if (neu) {
    wurzel.querySelectorAll(`[data-form="${CSS.escape(neu)}"]`)
      .forEach((el) => el.classList.add('ist-hover'));
  }
}

/**
 * Die echten Namen zu den Konten auf der Karte (siehe /api/echte-namen).
 *
 * Solange die Antwort aussteht, ist das Ergebnis leer - dann steht der Name,
 * den die Karte gespeichert hat. Fehlt ein Konto in der Antwort, bleibt es
 * ebenfalls dabei.
 */
export function useEchteNamen(ids: Array<string | null | undefined>, event?: string | null) {
  const schluessel = useMemo(
    () => [...new Set(ids.filter((x): x is string => !!x && /^[0-9a-f]{32}$/.test(x)))].sort().join(','),
    [ids],
  );
  const [namen, setNamen] = useState<{ fuer: string; werte: Record<string, string> }>(
    { fuer: '', werte: {} });

  useEffect(() => {
    if (!schluessel) return;
    let weg = false;
    fetch('/api/echte-namen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: schluessel.split(','), event: event ?? undefined }),
    })
      .then((r) => r.json())
      .then((j) => { if (!weg) setNamen({ fuer: schluessel + '|' + (event ?? ''), werte: j?.namen ?? {} }); })
      .catch(() => {});
    return () => { weg = true; };
  }, [schluessel, event]);

  // Aeltere Antworten fuer andere Konten zaehlen nicht.
  return namen.fuer === schluessel + '|' + (event ?? '') ? namen.werte : {};
}
