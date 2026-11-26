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
import T from '../port/app/components/T';
import SeitenKopf from '../port/app/components/SeitenKopf';

interface Stand {
  dienst: 'twitch' | 'discord' | 'google' | 'epic';
  woher: 'eingetragen' | 'umgebung' | 'fehlt';
  seite: string;
  rueckrufVoll: string;
}

const LOGO: Record<string, string> = {
  twitch: '/icons/twitch.png',
  discord: '/icons/discord.png',
  google: '/icons/google.svg',
  epic: '/icons/epic.svg',
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
      if (!r.ok) { setFehler(j?.error ?? 'not saved'); return; }
      setEingabe((v) => ({ ...v, [dienst]: { id: '', secret: '' } }));
      laden();
    } finally { setLaeuft(''); }
  }

  return (
    <main className="text-white/85">
      <div className="">
        <SeitenKopf className="mb-5" marke={<T>Anmeldung</T>} titel={<T>Sign-in services</T>}
          text={<T>Paste client ID and secret — no file, no restart.</T>} />

        {fehler && (
          <p className="mb-4 rounded-lg border border-amber-800 bg-amber-950/30 px-3
                        py-2 text-xs text-amber-300">{fehler}</p>
        )}

        <div className="space-y-3">
          {(stand ?? []).map((d) => {
            const werte = eingabe[d.dienst] ?? { id: '', secret: '' };
            return (
              <div key={d.dienst}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center gap-3">
                  <img src={LOGO[d.dienst]} alt="" className="h-6 w-6 object-contain" />
                  <span className="text-sm font-semibold capitalize text-white">
                    {d.dienst}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-[10px] uppercase
                                    tracking-wider ${d.woher === 'fehlt'
                    ? 'bg-white/[0.07] text-white/40'
                    : 'bg-emerald-500/10 text-emerald-400'}`}>
                    {d.woher === 'fehlt' ? <T>not set up</T>
                      : d.woher === 'eingetragen' ? <T>eingetragen</T>
                        : <T>from .env.local</T>}
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <input value={werte.id} spellCheck={false}
                    onChange={(e) => setEingabe((v) => ({
                      ...v, [d.dienst]: { ...werte, id: e.target.value } }))}
                    placeholder="Client ID"
                    className="rounded-lg border border-white/10 bg-black/40 px-3 py-2
                               font-mono text-xs text-white outline-none
                               placeholder:text-white/30 focus:border-sky-500" />
                  <input value={werte.secret} spellCheck={false} type="password"
                    onChange={(e) => setEingabe((v) => ({
                      ...v, [d.dienst]: { ...werte, secret: e.target.value } }))}
                    placeholder="Client Secret"
                    className="rounded-lg border border-white/10 bg-black/40 px-3 py-2
                               font-mono text-xs text-white outline-none
                               placeholder:text-white/30 focus:border-sky-500" />
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
                      className="text-[11px] text-white/40 underline hover:text-rose-400">
                      <T>Delete entry</T>
                    </button>
                  )}
                </div>

                {/* Was der Betreiber beim Anbieter eintragen muss. Ohne diese
                    Zeile sucht er die Rueckrufadresse jedes Mal neu. */}
                <p className="mt-3 text-[11px] leading-relaxed text-white/40">
                  <T>Get it at</T>{' '}
                  <a href={`https://${d.seite}`} target="_blank" rel="noreferrer"
                    className="text-sky-400 underline">{d.seite}</a>
                    {' · '}<T>enter there as callback:</T>{' '}
                    <code className="rounded bg-black/40 px-1 py-0.5 text-white/70">
                      {d.rueckrufVoll}
                    </code>
                </p>
              </div>
            );
          })}
          {stand?.length === 0 && !fehler && (
            <p className="text-sm text-white/40"><T>Nothing to show.</T></p>
          )}
        </div>
      </div>
    </main>
  );
}
