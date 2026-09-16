'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { useZugang } from '@/app/lib/zugang';
import LadeSchirm from '@/app/components/LadeSchirm';
import { ARTEN, type OverlayEintrag } from '../OverlayGeruest';

/*
 * Das Studio: ein Stream-Bild, auf dem die Overlays liegen.
 *
 * Der Betreiber wollte die Overlay-Seite "komplett neu": "Es ist wirklich
 * einfach ein OBS von der Ansicht - eine Preview vom Stream. Links oben
 * drei Striche, dann kommt eine Leiste von links: Team Card, Standings, Cup
 * Timer, Offspawn, Custom Text, Qual Line. Ich ziehe Standings rein, dann
 * komme ich auf eine Seite, um die Settings einzustellen, dann Save, dann
 * sehe ich die Preview. Dann wieder die drei Striche: Teamcards mittig,
 * alle acht Sekunden ein neues Team. Und wo meine Cam ist, wo mein
 * Gameplay ist, wo eine Werbung ist."
 *
 * Genau so laeuft es hier:
 *
 *   1. Drei Striche links oben - die Leiste schiebt sich von links herein.
 *   2. Ein Klick auf eine Art legt ein Element auf das Bild und oeffnet
 *      gleich seine Einstellungen - die bekannte Seite der Art, hier im
 *      Studio, mit Cup-Auswahl, Reglern und eigener Vorschau.
 *   3. Speichern dort: das Element auf dem Bild zeigt ab sofort dieses
 *      Overlay. Verschieben mit der Maus, die Ecke zieht die Groesse.
 *   4. Cam, Gameplay und Werbung sind Platzhalter - nur hier zu sehen, damit
 *      klar ist, was frei bleiben muss; in OBS erscheinen sie nicht.
 *   5. Die Szene hat eine Adresse fuer OBS. Was hier steht, steht dort.
 *      Sobald die Szene einen Namen hat, speichert sie sich von selbst.
 */

const BREITE = 1920;
const HOEHE = 1080;

interface Element {
  kennung: string;
  /** Eine Overlay-Art aus ARTEN - oder 'hilfe' fuer Cam, Gameplay, Werbung. */
  art: string;
  /** Das gespeicherte Overlay dieser Art - fehlt, solange es nicht eingerichtet ist. */
  overlayId?: string;
  name: string;
  x: number; y: number; w: number; h: number;
}

interface Szene { elemente: Element[] }

const PLATZHALTER: Array<{ name: string; w: number; h: number }> = [
  { name: 'Cam', w: 480, h: 270 },
  { name: 'Gameplay', w: 1280, h: 720 },
  { name: 'Werbung', w: 400, h: 120 },
];

/** Die Standardgroesse je Art - so gross, wie das Overlay gebaut ist. */
const GROESSE: Record<string, [number, number]> = {
  teamkarte: [1920, 260], standings: [420, 620], timer: [520, 140],
  offspawn: [900, 200], text: [900, 120], qual: [700, 110],
};

function neueKennung() {
  return Math.random().toString(36).slice(2, 10);
}

