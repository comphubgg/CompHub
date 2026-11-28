import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Flaeche, Marke, Segment } from '../../../../ds/Bausteine';
import { useWer } from '../../../../teile/Anmeldung';
import { istVip } from '../../../streamer/zugang';
import PovVideo from '../../../streamer/mv/PovVideo';
import { AnmeldeKarte } from '../../tools/Gemeinsam';
import { FehlerZeile, Laedt, SEITE } from '../teile';
import { QUALITAET, abonniere, abonniereMikro, holeAktiv, mikroStand, mitMikrofon, setzeMikroStumm, startSenden, testbildStrom, type Qualitaet, type Zustand } from './sender';

/*
 * POV im Hub (wie /pov, /pov/einladung und /pov-ansicht der Seite):
 *  - Pro (und Admin): das Pro-Dashboard - Bild teilen und live gehen (Sender/fMP4 von der Seite uebernommen), Testbild, Mikrofon mit Stummschalten,
 *    Qualitaet, wer zusehen darf (VIPs einzeln oder fuer alle), Zugangsdaten, Discord (Beitritt, News, Konto, Server-Ankuendigungen), Profilbild,
 *    Windows-Programm und Installationsbefehl.
 *  - VIP (mit Recht "propov"; Admin mit ?ansicht=vip): eigener Bereich - so funktioniert es, deine Pros, Pros per Link einladen, Bot auf den eigenen Discord.
 *  - /competitive/pov/invite?code=: die Einladung eines VIPs annehmen.
 *  - /competitive/pov/view?pro=: das POV als Vollbild (fuer OBS), mit Namensschild und Stats-Banner aus der Adresse.
 * Aufbau (Design-System 3.0, 27.11.2026): das Pro-Dashboard ist ein Sendepult - Kopfband mit Foto, Name und Stand; links der Monitor (Vorschau
 * oder der grosse Knopf zum Live-Gehen) mit Zuschauern, Bitrate, Ton und Mikrofon darunter und der Qualitaet als drei Kacheln; rechts angedockt,
 * wer zusehen darf; darunter das Konto und "so funktioniert es" als Schrittleiste. Die Einstellungen stehen als drei Tafeln nebeneinander.
 * Kein Buchstaben-Ersatzbild: ohne Foto steht dort nichts.
 */

const karte = 'p-5';
/** Die Seite antwortet teils auf Deutsch - im Hub steht Englisch. */
const r403 = (e?: string) => (!e ? 'Not available' : /profi|nur f/i.test(e) ? 'Only pros with an unlocked account can open this dashboard.' : /[äöüß]|nicht/i.test(e) ? 'This is not available right now.' : e);
const knopfRand = 'rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/70 transition hover:border-akz/50 hover:text-white';
const h2 = (t: ReactNode, rechts?: ReactNode) => <div className="flex items-center gap-3"><span className="h-4 w-1 shrink-0 rounded-full bg-akz" /><h2 className="titel text-xl">{t}</h2>{rechts && <span className="ml-auto">{rechts}</span>}</div>;

/** Kopfband: Hochkant-Foto (wenn es eines gibt), Zeile darueber, Name mit Marke, rechts Aktionen. */
function Kopf({ ueber, name, marke, bild, rechts, kind }: { ueber: string; name: string; marke: ReactNode; bild?: string | null; rechts?: ReactNode; kind?: ReactNode }) {
  return (
    <header className="fl-fest flex flex-wrap items-center gap-x-5 gap-y-3 p-3 pr-5">
      {bild && <img src={bild} alt="" className="h-24 w-[72px] shrink-0 rounded-2xl object-cover object-top" />}
      <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="min-w-0 flex-1 basis-[280px] py-1">
        <p className="ueber">{ueber}</p>
        <h1 className="titel mt-1 flex flex-wrap items-center gap-3 text-5xl"><span className="truncate">{name}</span>{marke}</h1>
        {kind}
      </motion.div>
      {rechts && <div className="flex flex-wrap items-center justify-end gap-2">{rechts}</div>}
    </header>
  );
}
/** Nummerierte Schritte nebeneinander (auf dem Handy untereinander). */
function Schritte({ liste, spalten }: { liste: Array<[string, string]>; spalten: string }) {
  return (
    <ol className={`grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-white/[0.06] sm:grid-cols-2 ${spalten}`}>
      {liste.map(([t, text], i) => (
        <li key={t} className="flex gap-3 bg-fl p-4">
          <span className="titel text-4xl !text-akz">{i + 1}</span>
          <span className="min-w-0"><span className="block text-sm font-bold text-white">{t}</span><span className="mt-1 block text-xs leading-relaxed text-white/50">{text}</span></span>
        </li>
      ))}
    </ol>
  );
}

/* ================================================================ Pro-Dashboard */

interface PovPro { ident: string; name: string; bild: string | null; qualitaet: Qualitaet; erlaubt: string[]; fuerAlle?: boolean; gilden: string[]; discordId?: string }
interface Vip { ident: string; name: string; auch: string[] }
const QUALITAETEN: Array<{ wert: Qualitaet; titel: string; text: string }> = [
  { wert: 'max', titel: 'Max', text: '1080p60 · 8000 kbit/s · best picture, a little more delay' },
  { wert: 'mittel', titel: 'Medium', text: '720p60 · 4500 kbit/s · good middle ground' },
  { wert: 'niedrig', titel: 'Low', text: '720p30 · 2500 kbit/s · as little delay as possible' },
];

