'use client';
// Das Archiv - Fotos und Videos zu Events und Spielern, fuer alle sichtbar.
//
// Der Betreiber: "Player bzw. Events Archiv mit Pictures und Videos." Links
// die Events (Globals, Championship, Summit ...), rechts die Bilder und
// Videos des gewaehlten Events. Wer einen Spieler anklickt, sieht alles,
// worauf er zu sehen ist - ueber alle Events hinweg. Gepflegt wird das
// Ganze unter /admin/archiv; hier wird nur gezeigt.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import TeamFlagge from '@/components/TeamFlagge';
import T from '@/app/components/T';
import { useT, useSprache } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import { videoArt, type GalerieEintrag, type GalerieEvent } from '@/lib/galerieTypen';

interface SpielerAngabe { name: string; land: string | null; bild: string | null }
interface Antwort {
  events: GalerieEvent[];
  eintraege: GalerieEintrag[];
  spieler: Record<string, SpielerAngabe>;
}

const bildPfad = (e: GalerieEintrag) => `/api/galerie?bild=${encodeURIComponent(e.datei ?? '')}`;

function datumText(datum: string, sprache: string) {
  const d = new Date(`${datum}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return datum;
  return d.toLocaleDateString(sprache === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Ein Video, eingebettet - oder ein Link, wo Einbetten nicht geht. */
function Video({ e, t }: { e: GalerieEintrag; t: (s: string) => string }) {
  const { art, kennung } = videoArt(e.url ?? '');
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const rahmen = 'aspect-video w-full overflow-hidden rounded-lg border border-zinc-800 bg-black';
  if (art === 'youtube') {
    return <div className={rahmen}><iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${kennung}`} title={e.titel ?? 'Video'} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" /></div>;
  }
  if (art === 'twitch-clip') {
    return <div className={rahmen}><iframe className="h-full w-full" src={`https://clips.twitch.tv/embed?clip=${kennung}&parent=${host}&autoplay=false`} title={e.titel ?? 'Clip'} allowFullScreen loading="lazy" /></div>;
  }
  if (art === 'twitch-video') {
    return <div className={rahmen}><iframe className="h-full w-full" src={`https://player.twitch.tv/?video=${kennung}&parent=${host}&autoplay=false`} title={e.titel ?? 'Video'} allowFullScreen loading="lazy" /></div>;
  }
  if (art === 'tiktok') {
    return <div className="w-full overflow-hidden rounded-lg border border-zinc-800 bg-black" style={{ aspectRatio: '9 / 16', maxHeight: 560 }}><iframe className="h-full w-full" src={`https://www.tiktok.com/embed/v2/${kennung}`} title={e.titel ?? 'TikTok'} allowFullScreen loading="lazy" /></div>;
  }
  // X und alles andere: ein Link - Einbetten braeuchte fremdes Skript.
  return (
    <a href={e.url} target="_blank" rel="noreferrer"
      className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border
                 border-zinc-800 bg-zinc-900/60 text-slate-300 transition hover:border-sky-500 hover:text-sky-400">
      <span className="text-2xl">{art === 'x' ? '𝕏' : '▶'}</span>
      <span className="text-sm font-semibold">{art === 'x' ? t('Beitrag auf X öffnen') : t('Video öffnen')}</span>
      <span className="max-w-[90%] truncate text-[11px] text-slate-600">{e.url}</span>
    </a>
  );
}

