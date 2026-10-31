'use client';

/*
 * Die oeffentliche Seite einer Organisation (31.10.2026): Banner, Logo und Farbe der Org, darunter alle Spieler mit grossen Fotos und ihren
 * wichtigsten Werten; ein Klick oeffnet das CompHub-Profil. Die eigene Webseite der Org (zuerst CLUE Esports) verlinkt hierher und holt
 * dieselben Werte ueber /api/team.
 *
 * Der Betreiber: "wenn ich ueber den Link joine, sehe ich exakte Stats nur fuer diese Spieler, eine Seite mit all deren Spielern in deren
 * Style". Werte fehlen, wenn ein Spieler noch keinem Epic-Konto zugeordnet ist - dann steht ein Strich, nichts geschaetzt.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useSprache } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import TeamFlagge from '@/components/TeamFlagge';

interface Spieler {
  epicId: string | null; name: string; role: 'pro' | 'academy' | 'creator'; country: string | null; homeRegion: string | null;
  matches: number | null; elims: number | null; damagePerMatch: number | null; elimsPerMatch: number | null; damageRatio: number | null;
  earnings: number | null; photo: string | null; profileUrl: string | null; x: string | null;
}
interface Antwort {
  ok: boolean; reason?: string;
  org?: { slug: string; name: string; logo: string | null; banner: string | null; colors: { primary: string | null }; region: string | null; links: Record<string, string | null> };
  players?: Spieler[];
}

const ROLLEN: Array<[Spieler['role'], string]> = [['pro', 'Pro Roster'], ['academy', 'Academy Roster'], ['creator', 'Content Creator']];

export default function TeamSeite() {
  const { org } = useParams<{ org: string }>();
  const { sprache, t } = useSprache();
  const ort = sprache === 'de' ? 'de-DE' : 'en-GB';
  const [daten, setDaten] = useState<Antwort | null>(null);

  useEffect(() => {
    let weg = false;
    fetch(`/api/team?org=${encodeURIComponent(org)}`).then((r) => r.json()).then((j: Antwort) => { if (!weg) setDaten(j); })
      .catch(() => { if (!weg) setDaten({ ok: false, reason: 'CompHub antwortet gerade nicht.' }); });
    return () => { weg = true; };
  }, [org]);

  const farbe = daten?.org?.colors.primary || '#0ea5e9';
  const gruppen = useMemo(() => ROLLEN.map(([r, titel]) => ({
    titel,
    // Wer Werte hat, zuerst - nach Preisgeld, dann Matches; danach die uebrigen.
    liste: (daten?.players ?? []).filter((p) => p.role === r)
      .sort((a, b) => (b.earnings ?? -1) - (a.earnings ?? -1) || (b.matches ?? -1) - (a.matches ?? -1)),
  })).filter((g) => g.liste.length), [daten]);

  if (!daten) return <LadeSchirm text={t('Team wird geladen')} />;
  if (!daten.ok || !daten.org) {
    return (
      <main className="grid min-h-[60vh] place-items-center bg-zinc-950 px-4 text-center">
        <p className="text-lg text-slate-300">{daten.reason === 'unbekannte Organisation' ? t('Dieses Team gibt es auf CompHub nicht.') : t('Das Team lässt sich gerade nicht laden.')}</p>
      </main>
    );
  }
  const o = daten.org;
  const zahl = (n: number | null, stellen = 0) => (n == null ? '—' : n.toLocaleString(ort, { maximumFractionDigits: stellen, minimumFractionDigits: stellen }));
  const geld = (n: number | null) => (n == null ? '—' : `$${n.toLocaleString(ort, { maximumFractionDigits: 0 })}`);

  return (
    <main className="min-h-screen bg-zinc-950 pb-20" style={{ ['--org' as string]: farbe }}>
      <section className="relative overflow-hidden border-b border-zinc-800">
        {o.banner && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={o.banner} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/30 via-zinc-950/70 to-zinc-950" />
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-end gap-6 px-4 pb-10 pt-24 sm:px-8">
          {o.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={o.logo} alt={o.name} className="h-28 w-28 rounded-3xl border-2 object-cover shadow-2xl" style={{ borderColor: farbe }} />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.22em]" style={{ color: farbe }}>{o.region ?? ''} <T>Team</T></p>
            <h1 className="schrift-anzeige mt-1 text-5xl font-extrabold tracking-tight text-slate-50 sm:text-6xl">{o.name}</h1>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              {o.links.x && <a href={o.links.x} target="_blank" rel="noreferrer" className="rounded-full border border-zinc-700 bg-zinc-900/80 px-4 py-1.5 font-semibold text-slate-200 hover:border-[var(--org)]">X ↗</a>}
              {o.links.website && <a href={o.links.website} target="_blank" rel="noreferrer" className="rounded-full border border-zinc-700 bg-zinc-900/80 px-4 py-1.5 font-semibold text-slate-200 hover:border-[var(--org)]"><T>Webseite</T> ↗</a>}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        {gruppen.map((g) => (
          <section key={g.titel} className="mt-12">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: farbe }}><T>{g.titel}</T> <span className="text-slate-500">· {g.liste.length}</span></h2>
            <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {g.liste.map((p) => {
                const inhalt = (
                  <>
                    <div className="relative aspect-square overflow-hidden rounded-2xl bg-zinc-800">
                      {p.photo
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.photo} alt={p.name} className="h-full w-full object-cover" />
                        : <div className="grid h-full w-full place-items-center text-5xl font-extrabold text-zinc-600">{p.name.slice(0, 1).toUpperCase()}</div>}
                    </div>
                    <p className="mt-3 flex min-w-0 items-center gap-2 text-lg font-extrabold uppercase text-slate-100">
                      {p.country && <TeamFlagge laender={[p.country]} groesse={20} />}<span className="truncate">{p.name}</span>
                    </p>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-zinc-800/70 px-1 py-2"><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500"><T>Preisgeld</T></dt><dd className="text-sm font-bold tabular-nums text-slate-100">{geld(p.earnings)}</dd></div>
                      <div className="rounded-xl bg-zinc-800/70 px-1 py-2"><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Matches</dt><dd className="text-sm font-bold tabular-nums text-slate-100">{zahl(p.matches)}</dd></div>
                      <div className="rounded-xl bg-zinc-800/70 px-1 py-2"><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500"><T>Elims je Match</T></dt><dd className="text-sm font-bold tabular-nums text-slate-100">{zahl(p.elimsPerMatch, 2)}</dd></div>
                    </dl>
                  </>
                );
                return (
                  <li key={`${p.epicId ?? p.name}`} className="rounded-3xl border border-zinc-800 bg-zinc-900 p-3 transition hover:border-[var(--org)]">
                    {p.epicId ? <Link href={`/statistics?spieler=${p.epicId}`} className="block">{inhalt}</Link> : inhalt}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <p className="mt-14 text-center text-sm text-slate-500">
          <T>Alle Werte aus offiziellen Turnier-Replays - ein Strich heißt: noch keine gewerteten Spiele.</T>
        </p>
      </div>
    </main>
  );
}
