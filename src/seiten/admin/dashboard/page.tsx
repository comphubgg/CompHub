import { motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Glas } from '../../../teile/Glas';
import MeinArchiv from '../../streamer/ov/MeinArchiv';
import { WerkzeugKopf, knopfLeise } from '../teile';

/*
 * Die drei Dashboard-Bereiche der Seite im Hub (main: app/admin/page.tsx mit Ebenen.tsx und Seitenleiste.tsx):
 *  - VIP-Werkzeuge (?bereich=vip): grosse Karten - Overlays, Globals, POV, Pro-POVs, Match-ID-Finder, Twitch-Statistik, Twitch-Bot
 *  - Schnellzugriff (?bereich=schnell): alles als kleine Knoepfe
 *  - Site-Dashboard (Start): Kopf mit Profil (/api/profile), "Nur im Dashboard", "Fuer alle", Mein Archiv (dasselbe wie unter Streamer -> VIP) und der
 *    Twitch-Chat des eigenen Kanals; Konto, Admin-Tools und Statistik sind im Hub eigene Seiten und hier verlinkt.
 * Die Ziele sind die Seiten des Hubs (nicht thecomphub.com). Der Admin sieht jedes VIP-Werkzeug (main: frei = admin || Recht).
 */

interface Ziel { zu: string; titel: string; text: string; symbol: string }

const SYMBOL: Record<string, ReactNode> = {
  streams: <><rect x="3" y="5" width="11" height="8" rx="1.5" /><rect x="10" y="11" width="11" height="8" rx="1.5" /></>,
  rangliste: <><path d="M5 20V10M12 20V4M19 20v-7" /></>,
  events: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  statistik: <><path d="M4 19V5M4 19h16" /><path d="M8 15l3-4 3 2 4-6" /></>,
  tierlist: <><path d="M4 6h10M4 12h14M4 18h8" /></>,
  karte: <><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  solos: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1-4 4-6 7-6s6 2 7 6" /></>,
  prognose: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
  overlay: <><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 20h8M12 17v3" /></>,
  globals: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  pov: <><circle cx="12" cy="12" r="3" /><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4z" /></>,
  kontakt: <><path d="M4 6h16v12H4z" /><path d="M4 7l8 6 8-6" /></>,
  profil: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></>,
  schloss: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>,
};
const Zeichen = ({ name, groesse = 18 }: { name: string; groesse?: number }) => (
  <svg width={groesse} height={groesse} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{SYMBOL[name]}</svg>
);

const FUER_ALLE: Ziel[] = [
  { zu: '/streamer/streams', titel: 'Streams', text: 'Several streams side by side, in your own folders', symbol: 'streams' },
  { zu: '/competitive/rankings', titel: 'Rankings', text: "Epic's worldwide leaderboard", symbol: 'rangliste' },
  { zu: '/competitive/events', titel: 'Events', text: 'Cups and leaderboards', symbol: 'events' },
  { zu: '/competitive/statistics', titel: 'Statistics', text: 'Players, match days, key figures', symbol: 'statistik' },
  { zu: '/competitive/tierlist', titel: 'Tierlist', text: 'Rank players and trios', symbol: 'tierlist' },
  { zu: '/competitive/maps', titel: 'Maps', text: 'Where the teams landed — every cup', symbol: 'karte' },
  { zu: '/competitive/fncs', titel: 'FNCS', text: 'Every final and the eliminations of the Grand Finals', symbol: 'events' },
  { zu: '/competitive/predictions', titel: 'Predictions', text: 'Bet on the outcome', symbol: 'prognose' },
];
const NUR_HIER: Ziel[] = [
  { zu: '/competitive/globals-solos', titel: 'FNCS Solos', text: 'All regions: qualified, heats, last chance, final and the map of every match day', symbol: 'solos' },
  { zu: '/competitive/replays', titel: 'Replays', text: 'Every game to play back – all cups or only your own', symbol: 'karte' },
  { zu: '/competitive/deep-stats', titel: 'Deep Stats', text: 'Damage per weapon, hits, third parties, landing and death spots per match day', symbol: 'statistik' },
  { zu: '/messages', titel: 'Contact', text: 'Reach the operator via Discord or email', symbol: 'kontakt' },
  { zu: '/admin/epic-friends', titel: 'All Epic friends', text: 'All friends of both CompHub Epic accounts – live, match ID and history', symbol: 'events' },
];
const VIP_ZIELE: Ziel[] = [
  { zu: '/streamer/overlays', titel: 'Overlays', text: 'Overlays for your stream — from the same tournament data', symbol: 'overlay' },
  { zu: '/competitive/globals', titel: 'Globals 2026', text: 'Overlays, teams, map and prediction for the Global Championship', symbol: 'globals' },
  { zu: '/competitive/pov', titel: 'POV', text: 'Send your view live to the approved viewers', symbol: 'pov' },
  { zu: '/competitive/pov?ansicht=vip', titel: 'Pro POVs', text: 'Sign pros up, watch their POV, live alerts on your Discord', symbol: 'pov' },
  { zu: '/competitive/match-finder', titel: 'Match-ID finder', text: 'Which match your favourites are in right now – to spectate in game', symbol: 'events' },
  { zu: '/streamer/twitch-stats', titel: 'Twitch statistics', text: 'Your streams: peak with and without raid, new followers, chatters', symbol: 'statistik' },
  { zu: '/streamer/twitch-bot', titel: 'Twitch bot', text: 'Commands and rules for your chat – like Fossabot, around the clock', symbol: 'chat' },
];

