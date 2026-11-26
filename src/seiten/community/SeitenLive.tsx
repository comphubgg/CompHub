import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Glas } from '../../teile/Glas';
import { DatenFehlen, KalenderKnopf, ModusUmschalter, restText, useHubDatei, useJetzt, ZeitChips } from './Bausteine';
import { Laedt, TEAL, Ueberschrift } from './Teile';

/*
 * Live-Seiten: Player Count, Creative, News, Tournaments (Teaser in /competitive/events), Stats (Spielersuche), Notifications.
 *   - Player Count / Creative: Epic veroeffentlicht keine offene Spielerzahl - noetig ist ein eigener Sammler auf dem Server (alle paar Minuten
 *     abfragen und speichern). Bis dahin liest die Seite /hub-daten/spieler.json bzw. creative.json, wenn vorhanden, sonst ehrlicher Hinweis.
 *   - News: fortnite-api.com/v2/news/br (erlaubt Abfragen aus dem Browser).
 *   - Tournaments: /api/cup-events?region=.. wie die Events-Seite, nur kommende Spieltage als Teaser.
 *   - Stats: Spielersuche ueber /api/spieler-namen (Verzeichnis der Seite) -> Spielerseite im Competitive-Bereich; /api/stats (tracker.gg) nur,
 *     wenn die Seite den Schluessel hat.
 */

/* ---------------------------------------------- Player Count */
interface Punkt { t: string; online: number; inMatch?: number }
const ZEIT_MS: Record<string, number> = { '1H': 36e5, '1D': 864e5, '1W': 6048e5, '1M': 2592e6, '1Y': 31536e6, ALL: Infinity };
export function Spielerzahl() {
  const { daten, status } = useHubDatei<{ punkte: Punkt[]; allTimePeak?: { wert: number; t: string } }>('spieler.json');
  const [zeit, setZeit] = useState('1D');
  const punkte = useMemo(() => {
    const alle = (daten?.punkte ?? []).map((p) => ({ ...p, ms: Date.parse(p.t) })).sort((a, b) => a.ms - b.ms);
    const letzt = alle.at(-1)?.ms ?? 0;
    return alle.filter((p) => p.ms >= letzt - ZEIT_MS[zeit]);
  }, [daten, zeit]);
  const jetzt = punkte.at(-1);
  const spitze24 = Math.max(0, ...punkte.filter((p) => p.ms >= (jetzt?.ms ?? 0) - 864e5).map((p) => p.inMatch ?? p.online));
  if (status === 'laedt') return <Laedt farbe={TEAL} />;
  const max = Math.max(1, ...punkte.map((p) => p.online));
  const x = (i: number) => (punkte.length > 1 ? (i / (punkte.length - 1)) * 1000 : 0);
  const y = (v: number) => 300 - (v / max) * 280;
  const linie = (f: (p: Punkt) => number | undefined) => punkte.map((p, i) => (f(p) === undefined ? '' : `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(f(p)!).toFixed(1)}`)).join(' ');
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Live" titel="Player count" farbe={TEAL} text="How many people play Fortnite right now – and how it moved over time." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[['Online now', jetzt?.online, '#fde047'], ['In a match now', jetzt?.inMatch, '#86efac'], ['24-hour peak', spitze24 || undefined, '#c4b5fd'], ['All-time peak', daten?.allTimePeak?.wert, '#7dd3fc']].map(([k, v, f], i) => (
          <Glas key={k as string} className="p-5" verzoegerung={i * 0.05}>
            <p className="text-3xl font-black tabular-nums" style={{ color: f as string }}>{typeof v === 'number' ? v.toLocaleString('en') : '—'}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{k as string}</p>
          </Glas>
        ))}
      </div>
      <Glas className="p-5">
        <div className="flex items-center justify-between"><ZeitChips wert={zeit} setzen={setZeit} /><span className="text-xs text-white/35">{punkte.length ? `${punkte.length} data points` : ''}</span></div>
        {punkte.length > 1 ? (
          <svg viewBox="0 0 1000 300" className="mt-4 h-72 w-full" preserveAspectRatio="none">
            <defs><linearGradient id="sp-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#86efac" stopOpacity="0.35" /><stop offset="1" stopColor="#86efac" stopOpacity="0" /></linearGradient></defs>
            {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2="1000" y1={300 - g * 280} y2={300 - g * 280} stroke="rgba(255,255,255,0.06)" />)}
            {punkte.some((p) => p.inMatch !== undefined) && <path d={`${linie((p) => p.inMatch)} L1000 300 L0 300 Z`} fill="url(#sp-g)" />}
            <path d={linie((p) => p.inMatch)} fill="none" stroke="#86efac" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            <path d={linie((p) => p.online)} fill="none" stroke="#fde047" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : (
          <div className="mt-4 grid h-72 place-items-center rounded-2xl border border-dashed border-white/10 text-center text-sm text-white/45">
            <div className="max-w-lg px-6">
              <p className="font-bold text-white/70">No player-count history yet</p>
              <p className="mt-1">Epic doesn't publish an open player count. This needs our own collector on the server that asks Epic's discovery service every few minutes and stores the numbers – then the chart, the hourly table with peak / gain / average and the most played maps fill in automatically.</p>
            </div>
          </div>
        )}
      </Glas>
    </div>
  );
}

