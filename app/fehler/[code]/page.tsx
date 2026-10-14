import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import FehlerSeite from '@/app/components/FehlerSeite';
import { FEHLER } from '@/app/lib/fehler';

/*
 * /fehler/<Code> - die Fehlerseite fuer jeden Code (400, 401, 403, 404, 405, 408, 410, 413, 429, 500, 502, 503, 504).
 * Next zeigt von selbst nur 404 (not-found), 500 (error) sowie 401/403 (unauthorized, forbidden); diese Adresse ist fuer alle anderen Faelle da
 * - etwa wenn eine Weiterleitung oder ein Dienst einen Besucher mit einem Code hierher schickt.
 */

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function FehlerCode({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const n = Number(code);
  if (!FEHLER[n]) notFound();
  return <FehlerSeite code={n} />;
}
