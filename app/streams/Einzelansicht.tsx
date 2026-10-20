'use client';

import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import Kachel from './Kachel';
import PovVideo from './PovVideo';
import type { BannerEinst, StatsEinst } from './PovVideo';
import { CSS } from './Multiview';
import { useHell } from '@/app/lib/useHell';
import { kanalAusEingabe, type MvEinstellungen } from './mvTypen';

/*
 * Die Einzelansicht: ein Stream gross, links dieselbe Seitenleiste wie in der Multiview.
 *
 * Der Betreiber (12.10.2026): die Einzelansicht soll "komplett gleich" aussehen wie die Multiview - dieselben Farben,
 * dieselben Listen und Zeilen, nur dass man hier Ordner anlegt und Streamer hineinlegt, jeden Streamer in der Liste
 * sieht und mit der Nadel als Favorit merkt. Das Plus (auf die Wand holen) gibt es hier nicht: die Wand ist die
 * Multiview, eine eigene Seite. Dazu der blaue Ordner der Profis (nur lesen) und, wo das POV laeuft, dasselbe Bild mit
 * Banner und Statistik wie dort.
 *
 * Gerechnet und gespeichert wird weiter in app/streams/page.tsx (Ordner, Favoriten, Live-Stand); hier steht nur die Anzeige.
 */

interface OrdnerEintrag { id: string; name: string; streamers: Array<{ twitch: string; twitter?: string; createdBy?: string }> }

export interface PovEintrag {
  ident: string; name: string; bild: string | null; live: boolean; stats?: boolean;
  /** Derselbe Anschluss wie der Sender: das POV beginnt stumm (sonst Echo). */
  lokal?: boolean;
  discord?: { streamt: boolean; kanal: string | null; link: string | null } | null;
}

interface Props {
  host: string;
  ordner: OrdnerEintrag[];
  aktivOrdner: string;
  waehleOrdner: (id: string) => void;
  /** Twitch-Name (klein) -> sendet gerade. */
  live: Record<string, boolean>;
  /** Twitch-Name (klein) -> Titel des laufenden Streams. */
  liveTitel?: Record<string, string>;
  favoriten: string[];
  favoritUmschalten: (twitch: string) => void;
  /** Kanal -> Anzeigename (nur was umbenannt wurde). */
  namen: Record<string, string>;
  /** Fehlt fuer Gaeste: ohne Konto laesst sich nichts umbenennen. */
  streamerUmbenennen?: (twitch: string, name: string) => void;
  aktiv: string;
  waehleStreamer: (twitch: string) => void;
  aktivPov: string;
  waehlePov: (ident: string) => void;
  povs: PovEintrag[];
  einst: MvEinstellungen;
  aendereBanner: (teil: Partial<BannerEinst>) => void;
  aendereStats: (teil: Partial<StatsEinst>) => void;
  /** Angemeldet? Ohne Anmeldung laesst sich nichts anlegen oder aendern. */
  gast: boolean;
  /** Darf Ordner anlegen (VIP oder Admin). */
  darfOrdner: boolean;
  kannEntfernen: (ordnerId: string, kanal: string) => boolean;
  ordnerAnlegen: (name: string) => void;
  ordnerUmbenennen: (id: string, name: string) => void;
  ordnerLoeschen: (id: string) => void;
  streamerHinzufuegen: (ordnerId: string, kanal: string) => void;
  streamerEntfernen: (ordnerId: string, kanal: string) => void;
  chatAn: boolean;
  chatUmschalten: () => void;
  lautstaerke: number;
  zurMultiview: () => void;
}

