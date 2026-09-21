'use client';

// Die Zugangsdaten der Anmeldedienste eintragen.
//
// Bis hierher standen Client-Id und Secret nur in .env.local - der Betreiber
// musste also eine Datei im Projektordner bearbeiten und den Server neu
// starten. Hier wird eingefuegt, gespeichert, fertig; die Anmeldewege lesen
// die Werte bei der naechsten Anfrage.
//
// Angezeigt wird nie ein hinterlegter Wert, nur ob einer da ist. Ein Feld,
// das das Secret zurueckliest, waere ein zweiter Ort, an dem es steht.

import { useCallback, useEffect, useState } from 'react';
import T from '@/app/components/T';

interface Stand {
  dienst: 'twitch' | 'discord' | 'google';
  woher: 'eingetragen' | 'umgebung' | 'fehlt';
  seite: string;
  rueckrufVoll: string;
}

const LOGO: Record<string, string> = {
  twitch: '/icons/twitch.png',
  discord: '/icons/discord.png',
  google: '/icons/google.svg',
};

export default function DienstePage() {
  const [stand, setStand] = useState<Stand[] | null>(null);
  const [fehler, setFehler] = useState('');
  const [eingabe, setEingabe] = useState<Record<string, { id: string; secret: string }>>({});
  const [laeuft, setLaeuft] = useState('');

  const laden = useCallback(() => {
    fetch('/api/admin/dienste')
      .then((r) => r.json())
      .then((j) => {
        if (j?.error) { setFehler(j.error); setStand([]); return; }
        setStand(j.dienste ?? []);
      })
      .catch((e) => setFehler(String(e)));
  }, []);

  useEffect(() => { laden(); }, [laden]);

  async function speichern(dienst: string) {
    const werte = eingabe[dienst] ?? { id: '', secret: '' };
    setLaeuft(dienst);
    try {
      const r = await fetch('/api/admin/dienste', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dienst, id: werte.id, secret: werte.secret }),
      });
      const j = await r.json();
      if (!r.ok) { setFehler(j?.error ?? 'nicht gespeichert'); return; }
      setEingabe((v) => ({ ...v, [dienst]: { id: '', secret: '' } }));
      laden();
    } finally { setLaeuft(''); }
  }

  return (
    <main className="flex-1 bg-zinc-950 px-4 py-6 text-slate-200">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-xl font-semibold text-slate-100">
          <T>Anmeldedienste</T>
        </h1>
        <p className="mb-5 mt-1 text-sm text-slate-500">
          <T>Client-Id und Secret einfügen — ohne Datei und ohne Neustart.</T>
        </p>

        {fehler && (
          <p className="mb-4 rounded-lg border border-amber-800 bg-amber-950/30 px-3
                        py-2 text-xs text-amber-300">{fehler}</p>
        )}

        <div className="space-y-3">
          {(stand ?? []).map((d) => {
            const werte = eingabe[d.dienst] ?? { id: '', secret: '' };
            return (
              <div key={d.dienst}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="mb-3 flex items-center gap-3">
                  <img src={LOGO[d.dienst]} alt="" className="h-6 w-6 object-contain" />
                  <span className="text-sm font-semibold capitalize text-slate-100">
                    {d.dienst}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-[10px] uppercase
                                    tracking-wider ${d.woher === 'fehlt'
                    ? 'bg-zinc-800 text-slate-500'
                    : 'bg-emerald-500/10 text-emerald-400'}`}>
                    {d.woher === 'fehlt' ? <T>nicht eingerichtet</T>
                      : d.woher === 'eingetragen' ? <T>eingetragen</T>
                        : <T>aus .env.local</T>}
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <input value={werte.id} spellCheck={false}
                    onChange={(e) => setEingabe((v) => ({
                      ...v, [d.dienst]: { ...werte, id: e.target.value } }))}
                    placeholder="Client ID"
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                               font-mono text-xs text-slate-100 outline-none
                               placeholder:text-slate-600 focus:border-sky-500" />
                  <input value={werte.secret} spellCheck={false} type="password"
                    onChange={(e) => setEingabe((v) => ({
                      ...v, [d.dienst]: { ...werte, secret: e.target.value } }))}
                    placeholder="Client Secret"
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2
                               font-mono text-xs text-slate-100 outline-none
                               placeholder:text-slate-600 focus:border-sky-500" />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button onClick={() => void speichern(d.dienst)}
                    disabled={laeuft === d.dienst}
                    className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium
                               text-white transition hover:bg-sky-400
                               disabled:opacity-40">
                    <T>Speichern</T>
                  </button>
                  {d.woher === 'eingetragen' && (
                    <button onClick={() => {
                      setEingabe((v) => ({ ...v, [d.dienst]: { id: '', secret: '' } }));
                      void speichern(d.dienst);
                    }}
                      className="text-[11px] text-slate-500 underline hover:text-rose-400">
                      <T>Eintrag löschen</T>
                    </button>
                  )}
                </div>

                {/* Was der Betreiber beim Anbieter eintragen muss. Ohne diese
                    Zeile sucht er die Rueckrufadresse jedes Mal neu. */}
                <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                  <T>Holen bei</T>{' '}
                  <a href={`https://${d.seite}`} target="_blank" rel="noreferrer"
                    className="text-sky-400 underline">{d.seite}</a>
                  {' · '}<T>dort als Rückruf eintragen:</T>{' '}
                  <code className="rounded bg-zinc-950 px-1 py-0.5 text-slate-300">
                    {d.rueckrufVoll}
                  </code>
                </p>
              </div>
            );
          })}
          {stand?.length === 0 && !fehler && (
            <p className="text-sm text-slate-500"><T>Nichts zu zeigen.</T></p>
          )}
        </div>
      </div>
    </main>
  );
}
