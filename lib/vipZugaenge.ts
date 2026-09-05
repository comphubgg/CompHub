import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from './datenOrt';

/*
 * Die selbst vergebenen Zugaenge - Name und Schluessel statt Adresse und
 * Passwort.
 *
 * Der Betreiber wollte diesen Konten dieselben Rollen geben koennen wie
 * gewoehnlichen: Admin, Manager mit angehakten Bereichen, Pro, VIP auf
 * Zeit. Die Verwaltung schrieb das auch schon in die Datei - nur las es
 * niemand wieder. Wer sich mit einem Schluessel anmeldete, war deshalb
 * immer nur "VIP", ganz gleich, was danebenstand.
 *
 * Diese Datei ist die eine Stelle, an der nachgesehen wird.
 */

const DATEI = path.join(DATEN_ORT, 'vip-users.json');

export interface Zugang {
  username: string;
  accessKey: string;
  status: 'active' | 'disabled';
  createdAt: string;
  rolle?: 'admin' | 'manager' | 'pro';
  rechte?: string[];
  epicId?: string;
  vipBis?: number;
  /*
   * Darf dieser VIP seinen Schluessel selbst aendern?
   *
   * Standardmaessig nicht - ein Zugang ist etwas, das der Betreiber vergibt.
   * Wer aber seinen Schluessel oeffentlich vertippt hat oder ihn regelmaessig
   * wechseln will, muss dafuer nicht jedes Mal fragen. Der Betreiber hakt
   * das je Zugang einzeln an.
   */
  darfSchluessel?: boolean;
}

export async function alleZugaenge(): Promise<Zugang[]> {
  try {
    const roh = JSON.parse(await fs.readFile(DATEI, 'utf8')) as { users?: Zugang[] };
    return Array.isArray(roh.users) ? roh.users : [];
  } catch {
    return [];
  }
}

/** Der Zugang zu diesem Anmeldenamen - oder nichts. */
export async function zugangNach(name: string): Promise<Zugang | null> {
  const gesucht = name.trim().toLowerCase();
  if (!gesucht) return null;
  const alle = await alleZugaenge();
  return alle.find((z) => z.username.toLowerCase() === gesucht) ?? null;
}

/**
 * Was dieser Zugang darf.
 *
 * Ein stillgelegter Zugang darf nichts - auch dann nicht, wenn sein Cookie
 * noch gueltig ist. Sonst bliebe eine Sperre bis zu dreissig Tage wirkungslos.
 */
export function rechteVon(z: Zugang | null): {
  gueltig: boolean;
  rolle: 'admin' | 'manager' | 'pro' | null;
  rechte: string[];
  vip: boolean;
  epicId: string | null;
} {
  if (!z || z.status !== 'active') {
    return { gueltig: false, rolle: null, rechte: [], vip: false, epicId: null };
  }
  /*
   * Ein Zugangskonto ist seinem Zweck nach VIP. Eine Frist schraenkt das
   * zusaetzlich ein; 0 heisst "ohne Ende".
   *
   * Wer ueber VIP steht - Pro, Manager, Admin -, behaelt das Recht auch ohne
   * Frist: die Stufen liegen uebereinander, und eine abgelaufene VIP-Frist
   * darf einem Pro nicht die Streamer-Ordner nehmen, die ein VIP hat.
   */
  const ueberVip = z.rolle === 'admin' || z.rolle === 'manager' || z.rolle === 'pro';
  const vip = ueberVip
    || z.vipBis === undefined || z.vipBis === 0 || z.vipBis > Date.now();
  return {
    gueltig: true,
    rolle: z.rolle ?? null,
    rechte: z.rechte ?? [],
    vip,
    epicId: z.epicId ?? null,
  };
}
