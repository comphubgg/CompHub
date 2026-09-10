'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

/*
 * In einen anderen Zugang wechseln.
 *
 * Der Knopf dafuer stand bisher in der Zugangsliste unter "Konten", zwischen
 * Schluesseln, Rollen und Fristen - der Betreiber hat ihn dort schlicht nicht
 * gefunden. Er wollte eine eigene Seite: "kann ich einfach den User anklicken
 * und dann switche ich automatisch."
 *
 * Also genau das und sonst nichts: eine Liste, ein Klick, drin. Was ein
 * Wechsel bedeutet, steht einmal oben statt in jeder Zeile.
 */

interface Zugang {
  name: string;
  aktiv: boolean;
  angelegt: string;
  rolle: string | null;
  verwaltet?: string | null;
}

export default function WechselnSeite() {
  const t = useT();
  const [liste, setListe] = useState<Zugang[] | null>(null);
  const [erlaubt, setErlaubt] = useState(true);
  const [suche, setSuche] = useState('');
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState<string | null>(null);

  const holen = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/vip-zugaenge', { cache: 'no-store' });
      if (r.status === 403) { setErlaubt(false); setListe([]); return; }
      const j = await r.json();
      setListe(Array.isArray(j?.zugaenge) ? j.zugaenge : []);
    } catch {
      setListe([]);
    }
  }, []);

  useEffect(() => { void holen(); }, [holen]);

  const gezeigt = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (liste ?? [])
      .filter((z) => !q || z.name.toLowerCase().includes(q)
        || (z.verwaltet ?? '').toLowerCase().includes(q))
      /*
       * Aktive zuerst, danach alphabetisch.
       *
       * In einen stillgelegten Zugang zu wechseln hiesse, sich selbst
       * auszusperren - er steht deshalb unten und laesst sich nicht
       * anklicken.
       */
      .sort((a, b) => Number(b.aktiv) - Number(a.aktiv)
        || a.name.localeCompare(b.name));
  }, [liste, suche]);

  async function wechseln(name: string) {
    const sicher = window.confirm(
      `${t('In diesen Zugang wechseln')}: ${name}\n\n`
      + t('Zum Zurückkehren musst du dich neu anmelden.'));
    if (!sicher) return;
    setFehler('');
    setLaeuft(name);
    try {
      const r = await fetch('/api/admin/konto-wechsel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setFehler(t(j?.fehler ?? 'Wechsel nicht möglich')); return; }
      // Ganz neu laden: jede Seite haelt die Rechte aus dem ersten Abruf fest.
      window.location.href = '/';
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setLaeuft(null);
    }
  }

  if (!erlaubt) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 px-4
                       text-center text-slate-400">
        <p className="text-sm"><T>Nur für Admins.</T></p>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-zinc-950 px-4 py-6 text-slate-200">
      <div className="mx-auto max-w-3xl">
        <Link href="/admin"
          className="text-[11px] text-slate-500 transition hover:text-sky-400">
          ← <T>zurück zu den Admin-Werkzeugen</T>
        </Link>

        <h1 className="mt-3 text-xl font-semibold text-slate-100">
          <T>In einen Zugang wechseln</T>
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          <T>Ein Klick, und du siehst, was dieser Zugang sieht — seine
          Overlays, seine Rechte. Zurück geht es nur über eine neue Anmeldung;
          ein Cookie, das deine Adminrechte heimlich mitführt, wäre ein
          zweiter Schlüssel zur Verwaltung.</T>
        </p>

        <input value={suche} onChange={(e) => setSuche(e.target.value)}
          placeholder={t('Namen suchen')}
          className="mt-4 w-full rounded-lg border border-zinc-800 bg-zinc-950
                     px-3 py-2 text-sm text-slate-100 outline-none
                     placeholder:text-slate-600 focus:border-sky-500" />

        {fehler && (
          <p className="mt-3 rounded-lg border border-rose-900/60 bg-rose-950/30
                        px-3 py-2 text-xs text-rose-300">{fehler}</p>
        )}

        {!liste && (
          <p className="mt-6 text-sm text-slate-600"><T>Wird geladen …</T></p>
        )}
        {liste && !gezeigt.length && (
          <p className="mt-6 text-sm text-slate-600"><T>Nichts gefunden.</T></p>
        )}

        <ul className="mt-4 space-y-2">
          {gezeigt.map((z) => (
            <li key={z.name}>
              <button
                onClick={() => z.aktiv && void wechseln(z.name)}
                disabled={!z.aktiv || laeuft === z.name}
                className={`flex w-full items-center gap-3 rounded-xl border
                            px-4 py-3 text-left transition ${z.aktiv
                  ? 'border-zinc-800 bg-zinc-900/40 hover:border-sky-500'
                  : 'cursor-not-allowed border-zinc-900 bg-zinc-950/40 opacity-50'}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold
                                   text-slate-100">
                    {z.name}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    {z.verwaltet
                      ? <><T>Manager für</T> {z.verwaltet}</>
                      : z.rolle ? z.rolle : <T>VIP</T>}
                    {!z.aktiv ? ` · ${t('stillgelegt')}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] font-medium text-sky-400">
                  {laeuft === z.name ? <T>einen Moment …</T> : <T>hineinsehen</T>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
