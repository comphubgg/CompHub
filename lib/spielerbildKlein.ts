import stand from './fotoStand.json';
import { uploadFrei, BESTAETIGTE_UPLOADS } from './fotoSperre.mjs';

/*
 * Die kleine Fassung eines Spielerfotos (scripts/spielerbilder-klein.mjs, 480 Pixel breit, WebP).
 *
 * Listen und Karten zeigen ein Foto hoechstens 300 Pixel breit; das Original (bis 1600 x 2300 Pixel,
 * 600 KB) zog bei 300 Spielern 25 MB und liess die Seite endlos laden (Betreiber, 11.10.2026).
 * Nur mitgelieferte JPG/PNG-Fotos haben eine kleine Fassung; hochgeladene (spielerfotos/...webp)
 * sind schon klein und bleiben, wie sie sind.
 *
 * Jede Adresse traegt das Kennzeichen des Foto-Inhalts ("?v=", lib/fotoStand.json): Browser behalten Fotos vier Stunden, und ein neu
 * zugeschnittenes Foto unter altem Namen kaeme sonst erst Stunden spaeter an (31.10.2026).
 */
const STAND = stand as Record<string, string>;
const mitStand = (url: string, datei: string) => (STAND[datei] ? `${url}?v=${STAND[datei]}` : url);

/*
 * Welche Fotos die Seite zeigen darf (17.11.2026, siehe lib/fotoSperre.mjs): alle alten Spielerfotos sind entfernt, an ihrer Stelle steht der
 * Platzhalter. Frei ist nur, was heute mitgeliefert wird (public/spielerbilder - lib/fotoStand.json wird vor jedem Bau aus diesem Ordner
 * geschrieben) oder nach dem Neuanfang hochgeladen wurde. Ein neues Foto erscheint damit von selbst wieder; ein Eintrag in spielerbilder.json,
 * dessen Datei es nicht mehr gibt, zeigt den Platzhalter statt eines kaputten Bildes.
 */

/** Der Platzhalter als Bilddatei - fuer Stellen, die eine Adresse brauchen (Overlays, Leinwand, alte Adressen). Gleich wie app/components/SpielerPlatzhalter. */
export const PLATZHALTER_FOTO = '/spielerbild-platzhalter.svg';

const KLEIN_NAMEN = new Set(Object.keys(STAND).map((d) => d.replace(/\.(jpe?g|png|webp)$/i, '')));

/** Darf dieses Foto (Dateiname aus spielerbilder.json, "x.jpg" oder "spielerfotos/x.webp") gezeigt werden? */
export function fotoFrei(datei: string | null | undefined): boolean {
  if (!datei) return false;
  const d = String(datei).replace(/^spielerfotos\//, '');
  if (STAND[d]) return true;
  return uploadFrei(d) === true;
}

/** Eine fertige Adresse eines Spielerfotos: frei? Alles, was kein Spielerfoto ist (Logos, /orgs/...), bleibt frei. */
export function adresseFrei(url: string | null | undefined): boolean {
  if (!url) return false;
  const m = /^(?:https?:\/\/[^/]+)?\/spielerbilder(-klein)?\/([^?#]+)/.exec(String(url));
  if (!m) return true;
  let datei = m[2];
  try { datei = decodeURIComponent(datei); } catch { /* bleibt */ }
  if (m[1]) return KLEIN_NAMEN.has(datei.replace(/\.webp$/i, '')) || uploadFrei(datei) === true;
  return fotoFrei(datei);
}

/** Die Adresse, wenn das Foto frei ist - sonst null (dann zeigt die Seite ihren Platzhalter). */
export function freieAdresse(url: string | null | undefined): string | null {
  return url && adresseFrei(url) ? standAnhaengen(String(url)) : null;
}

/**
 * Abgelegte JSON-Texte (fertige Antworten, Profile, Orgs, Galerie ...) tragen Foto-Adressen fest in sich. Jede ganze Zeichenkette, die eine
 * nicht freie Spielerfoto-Adresse ist, wird zu null - die Seite zeigt dort ihren Platzhalter. Freie Adressen bekommen ihr Kennzeichen (?v=).
 */
export function fotosImJsonSperren(text: string): string {
  if (!text.includes('/spielerbilder')) return text;
  return text.replace(/"((?:https?:\/\/[^"/]+)?\/spielerbilder(?:-klein)?\/[^"\\]*)"/g,
    (_m, url: string) => (adresseFrei(url) ? JSON.stringify(url.includes('?') || /^https?:/.test(url) ? url : standAnhaengen(url)) : 'null'));
}

/**
 * spielerbilder.json ohne die gesperrten Fotos: ein Eintrag, dessen Datei nicht frei ist, verliert Datei und "echtesFoto" - fuer jede
 * lesende Stelle (lib/ablage liesJson und die Stellen, die die Datei selbst lesen). Geschrieben wird so nie: die Zuordnung bleibt in der Ablage.
 */
export function spielerbilderFrei<T>(liste: T): T {
  const eigene = BESTAETIGTE_UPLOADS as Record<string, string>;
  const frei = (e: unknown) => {
    const x = e as { datei?: unknown; echtesFoto?: unknown; epicId?: unknown } | null;
    if (!x || typeof x !== 'object') return e;
    // Vom Spieler selbst hochgeladen: dieses Foto gilt, auch wenn die Zuordnung noch auf die alte Datei zeigt.
    const eigenes = x.epicId ? eigene[String(x.epicId).toLowerCase()] : undefined;
    if (eigenes && !(x.datei && fotoFrei(String(x.datei)))) return { ...(x as Record<string, unknown>), datei: eigenes, echtesFoto: true };
    if (!x.datei || fotoFrei(String(x.datei))) return e;
    const rest = { ...(x as Record<string, unknown>) };
    delete rest.datei;
    rest.echtesFoto = false;
    return rest;
  };
  if (Array.isArray(liste)) return liste.map(frei) as T;
  if (liste && typeof liste === 'object') {
    return Object.fromEntries(Object.entries(liste as Record<string, unknown>).map(([k, v]) => [k, frei(v)])) as T;
  }
  return liste;
}

export function spielerbildKlein(datei: string): string {
  if (!fotoFrei(datei)) return PLATZHALTER_FOTO;
  const m = /^([A-Za-z0-9._-]+)\.(?:jpe?g|png)$/i.exec(datei);
  return m
    ? mitStand(`/spielerbilder-klein/${encodeURIComponent(m[1])}.webp`, datei)
    : spielerbildGross(datei);
}

/** Das Original eines Spielerfotos (Profilseiten, Plakate) - mit demselben Kennzeichen. */
export function spielerbildGross(datei: string): string {
  if (!fotoFrei(datei)) return PLATZHALTER_FOTO;
  return mitStand(`/spielerbilder/${encodeURIComponent(datei)}`, datei);
}

/** Das Kennzeichen zu einer fertigen Foto-Adresse nachtragen (aeltere, abgelegte Antworten). */
export function standAnhaengen(url: string): string {
  const m = /^\/spielerbilder(-klein)?\/([^?]+)$/.exec(url);
  if (!m) return url;
  let datei = m[2];
  try { datei = decodeURIComponent(datei); } catch { /* bleibt */ }
  if (m[1]) {
    const name = datei.replace(/\.webp$/i, '');
    const original = Object.keys(STAND).find((d) => d.replace(/\.(jpe?g|png|webp)$/i, '') === name);
    return original ? mitStand(url, original) : url;
  }
  return mitStand(url, datei);
}
