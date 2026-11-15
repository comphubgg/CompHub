'use client';

/*
 * Prospects (Betreiber, 15.11.2026): wer neu oben ankommt. Ein Alter kennen wir nicht - neu ist, wessen erster nennenswerter Auftritt (FNCS ab Runde 3 oder
 * Top 100 in einem grossen Cup) kurz zurueckliegt. Gerechnet in scripts/spieler-kreis.mjs, gepflegt im Admin (/admin/prospects), ausgeliefert von /api/prospects.
 * Eigene Optik: blau auf dunkel wie der Rest der Statistik, drei Spalten, Rang - Flagge - Name - Region - Rating, Stern fuer die ersten elf.
 */

import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import { useSprache } from '@/app/components/SprachProvider';
import TeamFlagge from '@/components/TeamFlagge';
import { ortVon } from '@/app/lib/ort';
import { REGIONEN_REIHE, regionFarbe } from '@/lib/regionFarbe';

interface Zeile {
  rang: number; epicId: string; name: string; region: string; land: string | null; rating: number; stern: boolean;
  events: number | null; trend: number | null; manuell: boolean;
  erstes: { datum: number; windowId: string; titel: string; platz: number; art: 'fncs' | 'cup'; nachLuecke?: boolean } | null;
}
interface Regeln {
  tage: number; aktivTage: number; spitze: number; luecke: number; lueckeNach: number; ab: number; minEvents: number; trendGewicht: number; trendMax: number; trendVoll: number; stuetze: number; referenz: number;
  stand: number; kandidaten: number;
}
interface Antwort { titelJahr: number; regeln: Regeln | null; liste: Zeile[] }

function Stern() {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" aria-label="Top 11" className="shrink-0 text-sky-300 drop-shadow-[0_0_6px_rgba(56,189,248,.55)]">
      <path fill="currentColor" d="M10 1.6l2.5 5.4 5.9.6-4.4 4 1.3 5.8L10 14.4l-5.3 3 1.3-5.8-4.4-4 5.9-.6z" />
    </svg>
  );
}