export default function Studio() {
  const t = useT();
  const zugang = useZugang();
  const [leiste, setLeiste] = useState(false);
  const [meine, setMeine] = useState<OverlayEintrag[] | null>(null);
  const [szene, setSzene] = useState<Szene>({ elemente: [] });
  const [szeneId, setSzeneId] = useState<string | null>(null);
  const [szeneName, setSzeneName] = useState('');
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [offeneArt, setOffeneArt] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState('');
  const [laedt, setLaedt] = useState(true);
  /** Welches Element gerade eingestellt wird - und die Seite dazu. */
  const [einstellung, setEinstellung] = useState<{ kennung: string; url: string; titel: string } | null>(null);
  /** Zaehlt hoch, wenn ein Overlay gespeichert wurde - die Buehne laedt es dann neu. */
  const [frisch, setFrisch] = useState(0);
  const buehne = useRef<HTMLDivElement>(null);
  const [massstab, setMassstab] = useState(0.5);

  /* ------------------------------------------------- Meine Overlays und Szenen */
  const laden = useCallback(async () => {
    try {
      const j = await (await fetch('/api/overlay-config?meine=1', { cache: 'no-store' })).json();
      setMeine(j.overlays ?? []);
    } catch { setMeine([]); }
    finally { setLaedt(false); }
  }, []);
  useEffect(() => { void laden(); }, [laden]);

  const szenen = useMemo(() => (meine ?? []).filter((o) => o.typ === 'szene'), [meine]);
  const overlaysDerArt = useCallback((art: string) =>
    (meine ?? []).filter((o) => o.typ === art), [meine]);

  /*
   * Die zuletzt geoeffnete Szene beim naechsten Mal wieder aufschlagen -
   * sonst steht man jedes Mal vor einem leeren Bild.
   */
  const ersterStand = useRef(true);
  useEffect(() => {
    if (!meine || szeneId) return;
    let letzte: string | null = null;
    try { letzte = localStorage.getItem('comphub-studio-szene'); } catch { /* egal */ }
    const o = szenen.find((x) => x.id === letzte) ?? szenen[0];
    if (o) {
      const cfg = o.config as unknown as Szene;
      ersterStand.current = true;
      setSzene({ elemente: Array.isArray(cfg?.elemente) ? cfg.elemente : [] });
      setSzeneId(o.id); setSzeneName(o.name);
    }
    // Nur beim ersten Laden - danach entscheidet der Klick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meine]);

  /* ------------------------------------------------- Die Buehne verkleinern */
  useEffect(() => {
    const messen = () => {
      const el = buehne.current?.parentElement;
      if (!el) return;
      const frei = el.clientWidth - 24;
      setMassstab(Math.min(frei / BREITE, (window.innerHeight - 120) / HOEHE));
    };
    messen();
    window.addEventListener('resize', messen);
    return () => window.removeEventListener('resize', messen);
  }, []);

  /* ------------------------------------------------- Einstellungen einer Art */
  const seite = (art: string) => ARTEN.find((a) => a.schluessel === art);
  const datei = (art: string) => seite(art)?.datei ?? '';

  /** Die Einstellungsseite zu einem Element oeffnen - neu oder mit Kennung. */
  const einstellen = (el: Element) => {
    const a = seite(el.art);
    if (!a) return;
    const p = new URLSearchParams({ eingebettet: '1' });
    if (el.overlayId) p.set('id', el.overlayId);
    else if (a.ohneCup) p.set('bauen', '1');
    setEinstellung({ kennung: el.kennung, url: `${a.pfad}?${p.toString()}`, titel: a.titel });
    setLeiste(false);
  };

  /* ------------------------------------------------- Elemente */
  const hinzufuegen = (art: string, o?: OverlayEintrag, platzhalter?: { name: string; w: number; h: number }) => {
    const [w, h] = platzhalter ? [platzhalter.w, platzhalter.h] : (GROESSE[art] ?? [600, 200]);
    const n = szene.elemente.length;
    const el: Element = {
      kennung: neueKennung(), art: platzhalter ? 'hilfe' : art,
      overlayId: o?.id, name: platzhalter ? platzhalter.name : (o?.name ?? (seite(art)?.titel ?? art)),
      x: Math.min(60 + n * 30, BREITE - w), y: Math.min(60 + n * 30, HOEHE - h), w, h,
    };
    setSzene((s) => ({ elemente: [...s.elemente, el] }));
    setGewaehlt(el.kennung);
    setLeiste(false);
    // Ein neues Overlay wird gleich eingerichtet - so wollte es der Betreiber:
    // "dann komme ich auf eine Seite, um die Settings einzustellen."
    if (!platzhalter && !o) einstellen(el);
  };
  const entfernen = (kennung: string) => {
    setSzene((s) => ({ elemente: s.elemente.filter((e) => e.kennung !== kennung) }));
    setGewaehlt(null);
  };
  const nachVorn = (kennung: string) => {
    setSzene((s) => {
      const e = s.elemente.find((x) => x.kennung === kennung);
      if (!e) return s;
      return { elemente: [...s.elemente.filter((x) => x.kennung !== kennung), e] };
    });
  };

  /*
   * Die Einstellungsseite meldet, wenn sie gespeichert hat. Dann gehoert
   * das Overlay zum Element, die Buehne laedt es neu, und die Seite geht
   * zu - "dann Save, dann sehe ich die Preview."
   */
  useEffect(() => {
    const horchen = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const d = ev.data as { comphub?: string; typ?: string; id?: string; name?: string } | null;
      if (!d || d.comphub !== 'overlay-gespeichert' || !d.id) return;
      setEinstellung((offen) => {
        if (offen) {
          setSzene((s) => ({
            elemente: s.elemente.map((el) => el.kennung === offen.kennung
              ? { ...el, overlayId: d.id, name: d.name || el.name } : el),
          }));
        }
        return null;
      });
      setFrisch((n) => n + 1);
      void laden();
    };
    window.addEventListener('message', horchen);
    return () => window.removeEventListener('message', horchen);
  }, [laden]);

  /* ------------------------------------------------- Ziehen und Groesse */
  const zug = useRef<{ kennung: string; art: 'schieben' | 'ziehen'; x0: number; y0: number;
    start: Element } | null>(null);
  const beginne = (e: React.PointerEvent, el: Element, art: 'schieben' | 'ziehen') => {
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    zug.current = { kennung: el.kennung, art, x0: e.clientX, y0: e.clientY, start: { ...el } };
    setGewaehlt(el.kennung);
  };
  const bewege = (e: React.PointerEvent) => {
    const z = zug.current;
    if (!z) return;
    const dx = (e.clientX - z.x0) / massstab;
    const dy = (e.clientY - z.y0) / massstab;
    setSzene((s) => ({
      elemente: s.elemente.map((el) => {
        if (el.kennung !== z.kennung) return el;
        if (z.art === 'schieben') {
          return {
            ...el,
            x: Math.round(Math.max(0, Math.min(BREITE - el.w, z.start.x + dx))),
            y: Math.round(Math.max(0, Math.min(HOEHE - el.h, z.start.y + dy))),
          };
        }
        return {
          ...el,
          w: Math.round(Math.max(80, Math.min(BREITE - el.x, z.start.w + dx))),
          h: Math.round(Math.max(40, Math.min(HOEHE - el.y, z.start.h + dy))),
        };
      }),
    }));
  };
  const [losgelassen, setLosgelassen] = useState(0);
  const beende = () => {
    if (zug.current) setLosgelassen((n) => n + 1);
    zug.current = null;
  };

  /* ------------------------------------------------- Speichern und Laden */
  const speichern = useCallback(async (still = false) => {
    const name = szeneName.trim() || t('Meine Szene');
    if (!still) setGespeichert('');
    const r = await fetch('/api/overlay-config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: szeneId ?? undefined, typ: 'szene', name, config: szene }),
    });
    const j = await r.json();
    if (!r.ok) { setGespeichert(j?.error ?? t('Konnte nicht speichern')); return; }
    setSzeneId(j.id); setSzeneName(name);
    setGespeichert('ok');
    try { localStorage.setItem('comphub-studio-szene', j.id); } catch { /* egal */ }
    if (!still) await laden();
  }, [szene, szeneId, szeneName, t, laden]);

  /*
   * Eine Szene, die schon einen Namen hat, speichert sich von selbst - der
   * Betreiber will keinen Speichern-Knopf druecken muessen, um etwas zu
   * behalten. Kurz gewartet, und waehrend des Ziehens gar nicht - erst
   * wenn die Maus losgelassen ist.
   */
  useEffect(() => {
    if (ersterStand.current) { ersterStand.current = false; return; }
    if (!szeneId || zug.current) return;
    const z = setTimeout(() => { void speichern(true); }, 800);
    return () => clearTimeout(z);
    // Nur die Szene selbst und das Loslassen sollen ausloesen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [szene, losgelassen]);

  const oeffneSzene = (o: OverlayEintrag) => {
    const cfg = o.config as unknown as Szene;
    ersterStand.current = true;
    setSzene({ elemente: Array.isArray(cfg?.elemente) ? cfg.elemente : [] });
    setSzeneId(o.id); setSzeneName(o.name); setGewaehlt(null); setLeiste(false);
    try { localStorage.setItem('comphub-studio-szene', o.id); } catch { /* egal */ }
  };
  const neueSzene = () => {
    ersterStand.current = true;
    setSzene({ elemente: [] }); setSzeneId(null); setSzeneName(''); setGewaehlt(null);
    setLeiste(false);
    try { localStorage.removeItem('comphub-studio-szene'); } catch { /* egal */ }
  };
  const szeneLoeschen = async (o: OverlayEintrag) => {
    if (!window.confirm(`${t('Szene löschen')}: ${o.name}?`)) return;
    await fetch('/api/overlay-config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: o.id, loeschen: true }),
    }).catch(() => {});
    if (o.id === szeneId) neueSzene();
    await laden();
  };

  const obsAdresse = szeneId && typeof window !== 'undefined'
    ? `${window.location.origin}/overlay/szene.html?id=${szeneId}` : '';
  const ausgewaehlt = szene.elemente.find((e) => e.kennung === gewaehlt) ?? null;

  if (zugang.laedt) return <LadeSchirm />;
  if (!zugang.vip) {
    return (
      <main className="flex-1 bg-zinc-950 px-4 py-16 text-center text-slate-300">
        <p className="text-sm"><T>Die Overlays sind Teil des VIP-Zugangs.</T></p>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col bg-zinc-950 text-slate-200"
      onPointerMove={bewege} onPointerUp={beende}>
      {laedt && <LadeSchirm />}

      {/* Kopf: drei Striche, Name der Szene, Speichern, Adresse */}
      <div className="relative z-30 flex flex-wrap items-center gap-3 border-b border-zinc-900 bg-zinc-950 px-4 py-2">
        <button onClick={() => setLeiste((l) => !l)} title={t('Overlays')} aria-label={t('Overlays')}
          className={`flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-lg border
                      transition ${leiste ? 'border-sky-500 bg-sky-500/10' : 'border-zinc-800 hover:border-sky-500'}`}>
          <span className="h-0.5 w-5 bg-slate-200" /><span className="h-0.5 w-5 bg-slate-200" />
          <span className="h-0.5 w-5 bg-slate-200" />
        </button>
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          <T>Studio</T>
        </span>
        <input value={szeneName} onChange={(e) => setSzeneName(e.target.value)}
          onBlur={() => { if (szeneId && szeneName.trim()) void speichern(true); }}
          placeholder={t('Name der Szene')}
          className="w-48 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-sm
                     text-slate-100 outline-none focus:border-sky-500" />
        {!szeneId ? (
          <button onClick={() => { void speichern(); }}
            className="rounded-lg bg-sky-500 px-4 py-1.5 text-sm font-semibold text-white
                       transition hover:bg-sky-400">
            <T>Speichern</T>
          </button>
        ) : (
          <span className="text-[11px] text-slate-500">
            {gespeichert === 'ok' ? <T>Gespeichert</T> : <T>Speichert von selbst</T>}
          </span>
        )}
        {gespeichert && gespeichert !== 'ok' && <span className="text-xs text-rose-400">{gespeichert}</span>}
        {obsAdresse && (
          <span className="flex items-center gap-2 text-xs text-slate-400">
            <span className="hidden sm:inline"><T>OBS-Adresse</T>:</span>
            <code className="max-w-[26rem] truncate rounded bg-zinc-900 px-2 py-1 text-[11px] text-slate-300">{obsAdresse}</code>
            <button onClick={() => { void navigator.clipboard?.writeText(obsAdresse); }}
              className="rounded border border-zinc-800 px-2 py-1 text-[11px] transition hover:border-sky-500">
              <T>Kopieren</T>
            </button>
          </span>
        )}
        <span className="ml-auto text-[11px] text-slate-600">
          {szene.elemente.length} <T>Elemente</T> · {Math.round(massstab * 100)} %
        </span>
      </div>

      <div className="relative flex-1">
        {/* Die Leiste - sie schiebt sich von links ueber das Bild */}
        <div className={`absolute inset-0 z-20 bg-black/40 transition-opacity ${leiste ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          onClick={() => setLeiste(false)} />
        <aside className={`absolute left-0 top-0 z-20 h-full w-80 max-w-[90vw] overflow-y-auto border-r
                           border-zinc-800 bg-zinc-950 px-3 py-3 shadow-2xl transition-transform duration-200
                           ${leiste ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="space-y-5">
            <div>
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <T>Auf das Bild legen</T>
              </p>
              {ARTEN.map((a) => {
                const liste = overlaysDerArt(a.schluessel);
                const offen = offeneArt === a.schluessel;
                return (
                  <div key={a.schluessel} className="mb-1 rounded-lg border border-zinc-900">
                    <div className="flex items-stretch">
                      <button onClick={() => hinzufuegen(a.schluessel)} title={t(a.was)}
                        className="flex min-w-0 flex-1 flex-col px-3 py-2 text-left transition hover:bg-zinc-900/70">
                        <span className="text-sm font-semibold text-slate-100">+ {a.titel}</span>
                        <span className="truncate text-[11px] text-slate-500">{t(a.was)}</span>
                      </button>
                      {liste.length > 0 && (
                        <button onClick={() => setOffeneArt(offen ? null : a.schluessel)}
                          title={t('Gespeicherte')}
                          className={`shrink-0 border-l border-zinc-900 px-3 text-[11px] tabular-nums transition
                                      ${offen ? 'bg-zinc-900 text-sky-400' : 'text-slate-500 hover:text-sky-400'}`}>
                          {liste.length} ▾
                        </button>
                      )}
                    </div>
                    {offen && (
                      <div className="border-t border-zinc-900 px-2 py-1">
                        <p className="px-1 py-0.5 text-[10px] uppercase tracking-wider text-slate-600">
                          <T>Gespeicherte</T>
                        </p>
                        {liste.map((o) => (
                          <button key={o.id} onClick={() => hinzufuegen(a.schluessel, o)}
                            className="block w-full truncate rounded px-2 py-1 text-left text-xs
                                       text-slate-300 transition hover:bg-zinc-900 hover:text-sky-400">
                            + {o.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div>
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <T>Platzhalter</T>
              </p>
              <p className="mb-1 px-1 text-[11px] leading-snug text-slate-600">
                <T>Nur hier sichtbar, nicht in OBS: wo Cam, Gameplay und Werbung liegen.</T>
              </p>
              {PLATZHALTER.map((p) => (
                <button key={p.name} onClick={() => hinzufuegen('hilfe', undefined, p)}
                  className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-slate-300
                             transition hover:bg-zinc-900/60 hover:text-sky-400">
                  + <T>{p.name}</T>
                </button>
              ))}
            </div>

            <div>
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <T>Meine Szenen</T>
              </p>
              <button onClick={neueSzene}
                className="mb-1 w-full rounded-lg border border-dashed border-zinc-700 px-3 py-1.5
                           text-left text-xs text-slate-400 transition hover:border-sky-500">
                + <T>Neue Szene</T>
              </button>
              {szenen.map((o) => (
                <div key={o.id} className={`flex items-center rounded-lg ${
                  o.id === szeneId ? 'bg-zinc-900' : 'hover:bg-zinc-900/60'}`}>
                  <button onClick={() => oeffneSzene(o)}
                    className={`min-w-0 flex-1 truncate px-3 py-1.5 text-left text-xs transition ${
                      o.id === szeneId ? 'text-sky-400' : 'text-slate-300'}`}>
                    {o.name}
                  </button>
                  <button onClick={() => { void szeneLoeschen(o); }} title={t('Szene löschen')}
                    className="px-2 text-[11px] text-slate-600 transition hover:text-rose-400">×</button>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Die Buehne */}
        <div className="min-w-0 p-3" onPointerDown={() => setGewaehlt(null)}>
          <div ref={buehne}
            className="relative mx-auto overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 shadow-2xl"
            style={{
              width: BREITE * massstab, height: HOEHE * massstab,
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
              backgroundSize: `${120 * massstab}px ${120 * massstab}px`,
            }}>
            <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] uppercase
                             tracking-[0.2em] text-zinc-700">1920 × 1080</span>

            {szene.elemente.map((el) => {
              const aktiv = el.kennung === gewaehlt;
              return (
                <div key={el.kennung}
                  onPointerDown={(e) => beginne(e, el, 'schieben')}
                  onDoubleClick={() => { if (el.art !== 'hilfe') einstellen(el); }}
                  className={`absolute cursor-move select-none rounded-sm ${
                    aktiv ? 'ring-2 ring-sky-500' : 'ring-1 ring-white/10 hover:ring-sky-500/60'}`}
                  style={{ left: el.x * massstab, top: el.y * massstab, width: el.w * massstab, height: el.h * massstab }}>
                  {el.art === 'hilfe' ? (
                    <div className="flex h-full w-full items-center justify-center border border-dashed
                                    border-amber-500/50 bg-amber-500/5 text-xs font-semibold uppercase
                                    tracking-[0.2em] text-amber-400/80">
                      <T>{el.name}</T>
                    </div>
                  ) : !el.overlayId ? (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 border
                                    border-dashed border-sky-500/50 bg-sky-500/5 text-center">
                      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400/80">{el.name}</span>
                      <span className="text-[10px] text-slate-500"><T>Noch nicht eingerichtet</T></span>
                    </div>
                  ) : (
                    <>
                      {/* Das Overlay selbst, verkleinert - ohne Mauszugriff, sonst laesst es sich nicht ziehen. */}
                      <iframe key={frisch} title={el.name}
                        src={`/overlay/${datei(el.art)}?id=${el.overlayId}&v=${frisch}`}
                        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
                        style={{ width: el.w, height: el.h, transform: `scale(${massstab})` }} />
                      <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px]
                                       text-slate-300">{el.name}</span>
                    </>
                  )}
                  {aktiv && (
                    <>
                      <div onPointerDown={(e) => beginne(e, el, 'ziehen')}
                        className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-sm
                                   bg-sky-500" />
                      <div className="absolute -top-8 left-0 flex gap-1" onPointerDown={(e) => e.stopPropagation()}>
                        {el.art !== 'hilfe' && (
                          <button onClick={() => einstellen(el)}
                            className="rounded bg-sky-500 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-sky-400">
                            {el.overlayId ? <T>Einstellungen</T> : <T>Einrichten</T>}
                          </button>
                        )}
                        <button onClick={() => nachVorn(el.kennung)}
                          className="rounded bg-zinc-900 px-2 py-1 text-[11px] text-slate-200 transition hover:text-sky-400">
                          <T>Nach vorn</T>
                        </button>
                        <button onClick={() => entfernen(el.kennung)}
                          className="rounded bg-zinc-900 px-2 py-1 text-[11px] text-rose-400 transition hover:text-rose-300">
                          <T>Entfernen</T>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {!szene.elemente.length && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <p className="max-w-md text-center text-sm text-slate-600">
                  <T>Links oben die drei Striche: von dort kommen Team card, Standings, Cup timer, Offspawn, Custom text und Qual line auf das Bild. Ziehen zum Verschieben, die Ecke zum Vergrößern.</T>
                </p>
              </div>
            )}
          </div>

          {ausgewaehlt && (
            <p className="mt-2 text-center text-[11px] tabular-nums text-slate-600">
              {ausgewaehlt.name} · x {ausgewaehlt.x} · y {ausgewaehlt.y} · {ausgewaehlt.w} × {ausgewaehlt.h}
            </p>
          )}
        </div>
      </div>

      {/* Die Einstellungen eines Elements - die Seite der Art, hier im Studio */}
      {einstellung && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 sm:p-6"
          onPointerDown={(e) => e.stopPropagation()}>
          <div className="flex h-full w-full max-w-[1400px] flex-col overflow-hidden rounded-xl border
                          border-zinc-800 bg-zinc-950 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-zinc-900 px-4 py-2">
              <span className="text-sm font-semibold text-slate-100">{einstellung.titel}</span>
              <span className="text-[11px] text-slate-500">
                <T>Einstellen, speichern, dann liegt es auf dem Bild.</T>
              </span>
              <button onClick={() => setEinstellung(null)}
                className="ml-auto rounded-lg border border-zinc-800 px-3 py-1 text-xs text-slate-300
                           transition hover:border-sky-500 hover:text-sky-400">
                <T>Schließen</T>
              </button>
            </div>
            <iframe title={einstellung.titel} src={einstellung.url}
              className="h-full w-full flex-1 border-0 bg-zinc-950" />
          </div>
        </div>
      )}
    </main>
  );
}
