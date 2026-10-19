'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import type { PovPro, PovQualitaet } from '@/lib/pov';
import { QUALITAET, abonniere, abonniereMikro, holeAktiv, mikroStand, mitMikrofon, setzeMikroStumm, startSenden, testbildStrom, type Zustand } from '@/app/pov/sender';

/*
 * Das Dashboard eines Profis.
 *
 * Der Betreiber (11.10.2026): Profis loggen sich ganz normal ein und sehen "nichts ausser POV und
 * Settings". Unter POV gehen sie live, waehlen aus der Liste der VIPs - einzeln -, wer ihr POV sehen darf,
 * und stellen die Qualitaet ein. Unter Einstellungen: Profilbild (ohne eigene Wahl ihr Spielerfoto) und
 * Discord-Server (Ankuendigungen). Das Namensbanner stellt nicht der Profi ein, sondern jeder Zuschauer selbst. Alles
 * speichert sich von selbst.
 */

interface Vip { ident: string; name: string; auch: string[] }

const QUALITAETEN: Array<{ wert: PovQualitaet; titel: string; text: string }> = [
  { wert: 'max', titel: 'Max', text: '1080p60 · 8000 kbit/s · bestes Bild, etwas mehr Verzögerung' },
  { wert: 'mittel', titel: 'Mittel', text: '720p60 · 4500 kbit/s · guter Mittelweg' },
  { wert: 'niedrig', titel: 'Niedrig', text: '720p30 · 2500 kbit/s · möglichst wenig Verzögerung' },
];

