'use client';
/*
 * Die Bausteine des Archivs - gemeinsam fuer das Spielerprofil (Reiter
 * "Spielerarchiv"), die Cup-Seite (Reiter "Archiv") und die Verwaltung.
 *
 *   - ArchivVideo: ein Video, das hier abspielt. Der Betreiber: "Videos
 *     soll man wirklich in der Webseite einfach abspielen lassen koennen,
 *     ohne dass man irgendwo weitergeleitet wird." YouTube, Twitch, TikTok
 *     und X werden eingebettet; nur was keiner dieser Dienste ist, bleibt
 *     ein Link.
 *   - ArchivRaster: die Bilder als Mauerwerk, darunter die Videos.
 *   - Lichtkasten: das grosse Bild mit Pfeilen und Escape.
 *   - SpielerSuche: weitere Spieler zuordnen - nach Namen gesucht,
 *     gespeichert wird die Konto-Id.
 *   - CupWahl: den Cup der Seite waehlen, zu dem ein Event gehoert.
 */
import { useEffect, useMemo, useState } from 'react';
import TeamFlagge from '@/components/TeamFlagge';
import T from '@/app/components/T';
import { videoArt, type GalerieEintrag } from '@/lib/galerieTypen';

export interface SpielerAngabe { name: string; land: string | null; bild: string | null }
interface Treffer { epicId: string; anzeige: string; land?: string | null; bild?: string | null }

export const bildPfad = (e: GalerieEintrag) => `/api/galerie?bild=${encodeURIComponent(e.datei ?? '')}`;

/* ------------------------------------------------------------- Video */

/**
 * Der eingebettete Beitrag von X meldet seine Hoehe selbst - ueber eine
 * Nachricht an das umgebende Fenster, so wie es auch das Skript von X
 * auswertet. Ohne diese Meldung waere der Rahmen entweder zu kurz oder
 * hinge unten leer.
 */
function XBeitrag({ kennung, titel }: { kennung: string; titel: string }) {
  const [hoehe, setHoehe] = useState(560);
  const marke = useMemo(() => `x-${kennung}-${Math.random().toString(36).slice(2, 8)}`, [kennung]);
  useEffect(() => {
    const zuhoeren = (ev: MessageEvent) => {
      if (ev.origin !== 'https://platform.twitter.com') return;
      const d = ev.data as { 'twttr.embed'?: { method?: string; params?: Array<{ height?: number; embedId?: string }> } } | undefined;
      const e = d?.['twttr.embed'];
      if (!e || e.method !== 'twttr.private.resize') return;
      const p = e.params?.[0];
      if (p?.embedId === marke && typeof p.height === 'number' && p.height > 100) setHoehe(Math.ceil(p.height));
    };
    window.addEventListener('message', zuhoeren);
    return () => window.removeEventListener('message', zuhoeren);
  }, [marke]);
  const src = `https://platform.twitter.com/embed/Tweet.html?id=${encodeURIComponent(kennung)}&embedId=${marke}`
    + '&theme=dark&dnt=true&hideThread=true&frame=false&lang=en&width=550';
  return (
    <div className="w-full overflow-hidden rounded-lg border border-zinc-800 bg-black">
      <iframe className="block w-full" style={{ height: hoehe }} src={src} title={titel} allowFullScreen loading="lazy"
        allow="autoplay; encrypted-media; picture-in-picture" />
    </div>
  );
}

/** Ein Video, das hier abspielt - oder ein Link, wo Einbetten nicht geht. */
export function ArchivVideo({ e, t }: { e: GalerieEintrag; t: (s: string) => string }) {
  const { art, kennung } = videoArt(e.url ?? '');
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const rahmen = 'aspect-video w-full overflow-hidden rounded-lg border border-zinc-800 bg-black';
  const titel = e.titel || 'Video';
  if (art === 'youtube') {
    return <div className={rahmen}><iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${kennung}?rel=0`} title={titel} allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowFullScreen loading="lazy" /></div>;
  }
  if (art === 'twitch-clip') {
    return <div className={rahmen}><iframe className="h-full w-full" src={`https://clips.twitch.tv/embed?clip=${kennung}&parent=${host}&autoplay=false`} title={titel} allowFullScreen loading="lazy" /></div>;
  }
  if (art === 'twitch-video') {
    return <div className={rahmen}><iframe className="h-full w-full" src={`https://player.twitch.tv/?video=${kennung}&parent=${host}&autoplay=false`} title={titel} allowFullScreen loading="lazy" /></div>;
  }
  if (art === 'tiktok') {
    return <div className="w-full overflow-hidden rounded-lg border border-zinc-800 bg-black" style={{ aspectRatio: '9 / 16', maxHeight: 560 }}><iframe className="h-full w-full" src={`https://www.tiktok.com/embed/v2/${kennung}`} title={titel} allowFullScreen loading="lazy" /></div>;
  }
  if (art === 'x') return <XBeitrag kennung={kennung} titel={titel} />;
  return (
    <a href={e.url} target="_blank" rel="noreferrer"
      className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border
                 border-zinc-800 bg-zinc-900/60 text-slate-300 transition hover:border-sky-500 hover:text-sky-400">
      <span className="text-2xl">▶</span>
      <span className="text-sm font-semibold">{t('Video öffnen')}</span>
      <span className="max-w-[90%] truncate text-[11px] text-slate-600">{e.url}</span>
    </a>
  );
}

