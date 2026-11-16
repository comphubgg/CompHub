'use client';

/*
 * Prospects (Betreiber, 15.11.2026; neu gerechnet am 16.11.2026): junge Spieler auf dem Weg nach oben. Gerechnet in scripts/spieler-kreis.mjs (Fakten je Konto) und
 * app/api/prospects (Seed-Liste der Redaktion, Pflege, Reihenfolge), gepflegt im Admin (/admin/prospects).
 * Eigene Optik: blau auf dunkel wie der Rest der Statistik, drei Spalten, Rang - Flagge - Name - Region - Rating, darunter in einer Zeile, warum jemand drinsteht.
 * Kein Gruen, kein Gelb.
 */

import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import { useSprache } from '@/app/components/SprachProvider';
import TeamFlagge from '@/components/TeamFlagge';
import { ortVon } from '@/app/lib/ort';
import { REGIONEN_REIHE, regionFarbe } from '@/lib/regionFarbe';

interface Grund {
  quelle: 'seed' | 'add' | 'auto'; kern: boolean; prRang: number | null; prPunkte: number | null; neu: number | null;
  durchbruch: { datum: number; titel: string; platz: number; art: 'fncs' | 'cup' } | null; trend: number | null; grandFinals: number | null; etabliert: boolean;
}
interface Zeile { rang: number; epicId: string; name: string; region: string; land: string | null; rating: number; stern: boolean; grund: Grund }
interface Regeln {
  aktivTage: number; minEvents: number; jahre: number; neu: number; trend: number; trendMax: number; prMax: number; t10Feld: number; gfSaisons: number; podien: number;
  referenz: number; stand: number; prStand: number | null; kandidaten: number; seed: number;
}
interface Antwort { titelJahr: number; regeln: Regeln | null; liste: Zeile[] }

function Stern() {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" aria-label="Top 11" className="shrink-0 text-sky-300 drop-shadow-[0_0_6px_rgba(56,189,248,.55)]">
      <path fill="currentColor" d="M10 1.6l2.5 5.4 5.9.6-4.4 4 1.3 5.8L10 14.4l-5.3 3 1.3-5.8-4.4-4 5.9-.6z" />
    </svg>
  );
}

