import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Abschnitt, Flaeche, Leer } from '../../ds/Bausteine';
import { useWer } from '../../teile/Anmeldung';
import { ARTEN, FREIE_ARTEN, darfArt, overlayAdresse } from './ov/OverlayGeruest';
import { MARKE } from './ov/ort';
import { REIHENFOLGE, probeVon, useProbeDaten } from './ov/proben';
import { useZugang } from './ov/zugang';
import { Kanalbild, Kopieren, LiveMarke, ProbeBuehne, StreamBild, StufenMarke, Zeichen, Zuschauer, useMeineOverlays } from './Teile';
import { GRUPPEN, MV_PFAD, ansichtMerken, kurzZahl, useLive, vorschaubild, wandLesen, wandSetzen, type Kanal } from './live';

/*
 * Das Studio - die Startseite des Streamer-Bereichs nach dem Anmelden, gebaut wie ein Regieraum (Betreiber, 27.11.2026):
 *   - Regieleiste statt Begruessung: Stufe (Free / VIP / Admin), wie viele live sind, der eigene Kanal, Overlays, Bot, die zwei Hauptknoepfe
 *   - Programm: der groesste laufende Stream gross, darunter die naechsten als Vorschau-Monitore (ein Klick holt sie ins Programm);
 *     "Watch in multiview" legt ihn auf die Wand und oeffnet sie
 *   - rechts: der eigene Kanal (live oder nicht, Weg zur eigenen Seite) und der Geraeteschrank - jedes Werkzeug eine Zeile mit seinem Stand
 *     (Bot an/aus mit Befehlen, Statistik mit Followern); VIP in Gold, Gesperrtes ruhig mit Schloss. Keine Kachelwand.
 *   - die eigenen Overlays als laufende Vorschau mit "Copy OBS URL" - oder, solange keins gespeichert ist, die Arten zum Anlegen
 * Daten: /api/streamers + /api/live-status, /api/overlay-config?meine=1, /api/twitch-bot, /api/twitch-statistik (beide nur mit dem Recht).
 */

const MERKER = 'hub-streamer-kanal';
const liesKanal = () => { try { return localStorage.getItem(MERKER) ?? ''; } catch { return ''; } };

interface BotStand { an: boolean; login: string; befehle: number; regeln: number; verbunden: boolean; mod: boolean | null }
interface StatStand { name: string; follower: number | null; live: boolean; zuschauer: number | null; schnitt: number | null; spitze: number | null }

/** Der Stand des Twitch-Bots und der Statistik - nur geholt, wenn das Konto das Werkzeug hat. null = keine Auskunft. */
function useTwitch(bot: boolean, stat: boolean) {
  const [b, setB] = useState<BotStand | null>(null);
  const [s, setS] = useState<StatStand | null>(null);
  useEffect(() => {
    if (!bot) { setB(null); return; }
    let weg = false;
    fetch('/api/twitch-bot', { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      if (weg || !j?.ok || !j.einstellung) return;
      setB({ an: !!j.einstellung.an, login: String(j.einstellung.login ?? ''), befehle: (j.einstellung.befehle ?? []).length, regeln: (j.einstellung.regeln ?? []).length, verbunden: !!j.bot, mod: j.moderator ?? null });
    }).catch(() => {});
    return () => { weg = true; };
  }, [bot]);
  useEffect(() => {
    if (!stat) { setS(null); return; }
    let weg = false;
    fetch('/api/twitch-statistik', { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      const a = j?.auswertung; if (weg || !j?.ok || !a) return;
      setS({ name: String(a.name ?? a.login ?? ''), follower: a.follower ?? null, live: !!a.live, zuschauer: a.live?.zuschauer ?? null, schnitt: a.tracker?.avgViewers ?? a.werte?.durchschnitt ?? null, spitze: a.tracker?.maxViewers ?? a.werte?.peak ?? null });
    }).catch(() => {});
    return () => { weg = true; };
  }, [stat]);
  return { bot: b, stat: s };
}

