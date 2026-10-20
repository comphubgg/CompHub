'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import SpielerPlatzhalter, { PlatzhalterRund } from '@/app/components/SpielerPlatzhalter';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT, useSprache } from '@/app/components/SprachProvider';
import SeitenKopf from '@/app/components/SeitenKopf';
import LadeSchirm from '@/app/components/LadeSchirm';
import KartenHintergrund, { CUP_BILDER } from '@/app/components/KartenHintergrund';
import TeamFlagge from '@/components/TeamFlagge';
import LaenderListe from '@/app/components/LaenderListe';
import SpielerDetail from '@/app/events/[id]/SpielerDetail';
import { sichtbarerTakt } from '@/app/lib/takt';
import { fokusVon } from '@/lib/fotoFokus';
import { regionAnzeige } from '@/lib/regionFarbe';
import { SOLOS_REGIONEN } from '@/lib/solosRegionen';
import type { SolosDaten, SolosFenster, SolosGruppe, SolosSpieler, SolosStufe } from '@/lib/globalsSolos';
import { Karte } from './Bausteine';

/*
 * FNCS Solos - die Seite, komplett neu (Betreiber, 19.10.2026: "komplett neu, nicht mal aehnlich - in meinem neuen Stil, in Weiss und in Schwarz gut,
 * und fuer jede einzelne Region: Heats, Last Chance Qualifier, alles, was es in Europa gibt, mit Map").
 *
 * Oben der Weg ins Grand Final als Bahnen (Qualifier -> Heats -> Finale, Fast Tracks -> Finale, Last Chance -> Finale) mit dem Stand jeder Stufe;
 * darunter je Reiter: Qualifizierte (nach Weg), Heats, Last Chance, Finale, Karte. Alle Zahlen kommen aus Epics Bestenlisten und Katalog; die Landepunkte
 * von Noble Practice (Europa) und Vital Scrims (NA Central, NA West, Middle East, Ozeanien) - fuer Brasilien und Asien gibt es keine Quelle, und das steht dort.
 */

type Reiter = 'weg' | 'qualifiziert' | 'heats' | 'lastchance' | 'finale' | 'karte';
const REITER: Array<[Reiter, string]> = [
  ['weg', 'Der Weg'], ['qualifiziert', 'Qualifiziert'], ['heats', 'Heats'], ['lastchance', 'Last Chance'], ['finale', 'Finale'], ['karte', 'Karte'],
];

const HAT_KARTE = new Set(['EU', 'NAC', 'NAW', 'ME', 'OCE']);

/* ------------------------------------------------------------------ kleine Bausteine */

function Foto({ s, px = 36 }: { s: SolosSpieler; px?: number }) {
  return s.bild
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={s.bild} alt="" loading="lazy" style={{ width: px, height: px, objectPosition: fokusVon(s.bild) }}
        className="shrink-0 rounded-full border border-zinc-700 object-cover" />
    : (
      <PlatzhalterRund name={s.anzeige} groesse={px} />
    );
}

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

/** Die Spieler nach Land - schmal neben den Tafeln, beim Scrollen stehen bleibend. */
function LaenderSpalte({ spieler }: { spieler: SolosSpieler[] }) {
  return (
    <aside className="xl:sticky xl:top-4 xl:self-start">
      <Karte2>
        <h3 className="text-base font-extrabold text-slate-100"><T>Spieler nach Land</T></h3>
        <div className="mt-3"><LaenderListe spieler={[...new Map(spieler.map((s) => [s.id, s])).values()]} /></div>
      </Karte2>
    </aside>
  );
}

function Karte2({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-[0_8px_24px_rgba(15,23,42,.10)] ${className}`}>{children}</section>;
}

function Marke({ stand }: { stand: 'live' | 'vorbei' | 'kommt' }) {
  const klasse = stand === 'live' ? 'bg-sky-500 text-white' : stand === 'kommt' ? 'border border-sky-500/50 text-sky-400' : 'bg-zinc-800 text-slate-400';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${klasse}`}>
      {stand === 'live' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
      {stand === 'live' ? <T>Live</T> : stand === 'kommt' ? <T>Kommt</T> : <T>Vorbei</T>}
    </span>
  );
}

const stand = (ss: SolosStufe[]): 'live' | 'vorbei' | 'kommt' => (ss.some((s) => s.status === 'live') ? 'live' : ss.length && ss.every((s) => s.status === 'vorbei') ? 'vorbei' : 'kommt');

