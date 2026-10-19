'use client';

/*
 * Die Posts des Tages (Betreiber, 14.10.2026) - nur fuer den Admin.
 *
 * Jeden Morgen kommt in #admin-posts ein Link hierher. Drei Posts mit fertigem Text (Kopieren-Knopf) und einem Bild (zum Herunterladen); mit
 * "Anderen Post" ersetzt man einen, der nicht passt, durch einen, der noch nie an der Reihe war. Alles aus den echten Zahlen der Seite
 * (lib/tagesposts); keine Hashtags.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import { useZugang } from '@/app/lib/zugang';

interface Post { nr: number; art: string; schluessel: string; titel: string; text: string }
interface Plan { datum: string; posts: Post[] }

const ART: Record<string, string> = { ergebnis: 'Result', cup: 'Cup', spieler: 'Player', duell: 'Head to head', rekord: 'Leaders', ranking: 'Ranking', promo: 'Promo', update: 'Update', karte: 'Map' };

const tagVersatz = (datum: string, tage: number) => new Date(Date.parse(`${datum}T12:00:00Z`) + tage * 86_400_000).toISOString().slice(0, 10);

export default function PostsDesTages() {
  const zugang = useZugang();
  const { datum } = useParams<{ datum: string }>();
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [fehler, setFehler] = useState('');
  const [kopiert, setKopiert] = useState<number | null>(null);
  const [bildKopiert, setBildKopiert] = useState<number | null>(null);
  const [ersetzt, setErsetzt] = useState<number | null>(null);
  const [stand, setStand] = useState(0);

  const laden = useCallback(async () => {
    setFehler('');
    try {
      const r = await fetch(`/api/posts?datum=${encodeURIComponent(datum)}`, { cache: 'no-store' });
      const j = await r.json();
      if (!j?.ok) { setFehler(j?.error || 'Nicht ladbar.'); setPlan(null); return; }
      setPlan(j.plan ?? null);
    } catch { setFehler('Nicht ladbar.'); setPlan(null); }
  }, [datum]);
  useEffect(() => { if (zugang.admin) void laden(); }, [zugang.admin, laden]);

  const kopieren = async (p: Post) => {
    try { await navigator.clipboard.writeText(p.text); setKopiert(p.nr); setTimeout(() => setKopiert(null), 1800); } catch { /* ohne Zwischenablage kann man den Text markieren */ }
  };
  /* Das Bild in die Zwischenablage (Betreiber, 19.10.2026: "nicht immer herunterladen, ich will es kopieren"); geht das im Browser nicht, wird es heruntergeladen. */
  const bildKopieren = async (p: Post) => {
    const adresse = `/api/post-bild?datum=${datum}&nr=${p.nr}&v=${stand}`;
    try {
      const blob = await (await fetch(adresse)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' }) })]);
      setBildKopiert(p.nr); setTimeout(() => setBildKopiert(null), 1800);
    } catch {
      const a = document.createElement('a'); a.href = adresse; a.download = `comphub-${datum}-${p.nr + 1}.png`; a.click();
    }
  };
  const anderen = async (nr: number) => {
    setErsetzt(nr);
    try {
      const r = await fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ datum, aktion: 'neu', nr }) });
      const j = await r.json();
      if (j?.ok) { setPlan(j.plan); setStand((s) => s + 1); } else setFehler(j?.error || 'Nicht ersetzt.');
    } finally { setErsetzt(null); }
  };

  if (zugang.laedt) return <main className="min-h-screen bg-zinc-950"><LadeSchirm /></main>;
  if (!zugang.admin) return <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-sm text-slate-400"><T>Nur für den Admin.</T></main>;

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-500"><T>Tagesposts</T></p>
            <h1 className="schrift-anzeige mt-1 text-4xl font-extrabold tracking-tight sm:text-5xl">{datum}</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400"><T>Drei Posts für heute: Text und Bild kopieren, in X einfügen. Alles aus echten Zahlen, ohne Hashtags, nichts kommt doppelt.</T></p>
          </div>
          <div className="flex gap-2">
            <Link href={`/posts/${tagVersatz(datum, -1)}`} className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-bold text-slate-300 transition hover:border-sky-500 hover:text-sky-500">← {tagVersatz(datum, -1)}</Link>
            <Link href={`/posts/${tagVersatz(datum, 1)}`} className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-bold text-slate-300 transition hover:border-sky-500 hover:text-sky-500">{tagVersatz(datum, 1)} →</Link>
          </div>
        </div>

        {plan === undefined && <div className="mt-10"><LadeSchirm /></div>}
        {fehler && <p className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">{fehler}</p>}
        {plan === null && !fehler && <p className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-8 text-center text-sm text-slate-400"><T>Für diesen Tag gibt es noch keine Posts.</T></p>}
        {plan && plan.posts.length === 0 && <p className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-8 text-center text-sm text-slate-400"><T>Heute lässt die Datenlage keinen Post zu - es wird nichts erfunden.</T></p>}

        <div className="mt-8 space-y-6">
          {plan?.posts.map((p) => (
            <article key={`${p.nr}-${p.schluessel}-${stand}`} className="grid gap-5 rounded-3xl border border-zinc-800 bg-zinc-900 p-4 shadow-[0_10px_30px_rgba(15,23,42,.10)] lg:grid-cols-[1.15fr_1fr] lg:p-5">
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/post-bild?datum=${datum}&nr=${p.nr}&v=${stand}`} alt="" className="w-full rounded-2xl border border-zinc-800 bg-zinc-950" />
                <button type="button" onClick={() => void bildKopieren(p)}
                  className="mt-3 inline-block rounded-full border border-zinc-700 px-4 py-2 text-xs font-bold text-slate-300 transition hover:border-sky-500 hover:text-sky-500">
                  {bildKopiert === p.nr ? <T>Bild kopiert ✓</T> : <T>Bild kopieren</T>}
                </button>
              </div>
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-sky-500 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">{ART[p.art] ?? p.art}</span>
                  <h2 className="min-w-0 truncate text-sm font-bold text-slate-200">{p.titel}</h2>
                </div>
                <pre className="mt-3 flex-1 whitespace-pre-wrap rounded-2xl border border-zinc-800 bg-zinc-950 p-4 font-sans text-sm leading-relaxed text-slate-200">{p.text}</pre>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void kopieren(p)}
                    className="rounded-full bg-sky-500 px-5 py-2 text-xs font-bold text-white transition hover:bg-sky-400">
                    {kopiert === p.nr ? <T>Kopiert ✓</T> : <T>Text kopieren</T>}
                  </button>
                  <button type="button" disabled={ersetzt === p.nr} onClick={() => void anderen(p.nr)}
                    className="rounded-full border border-zinc-700 px-5 py-2 text-xs font-bold text-slate-300 transition hover:border-sky-500 hover:text-sky-500 disabled:opacity-50">
                    {ersetzt === p.nr ? <T>sucht …</T> : <T>Anderen Post</T>}
                  </button>
                  <span className="ml-auto text-[11px] tabular-nums text-slate-500">{p.text.length} / 280+</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