/** Der eigene Kanal: aus der Live-Liste, sonst eine eigene Anfrage (POST /api/live-status). */
function useMeinKanal(login: string, liste: Kanal[] | null) {
  const [stand, setStand] = useState<{ isLive: boolean; viewers: number; title?: string; bild?: string | null } | null>(null);
  const ausListe = liste?.find((k) => k.login === login);
  useEffect(() => {
    if (!login || ausListe) return undefined;
    let weg = false;
    const los = () => fetch('/api/live-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [login] }) })
      .then((r) => r.json()).then((j) => { if (!weg && j?.[login] && !j[login].unbekannt) setStand(j[login]); }).catch(() => {});
    void los(); const i = setInterval(los, 60_000);
    return () => { weg = true; clearInterval(i); };
  }, [login, ausListe]);
  return ausListe ?? stand;
}

function StatusFeld({ label, children, ton = 'weiss' }: { label: string; children: React.ReactNode; ton?: 'weiss' | 'rot' | 'gruen' | 'gold' | 'still' }) {
  const farbe = { weiss: 'text-white', rot: 'text-red-300', gruen: 'text-emerald-300', gold: 'text-amber-200', still: 'text-white/45' }[ton];
  return (
    <div className="min-w-0 px-5 py-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{label}</p>
      <p className={`mt-0.5 truncate text-sm font-bold ${farbe}`}>{children}</p>
    </div>
  );
}

interface Werkzeug { z: string; titel: string; text: string; zu: string; vip: boolean; recht?: string | null; stand?: React.ReactNode }

export default function Studio() {
  const { wer, oeffnen } = useWer();
  const z = useZugang();
  const weiter = useNavigate();
  const { liste, takt, fehler } = useLive();
  const daten = useProbeDaten();
  const [start] = useState(() => Date.now() + 2 * 3_600_000 + 14 * 60_000);
  const meine = useMeineOverlays(z.nutzer);
  const hat = (recht: string | null | undefined) => z.admin || (z.vip && (recht == null || z.rechte.includes(recht)));
  const twitch = useTwitch(!z.laedt && hat('twitchbot'), !z.laedt && hat('twitchstatistik'));

  const live = useMemo(() => (liste ?? []).filter((k) => k.isLive).sort((a, b) => b.viewers - a.viewers), [liste]);
  const zuschauer = live.reduce((s, k) => s + k.viewers, 0);
  const [wahl, setWahl] = useState<string | null>(null);
  const programm = live.find((k) => k.login === wahl) ?? live[0] ?? null;
  const monitore = live.filter((k) => k.login !== programm?.login).slice(0, 4);
  const [wand, setWand] = useState<string[]>(wandLesen);

  const [kanal] = useState(() => liesKanal() || (wer?.userName ?? '').toLowerCase().replace(/[^a-z0-9_]/g, ''));
  const mein = useMeinKanal(kanal, liste);

  const stufe = z.admin ? 'Admin' : z.manager ? 'Manager' : z.pro ? 'Pro' : z.vip ? 'VIP' : 'Free';
  const schauen = (login: string) => { wandSetzen(login, true); ansichtMerken(true); weiter(MV_PFAD); };
  const aufWand = (login: string) => { wandSetzen(login, !wand.includes(login)); setWand(wandLesen()); };

  const arten = useMemo(() => REIHENFOLGE.map((s) => ARTEN.find((a) => a.schluessel === s)).filter((a): a is (typeof ARTEN)[number] => !!a), []);
  const gespeichert = (meine ?? []).slice().sort((a, b) => String(b.geaendert).localeCompare(String(a.geaendert)));

  const werkzeuge: Werkzeug[] = [
    { z: 'wand', titel: 'Multiview', text: 'Several streams at once – folders, filters, quality, saved walls.', zu: MV_PFAD, vip: false, stand: wand.length ? `${wand.length} on your wall` : 'Wall is empty' },
    { z: 'pokal', titel: 'Globals 2026 overlays', text: 'Leaderboard, player banner and free overlay in the Global Championship look.', zu: '/streamer/overlays/globals', vip: true, recht: null },
    { z: 'bot', titel: 'Twitch bot', text: 'Your own chat commands and rules against insults – around the clock.', zu: '/streamer/twitch-bot', vip: true, recht: 'twitchbot', stand: twitch.bot ? `${twitch.bot.an ? 'Listening' : 'Off'} in ${twitch.bot.login} · ${twitch.bot.befehle} commands · ${twitch.bot.regeln} rules` : undefined },
    { z: 'kurve', titel: 'Twitch statistics', text: 'Peak with and without raids, followers, chatters per day, week, month.', zu: '/streamer/twitch-stats', vip: true, recht: 'twitchstatistik', stand: twitch.stat?.follower != null ? `${twitch.stat.follower.toLocaleString('en')} followers${twitch.stat.schnitt != null ? ` · avg ${twitch.stat.schnitt.toLocaleString('en')}` : ''}${twitch.stat.spitze != null ? ` · peak ${twitch.stat.spitze.toLocaleString('en')}` : ''}` : undefined },
    { z: 'finder', titel: 'Match-ID finder', text: 'Save favourites and see the running match ID to watch.', zu: '/competitive/match-finder', vip: true, recht: 'matchfinder' },
    { z: 'replay', titel: 'Replays', text: 'Every game of a cup in 2D and 3D: zones, kill feed, teams.', zu: '/competitive/replays', vip: true, recht: 'replays' },
    { z: 'pov', titel: 'Pro POVs', text: 'Sign pros up by link and watch their POV on your wall.', zu: '/competitive/pov', vip: true, recht: 'propov' },
    { z: 'archiv', titel: 'My archive', text: 'Every overlay, tier list and prediction you saved.', zu: '/streamer/vip#archiv', vip: false },
  ];
  const offen = werkzeuge.filter((w) => !w.vip || hat(w.recht)).length;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ Regieleiste: wo man ist, was laeuft, die zwei Hauptknoepfe - kein Begruessungskopf */}
      <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="fl-fest flex flex-wrap items-stretch overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3.5">
          <h1 className="titel text-4xl">Studio</h1>
          {!z.laedt && (z.vip ? <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-black">{stufe}</span> : <StufenMarke vip={false} />)}
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-2 divide-white/[0.06] border-white/[0.06] max-lg:basis-full max-lg:border-t md:grid-cols-4 md:divide-x lg:border-l">
          <StatusFeld label="On air" ton={live.length ? 'rot' : 'still'}>{liste ? <>{live.length} live · {kurzZahl(zuschauer)} watching</> : fehler ? 'Twitch is not answering' : '…'}</StatusFeld>
          <StatusFeld label="Your channel" ton={mein?.isLive ? 'rot' : 'weiss'}>{kanal ? <>{kanal} · {mein ? (mein.isLive ? `live, ${kurzZahl(mein.viewers)}` : 'offline') : '…'}</> : 'Not set yet'}</StatusFeld>
          <StatusFeld label="Overlays" ton={meine?.length ? 'weiss' : 'still'}>{meine ? (meine.length ? `${meine.length} saved` : 'None saved yet') : '…'}</StatusFeld>
          <StatusFeld label="Twitch bot" ton={twitch.bot?.an ? 'gruen' : 'still'}>{z.laedt ? '…' : !hat('twitchbot') ? (z.vip ? 'Not switched on' : 'VIP tool') : twitch.bot ? (twitch.bot.an ? `On in ${twitch.bot.login}` : 'Off') : 'No channel yet'}</StatusFeld>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-white/[0.06] px-5 py-3 max-lg:basis-full max-lg:border-t lg:border-l">
          <Link to={MV_PFAD} onClick={() => ansichtMerken(true)} className="knopf-prim"><Zeichen name="wand" className="h-4 w-4" />Open multiview</Link>
          <Link to="/streamer/overlays" className="knopf"><Zeichen name="overlay" className="h-4 w-4" />New overlay</Link>
        </div>
      </motion.header>

      {/* ------------------------------------------------ Programm + eigener Kanal */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <Flaeche fest className="min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div className="flex items-center gap-3"><span className="h-5 w-1 rounded-full bg-red-500 shadow-[0_0_14px_rgba(239,68,68,0.8)]" /><h2 className="titel text-2xl">On air now</h2>{liste && <span className="zahl text-sm font-bold text-red-300">{live.length}</span>}</div>
            <Link to="/streamer/streams" className="knopf-leer">All live streams <span aria-hidden>→</span></Link>
          </div>
          {!liste ? <div className="mx-5 mb-5 aspect-video animate-pulse rounded-2xl bg-white/[0.04]" />
            : !programm ? <div className="px-5 pb-5"><Leer text="Nobody on CompHub's list is live right now – the list refreshes every minute."><Link to="/streamer/streams" className="knopf">Browse all channels</Link></Leer></div>
            : (
              <>
                <div className="group relative mx-3 overflow-hidden rounded-2xl ring-1 ring-white/[0.07] sm:mx-5">
                  <button type="button" onClick={() => schauen(programm.login)} title="Watch in multiview" className="block w-full text-left">
                    <StreamBild k={programm} takt={takt} gross>
                      <span className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white opacity-0 ring-1 ring-white/20 backdrop-blur transition group-hover:opacity-100">
                        <svg viewBox="0 0 24 24" className="h-7 w-7 translate-x-0.5" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                      </span>
                    </StreamBild>
                  </button>
                  <div className="flex flex-wrap items-end gap-x-4 gap-y-3 px-4 py-4 md:pointer-events-none md:absolute md:inset-x-0 md:bottom-0 md:bg-gradient-to-t md:from-black/95 md:via-black/70 md:to-transparent md:px-5 md:pb-4 md:pt-16">
                    <Kanalbild src={programm.bild} className="h-12 w-12 rounded-xl ring-1 ring-white/15" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2"><span className="titel truncate text-3xl">{programm.anzeige || programm.login}</span><span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">{GRUPPEN[programm.gruppe] ?? programm.gruppe}</span></p>
                      <p className="truncate text-sm text-white/60">{programm.title}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 md:pointer-events-auto">
                      <button type="button" onClick={() => schauen(programm.login)} className="knopf-prim"><Zeichen name="wand" className="h-4 w-4" />Watch in multiview</button>
                      <button type="button" onClick={() => aufWand(programm.login)} className={`knopf ${wand.includes(programm.login) ? '!border-akz/50 !text-akz' : ''}`}><Zeichen name={wand.includes(programm.login) ? 'haken' : 'plus'} className="h-4 w-4" />{wand.includes(programm.login) ? 'On your wall' : 'Add to wall'}</button>
                      <a href={`https://twitch.tv/${programm.login}`} target="_blank" rel="noreferrer" className="knopf" title="Open on Twitch"><Zeichen name="aussen" className="h-4 w-4" /></a>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 p-3 sm:p-5 md:grid-cols-4">
                  {monitore.map((k) => (
                    <button key={k.login} type="button" onClick={() => setWahl(k.login)} title="Show in the big monitor" className="group overflow-hidden rounded-xl text-left ring-1 ring-white/[0.07] transition hover:ring-akz/50">
                      <div className="relative aspect-video overflow-hidden bg-black">
                        <MonitorBild login={k.login} takt={takt} />
                        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 to-transparent" />
                        <span className="absolute right-2 top-2"><Zuschauer n={k.viewers} /></span>
                        <p className="absolute inset-x-2.5 bottom-2 truncate text-sm font-bold text-white">{k.anzeige || k.login}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
        </Flaeche>

        <div className="flex min-w-0 flex-col gap-4">
          {/* der eigene Kanal */}
          <Flaeche fest verz={0.06} className="p-5">
            <div className="flex items-center justify-between gap-3"><p className="ueber">Your channel</p>{mein?.isLive && <LiveMarke klein />}</div>
            {kanal ? (
              <>
                <div className="mt-3 flex items-center gap-3.5">
                  <Kanalbild src={mein?.bild} className={`h-14 w-14 rounded-2xl ring-2 ${mein?.isLive ? 'ring-red-500' : 'ring-white/10'}`} />
                  <div className="min-w-0">
                    <p className="titel truncate text-3xl">{kanal}</p>
                    <p className="truncate text-sm text-white/50">{!mein ? 'Asking Twitch …' : mein.isLive ? <><b className="zahl text-red-300">{mein.viewers.toLocaleString('en')} watching</b> · {mein.title}</> : 'Offline right now'}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to="/streamer/my-page" className="knopf"><Zeichen name="seite" className="h-4 w-4" />My page</Link>
                  {z.vip && <Link to={`/streamer/page/${kanal}`} className="knopf">Streamer page</Link>}
                  <a href={`https://twitch.tv/${kanal}`} target="_blank" rel="noreferrer" className="knopf" title="Open on Twitch"><Zeichen name="aussen" className="h-4 w-4" /></a>
                </div>
              </>
            ) : <p className="mt-3 text-sm text-white/55">Tell CompHub your Twitch channel on <Link to="/streamer/my-page" className="font-semibold text-akz">My page</Link> – it then shows up here with its live status.</p>}
          </Flaeche>

          {/* Geraeteschrank: jedes Werkzeug eine Zeile mit seinem Stand - keine Kachelwand */}
          <Flaeche fest verz={0.12} className="flex-1 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 pt-5"><p className="ueber">Your tools</p><span className="zahl text-xs font-semibold text-white/40">{offen} of {werkzeuge.length} unlocked</span></div>
            <div className="mt-2 divide-y divide-white/[0.05]">
              {werkzeuge.map((w) => {
                const frei = !w.vip || hat(w.recht);
                const innen = (
                  <>
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ${frei ? (w.vip ? 'bg-amber-400/10 text-amber-200 ring-amber-300/25' : 'bg-akz/10 text-akz ring-akz/25') : 'bg-white/[0.03] text-white/25 ring-white/[0.06]'}`}><Zeichen name={frei ? w.z : 'schloss'} className="h-[18px] w-[18px]" /></span>
                    <span className="min-w-0 flex-1">
                      <span className={`flex items-center gap-2 text-sm font-bold ${frei ? 'text-white' : 'text-white/45'}`}>{w.titel}{w.vip && <span className={`text-[9px] font-extrabold uppercase tracking-[0.18em] ${frei ? 'text-amber-300' : 'text-amber-200/50'}`}>VIP</span>}</span>
                      <span className={`block truncate text-xs ${frei ? 'text-white/50' : 'text-white/30'}`}>{frei ? (w.stand ?? w.text) : z.vip ? 'Not switched on for you yet – ask on Discord' : w.text}</span>
                    </span>
                    <Zeichen name="pfeil" className="h-4 w-4 shrink-0 text-white/25 transition group-hover:translate-x-1 group-hover:text-akz" />
                  </>
                );
                const klasse = 'group flex w-full items-center gap-3.5 px-5 py-3 text-left transition hover:bg-white/[0.03]';
                if (frei) return <Link key={w.titel} to={w.zu} title={w.text} onClick={w.zu === MV_PFAD ? () => ansichtMerken(true) : undefined} className={klasse}>{innen}</Link>;
                return z.vip
                  ? <a key={w.titel} href={MARKE.discord} target="_blank" rel="noreferrer" title={w.text} className={klasse}>{innen}</a>
                  : <button key={w.titel} type="button" onClick={() => oeffnen('schluessel')} title="Unlock with a VIP access key" className={klasse}>{innen}</button>;
              })}
            </div>
            {!z.laedt && !z.vip && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/[0.06] px-5 py-4">
                <button type="button" onClick={() => oeffnen('schluessel')} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-black transition hover:brightness-110"><Zeichen name="schluessel" className="h-4 w-4" />Enter VIP key</button>
                <a href={MARKE.discord} target="_blank" rel="noreferrer" className="text-xs font-semibold text-amber-200 hover:text-amber-100">No key yet? Ask on Discord →</a>
              </div>
            )}
          </Flaeche>
        </div>
      </div>

      {/* ------------------------------------------------ die eigenen Overlays */}
      <Abschnitt ueber="OBS browser source" titel={gespeichert.length ? 'Your overlays' : 'Start with an overlay'} zu="/streamer/overlays" zuText="Overlay gallery">
        {meine === null ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <div key={i} className="fl-fest aspect-[16/11] animate-pulse" />)}</div>
          : gespeichert.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {gespeichert.slice(0, 5).map((o, i) => {
                const art = ARTEN.find((a) => a.schluessel === o.typ);
                const adresse = overlayAdresse(o.typ, o.id);
                return (
                  <Flaeche key={o.id} fest verz={i * 0.05} className="flex flex-col overflow-hidden">
                    <ProbeBuehne probe={{ src: adresse, b: 1920, h: 1080, aus: probeVon(o.typ, daten, start)?.aus ?? { x: 0, y: 0, w: 1920, h: 1080 } }} titel={o.name} />
                    <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><h3 className="truncate text-[15px] font-bold text-white">{o.name}</h3><p className="text-xs text-white/45">{art?.titel ?? o.typ}{o.geaendert ? ` · changed ${new Date(o.geaendert).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</p></div>
                        <StufenMarke vip={!FREIE_ARTEN.includes(o.typ)} />
                      </div>
                      <div className="mt-auto flex flex-wrap gap-2 pt-4">
                        <Kopieren wert={adresse} className="knopf-prim !px-4 !py-2" />
                        {art && <Link to={`${art.pfad}?id=${encodeURIComponent(o.id)}&bauen=1`} reloadDocument className="knopf">Edit</Link>}
                      </div>
                    </div>
                  </Flaeche>
                );
              })}
              <Link to="/streamer/overlays" className="fl-fest fl-klick group grid min-h-[220px] place-items-center p-6 text-center">
                <div>
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-akz/10 text-akz ring-1 ring-akz/30 transition group-hover:bg-akz group-hover:text-black"><Zeichen name="plus" className="h-6 w-6" /></span>
                  <p className="titel mt-4 text-2xl">New overlay</p>
                  <p className="mt-1 text-sm text-white/50">{gespeichert.length > 5 ? <>All {gespeichert.length} saved overlays are in your <span className="text-akz">archive</span>.</> : 'Choose one, adjust it, copy the URL into OBS.'}</p>
                </div>
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {arten.map((a, i) => {
                const frei = darfArt(z, a.schluessel);
                return (
                  <Flaeche key={a.schluessel} fest verz={i * 0.05} className="flex flex-col overflow-hidden">
                    <div className={frei ? '' : 'opacity-60 saturate-50'}><ProbeBuehne probe={probeVon(a.schluessel, daten, start)} titel={a.titel} /></div>
                    <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><h3 className="titel text-2xl">{a.titel}</h3><p className="mt-0.5 text-sm text-white/50">{a.kurz}</p></div>
                        <StufenMarke vip={!FREIE_ARTEN.includes(a.schluessel)} zu={!frei} />
                      </div>
                      <div className="mt-auto pt-4">
                        {frei ? <Link to={a.ohneCup ? a.pfad : `${a.pfad}?neu=1`} className="knopf-prim !px-4 !py-2">Create <span aria-hidden>→</span></Link>
                          : <button type="button" onClick={() => oeffnen('schluessel')} className="knopf"><Zeichen name="schloss" className="h-4 w-4" />Unlock with a VIP key</button>}
                      </div>
                    </div>
                  </Flaeche>
                );
              })}
            </div>
          )}
      </Abschnitt>
    </div>
  );
}

/** Kleines Vorschaubild eines Monitors; laedt es nicht, bleibt die dunkle Flaeche. */
function MonitorBild({ login, takt }: { login: string; takt: number }) {
  const [kaputt, setKaputt] = useState(false);
  useEffect(() => setKaputt(false), [login]);
  if (kaputt) return <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_120%,rgb(var(--akz)/0.28),transparent_60%),linear-gradient(180deg,#141722,#07080d)]" aria-hidden />;
  return <img src={vorschaubild(login, takt, 440, 248)} alt="" loading="lazy" draggable={false} onError={() => setKaputt(true)} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />;
}
