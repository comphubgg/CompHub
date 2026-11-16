import { redirect } from 'next/navigation';

/*
 * Kurze Adresse fuer ein Profil: /player/<Konto-Id> (Betreiber, 16.11.2026: "die Profil-URL soll teilbar sein").
 * Das Profil selbst bleibt eines: /statistics?spieler=<Konto-Id> - fuer Pros wie fuer jedes andere Konto aus unseren Bestenlisten.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const roh = decodeURIComponent((await params).id ?? '').trim();
  const id = roh.replace(/-/g, '').toLowerCase();
  redirect(`/statistics?spieler=${encodeURIComponent(/^[0-9a-f]{32}$/.test(id) ? id : roh)}`);
}
