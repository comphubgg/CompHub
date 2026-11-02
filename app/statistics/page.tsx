import type { Metadata } from 'next';
import StatistikSeite from './StatistikSeite';

/*
 * Kopfdaten fuer Spielerprofile (/statistics?spieler=<epicId>): Tab-Titel und
 * Linkvorschau (Open Graph, X) zeigen Name und - falls vorhanden - das Foto
 * des Spielers statt des allgemeinen Statistik-Titels.
 *
 * Die eigentliche Seite (StatistikSeite) ist 'use client' und kann das nicht.
 * Der Name kommt aus derselben Quelle wie im Profil (/api/szene-stats?spieler=),
 * wird fuenf Minuten zwischengespeichert und darf hoechstens ~3 Sekunden
 * dauern. Klappt das nicht oder fehlt der Parameter, bleibt es bei den
 * Angaben des Layouts - es wird nichts erfunden und nie ein Fehler geworfen.
 */

const WURZEL = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
  .trim().replace(/\/+$/, '');

interface SpielerKopf { epicId: string; name?: string; anzeige?: string; bild?: string }

async function ladeSpieler(id: string): Promise<SpielerKopf | null> {
  try {
    // Ueber die Suche nach der Id: sie kennt auch den Namen, unter dem eine Org den Spieler fuehrt (2.11.2026, Archivname kann veraltet sein).
    const r = await fetch(`${WURZEL}/api/szene-stats?ansicht=suche&q=${encodeURIComponent(id)}`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const s = (Array.isArray(d?.spieler) ? d.spieler[0] : d?.spieler) as SpielerKopf | undefined;
    if (!s || s.epicId?.toLowerCase() !== id.toLowerCase()) return null;
    const anzeige = (s.anzeige || s.name || '').trim();
    return anzeige ? s : null;
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> },
): Promise<Metadata> {
  try {
    const roh = (await searchParams)?.spieler;
    const id = (Array.isArray(roh) ? roh[0] : roh)?.trim();
    if (!id || !/^[0-9a-f]{32}$/i.test(id)) return {};
    const s = await ladeSpieler(id);
    if (!s) return {};
    const name = (s.anzeige || s.name || '').replace(/\s+/g, ' ').trim();
    const titel = `${name} - Player Profile`;
    const beschreibung = `Stats, results and career of ${name} in competitive Fortnite on CompHub.`;

    const bild = s.bild && /^(https?:\/\/|\/)/.test(s.bild) ? s.bild : null;
    const bilder = bild ? [bild] : ['/logos/CompHub-Logo.png'];

    return {
      title: titel,
      description: beschreibung,
      alternates: { canonical: `/statistics?spieler=${encodeURIComponent(id)}` },
      openGraph: {
        type: 'profile',
        siteName: 'CompHub',
        title: `${titel} | CompHub`,
        description: beschreibung,
        images: bilder.map((url) => ({ url })),
      },
      twitter: {
        card: bild ? 'summary_large_image' : 'summary',
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

export default function Page() {
  return <StatistikSeite />;
}
