import { liesPros, wer } from '@/lib/pov';
import { ADMIN_LINK, schluesselLesen } from '@/lib/povRelay';

/*
 * Wer ein POV sehen darf - gemeinsam fuer die Stueck-Abfrage (/api/pov/segment) und den Strom (/api/pov/strom).
 *
 * Gesehen werden darf es vom Profi selbst, vom Admin und von jedem, den der Profi freigegeben hat - angemeldet
 * (Cookie) oder ueber einen Link-Schluessel (fuer OBS). Ob jemand noch freigegeben ist, wird bei jedem Aufruf
 * gegen die Freigabeliste geprueft.
 */

export interface Zuschauer { idents: string[]; rolle: string | null; ueberLink: boolean }

async function darfZusehen(proIdent: string, idents: string[], rolle: string | null): Promise<boolean> {
  if (rolle === 'admin' || idents.includes(ADMIN_LINK)) return true;
  if (idents.includes(proIdent)) return true;
  const pro = (await liesPros())[proIdent];
  return !!pro && pro.erlaubt.some((e) => idents.includes(e));
}

export async function pruefeZuschauer(
  request: Request, proIdent: string,
): Promise<{ ok: true; z: Zuschauer } | { ok: false; status: number; error: string }> {
  const p = new URL(request.url).searchParams;
  let idents: string[] = [];
  let rolle: string | null = null;
  const schluessel = p.get('s');
  if (schluessel) {
    const k = schluesselLesen(schluessel);
    if (!k || k.profi !== proIdent) return { ok: false, status: 403, error: 'Link ungültig.' };
    idents = [k.zuschauer];
  } else {
    const ich = await wer();
    idents = ich.idents; rolle = ich.rolle;
  }
  if (!idents.length) return { ok: false, status: 401, error: 'Nicht angemeldet.' };
  if (!await darfZusehen(proIdent, idents, rolle)) return { ok: false, status: 403, error: 'Nicht freigegeben.' };
  return { ok: true, z: { idents, rolle, ueberLink: Boolean(schluessel) } };
}
