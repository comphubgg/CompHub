'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { QUALITAETEN, kanalAusEingabe, type LiveStand, type MvAktionen, type MvStream } from './mvTypen';

/*
 * Die Seitenleiste der Multiview - nach dem Vorbild von viewington.com/watch:
 * Stream hinzufuegen, Liste der Streams (mit Suche, Ziehgriff und Zeilenaktionen), Qualitaet und
 * Steuerung fuer alle. Statt "Profil speichern / Liste teilen" stehen hier die Ordner von CompHub.
 */

export interface MvOrdner { id: string; name: string; streamers: Array<{ twitch: string; createdBy?: string }> }

interface KanalFund {
  login: string; name: string; live: boolean;
  zuschauer: number | null; follower: number | null; spiel: string; bild: string;
}

interface Props {
  offen: boolean;
  zu: () => void;
  streams: MvStream[];
  live: LiveStand;
  /** Kanal -> was der Betreiber ueber die Ordner "Pro POV" / "Discord POV" als POV markiert hat. */
  pov: Record<string, 'pro' | 'discord'>;
  aktionen: MvAktionen;
  qualitaetAlle: string;
  ordner: MvOrdner[];
  /** Darf Ordner anlegen und Streamer in Ordner legen (VIP oder Admin). */
  darfOrdner: boolean;
  ordnerSpeichern: (name: string, kanaele: string[]) => void;
  zuOrdner: (ordnerId: string, kanal: string) => void;
  verschiebeVor: (id: string, zielId: string) => void;
  /** Welche Streams gerade auf der Wand stehen (offline und nicht freigegebene fehlen). */
  aufWand: Set<string>;
  offlineAlle: boolean;
  /** Die Profi-POVs, die dieser Besucher sehen darf. */
  povs: Array<{ ident: string; name: string; bild: string | null; twitch: string; live: boolean }>;
  kannAusOrdner: (ordnerId: string, kanal: string) => boolean;
  ausOrdner: (ordnerId: string, kanal: string) => void;
  einzelAnsicht: () => void;
  einstellungen: () => void;
}

