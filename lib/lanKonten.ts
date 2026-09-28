import { liesJson } from '@/lib/ablage';

/*
 * LAN-Konten und die echten Konten dahinter.
 *
 * An einem LAN spielen die Profis auf Turnierkonten ("[FNCSGC26] BIG Vico").
 * scripts/lan-konten-zuordnen.mjs ordnet sie im stuendlichen Lauf den
 * echten Konten zu (Name ohne Vorsatz, Gegenprobe ueber die Team-Elims) und
 * legt das Ergebnis ans Release. Hier wird es gelesen.
 *
 * Der Betreiber (28.9.2026): die Namen in der Bestenliste bleiben, wie Epic
 * sie fuehrt - Flagge, X-Konto und Statistik kommen vom echten Konto.
 */

export interface LanKonto {
  /** Das echte Konto des Spielers. */
  echt: string;
  /** Der Name des Turnierkontos, wie Epic ihn fuehrt. */
  lan: string;
  /** Der Name des echten Kontos an diesem Tag. */
  name: string;
  fenster: string[];
}

let gelesen: { zeit: number; wert: Promise<Record<string, LanKonto>> } | null = null;

/** Alle Zuordnungen - fuer ein paar Minuten je Instanz gemerkt. */
export function liesLanKonten(): Promise<Record<string, LanKonto>> {
  if (gelesen && Date.now() - gelesen.zeit < 5 * 60_000) return gelesen.wert;
  const wert = liesJson<Record<string, LanKonto>>('lan-konten.json', {}).catch(() => ({}));
  gelesen = { zeit: Date.now(), wert };
  return wert;
}

/** Das echte Konto zu einer Id - oder die Id selbst, wenn sie keins ist. */
export async function echtesKonto(id: string): Promise<string> {
  return (await liesLanKonten())[id]?.echt ?? id;
}