function Abschnitt({ ton, titel, marke, text }: { ton: 'vip' | 'hier' | 'alle'; titel: string; marke: string; text: string }) {
  const farbe = ton === 'vip' ? 'text-amber-300' : ton === 'hier' ? 'text-white' : 'text-akz';
  const pille = ton === 'vip' ? 'border-amber-400/40 bg-amber-400/10 text-amber-300' : ton === 'hier' ? 'border-white/20 bg-white/[0.06] text-white/70' : 'border-akz/30 bg-akz/10 text-akz';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <h2 className={`text-sm font-extrabold uppercase tracking-[0.18em] ${farbe}`}>{titel}</h2>
      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${pille}`}>{marke}</span>
      <span aria-hidden className="hidden h-px min-w-[2rem] flex-1 bg-white/[0.08] sm:block" />
      <p className="w-full text-xs text-white/45 sm:w-auto">{text}</p>
    </div>
  );
}

const rein = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: Math.min(i, 30) * 0.04, duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } });

function VipKarten() {
  return (
    <section>
      <Abschnitt ton="vip" titel="VIP" marke="VIP only" text="Visible only for VIPs — the overlays, the Globals and the tools unlocked per VIP." />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {VIP_ZIELE.map((z, i) => (
          <motion.div key={z.zu} {...rein(i)} whileHover={{ y: -3 }}>
            <Link to={z.zu} className="group relative flex min-h-[150px] flex-col overflow-hidden rounded-3xl border border-amber-400/25 bg-white/[0.035] p-5 backdrop-blur-xl transition hover:border-amber-300/60">
              <span aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-amber-400/10 blur-2xl transition group-hover:bg-amber-400/20" />
              <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400 text-[#06080f]"><Zeichen name={z.symbol} groesse={19} /></span>
              <h3 className="relative mt-3 text-lg font-extrabold tracking-tight text-white">{z.titel}</h3>
              <p className="relative mt-0.5 max-w-[36ch] text-[13px] leading-snug text-white/55">{z.text}</p>
              <span className="relative mt-auto pt-3 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-300">Open →</span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function NurHier() {
  return (
    <section>
      <Abschnitt ton="hier" titel="Only in the dashboard" marke="Only here" text="Not linked anywhere else." />
      <div className="mt-4 grid gap-2.5 lg:grid-cols-3">
        {NUR_HIER.map((z, i) => (
          <motion.div key={z.zu} {...rein(i)}>
            <Link to={z.zu} className="group flex h-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3.5 backdrop-blur-xl transition hover:border-akz/50 hover:bg-white/[0.06]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.07] text-white/80 transition group-hover:bg-akz/15 group-hover:text-akz"><Zeichen name={z.symbol} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-white">{z.titel}</span>
                <span className="mt-0.5 block text-xs leading-snug text-white/50">{z.text}</span>
              </span>
              <span aria-hidden className="text-white/30 transition group-hover:translate-x-0.5 group-hover:text-akz">→</span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function FuerAlle() {
  return (
    <section>
      <Abschnitt ton="alle" titel="For everyone" marke="Open to all" text="Also in the navigation, without an account." />
      <div className="mt-4 flex flex-wrap gap-2">
        {FUER_ALLE.map((z, i) => (
          <motion.div key={z.zu} {...rein(i)}>
            <Link to={z.zu} title={z.text} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] py-2 pl-3 pr-4 text-sm font-semibold text-white/80 backdrop-blur-xl transition hover:border-akz/50 hover:text-akz">
              <span className="text-akz"><Zeichen name={z.symbol} groesse={16} /></span>{z.titel}
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/** VIP-Werkzeuge (main: /admin?bereich=vip). */
export function VipWerkzeuge({ klassisch }: { klassisch?: () => void }) {
  return (
    <>
      <WerkzeugKopf ueber="Site dashboard" titel="VIP tools" text="What a VIP gets in the dashboard: overlays, Globals, POV, Match-ID finder, Twitch bot and statistics – all as hub pages." klassisch={klassisch} />
      <VipKarten />
    </>
  );
}

/** Schnellzugriff (main: /admin?bereich=schnell) - jede Seite mit einem Klick. */
export function Schnellzugriff({ klassisch }: { klassisch?: () => void }) {
  const alle = [...VIP_ZIELE, ...NUR_HIER, ...FUER_ALLE];
  return (
    <>
      <WerkzeugKopf ueber="Site dashboard" titel="Quick access" text="Everything you can open from the dashboard – without a detour." klassisch={klassisch} />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
        {alle.map((z, i) => {
          const vip = VIP_ZIELE.includes(z);
          return (
            <motion.div key={z.zu + z.titel} {...rein(i)} whileHover={{ y: -3 }}>
              <Link to={z.zu} title={z.text} className="group flex h-full flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-4 text-center backdrop-blur-xl transition hover:border-akz/50 hover:bg-white/[0.06]">
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${vip ? 'bg-amber-400 text-[#06080f]' : 'bg-white/[0.07] text-white/80 group-hover:text-akz'}`}><Zeichen name={z.symbol} groesse={19} /></span>
                <span className="text-[13px] font-semibold leading-tight text-white">{z.titel}</span>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </>
  );
}