const kurz = (n: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const Zeichen = ({ d, klein }: { d: string; klein?: boolean }) => (
  <svg viewBox="0 0 20 20" className={klein ? 'h-3.5 w-3.5' : 'h-4 w-4'} fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

const D = {
  plus: 'M10 4v12M4 10h12',
  auge: 'M1.5 10S5 4.5 10 4.5 18.5 10 18.5 10 15 15.5 10 15.5 1.5 10 1.5 10zM10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  augeZu: 'M3 3l14 14M8.2 5a8 8 0 0 1 1.8-.5c5 0 8.5 5.5 8.5 5.5a14 14 0 0 1-2.4 3M5.2 6.6A14 14 0 0 0 1.5 10S5 15.5 10 15.5a8 8 0 0 0 3-.6',
  muell: 'M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6',
  neu: 'M16 10a6 6 0 1 1-1.8-4.3M16 3v3.2h-3.2',
  stift: 'M3 17l1-4L14 3l3 3L7 16zM12 5l3 3',
  nadel: 'M7 3h6l-1 5 3 3H5l3-3zM10 11v6',
  kreuz: 'M5.5 5.5l9 9M14.5 5.5l-9 9',
  ordner: 'M2.5 5.5a1 1 0 0 1 1-1H8l2 2h6.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z',
  pfeil: 'M5 12l5-5 5 5',
  start: 'M6 4l10 6-10 6z',
  pause: 'M6 4v12M14 4v12',
  stumm: 'M3 8h3l4-3v10l-4-3H3zM13 8l4 4M17 8l-4 4',
  suche: 'M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM17 17l-3.7-3.7',
  sender: 'M10 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM6.2 13.8a5.4 5.4 0 0 1 0-7.6M13.8 6.2a5.4 5.4 0 0 1 0 7.6M3.6 16.4a9 9 0 0 1 0-12.8M16.4 3.6a9 9 0 0 1 0 12.8',
};

// Ausserhalb der Seitenleiste: innen definiert waere es bei jedem Zeichnen ein neuer Typ, und die Felder darin
// verloeren bei jedem Tastendruck den Fokus.
function Abschnitt({ children }: { children: ReactNode }) {
  return <div className="mv-rand border-t px-4 py-3">{children}</div>;
}
function Titel({ symbol, children }: { symbol: ReactNode; children: ReactNode }) {
  return (
    <p className="mv-mute mb-2 flex items-center gap-1.5 text-[11px] font-medium">
      {symbol}{children}
    </p>
  );
}

function Knopf({ titel, klick, aktiv, gefahr, children }: {
  titel: string; klick: () => void; aktiv?: boolean; gefahr?: boolean; children: ReactNode;
}) {
  return (
    <button type="button" title={titel} aria-label={titel} onClick={klick}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition
        ${aktiv ? 'text-sky-400' : 'mv-mute'} ${gefahr ? 'hover:text-rose-400' : 'hover:text-sky-400'} mv-hover`}>
      {children}
    </button>
  );
}

/*
 * Die Ordner: Auswahl mehrerer Ordner, Laden (nur wer sendet) und Hinzufuegen (jeder), und darunter die
 * Liste der Streamer im aufgeklappten Ordner - dort lassen sich Kanaele einzeln auf die Wand holen,
 * hinzufuegen und (mit Recht) entfernen. Der Betreiber (11.10.2026): "wenn ich auf den Ordner druecke,
 * oeffnet sich darunter direkt die Liste mit den Spielern."
 */
function OrdnerAbschnitt({ p }: { p: Props }) {
  const t = useT();
  const a = p.aktionen;
  const [auf, setAuf] = useState<string | null>(null);
  const [wahl, setWahl] = useState<string[]>([]);
  const [neuerKanal, setNeuerKanal] = useState('');
  const [neuFehler, setNeuFehler] = useState(false);
  const [ordnerName, setOrdnerName] = useState<string | null>(null);

  const gewaehlt = wahl.filter((id) => p.ordner.some((o) => o.id === id));
  const alleGewaehlt = p.ordner.length > 0 && gewaehlt.length === p.ordner.length;
  const kanaeleVon = (ids: string[]) => [...new Set(
    p.ordner.filter((o) => ids.includes(o.id)).flatMap((o) => o.streamers.map((x) => x.twitch)))];
  const sendet = (k: string) => p.live[k]?.isLive === true;
  const bekannt = (k: string) => p.live[k] !== undefined;

  const umschalten = (id: string) => setWahl((alt) => (alt.includes(id) ? alt.filter((x) => x !== id) : [...alt, id]));
  const kleinKnopf = 'mv-rand shrink-0 rounded border px-1.5 py-0.5 text-[10px] transition hover:border-sky-500 hover:text-sky-400 disabled:opacity-40';

  return (
    <Abschnitt>
      <div className="mb-2 flex items-center gap-2">
        <p className="mv-mute flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-medium">
          <Zeichen d={D.ordner} klein /><T>Ordner</T> ({p.ordner.length})
        </p>
        {p.ordner.length > 1 && (
          <label className="mv-mute flex cursor-pointer items-center gap-1 text-[10px]">
            <input type="checkbox" checked={alleGewaehlt} className="accent-sky-500"
              onChange={() => setWahl(alleGewaehlt ? [] : p.ordner.map((o) => o.id))} />
            <T>alle wählen</T>
          </label>
        )}
      </div>

      {gewaehlt.length > 0 && (
        <div className="mv-rand mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-2">
          <span className="mv-mute min-w-0 flex-1 text-[11px]">{gewaehlt.length} <T>Ordner gewählt</T></span>
          <button type="button" className={kleinKnopf}
            title={t('Die Wand durch alle ersetzen, die in diesen Ordnern gerade senden')}
            onClick={() => a.ordnerLaden(kanaeleVon(gewaehlt), 'live')}>
            <T>Nur Live laden</T>
          </button>
          <button type="button" className={kleinKnopf}
            title={t('Alle aus diesen Ordnern zur Wand hinzufügen, auch Offline')}
            onClick={() => a.ordnerLaden(kanaeleVon(gewaehlt), 'alle')}>
            <T>Alle hinzufügen</T>
          </button>
        </div>
      )}

      {p.ordner.length === 0 ? (
        <p className="mv-mute text-center text-xs"><T>Noch keine Ordner</T></p>
      ) : (
        <ul className="space-y-1">
          {p.ordner.map((o) => {
            const sende = o.streamers.filter((x) => sendet(x.twitch)).length;
            const offen = auf === o.id;
            const liste = [...o.streamers].sort((x, y) => Number(sendet(y.twitch)) - Number(sendet(x.twitch)));
            return (
              <li key={o.id} className="mv-rand rounded-lg border">
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <input type="checkbox" checked={gewaehlt.includes(o.id)} onChange={() => umschalten(o.id)}
                    aria-label={o.name} className="shrink-0 accent-sky-500" />
                  <button type="button" onClick={() => setAuf(offen ? null : o.id)} aria-expanded={offen}
                    className="flex min-w-0 flex-1 items-center gap-1 text-left">
                    <svg viewBox="0 0 20 20" className={`mv-mute h-3 w-3 shrink-0 transition ${offen ? 'rotate-90' : ''}`} fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4l6 6-6 6" /></svg>
                    <span className="truncate text-xs font-semibold">{o.name}</span>
                  </button>
                  <span className="mv-mute shrink-0 text-[10px] tabular-nums">{o.streamers.length}</span>
                  {sende > 0 && (
                    <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold tabular-nums text-red-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />{sende}
                    </span>
                  )}
                  <button type="button" disabled={!sende} className={kleinKnopf}
                    title={t('Die Wand durch alle ersetzen, die in diesem Ordner gerade senden')}
                    onClick={() => a.ordnerLaden(o.streamers.map((x) => x.twitch), 'live')}>
                    <T>Live</T>
                  </button>
                  <button type="button" disabled={!o.streamers.length} className={kleinKnopf}
                    title={t('Alle aus dem Ordner zur Wand hinzufügen, auch Offline')}
                    onClick={() => a.ordnerLaden(o.streamers.map((x) => x.twitch), 'alle')}>
                    <T>Alle</T>
                  </button>
                </div>

                {offen && (
                  <div className="mv-rand border-t px-2 py-1.5">
                    {liste.length === 0 && <p className="mv-mute py-1 text-center text-[11px]"><T>Der Ordner ist leer</T></p>}
                    <ul className="space-y-0.5">
                      {liste.map((x) => {
                        const live = sendet(x.twitch);
                        const stand = p.live[x.twitch];
                        const aufWand = p.streams.some((s) => s.kanal === x.twitch && p.aufWand.has(s.id));
                        return (
                          <li key={x.twitch} className="group mv-hover flex items-center gap-1.5 rounded px-1.5 py-1">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${live ? 'bg-red-500' : 'bg-zinc-600'}`} />
                            <span className={`min-w-0 flex-1 truncate text-xs ${live ? 'font-semibold' : 'mv-mute'}`}>{x.twitch}</span>
                            {live && (stand?.viewers ?? 0) > 0 && <span className="mv-mute shrink-0 text-[10px]">{kurz(stand!.viewers)}</span>}
                            {!live && bekannt(x.twitch) && <span className="mv-mute shrink-0 text-[9px] uppercase tracking-wider">offline</span>}
                            <Knopf titel={aufWand ? t('Steht auf der Wand') : t('Auf die Wand holen')} aktiv={aufWand}
                              klick={() => a.kanalZeigen(x.twitch)}>
                              <Zeichen d={aufWand ? D.auge : D.plus} klein />
                            </Knopf>
                            {p.kannAusOrdner(o.id, x.twitch) && (
                              <Knopf titel={t('Aus dem Ordner entfernen')} gefahr klick={() => p.ausOrdner(o.id, x.twitch)}>
                                <Zeichen d={D.kreuz} klein />
                              </Knopf>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {p.darfOrdner && (
                      <form className="mt-1.5 flex gap-1.5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const k = kanalAusEingabe(neuerKanal);
                          if (!k) { setNeuFehler(true); return; }
                          p.zuOrdner(o.id, k);
                          setNeuerKanal(''); setNeuFehler(false);
                        }}>
                        <input value={neuerKanal} spellCheck={false} onChange={(e) => { setNeuerKanal(e.target.value); setNeuFehler(false); }}
                          placeholder={t('Streamer zum Ordner hinzufügen …')}
                          className={`mv-fl min-w-0 flex-1 rounded-md border px-2 py-1 text-[11px] outline-none focus:border-sky-500 ${neuFehler ? 'border-rose-500' : ''}`} />
                        <button type="submit" aria-label={t('Streamer zum Ordner hinzufügen')}
                          className="flex h-6 w-7 shrink-0 items-center justify-center rounded-md bg-sky-500 text-white transition hover:bg-sky-400">
                          <Zeichen d={D.plus} klein />
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {p.darfOrdner && (
        ordnerName === null ? (
          <button type="button" disabled={!p.streams.length} onClick={() => setOrdnerName('')}
            className="mv-fl mv-hover mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition disabled:opacity-40">
            <Zeichen d={D.ordner} klein /><T>Wand als Ordner speichern</T>
          </button>
        ) : (
          <form className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const n = ordnerName.trim();
              if (!n) return;
              p.ordnerSpeichern(n, p.streams.map((s) => s.kanal));
              setOrdnerName(null);
            }}>
            <input autoFocus value={ordnerName} onChange={(e) => setOrdnerName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setOrdnerName(null); }}
              placeholder={t('Name des Ordners …')}
              className="mv-fl min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-xs outline-none focus:border-sky-500" />
            <button type="submit" className="rounded-lg bg-sky-500 px-3 text-xs font-semibold text-white transition hover:bg-sky-400">
              <T>Speichern</T>
            </button>
          </form>
        )
      )}
    </Abschnitt>
  );
}

