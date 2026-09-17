'use client';
/*
 * Das Archiv eines Spielers - im Profil, als eigener Reiter.
 *
 * Der Betreiber: "wenn ich auf Twi drauf gehe, steht dort Player Archiv
 * ... oben ist Allgemein-Archiv, unten sind spezifische Events, die man
 * auswaehlen kann." Oben also die Bilder ohne Event (mit der Trophaee, beim
 * Signen, am Setup), darunter die Events, an denen er zu sehen ist - eines
 * waehlen, dann dessen Bilder und Videos. Ein Klick auf ein Bild oeffnet es
 * gross (Pfeile, Escape).
 *
 * Als Admin steht oben ein Kasten zum Hochladen: wohin (allgemein, ein Event
 * oder gleich ein neues), Fotos hineinziehen, eine Videoadresse. Der Spieler
 * des Profils ist immer schon zugeordnet; weitere kommen ueber die Suche.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TeamFlagge from '@/components/TeamFlagge';
import T from '@/app/components/T';
import { useT, useSprache } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import { videoArt, type GalerieEintrag, type GalerieEvent } from '@/lib/galerieTypen';

interface SpielerAngabe { name: string; land: string | null; bild: string | null }
interface Antwort { events: GalerieEvent[]; eintraege: GalerieEintrag[]; spieler: Record<string, SpielerAngabe> }
interface Treffer { epicId: string; anzeige: string; land?: string | null }

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

/** Weitere Spieler zuordnen - nach Namen gesucht, gespeichert wird die Id. */
function SpielerSuche({ gewaehlt, angaben, aufAendern, t }: {
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
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {gewaehlt.map((id) => (
        <span key={id} className="flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 py-0.5 pl-2 pr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-200">
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
                  setGefunden((g) => ({ ...g, [x.epicId]: { name: x.anzeige, land: x.land ?? null, bild: null } }));
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

export default function SpielerArchiv({ epicId, istAdmin }: { epicId: string; istAdmin: boolean }) {
  const t = useT();
  const { sprache } = useSprache();
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehlt, setFehlt] = useState(false);
  const [eventWahl, setEventWahl] = useState('');
  const [offen, setOffen] = useState<string | null>(null);
  // Hochladen (nur Admin)
  const [ladeOffen, setLadeOffen] = useState(false);
  const [wohin, setWohin] = useState('');
  const [neu, setNeu] = useState({ name: '', ort: '', datum: '' });
  const [weitere, setWeitere] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitel, setVideoTitel] = useState('');
  const [laedtHoch, setLaedtHoch] = useState(false);
  const [fortschritt, setFortschritt] = useState('');
  const [meldung, setMeldung] = useState('');
  const [ueberZiel, setUeberZiel] = useState(false);
  const dateiFeld = useRef<HTMLInputElement | null>(null);

  const laden = useCallback(async () => {
    setFehlt(false);
    try {
      const j = await (await fetch(`/api/galerie?spieler=${encodeURIComponent(epicId)}`, { cache: 'no-store' })).json() as Antwort;
      setDaten(j);
    } catch { setFehlt(true); }
    setLaedt(false);
  }, [epicId]);
  useEffect(() => { setLaedt(true); setDaten(null); setEventWahl(''); void laden(); }, [laden]);

  const events = daten?.events ?? [];
  const eintraege = daten?.eintraege ?? [];
  const spieler = daten?.spieler ?? {};
  const allgemein = useMemo(() => eintraege.filter((e) => !e.eventId), [eintraege]);
  /** Die Events, an denen dieser Spieler zu sehen ist - neueste zuerst. */
  const seineEvents = useMemo(() => events.filter((ev) => eintraege.some((e) => e.eventId === ev.id)), [events, eintraege]);
  const gewaehltesEvent = seineEvents.find((ev) => ev.id === eventWahl) ?? seineEvents[0] ?? null;
  const imEvent = useMemo(() => (gewaehltesEvent ? eintraege.filter((e) => e.eventId === gewaehltesEvent.id) : []), [eintraege, gewaehltesEvent]);

  // Das grosse Bild - blaettert innerhalb seines Abschnitts.
  const alleBilder = useMemo(() => [...allgemein, ...imEvent].filter((e) => e.art === 'bild'), [allgemein, imEvent]);
  const offenIndex = offen ? alleBilder.findIndex((b) => b.id === offen) : -1;
  useEffect(() => {
    if (!offen) return;
    const taste = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOffen(null);
      if (ev.key === 'ArrowRight' && offenIndex >= 0 && offenIndex < alleBilder.length - 1) setOffen(alleBilder[offenIndex + 1].id);
      if (ev.key === 'ArrowLeft' && offenIndex > 0) setOffen(alleBilder[offenIndex - 1].id);
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [offen, offenIndex, alleBilder]);

  /* ------------------------------------------------------------ Admin */
  const zielEvent = useCallback(async (): Promise<string | null> => {
    if (wohin !== 'neu') return wohin;
    if (!neu.name.trim() || !neu.datum) { setMeldung(t('Name und Datum sind nötig.')); return null; }
    const form = new FormData();
    form.append('aktion', 'event'); form.append('name', neu.name); form.append('ort', neu.ort); form.append('datum', neu.datum);
    const r = await fetch('/api/galerie', { method: 'POST', body: form });
    const j = await r.json();
    if (!r.ok) { setMeldung(j?.error ?? t('nicht angelegt')); return null; }
    setNeu({ name: '', ort: '', datum: '' }); setWohin(j.event.id);
    return j.event.id as string;
  }, [wohin, neu, t]);

  const hochladen = useCallback(async (dateien: FileList | File[]) => {
    if (!dateien.length) return;
    setMeldung('');
    const eventId = await zielEvent();
    if (eventId === null) return;
    setLaedtHoch(true);
    const liste = Array.from(dateien);
    let n = 0; const fehler: string[] = [];
    for (const d of liste) {
      n += 1; setFortschritt(`${n} / ${liste.length} · ${d.name}`);
      const form = new FormData();
      form.append('aktion', 'bild'); form.append('eventId', eventId);
      form.append('spieler', [epicId, ...weitere].join(',')); form.append('dateien', d);
      try {
        const r = await fetch('/api/galerie', { method: 'POST', body: form });
        const j = await r.json();
        if (!r.ok) fehler.push(...(j?.fehler?.length ? j.fehler : [`${d.name}: ${j?.error ?? t('nicht hochgeladen')}`]));
      } catch { fehler.push(`${d.name}: ${t('nicht hochgeladen')}`); }
    }
    setFortschritt(''); setLaedtHoch(false);
    if (fehler.length) setMeldung(fehler.join(' · '));
    if (dateiFeld.current) dateiFeld.current.value = '';
    await laden();
    if (eventId) setEventWahl(eventId);
  }, [zielEvent, epicId, weitere, laden, t]);

  const videoAnlegen = useCallback(async () => {
    if (!/^https?:\/\//.test(videoUrl.trim())) { setMeldung(t('Eine Adresse mit https:// ist nötig.')); return; }
    const eventId = await zielEvent();
    if (eventId === null) return;
    const form = new FormData();
    form.append('aktion', 'video'); form.append('eventId', eventId);
    form.append('url', videoUrl.trim()); form.append('titel', videoTitel.trim());
    form.append('spieler', [epicId, ...weitere].join(','));
    const r = await fetch('/api/galerie', { method: 'POST', body: form });
    const j = await r.json();
    if (!r.ok) { setMeldung(j?.error ?? t('nicht angelegt')); return; }
    setVideoUrl(''); setVideoTitel(''); setMeldung('');
    await laden();
    if (eventId) setEventWahl(eventId);
  }, [videoUrl, videoTitel, zielEvent, epicId, weitere, laden, t]);

  const entfernen = useCallback(async (id: string) => {
    if (!window.confirm(t('Diesen Eintrag wirklich entfernen?'))) return;
    const r = await fetch(`/api/galerie?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok) setMeldung((await r.json())?.error ?? t('nicht entfernt'));
    setOffen(null);
    await laden();
  }, [laden, t]);

  /* ------------------------------------------------------------ Anzeige */
  const Chip = ({ id }: { id: string }) => {
    const s = spieler[id];
    if (!s || id === epicId) return null;
    return (
      <span className="flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950/80 py-0.5 pl-0.5 pr-2 text-[11px] text-slate-200">
        {s.bild
          /* eslint-disable-next-line @next/next/no-img-element */
          ? <img src={s.bild} alt="" className="h-5 w-5 rounded-full object-cover object-top" />
          : <TeamFlagge groesse={14} laender={[s.land ?? undefined]} />}
        <span className="font-semibold uppercase tracking-wide">{s.name}</span>
      </span>
    );
  };

  const Raster = ({ liste }: { liste: GalerieEintrag[] }) => {
    const bilder = liste.filter((e) => e.art === 'bild');
    const videos = liste.filter((e) => e.art === 'video');
    return (
      <div className="space-y-5">
        {bilder.length > 0 && (
          <div className="columns-2 gap-3 md:columns-3 xl:columns-4 [&>*]:mb-3">
            {bilder.map((b) => (
              <div key={b.id} role="button" tabIndex={0} onClick={() => setOffen(b.id)}
                onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setOffen(b.id); } }}
                className="group relative block w-full cursor-pointer break-inside-avoid overflow-hidden rounded-xl
                           border border-zinc-800 bg-zinc-900 transition hover:border-sky-500 focus:border-sky-500 focus:outline-none">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bildPfad(b)} alt={b.titel ?? ''} loading="lazy"
                  className="block w-full transition duration-300 group-hover:scale-[1.02]" />
                {(b.titel || b.spieler.some((id) => id !== epicId)) && (
                  <span className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1 bg-gradient-to-t
                                   from-black/85 to-transparent px-2 pb-2 pt-8">
                    {b.titel && <span className="mr-1 text-xs font-semibold text-slate-100">{b.titel}</span>}
                    {b.spieler.filter((id) => id !== epicId).slice(0, 3).map((id) => <Chip key={id} id={id} />)}
                  </span>
                )}
                {istAdmin && (
                  <button onClick={(ev) => { ev.stopPropagation(); void entfernen(b.id); }} title={t('Entfernen')}
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
                <Video e={v} t={t} />
                <div className="flex flex-wrap items-center gap-1.5">
                  {v.titel && <span className="mr-1 text-sm font-semibold text-slate-200">{v.titel}</span>}
                  {v.spieler.filter((id) => id !== epicId).map((id) => <Chip key={id} id={id} />)}
                  {istAdmin && (
                    <button onClick={() => void entfernen(v.id)}
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
  };

  return (
    <div className="space-y-7">
      {laedt && <LadeSchirm />}
      {laedtHoch && <LadeSchirm text={`${t('Wird hochgeladen')} · ${fortschritt}`} />}

      {istAdmin && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
          <button onClick={() => setLadeOffen((o) => !o)}
            className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-200">
            <span>+ <T>Bilder hinzufügen</T></span>
            <span className="text-slate-500">{ladeOffen ? '▴' : '▾'}</span>
          </button>
          {ladeOffen && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Wohin</T></span>
                <select value={wohin} onChange={(e) => setWohin(e.target.value)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500">
                  <option value="">{t('Allgemeines Archiv')}</option>
                  {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}{ev.datum ? ` · ${ev.datum.slice(0, 4)}` : ''}</option>)}
                  <option value="neu">{t('Neues Event anlegen …')}</option>
                </select>
                {wohin === 'neu' && (
                  <>
                    <input value={neu.name} onChange={(e) => setNeu({ ...neu, name: e.target.value })} placeholder={t('Name, z. B. FNCS Global Championship 2025')}
                      className="w-72 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500" />
                    <input value={neu.ort} onChange={(e) => setNeu({ ...neu, ort: e.target.value })} placeholder={t('Ort, z. B. Lyon')}
                      className="w-36 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500" />
                    <input type="date" value={neu.datum} onChange={(e) => setNeu({ ...neu, datum: e.target.value })}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500" />
                  </>
                )}
              </div>
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Weitere Spieler auf den Bildern</T></p>
                <SpielerSuche gewaehlt={weitere} angaben={spieler} aufAendern={setWeitere} t={t} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div
                  onDragOver={(e) => { e.preventDefault(); setUeberZiel(true); }}
                  onDragLeave={() => setUeberZiel(false)}
                  onDrop={(e) => { e.preventDefault(); setUeberZiel(false); void hochladen(e.dataTransfer.files); }}
                  onClick={() => dateiFeld.current?.click()}
                  className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-5 text-center transition ${
                    ueberZiel ? 'border-sky-500 bg-sky-500/10' : 'border-zinc-700 hover:border-zinc-500'}`}>
                  <span className="text-sm font-semibold text-slate-200"><T>Fotos hierher ziehen oder auswählen</T></span>
                  <span className="text-[11px] text-slate-500"><T>JPG, PNG, WebP · bis 20 MB je Bild · mehrere auf einmal</T></span>
                  <input ref={dateiFeld} type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => { if (e.target.files) void hochladen(e.target.files); }} />
                </div>
                <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 p-4">
                  <span className="text-sm font-semibold text-slate-200"><T>Video anhängen</T></span>
                  <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtube.com/… · twitch.tv/… · x.com/… · tiktok.com/…"
                    className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500" />
                  <input value={videoTitel} onChange={(e) => setVideoTitel(e.target.value)} placeholder={t('Titel (optional)')}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500" />
                  <button onClick={() => void videoAnlegen()}
                    className="rounded-lg border border-sky-500 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-400 transition hover:bg-sky-500/20">
                    <T>Hinzufügen</T>
                  </button>
                </div>
              </div>
              {meldung && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">{meldung}</p>}
            </div>
          )}
        </div>
      )}

      {fehlt ? (
        <p className="py-8 text-center text-sm text-slate-500"><T>Das Archiv ist gerade nicht erreichbar. Es wird gleich noch einmal versucht.</T></p>
      ) : !laedt && !eintraege.length ? (
        <p className="py-8 text-center text-sm text-slate-500"><T>Noch keine Bilder oder Videos zu diesem Spieler.</T></p>
      ) : (
        <>
          {allgemein.length > 0 && (
            <section>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <T>Allgemeines Archiv</T>
                <span className="ml-2 font-normal normal-case tracking-normal text-slate-600">{allgemein.length}</span>
              </p>
              <Raster liste={allgemein} />
            </section>
          )}
          {seineEvents.length > 0 && (
            <section>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Events</T></p>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {seineEvents.map((ev) => (
                  <button key={ev.id} onClick={() => setEventWahl(ev.id)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                      gewaehltesEvent?.id === ev.id ? 'border-sky-500 bg-sky-500/10 text-sky-400'
                        : 'border-zinc-800 text-slate-400 hover:border-zinc-600'}`}>
                    {ev.name}
                    <span className="ml-1.5 font-normal text-slate-500">{ev.datum.slice(0, 4)}</span>
                  </button>
                ))}
              </div>
              {gewaehltesEvent && (
                <>
                  <p className="mb-3 text-sm text-slate-500">
                    {[gewaehltesEvent.ort, datumText(gewaehltesEvent.datum, sprache)].filter(Boolean).join(' · ')}
                    {gewaehltesEvent.beschreibung ? ` · ${gewaehltesEvent.beschreibung}` : ''}
                  </p>
                  <Raster liste={imEvent} />
                </>
              )}
            </section>
          )}
        </>
      )}

      {/* Das grosse Bild */}
      {offen && offenIndex >= 0 && (() => {
        const b = alleBilder[offenIndex];
        const ev = events.find((x) => x.id === b.eventId);
        return (
          <div className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={() => setOffen(null)}>
            <div className="flex items-center justify-between px-4 py-3 text-sm text-slate-300">
              <span className="truncate">
                {ev ? ev.name : t('Allgemeines Archiv')}{b.titel ? ` · ${b.titel}` : ''}
                <span className="ml-2 text-slate-600">{offenIndex + 1} / {alleBilder.length}</span>
              </span>
              <button onClick={() => setOffen(null)} className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs hover:border-sky-500 hover:text-sky-400">
                ✕ <T>Schließen</T>
              </button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-12">
              {offenIndex > 0 && (
                <button onClick={(e) => { e.stopPropagation(); setOffen(alleBilder[offenIndex - 1].id); }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-zinc-700 bg-black/60 p-3 text-slate-200 hover:border-sky-500">‹</button>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bildPfad(b)} alt={b.titel ?? ''} onClick={(e) => e.stopPropagation()}
                className="max-h-full max-w-full rounded-lg object-contain" />
              {offenIndex < alleBilder.length - 1 && (
                <button onClick={(e) => { e.stopPropagation(); setOffen(alleBilder[offenIndex + 1].id); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-zinc-700 bg-black/60 p-3 text-slate-200 hover:border-sky-500">›</button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-3" onClick={(e) => e.stopPropagation()}>
              {b.spieler.map((id) => <Chip key={id} id={id} />)}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
