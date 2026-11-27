import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Glas } from '../../teile/Glas';
import { DatenFehlen, KalenderKnopf, ModusUmschalter, restText, useHubDatei, useJetzt, ZeitChips } from './Bausteine';
import { Laedt, TEAL, Ueberschrift } from './Teile';

/*
 * Live-Seiten: Player Count, Creative, News, Tournaments (Teaser in /competitive/events), Stats (Spielersuche), Notifications.
 *   - Player Count / Creative: jetzt in epic/Live.tsx (Epics offizielle Fortnite Data API ueber den Proxy /epic-daten).
 *   - News: fortnite-api.com/v2/news/br (erlaubt Abfragen aus dem Browser).
 *   - Tournaments: /api/cup-events?region=.. wie die Events-Seite, nur kommende Spieltage als Teaser.
 *   - Stats: Spielersuche ueber /api/spieler-namen (Verzeichnis der Seite) -> Spielerseite im Competitive-Bereich; /api/stats (tracker.gg) nur,
 *     wenn die Seite den Schluessel hat.
 */

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
      <p className="text-xs text-white/35">Source: Epic's in-game news via fortnite-api.com. Reactions are saved on this device.</p>
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
          <h3 className="font-bold text-white">Good to know</h3>
          <p className="mt-2 text-sm leading-relaxed text-white/55">Your picks are saved on this device. Alerts go out once CompHub's push service is switched on — until then this page remembers what you want to hear about, so nothing is lost.</p>
        </Glas>
      </div>
    </div>
  );
}
