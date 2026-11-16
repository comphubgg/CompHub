'use client';

/*
 * Prospects (Betreiber, 15.11.2026; neu am 16.11.2026): junge Spieler auf dem Weg nach oben - allein aus unseren eigenen Daten gerechnet (scripts/prospects.mjs,
 * gelesen von app/api/prospects). Keine Namensliste von aussen, keine Reihenfolge von Hand; im Admin (/admin/prospects) laesst sich ein Konto nur ausblenden.
 * Eigene Optik: blau auf dunkel wie der Rest der Statistik, Rang - Flagge - Name - Region - Score, darunter in einer Zeile, was ihn auszeichnet.
 */

import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import { useSprache } from '@/app/components/SprachProvider';
import TeamFlagge from '@/components/TeamFlagge';
import { ortVon } from '@/app/lib/ort';
import { REGIONEN_REIHE, regionFarbe } from '@/lib/regionFarbe';

interface Zeile {
  rang: number; epicId: string; name: string; region: string; land: string | null; score: number; niveau: number; spitze: number; replay: number | null;
  replayCups: number; ergebnisse: number; form: number | null; formVorher: number | null; stern: boolean; preisgeld: number; gf: number; gfBeste: number | null;
  ersterGf: number | null; fruehSaisons: number; erstes: number | null; ersteSpitze: [number, string, number] | null; beste: [number, string, number, number] | null; pr: number | null;
}
interface Regeln {
  karriereTage: number; halbTage: number; aktivTage: number; aktivMin: number; gNiveau: number; gSpitze: number; gReplay: number; replayMin: number;
  formTage: number; formMin: number; sternPlus: number; spitzeNote: number; jungSaisons: number; jungTage: number; etabliertGeld: number; etabliertGf: number;
}
interface Antwort { titelJahr: number; kopf: { stand: number; prospects: number; regeln: Regeln } | null; liste: Zeile[] }

