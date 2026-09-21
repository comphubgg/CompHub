'use client';

/*
 * Der Posteingang fuer die Meldungen aus dem Kontaktformular.
 *
 * Kein Postfach, keine Weiterleitung: die Meldungen liegen im Werkzeug und
 * werden hier gelesen. Das hat den Vorteil, dass die Bildschirmausschnitte
 * beim Vorgang bleiben und nichts im Spam landet.
 *
 * Offene zuerst, erledigte eingeklappt darunter - man will sehen, was noch
 * liegt, nicht was schon getan ist.
 */

import { useCallback, useEffect, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

interface Meldung {
  id: string; zeit: number; thema: string; eigenesThema: string;
  text: string; bilder: string[];
  vonId: string; vonName: string; vonEmail: string;
  erledigt: boolean; notiz: string;
}

const THEMENFARBE: Record<string, string> = {
  support: 'border-sky-500/50 bg-sky-500/10 text-sky-400',
  report: 'border-red-500/50 bg-red-500/10 text-red-400',
  feedback: 'border-violet-500/50 bg-violet-500/10 text-violet-400',
  hilfe: 'border-amber-500/50 bg-amber-500/10 text-amber-400',
  idee: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400',
  anderes: 'border-zinc-700 bg-zinc-800/40 text-slate-400',
};

export default function KontaktVerwaltung() {
  const t = useT();
  const [meldungen, setMeldungen] = useState<Meldung[]>([]);
  const [erlaubt, setErlaubt] = useState<boolean | null>(null);
  const [zeigeErledigte, setZeigeErledigte] = useState(false);
  const [gross, setGross] = useState<string | null>(null);

  const holen = useCallback(async () => {
    try {
      const r = await fetch('/api/kontakt');
      if (!r.ok) { setErlaubt(false); return; }
      const j = await r.json();
      setMeldungen(j.meldungen ?? []);
      setErlaubt(true);
    } catch { setErlaubt(false); }
  }, []);

  useEffect(() => { void holen(); }, [holen]);

  async function setzeErledigt(id: string, wert: boolean) {
    const r = await fetch('/api/kontakt', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, erledigt: wert }),
    });
    if (r.ok) setMeldungen((await r.json()).meldungen ?? []);
  }

  async function schreibeNotiz(id: string, notiz: string) {
    await fetch('/api/kontakt', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, notiz }),
    });
  }

  async function entfernen(id: string) {
    const r = await fetch('/api/kontakt', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (r.ok) setMeldungen((await r.json()).meldungen ?? []);
  }

  if (erlaubt === false) {
    return (
      <main className="grid flex-1 place-items-center bg-zinc-950 px-4 py-24
                       text-center text-slate-400">
        <T>Dieser Bereich ist dem Betreiber vorbehalten.</T>
      </main>
    );
  }

  const offene = meldungen.filter((m) => !m.erledigt);
  const erledigte = meldungen.filter((m) => m.erledigt);

  const karte = (m: Meldung) => (
    <article key={m.id}
      className={`rounded-xl border p-4 ${m.erledigt
        ? 'border-zinc-900 bg-zinc-950/40 opacity-60'
        : 'border-zinc-800 bg-zinc-900/40'}`}>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[10px]
                          font-semibold uppercase tracking-wider
                          ${THEMENFARBE[m.thema] ?? THEMENFARBE.anderes}`}>
          <T>{m.thema}</T>
        </span>
        {m.eigenesThema && (
          <span className="text-sm font-semibold text-slate-200">{m.eigenesThema}</span>
        )}
        <span className="ml-auto text-[11px] text-slate-600">
          {new Date(m.zeit).toLocaleString()}
        </span>
      </div>

      <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
        {m.text}
      </p>

      {m.bilder.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {m.bilder.map((b) => (
            <button key={b} onClick={() => setGross(b)}
              className="overflow-hidden rounded-lg border border-zinc-800
                         transition hover:border-sky-500">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/kontakt-bild?datei=${encodeURIComponent(b)}`} alt=""
                className="h-24 w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1
                      text-[11px] text-slate-500">
        <span><T>von</T> <span className="text-slate-300">{m.vonName || '—'}</span></span>
        {m.vonEmail && (
          <a href={`mailto:${m.vonEmail}`}
            className="text-sky-500 transition hover:text-sky-400">{m.vonEmail}</a>
        )}
      </div>

      {/* Eine Notiz fuer sich selbst - was man geantwortet hat, oder warum
          nichts zu tun ist. Sichert das Gedaechtnis fuer den naechsten Blick. */}
      <input defaultValue={m.notiz}
        onBlur={(e) => void schreibeNotiz(m.id, e.target.value)}
        placeholder={t('Notiz für dich')}
        className="mb-3 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3
                   py-1.5 text-xs text-slate-300 outline-none
                   placeholder:text-slate-700 focus:border-sky-500" />

      <div className="flex flex-wrap gap-2">
        <button onClick={() => void setzeErledigt(m.id, !m.erledigt)}
          className={`rounded-lg border px-3 py-1 text-[11px] transition ${m.erledigt
            ? 'border-zinc-700 text-slate-400 hover:border-sky-500 hover:text-sky-400'
            : 'border-emerald-600/60 text-emerald-400 hover:bg-emerald-500/10'}`}>
          {m.erledigt ? <T>wieder öffnen</T> : <T>erledigt</T>}
        </button>
        <button onClick={() => void entfernen(m.id)}
          className="rounded-lg border border-zinc-800 px-3 py-1 text-[11px]
                     text-slate-500 transition hover:border-red-500
                     hover:text-red-400">
          <T>löschen</T>
        </button>
      </div>
    </article>
  );

  return (
    <main className="flex-1 bg-zinc-950 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-slate-50"><T>Kontakt</T></h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">
          {offene.length === 0
            ? <T>Nichts Offenes.</T>
            : <>{offene.length} <T>offen</T></>}
        </p>

        {offene.length > 0 && (
          <div className="space-y-3">{offene.map(karte)}</div>
        )}

        {erledigte.length > 0 && (
          <div className="mt-8">
            <button onClick={() => setZeigeErledigte((v) => !v)}
              className="mb-3 text-xs text-slate-500 transition hover:text-sky-400">
              {zeigeErledigte ? '▾ ' : '▸ '}{erledigte.length} <T>erledigt</T>
            </button>
            {zeigeErledigte && <div className="space-y-3">{erledigte.map(karte)}</div>}
          </div>
        )}

        {meldungen.length === 0 && erlaubt && (
          <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-8
                        text-center text-sm text-slate-500">
            <T>Noch keine Meldungen.</T>
          </p>
        )}
      </div>

      {/* Ein Bild gross ansehen - ein Ausschnitt in Briefmarkengroesse
          nuetzt bei einem Fehlerbericht nichts. */}
      {gross && (
        <div onClick={() => setGross(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-zinc-950/90 p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/kontakt-bild?datei=${encodeURIComponent(gross)}`} alt=""
            className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </main>
  );
}
