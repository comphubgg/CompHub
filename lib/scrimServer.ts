/*
 * Die Scrim-Server rechts am Rand der Scrims-Seite.
 *
 * Mit den Einladungen, die der Betreiber genannt hat. Die Region steht nur
 * dort, wo sie belegt ist: bei Noble und Manu im Vorbild (Fortnite
 * Tracker), bei Vital im Namen des Servers selbst ("Vital Scrims NA
 * Central", laut Discord), bei Poyo vom Betreiber ("Poyo No Zone Rules
 * sind auch Europa").
 *
 * Eigene Datei, weil zwei Seiten sie brauchen: die Seite zum Anzeigen und
 * /api/scrims/einladungen, das bei Discord die Mitgliederzahlen holt - und
 * zwar nur fuer genau diese Einladungen, nie fuer beliebige.
 */

export interface ScrimServer {
  name: string;
  region: string;
  /** Der Code der Discord-Einladung - discord.com/invite/<code>. */
  code: string;
  logo: string;
}

export const SCRIM_SERVER: ScrimServer[] = [
  { name: 'Noble Scrims', region: 'Europe', code: 'eu', logo: '/scrims/noble-gelb.jpg' },
  { name: 'Manu Scrims', region: 'NA Central', code: 'manua12', logo: '/scrims/manu.jpg' },
  { name: 'Vital Scrims', region: 'NA Central', code: 'vitalscrims', logo: '/scrims/vital-gruen.jpg' },
  { name: 'Poyo No Zone Rules', region: 'Europe', code: 'nzr', logo: '/scrims/poyo-nzr.jpg' },
];

export function einladungVon(code: string): string {
  return `https://discord.com/invite/${code}`;
}
