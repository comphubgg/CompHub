'use client';
// Das Archiv pflegen - Events anlegen, Fotos hochladen, Videos anhaengen,
// Spieler zuordnen. Gezeigt wird das Ganze im Spielerprofil der Statistik
// (Reiter "Spielerarchiv") - allgemeine Bilder oben, die Events darunter.
//
// So schlicht wie moeglich: links die Events, rechts das gewaehlte Event
// mit einer Flaeche zum Hineinziehen der Fotos, einem Feld fuer eine
// Videoadresse und darunter alles, was schon drin ist - Videos spielen
// dort ab. Spieler werden ueber die Suche der Statistik zugeordnet - nach
// Namen, gespeichert wird die Konto-Id (die Bausteine dafuer stehen in
// ArchivTeile). Jede Eingabe speichert sich selbst, einen Speichern-Knopf
// gibt es nicht.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import { videoArt, type GalerieEintrag, type GalerieEvent } from '@/lib/galerieTypen';
import {
  ArchivVideo, CupWahl, SpielerSuche as SpielerWahl, bildPfad, type SpielerAngabe,
} from '@/app/components/ArchivTeile';

interface Antwort { events: GalerieEvent[]; eintraege: GalerieEintrag[]; spieler: Record<string, SpielerAngabe> }

