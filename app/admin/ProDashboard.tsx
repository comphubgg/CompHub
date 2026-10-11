'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import type { PovPro, PovHud, PovQualitaet, HudOrt } from '@/lib/pov';
import { HudBanner } from '@/app/components/PovHud';
import { QUALITAET, abonniere, holeAktiv, startSenden, type Zustand } from '@/app/pov/sender';

/*
 * Das Dashboard eines Profis.
 *
 * Der Betreiber (11.10.2026): Profis loggen sich ganz normal ein und sehen "nichts ausser POV und
 * Settings". Unter POV gehen sie live, waehlen aus der Liste der VIPs, wer ihr POV sehen darf, und
 * stellen Qualitaet und ein kleines Namensbanner ein. Alles speichert sich von selbst.
 */

interface Vip { ident: string; name: string }

const QUALITAETEN: Array<{ wert: PovQualitaet; titel: string; text: string }> = [
  { wert: 'max', titel: 'Max', text: '1080p60 · 8000 kbit/s · bestes Bild, etwas mehr Verzögerung' },
  { wert: 'mittel', titel: 'Mittel', text: '720p60 · 4500 kbit/s · guter Mittelweg' },
  { wert: 'niedrig', titel: 'Niedrig', text: '720p30 · 2500 kbit/s · möglichst wenig Verzögerung' },
];

const ORTE: Array<{ wert: HudOrt; titel: string }> = [
  { wert: 'oben', titel: 'Oben' }, { wert: 'unten', titel: 'Unten' },
  { wert: 'links', titel: 'Links' }, { wert: 'rechts', titel: 'Rechts' },
];