function ProDashboard() {
  const [tab, setTab] = useState<'pov' | 'settings'>('pov');
  const [mein, setMein] = useState<PovPro | null>(null);
  const [zugang, setZugang] = useState<{ chef: string; login: string; passwort: string; link?: string } | null>(null);
  const [pwSicht, setPwSicht] = useState(false);
  const [kopiert, setKopiert] = useState('');
  const [discordMeldung, setDiscordMeldung] = useState('');
  const [bildEigen, setBildEigen] = useState(false);
  const [vips, setVips] = useState<Vip[]>([]);
  const [fehler, setFehler] = useState('');
  const [stand, setStand] = useState<'' | 'speichert' | 'gespeichert'>('');
  const [suche, setSuche] = useState('');
  const [teilen, setTeilen] = useState<Zustand | null>(() => holeAktiv()?.zustand ?? null);
  const [zuschauer, setZuschauer] = useState(0);
  const vorschau = useRef<HTMLVideoElement | null>(null);
  const [gilden, setGilden] = useState<{ einladung: string | null; liste: Array<{ id: string; name: string; kanal: boolean; fehler: string }> } | null>(null);
  const [gildenFehler, setGildenFehler] = useState('');
  const [discord, setDiscord] = useState<{ id: string; name: string; auto: boolean; stand: { imKanal: boolean; streamt: boolean; kanalName: string | null; gildenName?: string | null } | null } | null>(null);
  const [dSuche, setDSuche] = useState('');
  const [dTreffer, setDTreffer] = useState<Array<{ id: string; name: string; anzeige: string }>>([]);
  const uhr = useRef<number | null>(null);
  const offen = useRef<Record<string, unknown>>({});
  const [mitMikro, setMitMikro] = useState(() => { try { return localStorage.getItem('comphub_pov_mikro') === '1'; } catch { return false; } });
  const [mikro, setMikro] = useState(mikroStand);
  const [adresse] = useSearchParams();

  useEffect(() => abonniereMikro(setMikro), []);
  useEffect(() => { fetch('/api/pov/zugang', { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (j?.zugang) setZugang(j.zugang); }).catch(() => {}); }, []);
  useEffect(() => {
    const d = adresse.get('discord');
    if (d === 'ok') setDiscordMeldung('You are in the CompHub Discord now — your channel with the access data is under Pro Access Keys.');
    else if (d === 'fehler') setDiscordMeldung('Joining Discord did not work. Please try again.');
  }, [adresse]);
  useEffect(() => {
    let weg = false;
    fetch('/api/pov?modus=mein', { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      if (weg) return;
      if (!j.ok) { setFehler(r403(j.error)); return; }
      setMein(j.mein); setBildEigen(Boolean(j.bildEigen)); setDiscord(j.discord ?? null); setVips(j.vips ?? []); setZuschauer(j.zuschauer ?? 0);
    }).catch(() => { if (!weg) setFehler('Not available'); });
    const i = window.setInterval(() => { fetch('/api/pov?modus=mein', { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (j?.ok) setDiscord(j.discord ?? null); }).catch(() => {}); }, 15_000);
    return () => { weg = true; window.clearInterval(i); };
  }, []);
  const gildenLaden = useCallback(() => {
    fetch('/api/pov/discord?aktion=gilden', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { if (j?.ok) { setGilden({ einladung: j.einladung ?? null, liste: j.gilden ?? [] }); setGildenFehler(''); } else setGildenFehler(j?.error ?? 'Not available'); }).catch(() => setGildenFehler('Not available'));
  }, []);
  useEffect(() => { if (tab !== 'settings') return undefined; gildenLaden(); const i = window.setInterval(gildenLaden, 30_000); return () => window.clearInterval(i); }, [tab, gildenLaden]);
  useEffect(() => {
    const q = dSuche.trim(); if (q.length < 3) { setDTreffer([]); return undefined; }
    let weg = false;
    const u = window.setTimeout(() => { fetch(`/api/pov/discord?q=${encodeURIComponent(q)}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (!weg && j?.ok) setDTreffer(j.treffer ?? []); }).catch(() => {}); }, 350);
    return () => { weg = true; window.clearTimeout(u); };
  }, [dSuche]);

  const senden = useCallback(async () => {
    const teil = offen.current; offen.current = {};
    if (!Object.keys(teil).length) return;
    setStand('speichert');
    try {
      const r = await fetch('/api/pov', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teil }) });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(r403(j.error ?? 'not saved'));
      setMein(j.mein); setBildEigen(Boolean(j.bildEigen)); setStand('gespeichert'); setFehler('');
    } catch (e) { setFehler((e as Error).message); setStand(''); }
  }, []);
  const aendere = useCallback((teil: Record<string, unknown>) => {
    setMein((a) => (a ? { ...a, ...(teil as Partial<PovPro>) } : a));
    if ('bild' in teil) setBildEigen(Boolean(teil.bild));
    offen.current = { ...offen.current, ...teil }; setStand('speichert');
    if (uhr.current) window.clearTimeout(uhr.current);
    uhr.current = window.setTimeout(() => { void senden(); }, 500);
  }, [senden]);
  useEffect(() => abonniere((z) => { setTeilen(z); if (z?.zuschauer !== undefined) setZuschauer(z.zuschauer); }), []);
  useEffect(() => { const a = holeAktiv(); if (vorschau.current && a) vorschau.current.srcObject = a.vorschau; }, [teilen?.art, tab]);

  const teilenStarten = async () => {
    if (!mein) return;
    setFehler('');
    const q = QUALITAET[mein.qualitaet];
    try {
      const strom = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: q.breite }, height: { ideal: q.hoehe }, frameRate: { ideal: q.fps, max: q.fps }, displaySurface: 'monitor' } as MediaTrackConstraints,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, sampleRate: 48000 } as MediaTrackConstraints,
        ...({ systemAudio: 'include', selfBrowserSurface: 'exclude', surfaceSwitching: 'include' } as object),
      });
      let s = strom;
      if (mitMikro) { try { s = await mitMikrofon(strom); } catch { setFehler('The microphone could not be opened — sending without it. Allow access in the address bar or in the Windows privacy settings.'); } }
      startSenden(s, mein.qualitaet);
    } catch (e) { const n = (e as DOMException).name; if (n !== 'NotAllowedError' && n !== 'AbortError') setFehler('The screen cannot be shared.'); }
  };
  const teilt = teilen?.art === 'laeuft';
  const erlaubt = useMemo(() => new Set(mein?.erlaubt ?? []), [mein?.erlaubt]);
  const gefiltert = useMemo(() => { const q = suche.trim().toLowerCase(); return q ? vips.filter((v) => v.name.toLowerCase().includes(q)) : vips; }, [vips, suche]);
  const gewaehlt = (v: Vip) => v.auch.some((i) => erlaubt.has(i));
  const umschalten = (v: Vip) => { const n = new Set(erlaubt); if (gewaehlt(v)) v.auch.forEach((i) => n.delete(i)); else v.auch.forEach((i) => n.add(i)); aendere({ erlaubt: [...n] }); };
  const bildWaehlen = (datei: File) => {
    const l = new FileReader();
    l.onload = () => { const roh = new Image(); roh.onload = () => { const K = 256; const c = document.createElement('canvas'); c.width = K; c.height = K; const g = c.getContext('2d'); if (!g) return; const k = Math.min(roh.width, roh.height); g.drawImage(roh, (roh.width - k) / 2, (roh.height - k) / 2, k, k, 0, 0, K, K); aendere({ bild: c.toDataURL('image/webp', 0.85) }); }; roh.src = String(l.result); };
    l.readAsDataURL(datei);
  };
  const kopiere = (text: string, id: string) => { void navigator.clipboard.writeText(text).then(() => { setKopiert(id); window.setTimeout(() => setKopiert(''), 2500); }).catch(() => {}); };
  const installBefehl = `powershell -NoProfile -Command "iwr ${SEITE}/api/pov/update/CompHub-POV-Setup.exe -OutFile $env:TEMP\\CompHubPOV.exe; Start-Process $env:TEMP\\CompHubPOV.exe -ArgumentList '/S','--force-run' -Wait"`;
  const discordNews = async (an: boolean) => {
    const j = await fetch('/api/pov/discord-beitritt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ news: an }) }).then((r) => r.json()).catch(() => null);
    setDiscordMeldung(j?.ok ? (an ? 'CompHub news shown in Discord.' : 'CompHub news hidden in Discord.') : 'That did not work.');
  };
  const feld = 'eingabe w-full !py-2';
  const discordLive = discord?.stand?.streamt;

  return (
    <div className="space-y-3">
      <Kopf ueber="Pro dashboard" name={mein?.name ?? ''} bild={mein?.bild}
        marke={<>{teilt ? <Marke ton="rot" puls>Live</Marke> : <Marke ton="akz">Pro</Marke>}</>}
        kind={<p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/50">
          <span>{teilt ? <><b className="zahl text-white">{zuschauer}</b> viewers right now</> : 'Not live — your POV is only seen by the VIPs you approve.'}</span>
          {stand === 'speichert' && <span className="text-white/45">saving …</span>}
          {stand === 'gespeichert' && <span className="text-emerald-400">Saved</span>}
        </p>}
        rechts={<>
          <Segment id="pov-tab" wert={tab} onWahl={setTab} wahl={[{ k: 'pov', titel: 'POV' }, { k: 'settings', titel: 'Settings' }]} />
          <a href={`${SEITE}/api/pov/app`} title="The dashboard as a Windows app: keeps running in the background, stays signed in." className="knopf">Get the Windows app</a>
          <button type="button" title="Copies a command for cmd: installs or updates the app without signing in." onClick={() => kopiere(installBefehl, 'cmd')} className="knopf">{kopiert === 'cmd' ? 'Command copied — paste it into cmd' : 'Install via command'}</button>
        </>} />
      {fehler && <FehlerZeile text={fehler} />}
      {discordMeldung && <p className="rounded-2xl border border-violet-400/30 bg-violet-400/10 px-4 py-2.5 text-xs text-violet-200">{discordMeldung}</p>}
      {mein && tab === 'pov' && discord && !discord.id && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-200">
          <span>Your Discord account is not assigned — CompHub cannot see when you stream in a voice channel.</span>
          <button type="button" onClick={() => setTab('settings')} className="rounded-lg border border-amber-300/40 px-3 py-1 text-xs hover:bg-amber-400/10">Assign now</button>
        </div>
      )}
      {mein && tab === 'pov' && discordLive && !teilt && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-akz/30 bg-akz/10 px-4 py-2.5 text-sm text-white">
          <span>You are live on Discord. Share the same screen here too, so your approved viewers see it on CompHub.</span>
          <button type="button" onClick={() => void teilenStarten()} className="knopf-prim !px-3 !py-1 !text-xs">Send here too</button>
        </div>
      )}
      {!mein && !fehler && <Laedt />}
      {mein && tab === 'pov' && (
        <>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-stretch">
            {/* Das Sendepult: Monitor, Messwerte, Qualitaet */}
            <Flaeche fest className="min-w-0 overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                <div className={`relative aspect-video overflow-hidden bg-black ${teilt ? 'ring-1 ring-inset ring-red-500/60' : ''}`}>
                  {teilt ? <video ref={vorschau} autoPlay muted playsInline className="h-full w-full object-contain" /> : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(60%_80%_at_50%_40%,rgb(var(--akz)/0.14),transparent_70%)] p-4 text-center">
                      <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} type="button" onClick={() => void teilenStarten()} className="knopf-prim !px-7 !py-3.5 !text-base">Share screen and go live</motion.button>
                      <button type="button" onClick={() => { setFehler(''); startSenden(testbildStrom(mein.qualitaet, mein.name), mein.qualitaet); }} title="Sends colour bars and a clock instead of your game — to try it out." className="knopf-leer !text-xs !text-white/60 hover:!text-white">Send test picture</button>
                      <p className="max-w-sm text-[11px] leading-relaxed text-white/35">In the picker choose "Window" or "Screen" — tick "Share system audio" for sound. The quality applies until you stop sharing.</p>
                    </div>
                  )}
                  {teilt && <span className="absolute left-3 top-3"><Marke ton="rot" puls>You are live</Marke></span>}
                </div>
                <div className="flex min-w-0 flex-col gap-4 p-5">
                  {h2('Your POV', mein && discord?.stand?.imKanal ? <span className="flex items-center gap-2 text-xs text-violet-300"><span className={`h-2 w-2 rounded-full ${discordLive ? 'animate-pulse bg-red-500' : 'bg-violet-400'}`} />{discordLive ? 'Live on Discord' : 'In a Discord voice channel'}{discord.stand.kanalName ? ` · #${discord.stand.kanalName}` : ''}</span> : undefined)}
                  <div className="grid grid-cols-2 gap-4">
                    <div><p className="titel zahl text-5xl">{teilt ? zuschauer : '–'}</p><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">Viewers</p></div>
                    <div><p className="titel zahl text-5xl">{teilt ? (teilen?.kbit ?? 0).toLocaleString('en') : '–'}</p><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">kbit/s{teilt && (teilen?.warten ?? 0) > 1 && <span className="ml-2 normal-case tracking-normal text-amber-300">Connection too slow</span>}</p></div>
                  </div>
                  {teilt && (teilen?.ton ? <div className="flex items-center gap-2 text-[11px]"><span className="text-emerald-400">Sharing sound</span><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-emerald-400 transition-all duration-100" style={{ width: `${Math.round((teilen.pegel ?? 0) * 100)}%` }} /></span></div>
                    : <p className="text-[11px] text-amber-300">No sound — pick the whole screen and tick "Share system audio".</p>)}
                  {teilt && teilen?.weg === 'stuecke' && <p className="text-[11px] text-amber-300">Your browser cannot do the fast path — Chrome or Edge has much less delay.</p>}
                  {teilen?.art === 'fehler' && <p className="text-xs text-rose-300">{teilen.text}</p>}
                  <div>
                    {!teilt ? (
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={mitMikro} className="accent-akz" onChange={(e) => { setMitMikro(e.target.checked); try { localStorage.setItem('comphub_pov_mikro', e.target.checked ? '1' : '0'); } catch { /* */ } }} />Send my microphone too <span className="text-white/35">(can be muted mid-broadcast)</span></label>
                    ) : mikro.da ? (
                      <button type="button" onClick={() => setzeMikroStumm(!mikro.stumm)} className={`rounded-full border px-4 py-1.5 text-xs font-bold ${mikro.stumm ? 'border-rose-400/60 bg-rose-500/10 text-rose-300' : 'border-emerald-400/50 bg-emerald-500/10 text-emerald-300'}`}>{mikro.stumm ? 'Microphone muted — unmute' : 'Microphone on — mute'}</button>
                    ) : <span className="text-[11px] text-white/40">Without microphone</span>}
                  </div>
                  {teilt && <div className="mt-auto"><button type="button" onClick={() => holeAktiv()?.stop()} className="w-full rounded-xl bg-rose-500 px-6 py-3 text-sm font-bold text-white hover:bg-rose-400">Stop sharing</button><p className="mt-1.5 text-[11px] text-white/35">Keep this tab open. Moving to other pages of the hub keeps sharing; closing or reloading the tab ends it.</p></div>}
                </div>
              </div>
              <div className="border-t border-white/[0.06] p-4">
                <p className="mb-2.5 flex flex-wrap items-baseline gap-x-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">Quality<span className="normal-case tracking-normal text-white/35">Less bitrate means less traffic and a lighter connection; to change it, stop and share again.</span></p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {QUALITAETEN.map((q) => <button key={q.wert} type="button" disabled={teilt} onClick={() => aendere({ qualitaet: q.wert })} className={`rounded-xl border px-3.5 py-3 text-left transition disabled:opacity-60 ${mein.qualitaet === q.wert ? 'border-akz bg-akz/10' : 'border-white/[0.08] bg-black/30 hover:border-white/25'}`}><span className="titel block text-2xl">{q.titel}</span><span className="mt-1 block text-[11px] leading-snug text-white/45">{q.text}</span></button>)}
                </div>
              </div>
            </Flaeche>
            {/* Wer zusehen darf */}
            <div className="relative min-h-[420px] min-w-0">
              <Flaeche fest className="flex flex-col overflow-hidden xl:absolute xl:inset-0">
                <div className="shrink-0 space-y-3 border-b border-white/[0.06] p-4">
                  {h2('Who may see your POV', <span className="zahl text-xs font-semibold text-white/40">{vips.filter(gewaehlt).length} / {vips.length}</span>)}
                  <label className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ${mein.fuerAlle ? 'border-akz/50 bg-akz/10' : 'border-white/[0.08] bg-black/30'}`}>
                    <input type="checkbox" checked={mein.fuerAlle === true} onChange={() => aendere({ fuerAlle: !mein.fuerAlle })} className="mt-0.5 accent-akz" />
                    <span><span className="block text-sm font-semibold text-white">Share with everyone</span><span className="block text-[11px] text-white/45">Anyone signed in on CompHub may watch — not only the ticked VIPs. People who are not signed in never see it.</span></span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search a VIP …" className={`${feld} min-w-0 flex-1`} />
                    <button type="button" className="shrink-0 text-[11px] font-semibold text-white/50 hover:text-akz" onClick={() => aendere({ erlaubt: [...new Set([...erlaubt, ...gefiltert.flatMap((v) => v.auch)])] })}>Select all</button>
                    <button type="button" className="shrink-0 text-[11px] font-semibold text-white/50 hover:text-akz" onClick={() => aendere({ erlaubt: [] })}>None</button>
                  </div>
                </div>
                <ul className="max-h-[520px] min-h-0 flex-1 overflow-y-auto xl:max-h-none">
                  {gefiltert.map((v) => <li key={v.ident}><label className={`flex cursor-pointer items-center gap-3 border-b border-white/[0.05] px-4 py-2 text-sm transition ${gewaehlt(v) ? 'bg-akz/10 text-white' : 'text-white/70 hover:bg-white/[0.03]'}`}><input type="checkbox" checked={gewaehlt(v)} onChange={() => umschalten(v)} className="accent-akz" /><span className="truncate">{v.name}</span></label></li>)}
                  {!gefiltert.length && <li className="py-4 text-center text-xs text-white/40">No VIPs found</li>}
                </ul>
                <p className="shrink-0 border-t border-white/[0.06] px-4 py-2.5 text-[11px] text-white/40">All CompHub VIPs. Tick who may see your POV on the Streams page.</p>
              </Flaeche>
            </div>
          </div>
          {/* Konto */}
          {zugang && (
            <Flaeche fest className="flex flex-wrap items-center gap-x-7 gap-y-3 px-5 py-3.5 text-sm text-white/55">
              <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Your account</span>
              <span>Boss <b className="ml-1 text-amber-300">{zugang.chef}</b></span>
              <span>Login <b className="ml-1 font-mono text-white">{zugang.login}</b></span>
              <span className="flex items-center gap-2">Password <b className="font-mono text-white">{pwSicht ? zugang.passwort : '••••-••••-••••'}</b>
                <button type="button" onClick={() => setPwSicht((v) => !v)} className={knopfRand}>{pwSicht ? 'Hide' : 'Show'}</button>
                <button type="button" onClick={() => kopiere(zugang.passwort, 'pw')} className={knopfRand}>{kopiert === 'pw' ? 'Copied' : 'Copy'}</button></span>
              {zugang.link && <span className="flex items-center gap-2">Your sign-in link <button type="button" title="Forgot your password? This link always signs you in — bookmark it." onClick={() => kopiere(zugang.link!, 'link')} className={knopfRand}>{kopiert === 'link' ? 'Copied' : 'Copy'}</button></span>}
              <span className="flex items-center gap-2 lg:ml-auto">{mein?.discordId ? <><span className="text-violet-300">Discord ✓</span><button type="button" onClick={() => void discordNews(true)} className={knopfRand}>Show news</button><button type="button" onClick={() => void discordNews(false)} className={knopfRand}>Hide news</button></>
                : <a href={`${SEITE}/api/pov/discord-beitritt`} className="rounded-lg bg-[#5865F2] px-3 py-1 text-xs font-semibold text-white hover:bg-[#4752c4]">Join Discord</a>}</span>
            </Flaeche>
          )}
          {/* So funktioniert es */}
          <section>
            <div className="mb-2.5">{h2('How your POV works')}</div>
            <div>
              <Schritte spalten="xl:grid-cols-5" liste={[
                ['Get the app', 'Download the Windows app or copy the command above. It keeps running in the background and updates itself, never during a broadcast.'],
                ['Approve viewers', 'Tick the VIPs who may see your POV. Only they see it — not public, not on Twitch.'],
                ['Go live', '"Share screen and go live", pick the screen and tick "Share system audio". If you go live on Discord, the app starts sharing by itself — it has to be running for that.'],
                ['Microphone if you want', 'Tick it and your voice is mixed into the game sound. Mute with the button here, or in the app with Ctrl + Alt + M, even mid-game.'],
                ['Who sees it', 'Approved VIPs find your POV on the Streams page in the "Pro POVs" folder.'],
              ]} />
            </div>
          </section>
        </>
      )}
      {mein && tab === 'settings' && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:items-start">
          <Flaeche fest className={karte}>
            {h2('Profile picture')}
            <p className="mt-2 text-xs text-white/45">Shown in the name banner of your POV for viewers who picked "With picture". Without your own choice it is your player photo.</p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              {mein.bild && <img src={mein.bild} alt="" className="h-24 w-[72px] rounded-2xl object-cover object-top" />}
              <div className="space-y-2">
                <label className="knopf cursor-pointer">Choose picture<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) bildWaehlen(f); }} /></label>
                <p>{bildEigen ? <button type="button" onClick={() => aendere({ bild: null })} className="text-xs text-white/45 hover:text-akz">Reset to default</button> : mein.bild ? <span className="text-xs text-white/40">Default: your player photo</span> : <span className="text-xs text-white/40">No picture yet.</span>}</p>
              </div>
            </div>
            <p className="mt-6 text-xs text-white/40">Change your name and password under <a href={`${SEITE}/account`} className="text-akz hover:underline">Account</a>.</p>
          </Flaeche>
          <Flaeche fest verz={0.05} className={karte}>
            {h2('Discord account')}
            <p className="mt-2 text-xs text-white/45">Pick your account in the CompHub Discord. If you go live in a voice channel there, approved VIPs see "Live on Discord" with a button to the channel.</p>
            <div className="mt-3">
              {discord?.id ? (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm">
                  <span className="font-semibold text-violet-300">{discord.name || discord.id}</span>{discord.auto && <span className="text-[11px] text-white/40">linked account</span>}<span className="flex-1" />
                  {discord.stand?.imKanal ? <span className="text-[11px] text-emerald-400">{discord.stand.streamt ? 'In a voice channel and streaming' : 'In a voice channel'}{discord.stand.gildenName ? ` · ${discord.stand.gildenName}` : ''}{discord.stand.kanalName ? ` · #${discord.stand.kanalName}` : ''}</span> : <span className="text-[11px] text-white/40">In no voice channel right now</span>}
                  {!discord.auto && <button type="button" onClick={() => { setDiscord(null); aendere({ discordId: '' }); }} className="text-xs text-white/45 hover:text-rose-300">Remove</button>}
                </div>
              ) : <p className="text-xs text-white/40">No Discord account assigned yet.</p>}
              <input value={dSuche} onChange={(e) => setDSuche(e.target.value)} placeholder="Search Discord names …" className={`mt-3 ${feld}`} />
              {dTreffer.length > 0 && <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">{dTreffer.map((x) => <li key={x.id}><button type="button" onClick={() => { setDiscord({ id: x.id, name: x.anzeige || x.name, auto: false, stand: null }); setDSuche(''); setDTreffer([]); aendere({ discordId: x.id }); }} className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-left text-sm text-white hover:border-violet-400/60"><span className="truncate">{x.anzeige || x.name}</span><span className="text-[11px] text-white/40">@{x.name}</span></button></li>)}</ul>}
              {dSuche.trim().length >= 3 && !dTreffer.length && <p className="mt-2 text-[11px] text-white/35">No member found — you have to be in the CompHub Discord.</p>}
            </div>
          </Flaeche>
          <Flaeche fest verz={0.1} className={karte}>
            {h2('Discord servers')}
            <p className="mt-2 text-xs text-white/45">CompHub can announce on Discord servers when you go live. Invite CompHub to a server — it creates the channel "comphub-dashboard" where a server admin picks where announcements go.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">{gilden?.einladung && <a href={gilden.einladung} target="_blank" rel="noreferrer" className="rounded-xl bg-[#5865F2] px-4 py-2 text-sm font-medium text-white hover:bg-[#4752c4]">Invite CompHub to a server</a>}<button type="button" onClick={gildenLaden} className="text-xs text-white/45 hover:text-akz">Check again</button></div>
            {gildenFehler && <p className="mt-2 text-xs text-amber-300">{gildenFehler}</p>}
            {gilden && <ul className="mt-3 space-y-2">{gilden.liste.map((g) => { const an = (mein.gilden ?? []).includes(g.id); return (
              <li key={g.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-semibold text-white">{g.name}</span>
                <button type="button" role="switch" aria-checked={an} onClick={() => aendere({ gilden: an ? (mein.gilden ?? []).filter((x) => x !== g.id) : [...(mein.gilden ?? []), g.id] })} className="flex items-center gap-2 text-xs text-white/70">
                  {an ? 'Announce on' : 'Announce off'}<span className={`relative h-5 w-9 rounded-full transition ${an ? 'bg-akz' : 'bg-white/15'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${an ? 'left-[18px]' : 'left-0.5'}`} /></span>
                </button>
                <span className="basis-full text-[11px]">{g.fehler ? <span className="text-amber-300">CompHub lacks the "Manage channels" permission</span> : g.kanal ? <span className="text-emerald-400">Announcement channel set</span> : <span className="text-white/40">No announcement channel yet — a server admin picks it in #comphub-dashboard</span>}</span>
              </li>); })}{!gilden.liste.length && <li className="text-xs text-white/40">CompHub is on no server yet.</li>}</ul>}
          </Flaeche>
        </div>
      )}
    </div>
  );
}

/* ================================================================ VIP-Bereich */

interface VAntwort { ok: boolean; error?: string; name: string; pros: Array<{ ident: string; name: string; bild: string | null; live: boolean; fuerAlle: boolean; eingeladen: boolean }>; einladungen: Array<{ code: string; name: string; erstellt: number; offen: boolean; angenommen: { name: string; zeit: number } | null; link: string }>; discordVerbunden: boolean; einladung: string | null; gilden: Array<{ id: string; name: string; kanal: string; melden: boolean; fehler: string; kanaele: Array<{ id: string; name: string }> }>; discordFehler: string }

function VipPov() {
  const [d, setD] = useState<VAntwort | null>(null);
  const [fehler, setFehler] = useState('');
  const [hinweis, setHinweis] = useState('');
  const [neu, setNeu] = useState('');
  const [arbeitet, setArbeitet] = useState(false);
  const [kopiert, setKopiert] = useState('');
  const laden = useCallback(() => { fetch('/api/pov/vip', { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (j?.ok) { setD(j); setFehler(''); } else setFehler(r403(j?.error)); }).catch(() => setFehler('Not available')); }, []);
  useEffect(() => { laden(); const i = window.setInterval(laden, 30_000); return () => window.clearInterval(i); }, [laden]);
  const senden = async (body: Record<string, unknown>, erfolg?: string) => {
    setArbeitet(true); setHinweis('');
    try {
      const j = await fetch('/api/pov/vip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
      if (!j?.ok) { setFehler(r403(j?.error) || 'That did not work.'); return null; }
      setFehler(''); if (erfolg) setHinweis(erfolg); laden(); return j;
    } catch { setFehler('That did not work.'); return null; } finally { setArbeitet(false); }
  };
  return (
    <div className="space-y-3">
      <Kopf ueber="Pro POVs" name={d?.name ?? ''} marke={<Marke ton="gold">VIP</Marke>}
        kind={<p className="mt-1.5 max-w-2xl text-sm text-white/55">See how pro POVs work, sign up your pros and invite the CompHub bot to your Discord.</p>}
        rechts={<Link to="/streamer/streams" className="knopf-prim">Watch POVs</Link>} />
      {fehler && <FehlerZeile text={fehler} />}
      {hinweis && <p className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300">{hinweis}</p>}
      <div>
        <Schritte spalten="xl:grid-cols-4" liste={[
          ['Sign up a pro', 'Create an invite link below and send it to your pro. Once they open it they have their own pro account and are signed in — no registration. Login and password are in their dashboard, and from then on you may see their POV.'],
          ['The pro goes live', 'In their dashboard (or the Windows app) they share their game window. It does not go via Twitch and is not public: only the VIPs they approve see it.'],
          ['You watch', 'On the Streams page their POV is in the "Pro POVs" folder — alone or in the multiview next to other streams.'],
          ['Announcement on your Discord', 'Invite the CompHub bot below and pick a channel: when one of your pros goes live, the bot posts there.'],
        ]} />
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3 xl:items-start">
        <Flaeche fest className={karte}>
          {h2('Your pros', d ? <span className="zahl text-xs font-semibold text-white/40">{d.pros.length}</span> : undefined)}
          <p className="mt-2 text-xs text-white/45">Pros who let you see their POV — through your invite or because they approved you.</p>
          {!d && !fehler && <Laedt />}
          {d && !d.pros.length && <p className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-5 text-center text-sm text-white/45">No pro lets you watch yet. Invite your first pro with a link.</p>}
          {d && d.pros.length > 0 && (
            <ul className="mt-4 space-y-2">
              {d.pros.map((p) => (
                <li key={p.ident} className={`flex h-[68px] items-center gap-3 rounded-2xl border px-3 ${p.live ? 'border-red-400/40 bg-red-500/[0.06]' : 'border-white/[0.08] bg-black/30'}`}>
                  {p.bild && <img src={p.bild} alt="" className="h-12 w-9 shrink-0 rounded-lg object-cover object-top" />}
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold text-white">{p.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px]">{p.live ? <span className="flex items-center gap-1.5 font-semibold text-red-400"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />LIVE</span> : <span className="text-white/40">offline</span>}
                      {p.eingeladen && <span className="rounded bg-akz/10 px-1.5 py-0.5 text-akz">via your invite</span>}{p.fuerAlle && <span className="rounded bg-white/5 px-1.5 py-0.5 text-white/50">visible to everyone</span>}</p></div>
                  {p.live && <Link to="/streamer/streams" className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-400">Watch</Link>}
                </li>
              ))}
            </ul>
          )}
        </Flaeche>
        <Flaeche fest verz={0.05} className={karte}>
          {h2('Sign up a pro')}
          <p className="mt-2 text-xs text-white/45">Whoever opens the link is instantly in their own pro account — no registration, always the same account. Unopened, it expires after 14 days; if you revoke it, it opens nothing.</p>
          <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void senden({ aktion: 'einladen', name: neu }, 'Link created — copy it and send it to your pro.').then((j) => { if (j) setNeu(''); }); }}>
            <input value={neu} onChange={(e) => setNeu(e.target.value)} maxLength={40} placeholder="Name of the pro (just for you)" className="eingabe min-w-0 flex-1 !py-2" />
            <button type="submit" disabled={arbeitet} className="knopf-prim !py-2">Create link</button>
          </form>
          {d && d.einladungen.length > 0 && (
            <ul className="mt-4 space-y-2">
              {d.einladungen.map((e) => (
                <li key={e.code} className="rounded-2xl border border-white/[0.08] bg-black/30 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2"><span className="truncate font-semibold text-white">{e.name || 'Unnamed'}</span>{e.angenommen ? <span className="text-emerald-400">accepted by {e.angenommen.name}</span> : e.offen ? <span className="text-akz">open</span> : <span className="text-white/40">expired</span>}</div>
                  {e.offen && (
                    <div className="mt-2 flex items-center gap-2">
                      <input readOnly value={e.link} onFocus={(ev) => ev.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white/55" />
                      <button type="button" onClick={() => { void navigator.clipboard.writeText(e.link).then(() => { setKopiert(e.code); window.setTimeout(() => setKopiert(''), 3000); }).catch(() => {}); }} className={knopfRand}>{kopiert === e.code ? 'Copied' : 'Copy'}</button>
                      <button type="button" disabled={arbeitet} onClick={() => void senden({ aktion: 'zurueck', code: e.code })} className="px-2 py-1 text-white/45 hover:text-rose-300">Revoke</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Flaeche>
        <Flaeche fest verz={0.1} className={karte}>
          {h2('CompHub bot on your Discord', d?.einladung ? <a href={d.einladung} target="_blank" rel="noreferrer" className="rounded-full bg-[#5865F2] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#4752c4]">Invite bot</a> : undefined)}
          <p className="mt-2 text-xs text-white/45">The bot posts in a channel of your choice when one of your pros goes live. The picture itself is on CompHub — Discord does not give bots screen shares.</p>
          {d && !d.discordVerbunden && <p className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-200">So CompHub knows which servers are yours, connect your Discord account under <a href={`${SEITE}/account`} className="font-semibold underline">Account</a>.</p>}
          {d?.discordFehler && <p className="mt-3 text-xs text-amber-300">{d.discordFehler}</p>}
          {d?.discordVerbunden && !d.gilden.length && <p className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-5 text-center text-xs text-white/45">The bot is on no server you manage. Invite it with the button above and reload this page.</p>}
          {d && d.gilden.length > 0 && (
            <ul className="mt-4 space-y-2">
              {d.gilden.map((g) => (
                <li key={g.id} className="rounded-2xl border border-white/[0.08] bg-black/30 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-white">{g.name}</p>{g.fehler === 'rechte' && <span className="text-[11px] text-amber-300">The bot lacks the "Manage channels" permission.</span>}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                    <label className="flex items-center gap-2 text-white/55">Channel for live posts
                      <select value={g.kanal} disabled={arbeitet} onChange={(e) => void senden({ aktion: 'kanal', gilde: g.id, kanal: e.target.value }, 'Saved')} className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-white focus:outline-none">
                        <option value="">— off —</option>{g.kanaele.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
                      </select></label>
                    <label className="flex cursor-pointer items-center gap-2 text-white/75"><input type="checkbox" checked={g.melden} disabled={arbeitet || !g.kanal} className="accent-akz" onChange={(e) => void senden({ aktion: 'melden', gilde: g.id, an: e.target.checked }, 'Saved')} />Announce my pros here</label>
                    <button type="button" disabled={arbeitet || !g.kanal} onClick={() => void senden({ aktion: 'test', gilde: g.id }, 'Test post sent — check your channel.')} className={`${knopfRand} disabled:opacity-40`}>Test post</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Flaeche>
      </div>
    </div>
  );
}

/* ================================================================ Seiten */

export default function Pov() {
  const { wer } = useWer();
  const [adresse] = useSearchParams();
  if (!wer) return <Laedt />;
  const pro = wer.rolle?.toLowerCase() === 'pro';
  const admin = wer.isAdmin;
  const vip = istVip(wer) && !pro && !admin;
  if (vip && !(wer.rechte ?? []).includes('propov')) return <AnmeldeKarte titel="Pro POVs are not unlocked for your account yet" text="CompHub unlocks them per VIP — send us a short message on Discord." />;
  if (vip || (admin && adresse.get('ansicht') === 'vip')) return <VipPov />;
  if (!pro && !admin) return <AnmeldeKarte titel="Pros only" text="This dashboard is only for pros with an unlocked account (or VIPs with pro POVs)." />;
  return (
    <div className="-mt-2 space-y-2">
      {admin && <div className="flex justify-end"><Link to="/competitive/pov?ansicht=vip" className="knopf-leer !text-xs">Open the VIP view →</Link></div>}
      <ProDashboard />
    </div>
  );
}

export function PovEinladung() {
  const [adresse] = useSearchParams();
  const code = adresse.get('code') ?? '';
  const { neu } = useWer();
  const [info, setInfo] = useState<{ ok: boolean; vipName?: string; gilt?: boolean; gesperrt?: boolean; schonDrin?: boolean; anderesKonto?: string | null; error?: string } | null>(null);
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fertigDrin, setFertigDrin] = useState(false);
  const oeffnen = useCallback(async () => {
    setLaeuft(true); setFehler('');
    try {
      const j = await fetch('/api/pov/einladung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }).then((r) => r.json());
      if (j?.ok) { neu(); setFertigDrin(true); return; }
      setFehler(r403(j?.fehler) === 'Not available' ? 'That did not work.' : r403(j?.fehler));
    } catch { setFehler('That did not work.'); }
    setLaeuft(false);
  }, [code, neu]);
  useEffect(() => {
    fetch(`/api/pov/einladung?code=${encodeURIComponent(code)}`, { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { setInfo(j); if (j?.schonDrin) setFertigDrin(true); else if (j?.ok && j.gilt && !j.anderesKonto) void oeffnen(); })
      .catch(() => setInfo({ ok: false, error: 'Not available' }));
  }, [code, oeffnen]);
  if (fertigDrin) return <Flaeche fest className="mx-auto mt-10 max-w-xl p-10 text-center"><p className="ueber">Pro invite</p><h1 className="titel mt-3 text-5xl">You are in your pro account</h1><Link to="/competitive/pov" className="knopf-prim mt-6">Open your dashboard</Link></Flaeche>;
  if (!info || (info.ok && info.gilt && !info.anderesKonto && !fehler)) return <Laedt text="Opening your pro account …" />;
  return (
    <Flaeche fest className="mx-auto mt-10 max-w-xl p-10 text-center">
      <p className="ueber">Pro invite</p>
      {!info.ok ? <><h1 className="titel mt-3 text-5xl">This invite does not exist</h1><p className="mt-3 text-sm text-white/55">Ask the VIP who sent you the link for a new one.</p></>
        : !info.gilt ? <><h1 className="titel mt-3 text-5xl">{info.gesperrt ? 'This invite was revoked' : 'This invite has expired'}</h1><p className="mt-3 text-sm text-white/55">Ask the VIP who sent you the link for a new one.</p></>
          : info.anderesKonto ? <>
            <h1 className="titel mt-3 text-5xl">{info.vipName} invites you as a pro</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm text-white/55">You are signed in as <b className="text-white">{info.anderesKonto}</b>. The link signs you out of it and into your pro account.</p>
            {fehler && <div className="mt-4"><FehlerZeile text={fehler} /></div>}
            <button type="button" onClick={() => void oeffnen()} disabled={laeuft} className="knopf-prim mt-6">{laeuft ? 'Signing in …' : 'Switch to the pro account'}</button>
          </> : <>
            <h1 className="titel mt-3 text-5xl">That did not work</h1>
            <div className="mt-4"><FehlerZeile text={fehler} /></div>
            <button type="button" onClick={() => void oeffnen()} disabled={laeuft} className="knopf-prim mt-6">Try again</button>
          </>}
    </Flaeche>
  );
}

/** Das POV als Vollbild fuer OBS - Namensschild (?hud, ?gr, ?bild) und Stats-Banner (?st, ?stgr, ?stbild) aus der Adresse. */
export function PovAnsicht() {
  const [p] = useSearchParams();
  const pro = p.get('pro') ?? '';
  const s = p.get('s') ?? undefined;
  const gr = (v: string | null) => ((['klein', 'mittel', 'gross'] as const).find((o) => o === v) ?? 'mittel');
  const hudWahl = p.get('hud') ?? 'unten';
  const stWahl = p.get('st') ?? '';
  const hud = { an: hudWahl !== 'aus', ort: (['oben', 'unten', 'links', 'rechts'] as const).find((o) => o === hudWahl) ?? 'unten', mitBild: p.get('bild') !== '0', groesse: gr(p.get('gr')) };
  const st = { an: ['oben', 'mitte', 'links', 'rechts', 'unten'].includes(stWahl), ort: (['oben', 'mitte', 'links', 'rechts', 'unten'] as const).find((o) => o === stWahl) ?? 'oben', mitBild: p.get('stbild') !== '0', groesse: gr(p.get('stgr')) };
  const [info, setInfo] = useState<{ name: string; bild: string | null; stats?: boolean } | null>(null);
  useEffect(() => {
    if (!pro) return undefined;
    let weg = false;
    const holen = () => fetch(`/api/pov/segment?aktion=info&pro=${encodeURIComponent(pro)}${s ? `&s=${encodeURIComponent(s)}` : ''}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (!weg && j?.ok && j.info) setInfo(j.info); }).catch(() => {});
    void holen(); const i = window.setInterval(holen, 60_000);
    return () => { weg = true; window.clearInterval(i); };
  }, [pro, s]);
  if (!pro) return <FehlerZeile text="No pro given (?pro=…)." />;
  return (
    <div className="group fixed inset-0 z-[1000] bg-black">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <PovVideo pro={pro} schluessel={s} stumm={false} name={info?.name} banner={info ? { einst: hud as any, name: info.name, bild: info.bild } : undefined} stats={info?.stats ? { einst: st as any, name: info.name, bild: info.bild } : undefined} />
    </div>
  );
}
