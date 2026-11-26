import { useCallback, useEffect, useState } from 'react';
import T from '../port/app/components/T';
import SeitenKopf from '../port/app/components/SeitenKopf';
import { NurAdmins } from '../teile';
import { useT } from '../port/app/components/SprachProvider';
import { tweetLaenge } from '../port/lib/ftPosts';
import type { Format, PostIdee } from '../port/lib/postIdeen';

/*
 * Post-Ideen fuer jeden Tag (Betreiber, 18.11.2026: X soll ein- bis zweimal taeglich posten, nicht nur nach Cups - "ich habe nie Ideen").
 *
 * Oben die zwei Ideen fuer heute (nach Relevanz: anstehende Finals, frische Daten, Meilensteine), darunter alle anderen, die die Daten heute tragen.
 * Jede mit Bild (1600 x 900 fuer Listen, 1500 x 500 als Banner), fertigem englischem Text, "Text kopieren" und "Bild herunterladen".
 * Gerechnet wird auf dem Server (/api/post-ideen, lib/postIdeen.ts) aus den eigenen Daten - nichts von Hand, nichts geschaetzt.
 */

interface Stand { erstellt: number; ideen: PostIdee[]; auswahl: string[]; fehler: string[] }

const ART_NAME: Record<PostIdee['art'], string> = {
  'org-vertretung': 'Orgs in the Grand Final', 'org-monat': 'Orgs · month', 'spieler-woche': 'Player of the week', 'laender-woche': 'Countries of the week',
  meilenstein: 'Milestone', 'pr-aufsteiger': 'Power Rankings', konstanz: 'Consistency', zeitplan: 'Schedule', promo: 'Promo',
};

