import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

/*
 * Die eigene, von Suchmaschinen auffindbare Profilseite eines Spielers:
 * /player/<Konto-Id>.
 *
 * Warum es diese Seite gibt (SEO, 23.11.2026): das eigentliche Profil lebt
 * unter /statistics?spieler=<id>. Das ist eine 'use client'-Seite mit
 * Abfrageparameter; Google fasst alle diese Adressen als eine zusammen
 * (Kanonisch /statistics) und nimmt keine davon in den Index auf - genau das
 * fuellte in der Search Console die Liste "nicht indexiert / Duplikat". Diese
 * Seite dagegen ist eine echte Adresse mit serverseitig gezeichnetem Text:
 * Name, Herkunft, Team und die wichtigsten Karrierezahlen stehen im Quelltext,
 * damit "<Name> earnings" in der Suche einen Treffer findet. Ein klarer Link
 * fuehrt von hier ins volle, interaktive Profil.
 *
 * Robustheit geht vor Vollstaendigkeit: die Seite wirft nie einen 5xx. Jeder
 * Abruf steht in try/catch; faellt die Schnittstelle aus oder kommen keine
 * Daten, bleibt eine gueltige 200-Seite mit Name/Id und dem Link. notFound()
 * nur bei einer offensichtlich falschen Id (keine 32-stellige Hex-Kennung).
 */

export const revalidate = 3600;

const WURZEL = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
  .trim().replace(/\/+$/, '');

/** Aus "AA-BB--cc" wird "aabbcc"; eine Konto-Id ist genau 32 Hex-Zeichen. */
function saeubereId(roh: string): string | null {
  const id = decodeURIComponent(roh ?? '').trim().replace(/-/g, '').toLowerCase();
  return /^[0-9a-f]{32}$/.test(id) ? id : null;
}

/* Welche Flaggen wirklich als Datei vorliegen (public/flags/*.png) - fehlt eine, steht der Globus statt eines kaputten Bildes (siehe components/TeamFlagge). */
const FLAGGEN = new Set([
  'ae', 'al', 'ar', 'at', 'au', 'ba', 'be', 'bg', 'bh', 'br', 'by', 'ca', 'ch',
  'cn', 'co', 'cz', 'de', 'dk', 'ee', 'eg', 'es', 'fi', 'fr', 'gb', 'gr', 'hr',
  'hu', 'ie', 'il', 'in', 'ir', 'is', 'it', 'jp', 'kr', 'kw', 'lb', 'lt', 'lv',
  'mc', 'md', 'mk', 'mx', 'ng', 'nl', 'no', 'nz', 'om', 'pe', 'pl', 'pt', 'ro',
  'rs', 'ru', 'sa', 'se', 'si', 'sk', 'sy', 'tr', 'ua', 'us', 've', 'ye',
]);
function flaggenPfad(land: string | null | undefined): string {
  const k = land && /^[A-Za-z]{2}$/.test(land) ? land.toLowerCase() : null;
  return k && FLAGGEN.has(k) ? `/flags/${k}.png` : '/flags/flag-GLOBE.png';
}
/** Der Klartextname eines Landes aus dem Kuerzel - "US" wird "United States". Scheitert das, bleibt das Kuerzel. */
function landName(land: string | null | undefined): string | null {
  if (!land || !/^[A-Za-z]{2}$/.test(land)) return null;
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(land.toUpperCase()) || land.toUpperCase();
  } catch {
    return land.toUpperCase();
  }
}

interface VerlaufZeile {
  event: string; windowId: string; season: string;
  werte?: { eliminations?: number; matchesPlayed?: number };
  datum?: number | null; nurEpic?: boolean; gesamt?: boolean;
  verdienst?: number | null; platz?: number | null; punkte?: number | null;
}
interface LanErgebnis { fenster?: string; name?: string; platz?: number; betrag?: number; season?: string; kennung?: string }
interface ProfilSpieler {
  epicId: string; name: string; anzeige?: string; land?: string | null; heimat?: string;
  bild?: string | null; events?: number; matches?: number; elims?: number; damage?: number;
  elimsProMatch?: number; damageProMatch?: number; nurEpic?: boolean;
}
interface Profil {
  success?: boolean;
  spieler?: ProfilSpieler | null;
  rang?: { global: number; globalVon: number; regional: number | null; regionalVon: number; region: string } | null;
  fncs?: { titel: number; saisons: Array<{ saison: string; platz: number }> } | null;
  lan?: LanErgebnis[];
  verlauf?: VerlaufZeile[];
  epicZeilen?: VerlaufZeile[];
}

