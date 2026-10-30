'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import SpielerPlatzhalter, { PlatzhalterRund } from '@/app/components/SpielerPlatzhalter';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT, useSprache } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import TeamFlagge from '@/components/TeamFlagge';
import LaenderListe from '@/app/components/LaenderListe';
import SpielerDetail from '@/app/events/[id]/SpielerDetail';
import { sichtbarerTakt } from '@/app/lib/takt';
import { fokusVon } from '@/lib/fotoFokus';
import { regionAnzeige } from '@/lib/regionFarbe';
import { SOLOS_REGIONEN } from '@/lib/solosRegionen';
import type { SolosDaten, SolosFenster, SolosGruppe, SolosSpieler, SolosStufe } from '@/lib/globalsSolos';
import { Karte } from './Bausteine';
import WegPlan from './WegPlan';
import Preisgeld from './Preisgeld';

/*
 * FNCS Solos - die Seite, komplett neu (Betreiber, 19.10.2026: "komplett neu, nicht mal aehnlich - in meinem neuen Stil, in Weiss und in Schwarz gut,
 * und fuer jede einzelne Region: Heats, Last Chance Qualifier, alles, was es in Europa gibt, mit Map").
 *
 * Oben der Weg ins Grand Final als Bahnen (Qualifier -> Heats -> Finale, Fast Tracks -> Finale, Last Chance -> Finale) mit dem Stand jeder Stufe;
 * darunter je Reiter: Qualifizierte (nach Weg), Heats, Last Chance, Finale, Karte. Alle Zahlen kommen aus Epics Bestenlisten und Katalog; die Landepunkte
 * von Noble Practice (Europa) und Vital Scrims (NA Central, NA West, Middle East, Ozeanien) - fuer Brasilien und Asien gibt es keine Quelle, und das steht dort.
 */

/*
 * Zwei Zeilen wie bei eucompetitive.com/grands (Betreiber, 26.10.2026: "pass die Solo-FNCS an wie dort"): oben die Stufen - Fast Tracks, Heat 1, Heat 2, Last Chance, Finals -,
 * darunter, rechts, die Ansicht dieser Stufe: Karte, Bestenliste, Spieler, Laender. Vor den Spieltagen stehen "Der Weg" und "Qualifiziert", am Ende das Preisgeld.
 */
type Fest = 'weg' | 'qualifiziert' | 'preisgeld';
type Ansicht = 'karte' | 'bestenliste' | 'spieler' | 'laender';
const ANSICHTEN: Array<[Ansicht, string]> = [['karte', 'Karte'], ['bestenliste', 'Bestenliste'], ['spieler', 'Spieler'], ['laender', 'Länder']];
const ISTFEST = (x: string): x is Fest => x === 'weg' || x === 'qualifiziert' || x === 'preisgeld';

const HAT_KARTE = new Set(['EU', 'NAC', 'NAW', 'ME', 'OCE']);

/* ------------------------------------------------------------------ kleine Bausteine */

/** Das Bild eines Spielers als abgerundetes Quadrat in der Breite des Elternelements. */
function Bild({ s }: { s: SolosSpieler }) {
  return (
    <span className="relative block aspect-square w-full overflow-hidden rounded-lg bg-zinc-800">
      {s.bild
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={s.bild} alt="" loading="lazy" style={{ objectPosition: fokusVon(s.bild) }} className="h-full w-full object-cover" />
        : <SpielerPlatzhalter name={s.anzeige} />}
    </span>
  );
}

/**
 * Ein Spieler als Kachel: grosses, sauberes Quadrat - und der Name steht immer darunter, auch ohne Foto
 * (Betreiber, 19.10.2026: "groessere, cleane Bilder, und man muss erkennen, wer es ist, auch ohne Bild"; die kleinen Kreise sah man nicht).
 * Ohne Foto steht ein Feld mit den Anfangsbuchstaben in einem Blauton, nie ein leerer Kreis.
 */