function IdeeKarte({ idee, heute }: { idee: PostIdee; heute: boolean }) {
  const t = useT();
  const [format, setFormat] = useState<Format>(idee.standardFormat);
  const [kopiert, setKopiert] = useState(false);
  const [geladen, setGeladen] = useState(false);
  const bild = `/api/post-ideen?bild=${encodeURIComponent(idee.id)}&format=${format}`;
  const laenge = tweetLaenge(idee.text);
  const kopieren = async () => {
    try { await navigator.clipboard.writeText(idee.text); setKopiert(true); setTimeout(() => setKopiert(false), 1800); } catch { /* Browser ohne Zugriff */ }
  };
  return (
    <article className={`overflow-hidden rounded-2xl border bg-white/[0.035] backdrop-blur-xl ${heute ? 'border-sky-500/60 shadow-[0_0_0_1px_rgba(14,165,233,.25)]' : 'border-white/10'}`}>
      <div className="relative bg-black/40" style={{ aspectRatio: format === '1500x500' ? '3 / 1' : '16 / 9' }}>
        {!geladen && <div className="absolute inset-0 animate-pulse bg-white/[0.035] backdrop-blur-xl" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={bild} src={bild} alt={idee.titel} loading="lazy" onLoad={() => setGeladen(true)} className="absolute inset-0 h-full w-full object-contain" />
      </div>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-sky-300"><T>{ART_NAME[idee.art]}</T></span>
          <span className="text-[11px] font-semibold text-white/40">{t('Relevance')} {idee.relevanz}</span>
          <div className="ml-auto flex gap-1 rounded-full border border-white/10 bg-black/40 p-0.5">
            {(['1600x900', '1500x500'] as Format[]).map((f) => (
              <button key={f} type="button" onClick={() => { setFormat(f); setGeladen(false); }}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${format === f ? 'bg-sky-500 text-white' : 'text-white/55 hover:text-white'}`}>{f.replace('x', ' × ')}</button>
            ))}
          </div>
        </div>
        <h3 className="text-base font-extrabold text-white">{idee.titel}</h3>
        <p className="text-xs leading-relaxed text-white/55">{idee.grund}</p>
        <textarea readOnly value={idee.text} rows={Math.min(14, idee.text.split('\n').length + 1)}
          className="w-full resize-y rounded-lg border border-white/15 bg-black/40 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-white outline-none focus:border-sky-500" />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={kopieren} className="rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-sky-400">
            {kopiert ? t('Copied ✓') : t('Text kopieren')}
          </button>
          <a href={`${bild}&download=1`} className="rounded-lg border border-white/15 px-3.5 py-2 text-xs font-bold text-white/85 hover:border-sky-500 hover:text-white">
            <T>Bild herunterladen</T> ({format.replace('x', ' × ')})
          </a>
          <span className={`ml-auto text-[11px] font-semibold ${laenge > 280 ? 'text-amber-400' : 'text-white/40'}`}>
            {laenge} {t('Zeichen')}{laenge > 280 ? ` · ${t('X Premium needed')}` : ''}
          </span>
        </div>
      </div>
    </article>
  );
}

export default function PostIdeenSeite() {
  const t = useT();
  const [erlaubt, setErlaubt] = useState<boolean | null>(null);
  const [stand, setStand] = useState<Stand | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState('');

  const laden = useCallback(async (neu: boolean) => {
    setLaedt(true); setFehler('');
    try {
      const r = await fetch(`/api/post-ideen${neu ? '?neu=1' : ''}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.fehler ?? `HTTP ${r.status}`);
      setStand(j as Stand);
    } catch (e) { setFehler((e as Error).message); } finally { setLaedt(false); }
  }, []);
  useEffect(() => {
    fetch('/api/auth/check-admin').then((r) => r.json()).then((j) => {
      const admin = j?.isAdmin === true;
      setErlaubt(admin);
      if (admin) void laden(false);
    }).catch(() => setErlaubt(false));
  }, [laden]);

  if (erlaubt === false) return <NurAdmins />;

  const heute = stand ? stand.auswahl.map((id) => stand.ideen.find((i) => i.id === id)).filter((i): i is PostIdee => !!i) : [];
  const rest = stand ? stand.ideen.filter((i) => !stand.auswahl.includes(i.id)) : [];

  return (
    <main className="space-y-6">
      <SeitenKopf marke={t('Posts')} titel={t('Post ideas')}
        text={t('Ready posts for X every day: an image in CompHub style and English text with flags and @ accounts - only from real data (fields, orgs, prize money, Power Rankings, cup catalogue). The two best for today at the top.')}
        rechts={(
          <button type="button" onClick={() => laden(true)} disabled={laedt}
            className="rounded-lg border border-white/15 bg-black/40 px-3.5 py-2 text-xs font-bold text-white/85 hover:border-sky-500 disabled:opacity-50">
            {laedt ? t('Computing …') : t('Recompute')}
          </button>
        )} />

      {fehler && <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{fehler}</p>}
      {!stand && !fehler && <p className="text-sm text-white/55"><T>The ideas are being computed - the first call takes up to a minute.</T></p>}

      {stand && (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-extrabold uppercase tracking-[0.16em] text-sky-400"><T>Post today</T></h2>
            {heute.length
              ? <div className="grid gap-4 lg:grid-cols-2">{heute.map((i) => <IdeeKarte key={i.id} idee={i} heute />)}</div>
              : <p className="text-sm text-white/55"><T>The data carries no idea today.</T></p>}
          </section>
          {rest.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-extrabold uppercase tracking-[0.16em] text-white/55"><T>More ideas</T> ({rest.length})</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rest.map((i) => <IdeeKarte key={i.id} idee={i} heute={false} />)}</div>
            </section>
          )}
          {stand.fehler.length > 0 && (
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-200">
              <p className="mb-1 font-bold"><T>Not available</T></p>
              <ul className="list-disc space-y-0.5 pl-5">{stand.fehler.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </section>
          )}
          <p className="text-[11px] text-white/40">{t('Stand')} {new Date(stand.erstellt).toLocaleString()}</p>
        </>
      )}
    </main>
  );
}