export default function Prospects({ aufSpieler }: { aufSpieler?: (id: string, name: string) => void }) {
  const { sprache, t } = useSprache();
  const ort = ortVon(sprache);
  const [region, setRegion] = useState('');
  const [daten, setDaten] = useState<{ region: string; d: Antwort | null } | null>(null);
  const [regelnOffen, setRegelnOffen] = useState(false);

  useEffect(() => {
    let weg = false;
    fetch(`/api/prospects${region ? `?region=${region}` : ''}`).then((r) => r.json())
      .then((d: Antwort) => { if (!weg) setDaten({ region, d: Array.isArray(d?.liste) ? d : null }); })
      .catch(() => { if (!weg) setDaten({ region, d: null }); });
    return () => { weg = true; };
  }, [region]);

  const d = daten?.region === region ? daten.d : null;
  const laedt = daten?.region !== region;
  const jahr = d?.titelJahr ?? new Date().getFullYear() + 1;
  const r = d?.regeln;
  const datum = (ms: number) => new Intl.DateTimeFormat(ort, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms));
  const chip = (an: boolean) => `rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${an ? 'bg-sky-500 text-white' : 'border border-white/10 bg-zinc-900 text-slate-300 hover:border-sky-500/60 hover:text-sky-300'}`;

  return (
    <section>
      <div className="relative mb-5 overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/[0.12] via-zinc-900 to-zinc-950 p-5 sm:p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-400"><T>Neu an der Spitze</T></p>
        <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-50 sm:text-4xl">Prospects <span className="text-sky-400">{jahr}</span></h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          <T>Spieler, deren Durchbruch höchstens zwei Jahre zurückliegt, geordnet nach ihrer aktuellen Form. Wir kennen kein Alter – gezählt wird allein, wann ein Konto zum ersten Mal ein FNCS-Finale, einen Heat oder Runde 3 erreicht hat oder in einem großen Cup unter die Top 10 kam.</T>
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Region">
          <button type="button" onClick={() => setRegion('')} className={chip(region === '')}><T>Alle</T></button>
          {REGIONEN_REIHE.map((x) => <button key={x} type="button" onClick={() => setRegion(x)} className={chip(region === x)}>{x}</button>)}
        </div>
        <button type="button" onClick={() => setRegelnOffen((o) => !o)} aria-expanded={regelnOffen}
          className="ml-auto rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-sky-500/60 hover:text-sky-300">
          <T>So werden Prospects gewählt</T> {regelnOffen ? '▴' : '▾'}
        </button>
      </div>

      {regelnOffen && (
        <div className="mb-5 rounded-xl border border-white/[0.08] bg-zinc-900 p-4 text-sm leading-relaxed text-slate-300">
          <h3 className="mb-2 text-sm font-extrabold text-slate-100"><T>So werden Prospects gewählt</T></h3>
          <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-slate-400">
            <li><span className="font-semibold text-slate-200"><T>Durchbruch.</T></span> {t('Der erste Spieltag auf Spitzenniveau: eine FNCS-Runde ab Runde 3 (Heat, Halbfinale, Finale, Division-1-Finale) oder ein Top-{spitze}-Platz in einem Cash, Victory, Elite oder Series Cup bzw. einer Performance Evaluation. Durchsucht wird unsere ganze gespeicherte Geschichte bis 2019, allein über die Epic-Konto-Id – ein neuer Name macht niemanden neu.').replace('{spitze}', String(r?.spitze ?? 10))}</li>
            <li><span className="font-semibold text-slate-200"><T>Lücken.</T></span> {t('In manchen Monaten fehlen uns Bestenlisten. Liegt der Durchbruch höchstens {nach} Tage nach einer solchen Lücke (mindestens {luecke} Tage ohne FNCS- oder großen Cup-Spieltag), könnte er eigentlich früher gewesen sein: dann zählt das früheste starke Ergebnis, das wir überhaupt haben (FNCS ab Runde 3 oder Top 25).').replace('{nach}', String(r?.lueckeNach ?? 60)).replace('{luecke}', String(r?.luecke ?? 45))}</li>
            <li><span className="font-semibold text-slate-200"><T>Zeitfenster.</T></span> {t('Der Durchbruch liegt höchstens {tage} Tage zurück (etwa zwei Jahre), und in den letzten {aktiv} Tagen stehen mindestens {min} Spieltage in unseren Bestenlisten. Zero Build, Mobile und Ranked zählen nicht.').replace('{tage}', String(r?.tage ?? 730)).replace('{aktiv}', String(r?.aktivTage ?? 183)).replace('{min}', String(r?.minEvents ?? 5))}</li>
            <li><span className="font-semibold text-slate-200"><T>Niveau.</T></span> {t('Die aktuelle Form entscheidet: unsere Platzierungsnote über die letzten 20 Wettkampf-Spieltage (FNCS, Cash, Victory, Elite, Series Cup, Performance Evaluation) in der Heimatregion – 1 − log(Platz) / log(Feld), Regionen gewichtet, das schlechteste Fünftel fällt weg. Damit wenige gute Cups noch kein Beweis sind, wird sie mit {s} gedachten Spieltagen auf Höhe der Referenz gemischt.').replace('{s}', String(r?.stuetze ?? 5))}</li>
            <li><span className="font-semibold text-slate-200"><T>Trend.</T></span> {t('Note der neueren Hälfte dieser Spieltage minus Note der älteren Hälfte, begrenzt auf ±{max}; unter {voll} Spieltagen zählt er anteilig.').replace('{max}', String(r?.trendMax ?? 0.2)).replace('{voll}', String(r?.trendVoll ?? 10))}</li>
            <li><span className="font-semibold text-slate-200">Rating.</span> {t('(Niveau + {g} × Trend) / Referenz. Die Referenz ({ref}) ist die mittlere Note aller etablierten Spieler unseres Spielerkreises, die im letzten halben Jahr gespielt haben – ein Rating über 1 heißt: stärker als der typische etablierte Spieler.').replace('{g}', String(r?.trendGewicht ?? 0.25)).replace('{ref}', String(r?.referenz ?? '–'))}</li>
            <li><span className="font-semibold text-slate-200"><T>Pflege.</T></span> <T>Die Redaktion kann Spieler aufnehmen oder entfernen, Sterne setzen und Plätze festlegen; ein fester Platz geht der Rechnung vor. Sterne stehen sonst bei den ersten elf.</T></li>
          </ol>
          {r && <p className="mt-3 text-[11px] text-slate-500">{t('Stand')}: {datum(r.stand)} · {r.kandidaten} {t('Kandidaten')} · {t('Durchbruch ab')} {datum(r.ab)}</p>}
        </div>
      )}

      {laedt && <div className="h-96 animate-pulse rounded-xl bg-zinc-900/70" />}
      {!laedt && !d && <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 text-center text-sm text-slate-500"><T>Die Zahlen sind gerade nicht erreichbar. Es wird gleich noch einmal versucht.</T></p>}
      {d && !d.liste.length && <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 text-center text-sm text-slate-500"><T>Noch keine Prospects in dieser Region.</T></p>}
      {d && d.liste.length > 0 && (
        <ol className="gap-x-3 sm:columns-2 lg:columns-3">
          {d.liste.map((z, i) => {
            const gruen = z.rating > 1;
            const erstes = z.erstes ? `${t('Durchbruch')}: ${z.erstes.titel || z.erstes.windowId} · #${z.erstes.platz} · ${datum(z.erstes.datum)}` : t('Von der Redaktion aufgenommen');
            return (
              <li key={z.epicId} className="mb-1.5 break-inside-avoid">
                <button type="button" onClick={() => aufSpieler?.(z.epicId, z.name)} title={erstes}
                  className={`group flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition hover:border-sky-500/60 hover:bg-sky-500/[0.06] ${z.stern ? 'border-sky-500/25 bg-sky-500/[0.05]' : 'border-white/[0.06] bg-zinc-900'}`}>
                  <span className="w-7 shrink-0 text-right text-xs font-black tabular-nums text-slate-500 group-hover:text-sky-300">{region ? i + 1 : z.rang}</span>
                  <TeamFlagge groesse={18} laender={[z.land ?? undefined]} />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-100">{z.name}</span>
                  {z.stern && <Stern />}
                  <span className={`shrink-0 rounded border px-1.5 py-px text-[10px] font-bold tracking-wider ${regionFarbe(z.region).marke}`}>{z.region || '–'}</span>
                  <span className={`w-11 shrink-0 text-right text-sm font-extrabold tabular-nums ${gruen ? 'text-emerald-400' : 'text-slate-300'}`}>{z.rating.toFixed(2)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
