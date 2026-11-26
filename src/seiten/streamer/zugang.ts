import type { Wer } from '../../teile/Anmeldung';

/*
 * Wer ist VIP? /api/auth/check-admin (main) liefert isAdmin, rolle ('admin' | 'manager' | 'pro') und rechte. Ein VIP-Zugang (Schluessel) oder ein
 * VIP-Konto bringt seine Rechte mit (lib/rechte wirksameRechte, VIP_BEREICHE: mindestens die Overlays) - ein kostenloses Konto hat keine.
 */
export function istVip(wer: Wer | null | undefined): boolean {
  if (!wer?.userName) return false;
  if (wer.isAdmin) return true;
  if (wer.rolle && ['admin', 'manager', 'pro', 'vip'].includes(wer.rolle.toLowerCase())) return true;
  return (wer.rechte ?? []).length > 0;
}

export const SEITE = 'https://www.thecomphub.com';
