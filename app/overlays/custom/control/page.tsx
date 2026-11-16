'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import T from '@/app/components/T';

/*
 * Score control of a Custom scoreboard - /overlays/custom/control?id=…&key=…
 *
 * Made for a phone next to the keyboard or a co-caster on another PC: two big
 * halves with + and −, nothing else. No login - the key in the link allows
 * changing the score of this one overlay and nothing more (see
 * app/api/overlay-config). It looks every 4 s whether someone else changed
 * the score, so two controllers never fight.
 */

interface Stand { p1: number; p2: number; stand: number }

export default function Steuerung() {
  const [id, setId] = useState('');
  const [key, setKey] = useState('');
  const [cfg, setCfg] = useState<Record<string, unknown> | null>(null);
  const [stand, setStand] = useState<Stand | null>(null);
  const [fehler, setFehler] = useState('');
  const [sendet, setSendet] = useState(false);
  const letzterKlick = useRef(0);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setId(p.get('id') ?? '');
    setKey(p.get('key') ?? '');
  }, []);

  const laden = useCallback(async () => {
    if (!id) return;
    try {
      const r = await fetch(`/api/overlay-config?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!r.ok) { setFehler('This scoreboard does not exist (any more).'); return; }
      const j = await r.json();
      setCfg(j.config ?? {});
      setStand({ p1: Number(j.config?.punkte1) || 0, p2: Number(j.config?.punkte2) || 0, stand: j.stand });
    } catch { setFehler('No connection.'); }
  }, [id]);
  useEffect(() => { void laden(); }, [laden]);

  // Follow changes made elsewhere - but not right after an own click.
  useEffect(() => {
    if (!id) return undefined;
    const uhr = window.setInterval(async () => {
      if (document.hidden || Date.now() - letzterKlick.current < 4000) return;
      try {
        const j = await (await fetch(`/api/overlay-config?nur=stand&id=${encodeURIComponent(id)}`, { cache: 'no-store' })).json();
        if (typeof j?.stand === 'number') setStand((alt) => (alt && alt.stand === j.stand ? alt : { p1: j.p1, p2: j.p2, stand: j.stand }));
      } catch { /* next round */ }
    }, 4000);
    return () => window.clearInterval(uhr);
  }, [id]);

  async function senden(p1: number, p2: number) {
    letzterKlick.current = Date.now();
    setStand((a) => ({ p1, p2, stand: a?.stand ?? 0 }));
    setSendet(true);
    setFehler('');
    try {
      const r = await fetch('/api/overlay-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, steuer: key, punkte: { p1, p2 } }),
      });
      const j = await r.json();
      if (!r.ok) setFehler(j?.error ?? 'Could not save');
      else setStand({ p1: j.p1, p2: j.p2, stand: j.stand });
    } catch { setFehler('No connection — try again.'); }
    setSendet(false);
  }

  if (!id) {
    return <main className="grid flex-1 place-items-center bg-[#07090d] p-6 text-sm text-slate-400"><T>This link is missing the scoreboard id.</T></main>;
  }

  const s = stand ?? { p1: 0, p2: 0, stand: 0 };
  const seite = (n: 1 | 2) => {
    const akzent = String(cfg?.[n === 1 ? 'akzent1' : 'akzent2'] ?? (n === 1 ? '#3b82f6' : '#ef4444'));
    const name = String(cfg?.[n === 1 ? 'tag1' : 'tag2'] || cfg?.[n === 1 ? 'name1' : 'name2'] || (n === 1 ? 'Left' : 'Right'));
    const spieler = (Array.isArray(cfg?.[n === 1 ? 'spieler1' : 'spieler2']) ? cfg?.[n === 1 ? 'spieler1' : 'spieler2'] as string[] : []).filter(Boolean);
    const wert = n === 1 ? s.p1 : s.p2;
    const setze = (v: number) => (n === 1 ? senden(Math.max(0, v), s.p2) : senden(s.p1, Math.max(0, v)));
    return (
      <div className="flex flex-col rounded-2xl border border-white/[0.07] bg-[#0f131b] p-4" style={{ boxShadow: `inset 0 4px 0 ${akzent}` }}>
        <p className="truncate text-center text-sm font-bold uppercase tracking-[0.2em]" style={{ color: akzent }}>{name}</p>
        {spieler.length > 0 && <p className="mt-1 truncate text-center text-[11px] uppercase tracking-wide text-slate-500">{spieler.join(' · ')}</p>}
        <p className="my-4 text-center font-mono text-7xl font-black tabular-nums text-white">{wert}</p>
        <button type="button" onClick={() => void setze(wert + 1)} disabled={!cfg}
          className="h-24 rounded-xl text-4xl font-black text-white transition active:scale-[0.98] disabled:opacity-40" style={{ background: akzent }}>+</button>
        <button type="button" onClick={() => void setze(wert - 1)} disabled={!cfg || wert <= 0}
          className="mt-2 h-14 rounded-xl border border-white/[0.12] text-2xl font-bold text-slate-300 transition active:scale-[0.98] disabled:opacity-30">−</button>
      </div>
    );
  };

  return (
    <main className="flex-1 bg-[#07090d] px-4 py-6 text-slate-200">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-sky-400"><T>Score control</T></p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-white">{String(cfg?.titel || 'Custom scoreboard')}</h1>
        <p className="mt-1 text-xs text-slate-500"><T>Every tap is on stream within about 2 seconds. Keep this page open as long as you like.</T></p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {seite(1)}
          {seite(2)}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => { if (window.confirm('Reset to 0 : 0?')) void senden(0, 0); }}
            className="rounded-lg border border-white/[0.1] px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200">
            <T>Reset to 0 : 0</T>
          </button>
          <span className="text-xs text-slate-500">{sendet ? '…' : fehler ? '' : '✓'}</span>
          {fehler && <span className="text-xs text-rose-400">{fehler}</span>}
        </div>
      </div>
    </main>
  );
}
