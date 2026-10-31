import type { Metadata } from 'next';
import { GLOBALS_CUP_ALIAS, GLOBALS_CUP_ID } from '@/lib/globalsCup';
import { REGION_TEXT } from '@/lib/epicCups';

/*
 * Kopfdaten je Cup: Tab-Titel und Linkvorschau (Open Graph, X) zeigen den
 * echten Namen des Cups statt des allgemeinen Seitentitels.
 *
 * Die Seite selbst ist 'use client' und kann das nicht; darum dieses Layout.
 * Der Name kommt aus derselben Quelle wie auf der Seite (/api/cup-catalog),
 * wird fuenf Minuten zwischengespeichert und darf hoechstens ~3 Sekunden
 * dauern. Klappt das nicht, bleibt es beim allgemeinen Titel - es wird
 * nichts erfunden und nie ein Fehler geworfen.
 */

const WURZEL = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
  .trim().replace(/\/+$/, '');

interface CupKopf {
  id: string; titel?: string; untertitel?: string; beschreibung?: string; bild?: string;
  regionen?: Record<string, Array<{ begin?: number }>>;
}

async function ladeCup(id: string): Promise<CupKopf | null> {
  try {
    const r = await fetch(`${WURZEL}/api/cup-catalog?modus=alle`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const gesucht = id === GLOBALS_CUP_ALIAS ? GLOBALS_CUP_ID : id;
    const c = (d?.cups as CupKopf[] | undefined)?.find((x) => x.id === gesucht);
    return c && typeof c.titel === 'string' && c.titel.trim() ? c : null;
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  try {
    const { id } = await params;
    const c = await ladeCup(id);
    if (!c) return {};
    const titel = c.titel!.replace(/\s+/g, ' ').trim();

    const regionen = Object.keys(c.regionen ?? {}).map((r) => REGION_TEXT[r] ?? r);
    const starts = Object.values(c.regionen ?? {}).flat()
      .map((w) => w.begin).filter((b): b is number => typeof b === 'number' && b > 0);
    const datum = starts.length
      ? new Date(Math.min(...starts)).toLocaleDateString('en-GB',
        { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      : null;

    const teile = [datum, regionen.length ? regionen.join(', ') : null].filter(Boolean);
    const beschreibung = `Results, leaderboard and stats for ${titel}`
      + (teile.length ? ` (${teile.join(' · ')})` : '') + ' on CompHub.';

    const bild = c.bild && /^(https?:\/\/|\/)/.test(c.bild) ? c.bild : null;
    const bilder = bild ? [bild] : ['/logos/CompHub-Logo.png'];

    return {
      title: titel,
      description: beschreibung,
      alternates: { canonical: `/events/${encodeURIComponent(id)}` },
      openGraph: {
        type: 'website',
        siteName: 'CompHub',
        title: `${titel} | CompHub`,
        description: beschreibung,
        images: bilder.map((url) => ({ url })),
      },
      twitter: {
        card: 'summary_large_image',
        site: '@CompHub_gg',
        title: `${titel} | CompHub`,
        description: beschreibung,
        images: bilder,
      },
    };
  } catch {
    return {};
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
