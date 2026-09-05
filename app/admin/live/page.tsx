'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

/*
 * Wer gerade da ist, und wer wann zuletzt.
 *
 * Der Betreiber wollte sehen, "wer gerade auf dem Tool ist oder sich
 * eingeloggt hat, und wann - Zeit und Datum. Bei den Nutzungszahlen sehe ich
 * ja nur das Datum, nicht wer und wann."
 *
 * Das ist bewusst etwas anderes als die Nutzungszahlen im Dashboard: die
 * zaehlen Browser und nennen keine Namen. Hier stehen nur Angemeldete, und
 * die sind namentlich bekannt, weil sie sich mit Namen angemeldet haben.
 *
 * Was "gerade da" heisst, steht auf der Seite: in den letzten fuenf Minuten
 * war eine Seite offen. Mehr weiss niemand - ein geschlossener Reiter meldet
 * sich nicht ab. Ein Punkt, der "online" behauptet, ohne das sagen zu
 * koennen, waere die Art Halbwahrheit, die spaeter jemanden aergert.
 */

interface Person {
  kennung: string;
  name: string;
  art: 'konto' | 'vip';
  zuletzt: number;
  letzteAnmeldung?: number;
  ersteAnmeldung?: number;
  anmeldungen?: number;
  online: boolean;
}

export default function LivePage() {
  const t = useT();
  const [leute, setLeute] = useState<Person[] | null>(null);
  const [fehler, setFehler] = useState('');

  const holen = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/anwesend', { cache: 'no-store' });
      if (!r.ok) { setFehler(t('Nicht erlaubt.')); return; }
      const j = await r.json();
      setLeute(j.leute ?? []);
      setFehler('');
    } catch {
      setFehler(t('Keine Verbindung zum Server.'));
    }
  }, [t]);

  /*
   * Alle zwanzig Sekunden nachsehen.
   *
   * Haeufiger braucht es nicht: die Schwelle fuer "gerade da" sind fuenf
   * Minuten, und eine Seite, die sekuendlich flackert, liest sich schlechter,
   * als sie aussieht.
   */
  useEffect(() => {
    void holen();
    const uhr = setInterval(() => void holen(), 20_000);
    return () => clearInterval(uhr);
  }, [holen]);

  /** Datum und Uhrzeit, wie man es vorliest. */
  const wann = (ms?: number) => {
    if (!ms) return '—';
    const d = new Date(ms);
    return `${d.toLocaleDateString('de-DE')} · ${d.toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit' })}`;
  };

  /** "vor 3 Minuten" - das liest sich schneller als eine Uhrzeit. */
  const herLang = (ms?: number) => {
    if (!ms) return '';
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return t('gerade eben');
    const m = Math.round(s / 60);
    if (m < 60) return `${t('vor')} ${m} ${t('Min.')}`;
    const h = Math.round(m / 60);
    if (h < 24) return `${t('vor')} ${h} ${t('Std.')}`;
    return `${t('vor')} ${Math.round(h / 24)} ${t('Tagen')}`;
  };

  const online = (leute ?? []).filter((p) => p.online);
  const rest = (leute ?? []).filter((p) => !p.online);

  const zeile = (p: Person) => (
    <li key={p.kennung}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border
                 border-zinc-900 bg-zinc-950/40 px-3 py-2.5">
      {/* Gruen heisst da, rot heisst weg - grau sah aus wie "unbekannt". */}
      <span className={`h-2 w-2 shrink-0 rounded-full ${p.online
        ? 'bg-emerald-400' : 'bg-rose-500'}`}
        title={p.online ? t('gerade da') : t('nicht mehr da')} aria-hidden />
      <span className="text-sm font-medium text-slate-200">{p.name}</span>
      <span className="rounded-full border border-zinc-800 px-2 py-0.5
                       text-[9px] uppercase tracking-wider text-slate-600">
        {p.art === 'vip' ? <T>Schlüssel</T> : <T>Konto</T>}
      </span>
      <span className="text-xs text-slate-500">{herLang(p.zuletzt)}</span>

      <span className="ml-auto text-right text-[11px] leading-relaxed text-slate-600">
        <span className="block">
          <T>zuletzt hier</T>: {wann(p.zuletzt)}
        </span>
        <span className="block">
          <T>angemeldet</T>: {wann(p.letzteAnmeldung)}
          {p.anmeldungen ? ` · ${p.anmeldungen}×` : ''}
        </span>
      </span>
    </li>
  );

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold"><T>Live</T></h1>
            <p className="mt-0.5 text-sm text-slate-500">
              <T>Wer gerade da ist und wer sich wann angemeldet hat.</T>
            </p>
          </div>
          <Link href="/admin" prefetch={false}
            className="text-sm text-slate-500 transition hover:text-sky-400">
            ← <T>zu den Admin-Werkzeugen</T>
          </Link>
        </div>

        {fehler && (
          <p className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-4
                        py-2.5 text-sm text-rose-300">{fehler}</p>
        )}

        {!leute && !fehler && (
          <p className="text-sm text-slate-500"><T>Wird geladen …</T></p>
        )}

        {leute && !leute.length && (
          <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6
                        text-sm text-slate-500">
            <T>Noch niemand aufgezeichnet. Die Liste füllt sich, sobald sich
            jemand anmeldet oder eine Seite öffnet — rückwirkend gibt es
            nichts, vorher wurde das nicht festgehalten.</T>
          </p>
        )}

        {leute && leute.length > 0 && (
          <>
            <section className="mb-6">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em]
                             text-slate-500">
                <T>Gerade da</T> {online.length ? `· ${online.length}` : ''}
              </h2>
              {online.length ? (
                <ul className="space-y-1.5">{online.map(zeile)}</ul>
              ) : (
                <p className="rounded-lg border border-zinc-900 bg-zinc-950/40
                              px-3 py-2.5 text-sm text-slate-600">
                  <T>Gerade niemand.</T>
                </p>
              )}
              <p className="mt-2 text-[11px] text-slate-600">
                <T>Jede offene Seite meldet sich einmal pro Minute. Wer zwei
                Minuten lang nichts von sich hören lässt, gilt als weg — ein
                geschlossener Browser wird also binnen zwei Minuten rot. Wer
                sich abmeldet, verschwindet sofort.</T>
              </p>
            </section>

            {rest.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em]
                               text-slate-500">
                  <T>Zuletzt hier</T>
                </h2>
                <ul className="space-y-1.5">{rest.map(zeile)}</ul>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
