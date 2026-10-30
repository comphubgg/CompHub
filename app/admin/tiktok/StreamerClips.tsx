'use client';

import { useCallback, useEffect, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

/*
 * Streamer-Clips (Aufgabe 167, lib/tiktokClips): hier erzeugt der Admin den Link fuer einen Streamer (seine Freigabe), sieht, wer verbunden ist, und
 * waehlt, wo dessen Facecam im Stream sitzt - fertige Vorlagen statt Regler. Die geschnittenen Clips erscheinen darunter wie jedes TikTok-Video.
 */

interface Streamer { login: string; name: string; facecam: string; verbunden: number }
interface Link { fuer: string; erstellt: number; link: string }

const ECKEN: Array<[string, string]> = [['oben-links', 'Oben links'], ['oben-rechts', 'Oben rechts'], ['unten-links', 'Unten links'], ['unten-rechts', 'Unten rechts'], ['keine', 'Keine Facecam']];

export default function StreamerClips() {
  const t = useT();
  const [daten, setDaten] = useState<{ streamer: Streamer[]; links: Link[] } | null>(null);
  const [fuer, setFuer] = useState('gripey');
  const [neu, setNeu] = useState('');
  const [kopiert, setKopiert] = useState('');

  const laden = useCallback(async () => {
    const j = await fetch('/api/admin/tiktok-clips', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
    if (j?.ok) setDaten({ streamer: j.streamer, links: j.links });
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  const schicke = async (b: Record<string, string>) => {
    const j = await fetch('/api/admin/tiktok-clips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => null);
    if (j?.link) setNeu(j.link);
    await laden();
  };
  const kopiere = async (text: string) => { try { await navigator.clipboard.writeText(text); setKopiert(text); } catch { /* ohne Zwischenablage */ } };

  return (
    <section className="mb-6 rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-[0_10px_30px_rgba(15,23,42,.18)]">
      <h2 className="text-sm font-bold text-white"><T>Streamer-Clips</T></h2>
      <p className="mt-1 max-w-2xl text-xs text-slate-400">
        <T>Jeden Vormittag schneidet CompHub die drei besten Twitch-Clips der letzten 24 Stunden jedes verbundenen Streamers hochkant (Facecam oben, Spiel unten, Titel). Sie erscheinen hier unten bei den Videos.</T>
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-slate-400"><T>Streamer</T>
          <input value={fuer} onChange={(e) => setFuer(e.target.value)} spellCheck={false}
            className="w-48 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
        </label>
        <button type="button" onClick={() => void schicke({ aktion: 'link', fuer })}
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400">
          <T>Link für den Streamer erzeugen</T>
        </button>
      </div>
      {neu && (
        <div className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-100">
          <p><T>Schick diesen Link dem Streamer. Er meldet sich bei Twitch an und stimmt zu - danach ist er verbunden (14 Tage gültig).</T></p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-zinc-950 px-2 py-1 text-[11px] text-slate-200">{neu}</code>
            <button type="button" onClick={() => void kopiere(neu)} className="rounded-md border border-sky-500/50 px-2.5 py-1 font-semibold text-sky-200 hover:bg-sky-500/20">
              {kopiert === neu ? <T>Kopiert</T> : <T>Kopieren</T>}
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {daten?.streamer.map((s) => (
          <div key={s.login} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <p className="flex items-center justify-between gap-2">
              <span className="text-base font-extrabold text-white">{s.name}</span>
              <span className="text-[11px] text-emerald-400"><T>verbunden</T> · {new Date(s.verbunden).toLocaleDateString('de-CH')}</span>
            </p>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><T>Wo sitzt die Facecam?</T></p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ECKEN.map(([k, n]) => (
                <button key={k} type="button" onClick={() => void schicke({ aktion: 'facecam', login: s.login, ecke: k })} aria-pressed={s.facecam === k}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${s.facecam === k ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-zinc-700 text-slate-300 hover:border-zinc-500'}`}>
                  {t(n)}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { if (window.confirm(t('Verbindung zu diesem Streamer lösen?'))) void schicke({ aktion: 'trennen', login: s.login }); }}
              className="mt-3 text-[11px] text-slate-500 underline hover:text-rose-400"><T>Verbindung lösen</T></button>
          </div>
        ))}
        {daten && !daten.streamer.length && <p className="text-xs text-slate-500"><T>Noch kein Streamer verbunden.</T></p>}
      </div>
      {!!daten?.links.length && (
        <p className="mt-3 text-[11px] text-slate-500"><T>Offene Links:</T> {daten.links.map((l) => l.fuer || '?').join(', ')}</p>
      )}
    </section>
  );
}