/** Ein Cup-Titel fuer die Zeile: der Titel von Epic, sonst die Kennung ohne Saison und Region lesbar gemacht. */
const titelVon = (t: string) => (/^S\d+_/.test(t) ? t.replace(/^S\d+_/, '').replace(/_(EU|NAC|NAW|NAE|BR|OCE|ME|ASIA)(_.*)?$/, '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2') : t);

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
  const monat = (ms: number) => new Intl.DateTimeFormat(ort, { month: 'short', year: 'numeric' }).format(new Date(ms));
  const datum = (ms: number) => new Intl.DateTimeFormat(ort, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms));
  const zahl = (n: number) => new Intl.NumberFormat(ort).format(n);
  const chip = (an: boolean) => `rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${an ? 'bg-sky-500 text-white' : 'border border-white/10 bg-zinc-900 text-slate-300 hover:border-sky-500/60 hover:text-sky-300'}`;
  const fuell = (s: string, w: Record<string, string | number>) => Object.entries(w).reduce((a, [k, v]) => a.replace(`{${k}}`, String(v)), t(s));

  /** Kurz: warum steht jemand drin. Lang (Tooltip): alles, was in die Rechnung einging. */
  const kurz = (g: Grund) => {
    const teile: string[] = [];
    if (g.quelle !== 'auto') teile.push(t('Redaktion'));
    else if (g.durchbruch) teile.push(`${t('Durchbruch')} ${monat(g.durchbruch.datum)}`);
    if (g.prRang) teile.push(`PR #${g.prRang}`);
    if (g.trend != null && Math.abs(g.trend) >= 0.03) teile.push(g.trend > 0 ? t('Trend ↑') : t('Trend ↓'));
    return teile.join(' · ');
  };
  const lang = (z: Zeile) => {
    const g = z.grund;
    const zeilen = [
      g.quelle === 'seed' ? t('Redaktionelle Seed-Liste: gilt als junges Talent') : g.quelle === 'add' ? t('Von der Redaktion aufgenommen') : t('Automatisch gefunden'),
      g.prRang && g.prPunkte ? `${t('Epic Power Ranking')}: #${g.prRang} (${zahl(g.prPunkte)})` : '',
      g.durchbruch ? `${t('Durchbruch')}: ${titelVon(g.durchbruch.titel)} #${g.durchbruch.platz} · ${datum(g.durchbruch.datum)}` : '',
      g.neu != null ? `${t('Neu')}: ${g.neu.toFixed(2)}` : '',
      g.trend != null ? `${t('Trend')}: ${g.trend >= 0 ? '+' : ''}${g.trend.toFixed(2)}` : '',
      g.grandFinals != null ? `${t('Grand Finals')}: ${g.grandFinals}` : '',
    ];
    return zeilen.filter(Boolean).join('\n');
  };

  return (
    <section>
      <div className="relative mb-5 overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/[0.12] via-zinc-900 to-zinc-950 p-5 sm:p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-400"><T>Die nächste Generation</T></p>
        <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-50 sm:text-4xl">Prospects <span className="text-sky-400">{jahr}</span></h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          <T>Junge Spieler, die gerade nach oben kommen und noch nicht etabliert sind. Das Niveau kommt aus Epics weltweitem Power Ranking, dazu zählt, wie frisch der Durchbruch ist und wohin die Form zeigt. Wer schon mehrere Grand Finals hinter sich hat oder eines in EU oder NA gewonnen hat, steht nicht mehr hier.</T>
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Region">
          <button type="button" onClick={() => setRegion('')} className={chip(region === '')}><T>Alle</T></button>
          {REGIONEN_REIHE.map((x) => <button key={x} type="button" onClick={() => setRegion(x)} className={chip(region === x)}>{x}</button>)}
        </div>
        <button type="button" onClick={() => setRegelnOffen((o) => !o)} aria-expanded={regelnOffen}
          className="ml-auto rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-sky-500/60 hover:text-sky-300">
          <T>So entsteht die Liste</T> {regelnOffen ? '▴' : '▾'}
        </button>
      </div>

      {regelnOffen && (
        <div className="mb-5 rounded-xl border border-white/[0.08] bg-zinc-900 p-4 text-sm leading-relaxed text-slate-300">
          <h3 className="mb-2 text-sm font-extrabold text-slate-100"><T>So entsteht die Liste</T></h3>
          <ol className="list-decimal space-y-1.5 pl-5 text-[13px] text-slate-400">
            <li><span className="font-semibold text-slate-200"><T>Niveau.</T></span> <T>Epics Power Ranking – eine einzige weltweite Wertung über alle Turniere, mit Gewicht je Event und Verfall älterer Ergebnisse. Regionen werden so vergleichbar, ohne dass wir sie von Hand gewichten.</T></li>
            <li><span className="font-semibold text-slate-200"><T>Noch nicht etabliert.</T></span> {fuell('Grand Finals in höchstens {gf} Saisons, höchstens {p} Podium und kein Grand-Final-Sieg in EU oder NA. Gezählt werden die Grand Finals seit 2019 über die Epic-Konto-Id.', { gf: (r?.gfSaisons ?? 4) - 1, p: (r?.podien ?? 2) - 1 })}</li>
            <li><span className="font-semibold text-slate-200"><T>Frisch oben.</T></span> {fuell('Der Durchbruch – das erste Top 10 in einem Cash, Victory, Elite oder Series Cup bzw. einer Performance Evaluation mit mindestens {feld} Teams, oder die erste FNCS-Runde ab Runde 3 – liegt höchstens {j} Jahre zurück. Je frischer, desto mehr zählt er: bis zu {neu} Punkte, nach {j} Jahren keine mehr.', { feld: r?.t10Feld ?? 300, j: r?.jahre ?? 3, neu: zahl(r?.neu ?? 5000) })}</li>
            <li><span className="font-semibold text-slate-200"><T>Redaktion.</T></span> <T>Ein Alter steht in keiner Bestenliste. Spieler, von denen die Redaktion weiß, dass sie jung sind, stehen auf einer Seed-Liste und zählen als ganz frisch – auch wenn ihr erstes Top 10 schon länger her ist.</T></li>
            <li><span className="font-semibold text-slate-200"><T>Trend.</T></span> {fuell('Unsere Platzierungsnote der neueren Hälfte der letzten 20 Wettkampf-Spieltage in der Heimatregion gegen die ältere, begrenzt auf ±{max} – das sind höchstens ±{pkt} Punkte.', { max: r?.trendMax ?? 0.1, pkt: Math.round((r?.trendMax ?? 0.1) * (r?.trend ?? 2000)) })}</li>
            <li><span className="font-semibold text-slate-200">Rating.</span> {fuell('Power-Ranking-Punkte + Frische + Trend, geteilt durch {ref} – den Mittelwert der etablierten Profis unter den ersten 500. Über 1 heißt: auf dem Niveau der etablierten Spitze, die Frische eingerechnet.', { ref: zahl(r?.referenz ?? 33000) })}</li>
            <li><span className="font-semibold text-slate-200"><T>Pflege.</T></span> <T>Die Redaktion kann Spieler aufnehmen oder entfernen, Sterne setzen und Plätze festlegen; ein fester Platz geht der Rechnung vor. Sterne stehen sonst bei den ersten elf.</T></li>
          </ol>
          {r && <p className="mt-3 text-[11px] text-slate-500">{t('Stand')}: {datum(r.stand)}{r.prStand ? ` · Power Ranking ${datum(r.prStand)}` : ''} · {r.kandidaten} {t('Kandidaten')} · {r.seed} {t('auf der Seed-Liste')}</p>}
        </div>
      )}

      {laedt && <div className="h-96 animate-pulse rounded-xl bg-zinc-900/70" />}
      {!laedt && !d && <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 text-center text-sm text-slate-500"><T>Die Zahlen sind gerade nicht erreichbar. Es wird gleich noch einmal versucht.</T></p>}
      {d && !d.liste.length && <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 text-center text-sm text-slate-500"><T>Noch keine Prospects in dieser Region.</T></p>}
      {d && d.liste.length > 0 && (
        <ol className="gap-x-3 sm:columns-2 lg:columns-3">
          {d.liste.map((z, i) => (
            <li key={z.epicId} className="mb-1.5 break-inside-avoid">
              <button type="button" onClick={() => aufSpieler?.(z.epicId, z.name)} title={lang(z)}
                className={`group flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition hover:border-sky-500/60 hover:bg-sky-500/[0.06] ${z.stern ? 'border-sky-500/25 bg-sky-500/[0.05]' : 'border-white/[0.06] bg-zinc-900'}`}>
                <span className="w-7 shrink-0 text-right text-xs font-black tabular-nums text-slate-500 group-hover:text-sky-300">{region ? i + 1 : z.rang}</span>
                <TeamFlagge groesse={18} laender={[z.land ?? undefined]} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-slate-100">{z.name}</span>
                    {z.stern && <Stern />}
                  </span>
                  <span className="block truncate text-[10px] text-slate-500">{kurz(z.grund)}</span>
                </span>
                <span className={`shrink-0 rounded border px-1.5 py-px text-[10px] font-bold tracking-wider ${regionFarbe(z.region).marke}`}>{z.region || '–'}</span>
                <span className={`w-11 shrink-0 text-right text-sm font-extrabold tabular-nums ${z.rating > 1 ? 'text-sky-300' : 'text-slate-300'}`}>{z.rating.toFixed(2)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
