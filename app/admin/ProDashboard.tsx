'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import type { PovPro, PovQualitaet } from '@/lib/pov';
import { QUALITAET, abonniere, holeAktiv, startSenden, testbildStrom, type Zustand } from '@/app/pov/sender';

/*
 * Das Dashboard eines Profis.
 *
 * Der Betreiber (11.10.2026): Profis loggen sich ganz normal ein und sehen "nichts ausser POV und
 * Settings". Unter POV gehen sie live, waehlen aus der Liste der VIPs - einzeln -, wer ihr POV sehen darf,
 * und stellen die Qualitaet ein. Unter Einstellungen: Profilbild (ohne eigene Wahl ihr Spielerfoto) und
 * Discord-Webhook. Das Namensbanner stellt nicht der Profi ein, sondern jeder Zuschauer selbst. Alles
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
  const [webhook, setWebhook] = useState('');
  /** Das Discord-Konto: zugewiesen oder (auto) das verknuepfte - und ob der Bot den Profi gerade im Sprachkanal sieht. */
  const [discord, setDiscord] = useState<{
    id: string; name: string; auto: boolean;
    stand: { imKanal: boolean; streamt: boolean; kanalName: string | null } | null;
  } | null>(null);
  const [dSuche, setDSuche] = useState('');
  const [dTreffer, setDTreffer] = useState<Array<{ id: string; name: string; anzeige: string }>>([]);
  const uhr = useRef<number | null>(null);
  const offen = useRef<Record<string, unknown>>({});

  /* -------------------------------------------------------------- Laden */
  useEffect(() => {
    let weg = false;
    fetch('/api/pov?modus=mein', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (weg) return;
        if (!j.ok) { setFehler(j.error ?? t('Nicht ladbar')); return; }
        setMein(j.mein as PovPro); setBildEigen(Boolean(j.bildEigen)); setDiscord(j.discord ?? null); setVips(j.vips as Vip[]); setZuschauerJetzt(j.zuschauer ?? 0); setWebhook((j.mein as PovPro).webhook ?? '');
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
      startSenden(strom, mein.qualitaet);
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
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold"><T>Dashboard</T></h1>
            <p className="mt-0.5 text-sm text-slate-500">{mein?.name ?? ''}
              <span className="ml-2 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-medium text-sky-400">Pro</span>
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {stand === 'speichert' && <span><T>speichert …</T></span>}
            {stand === 'gespeichert' && <span className="text-emerald-400"><T>Gespeichert</T></span>}
            {/* Ein gewoehnlicher Link, kein next/link: der wuerde die Adresse vorab laden - und damit abmelden. */}
            <a href="/api/auth/logout" className="rounded-md border border-zinc-700 px-3 py-1.5 text-slate-300 transition hover:border-sky-500 hover:text-sky-400">
              <T>Abmelden</T>
            </a>
          </div>
        </div>

        <div className="mb-5 flex gap-1.5 border-b border-zinc-800">
          {(['pov', 'settings'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-semibold transition ${tab === k
                ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
              {k === 'pov' ? 'POV' : t('Einstellungen')}
            </button>
          ))}
        </div>

        {fehler && <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{fehler}</p>}
        {!mein && !fehler && <p className="text-sm text-slate-500"><T>Wird geladen …</T></p>}

        {mein && tab === 'pov' && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-5">
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
                        {discord.stand.kanalName ? ` · #${discord.stand.kanalName}` : ''}
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

            <h2 className="mt-8 text-sm font-semibold">Discord-Webhook</h2>
            <p className="mt-1 text-xs text-slate-500">
              <T>Optional: Trage einen Discord-Webhook deines Servers ein (Kanal → Integrationen → Webhooks). Sobald du live gehst, meldet CompHub es dort — das Bild selbst sehen nur deine Freigegebenen auf CompHub.</T>
            </p>
            <input value={webhook} spellCheck={false} placeholder="https://discord.com/api/webhooks/…"
              onChange={(e) => setWebhook(e.target.value)}
              onBlur={() => { if (webhook !== (mein.webhook ?? '')) aendere({ webhook }); }}
              className={`mt-3 ${feld}`} />
            {webhook && !mein.webhook && stand === 'gespeichert' && (
              <p className="mt-2 text-xs text-amber-300"><T>Das ist kein gültiger Discord-Webhook.</T></p>
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
