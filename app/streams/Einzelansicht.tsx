'use client';

import { useLayoutEffect, useState, type ReactNode } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import Kachel from './Kachel';
import PovVideo from './PovVideo';
import type { BannerEinst, StatsEinst } from './PovVideo';
import { CSS } from './Multiview';
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
  discord?: { streamt: boolean; kanal: string | null; link: string | null } | null;
}

interface Props {
  host: string;
  ordner: OrdnerEintrag[];
  aktivOrdner: string;
  waehleOrdner: (id: string) => void;
  /** Twitch-Name (klein) -> sendet gerade. */
  live: Record<string, boolean>;
  favoriten: string[];
  favoritUmschalten: (twitch: string) => void;
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
  const [oben, setOben] = useState(0);
  const [handyOffen, setHandyOffen] = useState(false);
  const [neuerOrdner, setNeuerOrdner] = useState('');
  const [neuerKanal, setNeuerKanal] = useState('');
  const [neuFehler, setNeuFehler] = useState(false);
  const [umbenennen, setUmbenennen] = useState<{ id: string; name: string } | null>(null);
  const [suche, setSuche] = useState('');

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
  const offen = ordner.find((o) => o.id === p.aktivOrdner);
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
        <button type="button" onClick={() => { p.waehleStreamer(twitch); setHandyOffen(false); }}
          className={`min-w-0 flex-1 truncate text-left text-xs ${live ? 'font-semibold' : 'mv-mute'}`}>{twitch}</button>
        {!live && bekannt(twitch) && <span className="mv-mute shrink-0 text-[9px] uppercase tracking-wider">offline</span>}
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
    <aside data-tour="sidebar" className="mv-fl mv-rand flex h-full w-full flex-col border-r lg:w-[320px]">
      <div className="mv-rand flex items-center gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">CompHub <T>Einzelansicht</T></p>
        </div>
        <button type="button" onClick={p.zurMultiview}
          className="mv-fl mv-hover flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition">
          <Zeichen d={D.raster} klein /><T>Multi view</T>
        </button>
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

