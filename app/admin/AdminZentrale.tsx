'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

/*
 * Die Admin-Zentrale.
 *
 * Der Betreiber (1.10.2026): "alles optimieren fuer den Admin: simpler,
 * optisch besser sichtbar". Drei Dinge in dieser Reihenfolge, weil man sie so
 * braucht: Laeuft alles? Was wartet auf mich? Und dann die Werkzeuge - nach
 * Themen gruppiert statt auf Seiten verteilt.
 *
 * Gezeigt wird nur, was gemessen ist: die Laeufe kommen von GitHub Actions
 * (/api/admin/zentrale), die Replay-Zahlen aus der Uebersicht der Replays.
 * Laesst sich etwas nicht abrufen, steht das da - kein erfundener "alles gut".
 */

export interface Ziel { href: string; titel: string; text: string }

interface Lauf { status: string; conclusion: string | null; zeit: string; url: string }
interface Job {
  schluessel: string; name: string; was: string; aktiv: Lauf | null; letzter: Lauf | null;
  ampel: 'ok' | 'warnung' | 'fehler' | 'unbekannt'; hinweis: string;
}
interface Auftrag { id: number; titel: string; hinweis: string; seit: string }
interface Antwort { jobs: Job[]; kontaktOffen: number | null; auftraege: Auftrag[] | null; stand: number }
interface ReplayStand { gesamt: number; ausgewertet: number; offenInFrist: number; imFristGesamt: number }

/** Die Gruppen der Werkzeuge. Was hier nicht steht, landet unter "Weitere". */
const GRUPPEN: Array<{
  id: string; titel: string; hrefs: string[];
  punkt: string; titelFarbe: string; kachel: string;
}> = [
  { id: 'inhalte', titel: 'Inhalte', punkt: 'bg-sky-400', titelFarbe: 'text-sky-300',
    kachel: 'hover:border-sky-500/70 hover:bg-sky-500/[0.06]',
    hrefs: ['/maps', '/admin/tweets', '/admin/predictions', '/admin/archive', '/admin/assets'] },
  { id: 'spieler', titel: 'Spieler & Teams', punkt: 'bg-emerald-400', titelFarbe: 'text-emerald-300',
    kachel: 'hover:border-emerald-500/70 hover:bg-emerald-500/[0.06]',
    hrefs: ['/admin/players', '/admin/orgs', '/admin/vips'] },
  { id: 'daten', titel: 'Daten & Replays', punkt: 'bg-amber-400', titelFarbe: 'text-amber-300',
    kachel: 'hover:border-amber-500/70 hover:bg-amber-500/[0.06]',
    hrefs: ['/admin/replays', '/admin/replay'] },
  { id: 'nutzer', titel: 'Nutzer & Zugang', punkt: 'bg-violet-400', titelFarbe: 'text-violet-300',
    kachel: 'hover:border-violet-500/70 hover:bg-violet-500/[0.06]',
    hrefs: ['/admin/accounts', '/admin/vip-access', '/admin/switch', '/admin/sections', '/admin/services', '/admin/live'] },
  { id: 'post', titel: 'Posteingang', punkt: 'bg-rose-400', titelFarbe: 'text-rose-300',
    kachel: 'hover:border-rose-500/70 hover:bg-rose-500/[0.06]',
    hrefs: ['/admin/contact'] },
];
const WEITERE = {
  id: 'weitere', titel: 'Weitere', punkt: 'bg-slate-400', titelFarbe: 'text-slate-300',
  kachel: 'hover:border-sky-500/70 hover:bg-zinc-900/70', hrefs: [] as string[],
};

const AMPEL: Record<Job['ampel'], { punkt: string; rand: string; text: string }> = {
  ok: { punkt: 'bg-emerald-400', rand: 'border-zinc-800', text: 'text-emerald-400' },
  warnung: { punkt: 'bg-amber-400', rand: 'border-amber-500/40', text: 'text-amber-400' },
  fehler: { punkt: 'bg-rose-500', rand: 'border-rose-500/50', text: 'text-rose-400' },
  unbekannt: { punkt: 'bg-slate-500', rand: 'border-zinc-800', text: 'text-slate-400' },
};

/** "vor 5 Min", "vor 3 Std", "vor 2 Tagen" - so, wie man es im Kopf rechnet. */
function vor(zeit: string | number, t: (s: string) => string): string {
  const min = Math.max(0, Math.round((Date.now() - (typeof zeit === 'number' ? zeit : Date.parse(zeit))) / 60_000));
  if (min < 1) return t('gerade eben');
  if (min < 60) return t('vor {n} Min').replace('{n}', String(min));
  if (min < 48 * 60) return t('vor {n} Std').replace('{n}', String(Math.round(min / 60)));
  return t('vor {n} Tagen').replace('{n}', String(Math.round(min / 1440)));
}