/** Das volle Profil vom eigenen Endpunkt - nie werfend; faellt zu null, wenn nichts kommt. */
async function ladeProfil(id: string): Promise<Profil | null> {
  try {
    const r = await fetch(`${WURZEL}/api/szene-stats?spieler=${encodeURIComponent(id)}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    return await r.json() as Profil;
  } catch {
    return null;
  }
}

/** Ersatzname, wenn das Profil leer bleibt: der Name aus der Id-Suche (kennt auch Org-Namen). */
async function ladeName(id: string): Promise<string | null> {
  try {
    const r = await fetch(`${WURZEL}/api/szene-stats?ansicht=suche&q=${encodeURIComponent(id)}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(4000),
    });
    const d = r.ok ? await r.json() : null;
    const s = (Array.isArray(d?.spieler) ? d.spieler[0] : d?.spieler) as { epicId?: string; anzeige?: string; name?: string } | undefined;
    if (s && s.epicId?.toLowerCase() === id.toLowerCase()) {
      const n = (s.anzeige || s.name || '').replace(/\s+/g, ' ').trim();
      return n || null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Das Team/die Organisation dieses Kontos, best effort - ein Fehler hier laesst das Profil unberuehrt. */
async function ladeOrg(id: string): Promise<{ name: string; slug: string } | null> {
  try {
    const { liesOrgs, orgKennung } = await import('@/lib/orgs');
    for (const o of await liesOrgs()) {
      if ((o.spieler ?? []).some((s) => s.epicId && s.epicId.toLowerCase() === id)) {
        return { name: o.name, slug: orgKennung(o.name) };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function zahl(n: number): string {
  try { return new Intl.NumberFormat('en-GB').format(Math.round(n)); } catch { return String(Math.round(n)); }
}
function geld(n: number): string {
  return `$${zahl(n)}`;
}

/** Karrierepreisgeld aus Verlauf + LAN-Datei - dieselbe Rechnung wie im Profilkopf (StatistikSeite, careerTotal): jeder Posten genau einmal. */
function karrierePreisgeld(alle: VerlaufZeile[], lan: LanErgebnis[]): number {
  let summe = 0;
  for (const z of alle) if (typeof z.verdienst === 'number' && z.verdienst > 0) summe += z.verdienst;
  for (const l of lan) {
    if (!(typeof l.betrag === 'number' && l.betrag > 0)) continue;
    const kern = (l.fenster ?? '').split('_')[0];
    if (kern && alle.some((z) => (z.verdienst ?? 0) > 0 && z.windowId.split('_')[0] === kern)) continue;
    summe += l.betrag;
  }
  return summe;
}

/** LAN-Siege ohne die Globals, die schon als FNCS-Titel zaehlen - wie im Profilkopf. */
function lanSiege(lan: LanErgebnis[], fncs: Profil['fncs']): number {
  return lan.filter((l) => {
    if (l.platz !== 1) return false;
    const jahr = /global-championship-(\d{4})/.exec(l.kennung ?? '')?.[1];
    return !(jahr && (fncs?.saisons ?? []).some((f) => f.platz === 1 && f.saison === `GLOBALS ${jahr}`));
  }).length;
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  try {
    const id = saeubereId((await params).id);
    if (!id) return {};
    const profil = await ladeProfil(id);
    const sp = profil?.spieler ?? null;
    const name = ((sp?.anzeige || sp?.name) || (await ladeName(id)) || '').replace(/\s+/g, ' ').trim();
    if (!name) {
      // Kein Name auffindbar: trotzdem eine gueltige, selbst-kanonische Seite.
      return { alternates: { canonical: `/player/${id}` } };
    }

    const land = landName(sp?.land);
    const alle = [...(profil?.verlauf ?? []), ...(profil?.epicZeilen ?? [])];
    const preisgeld = karrierePreisgeld(alle, profil?.lan ?? []);
    const elims = sp?.elims ?? 0;
    const events = sp?.events ?? 0;

    const teile: string[] = [];
    if (preisgeld > 0) teile.push(`${geld(preisgeld)} earnings`);
    if (elims > 0) teile.push(`${zahl(elims)} eliminations`);
    if (events > 0) teile.push(`${zahl(events)} tournaments`);
    const zahlen = teile.length ? ` ${teile.join(', ')}.` : '';
    const ort = land ? ` from ${land}` : '';
    const beschreibung = `${name}${ort} — competitive Fortnite career stats on CompHub:${zahlen} FNCS and cup results, placements, eliminations, damage and prize money, updated after every tournament.`;

    // Der Rahmen (app/layout.tsx) haengt " | CompHub" an - hier nur der vordere Teil.
    const titel = `${name} — Fortnite Competitive Stats & Earnings`;
    const bild = sp?.bild && /^(https?:\/\/|\/)/.test(sp.bild) ? sp.bild : null;
    const bilder = bild ? [bild] : ['/logos/CompHub-Logo.png'];

    return {
      title: titel,
      description: beschreibung,
      alternates: { canonical: `/player/${id}` },
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

function Wert({ gross, klein }: { gross: string; klein: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-xl font-semibold tabular-nums">{gross}</div>
      <div className="mt-0.5 text-xs uppercase tracking-wide text-white/50">{klein}</div>
    </div>
  );
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = saeubereId((await params).id);
  // Nur eine offensichtlich falsche Id ist ein 404 - alles Weitere wird eine gueltige Seite.
  if (!id) notFound();

  const profil = await ladeProfil(id);
  const sp = profil?.spieler ?? null;
  const ersatzName = sp ? null : await ladeName(id);
  const org = await ladeOrg(id);

  const anzeige = ((sp?.anzeige || sp?.name) || ersatzName || id.slice(0, 8)).replace(/\s+/g, ' ').trim();
  const rohName = (sp?.name || '').replace(/\s+/g, ' ').trim();
  const zweitName = rohName && rohName.toLowerCase() !== anzeige.toLowerCase() ? rohName : null;
  const land = sp?.land ?? null;
  const landText = landName(land);
  const heimat = sp?.heimat || '';

  const alle = [...(profil?.verlauf ?? []), ...(profil?.epicZeilen ?? [])];
  const preisgeld = karrierePreisgeld(alle, profil?.lan ?? []);
  const titel = (profil?.fncs?.titel ?? 0) + lanSiege(profil?.lan ?? [], profil?.fncs);

  const plaetze = alle
    .filter((z) => !z.gesamt && typeof z.platz === 'number' && (z.platz ?? 0) > 0)
    .map((z) => z.platz as number);
  const bestePlatz = plaetze.length ? Math.min(...plaetze) : null;
  const siege = plaetze.filter((p) => p === 1).length;
  const top10 = plaetze.filter((p) => p <= 10).length;

  const letzte = alle
    .filter((z) => !z.gesamt && typeof z.platz === 'number' && (z.platz ?? 0) > 0)
    .sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0))
    .slice(0, 6);

  const fncsPlaetze = (profil?.fncs?.saisons ?? [])
    .filter((x) => x.platz > 0)
    .sort((a, b) => a.platz - b.platz)
    .slice(0, 8);

  const profilLink = `/statistics?spieler=${encodeURIComponent(id)}`;

  // Strukturierte Daten fuer Google: eine Profilseite ueber eine Person. Nur Belegtes, nichts Erfundenes.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    dateModified: new Date().toISOString(),
    mainEntity: {
      '@type': 'Person',
      name: anzeige,
      ...(zweitName ? { alternateName: zweitName } : {}),
      ...(landText ? { nationality: landText } : {}),
      url: `${WURZEL}/player/${id}`,
      ...(sp?.bild && /^(https?:\/\/|\/)/.test(sp.bild) ? { image: sp.bild.startsWith('http') ? sp.bild : `${WURZEL}${sp.bild}` } : {}),
    },
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="mb-6 text-sm text-white/50">
        <Link href="/statistics" className="hover:text-white/80">Statistics</Link>
        <span className="px-2">/</span>
        <span className="text-white/70">{anzeige}</span>
      </nav>

      <header className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={flaggenPfad(land)}
          alt={landText ? `Flag of ${landText}` : 'Unknown country'}
          width={44}
          height={44}
          className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-white/15"
        />
        <div>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{anzeige}</h1>
          <p className="mt-1 text-sm text-white/60">
            {zweitName ? <>In-game: <span className="text-white/80">{zweitName}</span> · </> : null}
            {landText ? <>{landText}</> : 'Competitive Fortnite player'}
            {heimat ? ` · ${heimat}` : ''}
            {org ? (
              <> · <Link href={`/team/${org.slug}`} className="text-white/80 underline-offset-2 hover:underline">{org.name}</Link></>
            ) : null}
          </p>
        </div>
      </header>

      <p className="mt-5 text-[15px] leading-relaxed text-white/70">
        {anzeige} is a competitive Fortnite player{landText ? ` from ${landText}` : ''}. This page summarizes {anzeige}&rsquo;s
        career tournament results, FNCS placements, eliminations, damage and prize money, tracked on CompHub and
        updated after every event.
      </p>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Wert gross={preisgeld > 0 ? geld(preisgeld) : '—'} klein="Career earnings" />
        <Wert gross={typeof sp?.elims === 'number' ? zahl(sp.elims) : '—'} klein="Eliminations" />
        <Wert gross={typeof sp?.events === 'number' && sp.events > 0 ? zahl(sp.events) : '—'} klein="Tournaments" />
        <Wert gross={bestePlatz ? `#${zahl(bestePlatz)}` : '—'} klein="Best placement" />
        <Wert gross={zahl(titel)} klein="Titles (FNCS & LAN)" />
        <Wert
          gross={profil?.rang?.global ? `#${zahl(profil.rang.global)}` : '—'}
          klein={profil?.rang?.global ? 'Global rank (elims)' : 'Global rank'}
        />
      </section>

      {(typeof sp?.matches === 'number' || typeof sp?.damage === 'number' || siege > 0 || top10 > 0) && (
        <section className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Wert gross={typeof sp?.matches === 'number' ? zahl(sp.matches) : '—'} klein="Matches" />
          <Wert gross={typeof sp?.damage === 'number' ? zahl(sp.damage) : '—'} klein="Damage" />
          <Wert gross={zahl(siege)} klein="Wins" />
          <Wert gross={zahl(top10)} klein="Top 10 finishes" />
        </section>
      )}

      {profil?.rang?.regional && profil.rang.region ? (
        <p className="mt-4 text-sm text-white/55">
          Regional rank: #{zahl(profil.rang.regional)} of {zahl(profil.rang.regionalVon)} in {profil.rang.region}.
        </p>
      ) : null}

      {fncsPlaetze.length ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">FNCS placements</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {fncsPlaetze.map((x) => (
              <li
                key={x.saison}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm"
              >
                <span className="text-white/60">{x.saison}</span>
                <span className="px-1.5 text-white/30">·</span>
                <span className="font-medium tabular-nums">#{zahl(x.platz)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {letzte.length ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Recent results</h2>
          <ul className="mt-3 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
            {letzte.map((z, i) => (
              <li key={`${z.windowId}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 truncate text-white/80">
                  {z.event || z.season}
                  {z.season ? <span className="ml-2 text-xs text-white/40">{z.season}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums text-white/60">
                  #{zahl(z.platz as number)}
                  {typeof z.verdienst === 'number' && z.verdienst > 0 ? (
                    <span className="ml-2 text-emerald-300/80">{geld(z.verdienst)}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <a
          href={profilLink}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90"
        >
          Open full interactive profile →
        </a>
        <p className="mt-2 text-xs text-white/50">
          Charts, tournament-by-tournament history, head-to-head comparisons and more on the full CompHub dashboard.
        </p>
      </div>
    </main>
  );
}
