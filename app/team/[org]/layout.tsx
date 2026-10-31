import type { Metadata } from 'next';
import { bereichsMeta } from '@/app/lib/bereichsmeta';
import { liesOrgs } from '@/lib/orgs';

/*
 * Titel der Team-Seite (die Seite selbst ist 'use client'): der Name der Organisation, sonst ein allgemeiner Titel.
 * Faellt die Org-Liste aus, bleibt der allgemeine Titel - nie ein Fehler.
 */
export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org } = await params;
  let name: string | null = null;
  try {
    name = (await liesOrgs()).find((o) => o.id === org.trim().toLowerCase())?.name ?? null;
  } catch { /* allgemeiner Titel */ }
  return bereichsMeta(
    name ? `${name} Team` : 'Team',
    name
      ? `${name} on CompHub: the full roster with photos and real tournament stats for every player.`
      : 'An esports team on CompHub: the full roster with photos and real tournament stats for every player.',
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
