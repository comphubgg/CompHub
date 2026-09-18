'use client';
/*
 * Das Archiv eines Spielers - im Profil, als eigener Reiter.
 *
 * Der Betreiber: "wenn ich auf Twi drauf gehe, steht dort Player Archiv
 * ... oben ist Allgemein-Archiv, unten sind spezifische Events, die man
 * auswaehlen kann." Oben also die Bilder ohne Event (mit der Trophaee, beim
 * Signen, am Setup), darunter die Events, an denen er zu sehen ist - eines
 * waehlen, dann dessen Bilder und Videos. Videos spielen hier ab, ein Klick
 * auf ein Bild oeffnet es gross (Pfeile, Escape).
 *
 * Als Admin steht oben ein Kasten zum Hochladen: wohin (allgemein, ein Event
 * oder gleich ein neues), Fotos hineinziehen, eine Videoadresse. Der Spieler
 * des Profils ist immer schon zugeordnet; weitere kommen ueber die Suche.
 * Bearbeiten (Titel, Spieler, Event) geht in der Verwaltung, der Weg dorthin
 * steht am Event.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT, useSprache } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import { zeitraumText, type GalerieEintrag, type GalerieEvent } from '@/lib/galerieTypen';
import {
  ArchivRaster, CupWahl, Lichtkasten, SpielerSuche, type SpielerAngabe,
} from '@/app/components/ArchivTeile';

interface Antwort { events: GalerieEvent[]; eintraege: GalerieEintrag[]; spieler: Record<string, SpielerAngabe> }

const feld = 'rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500';

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
  const [neu, setNeu] = useState({ name: '', ort: '', datum: '', bis: '', cupId: '' });
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
  /** Das grosse Bild blaettert durch beide Abschnitte. */
  const alleBilder = useMemo(() => [...allgemein, ...imEvent].filter((e) => e.art === 'bild'), [allgemein, imEvent]);

  /* ------------------------------------------------------------ Admin */
  const zielEvent = useCallback(async (): Promise<string | null> => {
    if (wohin !== 'neu') return wohin;
    if (!neu.name.trim() || !neu.datum) { setMeldung(t('Name und Datum sind nötig.')); return null; }
    const form = new FormData();
    form.append('aktion', 'event');
    for (const [k, v] of Object.entries(neu)) form.append(k, v);
    const r = await fetch('/api/galerie', { method: 'POST', body: form });
    const j = await r.json();
    if (!r.ok) { setMeldung(j?.error ?? t('nicht angelegt')); return null; }
    setNeu({ name: '', ort: '', datum: '', bis: '', cupId: '' }); setWohin(j.event.id);
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

  const raster = (liste: GalerieEintrag[]) => (
    <ArchivRaster liste={liste} spieler={spieler} ohne={epicId} istAdmin={istAdmin}
      aufOeffnen={setOffen} aufEntfernen={(id) => void entfernen(id)} t={t} />
  );

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
                <select value={wohin} onChange={(e) => setWohin(e.target.value)} className={feld}>
                  <option value="">{t('Allgemeines Archiv')}</option>
                  {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}{ev.datum ? ` · ${ev.datum.slice(0, 4)}` : ''}</option>)}
                  <option value="neu">{t('Neues Event anlegen …')}</option>
                </select>
              </div>
              {wohin === 'neu' && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 p-3">
                  <input value={neu.name} onChange={(e) => setNeu({ ...neu, name: e.target.value })} placeholder={t('Name, z. B. FNCS Global Championship 2025')}
                    className={`w-72 ${feld}`} />
                  <input value={neu.ort} onChange={(e) => setNeu({ ...neu, ort: e.target.value })} placeholder={t('Ort, z. B. Lyon')}
                    className={`w-36 ${feld}`} />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Von</T></span>
                  <input type="date" value={neu.datum} onChange={(e) => setNeu({ ...neu, datum: e.target.value })} className={feld} />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>bis</T></span>
                  <input type="date" value={neu.bis} min={neu.datum || undefined} onChange={(e) => setNeu({ ...neu, bis: e.target.value })} className={feld} />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Cup auf der Seite</T></span>
                  <CupWahl wert={neu.cupId} aufAendern={(cupId) => setNeu({ ...neu, cupId })} t={t} />
                </div>
              )}
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
                  <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtube.com/… · twitch.tv/… · x.com/… · tiktok.com/…" className={feld} />
                  <input value={videoTitel} onChange={(e) => setVideoTitel(e.target.value)} placeholder={t('Titel (optional)')} className={feld} />
                  <button onClick={() => void videoAnlegen()}
                    className="rounded-lg border border-sky-500 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-400 transition hover:bg-sky-500/20">
                    <T>Hinzufügen</T>
                  </button>
                  <span className="text-[11px] text-slate-600"><T>YouTube, Twitch, X und TikTok spielen direkt hier ab.</T></span>
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
              {raster(allgemein)}
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
                  <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                    <span>
                      {[gewaehltesEvent.ort, zeitraumText(gewaehltesEvent, sprache)].filter(Boolean).join(' · ')}
                      {gewaehltesEvent.beschreibung ? ` · ${gewaehltesEvent.beschreibung}` : ''}
                    </span>
                    {gewaehltesEvent.cupId && (
                      <Link href={`/events/${encodeURIComponent(gewaehltesEvent.cupId)}`}
                        className="text-xs text-sky-400 hover:underline">
                        <T>Zur Cup-Seite</T> ↗
                      </Link>
                    )}
                    {istAdmin && (
                      <Link href={`/admin/archiv?event=${encodeURIComponent(gewaehltesEvent.id)}`}
                        className="text-xs text-slate-500 hover:text-sky-400 hover:underline">
                        <T>Im Admin-Archiv bearbeiten</T> ↗
                      </Link>
                    )}
                  </p>
                  {raster(imEvent)}
                </>
              )}
            </section>
          )}
        </>
      )}

      {offen && (
        <Lichtkasten bilder={alleBilder} offen={offen} spieler={spieler}
          ueberschrift={(b) => `${events.find((x) => x.id === b.eventId)?.name ?? t('Allgemeines Archiv')}${b.titel ? ` · ${b.titel}` : ''}`}
          aufSchliessen={() => setOffen(null)} aufWechseln={setOffen} />
      )}
    </div>
  );
}