export default function ArchivSeite() {
  const t = useT();
  const { sprache } = useSprache();
  const suchParameter = useSearchParams();
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehlt, setFehlt] = useState(false);
  const [eventId, setEventId] = useState<string>('');
  const [spielerId, setSpielerId] = useState<string>(suchParameter?.get('spieler') ?? '');
  const [offen, setOffen] = useState<string | null>(null);

  const laden = useCallback(async () => {
    setLaedt(true); setFehlt(false);
    try {
      const j = await (await fetch('/api/galerie', { cache: 'no-store' })).json() as Antwort;
      setDaten(j);
      setEventId((alt) => alt || j.events[0]?.id || '');
    } catch { setFehlt(true); }
    setLaedt(false);
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  const events = daten?.events ?? [];
  const eintraege = daten?.eintraege ?? [];
  const spieler = daten?.spieler ?? {};
  const event = events.find((e) => e.id === eventId) ?? null;

  /** Was gezeigt wird: das Event, oder alles zu einem Spieler. */
  const gezeigt = useMemo(() => (spielerId
    ? eintraege.filter((e) => e.spieler.includes(spielerId))
    : eintraege.filter((e) => e.eventId === eventId)), [eintraege, eventId, spielerId]);
  const bilder = gezeigt.filter((e) => e.art === 'bild');
  const videos = gezeigt.filter((e) => e.art === 'video');
  const jeEvent = useMemo(() => {
    const m = new Map<string, { bilder: number; videos: number; titelbild: GalerieEintrag | null }>();
    for (const e of eintraege) {
      const x = m.get(e.eventId) ?? { bilder: 0, videos: 0, titelbild: null };
      if (e.art === 'bild') { x.bilder += 1; if (!x.titelbild) x.titelbild = e; } else x.videos += 1;
      m.set(e.eventId, x);
    }
    return m;
  }, [eintraege]);
  /** Die Spieler des gewaehlten Events - als Auswahl ueber den Bildern. */
  const spielerImEvent = useMemo(() => {
    const zaehler = new Map<string, number>();
    for (const e of eintraege.filter((x) => x.eventId === eventId)) for (const id of e.spieler) zaehler.set(id, (zaehler.get(id) ?? 0) + 1);
    return [...zaehler.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [eintraege, eventId]);

  // Das grosse Bild: Pfeile und Escape.
  const offenIndex = offen ? bilder.findIndex((b) => b.id === offen) : -1;
  useEffect(() => {
    if (!offen) return;
    const taste = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOffen(null);
      if (ev.key === 'ArrowRight' && offenIndex >= 0 && offenIndex < bilder.length - 1) setOffen(bilder[offenIndex + 1].id);
      if (ev.key === 'ArrowLeft' && offenIndex > 0) setOffen(bilder[offenIndex - 1].id);
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [offen, offenIndex, bilder]);

  const Spielerchip = ({ id, klein }: { id: string; klein?: boolean }) => {
    const s = spieler[id];
    if (!s) return null;
    return (
      <button onClick={(ev) => { ev.stopPropagation(); setSpielerId(id); setOffen(null); }}
        className={`flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950/80 pr-2.5
                    text-slate-200 transition hover:border-sky-500 hover:text-sky-400 ${klein ? 'py-0.5 pl-0.5 text-[11px]' : 'py-1 pl-1 text-xs'}`}>
        {s.bild
          /* eslint-disable-next-line @next/next/no-img-element */
          ? <img src={s.bild} alt="" className={`${klein ? 'h-5 w-5' : 'h-6 w-6'} rounded-full object-cover object-top`} />
          : <TeamFlagge groesse={klein ? 14 : 16} laender={[s.land ?? undefined]} />}
        <span className="font-semibold uppercase tracking-wide">{s.name}</span>
      </button>
    );
  };

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      {laedt && <LadeSchirm />}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500"><T>Archiv</T></p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
            {spielerId && spieler[spielerId] ? spieler[spielerId].name : (event?.name ?? t('Archiv'))}
          </h1>
          {!spielerId && event && (
            <p className="mt-1 text-sm text-slate-500">
              {[event.ort, datumText(event.datum, sprache)].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        {spielerId && (
          <button onClick={() => setSpielerId('')}
            className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-slate-400 transition hover:border-sky-500 hover:text-sky-400">
            ← <T>Zurück zu den Events</T>
          </button>
        )}
      </div>

      {fehlt ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-8 text-center text-sm text-slate-500">
          <T>Das Archiv ist gerade nicht erreichbar. Es wird gleich noch einmal versucht.</T>
        </p>
      ) : !laedt && !events.length ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-8 text-center text-sm text-slate-500">
          <T>Noch nichts im Archiv.</T>
        </p>
      ) : (
        <div className="flex gap-5">
          {/* Links die Events */}
          {!spielerId && (
            <aside className="hidden w-64 shrink-0 self-start sm:block">
              <div className="space-y-2">
                {events.map((ev) => {
                  const z = jeEvent.get(ev.id);
                  return (
                    <button key={ev.id} onClick={() => setEventId(ev.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition ${
                        ev.id === eventId ? 'border-sky-500 bg-sky-500/10' : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-600'}`}>
                      <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
                        {z?.titelbild
                          /* eslint-disable-next-line @next/next/no-img-element */
                          ? <img src={bildPfad(z.titelbild)} alt="" loading="lazy" className="h-full w-full object-cover" />
                          : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-100">{ev.name}</span>
                        <span className="block truncate text-[11px] text-slate-500">
                          {[ev.ort, ev.datum.slice(0, 4)].filter(Boolean).join(' · ')}
                        </span>
                        <span className="block text-[11px] text-slate-600">
                          {z?.bilder ?? 0} <T>Fotos</T>{z?.videos ? ` · ${z.videos} ${t('Videos')}` : ''}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
          )}

          <section className="min-w-0 flex-1">
            {/* Auf dem Handy: die Events als Auswahl */}
            {!spielerId && (
              <select value={eventId} onChange={(e) => setEventId(e.target.value)}
                className="mb-4 w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm text-slate-100 sm:hidden">
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </select>
            )}
            {!spielerId && event?.beschreibung && (
              <p className="mb-4 max-w-3xl text-sm leading-relaxed text-slate-400">{event.beschreibung}</p>
            )}
            {!spielerId && spielerImEvent.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {spielerImEvent.map((id) => <Spielerchip key={id} id={id} />)}
              </div>
            )}

            {!gezeigt.length && !laedt ? (
              <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-8 text-center text-sm text-slate-500">
                <T>Zu diesem Event liegt noch nichts vor.</T>
              </p>
            ) : (
              <div className="space-y-8">
                {bilder.length > 0 && (
                  <div className="columns-2 gap-3 md:columns-3 xl:columns-4 [&>*]:mb-3">
                    {bilder.map((b) => (
                      <div key={b.id} role="button" tabIndex={0} onClick={() => setOffen(b.id)}
                        onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setOffen(b.id); } }}
                        className="group relative block w-full cursor-pointer break-inside-avoid overflow-hidden rounded-xl
                                   border border-zinc-800 bg-zinc-900 text-left transition hover:border-sky-500 focus:border-sky-500 focus:outline-none">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={bildPfad(b)} alt={b.titel ?? ''} loading="lazy"
                          className="block w-full transition duration-300 group-hover:scale-[1.02]" />
                        {(b.titel || b.spieler.length > 0) && (
                          <span className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1 bg-gradient-to-t
                                           from-black/85 to-transparent px-2 pb-2 pt-8">
                            {b.titel && <span className="mr-1 text-xs font-semibold text-slate-100">{b.titel}</span>}
                            {b.spieler.slice(0, 3).map((id) => <Spielerchip key={id} id={id} klein />)}
                            {b.spieler.length > 3 && <span className="text-[11px] text-slate-400">+{b.spieler.length - 3}</span>}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {videos.length > 0 && (
                  <div>
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Videos</T></p>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {videos.map((v) => (
                        <div key={v.id} className="space-y-2">
                          <Video e={v} t={t} />
                          {(v.titel || v.spieler.length > 0) && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {v.titel && <span className="mr-1 text-sm font-semibold text-slate-200">{v.titel}</span>}
                              {v.spieler.map((id) => <Spielerchip key={id} id={id} klein />)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Das grosse Bild */}
      {offen && offenIndex >= 0 && (() => {
        const b = bilder[offenIndex];
        const ev = events.find((x) => x.id === b.eventId);
        return (
          <div className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={() => setOffen(null)}>
            <div className="flex items-center justify-between px-4 py-3 text-sm text-slate-300">
              <span className="truncate">
                {ev?.name}{b.titel ? ` · ${b.titel}` : ''}
                <span className="ml-2 text-slate-600">{offenIndex + 1} / {bilder.length}</span>
              </span>
              <button onClick={() => setOffen(null)} className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs hover:border-sky-500 hover:text-sky-400">
                ✕ <T>Schließen</T>
              </button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-12">
              {offenIndex > 0 && (
                <button onClick={(e) => { e.stopPropagation(); setOffen(bilder[offenIndex - 1].id); }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-zinc-700 bg-black/60 p-3 text-slate-200 hover:border-sky-500">‹</button>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bildPfad(b)} alt={b.titel ?? ''} onClick={(e) => e.stopPropagation()}
                className="max-h-full max-w-full rounded-lg object-contain" />
              {offenIndex < bilder.length - 1 && (
                <button onClick={(e) => { e.stopPropagation(); setOffen(bilder[offenIndex + 1].id); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-zinc-700 bg-black/60 p-3 text-slate-200 hover:border-sky-500">›</button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-3" onClick={(e) => e.stopPropagation()}>
              {b.spieler.map((id) => <Spielerchip key={id} id={id} />)}
              {b.spieler.length > 0 && (
                <Link href={`/statistiken`} className="ml-2 text-[11px] text-slate-600 hover:text-sky-400"><T>Profile in der Statistik</T></Link>
              )}
            </div>
          </div>
        );
      })()}
    </main>
  );
}