interface Profil { displayName: string; avatarUrl: string | null; twitchChatEnabled: boolean; socials: { twitch: string }; email?: string }

/** Das Site-Dashboard (main: /admin, Bereich "Uebersicht"). */
export function SiteDashboard({ klassisch }: { klassisch?: () => void }) {
  const [profil, setProfil] = useState<Profil | null>(null);
  const [status, setStatus] = useState('');
  const [chatFehler, setChatFehler] = useState('');
  useEffect(() => {
    fetch('/api/profile', { cache: 'no-store' }).then(async (r) => {
      if (!r.ok) throw new Error();
      const j = await r.json();
      setProfil(j.profile ?? { displayName: '', avatarUrl: null, twitchChatEnabled: true, socials: { twitch: '' } }); setStatus(j.accountStatus ?? '');
    }).catch(() => setProfil({ displayName: '', avatarUrl: null, twitchChatEnabled: true, socials: { twitch: '' } }));
  }, []);
  const twitch = profil?.socials?.twitch?.trim() ?? '';
  // Chat an/aus - schreibt das Profil wie auf main (POST /api/profile), nur auf Knopfdruck.
  const chatUmschalten = async () => {
    if (!profil) return;
    const neu = { ...profil, twitchChatEnabled: !profil.twitchChatEnabled };
    setProfil(neu); setChatFehler('');
    try {
      const r = await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: neu }) });
      if (!r.ok) throw new Error();
    } catch { setProfil(profil); setChatFehler('Not saved.'); }
  };
  const wege: Array<[string, string, string]> = [
    ['/streamer/vip', 'VIP & access key', 'Your stage, expiry and a new key'],
    ['/account', 'Account', 'Profile, picture, Twitch channel, email, password'],
    ['/admin', 'Admin tools', 'Every admin tool of the site'],
    ['/admin/status', 'Admin statistics', 'Jobs, load times, visitors and usage'],
  ];
  return (
    <>
      <WerkzeugKopf ueber="Site dashboard" titel="Dashboard" text="The classic dashboard of thecomphub.com: only-here tools, your archive and your Twitch chat." klassisch={klassisch} />
      <Glas className="relative mb-6 overflow-hidden px-6 py-6">
        <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-akz/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-black/40 text-2xl font-extrabold uppercase text-white/70">
            {profil?.avatarUrl ? <img src={profil.avatarUrl} alt="" className="h-full w-full object-cover" /> : (profil?.displayName || '?').trim().charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-akz">Dashboard</p>
            <h2 className="truncate text-3xl font-extrabold tracking-tight text-white">{profil ? (profil.displayName || 'No name') : 'Loading …'}</h2>
            <span className="mt-1.5 inline-block rounded-full border border-akz/30 bg-akz/10 px-2.5 py-0.5 text-xs font-semibold text-akz">Admin{status && status !== 'Admin' ? ` · ${status}` : ''}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {wege.map(([zu, t, x]) => <Link key={zu} to={zu} title={x} className={knopfLeise}>{t}</Link>)}
          </div>
        </div>
      </Glas>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-9">
          <NurHier />
          <FuerAlle />
          <div><MeinArchiv /></div>
        </div>
        <Glas className="h-fit overflow-hidden">
          <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <h2 className="truncate text-sm font-bold text-white">{twitch ? `Chat · ${twitch}` : 'Twitch chat'}</h2>
            {twitch && (
              <button type="button" onClick={() => void chatUmschalten()} aria-pressed={profil?.twitchChatEnabled}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${profil?.twitchChatEnabled ? 'bg-akz/15 text-akz' : 'border border-white/10 text-white/45'}`}>
                {profil?.twitchChatEnabled ? 'On' : 'Off'}
              </button>
            )}
          </header>
          {chatFehler && <p className="px-4 pt-2 text-xs text-amber-200">{chatFehler}</p>}
          {!profil ? <p className="p-8 text-center text-sm text-white/45">Loading chat …</p>
            : !twitch ? <p className="p-8 text-center text-sm text-white/45">Add your Twitch channel under <Link to="/account" className="text-akz">Account</Link>, then the chat shows up here.</p>
              : !profil.twitchChatEnabled ? <p className="p-8 text-center text-sm text-white/45">Chat is off.</p>
                : <iframe title={`Twitch chat ${twitch}`} src={`https://www.twitch.tv/embed/${encodeURIComponent(twitch)}/chat?parent=${window.location.hostname}&darkpopout`} className="h-[320px] w-full bg-black sm:h-[560px] xl:h-[calc(100vh-260px)]" />}
        </Glas>
      </div>
    </>
  );
}
