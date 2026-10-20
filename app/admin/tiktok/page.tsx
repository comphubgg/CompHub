'use client';

import { useCallback, useEffect, useState } from 'react';
import T from '@/app/components/T';
import SeitenKopf from '@/app/components/SeitenKopf';
import { useT } from '@/app/components/SprachProvider';

/*
 * TikTok (Betreiber, 20.10.2026): das tägliche Video mit den fünf Ersten des letzten Cups - fertig zum Herunterladen, dazu der Text zum Kopieren. Hochgeladen wird von Hand
 * (TikTok erlaubt Programmen das Hochladen nicht ohne eigene Freigabe). Gebaut wird jeden Morgen um 7:45 UTC von selbst (.github/workflows/tiktok-tag.yml); mit dem Knopf
 * "Jetzt ein neues bauen" startest du den Ablauf sofort.
 */

interface Video { datum: string; titel: string; region: string; dauer: number; mb: number; text: string; seite: string | null; video: string; datei: string }

export default function TiktokSeite() {
  const t = useT();
  const [liste, setListe] = useState<Video[] | null>(null);
  const [fehler, setFehler] = useState('');
  const [stand, setStand] = useState('');
  const [kopiert, setKopiert] = useState('');

  const holen = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/tiktok', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok || !j.ok) { setFehler(j.fehler ?? t('Die Liste ließ sich nicht laden.')); return; }
      setFehler(''); setListe(j.videos ?? []);
    } catch { setFehler(t('Die Liste ließ sich nicht laden.')); }
  }, [t]);
  useEffect(() => { void Promise.resolve().then(holen); }, [holen]);

  const neu = async () => {
    setStand(t('startet …'));
    try {
      const r = await fetch('/api/admin/tiktok', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'neu' }) });
      const j = await r.json();
      setStand(r.ok && j.ok ? t('Gestartet - in etwa zehn Minuten ist das Video hier.') : (j.fehler ?? t('Das hat nicht geklappt.')));
    } catch { setStand(t('Das hat nicht geklappt.')); }
  };

  const kopieren = async (v: Video) => {
    try { await navigator.clipboard.writeText(v.text); setKopiert(v.datei); setTimeout(() => setKopiert(''), 2000); } catch { /* ohne Zwischenablage bleibt der Text zum Markieren */ }
  };

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <SeitenKopf className="mb-6" marke={<T>Promotion</T>} titel={<T>TikTok-Videos</T>}
          text={<T>Jeden Morgen entsteht von selbst ein kurzes Hochformat-Video mit den fünf Ersten des letzten Cups - englische Stimme, Musik, Untertitel. Hier lädst du es herunter und kopierst den Text; hochgeladen wird von Hand.</T>}
          rechts={<button type="button" onClick={() => void neu()} className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"><T>Jetzt ein neues bauen</T></button>} />
        {stand && <p className="mb-4 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-300">{stand}</p>}
        {fehler && <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{fehler}</p>}
        {liste === null && !fehler && <p className="py-10 text-center text-xs text-slate-600"><T>Wird geladen …</T></p>}
        {liste && !liste.length && !fehler && (
          <p className="rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-8 text-center text-sm text-slate-400"><T>Noch kein Video da. Der erste Lauf kommt morgen früh - oder du startest ihn oben.</T></p>
        )}
        <div className="grid gap-5 md:grid-cols-2">
          {(liste ?? []).map((v) => (
            <article key={v.datei} className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-[0_10px_30px_rgba(15,23,42,.18)]">
              <video src={v.video} controls preload="metadata" playsInline className="mx-auto block aspect-[9/16] max-h-[540px] w-full bg-black object-contain" />
              <div className="p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-400">{v.datum} · {v.region} · {Math.round(v.dauer)} s · {v.mb} MB</p>
                <h2 className="mt-1 text-lg font-extrabold leading-tight text-white">{v.titel}</h2>
                <textarea readOnly value={v.text} rows={8} className="mt-3 w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs leading-relaxed text-slate-300 outline-none" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={v.video} download={v.datei} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"><T>Video herunterladen</T></a>
                  <button type="button" onClick={() => void kopieren(v)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-sky-500 hover:text-sky-400">
                    {kopiert === v.datei ? <T>Kopiert</T> : <T>Text kopieren</T>}
                  </button>
                  {v.seite && <a href={v.seite} target="_blank" rel="noreferrer" className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-slate-400 transition hover:text-slate-200"><T>Cup-Seite</T></a>}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