export default function Seitenleiste(p: Props) {
  const t = useT();
  const a = p.aktionen;
  const [eingabe, setEingabe] = useState('');
  const [fehler, setFehler] = useState(false);
  const [suche, setSuche] = useState('');
  const [listeOffen, setListeOffen] = useState(true);
  const [fundeOffen, setFundeOffen] = useState(false);
  const [funde, setFunde] = useState<KanalFund[]>([]);
  const [mehr, setMehr] = useState(false);
  const [zeilenAktiv, setZeilenAktiv] = useState<string | null>(null);
  const [ordnerMenue, setOrdnerMenue] = useState<string | null>(null);
  const [ziehId, setZiehId] = useState<string | null>(null);
  const [alleWeg, setAlleWeg] = useState(false);
  /** Wohin ein eingetippter Kanal kommt: leer = nur fuer diese Sitzung, sonst in diesen Ordner. */
  const [zielOrdner, setZielOrdner] = useState('');
  const zeilen = useRef(new Map<string, HTMLElement>());

  /* ----------------------------------------------------- Vorschlaege beim Tippen */
  useEffect(() => {
    const q = eingabe.trim();
    setMehr(false);
    if (q.length < 2) { setFunde([]); return undefined; }
    const abbruch = new AbortController();
    const uhr = window.setTimeout(() => {
      fetch(`/api/kanal-suche?q=${encodeURIComponent(q)}`, { signal: abbruch.signal })
        .then((r) => r.json())
        .then((j) => { if (!abbruch.signal.aborted) setFunde(Array.isArray(j?.kanaele) ? j.kanaele : []); })
        .catch(() => { if (!abbruch.signal.aborted) setFunde([]); });
    }, 200);
    return () => { window.clearTimeout(uhr); abbruch.abort(); };
  }, [eingabe]);

  const erste = useMemo(() => {
    const sendend = funde.filter((k) => k.live);
    return sendend.length ? sendend : funde.slice(0, 5);
  }, [funde]);
  const gezeigt = mehr ? funde : erste;

  const hinzu = (text: string) => {
    if (a.hinzufuegen(text, zielOrdner || undefined)) { setEingabe(''); setFunde([]); setFehler(false); setFundeOffen(false); }
    else setFehler(true);
  };
  const aus = () => {
    const q = eingabe.trim().toLowerCase();
    const genau = funde.find((k) => k.login === q);
    hinzu(genau?.login ?? erste[0]?.login ?? eingabe);
  };

  /* ------------------------------------------------------------ Liste, gefiltert */
  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return q ? p.streams.filter((s) => s.kanal.includes(q)) : p.streams;
  }, [p.streams, suche]);
  const sichtbare = p.streams.filter((s) => !s.versteckt).length;
  const weg = p.streams.filter((s) => !s.fest).length;

  /* ------------------------------------------------------- Ziehen in der Liste */
  const ziehen = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    const griff = e.currentTarget as HTMLElement;
    griff.setPointerCapture(e.pointerId);
    setZiehId(id);
    let zuletzt = id;
    const bewegt = (ev: PointerEvent) => {
      for (const [zielId, el] of zeilen.current) {
        const r = el.getBoundingClientRect();
        if (ev.clientY >= r.top && ev.clientY <= r.bottom) {
          if (zielId !== zuletzt && zielId !== id) { p.verschiebeVor(id, zielId); zuletzt = zielId; }
          break;
        }
      }
    };
    const ende = () => {
      window.removeEventListener('pointermove', bewegt);
      window.removeEventListener('pointerup', ende);
      window.removeEventListener('pointercancel', ende);
      setZiehId(null);
    };
    window.addEventListener('pointermove', bewegt);
    window.addEventListener('pointerup', ende);
    window.addEventListener('pointercancel', ende);
  };

  return (
    <aside
      aria-hidden={!p.offen}
      // inert: ein geschlossenes Panel nimmt weder Tab noch Klick.
      {...(p.offen ? {} : { inert: true })}
      className={`mv-fl absolute bottom-0 left-0 top-0 z-30 flex w-[20rem] max-w-full flex-col border-r
        shadow-2xl transition-transform duration-200 ${p.offen ? 'translate-x-0' : '-translate-x-full'}`}>
      {/* Kopf */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/CompHub-Logo.png" alt="" className="h-8 w-8 rounded-md object-contain" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">CompHub Multiview</p>
          <p className="mv-mute flex items-center gap-1 text-[10px]">
            <kbd className="mv-rand rounded border px-1 font-mono">Ctrl</kbd>+
            <kbd className="mv-rand rounded border px-1 font-mono">B</kbd>
            <T>zum Umschalten</T>
          </p>
        </div>
        <Knopf titel={t('Seitenleiste schließen')} klick={p.zu}><Zeichen d={D.kreuz} /></Knopf>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Stream hinzufuegen */}
        <Abschnitt>
          <Titel symbol={<Zeichen d={D.plus} klein />}><T>Stream hinzufügen</T></Titel>
          <form onSubmit={(e) => { e.preventDefault(); aus(); }} className="relative flex gap-2">
            <input value={eingabe} spellCheck={false} autoComplete="off"
              onChange={(e) => { setEingabe(e.target.value); setFehler(false); }}
              onFocus={() => setFundeOffen(true)} onBlur={() => setFundeOffen(false)}
              placeholder={t('Kanalname …')}
              className={`mv-fl min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-sm outline-none
                focus:border-sky-500 ${fehler ? 'border-rose-500' : ''}`} />
            <button type="submit" aria-label={t('Stream hinzufügen')} title={t('Stream hinzufügen')}
              className="flex h-8 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500 text-white transition hover:bg-sky-400">
              <Zeichen d={D.plus} />
            </button>
            {fundeOffen && eingabe.trim().length >= 2 && gezeigt.length > 0 && (
              <div onMouseDown={(e) => e.preventDefault()}
                className="mv-fl absolute left-0 right-0 top-full z-40 mt-1.5 overflow-hidden rounded-lg border shadow-2xl">
                {gezeigt.map((k) => (
                  <button key={k.login} type="button" onClick={() => hinzu(k.login)}
                    className="mv-hover flex w-full items-center gap-2.5 px-3 py-2 text-left transition">
                    {k.bild
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={k.bild} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                      : <span className="mv-rand h-7 w-7 shrink-0 rounded-full border" />}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-semibold">{k.name}</span>
                        {k.live
                          ? <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-red-500">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />LIVE
                              {k.zuschauer !== null && <span className="mv-mute font-normal">· {kurz(k.zuschauer)}</span>}
                            </span>
                          : <span className="mv-mute shrink-0 text-[10px] uppercase tracking-wider">offline</span>}
                      </span>
                      <span className="mv-mute block truncate text-[10px]">
                        {k.follower !== null && <>{kurz(k.follower)} Follower</>}
                        {k.follower !== null && k.spiel ? ' · ' : ''}{k.spiel}
                      </span>
                    </span>
                  </button>
                ))}
                {!mehr && funde.length > erste.length && (
                  <button type="button" onClick={() => setMehr(true)}
                    className="mv-rand mv-mute w-full border-t px-3 py-1.5 text-center text-[11px] transition hover:text-sky-400">
                    <T>mehr anzeigen</T> ({funde.length - erste.length})
                  </button>
                )}
              </div>
            )}
          </form>
          {p.darfOrdner && p.ordner.length > 0 && (
            <label className="mv-mute mt-2 flex items-center gap-2 text-[11px]">
              <span className="shrink-0"><T>Speichern in</T></span>
              <select value={zielOrdner} onChange={(e) => setZielOrdner(e.target.value)}
                className="mv-fl min-w-0 flex-1 rounded-md border px-2 py-1 text-xs outline-none focus:border-sky-500">
                <option value="">{t('Nur diese Sitzung')}</option>
                {p.ordner.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
          )}
        </Abschnitt>

        {/* Streams */}
        <Abschnitt>
          <div className="mb-2 flex items-center gap-1">
            <p className="mv-mute flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-medium">
              <Zeichen d={D.start} klein /><T>Streams</T> ({p.streams.length})
            </p>
            {p.streams.length > 0 && (
              <>
                <Knopf titel={sichtbare ? t('Alle ausblenden') : t('Alle einblenden')}
                  klick={sichtbare ? a.alleVerstecken : a.alleZeigen}>
                  <Zeichen d={sichtbare ? D.auge : D.augeZu} klein />
                </Knopf>
                <Knopf titel={t('Alle entfernen')} gefahr klick={() => setAlleWeg((x) => !x)}>
                  <Zeichen d={D.muell} klein />
                </Knopf>
              </>
            )}
            <Knopf titel={listeOffen ? t('Liste einklappen') : t('Liste ausklappen')} klick={() => setListeOffen((x) => !x)}>
              <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 transition ${listeOffen ? '' : 'rotate-180'}`} fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={D.pfeil} />
              </svg>
            </Knopf>
          </div>

          {alleWeg && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs">
              <span className="min-w-0 flex-1">
                {weg} <T>Streams von der Wand nehmen? Sie bleiben in ihren Ordnern, und du kannst es rückgängig machen.</T>
              </span>
              <button type="button" onClick={() => { a.alleEntfernen(); setAlleWeg(false); }}
                className="rounded-md bg-rose-500 px-2.5 py-1 font-semibold text-white transition hover:bg-rose-400">
                <T>Entfernen</T>
              </button>
              <button type="button" onClick={() => setAlleWeg(false)} className="mv-mute transition hover:text-sky-400">
                <T>Abbrechen</T>
              </button>
            </div>
          )}

          {listeOffen && (
            p.streams.length === 0 ? (
              <p className="mv-mute py-3 text-center text-xs"><T>Noch keine Streams hinzugefügt</T></p>
            ) : (
              <>
                <div className="relative mb-2">
                  <span className="mv-mute pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
                    <Zeichen d={D.suche} klein />
                  </span>
                  <input value={suche} onChange={(e) => setSuche(e.target.value)} spellCheck={false}
                    placeholder={t('Streams durchsuchen …')}
                    className="mv-fl w-full rounded-lg border py-1.5 pl-8 pr-3 text-xs outline-none focus:border-sky-500" />
                </div>
                <button type="button" role="switch" aria-checked={p.offlineAlle} onClick={a.offlineAlleUmschalten}
                  className="mv-hover -mx-1 mb-2 flex w-[calc(100%+0.5rem)] items-center gap-2 rounded-md px-1 py-1 text-left text-xs transition">
                  <span className="min-w-0 flex-1"><T>Alle Offline-Streams zeigen</T></span>
                  <span className={`relative h-4 w-7 shrink-0 rounded-full transition ${p.offlineAlle ? 'bg-sky-500' : 'bg-zinc-600/70'}`}>
                    <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${p.offlineAlle ? 'left-[14px]' : 'left-0.5'}`} />
                  </span>
                </button>
                <ul className="space-y-1">
                  {gefiltert.map((s) => {
                    const stand = p.live[s.kanal];
                    const povArt = p.pov[s.kanal];
                    const aktiv = zeilenAktiv === s.id;
                    return (
                      <li key={s.id} ref={(el) => { if (el) zeilen.current.set(s.id, el); else zeilen.current.delete(s.id); }}
                        className={`group relative rounded-lg border transition ${ziehId === s.id
                          ? 'border-sky-500 bg-sky-500/10' : 'mv-rand'} ${s.versteckt || !p.aufWand.has(s.id) ? 'opacity-60' : ''}`}>
                        <div className="flex items-center gap-1.5 px-1.5 py-1.5">
                          <span onPointerDown={(e) => { if (!s.fest) ziehen(e, s.id); }}
                            title={s.fest ? t('Angeheftet') : t('Zum Sortieren ziehen')}
                            className={`mv-mute flex h-6 w-4 shrink-0 touch-none items-center justify-center
                              ${s.fest ? 'cursor-not-allowed opacity-40' : 'cursor-grab active:cursor-grabbing'}`}>
                            <svg viewBox="0 0 8 14" className="h-3.5 w-2" fill="currentColor">
                              {[2, 7, 12].flatMap((y) => [1.5, 6.5].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1" />))}
                            </svg>
                          </span>
                          <button type="button" onClick={() => setZeilenAktiv(aktiv ? null : s.id)}
                            className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                            <span className={`truncate text-xs font-semibold ${povArt ? 'text-sky-400' : ''}`}>{s.kanal}</span>
                            {povArt && (
                              <span className="shrink-0 rounded border border-sky-500/50 px-1 text-[9px] font-semibold uppercase tracking-wider text-sky-400">
                                POV
                              </span>
                            )}
                            {stand?.isLive === true && (
                              <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-red-500">
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                                {stand.viewers > 0 && <span className="mv-mute font-normal">{kurz(stand.viewers)}</span>}
                              </span>
                            )}
                          </button>
                          {stand?.isLive === false && (
                            // Ein Druck entscheidet fuer diesen einen Kanal, ob er auch offline auf der Wand steht.
                            <button type="button" onClick={() => a.zeigeOfflineUmschalten(s.id)}
                              title={s.zeigeOffline ? t('Offline nicht mehr zeigen') : t('Auch offline zeigen')}
                              className={`shrink-0 rounded-full border px-1.5 py-px text-[9px] uppercase tracking-wider transition ${s.zeigeOffline
                                ? 'border-sky-500 text-sky-400' : 'mv-rand mv-mute hover:border-sky-500 hover:text-sky-400'}`}>
                              offline{s.zeigeOffline ? ' ✓' : ''}
                            </button>
                          )}
                          {s.fest && <span className="text-sky-400" title={t('Angeheftet')}><Zeichen d={D.nadel} klein /></span>}
                          {/* Zeilenaktionen: beim Darueberfahren, oder nach einem Tipp auf den Namen (Touch). */}
                          <div className={`items-center gap-0.5 ${aktiv ? 'flex' : 'hidden group-hover:flex group-focus-within:flex'}`}>
                            <Knopf titel={s.fest ? t('Lösen') : t('Anheften')} aktiv={s.fest} klick={() => a.festmachen(s.id)}>
                              <Zeichen d={D.nadel} klein />
                            </Knopf>
                            <Knopf titel={s.zeigeOffline ? t('Offline nicht mehr zeigen') : t('Auch offline zeigen')} aktiv={s.zeigeOffline}
                              klick={() => a.zeigeOfflineUmschalten(s.id)}>
                              <Zeichen d={D.sender} klein />
                            </Knopf>
                            <Knopf titel={s.versteckt ? t('Einblenden') : t('Ausblenden')} klick={() => a.verstecken(s.id)}>
                              <Zeichen d={s.versteckt ? D.augeZu : D.auge} klein />
                            </Knopf>
                            <Knopf titel={t('Neu laden')} klick={() => a.neuLaden(s.id)}><Zeichen d={D.neu} klein /></Knopf>
                            <Knopf titel={t('Kanal ändern')} klick={() => a.kanalAendern(s.id, '')}><Zeichen d={D.stift} klein /></Knopf>
                            {p.darfOrdner && p.ordner.length > 0 && (
                              <Knopf titel={t('In Ordner legen')} aktiv={ordnerMenue === s.id}
                                klick={() => setOrdnerMenue(ordnerMenue === s.id ? null : s.id)}>
                                <Zeichen d={D.ordner} klein />
                              </Knopf>
                            )}
                            <Knopf titel={t('Entfernen')} gefahr klick={() => a.entfernen(s.id)}><Zeichen d={D.kreuz} klein /></Knopf>
                          </div>
                        </div>
                        {ordnerMenue === s.id && (
                          <div className="mv-rand flex flex-wrap gap-1 border-t px-2 py-1.5">
                            {p.ordner.map((o) => {
                              const drin = o.streamers.some((x) => x.twitch === s.kanal);
                              return (
                                <button key={o.id} type="button" disabled={drin}
                                  onClick={() => { p.zuOrdner(o.id, s.kanal); setOrdnerMenue(null); }}
                                  className={`rounded-full border px-2 py-0.5 text-[10px] transition ${drin
                                    ? 'mv-rand mv-mute opacity-50' : 'mv-rand hover:border-sky-500 hover:text-sky-400'}`}>
                                  {o.name}{drin ? ' ✓' : ''}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </li>
                    );
                  })}
                  {gefiltert.length === 0 && (
                    <li className="mv-mute py-2 text-center text-xs"><T>Kein Stream passt zur Suche</T></li>
                  )}
                </ul>
              </>
            )
          )}
        </Abschnitt>

        {p.povs.length > 0 && (
          <Abschnitt>
            <Titel symbol={<Zeichen d={D.sender} klein />}><T>Pro-POVs</T> ({p.povs.length})</Titel>
            <ul className="space-y-1">
              {p.povs.map((x) => {
                const stand = p.live[x.twitch];
                const sendet = stand?.isLive === true;
                const drauf = p.streams.some((s) => s.kanal === x.twitch && p.aufWand.has(s.id));
                return (
                  <li key={x.ident} className="flex items-center gap-2 rounded-lg border border-sky-500/30 px-2 py-1.5">
                    {x.bild
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={x.bild} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                      : <span className="mv-rand h-6 w-6 shrink-0 rounded-full border" />}
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-sky-400">{x.name}</span>
                    {sendet
                      ? <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-red-500"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />LIVE</span>
                      // Der Profi hat sich live gemeldet, auf Twitch laeuft es noch nicht: gleich.
                      : x.live
                        ? <span className="shrink-0 text-[9px] uppercase tracking-wider text-sky-400">{t('gleich live')}</span>
                        : <span className="mv-mute shrink-0 text-[9px] uppercase tracking-wider">offline</span>}
                    <Knopf titel={drauf ? t('Steht auf der Wand') : t('Auf die Wand holen')} aktiv={drauf}
                      klick={() => a.kanalZeigen(x.twitch)}>
                      <Zeichen d={drauf ? D.auge : D.plus} klein />
                    </Knopf>
                  </li>
                );
              })}
            </ul>
          </Abschnitt>
        )}

        <OrdnerAbschnitt p={p} />

        {/* Qualitaet */}
        <Abschnitt>
          <div className="mb-2 flex items-center">
            <p className="mv-mute flex-1 text-[11px] font-medium"><T>Stream-Qualität</T></p>
            <Knopf titel={t('Auf Auto zurücksetzen')} klick={() => a.alleQualitaet('auto')}><Zeichen d={D.neu} klein /></Knopf>
          </div>
          <select value={p.qualitaetAlle} onChange={(e) => a.alleQualitaet(e.target.value)}
            className="mv-fl w-full rounded-lg border px-3 py-1.5 text-sm outline-none focus:border-sky-500">
            {QUALITAETEN.map((q) => <option key={q.wert} value={q.wert}>{q.name}</option>)}
          </select>
        </Abschnitt>

        {/* Steuerung */}
        <Abschnitt>
          <Titel symbol={<Zeichen d="M4 5h12M4 10h12M4 15h12M7 3v4M13 8v4M9 13v4" klein />}><T>Stream-Steuerung</T></Titel>
          <div className="space-y-1">
            {([
              [D.start, 'Alle pausierten abspielen', a.alleAbspielen],
              [D.pause, 'Alle pausieren', a.allePausieren],
              [D.stumm, 'Alle stummschalten', a.alleStumm],
              [D.neu, 'Alle neu laden', a.alleNeuLaden],
            ] as Array<[string, string, () => void]>).map(([d, text, klick]) => (
              <button key={text} type="button" onClick={klick} disabled={!p.streams.length}
                className="mv-fl mv-hover flex w-full items-center gap-2.5 rounded-lg border px-3 py-1.5 text-left text-xs transition disabled:opacity-40">
                <span className="mv-mute"><Zeichen d={d} klein /></span>{t(text)}
              </button>
            ))}
          </div>
        </Abschnitt>
      </div>

      {/* Fuss */}
      <div className="mv-rand flex items-center justify-between border-t px-4 py-2.5">
        <button type="button" onClick={p.einstellungen}
          className="mv-mute flex items-center gap-1.5 text-xs transition hover:text-sky-400">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round">
            <circle cx="10" cy="10" r="2.5" />
            <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
          </svg>
          <T>Einstellungen</T>
        </button>
        <button type="button" onClick={p.einzelAnsicht}
          className="mv-mute flex items-center gap-1.5 text-xs transition hover:text-sky-400">
          <T>Einzelansicht</T>
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="14" height="12" rx="2" /></svg>
        </button>
      </div>
    </aside>
  );
}
