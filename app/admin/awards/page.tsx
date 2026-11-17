import type { Metadata } from 'next';
import NurAdminSeite from '@/app/components/NurAdminSeite';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import AwardsEditor from './AwardsEditor';

/*
 * /admin/awards - der Editor der CompHub Awards 2026 (lib/awards). Auf dem Server geprueft: wer nicht Admin ist (auch ein Manager), bekommt die
 * Sperrseite, der Editor erreicht den Browser gar nicht. Ohne Anmeldung leitet die Middleware ohnehin zur Anmeldung.
 */

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Awards', robots: { index: false, follow: false } };

export default async function AwardsAdmin() {
  if (!(await istAdminAnfrage())) return <NurAdminSeite />;
  return <AwardsEditor />;
}