function useZeit() {
  const { sprache } = useSprache();
  const ort = sprache === 'de' ? 'de-DE' : 'en-GB';
  return useMemo(() => {
    const f = new Intl.DateTimeFormat(ort, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    return (ms: number | null | undefined) => (ms ? f.format(new Date(ms)) : '');
  }, [ort]);
}

/* ------------------------------------------------------------------ Der Weg */

function Stufe({ titel, stufen, zahl, regel, ziel, an, auf }: {
  titel: string; stufen: SolosStufe[]; zahl?: number; regel?: string; ziel?: string; an?: boolean; auf?: () => void;
}) {
  const zeit = useZeit();
  const erste = [...stufen].sort((a, b) => a.begin - b.begin)[0];
  return (
    <button type="button" onClick={auf} disabled={!auf}
      className={`group flex min-w-[10.5rem] flex-1 flex-col rounded-2xl border p-4 text-left transition ${an
        ? 'border-sky-500/60 bg-sky-950' : 'border-zinc-800 bg-zinc-900 hover:border-sky-500/40'} ${auf ? 'cursor-pointer' : 'cursor-default'}`}>
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm font-extrabold text-slate-100">{titel}</span>
        <Marke stand={stand(stufen)} />
      </span>
      {erste && <span className="mt-1 text-[11px] text-slate-500">{zeit(erste.begin)}{stufen.length > 1 ? ` · ${stufen.length}×` : ''}</span>}
      <span className="mt-3 flex flex-wrap gap-1.5">
        {zahl !== undefined && zahl > 0 && (
          <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-slate-300">{zahl} <T>Spieler</T></span>
        )}
        {regel && <span className="rounded-full border border-sky-500/40 px-2.5 py-0.5 text-[11px] font-semibold text-sky-400">{regel}</span>}
      </span>
      {ziel && <span className="mt-2 text-[11px] font-semibold text-slate-400">→ {ziel}</span>}
    </button>
  );
}

function Pfeil() {
  return (
    <svg viewBox="0 0 20 20" className="hidden h-5 w-5 shrink-0 self-center text-slate-600 sm:block" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 4l6 6-6 6" />
    </svg>
  );
}

function Bahn({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{titel}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">{children}</div>
    </div>
  );
}

function Weg({ daten, auf }: { daten: SolosDaten; auf: (r: Reiter) => void }) {
  const t = useT();
  const stufen = daten.stufen;
  const von = (art: SolosStufe['art']) => stufen.filter((s) => s.art === art);
  const spieler = (ids: string[]) => ids.reduce((a, id) => a + (daten.fenster.find((f) => f.windowId === id)?.spieler.length ?? 0), 0);
  const quals = von('qualifier');
  const schwellen = [...new Set(quals.map((q) => q.qualifiziert).filter((n): n is number => !!n))].sort((a, b) => b - a);
  const fts = von('fasttrack'); const heats = von('heat'); const lcq = von('lcq'); const lcqF = von('lcq-finale'); const finale = von('finale');
  const finalisten = daten.qualifiziert.reduce((a, g) => a + g.spieler.length, 0);
  const ftSchwelle = fts.find((s) => s.qualifiziert)?.qualifiziert;
  const lcqSchwelle = lcq.find((s) => s.qualifiziert)?.qualifiziert;
  const nachKennung = (ss: SolosStufe[]) => ss.map((s) => s.windowId);

  const grand = (
    <Stufe titel={t('Grand Finals')} stufen={finale} zahl={finalisten} an auf={() => auf('finale')} />
  );
  return (
    <div className="space-y-5">
      <Karte2>
        <h2 className="text-lg font-extrabold text-slate-100"><T>Der Weg ins Grand Final</T></h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-400"><T>Drei Wege führen ins Finale. Jede Stufe zeigt, wo sie steht und wie viele weiterkommen — die Zahlen stammen aus Epics Auszahlungstabellen.</T></p>
        <div className="mt-5 space-y-5">
          {(quals.length > 0 || heats.length > 0) && (
            <Bahn titel={t('Über die Qualifier')}>
              {quals.length > 0 && <><Stufe titel={t('Qualifier')} stufen={quals} regel={schwellen.length ? schwellen.map((n) => `Top ${n.toLocaleString()}`).join(' → ') : undefined} ziel={t('Heats')} /><Pfeil /></>}
              <Stufe titel={t('Heats')} stufen={heats} zahl={spieler(nachKennung(heats))} regel={heats.length ? `${heats.length} Heats` : undefined} ziel={t('Grand Finals')} an auf={() => auf('heats')} />
              <Pfeil />{grand}
            </Bahn>
          )}
          {fts.length > 0 && (
            <Bahn titel={t('Direkt: Fast Tracks')}>
              <Stufe titel="Fast Tracks" stufen={fts} zahl={spieler(nachKennung(fts))} regel={ftSchwelle ? `Top ${ftSchwelle}` : undefined} ziel={t('Grand Finals')} an auf={() => auf('qualifiziert')} />
              <Pfeil />{grand}
            </Bahn>
          )}
          {lcq.length > 0 && (
            <Bahn titel={t('Last Chance')}>
              <Stufe titel="Last Chance Qualifier" stufen={lcq} zahl={spieler(nachKennung(lcq))} regel={lcqSchwelle ? `Top ${lcqSchwelle}` : undefined} ziel={t('Last Chance Finals')} an auf={() => auf('lastchance')} />
              <Pfeil />
              <Stufe titel="Last Chance Finals" stufen={lcqF} zahl={spieler(nachKennung(lcqF))} ziel={t('Grand Finals')} an auf={() => auf('lastchance')} />
              <Pfeil />{grand}
            </Bahn>
          )}
        </div>
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
  const [reiter, setReiter] = useState<Reiter>('weg');
  const [daten, setDaten] = useState<SolosDaten | null>(null);
  const [fehler, setFehler] = useState('');
  const [laedt, setLaedt] = useState(true);
  const [wahlKarte, setWahlKarte] = useState('');
  /** Region und Reiter aus der Adresse sind gelesen - vorher wird nichts geholt (sonst ginge zuerst eine Abfrage fuer Europa hinaus). */
  const [bereit, setBereit] = useState(false);
  /** Der Spieler, dessen Werte gerade im Fenster stehen. */
  const [panel, setPanel] = useState<{ id: string; name: string; windowId: string } | null>(null);

  // Region und Reiter aus der Adresse und aus dem Browser (gemerkt)
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const r = (p.get('region') ?? localStorage.getItem('solos_region') ?? '').toUpperCase();
      if ((SOLOS_REGIONEN as readonly string[]).includes(r)) setRegion(r);
      const re = p.get('tab') as Reiter | null;
      if (re && REITER.some(([k]) => k === re)) setReiter(re);
    } catch { /* ohne Speicher */ }
    setBereit(true);
  }, []);
  const waehle = (r: string, re: Reiter) => {
    setRegion(r); setReiter(re);
    try {
      localStorage.setItem('solos_region', r);
      const u = new URL(window.location.href);
      u.searchParams.set('region', r); u.searchParams.set('tab', re);
      window.history.replaceState(null, '', u.toString());
    } catch { /* ohne Speicher */ }
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

  const finalisten = useMemo(() => new Set(daten?.qualifiziert.flatMap((g) => g.spieler.map((s) => s.id)) ?? []), [daten]);
  const eventVon = (windowId: string) => daten?.stufen.find((s) => s.windowId === windowId)?.eventId ?? '';
  const oeffneIn = (windowId: string) => (s: SolosSpieler) => { if (eventVon(windowId)) setPanel({ id: s.id, name: s.anzeige, windowId }); };
  const live = daten?.stufen.some((s) => s.status === 'live');
  const art = (a: SolosFenster['art']) => daten?.fenster.filter((f) => f.art === a) ?? [];
  const lastChance = daten?.fenster.filter((f) => f.art === 'qualifier' && /last chance|lcq/i.test(f.name)) ?? [];
  const finale = art('finale');
  const kartenFenster = daten?.fenster ?? [];
  const aktivKarte = kartenFenster.find((f) => f.windowId === wahlKarte) ?? kartenFenster.find((f) => f.formen.length && f.art === 'finale') ?? kartenFenster.find((f) => f.formen.length) ?? kartenFenster[0];
  const panelStufe = panel ? daten?.stufen.find((s) => s.windowId === panel.windowId) : null;

  return (
    <main className="relative isolate flex-1 bg-zinc-950 text-slate-200">
      <KartenHintergrund cups={CUP_BILDER} />
      <div className="mx-auto max-w-[1300px] space-y-5 px-4 py-6">
        <Link href="/account" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-sky-400">
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 4l-6 6 6 6" /></svg><T>Dashboard</T>
        </Link>
        <SeitenKopf marke={<T>FNCS · Chapter 7 Season 4</T>} titel={<>FNCS Solos <span className="text-sky-500">{regionAnzeige({ region })}</span></>}
          text={<T>Jede Stufe auf dem Weg ins Grand Final — für jede Region: Qualifier, Fast Tracks, Heats, Last Chance, Finale und die Landepunkte.</T>}
          rechts={<>
            {live && <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white"><span className="h-2 w-2 animate-pulse rounded-full bg-white" /><T>Live</T></span>}
            {daten && <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold text-slate-300">{daten.qualifiziert.reduce((a, g) => a + g.spieler.length, 0)} <T>qualifiziert</T></span>}
          </>} />

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('Region')}>
          {SOLOS_REGIONEN.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={region === r} onClick={() => waehle(r, reiter)}
              className={`rounded-full border px-4 py-1.5 text-xs font-bold transition ${region === r
                ? 'border-sky-500 bg-sky-500 text-white shadow' : 'border-zinc-800 bg-zinc-900 text-slate-400 hover:border-sky-500/50 hover:text-slate-100'}`}>
              {regionAnzeige({ region: r })}
            </button>
          ))}
        </div>

        <nav className="flex flex-wrap gap-1 self-start rounded-full border border-zinc-800 bg-zinc-900 p-1 shadow-sm">
          {REITER.map(([k, titel]) => (
            <button key={k} type="button" onClick={() => waehle(region, k)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${reiter === k ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`}>
              <T>{titel}</T>
            </button>
          ))}
        </nav>

        {laedt && !daten && <LadeSchirm />}
        {fehler && !daten && !laedt && (
          <p className="rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-8 text-center text-sm text-slate-400">{fehler}</p>
        )}

        {daten && reiter === 'weg' && <Weg daten={daten} auf={(r) => waehle(region, r)} />}
        {daten && reiter === 'qualifiziert' && (
          <Qualifiziert daten={daten} oeffne={(s, w) => { const f = daten.fenster.find((x) => x.windowId === w) ?? daten.fenster.find((x) => x.art === 'finale'); if (f && eventVon(f.windowId)) setPanel({ id: s.id, name: s.anzeige, windowId: f.windowId }); }} />
        )}
        {daten && reiter === 'heats' && (
          <div className="grid gap-5 xl:grid-cols-2">
            {art('heat').length ? art('heat').map((h) => <Tafel key={h.windowId} f={h} finalisten={finalisten} ziel={t('Grand Finals')} oeffne={oeffneIn(h.windowId)} />)
              : <Karte2 className="xl:col-span-2"><p className="py-6 text-center text-sm text-slate-500"><T>Noch keine Heats eingeteilt.</T></p></Karte2>}
          </div>
        )}
        {daten && reiter === 'lastchance' && (
          /* Die Tafeln links, daneben die Laender - so wie beim Finale (Betreiber, 19.10.2026: "Player Countries neben die Liste"). */
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid content-start gap-5 2xl:grid-cols-2">
              {lastChance.length ? lastChance.map((h) => <Tafel key={h.windowId} f={h} finalisten={finalisten} ziel={t('Grand Finals')} oeffne={oeffneIn(h.windowId)} />)
                : <Karte2 className="2xl:col-span-2"><p className="py-6 text-center text-sm text-slate-500"><T>Noch keine Last Chance eingeteilt.</T></p></Karte2>}
            </div>
            {lastChance.length > 0 && <LaenderSpalte spieler={lastChance.flatMap((f) => f.spieler)} />}
          </div>
        )}
        {daten && reiter === 'finale' && (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid content-start gap-5 2xl:grid-cols-2">
              {finale.length ? finale.map((h) => <Tafel key={h.windowId} f={h} oeffne={oeffneIn(h.windowId)} />)
                : <Karte2 className="2xl:col-span-2"><p className="py-6 text-center text-sm text-slate-500"><T>Das Finale steht noch nicht fest.</T></p></Karte2>}
            </div>
            {finale.length > 0 && <LaenderSpalte spieler={finale.flatMap((f) => f.spieler)} />}
          </div>
        )}
        {daten && reiter === 'karte' && (
          <Karte2>
            {!HAT_KARTE.has(region) ? (
              <p className="py-10 text-center text-sm text-slate-500"><T>Für diese Region gibt es keine Quelle für Landepunkte.</T></p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {kartenFenster.map((f) => (
                    <button key={f.windowId} type="button" onClick={() => setWahlKarte(f.windowId)}
                      className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${aktivKarte?.windowId === f.windowId ? 'border-sky-500 bg-sky-500 text-white' : 'border-zinc-800 text-slate-400 hover:border-sky-500/50 hover:text-slate-100'}`}>
                      {f.name}{f.formen.length ? '' : ' ·  –'}
                    </button>
                  ))}
                </div>
                <div className="mt-4">
                  {aktivKarte && (aktivKarte.formen.length
                    ? <Karte key={aktivKarte.windowId} f={aktivKarte} bild={aktivKarte.bild} rotAb={2} />
                    : <p className="py-10 text-center text-sm text-slate-500"><T>Für diesen Spieltag sind noch keine Landepunkte eingetragen.</T></p>)}
                </div>
                <p className="mt-3 text-center text-[11px] text-slate-500">
                  <T>Landepunkte von</T> {daten.quelle === 'noble' ? 'Noble Practice' : 'Vital Scrims'}
                </p>
              </>
            )}
          </Karte2>
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