/* ---------------------------------------------- Creative */
interface Insel { code: string; name: string; creator?: string; players: number; rating?: number; image?: string; epic?: boolean; tags?: string[] }
export function Creative() {
  const { daten, status } = useHubDatei<{ stand?: string; inseln: Insel[] }>('creative.json');
  const [suche, setSuche] = useState(''); const [ohneEpic, setOhneEpic] = useState(false); const [tag, setTag] = useState('all');
  const tags = useMemo(() => [...new Set((daten?.inseln ?? []).flatMap((i) => i.tags ?? []))].slice(0, 12), [daten]);
  const liste = (daten?.inseln ?? []).filter((i) => (!ohneEpic || !i.epic) && (tag === 'all' || i.tags?.includes(tag)) && `${i.name} ${i.creator ?? ''} ${i.code}`.toLowerCase().includes(suche.toLowerCase()))
    .sort((a, b) => b.players - a.players);
  if (status === 'laedt') return <Laedt farbe={TEAL} />;
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Live" titel="Most played islands" farbe={TEAL} text="Creative and UEFN islands by live players – including the practice maps pros use (box fights, zone wars, aim trainers)." />
      {!daten ? (
        <DatenFehlen titel="Live island numbers need our own collector"
          text="Players per island come from Epic's discovery service, which needs a signed-in server and regular polling. Once that collector writes hub-daten/creative.json, this grid shows every island with live players, rating, tags and a 'hide Epic maps' switch."
          braucht={['Island code', 'Name + creator', 'Players now', 'Rating', 'Tags', 'Thumbnail']} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search islands, creators, codes…" className="w-72 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-teal-300/60 focus:outline-none" />
            {['all', ...tags].map((t) => <button key={t} type="button" onClick={() => setTag(t)} className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${tag === t ? 'border-teal-300/50 bg-teal-300/15 text-white' : 'border-white/10 text-white/55'}`}>{t}</button>)}
            <label className="ml-auto flex items-center gap-2 text-sm text-white/60"><input type="checkbox" checked={ohneEpic} onChange={(e) => setOhneEpic(e.target.checked)} /> Hide Epic maps</label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6">
            {liste.map((i, k) => (
              <motion.a key={i.code} href={`https://www.fortnite.com/@${i.creator ?? 'epic'}/${i.code}`} target="_blank" rel="noreferrer" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(k * 0.02, 0.4) }} whileHover={{ y: -4 }}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
                <div className="relative aspect-video bg-white/5">{i.image && <img src={i.image} alt="" loading="lazy" className="h-full w-full object-cover" />}
                  <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-bold text-white">{i.players.toLocaleString('en')} playing</span>
                  {i.rating !== undefined && <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-bold text-teal-200">{Math.round(i.rating)} %</span>}</div>
                <div className="p-3"><p className="truncate font-bold text-white">{i.name}</p><p className="truncate text-xs text-white/45">{i.creator ?? 'Epic'} · {i.code}</p></div>
              </motion.a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------- News */
interface Motd { id: string; title: string; tabTitle?: string; body: string; image?: string; tileImage?: string; hidden?: boolean }
const REAKTIONEN = ['🔥', '😍', '😐', '🤢', '💩'];
export function News() {
  const [liste, setListe] = useState<Motd[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [meine, setMeine] = useState<Record<string, string>>(() => { try { return JSON.parse(localStorage.getItem('hub-news-reaktion') ?? '{}'); } catch { return {}; } });
  useEffect(() => {
    fetch('https://fortnite-api.com/v2/news/br').then((r) => r.json()).then((j) => setListe(((j?.data?.motds ?? []) as Motd[]).filter((m) => !m.hidden))).catch(() => setFehler(true));
  }, []);
  function reagieren(id: string, r: string) {
    const neu = { ...meine, [id]: meine[id] === r ? '' : r }; setMeine(neu);
    try { localStorage.setItem('hub-news-reaktion', JSON.stringify(neu)); } catch { /* egal */ }
  }
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Live" titel="News" farbe={TEAL} text="What's on the in-game news board right now." />
      {fehler && <Glas className="p-6 text-sm text-white/60">The news feed isn't answering right now.</Glas>}
      {!liste && !fehler && <Laedt farbe={TEAL} />}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {(liste ?? []).map((m, i) => (
          <Glas key={m.id} className="overflow-hidden" verzoegerung={Math.min(i * 0.05, 0.4)}>
            {(m.image || m.tileImage) && <div className="aspect-video bg-white/5"><img src={m.image || m.tileImage} alt="" loading="lazy" className="h-full w-full object-cover" /></div>}
            <div className="p-5">
              <h3 className="text-lg font-extrabold tracking-tight text-white">{m.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/60">{m.body}</p>
              <div className="mt-4 flex gap-1.5">
                {REAKTIONEN.map((r) => <button key={r} type="button" onClick={() => reagieren(m.id, r)} className={`rounded-lg px-2 py-1 text-base transition ${meine[m.id] === r ? 'bg-teal-300/20 ring-1 ring-teal-300/50' : 'bg-white/[0.04] hover:bg-white/10'}`}>{r}</button>)}
              </div>
            </div>
          </Glas>
        ))}
      </div>
      <p className="text-xs text-white/35">Source: Epic's in-game news via fortnite-api.com. Reactions are saved on this device only – shared counts need a backend.</p>
    </div>
  );
}

/* ---------------------------------------------- Tournaments (Teaser) */
interface Fenster { status: string; begin: number; end: number; name: string; eventId: string; windowId: string }
const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'OCE', 'ME'];
const eventName = (id: string) => id.replace(/^epicgames_/, '').replace(/^S\d+_/, '').replace(/_(EU|NAC|NAW|BR|ASIA|OCE|ME)$/, '').replace(/_ZB/, ' Zero Build').replace(/_/g, ' ')
  .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/Cup(Solo|Duos|Trios|Squads)/, 'Cup $1').replace(/ +/g, ' ').trim();
export function Turniere() {
  const [region, setRegion] = useState('EU');
  const [liste, setListe] = useState<Fenster[] | null>(null);
  const [modus, setModus] = useState('br'); const [bauen, setBauen] = useState<'build' | 'zb'>('build');
  const jetzt = useJetzt(30_000);
  useEffect(() => { setListe(null); fetch(`/api/cup-events?region=${region}`).then((r) => r.json()).then((j) => setListe(j?.windows ?? [])).catch(() => setListe([])); }, [region]);
  const kommend = (liste ?? []).filter((w) => w.end > jetzt && (modus === 'reload' ? /reload/i.test(w.eventId) : modus === 'br' ? !/reload|blitz|og/i.test(w.eventId) : new RegExp(modus, 'i').test(w.eventId))
    && (bauen === 'zb' ? /_ZB/i.test(w.eventId) : !/_ZB/i.test(w.eventId))).sort((a, b) => a.begin - b.begin).slice(0, 12);
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Compete" titel="Tournaments" farbe={TEAL} text="The next cups at a glance. Full leaderboards, prizes and scoring live in Competitive."
        rechts={<Link to="/competitive/events" className="rounded-xl bg-teal-300 px-4 py-2 text-sm font-bold text-[#06080f] hover:bg-teal-200">All events & results →</Link>} />
      <div className="flex flex-wrap items-center gap-3">
        <ModusUmschalter modus={modus} setzen={setModus} bauen={bauen} setBauen={setBauen} verfuegbar={['br', 'reload', 'blitz', 'og']} />
        <div className="ml-auto inline-flex rounded-xl border border-white/10 bg-black/30 p-0.5 text-xs font-bold">
          {REGIONEN.map((r) => <button key={r} type="button" onClick={() => setRegion(r)} className={`rounded-lg px-2.5 py-1 ${region === r ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white'}`}>{r}</button>)}
        </div>
      </div>
      {!liste ? <Laedt farbe={TEAL} /> : !kommend.length ? <Glas className="p-6 text-sm text-white/55">No upcoming tournaments here match the filters.</Glas> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {kommend.map((w, i) => {
            const live = w.begin <= jetzt;
            return (
              <Glas key={w.windowId} className="p-5" verzoegerung={Math.min(i * 0.04, 0.4)}>
                <div className="flex items-start justify-between gap-3">
                  <div><h3 className="font-extrabold text-white">{eventName(w.eventId)}</h3><p className="text-xs text-white/45">{region} · {new Date(w.begin).toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}</p></div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${live ? 'bg-rose-500/20 text-rose-200' : 'bg-teal-300/15 text-teal-200'}`}>{live ? 'LIVE' : `in ${restText(w.begin - jetzt)}`}</span>
                </div>
                <div className="mt-4 flex gap-2">
                  <KalenderKnopf titel={eventName(w.eventId)} start={w.begin} ende={w.end} text="Calendar" />
                  <Link to={`/competitive/events/${encodeURIComponent(w.eventId)}?region=${region}&fenster=${encodeURIComponent(w.windowId)}`} className="rounded-xl border border-white/10 px-3 py-1.5 text-sm font-semibold text-white/70 hover:text-white">Open →</Link>
                </div>
              </Glas>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------- Stats */
type Verzeichnis = Record<string, { namen: string[]; haupt: string; schluessel: string }>;
export function Stats() {
  const [q, setQ] = useState('');
  const [verz, setVerz] = useState<Verzeichnis | null>(null);
  const [zuletzt, setZuletzt] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('hub-stats-zuletzt') ?? '[]'); } catch { return []; } });
  useEffect(() => { fetch('/api/spieler-namen').then((r) => r.json()).then((j) => setVerz(j?.verzeichnis ?? {})).catch(() => setVerz({})); }, []);
  const s = q.toLowerCase().replace(/[^a-z0-9]/g, '');
  const treffer = useMemo(() => (!verz || s.length < 2 ? [] : Object.entries(verz).filter(([, v]) => v.schluessel.includes(s) || v.namen.some((n) => n.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => Number(b[1].schluessel.startsWith(s)) - Number(a[1].schluessel.startsWith(s)) || a[1].haupt.length - b[1].haupt.length).slice(0, 20)), [verz, s, q]);
  function merken(n: string) { const neu = [n, ...zuletzt.filter((x) => x !== n)].slice(0, 6); setZuletzt(neu); try { localStorage.setItem('hub-stats-zuletzt', JSON.stringify(neu)); } catch { /* egal */ } }
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Compete" titel="Player stats" farbe={TEAL} text="Find any player who has played a tournament – their full competitive profile: cups, placements, earnings, form." />
      <Glas className="p-6">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Epic name…" autoFocus className="w-full rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-xl font-bold text-white placeholder:text-white/25 focus:border-teal-300/60 focus:outline-none" />
        {zuletzt.length > 0 && !q && <div className="mt-3 flex flex-wrap gap-1.5"><span className="text-xs text-white/40">Recent:</span>{zuletzt.map((n) => <button key={n} type="button" onClick={() => setQ(n)} className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs font-semibold text-white/70 hover:text-white">{n}</button>)}</div>}
        {!verz && <Laedt farbe={TEAL} text="Loading the player directory …" />}
        {verz && <p className="mt-2 text-xs text-white/35">{Object.keys(verz).length.toLocaleString('en')} tournament players in the directory.</p>}
        <ul className="mt-3 divide-y divide-white/5">
          {treffer.map(([id, v]) => (
            <li key={id}><Link to={`/competitive/player/${id}`} onClick={() => merken(v.haupt)} className="flex items-baseline justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-white/5">
              <span className="font-bold text-white">{v.haupt}</span><span className="truncate text-xs text-white/40">{v.namen.filter((n) => n !== v.haupt).slice(0, 3).join(' · ')}</span>
            </Link></li>
          ))}
        </ul>
      </Glas>
      <DatenFehlen titel="Casual stats (wins, kills, level per mode)"
        text="General match stats for every player come from a stats provider. The site's tracker.gg connection currently has no valid key, so we show the competitive profile – which no casual tracker has. Leaderboards for level / wins / kills follow once a stats source is connected."
        braucht={['Stats provider key on the server', 'Per mode: wins, kills, K/D, matches', 'Leaderboards']} />
    </div>
  );
}

/* ---------------------------------------------- Notifications */
const ARTEN = [
  { k: 'turnier', t: 'Tournament starts', x: '15 minutes before a cup you follow' }, { k: 'rotation', t: 'Map rotation', x: 'When a map you like goes live' },
  { k: 'saison', t: 'Season end & live events', x: 'A day and an hour before' }, { k: 'waffen', t: 'Weapon changes', x: 'When a patch changes the loot pool' },
  { k: 'karte', t: 'New map version', x: 'When the island changes' }, { k: 'news', t: 'News', x: 'New in-game news' },
];
export function Benachrichtigungen() {
  const [erlaubt, setErlaubt] = useState<string>(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));
  const [an, setAn] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem('hub-benachrichtigungen') ?? '{}'); } catch { return {}; } });
  function setzen(k: string) { const neu = { ...an, [k]: !an[k] }; setAn(neu); try { localStorage.setItem('hub-benachrichtigungen', JSON.stringify(neu)); } catch { /* egal */ } }
  async function anschalten() {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission(); setErlaubt(p);
    if (p === 'granted') new Notification('CompHub', { body: 'Notifications are on. You will get the alerts you pick here.' });
  }
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community" titel="Notifications" farbe={TEAL} text="Pick what you want to hear about – tournaments, rotations, season end, weapon changes." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Glas className="p-6">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div><p className="font-bold text-white">Browser notifications</p><p className="text-xs text-white/45">{erlaubt === 'granted' ? 'Allowed on this device' : erlaubt === 'denied' ? 'Blocked – allow them in your browser settings' : erlaubt === 'unsupported' ? 'This browser has no notifications' : 'Not turned on yet'}</p></div>
            <button type="button" disabled={erlaubt === 'granted' || erlaubt === 'unsupported'} onClick={anschalten} className="rounded-xl bg-teal-300 px-4 py-2 text-sm font-bold text-[#06080f] disabled:opacity-40">{erlaubt === 'granted' ? 'On ✓' : 'Turn on'}</button>
          </div>
          <ul className="mt-4 space-y-1.5">
            {ARTEN.map((a) => (
              <li key={a.k}><button type="button" onClick={() => setzen(a.k)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/5">
                <span className="flex-1"><span className="block text-sm font-semibold text-white">{a.t}</span><span className="text-xs text-white/45">{a.x}</span></span>
                <span className={`relative h-5 w-9 rounded-full transition ${an[a.k] ? 'bg-teal-400/80' : 'bg-white/10'}`}><motion.span layout className={`absolute top-0.5 h-4 w-4 rounded-full bg-white ${an[a.k] ? 'right-0.5' : 'left-0.5'}`} /></span>
              </button></li>
            ))}
          </ul>
        </Glas>
        <Glas className="p-6" verzoegerung={0.08}>
          <h3 className="font-bold text-white">What still needs a backend</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/55">Your choices are saved on this device. To actually send alerts while the page is closed, the site needs Web Push: a service worker on thecomphub.com, VAPID keys, a store for each device's push subscription with its chosen topics, and a job that fires when a cup starts, the rotation changes, a patch lands or the season ends.</p>
        </Glas>
      </div>
    </div>
  );
}