export default function AdminZentrale({ werkzeuge, zeigeLaeufe }: {
  werkzeuge: Ziel[];
  /** Die Laeufe und Replays sind Sache des Admins - ein Manager sieht nur seine Werkzeuge. */
  zeigeLaeufe: boolean;
}) {
  const t = useT();
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState(false);
  const [replays, setReplays] = useState<ReplayStand | null>(null);
  const [laedt, setLaedt] = useState(false);

  const laden = useCallback(() => {
    if (!zeigeLaeufe) return;
    setLaedt(true);
    fetch('/api/admin/zentrale', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { setDaten(j); setFehler(false); })
      .catch(() => setFehler(true))
      .finally(() => setLaedt(false));
    fetch('/api/replays', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => {
        const grenze = Date.now() - 31 * 864e5;
        let gesamt = 0; let ausgewertet = 0; let offenInFrist = 0; let imFristGesamt = 0;
        for (const f of (j?.fenster ?? []) as Array<{ datum?: number; zaehler?: Record<string, number> }>) {
          const z = f.zaehler ?? {};
          // Ein Spieltag, von dem kein einziges Replay da ist (die Arena-Modi haben keine Server-Replays),
          // wartet nicht auf uns - er kommt nie.
          const nieDa = !(z.PARSED > 0) && Object.keys(z).every((k) => k === 'NOT_AVAILABLE');
          for (const [stand, n] of Object.entries(z)) {
            gesamt += n;
            if (stand === 'PARSED') ausgewertet += n;
            if ((f.datum ?? 0) > grenze) imFristGesamt += n;
            // Offen zaehlt nur, was noch zu holen ist: Epic haelt ein Replay 31 Tage vor.
            if (stand !== 'PARSED' && (f.datum ?? 0) > grenze && !nieDa) offenInFrist += n;
          }
        }
        setReplays({ gesamt, ausgewertet, offenInFrist, imFristGesamt });
      })
      .catch(() => setReplays(null));
  }, [zeigeLaeufe]);
  useEffect(() => { laden(); }, [laden]);
  // Alle fuenf Minuten von selbst - die Zentrale soll offen stehen koennen.
  useEffect(() => {
    if (!zeigeLaeufe) return undefined;
    const takt = window.setInterval(laden, 5 * 60_000);
    return () => window.clearInterval(takt);
  }, [zeigeLaeufe, laden]);

  const probleme = (daten?.jobs ?? []).filter((j) => j.ampel === 'fehler' || j.ampel === 'warnung').length;
  const offenPost = daten?.kontaktOffen ?? 0;
  const replayOffen = replays?.offenInFrist ?? 0;
  const allesRuhig = daten && probleme === 0 && offenPost === 0 && replayOffen <= Math.max(50, (replays?.imFristGesamt ?? 0) * 0.005);

  // Die Werkzeuge in ihre Gruppen sortieren; Unbekanntes unter "Weitere".
  const bekannt = new Set(GRUPPEN.flatMap((g) => g.hrefs));
  const gruppen = [
    ...GRUPPEN.map((g) => ({ ...g, ziele: g.hrefs.map((h) => werkzeuge.find((w) => w.href === h)).filter((w): w is Ziel => !!w) })),
    { ...WEITERE, ziele: werkzeuge.filter((w) => !bekannt.has(w.href)) },
  ].filter((g) => g.ziele.length > 0);

  const Kennzahl = ({ wert, titel, href, ernst }: { wert: string; titel: string; href: string; ernst: boolean }) => (
    <Link href={href}
      className={`rounded-xl border px-4 py-3 transition hover:bg-zinc-900/70 ${
        ernst ? 'border-amber-500/40 bg-amber-500/[0.06]' : 'border-zinc-800 bg-zinc-900/40'}`}>
      <span className={`block text-3xl font-bold tabular-nums ${ernst ? 'text-amber-300' : 'text-emerald-400'}`}>{wert}</span>
      <span className="mt-0.5 block text-xs text-slate-400"><T>{titel}</T></span>
    </Link>
  );

  return (
    <section className="rounded-xl border border-sky-500/25 bg-zinc-950/60 p-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-base font-semibold text-slate-100"><T>Admin-Zentrale</T></h2>
        <span className="text-xs text-slate-500"><T>sichtbar nur für dich</T></span>
        {zeigeLaeufe && (
          <button type="button" onClick={laden} disabled={laedt}
            className="ml-auto rounded-md border border-zinc-700 px-2.5 py-1 text-[11px] text-slate-400 transition
                       hover:border-sky-500 hover:text-sky-400 disabled:opacity-50">
            {laedt ? <T>Wird geladen …</T> : <T>Aktualisieren</T>}
          </button>
        )}
      </div>

      {zeigeLaeufe && (
        <>
          {/* 1. Laeuft alles? */}
          <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>Läuft alles?</T></h3>
          {fehler && (
            <p className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
              <T>Der Zustand der Läufe ließ sich gerade nicht abrufen.</T>
            </p>
          )}
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {(daten?.jobs ?? Array.from({ length: 5 }, () => null)).map((j, i) => {
              if (!j) return <div key={i} className="h-[74px] animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/40" />;
              const a = AMPEL[j.ampel];
              const l = j.aktiv ?? j.letzter;
              return (
                <a key={j.schluessel} href={l?.url ?? undefined} target="_blank" rel="noreferrer"
                  title={t(j.was)}
                  className={`rounded-xl border bg-zinc-900/40 px-3.5 py-3 transition hover:bg-zinc-900/70 ${a.rand}`}>
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${a.punkt} ${j.aktiv ? 'animate-pulse' : ''}`} />
                    <span className="text-sm font-semibold text-slate-100"><T>{j.name}</T></span>
                  </span>
                  <span className={`mt-1.5 block text-[11px] ${j.aktiv ? 'text-sky-400' : a.text}`}>
                    {j.aktiv
                      ? `${t(j.aktiv.status === 'queued' || j.aktiv.status === 'pending' ? 'wartet' : 'läuft')} · ${vor(j.aktiv.zeit, t)}`
                      : j.letzter
                        ? `${t(j.letzter.conclusion === 'success' ? 'OK' : 'Fehlgeschlagen')} · ${vor(j.letzter.zeit, t)}`
                        : t(j.hinweis || 'unbekannt')}
                  </span>
                  {j.hinweis && j.ampel !== 'ok' && j.letzter && (
                    <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">{t(j.hinweis)}</span>
                  )}
                </a>
              );
            })}
          </div>

          {/* 2. Was wartet auf mich? */}
          <h3 className="mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>Was wartet auf dich?</T></h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Kennzahl wert={daten ? String(offenPost) : '…'} titel="Meldungen im Posteingang" href="/admin/contact" ernst={offenPost > 0} />
            <Kennzahl wert={replays ? String(replayOffen) : '…'} titel="Replays in der Frist noch offen" href="/admin/replays" ernst={replayOffen > Math.max(50, (replays?.imFristGesamt ?? 0) * 0.005)} />
            <Kennzahl wert={daten ? String(probleme) : '…'} titel="Läufe mit Problem" href="#" ernst={probleme > 0} />
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
              <span className="block text-3xl font-bold tabular-nums text-sky-400">
                {replays && replays.gesamt ? `${(replays.ausgewertet / replays.gesamt * 100).toFixed(1)}%` : '…'}
              </span>
              <span className="mt-0.5 block text-xs text-slate-400"><T>aller Replays ausgewertet</T></span>
            </div>
          </div>
          {allesRuhig && (
            <p className="mt-2 text-xs text-emerald-400"><T>Alles ruhig — nichts wartet auf dich.</T></p>
          )}

          {/* 3. Die offenen Auftraege - dieselbe Liste wie in #admin-aufgaben. */}
          {daten?.auftraege && daten.auftraege.length > 0 && (
            <>
              <h3 className="mt-6 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                <T>Offene Aufträge</T>
                <span className="font-normal normal-case tracking-normal text-slate-600">{daten.auftraege.length}</span>
              </h3>
              <div className="mt-2 max-h-72 divide-y divide-zinc-900 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/30">
                {daten.auftraege.map((a) => (
                  <div key={a.id} className="px-3.5 py-2.5">
                    <p className="text-sm font-medium text-slate-200">
                      <span className="mr-2 text-[11px] tabular-nums text-slate-600">{a.id}</span>{a.titel}
                    </p>
                    {a.hinweis && <p className="mt-0.5 text-xs leading-snug text-slate-500">{a.hinweis}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* 3. Die Werkzeuge, nach Themen. */}
      <div className={zeigeLaeufe ? 'mt-7' : 'mt-4'}>
        <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
          {gruppen.map((g) => (
            <div key={g.id}>
              <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
                <span className={`h-2 w-2 rounded-full ${g.punkt}`} />
                <span className={g.titelFarbe}><T>{g.titel}</T></span>
              </h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {g.ziele.map((z) => (
                  <Link key={z.href} href={z.href}
                    className={`group relative rounded-lg border border-zinc-800 bg-zinc-900/40 px-3.5 py-3 transition ${g.kachel}`}>
                    <span className="block text-[15px] font-semibold text-slate-100"><T>{z.titel}</T></span>
                    <span className="mt-0.5 block text-xs leading-snug text-slate-500"><T>{z.text}</T></span>
                    {z.href === '/admin/contact' && offenPost > 0 && (
                      <span className="absolute right-2.5 top-2.5 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white">
                        {offenPost}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