        {/* Der Ordner der Profis: blau, nur lesen, auch offline. */}
        {p.povs.length > 0 && (
          <Abschnitt>
            <Titel symbol={<Zeichen d={D.sender} klein />}><T>Pro-POVs</T> ({p.povs.length})</Titel>
            <ul className="space-y-1">
              {p.povs.map((x) => (
                <li key={x.ident}>
                  <button type="button" onClick={() => { p.waehlePov(x.ident); setHandyOffen(false); }}
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
        )}

        {/* Favoriten */}
        {p.favoriten.length > 0 && (
          <Abschnitt>
            <Titel symbol={<Zeichen d={D.nadel} klein />}><T>Favoriten</T> ({p.favoriten.length})</Titel>
            <ul className="space-y-0.5">{p.favoriten.map((f) => streamerZeile(f, null))}</ul>
          </Abschnitt>
        )}

        {/* Ordner und darunter die Streamer des gewaehlten Ordners */}
        <Abschnitt>
          <Titel symbol={<Zeichen d={D.ordner} klein />}><T>Ordner</T> ({ordner.length})</Titel>
          {ordner.length === 0 ? (
            <p className="mv-mute text-center text-xs"><T>Noch keine Ordner</T></p>
          ) : (
            <ul className="space-y-1">
              {ordner.map((o) => {
                const aufgeklappt = o.id === p.aktivOrdner;
                const sende = o.streamers.filter((x) => sendet(x.twitch)).length;
                const liste = [...o.streamers]
                  .filter((x) => !q || x.twitch.toLowerCase().includes(q))
                  .sort((x, y) => Number(sendet(y.twitch)) - Number(sendet(x.twitch)));
                return (
                  <li key={o.id} className="mv-rand rounded-lg border">
                    <div className="group flex items-center gap-1.5 px-2 py-1.5">
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
                        <button type="button" onClick={() => p.waehleOrdner(aufgeklappt ? '' : o.id)} aria-expanded={aufgeklappt}
                          className="flex min-w-0 flex-1 items-center gap-1 text-left">
                          <svg viewBox="0 0 20 20" className={`mv-mute h-3 w-3 shrink-0 transition ${aufgeklappt ? 'rotate-90' : ''}`} fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4l6 6-6 6" /></svg>
                          <span className="truncate text-xs font-semibold">{o.name}</span>
                        </button>
                      )}
                      <span className="mv-mute shrink-0 text-[10px] tabular-nums">{o.streamers.length}</span>
                      {sende > 0 && (
                        <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold tabular-nums text-red-500">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />{sende}
                        </span>
                      )}
                      {!p.gast && umbenennen?.id !== o.id && (
                        <span className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <Knopf titel={t('Ordner umbenennen')} klick={() => setUmbenennen({ id: o.id, name: o.name })}><Zeichen d={D.stift} klein /></Knopf>
                          <Knopf titel={t('Ordner löschen')} gefahr klick={() => { if (window.confirm(`${t('Ordner löschen')}: "${o.name}"?`)) p.ordnerLoeschen(o.id); }}>
                            <Zeichen d={D.muell} klein />
                          </Knopf>
                        </span>
                      )}
                    </div>

                    {aufgeklappt && (
                      <div className="mv-rand border-t px-2 py-1.5">
                        <input value={suche} onChange={(e) => setSuche(e.target.value)} spellCheck={false}
                          placeholder={t('Streamer suchen …')}
                          className="mv-fl mb-1.5 w-full rounded-md border px-2 py-1 text-[11px] outline-none focus:border-sky-500" />
                        {liste.length === 0 && <p className="mv-mute py-1 text-center text-[11px]"><T>Der Ordner ist leer</T></p>}
                        <ul className="space-y-0.5">{liste.map((x) => streamerZeile(x.twitch, o.id))}</ul>
                        {!p.gast && (
                          <form className="mt-1.5 flex gap-1.5"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const k = kanalAusEingabe(neuerKanal);
                              if (!k) { setNeuFehler(true); return; }
                              p.streamerHinzufuegen(o.id, k);
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
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Abschnitt>
      </div>
    </aside>
  );

  return (
    <div className="mv-root fixed bottom-0 left-0 right-0 z-[300] flex overflow-hidden" style={{ top: oben }}>
      <style>{CSS}</style>

      {/* Links die Seitenleiste; auf dem Handy hinter einem Knopf. */}
      <div className={`${handyOffen ? 'absolute inset-0 z-20 flex' : 'hidden'} lg:static lg:z-auto lg:flex lg:shrink-0`}>{leiste}</div>

      {/* Rechts der Stream, dazu der Chat */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mv-rand flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
          <button type="button" onClick={() => setHandyOffen((x) => !x)}
            className="mv-fl mv-hover rounded-md border px-2.5 py-1 text-xs lg:hidden"><T>Ordner</T></button>
          <p className="min-w-0 flex-1 truncate text-xs font-semibold">
            {povInfo ? povInfo.name : p.aktiv || ''}
          </p>
          {!povInfo && p.aktiv && (
            <button type="button" onClick={p.chatUmschalten}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition ${p.chatAn ? 'border-sky-500 bg-sky-500/15 text-sky-400' : 'mv-fl mv-hover'}`}>
              <Zeichen d={D.chat} klein />{p.chatAn ? <T>Chat an</T> : <T>Chat aus</T>}
            </button>
          )}
        </div>

        <div className="flex min-h-0 flex-1">
          <div data-tour="preview" className="min-w-0 flex-1 bg-black">
            {povInfo ? (
              <PovVideo key={povInfo.ident} pro={povInfo.ident} name={povInfo.name} stumm={false}
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
            <div data-tour="chat" className="mv-rand hidden w-[380px] shrink-0 border-l md:block">
              <iframe title={`Twitch chat ${chatName}`} className="h-full w-full"
                src={`https://www.twitch.tv/embed/${chatName}/chat?parent=${p.host}&darkpopout`} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