function Stern({ titel }: { titel: string }) {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" role="img" aria-label={titel} className="shrink-0 text-sky-300 drop-shadow-[0_0_6px_rgba(56,189,248,.55)]">
      <title>{titel}</title>
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
  const r = d?.kopf?.regeln;
  const monat = (ms: number) => new Intl.DateTimeFormat(ort, { month: 'short', year: 'numeric' }).format(new Date(ms));
  const datum = (ms: number) => new Intl.DateTimeFormat(ort, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms));
  const zahl = (n: number) => new Intl.NumberFormat(ort).format(n);
  const prozent = (x: number) => `${Math.round(x * 100)} %`;
  const chip = (an: boolean) => `rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${an ? 'bg-sky-500 text-white' : 'border border-white/10 bg-zinc-900 text-slate-300 hover:border-sky-500/60 hover:text-sky-300'}`;
  const fuell = (s: string, w: Record<string, string | number>) => Object.entries(w).reduce((a, [k, v]) => a.split(`{${k}}`).join(String(v)), t(s));
  const sternText = t('Form klar gestiegen');

  /** Kurz: das beste Ergebnis der letzten zwoelf Monate und der Platz im Power Ranking. */
  const kurz = (z: Zeile) => [
    z.beste ? `${titelVon(z.beste[1])} #${z.beste[2]}` : '',
    z.pr ? `PR #${z.pr}` : '',
  ].filter(Boolean).join(' · ');
  /** Lang (Tooltip): alles, was in die Rechnung einging. */
  const lang = (z: Zeile) => [
    `Score ${z.score.toFixed(1)} = ${t('Niveau')} ${prozent(z.niveau)} · ${t('Spitze')} ${prozent(z.spitze)}${z.replay != null ? ` · Replay ${prozent(z.replay)} (${z.replayCups} Cups)` : ''}`,
    `${z.ergebnisse} ${t('Wettkampf-Ergebnisse in zwei Jahren')}`,
    z.form != null && z.formVorher != null ? `${t('Form: Jahr → letzte 6 Wochen')}: ${prozent(z.formVorher)} → ${prozent(z.form)}` : '',
    z.erstes ? `${t('In unseren Bestenlisten seit')} ${monat(z.erstes)}` : '',
    z.ersterGf ? `${t('Erstes Grand Final')}: ${monat(z.ersterGf)}${z.gf > 1 ? ` (${z.gf} ${t('Saisons')})` : ''}` : t('Noch kein Grand Final'),
    `${t('Preisgeld gewonnen')}: $${zahl(z.preisgeld)}`,
  ].filter(Boolean).join('\n');

  return (
    <section>
      <div className="relative mb-5 overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/[0.12] via-zinc-900 to-zinc-950 p-5 sm:p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-400"><T>Die nächste Generation</T></p>
        <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-50 sm:text-4xl">Prospects <span className="text-sky-400">{jahr}</span></h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          <T>Gerechnet nur aus unseren eigenen Bestenlisten: jede Platzierung der noch jungen Karriere zählt, neuere mehr als ältere und FNCS-Runden mehr als offene Cups, dazu die besten Ergebnisse des letzten Jahres und – wo wir die Replays gelesen haben – Schaden und Schadensquote.</T>
          {' '}
          <span className="inline-flex items-baseline gap-1"><Stern titel={sternText} /></span>{' '}
          <T>heißt: in den letzten sechs Wochen klar stärker als im Jahr davor.</T>
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
            <li><span className="font-semibold text-slate-200"><T>Jede Platzierung.</T></span> <T>Nur Wettkampf: FNCS, Cash, Victory, Elite und Series Cups, Performance Evaluations – kein Zero Build, Reload, Ranked, Mobile oder Skin-Cup. Platz 1 ist 1,0; in einem offenen Feld zählt der Platz auf einer Log-Skala gegen 30.000, in einer gesiebten Runde gegen ihr Feld, mit einem Sockel dafür, sie überhaupt erreicht zu haben (Finale 0,60, Heats & Co. 0,45, sonst 0,30).</T></li>
            <li><span className="font-semibold text-slate-200"><T>Die ganze junge Karriere.</T></span> {fuell('Alle Ergebnisse der letzten {jahre} Jahre, nicht nur die letzten 20 Cups. Ein Ergebnis zählt halb so viel, wenn es {halb} Tage alt ist; Finals dreifach, Heats doppelt, Duos 0,8, Trios und Squads 0,7. Das schlechteste Fünftel fällt weg.', { jahre: Math.round((r?.karriereTage ?? 730) / 365), halb: r?.halbTage ?? 180 })}</li>
            <li><span className="font-semibold text-slate-200">Score.</span> {fuell('{n} Niveau (der gewichtete Schnitt) + {s} Spitze (die fünf besten Ergebnisse des letzten Jahres) + {r} Replay (Schaden je Spiel und Schadensquote im Vergleich zum selben Feld, ab {min} gelesenen Cups; sonst teilen sich die beiden anderen den Anteil).', { n: prozent(r?.gNiveau ?? 0.55), s: prozent(r?.gSpitze ?? 0.25), r: prozent(r?.gReplay ?? 0.2), min: r?.replayMin ?? 3 })}</li>
            <li><span className="font-semibold text-slate-200"><T>Stern.</T></span> {fuell('Der Schnitt der letzten {tage} Tage liegt mindestens {plus} Punkte über dem des Jahres davor, mit je mindestens {min} Ergebnissen.', { tage: r?.formTage ?? 42, plus: (r?.sternPlus ?? 0.12).toFixed(2), min: r?.formMin ?? 5 })}</li>
            <li><span className="font-semibold text-slate-200"><T>Junge Karriere.</T></span> {fuell('Das erste Grand Final ist höchstens {j} Jahre her (oder steht noch aus), und vor den letzten zwölf Monaten gab es Spitzen-Ergebnisse (Note ab {note}, etwa Top 13 eines offenen Cups) in höchstens {s} Saisons. Ein Alter steht in keiner Bestenliste – wer früher nur mitlief, zählt als jung.', { j: Math.round((r?.jungTage ?? 730) / 365), note: (r?.spitzeNote ?? 0.75).toFixed(2), s: r?.jungSaisons ?? 3 })}</li>
            <li><span className="font-semibold text-slate-200"><T>Noch nicht etabliert.</T></span> {fuell('Unter {geld} $ Preisgeld, Grand Finals in weniger als {gf} Saisons und nie auf dem Podium eines Grand Finals.', { geld: zahl(r?.etabliertGeld ?? 25000), gf: r?.etabliertGf ?? 4 })}</li>
            <li><span className="font-semibold text-slate-200"><T>Aktiv.</T></span> {fuell('Mindestens {min} Wettkampf-Ergebnisse im letzten halben Jahr.', { min: r?.aktivMin ?? 8 })}</li>
          </ol>
          {d?.kopf && <p className="mt-3 text-[11px] text-slate-500">{t('Stand')}: {datum(d.kopf.stand)} · {zahl(d.kopf.prospects)} {t('Spieler erfüllen die Bedingungen')}</p>}
        </div>
      )}

      {laedt && <div className="h-96 animate-pulse rounded-xl bg-zinc-900/70" />}
      {!laedt && !d && <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 text-center text-sm text-slate-500"><T>Die Zahlen sind gerade nicht erreichbar. Es wird gleich noch einmal versucht.</T></p>}
      {d && !d.liste.length && <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 text-center text-sm text-slate-500">{d.kopf ? <T>Noch keine Prospects in dieser Region.</T> : <T>Die Liste wird gerade neu gerechnet.</T>}</p>}
      {d && d.liste.length > 0 && (
        <ol className="gap-x-3 sm:columns-2 lg:columns-3">
          {d.liste.map((z) => (
            <li key={z.epicId} className="mb-1.5 break-inside-avoid">
              <button type="button" onClick={() => aufSpieler?.(z.epicId, z.name)} title={lang(z)}
                className={`group flex w-full min-w-0 items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition hover:border-sky-500/60 hover:bg-sky-500/[0.06] ${z.stern ? 'border-sky-500/25 bg-sky-500/[0.05]' : 'border-white/[0.06] bg-zinc-900'}`}>
                <span className="w-7 shrink-0 text-right text-xs font-black tabular-nums text-slate-500 group-hover:text-sky-300">{z.rang}</span>
                <TeamFlagge groesse={18} laender={[z.land ?? undefined]} />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-slate-100">{z.name}</span>
                    {z.stern && <Stern titel={sternText} />}
                  </span>
                  <span className="block truncate text-[10px] text-slate-500">{kurz(z)}</span>
                </span>
                <span className={`shrink-0 rounded border px-1.5 py-px text-[10px] font-bold tracking-wider ${regionFarbe(z.region).marke}`}>{z.region || '–'}</span>
                <span className="w-10 shrink-0 text-right text-sm font-extrabold tabular-nums text-slate-200">{z.score.toFixed(1)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
