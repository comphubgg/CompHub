import fs from 'fs';
import path from 'path';
import { liesJson } from '@/lib/ablage';
import { spielerbildGross } from '@/lib/spielerbildKlein';

/*
 * Das Foto zu einem Zugang - fuer das grosse VIP-Fenster (app/components/VipFenster: Willkommen beim ersten Anmelden auf einem Geraet,
 * Twitch-Pruefung). Der Betreiber (2.11.2026): "mit seinem Profilbild ... fuer den VIP-Streamer koennte ich eins machen".
 *
 * Reihenfolge:
 *   1. public/vip-bilder/<zugang>.jpg - von Hand abgelegt (Twitch-Profilbild des Streamers, X-Bild des Betreibers).
 *   2. public/spielerbilder/<zugang>.jpg - der Zugangsname ist zugleich der Spielername (gripey, faxuty).
 *   3. Das Spielerfoto zum Epic-Konto des Zugangs (spielerbilder.json) - so bekommt ein Pro sein Foto von selbst.
 * Ohne alles: null, das Fenster zeigt dann das Logo.
 */

const OEFFENTLICH = path.join(process.cwd(), 'public');
const bekannt = new Map<string, boolean>();

function daLiegt(rel: string): boolean {
  const k = bekannt.get(rel);
  if (k !== undefined) return k;
  const v = fs.existsSync(path.join(OEFFENTLICH, rel));
  bekannt.set(rel, v);
  return v;
}

export async function vipBild(zugang: string, epicId?: string | null): Promise<string | null> {
  const n = zugang.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
  if (!n) return null;
  if (daLiegt(`vip-bilder/${n}.jpg`)) return `/vip-bilder/${n}.jpg`;
  if (daLiegt(`spielerbilder/${n}.jpg`)) return `/spielerbilder/${n}.jpg`;
  if (epicId) {
    const liste = await liesJson<Array<{ epicId?: string; datei?: string; echtesFoto?: boolean }>>('spielerbilder.json', []).catch(() => []);
    const e = liste.find((x) => x.epicId === epicId && x.datei && x.echtesFoto);
    if (e?.datei) return spielerbildGross(e.datei);
  }
  return null;
}

/** "gripey" -> "Gripey", "GulliWullii" bleibt, "admin-juanito" -> "Juanito". */
export function anzeigeName(zugang: string): string {
  const roh = zugang.replace(/^admin-/, '').trim();
  return /[A-Z]/.test(roh) ? roh : roh.charAt(0).toUpperCase() + roh.slice(1);
}
