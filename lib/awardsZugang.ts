import { cookies } from 'next/headers';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { kontoAus, nachId } from '@/lib/konten';
import { GAST_COOKIE, gastAus } from '@/lib/epicGast';
import { OEFFENTLICH } from '@/lib/awards';

/** Darf diese Anfrage die Awards-Seiten sehen? Solange sie nicht oeffentlich sind: nur der Admin. */
export async function awardsSichtbar(): Promise<boolean> {
  return OEFFENTLICH || istAdminAnfrage();
}

/*
 * Wer abstimmt: nur ein von Epic selbst bestaetigtes Konto (der bestehende "Mit Epic Games verbinden"-Weg, app/api/auth/epic). Entweder ein
 * CompHub-Konto mit verifizierter Epic-Id oder der signierte Gast-Cookie (lib/epicGast). Gezaehlt wird je Epic-Konto, nicht je CompHub-Konto:
 * zwei CompHub-Konten mit derselben Epic-Id haben zusammen eine Stimme. Eine von Hand zugewiesene, nicht verifizierte Id zaehlt nicht.
 */
export async function waehlerEpicId(): Promise<string> {
  const laden = await cookies();
  const kid = kontoAus(laden.get('streamer_dashboard_konto')?.value);
  const konto = kid ? await nachId(kid) : null;
  if (konto && !konto.gesperrt && konto.epicVerifiziert && konto.epicId && /^[0-9a-f]{32}$/i.test(konto.epicId.replace(/-/g, ''))) {
    return konto.epicId.replace(/-/g, '').toLowerCase();
  }
  return gastAus(laden.get(GAST_COOKIE)?.value);
}
