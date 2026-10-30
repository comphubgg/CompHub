import crypto from 'crypto';
import { liesJson, schreibJson } from '@/lib/ablage';
import { holeDienst } from '@/lib/dienstZugaenge';

/*
 * TikToks aus den Clips eines VIP-Streamers (Aufgabe 167; Betreiber, 27.10.2026: "Twitch-Kanal verknuepfen - nur mit Freigabe des Admins - und der
 * Bot schneidet aus Livestream/Clips TikToks im Stil des Streamers: Facecam oben, Text, Emojis"; erster Streamer: gripey).
 *
 * Der Weg ist Twitchs offizieller: "Get Clips Download" (helix/clips/downloads) gibt die Videodatei eines Clips nur mit einem Token des Kanals
 * selbst (Recht channel:manage:clips). Deshalb:
 *   1. Der Admin erzeugt in /admin/tiktok einen Link fuer den Streamer - das ist seine Freigabe.
 *   2. Der Streamer oeffnet ihn, stimmt bei Twitch zu (app/api/tiktok-clips/verbinden), sein Token liegt hier.
 *   3. Taeglich holt scripts/tiktok-clips.mjs die besten Clips der letzten 24 Stunden und schneidet sie hochkant (Facecam oben, Spiel unten, Titel).
 */

export const CLIPS_SCOPES = 'channel:manage:clips';
const DATEI = 'tiktok-clips/streamer.json';

/** Wo die Facecam im Stream sitzt - fertige Vorlagen statt Regler (Betreiber: "weniger Optionen, fertige Vorlagen"). */
export type FacecamEcke = 'oben-links' | 'oben-rechts' | 'unten-links' | 'unten-rechts' | 'keine';

export interface ClipStreamer {
  login: string;
  id: string;
  name: string;
  access: string;
  refresh: string;
  bis: number;
  facecam: FacecamEcke;
  verbunden: number;
}

export interface ClipEinladung { code: string; erstellt: number; fuer: string }

interface Ablage { streamer: Record<string, ClipStreamer>; einladungen: Record<string, ClipEinladung> }

export const liesAblage = () => liesJson<Ablage>(DATEI, { streamer: {}, einladungen: {} });
const schreibe = (a: Ablage) => schreibJson(DATEI, a);

/** Ein Link fuer einen Streamer - vierzehn Tage gueltig, einmal benutzbar. */
export async function neueEinladung(fuer: string): Promise<ClipEinladung> {
  const a = await liesAblage();
  const e: ClipEinladung = { code: crypto.randomBytes(12).toString('base64url'), erstellt: Date.now(), fuer: fuer.trim().toLowerCase().slice(0, 30) };
  a.einladungen[e.code] = e;
  await schreibe(a);
  return e;
}

export async function einladungGueltig(code: string): Promise<ClipEinladung | null> {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(code)) return null;
  const e = (await liesAblage()).einladungen[code];
  return e && Date.now() - e.erstellt < 14 * 864e5 ? e : null;
}

/** Nach der Zustimmung bei Twitch: den Streamer ablegen, die Einladung verbrauchen. */
export async function streamerSpeichern(code: string, s: Omit<ClipStreamer, 'facecam' | 'verbunden'>): Promise<void> {
  const a = await liesAblage();
  const alt = a.streamer[s.login.toLowerCase()];
  a.streamer[s.login.toLowerCase()] = { ...s, facecam: alt?.facecam ?? 'unten-rechts', verbunden: Date.now() };
  delete a.einladungen[code];
  await schreibe(a);
}

export async function facecamSetzen(login: string, ecke: FacecamEcke): Promise<boolean> {
  const a = await liesAblage();
  const s = a.streamer[login.toLowerCase()];
  if (!s) return false;
  s.facecam = ecke;
  await schreibe(a);
  return true;
}

export async function streamerTrennen(login: string): Promise<void> {
  const a = await liesAblage();
  delete a.streamer[login.toLowerCase()];
  await schreibe(a);
}