const Zeichen = ({ d, klein }: { d: string; klein?: boolean }) => (
  <svg viewBox="0 0 20 20" className={klein ? 'h-3.5 w-3.5' : 'h-4 w-4'} fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const D = {
  plus: 'M10 4v12M4 10h12',
  kreuz: 'M5.5 5.5l9 9M14.5 5.5l-9 9',
  stift: 'M3 17l1-4L14 3l3 3L7 16zM12 5l3 3',
  muell: 'M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6',
  nadel: 'M7 3h6l-1 5 3 3H5l3-3zM10 11v6',
  ordner: 'M2.5 5.5a1 1 0 0 1 1-1H8l2 2h6.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z',
  sender: 'M10 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM6.2 13.8a5.4 5.4 0 0 1 0-7.6M13.8 6.2a5.4 5.4 0 0 1 0 7.6M3.6 16.4a9 9 0 0 1 0-12.8M16.4 3.6a9 9 0 0 1 0 12.8',
  stern: 'M10 2.5l2.3 4.8 5.2.7-3.8 3.7.9 5.2L10 14.4l-4.6 2.5.9-5.2L2.5 8l5.2-.7z',
  raster: 'M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z',
  chat: 'M3 4h14v9H8l-4 3v-3H3z',
};

function Abschnitt({ children }: { children: ReactNode }) {
  return <div className="mv-rand border-t px-4 py-3">{children}</div>;
}
function Titel({ symbol, children, rechts }: { symbol: ReactNode; children: ReactNode; rechts?: ReactNode }) {
  return (
    <p className="mv-mute mb-2 flex items-center gap-1.5 text-[11px] font-medium">
      {symbol}<span className="min-w-0 flex-1">{children}</span>{rechts}
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

export default function Einzelansicht(p: Props) {
  const t = useT();
  const hell = useHell();
  const [oben, setOben] = useState(0);
  /*
   * Die Ordnerliste: auf einem breiten Bildschirm daneben, auf einem schmalen darueber - und immer zuklappbar.
   * Der Betreiber (12.10.2026): sie soll "automatisch wieder zugehen beziehungsweise zuklappbar sein, wie frueher".
   * Nach der Wahl eines Streamers schliesst sie sich auf schmalen Bildschirmen von selbst; die Wahl wird gemerkt.
   */
  const [leisteOffen, setLeisteOffen] = useState(true);
  useEffect(() => {
    try {
      const gemerkt = localStorage.getItem('multihub_einzel_leiste');
      setLeisteOffen(gemerkt === null ? window.innerWidth >= 1024 : gemerkt === '1');
    } catch { setLeisteOffen(window.innerWidth >= 1024); }
  }, []);
  const leisteSetzen = (an: boolean) => {
    setLeisteOffen(an);
    try { localStorage.setItem('multihub_einzel_leiste', an ? '1' : '0'); } catch { /* ohne Speicher */ }
  };
  /** Auf einem schmalen Bildschirm nach der Wahl zuklappen (gemerkt wird das nicht - dort ist es nur Platz). */
  const schmalZu = () => { if (typeof window !== 'undefined' && window.innerWidth < 1024) setLeisteOffen(false); };
  const [neuerOrdner, setNeuerOrdner] = useState('');
  const [neuerKanal, setNeuerKanal] = useState('');
  const [neuFehler, setNeuFehler] = useState(false);
  const [umbenennen, setUmbenennen] = useState<{ id: string; name: string } | null>(null);
  const [suche, setSuche] = useState('');
  /*
   * Nach dem Titel des Streams filtern (Betreiber, 19.10.2026: "wenn bei einem Streamer LCQ im Titel steht, spielt er den laufenden Cup").
   * Ein Stichwort in der Liste - die Knoepfe darunter setzen die ueblichen. Nur wer gerade sendet und dieses Wort im Titel hat, bleibt.
   */
  const [titelFilter, setTitelFilter] = useState('');
  /** Der Streamer, dessen Name gerade geaendert wird. */
  const [streamerName, setStreamerName] = useState<{ twitch: string; name: string } | null>(null);
  const anzeige = (k: string) => p.namen[k] || k;
  /** Ist der Ordner "POVs" (die Profis, die einen freigegeben haben) der gewaehlte? Gemerkt wie die Leiste. */
  const [povOrdner, setPovOrdner] = useState(false);
  useEffect(() => {
    try { setPovOrdner(localStorage.getItem('multihub_einzel_povordner') === '1'); } catch { /* ohne Speicher */ }
  }, []);
  const povOrdnerSetzen = (an: boolean) => {
    setPovOrdner(an);
    try { localStorage.setItem('multihub_einzel_povordner', an ? '1' : '0'); } catch { /* ohne Speicher */ }
  };

  // Die Kopfzeile der Seite bleibt stehen; die Ansicht beginnt darunter (wie die Multiview).
  useLayoutEffect(() => {
    const messen = () => setOben(document.querySelector('header')?.getBoundingClientRect().bottom ?? 0);
    messen();
    window.addEventListener('resize', messen);
    return () => window.removeEventListener('resize', messen);
  }, []);
  useLayoutEffect(() => {
    const vorher = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = vorher; };
  }, []);

  const sendet = (k: string) => p.live[k.toLowerCase()] === true;
  const bekannt = (k: string) => p.live[k.toLowerCase()] !== undefined;
  const ordner = p.ordner;
  // Ohne Wahl gilt der erste Ordner - die Liste darunter ist nie leer, nur weil nichts angeklickt wurde.
  const gewaehlterOrdner = ordner.find((o) => o.id === p.aktivOrdner) ?? ordner[0];
  const povZeigen = povOrdner && p.povs.length > 0;
  const povInfo = p.aktivPov ? p.povs.find((x) => x.ident === p.aktivPov) : undefined;
  const chatName = !povInfo && p.aktiv ? p.aktiv.trim().toLowerCase() : '';
  const zeigeChat = p.chatAn && !!chatName && !!p.host;

  const q = suche.trim().toLowerCase();
  const streamerZeile = (twitch: string, ordnerId: string | null) => {
    const live = sendet(twitch);
    const fav = p.favoriten.includes(twitch);
    const gewaehlt = !p.aktivPov && p.aktiv === twitch;
    return (
      <li key={`${ordnerId ?? 'fav'}:${twitch}`}
        className={`group mv-hover flex items-center gap-1.5 rounded px-1.5 py-1 ${gewaehlt ? 'bg-sky-500/10 ring-1 ring-inset ring-sky-500/40' : ''}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${live ? 'bg-red-500' : 'bg-zinc-600'}`} />
        {streamerName?.twitch === twitch ? (
          <input autoFocus value={streamerName.name} placeholder={twitch}
            onChange={(e) => setStreamerName({ twitch, name: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { p.streamerUmbenennen?.(twitch, streamerName.name); setStreamerName(null); }
              if (e.key === 'Escape') setStreamerName(null);
            }}
            onBlur={() => { p.streamerUmbenennen?.(twitch, streamerName.name); setStreamerName(null); }}
            className="mv-fl min-w-0 flex-1 rounded-md border px-2 py-0.5 text-xs outline-none focus:border-sky-500" />
        ) : (
          <button type="button" onClick={() => { p.waehleStreamer(twitch); schmalZu(); }} title={p.namen[twitch] ? twitch : undefined}
            className={`min-w-0 flex-1 truncate text-left text-xs ${live ? 'font-semibold' : 'mv-mute'}`}>{anzeige(twitch)}</button>
        )}
        {!live && bekannt(twitch) && <span className="mv-mute shrink-0 text-[9px] uppercase tracking-wider">offline</span>}
        {p.streamerUmbenennen && streamerName?.twitch !== twitch && (
          <span className="flex shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <Knopf titel={t('Streamer umbenennen')} klick={() => setStreamerName({ twitch, name: p.namen[twitch] ?? twitch })}>
              <Zeichen d={D.stift} klein />
            </Knopf>
          </span>
        )}
        <Knopf titel={fav ? t('Favorit entfernen') : t('Als Favorit merken')} aktiv={fav} klick={() => p.favoritUmschalten(twitch)}>
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill={fav ? 'currentColor' : 'none'} stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={D.nadel} /></svg>
        </Knopf>
        {ordnerId && p.kannEntfernen(ordnerId, twitch) && (
          <Knopf titel={t('Aus dem Ordner entfernen')} gefahr klick={() => p.streamerEntfernen(ordnerId, twitch)}>
            <Zeichen d={D.kreuz} klein />
          </Knopf>
        )}
      </li>
    );
  };

  const leiste = (
    <aside data-tour="sidebar" className="mv-fl mv-rand flex h-full w-[min(320px,92vw)] flex-col border-r">
      <div className="mv-rand flex items-center gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold"><T>Einzelansicht</T></p>
        </div>
        <button type="button" onClick={p.zurMultiview}
          className="mv-fl mv-hover flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition">
          <Zeichen d={D.raster} klein /><T>Multi view</T>
        </button>
        <Knopf titel={t('Ordnerliste verbergen')} klick={() => leisteSetzen(false)}>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="14 18 8 12 14 6" />
          </svg>
        </Knopf>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Ordner anlegen - ganz oben. */}
        <Abschnitt>
          {p.darfOrdner ? (
            <form className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = neuerOrdner.trim();
                if (!n) return;
                p.ordnerAnlegen(n);
                setNeuerOrdner('');
              }}>
              <input value={neuerOrdner} onChange={(e) => setNeuerOrdner(e.target.value)}
                placeholder={t('Neuen Ordner anlegen …')}
                className="mv-fl min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-xs outline-none focus:border-sky-500" />
              <button type="submit" disabled={!neuerOrdner.trim()}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-sky-500 px-3 text-xs font-semibold text-white transition hover:bg-sky-400 disabled:opacity-40">
                <Zeichen d={D.plus} klein /><T>Anlegen</T>
              </button>
            </form>
          ) : (
            <p className="mv-mute text-[11px] leading-snug">
              {p.gast
                ? <T>Ordner anlegen geht nur angemeldet.</T>
                : <T>Eigene Ordner anlegen gehört zum VIP-Zugang. Spieler hinzufügen kannst du mit deinem Konto trotzdem.</T>}
            </p>
          )}
        </Abschnitt>

        {/* Favoriten */}
        {p.favoriten.length > 0 && (
          <Abschnitt>
            <Titel symbol={<Zeichen d={D.nadel} klein />}><T>Favoriten</T> ({p.favoriten.length})</Titel>
            <ul className="space-y-0.5">{p.favoriten.map((f) => streamerZeile(f, null))}</ul>
          </Abschnitt>
        )}

        {/*
          * Die Ordner - zum Anklicken, nicht zum Aufklappen. Der gewaehlte ist hervorgehoben, seine Streamer stehen darunter
          * in einem eigenen Abschnitt (wie vorher). Ganz oben der Ordner "POVs": die Profis, die einen als VIP freigegeben
          * haben - blau, nur lesen.
          */}
        <Abschnitt>
          <Titel symbol={<Zeichen d={D.ordner} klein />}><T>Ordner</T> ({ordner.length + (p.povs.length > 0 ? 1 : 0)})</Titel>
          <ul className="space-y-1">
            {p.povs.length > 0 && (
              <li>
                <button type="button" onClick={() => povOrdnerSetzen(true)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${povZeigen
                    ? 'border-sky-400 bg-sky-500/15' : 'border-sky-500/30 hover:border-sky-400/70 hover:bg-sky-500/10'}`}>
                  <span className="text-sky-400"><Zeichen d={D.sender} klein /></span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-sky-400">POVs</span>
                  <span className="mv-mute shrink-0 text-[10px] tabular-nums">{p.povs.length}</span>
                  {p.povs.some((x) => x.live) && (
                    <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold tabular-nums text-red-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />{p.povs.filter((x) => x.live).length}
                    </span>
                  )}
                </button>
              </li>
            )}
            {ordner.map((o) => {
              const gewaehlt = !povZeigen && gewaehlterOrdner?.id === o.id;
              const sende = o.streamers.filter((x) => sendet(x.twitch)).length;
              return (
                <li key={o.id}>
                  <div className={`group flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition ${gewaehlt
                    ? 'border-sky-500/60 bg-sky-500/10' : 'mv-rand mv-hover'}`}>
                    {umbenennen?.id === o.id ? (
                      <input autoFocus value={umbenennen.name}
                        onChange={(e) => setUmbenennen({ id: o.id, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { p.ordnerUmbenennen(o.id, umbenennen.name); setUmbenennen(null); }
                          if (e.key === 'Escape') setUmbenennen(null);
                        }}
                        onBlur={() => { if (umbenennen.name.trim()) p.ordnerUmbenennen(o.id, umbenennen.name); setUmbenennen(null); }}
                        className="mv-fl min-w-0 flex-1 rounded-md border px-2 py-1 text-xs outline-none focus:border-sky-500" />
                    ) : (
                      <button type="button" onClick={() => { povOrdnerSetzen(false); p.waehleOrdner(o.id); setSuche(''); }}
                        className="min-w-0 flex-1 truncate text-left text-xs font-semibold">{o.name}</button>
                    )}
                    <span className="mv-mute shrink-0 text-[10px] tabular-nums">{o.streamers.length}</span>
                    {sende > 0 && (
                      <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold tabular-nums text-red-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />{sende}
                      </span>
                    )}
                    {!p.gast && umbenennen?.id !== o.id && (
                      <span className="flex shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <Knopf titel={t('Ordner umbenennen')} klick={() => setUmbenennen({ id: o.id, name: o.name })}><Zeichen d={D.stift} klein /></Knopf>
                        <Knopf titel={t('Ordner löschen')} gefahr klick={() => { if (window.confirm(`${t('Ordner löschen')}: "${o.name}"?`)) p.ordnerLoeschen(o.id); }}>
                          <Zeichen d={D.muell} klein />
                        </Knopf>
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {ordner.length === 0 && p.povs.length === 0 && (
            <p className="mv-mute mt-1 text-center text-xs"><T>Noch keine Ordner</T></p>
          )}
        </Abschnitt>

        {/* Darunter: die POVs oder die Streamer des gewaehlten Ordners */}
        {povZeigen ? (
          <Abschnitt>
            <Titel symbol={<Zeichen d={D.sender} klein />}>POVs</Titel>
            <ul className="space-y-1">
              {p.povs.map((x) => (
                <li key={x.ident}>
                  <button type="button" onClick={() => { p.waehlePov(x.ident); schmalZu(); }}
                    className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${p.aktivPov === x.ident
                      ? 'border-sky-400 bg-sky-500/15' : 'border-sky-500/30 hover:border-sky-400/70 hover:bg-sky-500/10'}`}>
                    {x.bild
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={x.bild} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                      : <span className="mv-rand h-6 w-6 shrink-0 rounded-full border" />}
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-sky-400">{x.name}</span>
                    {x.live
                      ? <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-red-500"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />LIVE</span>
                      : <span className="mv-mute shrink-0 text-[9px] uppercase tracking-wider">offline</span>}
                    {/* Nur ein Zeichen: gesehen wird der Stream auf dieser Seite, nicht in Discord. */}
                    {x.discord && (
                      <span title={x.discord.streamt ? t('Der Profi streamt gerade in einem Discord-Sprachkanal') : t('Der Profi sitzt in einem Discord-Sprachkanal')}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${x.discord.streamt ? 'text-red-500' : 'text-indigo-300'}`}>
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                          <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.2a18.3 18.3 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.2 13.6.2 18.1a19.9 19.9 0 0 0 6 3l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12 0l.5.4a12.9 12.9 0 0 1-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.7-3.5-13.7ZM8.5 15.3c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Zm7 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z" />
                        </svg>
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </Abschnitt>
        ) : gewaehlterOrdner && (
          <Abschnitt>
            <Titel symbol={<Zeichen d={D.ordner} klein />}><T>Streamer in</T> &quot;{gewaehlterOrdner.name}&quot;</Titel>
            {!p.gast && (
              <form className="mb-2 flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const k = kanalAusEingabe(neuerKanal);
                  if (!k) { setNeuFehler(true); return; }
                  p.streamerHinzufuegen(gewaehlterOrdner.id, k);
                  setNeuerKanal(''); setNeuFehler(false);
                }}>
                <input value={neuerKanal} spellCheck={false}
                  onChange={(e) => { setNeuerKanal(e.target.value); setNeuFehler(false); }}
                  placeholder={t('Streamer zum Ordner hinzufügen …')}
                  className={`mv-fl min-w-0 flex-1 rounded-md border px-2 py-1 text-[11px] outline-none focus:border-sky-500 ${neuFehler ? 'border-rose-500' : ''}`} />
                <button type="submit" aria-label={t('Streamer zum Ordner hinzufügen')}
                  className="flex h-6 w-7 shrink-0 items-center justify-center rounded-md bg-sky-500 text-white transition hover:bg-sky-400">
                  <Zeichen d={D.plus} klein />
                </button>
              </form>
            )}
            <input value={suche} onChange={(e) => setSuche(e.target.value)} spellCheck={false}
              placeholder={t('Streamer suchen …')}
              className="mv-fl mb-2 w-full rounded-md border px-2 py-1 text-[11px] outline-none focus:border-sky-500" />
            <div className="mb-2">
              <input value={titelFilter} onChange={(e) => setTitelFilter(e.target.value)} spellCheck={false}
                placeholder={t('Im Stream-Titel suchen …')}
                className="mv-fl w-full rounded-md border px-2 py-1 text-[11px] outline-none focus:border-sky-500" />
              <div className="mt-1 flex flex-wrap gap-1">
                {['LCQ', 'Heat', 'Fast Track', 'Finals', 'Solo', 'Duo', 'Trio', 'Reload', 'Performance', 'Division', 'Cash'].map((w) => (
                  <button key={w} type="button" onClick={() => setTitelFilter((a) => (a.trim().toLowerCase() === w.toLowerCase() ? '' : w))}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition ${titelFilter.trim().toLowerCase() === w.toLowerCase() ? 'border-sky-500 bg-sky-500/15 text-sky-400' : 'mv-mute mv-hover'}`}>
                    {w}
                  </button>
                ))}
              </div>
            </div>
            {(() => {
              const liste = [...gewaehlterOrdner.streamers]
                .filter((x) => !q || x.twitch.toLowerCase().includes(q) || anzeige(x.twitch).toLowerCase().includes(q))
                .filter((x) => !titelFilter.trim() || (sendet(x.twitch) && (p.liveTitel?.[x.twitch.toLowerCase()] ?? '').toLowerCase().includes(titelFilter.trim().toLowerCase()) || (titelFilter.trim().toLowerCase() === 'lcq' && (p.liveTitel?.[x.twitch.toLowerCase()] ?? '').toLowerCase().includes('last chance'))))
                // Angeheftete stehen immer oben, danach die, die gerade senden.
                .sort((x, y) => Number(p.favoriten.includes(y.twitch)) - Number(p.favoriten.includes(x.twitch))
                  || Number(sendet(y.twitch)) - Number(sendet(x.twitch)));
              return (
                <>
                  {liste.length === 0 && <p className="mv-mute py-1 text-center text-[11px]"><T>Der Ordner ist leer</T></p>}
                  <ul className="space-y-0.5">{liste.map((x) => streamerZeile(x.twitch, gewaehlterOrdner.id))}</ul>
                </>
              );
            })()}
          </Abschnitt>
        )}
      </div>
    </aside>
  );

  return (
    <div className="mv-root fixed bottom-0 left-0 right-0 z-[300] flex overflow-hidden" style={{ top: oben }}>
      <style>{CSS}</style>

      {/* Die Seitenleiste: auf breiten Bildschirmen daneben, auf schmalen darueber (mit abgedunkeltem Rest zum Antippen). */}
      {leisteOffen && (
        <>
          <div className="absolute inset-0 z-10 bg-black/60 lg:hidden" onClick={() => setLeisteOffen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 z-20 shadow-2xl lg:static lg:z-auto lg:shrink-0 lg:shadow-none">{leiste}</div>
        </>
      )}

      {/* Rechts der Stream, dazu der Chat */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 px-3 py-2">
          {!leisteOffen && (
            <button type="button" onClick={() => leisteSetzen(true)} title={t('Ordnerliste anzeigen')} aria-label={t('Ordnerliste anzeigen')}
              className="mv-fl mv-hover flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition">
              <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round">
                <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" /><line x1="8" y1="3.5" x2="8" y2="16.5" />
              </svg>
            </button>
          )}
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">
            {povInfo ? povInfo.name : p.aktiv || ''}
          </p>
          {/* Chat an oder aus: ein Symbol im Stil der Leiste, kein Text-Knopf. */}
          {!povInfo && p.aktiv && (
            <button type="button" onClick={p.chatUmschalten} aria-pressed={p.chatAn}
              title={p.chatAn ? t('Chat ausblenden') : t('Chat einblenden')} aria-label={p.chatAn ? t('Chat ausblenden') : t('Chat einblenden')}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition ${p.chatAn
                ? 'border-sky-500/60 bg-sky-500/10 text-sky-400' : 'mv-fl mv-hover mv-mute'}`}>
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 4.5h14v9H8.5L5 16.5v-3H3z" />
                {!p.chatAn && <path d="M3 17L17 3" />}
              </svg>
            </button>
          )}
        </div>

        {/* Auf breiten Bildschirmen nebeneinander, auf schmalen untereinander - der Chat als Karte, wie vorher. */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3 md:flex-row md:overflow-hidden">
          <div data-tour="preview" className="aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-black md:aspect-auto md:h-full md:min-w-0 md:flex-1">
            {povInfo ? (
              <PovVideo key={povInfo.ident} pro={povInfo.ident} name={povInfo.name} stumm={Boolean(povInfo.lokal)}
                banner={{
                  einst: { an: p.einst.povBanner, ort: p.einst.povBannerOrt, mitBild: p.einst.povBannerBild, groesse: p.einst.povBannerGroesse },
                  name: povInfo.name, bild: povInfo.bild,
                }}
                aendereBanner={p.aendereBanner}
                stats={povInfo.stats ? {
                  einst: { an: p.einst.povStats, ort: p.einst.povStatsOrt, mitBild: p.einst.povStatsBild, groesse: p.einst.povStatsGroesse },
                  name: povInfo.name, bild: povInfo.bild,
                } : undefined}
                aendereStats={p.aendereStats} />
            ) : p.aktiv && p.host ? (
              <div className="h-full w-full"><Kachel key={p.aktiv} kanal={p.aktiv} parent={p.host} ton lautstaerke={p.lautstaerke} /></div>
            ) : (
              <div className="mv-mute flex h-full items-center justify-center px-6 text-center text-sm">
                <T>Wähle links einen Streamer oder ein Pro-POV.</T>
              </div>
            )}
          </div>
          {zeigeChat && (
            <div data-tour="chat" className="mv-fl mv-rand flex h-[480px] w-full shrink-0 flex-col overflow-hidden rounded-xl border shadow-2xl md:h-full md:w-[360px]">
              <div className="mv-rand mv-mute flex items-center justify-between border-b px-3 py-2 text-[10px] font-bold uppercase tracking-widest">
                <span> Chat: {chatName || 'None'}</span>
              </div>
              <div className="mv-fl min-h-0 flex-1 overflow-hidden">
                <iframe title={`Twitch chat für ${chatName}`} className="h-full w-full"
                  src={`https://www.twitch.tv/embed/${chatName}/chat?parent=${p.host}${hell ? '' : '&darkpopout'}`} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
