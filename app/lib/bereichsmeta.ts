import type { Metadata } from 'next';

/*
 * Kopfdaten fuer einen Bereich der Seite.
 *
 * Die Bereichsseiten sind 'use client' und koennen keine Metadaten selbst
 * ausgeben; dafuer gibt es je Bereich ein winziges layout.tsx, das dieses
 * Ergebnis exportiert.
 *
 * Absichtlich KEIN eigener canonical-Wert: der Rahmen (app/layout.tsx) setzt
 * './', und das wird je Aufruf zur Adresse genau dieser Seite aufgeloest.
 * Ein fester Wert wie '/events' wuerde sonst auch /events/<id> erben.
 *
 * Open Graph und Twitter ersetzen die Angaben des Rahmens ganz, nicht
 * stueckweise - darum stehen Seitenname und Bild hier noch einmal.
 */
export function bereichsMeta(titel: string, beschreibung: string): Metadata {
  return {
    title: titel,
    description: beschreibung,
    openGraph: {
      type: 'website',
      siteName: 'CompHub',
      title: `${titel} | CompHub`,
      description: beschreibung,
      images: [{ url: '/logos/CompHub-Logo.png', width: 1200, height: 1200 }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@CompHub_gg',
      title: `${titel} | CompHub`,
      description: beschreibung,
      images: ['/logos/CompHub-Logo.png'],
    },
  };
}
