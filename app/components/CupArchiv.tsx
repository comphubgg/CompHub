'use client';
/*
 * Das Archiv eines Cups - auf seiner Seite, im Reiter "Archiv".
 *
 * Der Betreiber: die Bilder eines Events "gehoeren unter Events, unter dem
 * passenden Cup" - und dort braucht es keine Spieler, nur das Event. Hier
 * stehen also alle Fotos und Videos der Archiv-Events, die diesem Cup
 * zugeordnet sind (galerie.json, Feld cupId): die Buehne, die Trophaee,
 * die Halle, das Duo beim Spielen. Videos spielen hier ab, Bilder oeffnen
 * sich gross.
 *
 * Als Admin steht oben der Kasten zum Hochladen. Gibt es zu diesem Cup noch
 * kein Archiv-Event, entsteht es beim ersten Bild von selbst - mit dem Namen
 * des Cups und seinem Zeitraum. Spieler sind hier freiwillig; wer welche
 * nennt, sorgt dafuer, dass das Bild auch in deren Profil steht.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT, useSprache } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import { zeitraumText, type GalerieEintrag, type GalerieEvent } from '@/lib/galerieTypen';
import {
  ArchivRaster, Lichtkasten, SpielerSuche, type SpielerAngabe,
} from '@/app/components/ArchivTeile';

interface Antwort { events: GalerieEvent[]; eintraege: GalerieEintrag[]; spieler: Record<string, SpielerAngabe> }

const feld = 'rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500';

export default function CupArchiv({ cupId, cupName, von, bis, istAdmin, aufAnzahl }: {
  cupId: string;
  /** Name und Zeitraum des Cups - fuer das Archiv-Event, das beim ersten Bild entsteht. */
  cupName: string; von?: string; bis?: string;
  istAdmin: boolean;
  /** Meldet, wie viele Eintraege es gibt - die Seite zeigt den Reiter danach. */
  aufAnzahl?: (n: number) => void;
}) {
  const t = useT();
  const { sprache } = useSprache();
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehlt, setFehlt] = useState(false);
  const [offen, setOffen] = useState<string | null>(null);
  const [ladeOffen, setLadeOffen] = useState(false);
  const [wohin, setWohin] = useState('');
  const [spielerWahl, setSpielerWahl] = useState<string[]>([]);
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
      const j = await (await fetch(`/api/galerie?cup=${encodeURIComponent(cupId)}`, { cache: 'no-store' })).json() as Antwort;
      setDaten(j);
      aufAnzahl?.(j.eintraege?.length ?? 0);
    } catch { setFehlt(true); }
    setLaedt(false);
  }, [cupId, aufAnzahl]);
  useEffect(() => { setLaedt(true); setDaten(null); void laden(); }, [laden]);

  const events = useMemo(() => daten?.events ?? [], [daten]);
  const eintraege = useMemo(() => daten?.eintraege ?? [], [daten]);
  const spieler = daten?.spieler ?? {};
  const alleBilder = useMemo(() => eintraege.filter((e) => e.art === 'bild'), [eintraege]);

  /* ------------------------------------------------------------ Admin */
  /** Das Archiv-Event zu diesem Cup - das gewaehlte, sonst das erste, sonst ein neues. */
  const zielEvent = useCallback(async (): Promise<string | null> => {
    const vorhanden = events.find((ev) => ev.id === wohin) ?? events[0];
    if (vorhanden) return vorhanden.id;
    if (!von) { setMeldung(t('Name und Datum sind nötig.')); return null; }
    const form = new FormData();
    form.append('aktion', 'event'); form.append('name', cupName); form.append('ort', '');
    form.append('datum', von); form.append('bis', bis ?? ''); form.append('cupId', cupId);
    const r = await fetch('/api/galerie', { method: 'POST', body: form });
    const j = await r.json();
    if (!r.ok) { setMeldung(j?.error ?? t('nicht angelegt')); return null; }
    return j.event.id as string;
  }, [events, wohin, von, bis, cupName, cupId, t]);

  const hochladen = useCallback(async (dateien: FileList | File[]) => {
    if (!dateien.length) return;
    setMeldung('');
    const eventId = await zielEvent();
    if (!eventId) return;
    setLaedtHoch(true);
    const liste = Array.from(dateien);
    let n = 0; const fehler: string[] = [];
    for (const d of liste) {
      n += 1; setFortschritt(`${n} / ${liste.length} · ${d.name}`);
      const form = new FormData();
      form.append('aktion', 'bild'); form.append('eventId', eventId);
      form.append('spieler', spielerWahl.join(',')); form.append('dateien', d);
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
  }, [zielEvent, spielerWahl, laden, t]);

  const videoAnlegen = useCallback(async () => {
    if (!/^https?:\/\//.test(videoUrl.trim())) { setMeldung(t('Eine Adresse mit https:// ist nötig.')); return; }
    const eventId = await zielEvent();
    if (!eventId) return;
    const form = new FormData();
    form.append('aktion', 'video'); form.append('eventId', eventId);
    form.append('url', videoUrl.trim()); form.append('titel', videoTitel.trim());
    form.append('spieler', spielerWahl.join(','));
    const r = await fetch('/api/galerie', { method: 'POST', body: form });
    const j = await r.json();
    if (!r.ok) { setMeldung(j?.error ?? t('nicht angelegt')); return; }
    setVideoUrl(''); setVideoTitel(''); setMeldung('');
    await laden();
  }, [videoUrl, videoTitel, zielEvent, spielerWahl, laden, t]);

  const entfernen = useCallback(async (id: string) => {
    if (!window.confirm(t('Diesen Eintrag wirklich entfernen?'))) return;
    const r = await fetch(`/api/galerie?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok) setMeldung((await r.json())?.error ?? t('nicht entfernt'));
    setOffen(null);
    await laden();
  }, [laden, t]);

  return (
    <div className="space-y-6">
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
              {events.length > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Wohin</T></span>
                  <select value={wohin || events[0]?.id || ''} onChange={(e) => setWohin(e.target.value)} className={feld}>
                    {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}{ev.datum ? ` · ${ev.datum.slice(0, 4)}` : ''}</option>)}
                  </select>
                </div>
              )}
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Spieler auf den Bildern (optional)</T></p>
                <SpielerSuche gewaehlt={spielerWahl} angaben={spieler} aufAendern={setSpielerWahl} t={t} />
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
        <p className="py-8 text-center text-sm text-slate-500"><T>Noch keine Bilder oder Videos zu diesem Cup.</T></p>
      ) : events.map((ev) => {
        const drin = eintraege.filter((e) => e.eventId === ev.id);
        if (!drin.length) return null;
        return (
          <section key={ev.id}>
            <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
              {events.length > 1 && <span className="font-semibold text-slate-200">{ev.name}</span>}
              <span>{[ev.ort, zeitraumText(ev, sprache)].filter(Boolean).join(' · ')}{ev.beschreibung ? ` · ${ev.beschreibung}` : ''}</span>
              <span className="text-slate-600">{drin.length}</span>
              {istAdmin && (
                <Link href={`/admin/archive?event=${encodeURIComponent(ev.id)}`}
                  className="text-xs text-slate-500 hover:text-sky-400 hover:underline">
                  <T>Im Admin-Archiv bearbeiten</T> ↗
                </Link>
              )}
            </p>
            <ArchivRaster liste={drin} spieler={spieler} istAdmin={istAdmin}
              aufOeffnen={setOffen} aufEntfernen={(id) => void entfernen(id)} t={t} />
          </section>
        );
      })}

      {offen && (
        <Lichtkasten bilder={alleBilder} offen={offen} spieler={spieler}
          ueberschrift={(b) => `${events.find((x) => x.id === b.eventId)?.name ?? cupName}${b.titel ? ` · ${b.titel}` : ''}`}
          aufSchliessen={() => setOffen(null)} aufWechseln={setOffen} />
      )}
    </div>
  );
}
