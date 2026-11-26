import { useCallback, useEffect, useState } from 'react';
import T from '../port/app/components/T';
import { useT } from '../port/app/components/SprachProvider';

/*
 * Streamer-Clips (Aufgabe 167, lib/tiktokClips): hier erzeugt der Admin den Link fuer einen Streamer (seine Freigabe), sieht, wer verbunden ist, und
 * waehlt, wo dessen Facecam im Stream sitzt - fertige Vorlagen statt Regler. Die geschnittenen Clips erscheinen darunter wie jedes TikTok-Video.
 */

interface Streamer { login: string; name: string; facecam: string; verbunden: number }
interface Link { fuer: string; erstellt: number; link: string }

const ECKEN: Array<[string, string]> = [['oben-links', 'Top left'], ['oben-rechts', 'Top right'], ['unten-links', 'Bottom left'], ['unten-rechts', 'Bottom right'], ['keine', 'No facecam']];

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
    <section className="mb-6 rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-5">
      <h2 className="text-sm font-bold text-white"><T>Streamer-Clips</T></h2>
      <p className="mt-1 max-w-2xl text-xs text-white/55">
        <T>Every morning CompHub cuts the three best Twitch clips of the last 24 hours of every connected streamer to portrait (facecam on top, game below, title). They show up below with the videos.</T>
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-white/55"><T>Streamer</T>
          <input value={fuer} onChange={(e) => setFuer(e.target.value)} spellCheck={false}
            className="w-48 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-sky-500" />
        </label>
        <button type="button" onClick={() => void schicke({ aktion: 'link', fuer })}
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400">
          <T>Create a link for the streamer</T>
        </button>
      </div>
      {neu && (
        <div className="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-100">
          <p><T>Send this link to the streamer. They sign in with Twitch and agree - then they are connected (valid 14 days).</T></p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-black/40 px-2 py-1 text-[11px] text-white/85">{neu}</code>
            <button type="button" onClick={() => void kopiere(neu)} className="rounded-md border border-sky-500/50 px-2.5 py-1 font-semibold text-sky-200 hover:bg-sky-500/20">
              {kopiert === neu ? <T>Kopiert</T> : <T>Kopieren</T>}
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {daten?.streamer.map((s) => (
          <div key={s.login} className="rounded-2xl border border-white/10 bg-black/40 p-4">
            <p className="flex items-center justify-between gap-2">
              <span className="text-base font-extrabold text-white">{s.name}</span>
              <span className="text-[11px] text-emerald-400"><T>verbunden</T> · {new Date(s.verbunden).toLocaleDateString('de-CH')}</span>
            </p>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-white/40"><T>Where is the facecam?</T></p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ECKEN.map(([k, n]) => (
                <button key={k} type="button" onClick={() => void schicke({ aktion: 'facecam', login: s.login, ecke: k })} aria-pressed={s.facecam === k}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${s.facecam === k ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-white/15 text-white/70 hover:border-white/30'}`}>
                  {t(n)}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { if (window.confirm(t('Disconnect this streamer?'))) void schicke({ aktion: 'trennen', login: s.login }); }}
              className="mt-3 text-[11px] text-white/40 underline hover:text-rose-400"><T>Disconnect</T></button>
          </div>
        ))}
        {daten && !daten.streamer.length && <p className="text-xs text-white/40"><T>No streamer connected yet.</T></p>}
      </div>
      {!!daten?.links.length && (
        <p className="mt-3 text-[11px] text-white/40"><T>Open links:</T> {daten.links.map((l) => l.fuer || '?').join(', ')}</p>
      )}
    </section>
  );
}