function Kachel({ s, unter, auf, klein }: { s: SolosSpieler; unter?: string; auf?: () => void; klein?: boolean }) {
  const inhalt = (
    <>
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-zinc-800">
        {s.bild
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={s.bild} alt="" loading="lazy" style={{ objectPosition: fokusVon(s.bild) }} className="h-full w-full object-cover" />
          : <SpielerPlatzhalter name={s.anzeige} />}
      </div>
      <p className="flex min-w-0 items-start gap-1.5 text-[11px] font-bold uppercase leading-tight text-slate-100">
        <span className="mt-px shrink-0"><TeamFlagge groesse={12} laender={[s.land ?? undefined]} /></span>
        <span className="line-clamp-2 min-w-0 break-words">{s.anzeige}</span>
      </p>
      {unter && <p className="-mt-1 text-[10px] font-semibold tabular-nums text-slate-500">{unter}</p>}
    </>
  );
  const klasse = 'flex min-w-0 flex-col gap-2 text-left';
  return auf
    ? <button type="button" onClick={auf} title={s.anzeige} className={`${klasse} rounded-xl p-1 -m-1 transition hover:bg-sky-500/[0.07]`}>{inhalt}</button>
    : <div title={s.anzeige} className={klasse}>{inhalt}</div>;
}

/** Das Raster fuer Kacheln - je breiter die Seite, desto mehr in einer Reihe. */
const RASTER = 'grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8';

/** Ein Spieler ohne Foto: der Name zuerst, mit Flagge und - wo es sie gibt - Platz und Punkten; kein leeres Quadrat. */
function NurName({ s, unter, auf }: { s: SolosSpieler; unter?: string; auf?: () => void }) {
  const inhalt = (
    <>
      <PlatzhalterRund name={s.anzeige} groesse={36} eckig />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5"><TeamFlagge groesse={13} laender={[s.land ?? undefined]} /><span className="truncate text-xs font-bold uppercase text-slate-100">{s.anzeige}</span></span>
        {unter && <span className="block text-[10px] font-semibold tabular-nums text-slate-500">{unter}</span>}
      </span>
    </>
  );
  const klasse = 'flex min-w-0 items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-left';
  return auf
    ? <button type="button" onClick={auf} title={s.anzeige} className={`${klasse} transition hover:border-sky-500/50`}>{inhalt}</button>
    : <div title={s.anzeige} className={klasse}>{inhalt}</div>;
}

/**
 * Die Spielerliste einer Stufe: wer ein Foto hat, steht als grosse Kachel vorn; die uebrigen darunter als Namensfelder.
 * So sieht man jedes Foto gross, und ein Spieler ohne Foto wird nicht zu einem leeren Quadrat (Betreiber, 19.10.2026: "man erkennt die Spieler nicht").
 */
function Spielerliste<S extends SolosSpieler>({ spieler, auf, unter, klein }: { spieler: S[]; auf?: (s: S) => void; unter?: (s: S) => string | undefined; klein?: boolean }) {
  const mit = spieler.filter((x) => x.bild);
  const ohne = spieler.filter((x) => !x.bild);
  return (
    <div className="space-y-5">
      {mit.length > 0 && (
        <div className={klein ? 'grid grid-cols-3 gap-x-2.5 gap-y-4 sm:grid-cols-4 lg:grid-cols-5' : RASTER}>
          {mit.map((x) => <Kachel key={x.id} s={x} klein={klein} auf={auf ? () => auf(x) : undefined} unter={unter?.(x)} />)}
        </div>
      )}
      {ohne.length > 0 && (
        <div className={`grid gap-1.5 ${klein ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'} ${mit.length ? 'border-t border-zinc-800 pt-4' : ''}`}>
          {ohne.map((x) => <NurName key={x.id} s={x} auf={auf ? () => auf(x) : undefined} unter={unter?.(x)} />)}
        </div>
      )}
    </div>
  );
}