export default function ProDashboard() {
  const t = useT();
  const [tab, setTab] = useState<'pov' | 'settings'>('pov');
  const [mein, setMein] = useState<PovPro | null>(null);
  const [vips, setVips] = useState<Vip[]>([]);
  const [fehler, setFehler] = useState('');
  const [stand, setStand] = useState<'' | 'speichert' | 'gespeichert'>('');
  const [suche, setSuche] = useState('');
  const [teilen, setTeilen] = useState<Zustand | null>(() => holeAktiv()?.zustand ?? null);
  const [zuschauerJetzt, setZuschauerJetzt] = useState(0);
  const vorschau = useRef<HTMLVideoElement | null>(null);
  const [webhook, setWebhook] = useState('');
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
        setMein(j.mein as PovPro); setVips(j.vips as Vip[]); setZuschauerJetzt(j.zuschauer ?? 0); setWebhook((j.mein as PovPro).webhook ?? '');
      })
      .catch(() => { if (!weg) setFehler(t('Nicht ladbar')); });
    return () => { weg = true; };
  }, [t]);

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
      setStand('gespeichert');
      setFehler('');
    } catch (e) {
      setFehler((e as Error).message);
      setStand('');
    }
  }, []);

  /** Etwas aendern: sofort sichtbar, kurz darauf gespeichert (alles Aufgelaufene in einem Zug). */
  const aendere = useCallback((teil: Record<string, unknown>) => {
    setMein((alt) => {
      if (!alt) return alt;
      const neu: PovPro = { ...alt, ...(teil as Partial<PovPro>) };
      if (teil.hud) neu.hud = { ...alt.hud, ...(teil.hud as Partial<PovHud>) };
      return neu;
    });
    // Zusammenlegen: ein spaeteres "hud" ergaenzt ein frueheres, statt es zu ersetzen.
    const alt = offen.current;
    offen.current = {
      ...alt, ...teil,
      ...(teil.hud && alt.hud ? { hud: { ...(alt.hud as object), ...(teil.hud as object) } } : {}),
    };
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
      const strom = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: q.breite }, height: { ideal: q.hoehe }, frameRate: { ideal: q.fps, max: q.fps } },
        audio: true,
      });
      startSenden(strom, mein.qualitaet);
    } catch (e) {
      const name = (e as DOMException).name;
      // "Abbrechen" im Auswahlfenster ist kein Fehler.
      if (name !== 'NotAllowedError' && name !== 'AbortError') setFehler(t('Das Bild lässt sich nicht teilen.'));
    }
  };
  const teilenStoppen = () => holeAktiv()?.stop();
  const teilt = teilen?.art === 'laeuft';

  const erlaubt = useMemo(() => new Set(mein?.erlaubt ?? []), [mein?.erlaubt]);
  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return q ? vips.filter((v) => v.name.toLowerCase().includes(q)) : vips;
  }, [vips, suche]);

  const umschalten = (ident: string) => {
    const neu = new Set(erlaubt);
    if (neu.has(ident)) neu.delete(ident); else neu.add(ident);
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
                    <button type="button" onClick={() => void teilenStarten()}
                      className="rounded-lg bg-sky-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-sky-400">
                      <T>Bild teilen und live gehen</T>
                    </button>
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

              {/* ------------------------------------------- HUD */}
              <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold"><T>HUD-Banner</T></h2>
                  <button type="button" role="switch" aria-checked={mein.hud.an} onClick={() => aendere({ hud: { an: !mein.hud.an } })}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition ${mein.hud.an ? 'bg-sky-500' : 'bg-zinc-600/70'}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${mein.hud.an ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500"><T>Ein kleines Banner mit deinem Namen auf deinem POV, damit man sofort sieht, wessen POV es ist.</T></p>

                <div className="mt-4 grid gap-5 sm:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-4">
                    <div>
                      <p className="mb-1.5 text-xs text-slate-400"><T>Position</T></p>
                      <div className="flex flex-wrap gap-1.5">
                        {ORTE.map((o) => (
                          <button key={o.wert} type="button" onClick={() => aendere({ hud: { ort: o.wert } })}
                            className={`rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition ${mein.hud.ort === o.wert
                              ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-zinc-800 text-slate-300 hover:border-zinc-600'}`}>
                            {t(o.titel)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={mein.hud.mitBild} className="accent-sky-500"
                        onChange={(e) => aendere({ hud: { mitBild: e.target.checked } })} />
                      <T>Mit Profilbild</T>
                    </label>
                    <label className="block text-xs text-slate-400">
                      <T>Text (leer = dein Name)</T>
                      <input value={mein.hud.text} maxLength={40} onChange={(e) => aendere({ hud: { text: e.target.value } })}
                        placeholder={mein.name} className={`mt-1 ${feld}`} />
                    </label>
                  </div>

                  {/* Vorschau */}
                  <div className="relative aspect-video overflow-hidden rounded-lg border border-zinc-800 bg-gradient-to-br from-zinc-800 to-zinc-950">
                    <span className="absolute inset-0 grid place-items-center text-[11px] uppercase tracking-widest text-zinc-700">POV</span>
                    <HudBanner hud={mein.hud} name={mein.name} bild={mein.bild} />
                  </div>
                </div>
              </section>
            </div>

            {/* ------------------------------------------- Wer sehen darf */}
            <section className="h-fit rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold"><T>Wer dein POV sehen darf</T></h2>
                <span className="text-xs tabular-nums text-slate-500">{erlaubt.size} / {vips.length}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500"><T>Alle VIPs von CompHub. Hake an, wer dein POV auf der Streams-Seite sehen darf.</T></p>
              <input value={suche} onChange={(e) => setSuche(e.target.value)} spellCheck={false} placeholder={t('VIP suchen …')} className={`mt-3 ${feld}`} />
              <div className="mt-2 flex gap-3 text-[11px]">
                <button type="button" className="text-slate-400 transition hover:text-sky-400"
                  onClick={() => aendere({ erlaubt: [...new Set([...erlaubt, ...gefiltert.map((v) => v.ident)])] })}>
                  <T>Alle auswählen</T>
                </button>
                <button type="button" className="text-slate-400 transition hover:text-sky-400" onClick={() => aendere({ erlaubt: [] })}>
                  <T>Keinen</T>
                </button>
              </div>
              <ul className="mt-3 max-h-[520px] space-y-1 overflow-y-auto pr-1">
                {gefiltert.map((v) => (
                  <li key={v.ident}>
                    <label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${erlaubt.has(v.ident)
                      ? 'border-sky-500/50 bg-sky-500/10' : 'border-zinc-800 hover:border-zinc-600'}`}>
                      <input type="checkbox" checked={erlaubt.has(v.ident)} onChange={() => umschalten(v.ident)} className="accent-sky-500" />
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
            <p className="mt-1 text-xs text-slate-500"><T>Es erscheint im HUD-Banner deines POVs, wenn „Mit Profilbild" an ist.</T></p>
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
              {mein.bild && (
                <button type="button" onClick={() => aendere({ bild: null })} className="text-xs text-slate-500 transition hover:text-rose-400">
                  <T>Entfernen</T>
                </button>
              )}
            </div>
            <h2 className="mt-8 text-sm font-semibold">Discord</h2>
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
