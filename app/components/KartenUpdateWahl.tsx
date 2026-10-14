'use client';

/*
 * Die Kartenversion eines Updates waehlen (nur Admin) - jede der 228 Karten von fortnite.gg, nach Kapitel und Saison geordnet.
 *
 * Betreiber (14.10.2026): "benutze wirklich jede einzelne Karte von jedem Update ... zum Beispiel in Chapter 7 Season 4 das 42.30-Update oder das
 * 42.20" und "fuer den Notfall gibt es fuer den Admin einen Knopf" (Neue Karte suchen). Die Bilder kommen verkleinert ueber /api/maps-bild und
 * werden nur geladen, wenn die Saison offen ist - sonst waeren es 228 Bilder auf einmal.
 */

import { useEffect, useMemo, useState } from 'react';
import { useT } from '@/app/components/SprachProvider';

interface Update { patch: string; kapitel: number; saison: string; img: string; url: string; neu?: boolean; gefunden?: string }

const bildVon = (url: string) => `/api/maps-bild?u=${encodeURIComponent(url)}&b=420`;

/** "CH7 S4" -> { kapitel: 7, saison: "Season 4" } - der Kurzname der Saison aus dem Maps-Verzeichnis. */
function ausKurz(kurz?: string): { kapitel: number; saison: string } | null {
  const m = /CH(\d+)\s*S(\d+)/i.exec(kurz ?? '');
  return m ? { kapitel: Number(m[1]), saison: `Season ${m[2]}` } : null;
}

export default function KartenUpdateWahl({ aktuell, waehle, vorgabe, speichert = false }: {
  /** Die Adresse des gerade gesetzten Bildes (hebt die Karte hervor). */
  aktuell: string | null;
  waehle: (url: string, titel: string) => void;
  /** Kurzname der Saison des Cups ("CH7 S4") - dort fängt die Auswahl an. */
  vorgabe?: string;
  speichert?: boolean;
}) {
  const t = useT();
  const [liste, setListe] = useState<Update[] | null>(null);
  const [kapitel, setKapitel] = useState<number | null>(null);
  const [saison, setSaison] = useState('');
  const [suche, setSuche] = useState<{ laeuft: boolean; text: string }>({ laeuft: false, text: '' });

  const laden = () => fetch('/api/karten-updates', { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (j?.ok) setListe(j.updates); }).catch(() => setListe([]));
  useEffect(() => { void laden(); }, []);

  /** Kapitel (neueste zuerst; "Neu gefunden" = Kapitel 0 ganz vorn) und darin die Saisons in der Reihenfolge der Liste. */
  const gruppen = useMemo(() => {
    const m = new Map<number, Map<string, Update[]>>();
    for (const u of liste ?? []) {
      const s = m.get(u.kapitel) ?? new Map<string, Update[]>();
      s.set(u.saison, [...(s.get(u.saison) ?? []), u]);
      m.set(u.kapitel, s);
    }
    return [...m.entries()].sort((a, b) => (a[0] === 0 ? -1 : b[0] === 0 ? 1 : b[0] - a[0]));
  }, [liste]);

  // Anfangsauswahl: die Saison des Cups, sonst die neueste.
  useEffect(() => {
    if (!gruppen.length || kapitel !== null) return;
    const v = ausKurz(vorgabe);
    const treffer = v && gruppen.find(([k, s]) => k === v.kapitel && s.has(v.saison));
    if (treffer && v) { setKapitel(v.kapitel); setSaison(v.saison); return; }
    const [k, s] = gruppen.find(([nr]) => nr !== 0) ?? gruppen[0];
    setKapitel(k); setSaison([...s.keys()][0] ?? '');
  }, [gruppen, kapitel, vorgabe]);

  const saisons = gruppen.find(([k]) => k === kapitel)?.[1] ?? new Map<string, Update[]>();
  const angezeigt = saisons.get(saison) ?? [];

  const neuSuchen = async () => {
    setSuche({ laeuft: true, text: '' });
    try {
      const r = await fetch('/api/karten-updates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'suchen' }) });
      const j = await r.json();
      if (!j?.ok) { setSuche({ laeuft: false, text: j?.error || t('Die Suche ging nicht durch.') }); return; }
      setSuche({
        laeuft: false,
        text: j.neu?.length
          ? `${t('Neu gefunden')}: ${(j.neu as string[]).map((p) => `${t('Update')} ${p}`).join(', ')}`
          : `${t('Nichts Neues')} (${t('neueste Version')} ${j.neueste}).`,
      });
      await laden();
      if (j.neu?.length) { setKapitel(0); setSaison('Neu gefunden'); }
    } catch { setSuche({ laeuft: false, text: t('Die Suche ging nicht durch.') }); }
  };

  const chip = (an: boolean) => `rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition ${an
    ? 'bg-sky-500 text-white' : 'border border-zinc-700 bg-zinc-900 text-slate-300 hover:border-sky-500/70 hover:text-sky-500'}`;

  return (
    <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('Alle Updates')}{liste ? ` · ${liste.length}` : ''}</span>
        <button type="button" onClick={() => void neuSuchen()} disabled={suche.laeuft}
          className="ml-auto rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-600 transition hover:border-amber-400 disabled:opacity-60">
          {suche.laeuft ? t('Sucht …') : t('Neue Karte suchen')}
        </button>
      </div>
      {suche.text && <p className="mt-2 text-xs text-slate-400">{suche.text}</p>}

      {liste === null && <p className="mt-3 text-xs text-slate-500">{t('Wird geladen …')}</p>}
      {gruppen.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {gruppen.map(([k, s]) => (
              <button key={k} type="button" onClick={() => { setKapitel(k); setSaison([...s.keys()][0] ?? ''); }} className={chip(kapitel === k)}>
                {k === 0 ? t('Neu gefunden') : `Chapter ${k}`}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...saisons.entries()].map(([name, us]) => (
              <button key={name} type="button" onClick={() => setSaison(name)} className={chip(saison === name)}>
                {name}<span className="ml-1.5 tabular-nums opacity-60">{us.length}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {angezeigt.map((u) => (
              <button key={u.img} type="button" disabled={speichert}
                onClick={() => waehle(u.url, `${u.kapitel ? `Chapter ${u.kapitel} · ` : ''}${u.saison} · Update ${u.patch}`)}
                className={`group overflow-hidden rounded-xl border text-left transition ${aktuell === u.url ? 'border-sky-500 ring-2 ring-sky-500/30' : 'border-zinc-800 hover:border-sky-500/60'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bildVon(u.url)} alt="" loading="lazy" className="aspect-square w-full bg-zinc-950 object-cover" />
                <span className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px] font-bold text-slate-200">
                  <span>{t('Update')} {u.patch}</span>
                  {u.neu && <span className="rounded bg-amber-400 px-1 text-[9px] font-black uppercase text-zinc-950">{t('neu')}</span>}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