/** Ein Feld, das sich beim Verlassen selbst speichert. */
function Feld({ wert, aufAendern, platzhalter, klasse, typ }: {
  wert: string; aufAendern: (w: string) => void; platzhalter?: string; klasse?: string; typ?: string;
}) {
  const [inhalt, setInhalt] = useState(wert);
  useEffect(() => { setInhalt(wert); }, [wert]);
  return (
    <input type={typ ?? 'text'} value={inhalt} placeholder={platzhalter}
      onChange={(e) => setInhalt(e.target.value)}
      onBlur={() => { if (inhalt !== wert) aufAendern(inhalt); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className={`rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-sm text-slate-100
                  outline-none focus:border-sky-500 ${klasse ?? ''}`} />
  );
}

export default function ArchivVerwaltung() {
  const t = useT();
  const [istAdmin, setIstAdmin] = useState<boolean | null>(null);
  const [daten, setDaten] = useState<Antwort | null>(null);
  // Aus dem Profil oder der Cup-Seite kommt man mit ?event=<id> direkt zum Event.
  const suchParameter = useSearchParams();
  const [eventId, setEventId] = useState(() => suchParameter?.get('event') ?? '');
  const [neuOffen, setNeuOffen] = useState(false);
  const [neu, setNeu] = useState({ name: '', ort: '', datum: '', bis: '', cupId: '', beschreibung: '' });
  const [laedtHoch, setLaedtHoch] = useState(false);
  const [fortschritt, setFortschritt] = useState('');
  const [meldung, setMeldung] = useState('');
  const [ueberZiel, setUeberZiel] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitel, setVideoTitel] = useState('');
  /** Spieler, die jedem neu hochgeladenen Foto gleich zugeordnet werden. */
  const [vorabSpieler, setVorabSpieler] = useState<string[]>([]);
  const dateiFeld = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch('/api/auth/check-admin').then((r) => r.json())
      .then((j) => setIstAdmin(j.isAdmin === true)).catch(() => setIstAdmin(false));
  }, []);

  const laden = useCallback(async () => {
    try {
      const j = await (await fetch('/api/galerie', { cache: 'no-store' })).json() as Antwort;
      setDaten(j);
      setEventId((alt) => (alt === 'allgemein' || (alt && j.events.some((e) => e.id === alt))) ? alt : (j.events[0]?.id ?? 'allgemein'));
    } catch { setMeldung(t('Das Archiv ist gerade nicht erreichbar.')); }
  }, [t]);
  useEffect(() => { void laden(); }, [laden]);

  const events = daten?.events ?? [];
  const event = events.find((e) => e.id === eventId) ?? null;
  /** "allgemein": die Bilder ohne Event - das allgemeine Archiv der Spieler. */
  const allgemein = eventId === 'allgemein';
  const eintraege = useMemo(() => (daten?.eintraege ?? [])
    .filter((e) => (allgemein ? !e.eventId : e.eventId === eventId)), [daten, eventId, allgemein]);
  const angaben = daten?.spieler ?? {};

  const eventAnlegen = useCallback(async () => {
    if (!neu.name.trim() || !neu.datum) { setMeldung(t('Name und Datum sind nötig.')); return; }
    const form = new FormData();
    form.append('aktion', 'event');
    for (const [k, v] of Object.entries(neu)) form.append(k, v);
    const r = await fetch('/api/galerie', { method: 'POST', body: form });
    const j = await r.json();
    if (!r.ok) { setMeldung(j?.error ?? t('nicht angelegt')); return; }
    setNeu({ name: '', ort: '', datum: '', bis: '', cupId: '', beschreibung: '' }); setNeuOffen(false); setMeldung('');
    await laden();
    setEventId(j.event.id);
  }, [neu, laden, t]);

  const eventAendern = useCallback(async (felder: Record<string, string>) => {
    if (!eventId) return;
    await fetch('/api/galerie', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, ...felder }) });
    await laden();
  }, [eventId, laden]);

  const eintragAendern = useCallback(async (id: string, felder: Record<string, unknown>) => {
    await fetch('/api/galerie', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...felder }) });
    await laden();
  }, [laden]);

  const hochladen = useCallback(async (dateien: FileList | File[]) => {
    if (!dateien.length) return;
    if (allgemein && !vorabSpieler.length) { setMeldung(t('Für das allgemeine Archiv erst einen Spieler wählen.')); return; }
    setLaedtHoch(true); setMeldung('');
    const liste = Array.from(dateien);
    let n = 0; const fehler: string[] = [];
    // Eins nach dem anderen - so bleibt die Anfrage klein, und der
    // Fortschritt ist ehrlich.
    for (const d of liste) {
      n += 1; setFortschritt(`${n} / ${liste.length} · ${d.name}`);
      const form = new FormData();
      form.append('aktion', 'bild'); form.append('eventId', allgemein ? '' : eventId);
      form.append('spieler', vorabSpieler.join(',')); form.append('dateien', d);
      try {
        const r = await fetch('/api/galerie', { method: 'POST', body: form });
        const j = await r.json();
        if (!r.ok) fehler.push(...(j?.fehler?.length ? j.fehler : [`${d.name}: ${j?.error ?? 'nicht hochgeladen'}`]));
      } catch { fehler.push(`${d.name}: ${t('nicht hochgeladen')}`); }
    }
    setFortschritt(''); setLaedtHoch(false);
    if (fehler.length) setMeldung(fehler.join(' · '));
    if (dateiFeld.current) dateiFeld.current.value = '';
    await laden();
  }, [eventId, vorabSpieler, laden, t]);

  const videoAnlegen = useCallback(async () => {
    if (!/^https?:\/\//.test(videoUrl.trim())) { setMeldung(t('Eine Adresse mit https:// ist nötig.')); return; }
    if (allgemein && !vorabSpieler.length) { setMeldung(t('Für das allgemeine Archiv erst einen Spieler wählen.')); return; }
    const form = new FormData();
    form.append('aktion', 'video'); form.append('eventId', allgemein ? '' : eventId);
    form.append('url', videoUrl.trim()); form.append('titel', videoTitel.trim());
    form.append('spieler', vorabSpieler.join(','));
    const r = await fetch('/api/galerie', { method: 'POST', body: form });
    const j = await r.json();
    if (!r.ok) { setMeldung(j?.error ?? t('nicht angelegt')); return; }
    setVideoUrl(''); setVideoTitel(''); setMeldung('');
    await laden();
  }, [eventId, videoUrl, videoTitel, vorabSpieler, laden, t]);

  const entfernen = useCallback(async (id: string) => {
    if (!window.confirm(t('Diesen Eintrag wirklich entfernen?'))) return;
    const r = await fetch(`/api/galerie?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok) setMeldung((await r.json())?.error ?? t('nicht entfernt'));
    await laden();
  }, [laden, t]);

  const eventEntfernen = useCallback(async () => {
    if (!event || !window.confirm(t('Dieses Event wirklich entfernen?'))) return;
    const r = await fetch(`/api/galerie?event=${encodeURIComponent(event.id)}`, { method: 'DELETE' });
    if (!r.ok) setMeldung((await r.json())?.error ?? t('nicht entfernt'));
    await laden();
  }, [event, laden, t]);

  if (istAdmin === false) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center text-slate-400">
        <T>Diese Seite ist dem Admin vorbehalten.</T>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      {(istAdmin === null || (!daten && !meldung)) && <LadeSchirm />}
      {laedtHoch && <LadeSchirm text={`${t('Wird hochgeladen')} · ${fortschritt}`} />}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Admin</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50"><T>Archiv pflegen</T></h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/statistics" className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-slate-400 transition hover:border-sky-500 hover:text-sky-400">
            <T>Zu den Profilen</T> ↗
          </Link>
          <Link href="/admin" className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-slate-400 transition hover:border-sky-500 hover:text-sky-400">
            ← Admin
          </Link>
        </div>
      </div>
      {meldung && (
        <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">{meldung}</p>
      )}

      <div className="flex flex-col gap-5 lg:flex-row">
        {/* ---------------------------------------------------- Events */}
        <aside className="w-full shrink-0 lg:w-72">
          <div className="space-y-2">
            <button onClick={() => setEventId('allgemein')}
              className={`w-full rounded-xl border p-3 text-left transition ${
                allgemein ? 'border-sky-500 bg-sky-500/10' : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-600'}`}>
              <span className="block text-sm font-bold text-slate-100"><T>Allgemeines Archiv</T></span>
              <span className="block text-[11px] text-slate-500"><T>Bilder eines Spielers ohne Event</T></span>
              <span className="block text-[11px] text-slate-600">
                {(daten?.eintraege ?? []).filter((e) => !e.eventId).length} <T>Einträge</T>
              </span>
            </button>
            {events.map((ev) => (
              <button key={ev.id} onClick={() => setEventId(ev.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  ev.id === eventId ? 'border-sky-500 bg-sky-500/10' : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-600'}`}>
                <span className="block truncate text-sm font-bold text-slate-100">{ev.name}</span>
                <span className="block truncate text-[11px] text-slate-500">{[ev.ort, ev.datum].filter(Boolean).join(' · ')}</span>
                <span className="block text-[11px] text-slate-600">
                  {(daten?.eintraege ?? []).filter((e) => e.eventId === ev.id).length} <T>Einträge</T>
                </span>
              </button>
            ))}
          </div>
          <button onClick={() => setNeuOffen((o) => !o)}
            className="mt-3 w-full rounded-xl border border-dashed border-zinc-700 px-3 py-2.5 text-sm text-slate-400 transition hover:border-sky-500 hover:text-sky-400">
            + <T>Neues Event</T>
          </button>
          {neuOffen && (
            <div className="mt-2 space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
              <input value={neu.name} onChange={(e) => setNeu({ ...neu, name: e.target.value })} placeholder={t('Name, z. B. FNCS Global Championship 2025')}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500" />
              <input value={neu.ort} onChange={(e) => setNeu({ ...neu, ort: e.target.value })} placeholder={t('Ort, z. B. Lyon')}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500" />
              <div className="flex items-center gap-2">
                <span className="w-8 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Von</T></span>
                <input type="date" value={neu.datum} onChange={(e) => setNeu({ ...neu, datum: e.target.value })}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500" />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-8 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>bis</T></span>
                <input type="date" value={neu.bis} min={neu.datum || undefined} onChange={(e) => setNeu({ ...neu, bis: e.target.value })}
                  title={t('Bis (optional)')}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500" />
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Cup auf der Seite</T></p>
                <CupWahl wert={neu.cupId} aufAendern={(cupId) => setNeu({ ...neu, cupId })} t={t} />
              </div>
              <textarea value={neu.beschreibung} onChange={(e) => setNeu({ ...neu, beschreibung: e.target.value })} placeholder={t('Beschreibung (optional)')} rows={2}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500" />
              <button onClick={eventAnlegen}
                className="w-full rounded-lg border border-sky-500 bg-sky-500/10 px-3 py-1.5 text-sm font-semibold text-sky-400 transition hover:bg-sky-500/20">
                <T>Anlegen</T>
              </button>
            </div>
          )}
        </aside>

        {/* ---------------------------------------------------- Das Event */}
        <section className="min-w-0 flex-1">
          {!event && !allgemein ? (
            <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-8 text-center text-sm text-slate-500">
              <T>Erst ein Event anlegen.</T>
            </p>
          ) : (
            <div className="space-y-5">
              {/* Die Angaben des Events - speichern sich beim Verlassen des Felds. */}
              {event && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                <Feld wert={event.name} aufAendern={(w) => eventAendern({ name: w })} klasse="w-64 font-bold" />
                <Feld wert={event.ort} aufAendern={(w) => eventAendern({ ort: w })} platzhalter={t('Ort')} klasse="w-40" />
                <Feld wert={event.datum} typ="date" aufAendern={(w) => eventAendern({ datum: w })} klasse="w-40" />
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>bis</T></span>
                <Feld wert={event.bis ?? ''} typ="date" aufAendern={(w) => eventAendern({ bis: w })} klasse="w-40" />
                <Feld wert={event.beschreibung ?? ''} aufAendern={(w) => eventAendern({ beschreibung: w })} platzhalter={t('Beschreibung (optional)')} klasse="min-w-[16rem] flex-1" />
                <span className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Cup auf der Seite</T></span>
                  <CupWahl wert={event.cupId ?? ''} aufAendern={(cupId) => eventAendern({ cupId })} t={t} />
                  {event.cupId && (
                    <Link href={`/events/${encodeURIComponent(event.cupId)}`} className="text-xs text-sky-400 hover:underline">
                      <T>Zur Cup-Seite</T> ↗
                    </Link>
                  )}
                </span>
                {!eintraege.length && (
                  <button onClick={eventEntfernen} className="ml-auto rounded-md border border-zinc-800 px-2.5 py-1 text-xs text-slate-500 hover:border-red-500 hover:text-red-400">
                    <T>Event entfernen</T>
                  </button>
                )}
              </div>}

              {/* Hochladen */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <T>Spieler, die auf den nächsten Fotos und Videos zu sehen sind</T>
                </p>
                <SpielerWahl gewaehlt={vorabSpieler} angaben={angaben} aufAendern={setVorabSpieler} t={t} />
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div
                    onDragOver={(e) => { e.preventDefault(); setUeberZiel(true); }}
                    onDragLeave={() => setUeberZiel(false)}
                    onDrop={(e) => { e.preventDefault(); setUeberZiel(false); void hochladen(e.dataTransfer.files); }}
                    onClick={() => dateiFeld.current?.click()}
                    className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-6 text-center transition ${
                      ueberZiel ? 'border-sky-500 bg-sky-500/10' : 'border-zinc-700 hover:border-zinc-500'}`}>
                    <span className="text-2xl">📷</span>
                    <span className="text-sm font-semibold text-slate-200"><T>Fotos hierher ziehen oder auswählen</T></span>
                    <span className="text-[11px] text-slate-500"><T>JPG, PNG, WebP · bis 20 MB je Bild · mehrere auf einmal</T></span>
                    <input ref={dateiFeld} type="file" accept="image/*" multiple className="hidden"
                      onChange={(e) => { if (e.target.files) void hochladen(e.target.files); }} />
                  </div>
                  <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 p-4">
                    <span className="text-sm font-semibold text-slate-200"><T>Video anhängen</T></span>
                    <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtube.com/… · twitch.tv/… · x.com/… · tiktok.com/…"
                      className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500" />
                    <input value={videoTitel} onChange={(e) => setVideoTitel(e.target.value)} placeholder={t('Titel (optional)')}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500" />
                    <button onClick={videoAnlegen}
                      className="rounded-lg border border-sky-500 bg-sky-500/10 px-3 py-1.5 text-sm font-semibold text-sky-400 transition hover:bg-sky-500/20">
                      <T>Hinzufügen</T>
                    </button>
                    <span className="text-[11px] text-slate-600">
                      {videoUrl.trim() ? `${t('Erkannt')}: ${videoArt(videoUrl.trim()).art}` : t('YouTube, Twitch, X und TikTok spielen direkt hier ab.')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Was schon drin ist */}
              {eintraege.length === 0 ? (
                <p className="text-center text-sm text-slate-600"><T>Noch keine Fotos oder Videos in diesem Event.</T></p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {eintraege.map((e) => (
                    <div key={e.id} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60">
                      {e.art === 'bild' ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={bildPfad(e)} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                      ) : (
                        /* Das Video spielt gleich hier - niemand muss auf einen Link. */
                        <div className="p-2"><ArchivVideo e={e} t={t} /></div>
                      )}
                      <div className="space-y-2 p-3">
                        <Feld wert={e.titel ?? ''} aufAendern={(w) => eintragAendern(e.id, { titel: w })} platzhalter={t('Titel (optional)')} klasse="w-full" />
                        <SpielerWahl gewaehlt={e.spieler} angaben={angaben} aufAendern={(ids) => eintragAendern(e.id, { spieler: ids })} t={t} />
                        <div className="flex items-center justify-between">
                          <select value={e.eventId} onChange={(ev) => eintragAendern(e.id, { eventId: ev.target.value })}
                            title={t('In ein anderes Event verschieben')}
                            className="rounded-md border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-[11px] text-slate-400">
                            <option value="">{t('Allgemeines Archiv')}</option>
                            {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
                          </select>
                          <button onClick={() => entfernen(e.id)} className="rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-slate-500 hover:border-red-500 hover:text-red-400">
                            <T>Entfernen</T>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