/* -------------------------------------------------------------- Chip */

export function SpielerChip({ id, spieler, klein }: { id: string; spieler: Record<string, SpielerAngabe>; klein?: boolean }) {
  const s = spieler[id];
  if (!s) return null;
  return (
    <span className={`flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950/80 py-0.5 pl-0.5 pr-2 text-slate-200 ${klein ? 'text-[11px]' : 'text-xs'}`}>
      {s.bild
        /* eslint-disable-next-line @next/next/no-img-element */
        ? <img src={s.bild} alt="" className={`${klein ? 'h-5 w-5' : 'h-6 w-6'} rounded-full object-cover object-top`} />
        : <TeamFlagge groesse={klein ? 14 : 16} laender={[s.land ?? undefined]} />}
      <span className="font-semibold uppercase tracking-wide">{s.name}</span>
    </span>
  );
}

/* ------------------------------------------------------------ Raster */

/**
 * Die Bilder als Mauerwerk, die Videos darunter. "ohne" ist der Spieler,
 * dessen Profil das ist - er steht nicht noch einmal auf jedem Bild.
 */
export function ArchivRaster({ liste, spieler, ohne, istAdmin, aufOeffnen, aufEntfernen, t }: {
  liste: GalerieEintrag[]; spieler: Record<string, SpielerAngabe>; ohne?: string; istAdmin: boolean;
  aufOeffnen: (id: string) => void; aufEntfernen: (id: string) => void; t: (s: string) => string;
}) {
  const bilder = liste.filter((e) => e.art === 'bild');
  const videos = liste.filter((e) => e.art === 'video');
  const andere = (e: GalerieEintrag) => e.spieler.filter((id) => id !== ohne);
  return (
    <div className="space-y-5">
      {bilder.length > 0 && (
        <div className="columns-2 gap-3 md:columns-3 xl:columns-4 [&>*]:mb-3">
          {bilder.map((b) => (
            <div key={b.id} role="button" tabIndex={0} onClick={() => aufOeffnen(b.id)}
              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); aufOeffnen(b.id); } }}
              className="group relative block w-full cursor-pointer break-inside-avoid overflow-hidden rounded-xl
                         border border-zinc-800 bg-zinc-900 transition hover:border-sky-500 focus:border-sky-500 focus:outline-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bildPfad(b)} alt={b.titel ?? ''} loading="lazy"
                className="block w-full transition duration-300 group-hover:scale-[1.02]" />
              {(b.titel || andere(b).length > 0) && (
                <span className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1 bg-gradient-to-t
                                 from-black/85 to-transparent px-2 pb-2 pt-8">
                  {b.titel && <span className="mr-1 text-xs font-semibold text-slate-100">{b.titel}</span>}
                  {andere(b).slice(0, 3).map((id) => <SpielerChip key={id} id={id} spieler={spieler} klein />)}
                </span>
              )}
              {istAdmin && (
                <button onClick={(ev) => { ev.stopPropagation(); aufEntfernen(b.id); }} title={t('Entfernen')}
                  className="absolute right-2 top-2 hidden rounded-md border border-zinc-700 bg-black/70 px-1.5 text-[11px]
                             text-slate-300 hover:border-red-500 hover:text-red-400 group-hover:block">✕</button>
              )}
            </div>
          ))}
        </div>
      )}
      {videos.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {videos.map((v) => (
            <div key={v.id} className="space-y-2">
              <ArchivVideo e={v} t={t} />
              <div className="flex flex-wrap items-center gap-1.5">
                {v.titel && <span className="mr-1 text-sm font-semibold text-slate-200">{v.titel}</span>}
                {andere(v).map((id) => <SpielerChip key={id} id={id} spieler={spieler} klein />)}
                {istAdmin && (
                  <button onClick={() => aufEntfernen(v.id)}
                    className="ml-auto rounded-md border border-zinc-800 px-2 py-0.5 text-[11px] text-slate-500 hover:border-red-500 hover:text-red-400">
                    <T>Entfernen</T>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------- Lichtkasten */

/** Das grosse Bild - blaettert durch "bilder", Pfeile und Escape. */
export function Lichtkasten({ bilder, offen, ueberschrift, spieler, aufSchliessen, aufWechseln }: {
  bilder: GalerieEintrag[]; offen: string; ueberschrift: (b: GalerieEintrag) => string;
  spieler: Record<string, SpielerAngabe>; aufSchliessen: () => void; aufWechseln: (id: string) => void;
}) {
  const index = bilder.findIndex((b) => b.id === offen);
  useEffect(() => {
    const taste = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') aufSchliessen();
      if (ev.key === 'ArrowRight' && index >= 0 && index < bilder.length - 1) aufWechseln(bilder[index + 1].id);
      if (ev.key === 'ArrowLeft' && index > 0) aufWechseln(bilder[index - 1].id);
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [index, bilder, aufSchliessen, aufWechseln]);
  if (index < 0) return null;
  const b = bilder[index];
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={aufSchliessen}>
      <div className="flex items-center justify-between px-4 py-3 text-sm text-slate-300">
        <span className="truncate">
          {ueberschrift(b)}
          <span className="ml-2 text-slate-600">{index + 1} / {bilder.length}</span>
        </span>
        <button onClick={aufSchliessen} className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs hover:border-sky-500 hover:text-sky-400">
          ✕ <T>Schließen</T>
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-12">
        {index > 0 && (
          <button onClick={(e) => { e.stopPropagation(); aufWechseln(bilder[index - 1].id); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-zinc-700 bg-black/60 p-3 text-slate-200 hover:border-sky-500">‹</button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bildPfad(b)} alt={b.titel ?? ''} onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg object-contain" />
        {index < bilder.length - 1 && (
          <button onClick={(e) => { e.stopPropagation(); aufWechseln(bilder[index + 1].id); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-zinc-700 bg-black/60 p-3 text-slate-200 hover:border-sky-500">›</button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-3" onClick={(e) => e.stopPropagation()}>
        {b.spieler.map((id) => <SpielerChip key={id} id={id} spieler={spieler} />)}
      </div>
    </div>
  );
}

/* ------------------------------------------------------ Spielersuche */

/** Spieler zuordnen - nach Namen gesucht, gespeichert wird die Id. */
export function SpielerSuche({ gewaehlt, angaben, aufAendern, t }: {
  gewaehlt: string[]; angaben: Record<string, SpielerAngabe>;
  aufAendern: (ids: string[]) => void; t: (s: string) => string;
}) {
  const [suche, setSuche] = useState('');
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [gefunden, setGefunden] = useState<Record<string, SpielerAngabe>>({});
  useEffect(() => {
    const q = suche.trim();
    if (q.length < 2) { setTreffer([]); return; }
    let weg = false;
    const zeiger = setTimeout(async () => {
      try {
        const j = await (await fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`)).json();
        if (!weg) setTreffer(j.spieler ?? []);
      } catch { if (!weg) setTreffer([]); }
    }, 250);
    return () => { weg = true; clearTimeout(zeiger); };
  }, [suche]);
  const name = (id: string) => angaben[id]?.name ?? gefunden[id]?.name ?? id.slice(0, 8);
  const land = (id: string) => angaben[id]?.land ?? gefunden[id]?.land ?? null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {gewaehlt.map((id) => (
        <span key={id} className="flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 py-0.5 pl-1.5 pr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-200">
          <TeamFlagge groesse={12} laender={[land(id) ?? undefined]} />
          {name(id)}
          <button onClick={() => aufAendern(gewaehlt.filter((x) => x !== id))} title={t('Entfernen')}
            className="ml-0.5 rounded-full px-1 text-slate-500 hover:text-red-400">✕</button>
        </span>
      ))}
      <span className="relative">
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Spieler hinzufügen …')}
          className="w-44 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-xs text-slate-100 outline-none focus:border-sky-500" />
        {treffer.length > 0 && (
          <span className="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-xl">
            {treffer.filter((x) => !gewaehlt.includes(x.epicId)).map((x) => (
              <button key={x.epicId}
                onClick={() => {
                  setGefunden((g) => ({ ...g, [x.epicId]: { name: x.anzeige, land: x.land ?? null, bild: x.bild ?? null } }));
                  aufAendern([...gewaehlt, x.epicId]); setSuche(''); setTreffer([]);
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-slate-200 hover:bg-zinc-900">
                <TeamFlagge groesse={13} laender={[x.land ?? undefined]} />
                <span className="truncate font-semibold uppercase">{x.anzeige}</span>
              </button>
            ))}
          </span>
        )}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------ Cupwahl */

export interface CupKurz { id: string; titel: string; jahr: string }

/**
 * Die Cups der Seite, einmal geholt und gemerkt - fuer die Wahl, zu
 * welchem Cup ein Event gehoert. Aus dem Katalog ueber alle Zeiten, samt
 * der von Hand nachgetragenen LANs.
 */
let cupsGemerkt: CupKurz[] | null = null;
export function useCups(): CupKurz[] {
  const [cups, setCups] = useState<CupKurz[]>(cupsGemerkt ?? []);
  useEffect(() => {
    if (cupsGemerkt) return;
    let weg = false;
    fetch('/api/cup-catalog?modus=standard').then((r) => r.json()).then((j) => {
      const liste = ((j?.cups ?? []) as Array<{ id: string; titel: string; letzterStart?: number | null; naechsterStart?: number | null }>)
        .map((c) => {
          const ms = c.letzterStart ?? c.naechsterStart ?? null;
          return { id: c.id, titel: c.titel, jahr: ms ? String(new Date(ms).getUTCFullYear()) : '' };
        })
        .sort((a, b) => (b.jahr || '0').localeCompare(a.jahr || '0') || a.titel.localeCompare(b.titel));
      cupsGemerkt = liste;
      if (!weg) setCups(liste);
    }).catch(() => { /* dann ohne Vorschlaege */ });
    return () => { weg = true; };
  }, []);
  return cups;
}

/** Den Cup waehlen - getippt wird der Name, gespeichert die Kennung. */
export function CupWahl({ wert, aufAendern, t, klasse }: {
  wert: string; aufAendern: (cupId: string) => void; t: (s: string) => string; klasse?: string;
}) {
  const cups = useCups();
  const [suche, setSuche] = useState('');
  const [offen, setOffen] = useState(false);
  const gewaehlt = cups.find((c) => c.id === wert) ?? null;
  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (!q) return cups.slice(0, 12);
    return cups.filter((c) => `${c.titel} ${c.jahr}`.toLowerCase().includes(q)).slice(0, 12);
  }, [cups, suche]);
  return (
    <span className={`relative inline-flex items-center gap-1.5 ${klasse ?? ''}`}>
      {gewaehlt ? (
        <span className="flex items-center gap-1 rounded-lg border border-sky-500/50 bg-sky-500/10 py-1 pl-2.5 pr-1 text-xs font-semibold text-sky-300">
          {gewaehlt.titel}{gewaehlt.jahr ? ` · ${gewaehlt.jahr}` : ''}
          <button onClick={() => aufAendern('')} title={t('Entfernen')} className="ml-1 rounded-full px-1 text-slate-500 hover:text-red-400">✕</button>
        </span>
      ) : wert ? (
        <span className="flex items-center gap-1 rounded-lg border border-zinc-700 py-1 pl-2.5 pr-1 text-xs text-slate-400">
          {wert}
          <button onClick={() => aufAendern('')} title={t('Entfernen')} className="ml-1 rounded-full px-1 text-slate-500 hover:text-red-400">✕</button>
        </span>
      ) : (
        <input value={suche} onFocus={() => setOffen(true)} onBlur={() => setTimeout(() => setOffen(false), 150)}
          onChange={(e) => { setSuche(e.target.value); setOffen(true); }} placeholder={t('Cup suchen …')}
          className="w-56 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-xs text-slate-100 outline-none focus:border-sky-500" />
      )}
      {offen && !wert && treffer.length > 0 && (
        <span className="absolute left-0 top-full z-20 mt-1 max-h-72 w-80 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 shadow-xl">
          {treffer.map((c) => (
            <button key={c.id} onMouseDown={(e) => e.preventDefault()}
              onClick={() => { aufAendern(c.id); setSuche(''); setOffen(false); }}
              className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs text-slate-200 hover:bg-zinc-900">
              <span className="truncate font-semibold">{c.titel}</span>
              <span className="shrink-0 text-slate-500">{c.jahr}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