function Karte2({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-[0_8px_24px_rgba(15,23,42,.10)] ${className}`}>{children}</section>;
}

function useZeit() {
  const { sprache } = useSprache();
  const ort = sprache === 'de' ? 'de-DE' : 'en-GB';
  return useMemo(() => {
    const f = new Intl.DateTimeFormat(ort, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    return (ms: number | null | undefined) => (ms ? f.format(new Date(ms)) : '');
  }, [ort]);
}

/* ------------------------------------------------------------------ Der Weg */

function Weg({ daten, auf }: { daten: SolosDaten; auf: (r: 'qualifiziert') => void }) {
  const finalisten = daten.qualifiziert.reduce((a, g) => a + g.spieler.length, 0);
  return (
    <div className="space-y-5">
      <Karte2>
        <h2 className="text-lg font-extrabold text-slate-100"><T>Der Weg ins Grand Final</T></h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-400"><T>Jeder Pfeil ist eine Epic-Marke: die Belohnung einer Runde ist die Zugangsbedingung der nächsten. Die Zahlen stammen aus Epics Bestenlisten und Auszahlungstabellen.</T></p>
        <div className="mt-5"><WegPlan region={daten.region} /></div>
      </Karte2>
      {finalisten > 0 && <FinalistenKurz daten={daten} auf={() => auf('qualifiziert')} />}
    </div>
  );
}

function FinalistenKurz({ daten, auf }: { daten: SolosDaten; auf: () => void }) {
  const alle = daten.qualifiziert.flatMap((g) => g.spieler);
  // Wer ein Foto hat, steht vorn; die Reihenfolge sonst bleibt.
  const gezeigt = [...alle.filter((s) => s.bild), ...alle.filter((s) => !s.bild)].slice(0, 15);
  const mehr = alle.length - gezeigt.length;
  return (
    <Karte2>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-extrabold text-slate-100"><T>Schon im Grand Final</T> <span className="ml-1 text-sky-400 tabular-nums">{alle.length}</span></h2>
        <button type="button" onClick={auf} className="text-xs font-semibold text-sky-400 hover:underline"><T>Alle ansehen</T> →</button>
      </div>
      <div className={`mt-5 ${RASTER}`}>
        {gezeigt.map((s) => <Kachel key={s.id} s={s} />)}
        {mehr > 0 && (
          <button type="button" onClick={auf} className="flex min-w-0 flex-col gap-2 text-left">
            <span className="flex aspect-square w-full items-center justify-center rounded-xl border border-sky-500/40 bg-sky-500/10 text-2xl font-black tabular-nums text-sky-400">+{mehr}</span>
            <span className="text-[11px] font-bold uppercase leading-tight text-sky-400"><T>Alle ansehen</T></span>
          </button>
        )}
      </div>
    </Karte2>
  );
}

/* ------------------------------------------------------------------ Qualifiziert */

function wegName(g: SolosGruppe, t: (s: string) => string): { titel: string; text: string } {
  if (g.art === 'heat') return { titel: g.quelle, text: t('Über den Heat ins Grand Final') };
  if (/fast/i.test(g.quelle)) return { titel: 'Fast Tracks', text: t('Direkt ins Grand Final') };
  if (/last chance|lcq/i.test(g.quelle)) return { titel: g.quelle, text: t('Über die Last Chance ins Grand Final') };
  return { titel: t('Sonstige'), text: t('Anderer Weg — keiner Stufe zugeordnet') };
}

function Qualifiziert({ daten, oeffne }: { daten: SolosDaten; oeffne: (s: SolosSpieler, w: string) => void }) {
  const t = useT();
  const heats = daten.fenster.filter((f) => f.art === 'heat');
  const gesamt = daten.qualifiziert.reduce((a, g) => a + g.spieler.length, 0);
  const ftSchwelle = daten.stufen.find((s) => s.art === 'fasttrack')?.qualifiziert;
  return (
    <div className="space-y-5">
      <Karte2>
        <h2 className="text-lg font-extrabold text-slate-100"><T>Qualifiziert fürs Grand Final</T> <span className="ml-1 text-sky-400 tabular-nums">{gesamt}</span></h2>
        <p className="mt-1 text-sm text-slate-400"><T>Gruppiert nach dem Weg: Fast Tracks, Heats, Last Chance.</T></p>
        {daten.qualifiziert.length === 0 ? (
          <p className="mt-4 rounded-xl border border-zinc-800 px-4 py-8 text-center text-sm text-slate-500"><T>Noch hat sich niemand qualifiziert.</T></p>
        ) : (
          <div className="mt-5 space-y-5">
            {daten.qualifiziert.map((g) => {
              const n = wegName(g, t);
              const regel = /fast/i.test(g.quelle) && ftSchwelle ? `Top ${ftSchwelle}` : null;
              return (
                <div key={g.windowId ?? g.quelle} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-extrabold text-slate-100">{n.titel}</h3>
                    <span className="rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-sky-400">{g.spieler.length}</span>
                    {regel && <span className="rounded-full border border-sky-500/40 px-2.5 py-0.5 text-[11px] font-semibold text-sky-400">{regel} → {t('Grand Finals')}</span>}
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">{n.text}</p>
                  <div className="mt-4">
                    <Spielerliste spieler={g.spieler} auf={(sp) => oeffne(sp, g.windowId ?? '')}
                      unter={(sp) => (sp.rang !== null ? `#${sp.rang}${sp.punkte !== null ? ` · ${sp.punkte} ${t('Punkte')}` : ''}` : undefined)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Karte2>

      {heats.length > 0 && (
        <Karte2>
          <h2 className="text-lg font-extrabold text-slate-100"><T>Qualifiziert für die Heats</T> <span className="ml-1 text-sky-400 tabular-nums">{heats.reduce((a, f) => a + f.spieler.length, 0)}</span></h2>
          <p className="mt-1 text-sm text-slate-400"><T>Wer sich über die Qualifier in einen Heat gespielt hat. Das Ergebnis der Heats steht im Reiter Heats.</T></p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {heats.map((h) => (
              <div key={h.windowId} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-sm font-extrabold text-slate-100">{h.name} <span className="ml-1 text-xs font-semibold text-slate-500">{h.spieler.length}</span></p>
                <div className="mt-3 max-h-[26rem] overflow-y-auto pr-1"><Spielerliste spieler={h.spieler} klein /></div>
              </div>
            ))}
          </div>
        </Karte2>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Bestenlisten eines Spieltags */

function Tafel({ f, finalisten, ziel, oeffne }: {
  f: SolosFenster; finalisten?: Set<string>; ziel?: string; oeffne?: (s: SolosSpieler) => void;
}) {
  const t = useT();
  const zeit = useZeit();
  const reihen = (f.teams ?? []).filter((x) => x.rang !== null).sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0));
  return (
    <Karte2>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-extrabold text-slate-100">{f.name}</h3>
        <span className="text-[11px] text-slate-500">{zeit(f.start ? Date.parse(f.start) : null)} · {f.spieler.length} <T>Spieler</T></span>
      </div>
      {reihen.length > 0 ? (
        <div className="mt-3 max-h-[34rem] overflow-y-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-900 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              <tr><th className="w-12 px-3 py-2 text-left">#</th><th className="px-3 py-2 text-left"><T>Spieler</T></th><th className="w-20 px-3 py-2 text-right"><T>Punkte</T></th></tr>
            </thead>
            <tbody>
              {reihen.map((r) => {
                const drin = !!finalisten && r.spieler.length > 0 && r.spieler.every((s) => finalisten.has(s.id));
                return (
                  <tr key={r.id} onClick={oeffne && r.spieler[0] ? () => oeffne(r.spieler[0]) : undefined}
                    className={`border-t border-zinc-800/70 transition hover:bg-sky-500/[0.06] ${oeffne ? 'cursor-pointer' : ''}`}>
                    <td className="px-3 py-2 text-sm font-black tabular-nums text-slate-400">{r.rang}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-3">
                        <span className="w-10 shrink-0"><Bild s={r.spieler[0]} /></span>
                        <TeamFlagge groesse={14} laender={r.spieler.map((s) => s.land ?? undefined)} />
                        <span className="min-w-0 truncate text-sm font-bold uppercase text-slate-100">{r.spieler.map((s) => s.anzeige).join(' · ')}</span>
                        {drin && ziel && <span className="shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-sky-400">→ {ziel}</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-base font-extrabold tabular-nums text-slate-100">{r.punkte ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : f.spieler.length > 0 ? (
        <div className="mt-3 max-h-[34rem] overflow-y-auto">
          <Spielerliste spieler={f.spieler} auf={oeffne} klein />
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-zinc-800 px-4 py-8 text-center text-sm text-slate-500">{t('Noch keine Spieler eingetragen.')}</p>
      )}
    </Karte2>
  );
}

/* ------------------------------------------------------------------ Seite */

export default function SolosSeite() {
  const t = useT();
  const [region, setRegion] = useState<string>('EU');
  /** Die gewaehlte Stufe: eine der festen oder der Name einer Stufe ("Heat 1", "Finals Day 1") - der Name gilt in jeder Region, die Kennung nicht. */
  const [stufe, setStufe] = useState<string>('');
  const [ansicht, setAnsicht] = useState<Ansicht>('karte');
  const [daten, setDaten] = useState<SolosDaten | null>(null);
  const [fehler, setFehler] = useState('');
  const [laedt, setLaedt] = useState(true);
  /** Region und Wunsch aus der Adresse sind gelesen - vorher wird nichts geholt (sonst ginge zuerst eine Abfrage fuer Europa hinaus). */
  const [bereit, setBereit] = useState(false);
  /** Der Wunsch aus der Adresse (auch die alten Reiter-Namen) - gilt einmal, sobald die Stufen da sind. */
  const [wunsch, setWunsch] = useState<{ stufe: string; ansicht: string; tab: string } | null>(null);
  /** Der Spieler, dessen Werte gerade im Fenster stehen. */
  const [panel, setPanel] = useState<{ id: string; name: string; windowId: string } | null>(null);

  // Region und Wunsch aus der Adresse und aus dem Browser (gemerkt)
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const r = (p.get('region') ?? localStorage.getItem('solos_region') ?? '').toUpperCase();
      if ((SOLOS_REGIONEN as readonly string[]).includes(r)) setRegion(r);
      setWunsch({ stufe: p.get('stufe') ?? '', ansicht: p.get('ansicht') ?? '', tab: p.get('tab') ?? '' });
    } catch { setWunsch({ stufe: '', ansicht: '', tab: '' }); }
    setBereit(true);
  }, []);
  const merke = (r: string, st: string, an: Ansicht | '') => {
    try {
      localStorage.setItem('solos_region', r);
      const u = new URL(window.location.href);
      u.searchParams.set('region', r); u.searchParams.set('stufe', st); u.searchParams.delete('tab');
      if (an) u.searchParams.set('ansicht', an); else u.searchParams.delete('ansicht');
      window.history.replaceState(null, '', u.toString());
    } catch { /* ohne Speicher */ }
  };
  const waehleRegion = (r: string) => { setRegion(r); setWunsch({ stufe, ansicht, tab: '' }); merke(r, stufe, ISTFEST(stufe) ? '' : ansicht); };
  const waehleStufe = (st: string, an?: Ansicht) => {
    const neuAn = an ?? ansicht;
    setStufe(st); if (an) setAnsicht(an);
    merke(region, st, ISTFEST(st) ? '' : neuAn);
  };

  /** Eine Antwort, die zu einer anderen Region gehoert als der gerade gewaehlten, wird verworfen - sonst ueberschrieb die langsame Antwort der Startregion (EU) die der gewaehlten. */
  const holen = useCallback(async (veraltet: () => boolean) => {
    try {
      const r = await fetch(`/api/globals-solos?region=${encodeURIComponent(region)}`, { cache: 'no-store' });
      const j = await r.json() as ({ ok: true } & SolosDaten) | { ok: false; error?: string };
      if (veraltet()) return;
      if (!r.ok || !j.ok) throw new Error(('error' in j && j.error) || 'nicht ladbar');
      setDaten(j); setFehler('');
    } catch (e) { if (!veraltet()) setFehler((e as Error).message); } finally { if (!veraltet()) setLaedt(false); }
  }, [region]);
  useEffect(() => {
    if (!bereit) return undefined;
    let weg = false;
    setDaten(null); setFehler(''); setLaedt(true);
    void holen(() => weg);
    const ende = sichtbarerTakt(() => { void holen(() => weg); }, 120_000);
    return () => { weg = true; if (typeof ende === 'function') ende(); };
  }, [holen, bereit]);

  // Die Stufen mit eigenem Spieltag - die Fenster der Quelle (Noble in Europa, Epic sonst), in der Reihenfolge, in der sie gespielt werden; die frueheren Qualifier-Runden stehen im Weg.
  const spieltage = useMemo(() => (daten?.fenster ?? [])
    .filter((x) => x.art === 'heat' || x.art === 'finale' || /fast|last chance|lcq/i.test(x.name))
    .sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? ''))), [daten]);
  /** Laeuft die Stufe, kommt sie noch, ist sie vorbei? Epics Stufe mit derselben Kennung - oder die zeitlich naechste (Noble nennt die Fenster anders). */
  const statusVon = useCallback((x: SolosFenster): SolosStufe['status'] => {
    const beginn = Date.parse(x.start ?? '');
    const st = daten?.stufen.find((y) => y.windowId === x.windowId)
      ?? (Number.isFinite(beginn)
        ? daten?.stufen.filter((y) => y.art !== 'qualifier').sort((a, b) => Math.abs(a.begin - beginn) - Math.abs(b.begin - beginn)).find((y) => Math.abs(y.begin - beginn) < 6 * 3_600_000)
        : undefined);
    return st?.status ?? (Number.isFinite(beginn) && beginn > Date.now() ? 'kommt' : 'vorbei');
  }, [daten]);

  // Welche Stufe zuerst? Der Wunsch aus der Adresse, sonst die laufende, sonst das Finale mit Landepunkten, sonst der Weg.
  const gewaehltFuer = useRef('');
  useEffect(() => {
    if (!daten || gewaehltFuer.current === region || !wunsch) return;
    gewaehltFuer.current = region;
    const nameZu = (wer: (x: SolosFenster) => boolean) => spieltage.find(wer)?.name ?? '';
    const alt: Record<string, string> = {
      weg: 'weg', qualifiziert: 'qualifiziert', preisgeld: 'preisgeld',
      heats: nameZu((x) => x.art === 'heat'),
      lastchance: nameZu((x) => /last chance|lcq/i.test(x.name)),
      finale: nameZu((x) => x.art === 'finale'),
      karte: nameZu((x) => x.art === 'finale'),
    };
    let ziel = wunsch.stufe || alt[wunsch.tab] || '';
    if (ziel && !ISTFEST(ziel) && !spieltage.some((x) => x.name === ziel)) ziel = '';
    if (!ziel && !wunsch.stufe && !wunsch.tab) {
      const laufend = spieltage.find((x) => statusVon(x) === 'live');
      const finaleMitKarte = HAT_KARTE.has(region) ? spieltage.find((x) => x.art === 'finale' && x.formen.length > 0) : undefined;
      ziel = laufend?.name ?? finaleMitKarte?.name ?? 'weg';
    }
    setStufe(ziel || 'weg');
    const wunschAnsicht = (ANSICHTEN.some(([k]) => k === wunsch.ansicht) ? wunsch.ansicht : wunsch.tab === 'karte' ? 'karte' : '') as Ansicht | '';
    if (wunschAnsicht) setAnsicht(wunschAnsicht);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daten, wunsch, spieltage, region, statusVon]);

  const finalisten = useMemo(() => new Set(daten?.qualifiziert.flatMap((g) => g.spieler.map((s) => s.id)) ?? []), [daten]);
  const eventVon = (windowId: string) => daten?.stufen.find((s) => s.windowId === windowId)?.eventId ?? '';
  const oeffneIn = (windowId: string) => (s: SolosSpieler) => { if (eventVon(windowId)) setPanel({ id: s.id, name: s.anzeige, windowId }); };
  const live = daten?.stufen.some((s) => s.status === 'live');
  // Welche Reihe: die Reload-Solos (Season 43) oder die normalen - fuer das Bild im Kopf. Massgeblich sind die Spieltage der Reiter (Karte, Spieler);
  // nur ohne sie der Weg - so steht ueber dem Finale der Season 42 nicht schon das Reload-Bild.
  const reihe = (daten?.fenster.length ? daten.fenster : daten?.stufen ?? []).some((s) => /reload/i.test(s.windowId)) ? 'reload' : 'br';
  const aktuell = spieltage.find((x) => x.name === stufe);
  const f = aktuell;
  const panelStufe = panel ? daten?.stufen.find((s) => s.windowId === panel.windowId) : null;
  const ziel = aktuell && aktuell.art !== 'finale' ? t('Grand Finals') : undefined;
  // Wie viele der Spieler auf der Karte stehen - wie "Teams 100/100" bei eucompetitive.
  const aufKarte = f ? new Set(f.formen.flatMap((fo) => fo.spieler)).size : 0;

  const knopf = (aktiv: boolean) => `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${aktiv ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`;

  return (
    <main className="relative isolate flex-1 bg-zinc-950 text-slate-200">
      <div className="mx-auto max-w-[1300px] space-y-5 px-4 py-6">
        <Link href="/account" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-sky-400">
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 4l-6 6 6 6" /></svg><T>Dashboard</T>
        </Link>
        {/*
          * Kopf mit dem Bild der Reihe (Betreiber, 30.10.2026: "Ich LIEBE Bilder - wo ist das Solo-Logo als Header?"): Epics FNCS-Solos-Bild, bei der
          * Reload-Reihe das Reload-Solo-Bild. Farben fest (#fff, schwarzer Verlauf), damit der Kopf im hellen Modus nicht umgefaerbt wird.
          */}
        <section className="relative isolate overflow-hidden rounded-3xl border border-white/[0.08] bg-[#09090b] shadow-[0_20px_50px_rgba(0,0,0,.4)]">
          {/* Dasselbe Bild verschwommen als Grund, damit Text und Logo auf einer Flaeche stehen. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={reihe === 'reload' ? '/cups/fncs-solo-reload.webp' : '/cups/fncs-solos.jpg'} alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full scale-110 object-cover opacity-25 blur-2xl" />
          <div className="grid items-center gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_minmax(0,560px)]">
            <div className="order-2 lg:order-1">
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#7dd3fc]">{reihe === 'reload' ? 'FNCS · Reload' : 'FNCS · Battle Royale'}</p>
              <h1 className="mt-1 text-4xl font-black uppercase leading-[0.95] tracking-tight text-[#fff] sm:text-6xl">
                FNCS Solos{reihe === 'reload' ? ' Reload' : ''} <span className="text-[#38bdf8]">{regionAnzeige({ region })}</span>
              </h1>
              <p className="mt-3 max-w-xl text-sm text-[#cbd5e1]"><T>Jede Stufe auf dem Weg ins Grand Final — für jede Region: Qualifier, Fast Tracks, Heats, Last Chance, Finale und die Landepunkte.</T></p>
              <div className="mt-4 flex flex-wrap gap-2">
                {live && <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ef4444] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#fff]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#fff]" /><T>Live</T></span>}
                {daten && <span className="rounded-full border border-[rgba(255,255,255,.3)] bg-[rgba(0,0,0,.45)] px-3 py-1 text-xs font-semibold text-[#e2e8f0]">{daten.qualifiziert.reduce((a, g) => a + g.spieler.length, 0)} <T>qualifiziert</T></span>}
              </div>
            </div>
            {/* Das Logo der Reihe ganz, nicht hinter Text versteckt. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={reihe === 'reload' ? '/cups/fncs-solo-reload.webp' : '/cups/fncs-solos.jpg'} alt={reihe === 'reload' ? 'FNCS Solos Reload' : 'FNCS Solos'}
              className="order-1 aspect-video w-full rounded-2xl border border-white/10 object-cover shadow-[0_16px_40px_rgba(0,0,0,.5)] lg:order-2" />
          </div>
        </section>

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('Region')}>
          {SOLOS_REGIONEN.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={region === r} onClick={() => waehleRegion(r)}
              className={`rounded-full border px-4 py-1.5 text-xs font-bold transition ${region === r
                ? 'border-sky-500 bg-sky-500 text-white shadow' : 'border-zinc-800 bg-zinc-900 text-slate-400 hover:border-sky-500/50 hover:text-slate-100'}`}>
              {regionAnzeige({ region: r })}
            </button>
          ))}
        </div>

        {/* Erste Zeile: die Stufen */}
        <nav className="flex flex-wrap items-center gap-1 self-start rounded-2xl border border-zinc-800 bg-zinc-900 p-1.5 shadow-sm" aria-label={t('Stufe')}>
          <button type="button" onClick={() => waehleStufe('weg')} className={knopf(stufe === 'weg')}><T>Der Weg</T></button>
          <button type="button" onClick={() => waehleStufe('qualifiziert')} className={knopf(stufe === 'qualifiziert')}><T>Qualifiziert</T></button>
          {spieltage.length > 0 && <span aria-hidden className="mx-1 h-5 w-px bg-zinc-700" />}
          {spieltage.map((x) => (
            <button key={x.windowId} type="button" onClick={() => waehleStufe(x.name, ansicht)} className={knopf(stufe === x.name)}>
              {statusVon(x) === 'live' && <span className={`h-2 w-2 animate-pulse rounded-full ${stufe === x.name ? 'bg-white' : 'bg-sky-400'}`} />}
              {x.name}
            </button>
          ))}
          <span aria-hidden className="mx-1 h-5 w-px bg-zinc-700" />
          <button type="button" onClick={() => waehleStufe('preisgeld')} className={knopf(stufe === 'preisgeld')}><T>Preisgeld</T></button>
        </nav>

        {/* Zweite Zeile: die Ansicht der gewaehlten Stufe, rechts */}
        {aktuell && (
          <div className="flex justify-end">
            <nav className="flex flex-wrap gap-1 rounded-full border border-zinc-800 bg-zinc-900 p-1 shadow-sm" aria-label={t('Ansicht')}>
              {ANSICHTEN.map(([k, titel]) => (
                <button key={k} type="button" onClick={() => waehleStufe(stufe, k)} className={knopf(ansicht === k)}><T>{titel}</T></button>
              ))}
            </nav>
          </div>
        )}

        {laedt && !daten && stufe !== 'preisgeld' && <LadeSchirm />}
        {fehler && !daten && !laedt && stufe !== 'preisgeld' && (
          <p className="rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-8 text-center text-sm text-slate-400">{fehler}</p>
        )}

        {daten && stufe === 'weg' && <Weg daten={daten} auf={() => waehleStufe('qualifiziert')} />}
        {daten && stufe === 'qualifiziert' && (
          <Qualifiziert daten={daten} oeffne={(s, w) => { const ziel2 = daten.fenster.find((x) => x.windowId === w) ?? daten.fenster.find((x) => x.art === 'finale'); if (ziel2 && eventVon(ziel2.windowId)) setPanel({ id: s.id, name: s.anzeige, windowId: ziel2.windowId }); }} />
        )}
        {stufe === 'preisgeld' && <Preisgeld region={region} />}

        {daten && aktuell && (
          <>
            {/*
              * Die Karte im Meer (Betreiber, 30.10.2026: "diese extra schwarze Umrandung haesslich - nur ein Blau, das zur Map passt, als ob alles zur Map gehoert,
              * wie bei Noble"): die Flaeche ringsum hat genau die Farbe des Wassers am Kartenrand (#084687), die Karte geht ohne Kante hinein. Woher die
              * Landepunkte kommen, steht hier nicht mehr - das bleibt unter uns.
              */}
            {ansicht === 'karte' && (
              <section className="overflow-hidden rounded-3xl border border-[rgba(56,189,248,.35)] p-3 shadow-[0_20px_50px_rgba(8,70,135,.35)] sm:p-5" style={{ background: '#084687' }}>
                {!HAT_KARTE.has(region) ? (
                  <p className="py-10 text-center text-sm text-[#bfdbfe]"><T>Für diese Region gibt es keine Quelle für Landepunkte.</T></p>
                ) : !f || !f.formen.length ? (
                  <p className="py-10 text-center text-sm text-[#bfdbfe]"><T>Für diesen Spieltag sind noch keine Landepunkte eingetragen.</T></p>
                ) : (
                  <>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center rounded-full border border-[rgba(255,255,255,.25)] bg-[rgba(0,0,0,.25)] px-4 py-1.5 text-sm font-extrabold uppercase tracking-wide text-[#fff]">FNCS Solos · {aktuell.name}</span>
                      <span className="rounded-full border border-[rgba(255,255,255,.25)] bg-[rgba(0,0,0,.25)] px-3 py-1.5 text-xs font-bold tabular-nums text-[#e2e8f0]"><T>Spieler</T> {aufKarte}/{f.spieler.length || aufKarte}</span>
                    </div>
                    <Karte key={f.windowId} f={f} bild={f.bild} rotAb={2} />
                  </>
                )}
              </section>
            )}
            {ansicht === 'bestenliste' && (f
              ? <Tafel key={f.windowId} f={f} finalisten={ziel ? finalisten : undefined} ziel={ziel} oeffne={oeffneIn(f.windowId)} />
              : <Karte2><p className="py-6 text-center text-sm text-slate-500"><T>Noch keine Spieler eingetragen.</T></p></Karte2>)}
            {ansicht === 'spieler' && (
              <Karte2>
                <h3 className="text-base font-extrabold text-slate-100">{aktuell.name} <span className="ml-1 text-sm font-semibold text-slate-500">{f?.spieler.length ?? 0}</span></h3>
                <div className="mt-4">
                  {f && f.spieler.length ? <Spielerliste spieler={f.spieler} auf={oeffneIn(f.windowId)} />
                    : <p className="py-6 text-center text-sm text-slate-500"><T>Noch keine Spieler eingetragen.</T></p>}
                </div>
              </Karte2>
            )}
            {ansicht === 'laender' && (
              <Karte2>
                <h3 className="text-base font-extrabold text-slate-100"><T>Spieler nach Land</T> · {aktuell.name}</h3>
                <div className="mt-3">
                  {f && f.spieler.length ? <LaenderListe spieler={[...new Map(f.spieler.map((s) => [s.id, s])).values()]} />
                    : <p className="py-6 text-center text-sm text-slate-500"><T>Noch keine Spieler eingetragen.</T></p>}
                </div>
              </Karte2>
            )}
          </>
        )}
      </div>

      {panel && panelStufe && (
        <div className="fixed inset-0 z-[500] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={() => setPanel(null)}>
          <div className="relative my-8 w-full max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" aria-label={t('Schließen')} onClick={() => setPanel(null)}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-slate-400 transition hover:border-sky-500 hover:text-white">
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg>
            </button>
            <p className="mb-3 pr-10 text-xs font-bold uppercase tracking-[0.18em] text-sky-400"><T>Match-Verlauf</T> · FNCS Solos {panelStufe.name} · {regionAnzeige({ region })}</p>
            <SpielerDetail eventId={panelStufe.eventId} windowId={panelStufe.windowId} rueckPfad="/globals-solos" solo startSpieler={{ id: panel.id, name: panel.name }} kompakt />
          </div>
        </div>
      )}
    </main>
  );
}