export default function ProDashboard() {
  const t = useT();
  const [tab, setTab] = useState<'pov' | 'settings'>('pov');
  const [mein, setMein] = useState<PovPro | null>(null);
  /** Hat der Profi ein eigenes Profilbild gewaehlt? Sonst gilt sein Spielerfoto. */
  const [bildEigen, setBildEigen] = useState(false);
  const [vips, setVips] = useState<Vip[]>([]);
  const [fehler, setFehler] = useState('');
  const [stand, setStand] = useState<'' | 'speichert' | 'gespeichert'>('');
  const [suche, setSuche] = useState('');
  const [teilen, setTeilen] = useState<Zustand | null>(() => holeAktiv()?.zustand ?? null);
  const [zuschauerJetzt, setZuschauerJetzt] = useState(0);
  const vorschau = useRef<HTMLVideoElement | null>(null);
  /** Die Discord-Server, auf denen CompHub ist - und auf welchen davon dieser Profi live angekuendigt wird. */
  const [gilden, setGilden] = useState<{
    einladung: string | null;
    liste: Array<{ id: string; name: string; kanal: boolean; eingerichtet: boolean; fehler: string; aktiv: boolean }>;
  } | null>(null);
  const [gildenFehler, setGildenFehler] = useState('');
  /** Der Befehl, der das Programm ohne Anmeldung installiert oder aktualisiert (kopiert in die Zwischenablage). */
  const [befehlKopiert, setBefehlKopiert] = useState(false);
  const installBefehl = () => {
    const wurzel = typeof window !== 'undefined' ? window.location.origin : 'https://www.thecomphub.com';
    return `powershell -NoProfile -Command "iwr ${wurzel}/api/pov/update/CompHub-POV-Setup.exe -OutFile $env:TEMP\\CompHubPOV.exe; Start-Process $env:TEMP\\CompHubPOV.exe -ArgumentList '/S','--force-run' -Wait"`;
  };
  /** Das Discord-Konto: zugewiesen oder (auto) das verknuepfte - und ob der Bot den Profi gerade im Sprachkanal sieht. */
  const [discord, setDiscord] = useState<{
    id: string; name: string; auto: boolean;
    stand: { imKanal: boolean; streamt: boolean; kanalName: string | null; gildenName?: string | null } | null;
  } | null>(null);
  const [dSuche, setDSuche] = useState('');
  const [dTreffer, setDTreffer] = useState<Array<{ id: string; name: string; anzeige: string }>>([]);
  const uhr = useRef<number | null>(null);
  const offen = useRef<Record<string, unknown>>({});
  /*
   * Auf Discord live -> auch auf CompHub senden.
   *
   * Der Betreiber (12.10.2026): wer auf Discord live geht, soll nicht in Discord angesehen werden muessen, sondern auf
   * der eigenen Seite - "wie als ob ich ueber meine eigene Seite streame". Discord laesst den Bot kein Video holen; also
   * teilt das Programm denselben Bildschirm gleichzeitig an CompHub, sobald der Bot sieht, dass der Profi in einem
   * Sprachkanal streamt. Im Browser fragt der Bildschirm-Dialog immer, dort bleibt es bei einem Knopf.
   */
  const [autoDiscord, setAutoDiscord] = useState(true);
  /** Das Mikrofon mitsenden (gemerkt) und sein Stand waehrend der Uebertragung. */
  const [mitMikro, setMitMikro] = useState(false);
  const [mikro, setMikro] = useState(mikroStand);
  useEffect(() => {
    try { setMitMikro(localStorage.getItem('comphub_pov_mikro') === '1'); } catch { /* ohne Speicher: aus */ }
    return abonniereMikro(setMikro);
  }, []);
  // Im Programm: die Tastenkombination schaltet das Mikrofon um, auch wenn das Fenster nicht vorn ist; das Symbol im Infobereich zeigt den Stand.
  useEffect(() => {
    const app = (window as unknown as { comphubApp?: { onMikro?: (f: () => void) => void; mikroStand?: (da: boolean, stumm: boolean) => void } }).comphubApp;
    app?.mikroStand?.(mikro.da, mikro.stumm);
  }, [mikro.da, mikro.stumm]);
  useEffect(() => {
    const app = (window as unknown as { comphubApp?: { onMikro?: (f: () => void) => void } }).comphubApp;
    app?.onMikro?.(() => { const m = mikroStand(); if (m.da) setzeMikroStumm(!m.stumm); });
  }, []);
  const autoSitzung = useRef(false);
  const autoGestartet = useRef(false);
  useEffect(() => {
    try { setAutoDiscord(localStorage.getItem('comphub_pov_auto_discord') !== '0'); } catch { /* ohne Speicher: an */ }
  }, []);

  /* -------------------------------------------------------------- Laden */
  useEffect(() => {
    let weg = false;
    fetch('/api/pov?modus=mein', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (weg) return;
        if (!j.ok) { setFehler(j.error ?? t('Nicht ladbar')); return; }
        setMein(j.mein as PovPro); setBildEigen(Boolean(j.bildEigen)); setDiscord(j.discord ?? null); setVips(j.vips as Vip[]); setZuschauerJetzt(j.zuschauer ?? 0);
      })
      .catch(() => { if (!weg) setFehler(t('Nicht ladbar')); });
    return () => { weg = true; };
  }, [t]);

  /** Alle fuenfzehn Sekunden: sieht der Bot den Profi gerade im Sprachkanal? */
  useEffect(() => {
    const holen = () => {
      fetch('/api/pov?modus=mein', { cache: 'no-store' }).then((r) => r.json())
        .then((j) => { if (j?.ok) setDiscord(j.discord ?? null); }).catch(() => undefined);
    };
    const id = window.setInterval(holen, 15_000);
    return () => window.clearInterval(id);
  }, []);

  /** Die Discord-Server: beim Oeffnen der Einstellungen und danach alle halbe Minute (neu eingeladene Server tauchen so auf). */
  const gildenLaden = useCallback(() => {
    fetch('/api/pov/discord?aktion=gilden', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => {
        if (j?.ok) { setGilden({ einladung: j.einladung ?? null, liste: j.gilden ?? [] }); setGildenFehler(''); }
        else setGildenFehler(j?.error ?? t('Nicht ladbar'));
      }).catch(() => setGildenFehler(t('Nicht ladbar')));
  }, [t]);
  useEffect(() => {
    if (tab !== 'settings') return undefined;
    gildenLaden();
    const id = window.setInterval(gildenLaden, 30_000);
    return () => window.clearInterval(id);
  }, [tab, gildenLaden]);

  /** Die Namenssuche im CompHub-Server - erst nach einer kurzen Pause im Tippen. */
  useEffect(() => {
    const q = dSuche.trim();
    if (q.length < 3) { setDTreffer([]); return undefined; }
    let weg = false;
    const uhr = window.setTimeout(() => {
      fetch(`/api/pov/discord?q=${encodeURIComponent(q)}`, { cache: 'no-store' }).then((r) => r.json())
        .then((j) => { if (!weg && j?.ok) setDTreffer(j.treffer ?? []); }).catch(() => undefined);
    }, 350);
    return () => { weg = true; window.clearTimeout(uhr); };
  }, [dSuche]);

  /* --------------------------------------------------------- Speichern */
  const senden = useCallback(async () => {
    const teil = offen.current;
    offen.current = {};
    if (!Object.keys(teil).length) return;
    setStand('speichert');
    try {
      const r = await fetch('/api/pov', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teil }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? 'nicht gespeichert');
      setMein(j.mein as PovPro);
      setBildEigen(Boolean(j.bildEigen));
      setStand('gespeichert');
      setFehler('');
    } catch (e) {
      setFehler((e as Error).message);
      setStand('');
    }
  }, []);

  /** Etwas aendern: sofort sichtbar, kurz darauf gespeichert (alles Aufgelaufene in einem Zug). */
  const aendere = useCallback((teil: Record<string, unknown>) => {
    setMein((alt) => (alt ? { ...alt, ...(teil as Partial<PovPro>) } : alt));
    if ('bild' in teil) setBildEigen(Boolean(teil.bild));
    offen.current = { ...offen.current, ...teil };
    setStand('speichert');
    if (uhr.current) window.clearTimeout(uhr.current);
    uhr.current = window.setTimeout(() => { void senden(); }, 500);
  }, [senden]);

  /* ------------------------------------------------------ Bild teilen */
  // Das Teilen laeuft ueber Seitenwechsel weiter (app/pov/sender.ts) - hier nur den Stand mitlesen.
  useEffect(() => abonniere((z) => { setTeilen(z); if (z?.zuschauer !== undefined) setZuschauerJetzt(z.zuschauer); }), []);
  useEffect(() => {
    const a = holeAktiv();
    if (vorschau.current && a) vorschau.current.srcObject = a.vorschau;
  }, [teilen?.art, tab]);

  const teilenStarten = async () => {
    if (!mein) return;
    setFehler('');
    const q = QUALITAET[mein.qualitaet];
    try {
      /*
       * Der Ton: ohne Echo-, Rausch- und Pegelkorrektur.
       *
       * Der Browser behandelt den geteilten Ton sonst wie ein Mikrofon: Rauschunterdrueckung und automatische
       * Pegelregelung zerhacken Spielton und Schuesse ("die Audioqualitaet ist komplett schlecht"). Roh, in
       * Stereo, 48 kHz. Systemton gibt es nur beim Teilen des ganzen Bildschirms; dieses Fenster selbst wird
       * in der Auswahl nicht angeboten.
       */
      const strom = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: q.breite }, height: { ideal: q.hoehe }, frameRate: { ideal: q.fps, max: q.fps },
          displaySurface: 'monitor',
        } as MediaTrackConstraints,
        audio: {
          echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, sampleRate: 48000,
        } as MediaTrackConstraints,
        ...({ systemAudio: 'include', selfBrowserSurface: 'exclude', surfaceSwitching: 'include' } as object),
      });
      let sendeStrom = strom;
      if (mitMikro) {
        try { sendeStrom = await mitMikrofon(strom); }
        catch { setFehler(t('Das Mikrofon ließ sich nicht öffnen — es wird ohne Mikrofon gesendet. Erlaube den Zugriff in der Adresszeile bzw. in den Windows-Datenschutz-Einstellungen.')); }
      }
      startSenden(sendeStrom, mein.qualitaet);
    } catch (e) {
      const name = (e as DOMException).name;
      // "Abbrechen" im Auswahlfenster ist kein Fehler.
      if (name !== 'NotAllowedError' && name !== 'AbortError') setFehler(t('Das Bild lässt sich nicht teilen.'));
    }
  };
  /** Ein Testbild statt des Spielfensters - zum Ausprobieren (siehe app/pov/sender.ts). */
  const testbildSenden = () => {
    if (!mein) return;
    setFehler('');
    startSenden(testbildStrom(mein.qualitaet, mein.name), mein.qualitaet);
  };
  const teilenStoppen = () => holeAktiv()?.stop();

  const discordZuweisen = (t: { id: string; anzeige: string; name: string }) => {
    setDiscord({ id: t.id, name: t.anzeige || t.name, auto: false, stand: null });
    setDSuche(''); setDTreffer([]);
    aendere({ discordId: t.id });
  };
  const discordEntfernen = () => {
    setDiscord(null);
    aendere({ discordId: '' });
  };
  const teilt = teilen?.art === 'laeuft';
  // Im Programm (CompHub POV): dem Symbol im Infobereich sagen, ob gerade uebertragen wird.
  const imProgramm = typeof window !== 'undefined' && Boolean((window as unknown as { comphubApp?: unknown }).comphubApp);
  useEffect(() => {
    (window as unknown as { comphubApp?: { live: (an: boolean) => void } }).comphubApp?.live(teilt);
  }, [teilt]);

  const discordStreamt = Boolean(discord?.stand?.streamt);
  useEffect(() => {
    if (!discordStreamt) {
      // Der Discord-Stream ist zu Ende: ein von selbst gestartetes POV endet mit ihm.
      if (autoGestartet.current && teilt) teilenStoppen();
      autoGestartet.current = false; autoSitzung.current = false;
      return;
    }
    if (!imProgramm || !autoDiscord || teilt || autoSitzung.current || !mein) return;
    autoSitzung.current = true; // einmal je Discord-Sitzung - wer es selbst beendet, wird nicht wieder gestartet
    autoGestartet.current = true;
    (window as unknown as { comphubApp?: { auto?: (an: boolean) => void } }).comphubApp?.auto?.(true);
    void teilenStarten();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discordStreamt, imProgramm, autoDiscord, teilt, mein]);

  const erlaubt = useMemo(() => new Set(mein?.erlaubt ?? []), [mein?.erlaubt]);
  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return q ? vips.filter((v) => v.name.toLowerCase().includes(q)) : vips;
  }, [vips, suche]);

  /** Eine Person kann als Konto und als Zugang auftreten - angehakt ist sie, sobald eine ihrer Kennungen frei ist. */
  const gewaehlt = (v: Vip) => v.auch.some((i) => erlaubt.has(i));
  const umschalten = (v: Vip) => {
    const neu = new Set(erlaubt);
    if (gewaehlt(v)) v.auch.forEach((i) => neu.delete(i)); else v.auch.forEach((i) => neu.add(i));
    aendere({ erlaubt: [...neu] });
  };

  const bildWaehlen = (datei: File) => {
    const leser = new FileReader();
    leser.onload = () => {
      const roh = new Image();
      roh.onload = () => {
        const K = 256;
        const flaeche = document.createElement('canvas');
        flaeche.width = K; flaeche.height = K;
        const stift = flaeche.getContext('2d');
        if (!stift) return;
        const kante = Math.min(roh.width, roh.height);
        stift.drawImage(roh, (roh.width - kante) / 2, (roh.height - kante) / 2, kante, kante, 0, 0, K, K);
        aendere({ bild: flaeche.toDataURL('image/webp', 0.85) });
      };
      roh.src = String(leser.result);
    };
    leser.readAsDataURL(datei);
  };

  /* ------------------------------------------------------------ Bild */
  const feld = 'mv-fl w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500';

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1300px] px-4 py-6">
        {/* Kopf im neuen Design (14.10.2026): Flaeche mit Leuchten, Name gross, die Knoepfe als Kapseln. */}
        <section className="relative mb-5 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-[0_10px_30px_rgba(15,23,42,.18)] sm:p-8">
        <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-sky-500/25 blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-500"><T>Dashboard</T></p>
            <h1 className="mt-1 truncate text-3xl font-extrabold text-white sm:text-4xl">{mein?.name ?? ''}
              <span className="ml-3 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 align-middle text-xs font-semibold text-sky-400">Pro</span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {stand === 'speichert' && <span><T>speichert …</T></span>}
            {stand === 'gespeichert' && <span className="text-emerald-400"><T>Gespeichert</T></span>}
            {/* Das Programm fuer Windows - im Programm selbst ist der Knopf ueberfluessig. */}
            {!imProgramm && (
              <a href="/api/pov/app"
                title={t('Das Dashboard als Windows-Programm: läuft im Hintergrund weiter, die Anmeldung bleibt gespeichert.')}
                className="rounded-full border border-sky-500/50 px-4 py-2 font-semibold text-sky-400 transition hover:bg-sky-500/10">
                <T>Programm für Windows laden</T>
              </a>
            )}
            {/* Ein Befehl fuer die Eingabeaufforderung: installiert die neueste Fassung oder aktualisiert eine vorhandene. */}
            {!imProgramm && (
              <button type="button"
                title={t('Kopiert einen Befehl für die Eingabeaufforderung (cmd): installiert oder aktualisiert das Programm ohne Anmeldung. Das Programm aktualisiert sich danach von selbst.')}
                onClick={() => { void navigator.clipboard.writeText(installBefehl()).then(() => { setBefehlKopiert(true); window.setTimeout(() => setBefehlKopiert(false), 4000); }).catch(() => undefined); }}
                className="rounded-full border border-zinc-700 px-4 py-2 font-semibold text-slate-300 transition hover:border-sky-500 hover:text-sky-400">
                {befehlKopiert ? <T>Befehl kopiert — in cmd einfügen</T> : <T>Installieren per Befehl</T>}
              </button>
            )}
            {/* Ein gewoehnlicher Link, kein next/link: der wuerde die Adresse vorab laden - und damit abmelden. */}
            <a href="/api/auth/logout" className="rounded-full border border-zinc-700 px-4 py-2 font-semibold text-slate-300 transition hover:border-sky-500 hover:text-sky-400">
              <T>Abmelden</T>
            </a>
          </div>
        </div>
        </section>

        <div className="mb-5 inline-flex gap-1 rounded-full border border-zinc-800 bg-zinc-900 p-1">
          {(['pov', 'settings'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`rounded-full px-5 py-2 text-sm font-bold transition ${tab === k
                ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
              {k === 'pov' ? 'POV' : t('Einstellungen')}
            </button>
          ))}
        </div>

        {fehler && <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{fehler}</p>}

        {/*
          * Discord: ohne zugewiesenes Konto kann CompHub nicht sehen, dass der Profi im Sprachkanal streamt
          * (Betreiber, 11.10.2026: "ich bin im Live Support und streame, laut Webseite bin ich nicht online").
          */}
        {mein && tab === 'pov' && discord && !discord.id && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
            <span><T>Dein Discord-Konto ist nicht zugewiesen — so sieht CompHub nicht, wenn du in einem Sprachkanal streamst.</T></span>
            <button type="button" onClick={() => setTab('settings')} className="rounded-md border border-amber-400/40 px-3 py-1 text-xs transition hover:bg-amber-500/10">
              <T>Jetzt zuweisen</T>
            </button>
          </div>
        )}
        {mein && tab === 'pov' && discord?.stand?.imKanal && (
          <p className="mb-4 flex items-center gap-2 text-sm text-indigo-300">
            <span className={`h-2 w-2 rounded-full ${discord.stand.streamt ? 'animate-pulse bg-red-500' : 'bg-indigo-400'}`} />
            {discord.stand.streamt ? t('Auf Discord live') : t('Im Discord-Sprachkanal')}{discord.stand.kanalName ? ` · #${discord.stand.kanalName}` : ''}
          </p>
        )}
        {/* Auf Discord live, aber noch nicht auf CompHub: im Browser ein Klick, im Programm von selbst (siehe oben). */}
        {mein && tab === 'pov' && discordStreamt && !teilt && (!imProgramm || !autoDiscord) && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-sm text-sky-200">
            <span><T>Du bist auf Discord live. Teile dasselbe Bild auch hier, damit deine Freigegebenen es auf CompHub sehen statt in Discord.</T></span>
            <button type="button" onClick={() => void teilenStarten()} className="rounded-md bg-sky-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-sky-400">
              <T>Jetzt auch hier senden</T>
            </button>
          </div>
        )}
        {mein && tab === 'pov' && imProgramm && (
          <label className="mb-4 flex cursor-pointer items-center gap-2 text-xs text-slate-400">
            <input type="checkbox" checked={autoDiscord} className="accent-sky-500"
              onChange={(e) => { setAutoDiscord(e.target.checked); try { localStorage.setItem('comphub_pov_auto_discord', e.target.checked ? '1' : '0'); } catch { /* ohne Speicher */ } }} />
            <T>Automatisch auf CompHub senden, sobald ich auf Discord live gehe (Hauptbildschirm mit Ton)</T>
          </label>
        )}
        {!mein && !fehler && <p className="text-sm text-slate-500"><T>Wird geladen …</T></p>}

        {mein && tab === 'pov' && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-5">
              {/* ------------------------------------------- So funktioniert es */}
              <details open className="group rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
                  <T>So funktioniert dein POV</T>
                  <span aria-hidden className="text-slate-500 transition group-open:rotate-180">⌄</span>
                </summary>
                <ol className="mt-3 space-y-2.5 text-xs leading-relaxed text-slate-400">
                  <li><b className="text-slate-200"><T>Programm holen.</T></b> <T>Lade das Windows-Programm oder kopiere den Befehl oben. Es läuft im Hintergrund weiter und aktualisiert sich selbst, nie während einer Übertragung.</T></li>
                  <li><b className="text-slate-200"><T>Freigeben.</T></b> <T>Rechts hakst du die VIPs an, die dein POV sehen dürfen. Nur sie sehen es, nicht öffentlich und nicht auf Twitch.</T></li>
                  <li><b className="text-slate-200"><T>Live gehen.</T></b> <T>„Bild teilen und live gehen“, den Bildschirm wählen und „Systemaudio teilen“ anhaken. Gehst du auf Discord live, startet das Programm das Teilen von selbst. Das Programm muss dafür laufen: Discord gibt ihm das Bild nicht heraus, es teilt denselben Bildschirm gleichzeitig.</T></li>
                  <li><b className="text-slate-200"><T>Mikrofon, wenn du willst.</T></b> <T>Häkchen setzen, dann wird deine Stimme zum Spielton gemischt. Stumm schalten geht mit dem Knopf hier und im Programm mit Strg + Alt + M, auch mitten im Spiel.</T></li>
                  <li><b className="text-slate-200"><T>Wer es sieht.</T></b> <T>Freigegebene VIPs finden dein POV auf der Streams-Seite im Ordner „Pro-POVs“.</T></li>
                </ol>
              </details>

              {/* ------------------------------------------- Bild teilen */}
              <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <h2 className="text-sm font-semibold"><T>Dein POV</T></h2>
                <p className="mt-1 text-xs text-slate-500">
                  <T>Teile dein Spielfenster direkt hier. Nur die VIPs, die du rechts freigibst, sehen es — nicht auf Twitch, nicht öffentlich.</T>
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-4">
                  {teilt ? (
                    <button type="button" onClick={teilenStoppen}
                      className="rounded-lg bg-red-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-red-400">
                      <T>Teilen beenden</T>
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={() => void teilenStarten()}
                        className="rounded-lg bg-sky-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-sky-400">
                        <T>Bild teilen und live gehen</T>
                      </button>
                      <button type="button" onClick={testbildSenden}
                        title={t('Sendet Farbbalken und eine Uhr statt deines Spiels — zum Ausprobieren. Du siehst es danach auf der Streams-Seite.')}
                        className="rounded-lg border border-zinc-700 px-4 py-3 text-sm text-slate-300 transition hover:border-sky-500 hover:text-sky-400">
                        <T>Testbild senden</T>
                      </button>
                    </>
                  )}
                  <div className="text-xs">
                    <p className={teilt ? 'flex items-center gap-1.5 font-semibold text-red-400' : 'text-slate-500'}>
                      {teilt && <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />}
                      {teilt ? t('Du bist live') : t('Nicht live')}
                    </p>
                    {teilt && (
                      <p className="mt-0.5 tabular-nums text-slate-500">
                        {zuschauerJetzt} <T>Zuschauer</T> · {teilen?.kbit ?? 0} kbit/s
                        {(teilen?.warten ?? 0) > 1 && <span className="ml-2 text-amber-300"><T>Verbindung zu langsam</T></span>}
                      </p>
                    )}
                    {teilt && (
                      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                        {teilen?.ton ? (
                          <>
                            <span className="text-emerald-400"><T>Ton wird geteilt</T></span>
                            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800">
                              <span className="block h-full rounded-full bg-emerald-400 transition-all duration-100"
                                style={{ width: `${Math.round((teilen.pegel ?? 0) * 100)}%` }} />
                            </span>
                          </>
                        ) : (
                          <span className="text-amber-300"><T>Kein Ton — beim Teilen den ganzen Bildschirm wählen und „Systemaudio teilen" anhaken.</T></span>
                        )}
                      </div>
                    )}
                    {teilt && teilen?.weg === 'stuecke' && (
                      <p className="mt-1 text-[11px] text-amber-300"><T>Dein Browser kann den schnellen Weg nicht — mit Chrome oder Edge ist die Verzögerung deutlich kleiner.</T></p>
                    )}
                    {teilen?.art === 'fehler' && <p className="mt-0.5 text-rose-300">{teilen.text}</p>}
                  </div>
                </div>

                {/* Das Mikrofon: vor dem Teilen ein Haken, waehrend der Uebertragung ein Knopf zum Stummschalten. */}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {!teilt ? (
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                      <input type="checkbox" checked={mitMikro} className="accent-sky-500"
                        onChange={(e) => { setMitMikro(e.target.checked); try { localStorage.setItem('comphub_pov_mikro', e.target.checked ? '1' : '0'); } catch { /* ohne Speicher */ } }} />
                      <T>Mein Mikrofon mitsenden</T>
                      <span className="text-slate-500"><T>(mitten in der Übertragung stumm schaltbar)</T></span>
                    </label>
                  ) : mikro.da ? (
                    <button type="button" onClick={() => setzeMikroStumm(!mikro.stumm)}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold transition ${mikro.stumm
                        ? 'border-red-500/60 bg-red-500/10 text-red-300 hover:bg-red-500/20' : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'}`}>
                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="7" y="2" width="6" height="10" rx="3" /><path d="M4 9.5a6 6 0 0 0 12 0M10 15.5V18" />
                        {mikro.stumm && <path d="M3 3l14 14" />}
                      </svg>
                      {mikro.stumm ? <T>Mikrofon ist stumm — einschalten</T> : <T>Mikrofon ist an — stumm schalten</T>}
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-500"><T>Ohne Mikrofon</T></span>
                  )}
                  {imProgramm && mikro.da && <span className="text-[11px] text-slate-500"><T>Im Programm auch mit Strg + Alt + M, selbst im Spiel.</T></span>}
                </div>

                {teilt && (
                  <div className="mt-4">
                    <video ref={vorschau} autoPlay muted playsInline className="aspect-video w-full max-w-sm rounded-lg border border-zinc-800 bg-black" />
                    <p className="mt-1.5 text-[11px] text-slate-600"><T>Lass diesen Tab offen. Beim Wechseln zu anderen Seiten dieser Webseite läuft das Teilen weiter; Tab schließen oder Neuladen beendet es.</T></p>
                  </div>
                )}
                {!teilt && (
                  <p className="mt-3 text-[11px] text-slate-600">
                    <T>Im Auswahlfenster „Fenster" oder „Bildschirm" wählen — für den Ton „Systemaudio teilen" anhaken. Die Qualität darunter gilt, bis du das Teilen beendest.</T>
                  </p>
                )}
              </section>

              {/* ------------------------------------------- Qualitaet */}
              <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <h2 className="text-sm font-semibold"><T>Qualität</T></h2>
                <p className="mt-1 text-xs text-slate-500"><T>Gilt für das, was du hier teilst. Weniger Bitrate heißt weniger Datenverkehr und eine leichtere Verbindung; zum Ändern kurz beenden und neu teilen.</T></p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {QUALITAETEN.map((q) => (
                    <button key={q.wert} type="button" disabled={teilt} onClick={() => aendere({ qualitaet: q.wert })}
                      className={`rounded-lg border px-3 py-3 text-left transition disabled:opacity-60 ${mein.qualitaet === q.wert
                        ? 'border-sky-500 bg-sky-500/10' : 'border-zinc-800 hover:border-zinc-600'}`}>
                      <span className="block text-sm font-semibold">{t(q.titel)}</span>
                      <span className="mt-1 block text-[11px] leading-snug text-slate-500">{t(q.text)}</span>
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* ------------------------------------------- Wer sehen darf */}
            <section className="h-fit rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold"><T>Wer dein POV sehen darf</T></h2>
                <span className="text-xs tabular-nums text-slate-500">{vips.filter(gewaehlt).length} / {vips.length}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500"><T>Alle VIPs von CompHub. Hake einzeln an, wer dein POV auf der Streams-Seite sehen darf.</T></p>
              <input value={suche} onChange={(e) => setSuche(e.target.value)} spellCheck={false} placeholder={t('VIP suchen …')} className={`mt-3 ${feld}`} />
              <div className="mt-2 flex gap-3 text-[11px]">
                <button type="button" className="text-slate-400 transition hover:text-sky-400"
                  onClick={() => aendere({ erlaubt: [...new Set([...erlaubt, ...gefiltert.flatMap((v) => v.auch)])] })}>
                  <T>Alle auswählen</T>
                </button>
                <button type="button" className="text-slate-400 transition hover:text-sky-400" onClick={() => aendere({ erlaubt: [] })}>
                  <T>Keinen</T>
                </button>
              </div>
              <ul className="mt-3 max-h-[520px] space-y-1 overflow-y-auto pr-1">
                {gefiltert.map((v) => (
                  <li key={v.ident}>
                    <label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${gewaehlt(v)
                      ? 'border-sky-500/50 bg-sky-500/10' : 'border-zinc-800 hover:border-zinc-600'}`}>
                      <input type="checkbox" checked={gewaehlt(v)} onChange={() => umschalten(v)} className="accent-sky-500" />
                      <span className="min-w-0 flex-1 truncate">{v.name}</span>
                    </label>
                  </li>
                ))}
                {gefiltert.length === 0 && <li className="py-4 text-center text-xs text-slate-500"><T>Keine VIPs gefunden</T></li>}
              </ul>
            </section>
          </div>
        )}

        {mein && tab === 'settings' && (
          <section className="max-w-xl rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h2 className="text-sm font-semibold"><T>Profilbild</T></h2>
            <p className="mt-1 text-xs text-slate-500"><T>Es erscheint im Namensbanner deines POVs — bei Zuschauern, die „Mit Profilbild" eingestellt haben. Ohne eigene Wahl ist es dein Spielerfoto.</T></p>
            <div className="mt-4 flex items-center gap-4">
              {mein.bild
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={mein.bild} alt="" className="h-16 w-16 rounded-full border border-zinc-700 object-cover" />
                : <span className="grid h-16 w-16 place-items-center rounded-full border border-zinc-700 bg-zinc-900 text-lg font-semibold text-slate-500">{mein.name.slice(0, 1).toUpperCase()}</span>}
              <label className="cursor-pointer rounded-lg border border-zinc-700 px-4 py-2 text-sm text-slate-200 transition hover:border-sky-500 hover:text-sky-400">
                <T>Bild wählen</T>
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) bildWaehlen(f); }} />
              </label>
              {bildEigen
                ? (
                  <button type="button" onClick={() => aendere({ bild: null })} className="text-xs text-slate-500 transition hover:text-sky-400">
                    <T>Auf Standard zurücksetzen</T>
                  </button>
                )
                : mein.bild && <span className="text-xs text-slate-500"><T>Standard: dein Spielerfoto</T></span>}
            </div>
            <h2 className="mt-8 text-sm font-semibold"><T>Discord-Konto</T></h2>
            <p className="mt-1 text-xs text-slate-500">
              <T>Wähle dein Konto im CompHub-Discord. Gehst du dort in einen Sprachkanal und teilst deinen Bildschirm („Live gehen"), sehen freigegebene VIPs auf der Streams-Seite „Live auf Discord" mit einem Knopf, der den Kanal öffnet.</T>
            </p>
            <div className="mt-3">
              {discord?.id ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm">
                  <span className="font-semibold text-indigo-300">{discord.name || discord.id}</span>
                  {discord.auto && <span className="text-[11px] text-slate-500"><T>verknüpftes Konto</T></span>}
                  <span className="flex-1" />
                  {discord.stand?.imKanal
                    ? (
                      <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {discord.stand.streamt ? t('Im Sprachkanal und streamt') : t('Im Sprachkanal')}
                        {discord.stand.gildenName ? ` · ${discord.stand.gildenName}` : ''}{discord.stand.kanalName ? ` · #${discord.stand.kanalName}` : ''}
                      </span>
                    )
                    : <span className="text-[11px] text-slate-500"><T>Gerade in keinem Sprachkanal</T></span>}
                  {!discord.auto && (
                    <button type="button" onClick={discordEntfernen} className="text-xs text-slate-500 transition hover:text-rose-400">
                      <T>Entfernen</T>
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500"><T>Noch kein Discord-Konto zugewiesen.</T></p>
              )}
              <input value={dSuche} onChange={(e) => setDSuche(e.target.value)} spellCheck={false}
                placeholder={t('Discord-Namen suchen …')} className={`mt-3 ${feld}`} />
              {dTreffer.length > 0 && (
                <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                  {dTreffer.map((x) => (
                    <li key={x.id}>
                      <button type="button" onClick={() => discordZuweisen(x)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-800 px-3 py-2 text-left text-sm transition hover:border-indigo-400/60">
                        <span className="truncate">{x.anzeige || x.name}</span>
                        <span className="shrink-0 text-[11px] text-slate-500">@{x.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {dSuche.trim().length >= 3 && dTreffer.length === 0 && (
                <p className="mt-2 text-[11px] text-slate-600"><T>Kein Mitglied gefunden — du musst im CompHub-Discord sein.</T></p>
              )}
            </div>

            <h2 className="mt-8 text-sm font-semibold"><T>Discord-Server</T></h2>
            <p className="mt-1 text-xs text-slate-500">
              <T>CompHub kann auf Discord-Servern ankündigen, wenn du live gehst. Lade CompHub auf einen Server ein — es legt dort den Kanal „comphub-dashboard" an, in dem ein Server-Admin festlegt, wohin die Meldungen kommen. Hier wählst du, auf welchen Servern dein POV angekündigt wird. Das Bild selbst sehen nur deine Freigegebenen auf CompHub.</T>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {gilden?.einladung && (
                <a href={gilden.einladung} target="_blank" rel="noreferrer"
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400">
                  <T>CompHub zu einem Server einladen</T>
                </a>
              )}
              <button type="button" onClick={gildenLaden} className="text-xs text-slate-500 transition hover:text-sky-400">
                <T>Neu prüfen</T>
              </button>
            </div>
            {gildenFehler && <p className="mt-2 text-xs text-amber-300">{gildenFehler}</p>}
            {gilden && (
              <ul className="mt-3 space-y-2">
                {gilden.liste.map((g) => {
                  const an = (mein.gilden ?? []).includes(g.id);
                  return (
                    <li key={g.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate font-semibold">{g.name}</span>
                      {g.fehler
                        ? <span className="text-[11px] text-amber-300"><T>CompHub fehlt die Berechtigung „Kanäle verwalten"</T></span>
                        : g.kanal
                          ? <span className="text-[11px] text-emerald-400"><T>Meldungs-Kanal gewählt</T></span>
                          : <span className="text-[11px] text-slate-500"><T>Noch kein Meldungs-Kanal — ein Server-Admin wählt ihn in #comphub-dashboard</T></span>}
                      <button type="button" role="switch" aria-checked={an}
                        onClick={() => aendere({ gilden: an ? (mein.gilden ?? []).filter((x) => x !== g.id) : [...(mein.gilden ?? []), g.id] })}
                        className="flex items-center gap-2 text-xs text-slate-300">
                        <span>{an ? t('Ankündigen an') : t('Ankündigen aus')}</span>
                        <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${an ? 'bg-sky-500' : 'bg-zinc-600/70'}`}>
                          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${an ? 'left-[18px]' : 'left-0.5'}`} />
                        </span>
                      </button>
                    </li>
                  );
                })}
                {gilden.liste.length === 0 && (
                  <li className="text-xs text-slate-500"><T>CompHub ist noch auf keinem Server.</T></li>
                )}
              </ul>
            )}
            <p className="mt-6 text-xs text-slate-500">
              <T>Deinen Namen und dein Passwort änderst du unter</T>{' '}
              <Link href="/account" className="text-sky-400 hover:text-sky-300"><T>Konto</T></Link>.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
