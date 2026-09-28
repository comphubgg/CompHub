'use client';

/*
 * Head to Head - Duo gegen Duo (oder Solo gegen Solo) ueber die Finals.
 *
 * Der Betreiber (28.9.2026) zeigte die Tafel eines Streams (Chapix, "FNCS
 * 2026 · Global Championship · Day 1 · Head to Head"): zwei Duos mit Fotos,
 * in der Mitte "Finals reached 4 of 4", "Best Div 1 final", "Avg. final
 * place", "Damage per game", "Elims per game". Dazu:
 *   - "dass ich auch Duos ... machen kann", Solos bleiben, wie sie sind;
 *   - Zeitraum waehlbar: diese Season, dieses Jahr - oder ein einzelner Cup;
 *   - hat sich ein Team fuer ein Finale nicht qualifiziert, steht dort
 *     "Not qualified", nicht "nicht gespielt".
 *
 * Grundlage sind dieselben Zeilen wie im Profil (/api/szene-stats?spieler=):
 * Werte je Spieler und Spieltag, dazu Platz und Mitspieler aus Epics
 * Bestenliste. Ein Duo-Wert ist die Summe beider Spieler an den Spieltagen,
 * an denen sie zusammen gespielt haben. Welche Finals es im Zeitraum gab,
 * sagt die Turnierliste der Statistik (dieselbe Auswahl: FNCS, Division 1,
 * Performance Cups, Globals) - nur so laesst sich "nicht qualifiziert" von
 * "kein Finale" unterscheiden.
 */

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import TeamFlagge from '@/components/TeamFlagge';
import { JAHR_SAISONS, jahrVonSaison } from '@/lib/saisonJahre';

export interface KopfSpieler {
  epicId: string; anzeige: string; land: string | null; bild: string | null;
  heimat: string; gepflegt?: boolean;
}

interface Zeile {
  event: string; windowId: string; region: string; season: string; datum: number;
  platz: number | null; punkte: number | null; mitspieler: string[];
  werte: {
    eliminations: number; damageDealt: number; damageTakenFromPlayers: number;
    matchesPlayed: number;
  };
}
interface Finale { windowId: string; name: string; region: string; season: string; datum: number }

type Zeitraum = 'saison' | 'jahr' | 'cup';

/** Das Ergebnis eines Teams an einem Finale - oder null: nicht qualifiziert. */
interface Ergebnis { platz: number | null; elims: number; damage: number; genommen: number; spiele: number }

const REGION_NAME: Record<string, string> = {
  EU: 'Europe', NAC: 'NA Central', NAW: 'NA West', BR: 'Brazil', ASIA: 'Asia', ME: 'Middle East', OCE: 'Oceania',
};

function ordinal(n: number, en: boolean) {
  if (!en) return `${n}.`;
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}

/** Ein Suchfeld fuer einen Spieler - dieselbe Suche wie ueberall in der Statistik. */
function Wahl({ wer, setWer, platzhalter, t }: {
  wer: KopfSpieler | null; setWer: (s: KopfSpieler | null) => void; platzhalter: string; t: (s: string) => string;
}) {
  const [q, setQ] = useState('');
  const [treffer, setTreffer] = useState<KopfSpieler[]>([]);
  useEffect(() => {
    const frage = q.trim();
    if (frage.length < 2) return undefined;
    let weg = false;
    const uhr = setTimeout(() => {
      fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(frage)}`)
        .then((r) => r.json()).then((j) => { if (!weg) setTreffer((j.spieler ?? []).slice(0, 8)); })
        .catch(() => { if (!weg) setTreffer([]); });
    }, 250);
    return () => { weg = true; clearTimeout(uhr); };
  }, [q]);
  if (wer) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
        <TeamFlagge groesse={18} laender={[wer.land ?? undefined]} />
        <span className="min-w-0 flex-1 truncate text-sm font-bold uppercase tracking-wide text-slate-100">{wer.anzeige}</span>
        <button onClick={() => setWer(null)} className="text-[11px] text-slate-600 transition hover:text-rose-400">
          <T>entfernen</T>
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={platzhalter}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
      {q.trim().length >= 2 && treffer.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-xl">
          {treffer.map((x) => (
            <button key={x.epicId} onClick={() => { setWer(x); setQ(''); setTreffer([]); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 transition hover:bg-zinc-900">
              <TeamFlagge groesse={16} laender={[x.land ?? undefined]} />
              <span className="min-w-0 flex-1 truncate">{x.anzeige}</span>
              <span className="text-[10px] text-slate-600">{x.heimat}</span>
            </button>
          ))}
        </div>
      )}
      {q.trim().length >= 2 && !treffer.length && <p className="mt-1 text-[10px] text-slate-600">{t('Niemand gefunden.')}</p>}
    </div>
  );
}

export default function KopfAnKopf({ saison, saisonTitel, sprache, t, festeTeams, festerCup }: {
  /** Die oben gewaehlte Saison ("S42"), leer: alle. */
  saison: string;
  /** Wie die Saison heisst ("Chapter 7 Season 4"). */
  saisonTitel?: string;
  sprache: string;
  t: (s: string) => string;
  /** Solo-Vergleich der Seite: die beiden Spieler stehen schon fest. */
  festeTeams?: [KopfSpieler[], KopfSpieler[]];
  festerCup?: string;
}) {
  const en = sprache === 'en';
  const [a1, setA1] = useState<KopfSpieler | null>(null);
  const [a2, setA2] = useState<KopfSpieler | null>(null);
  const [b1, setB1] = useState<KopfSpieler | null>(null);
  const [b2, setB2] = useState<KopfSpieler | null>(null);
  const [zeitraum, setZeitraum] = useState<Zeitraum>(festerCup ? 'cup' : 'saison');
  const [cup, setCup] = useState(festerCup ?? '');
  const [verlauf, setVerlauf] = useState<Record<string, Zeile[]>>({});
  const [finals, setFinals] = useState<Finale[]>([]);
  const [laedt, setLaedt] = useState(false);

  const teams: [KopfSpieler[], KopfSpieler[]] = festeTeams
    ?? [[a1, a2].filter(Boolean) as KopfSpieler[], [b1, b2].filter(Boolean) as KopfSpieler[]];
  const bereit = teams[0].length > 0 && teams[1].length > 0
    && (festeTeams || (teams[0].length === 2 && teams[1].length === 2));
  const jahr = jahrVonSaison(saison) || new Date().getUTCFullYear();
  const saisons = zeitraum === 'jahr' ? (JAHR_SAISONS[jahr] ?? []) : (saison ? [saison] : []);
  const ids = [...teams[0], ...teams[1]].map((s) => s.epicId);
  const schluessel = `${ids.join(',')}|${zeitraum === 'jahr' ? `j${jahr}` : saison}`;

  // Die Zeilen aller vier (zwei) Spieler und die Finals des Zeitraums.
  useEffect(() => {
    if (!bereit) return undefined;
    let weg = false;
    void Promise.resolve().then(async () => {
      setLaedt(true);
      const zeitParam = zeitraum === 'jahr' ? `jahr=${jahr}` : `saison=${encodeURIComponent(saison)}`;
      const v: Record<string, Zeile[]> = {};
      await Promise.all(ids.map(async (id) => {
        try {
          const j = await (await fetch(`/api/szene-stats?spieler=${id}&${zeitParam}`)).json();
          v[id] = (j.verlauf ?? []) as Zeile[];
        } catch { v[id] = []; }
      }));
      const f: Finale[] = [];
      for (const s of (saisons.length ? saisons : [saison]).filter(Boolean)) {
        try {
          const j = await (await fetch(`/api/szene-stats?ansicht=turniere&saison=${s}`)).json();
          for (const x of (j.turniere ?? []) as Array<Finale & { datum?: number }>) {
            if (!f.some((y) => y.windowId === x.windowId)) f.push({ ...x, datum: x.datum ?? 0 });
          }
        } catch { /* ohne Liste bleibt es bei den gespielten */ }
      }
      if (weg) return;
      setVerlauf(v); setFinals(f.sort((x, y) => x.datum - y.datum)); setLaedt(false);
    });
    return () => { weg = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bereit, schluessel]);

  /** Ergebnisse je Team und Finale (null: nicht qualifiziert). */
  const ergebnisse = useMemo(() => teams.map((team) => {
    const [x, y] = team;
    const raus = new Map<string, Ergebnis>();
    for (const z of verlauf[x?.epicId ?? ''] ?? []) {
      let partner: Zeile | undefined;
      if (y) {
        partner = (verlauf[y.epicId] ?? []).find((w) => w.windowId === z.windowId);
        if (!partner) continue;
        const zusammen = z.mitspieler.includes(y.epicId) || !z.mitspieler.length
          || (z.platz !== null && z.platz === partner.platz);
        if (!zusammen) continue;
      }
      const s = [z, partner].filter(Boolean) as Zeile[];
      raus.set(z.windowId, {
        platz: z.platz ?? partner?.platz ?? null,
        elims: s.reduce((a, w) => a + (w.werte.eliminations ?? 0), 0),
        damage: s.reduce((a, w) => a + (w.werte.damageDealt ?? 0), 0),
        genommen: s.reduce((a, w) => a + (w.werte.damageTakenFromPlayers ?? 0), 0),
        spiele: Math.max(...s.map((w) => w.werte.matchesPlayed ?? 0)),
      });
    }
    return raus;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [verlauf, schluessel]);

  /** Die Finals, die fuer ein Team zaehlen: die seiner Region plus die, die es gespielt hat. */
  const finalsFuer = (i: 0 | 1) => {
    const region = teams[i][0]?.heimat ?? '';
    const liste = finals.filter((f) => f.region === region || /global|MannekenPis|Dinosauron|BambiRaptor/i.test(`${f.name} ${f.windowId}`) || ergebnisse[i].has(f.windowId));
    return zeitraum === 'cup' && cup ? liste.filter((f) => f.windowId === cup) : liste;
  };
  const alleFinals = [...new Map([...finalsFuer(0), ...finalsFuer(1)].map((f) => [f.windowId, f])).values()]
    .sort((x, y) => x.datum - y.datum);
  const cupAuswahl = [...new Map([...finals.filter((f) => ergebnisse[0].has(f.windowId) || ergebnisse[1].has(f.windowId))]
    .map((f) => [f.windowId, f])).values()];

  const werte = ([0, 1] as const).map((i) => {
    const liste = finalsFuer(i);
    const gespielt = liste.map((f) => [f, ergebnisse[i].get(f.windowId)] as const).filter(([, e]) => e);
    const e = gespielt.map(([, x]) => x!);
    const spiele = e.reduce((a, x) => a + x.spiele, 0);
    const plaetze = gespielt.filter(([, x]) => x!.platz !== null) as Array<readonly [Finale, Ergebnis]>;
    const bestes = plaetze.length ? plaetze.reduce((m, x) => (x[1].platz! < m[1].platz! ? x : m)) : null;
    return {
      erreicht: gespielt.length, gesamt: liste.length,
      bestes: bestes ? { platz: bestes[1].platz!, name: bestes[0].name } : null,
      schnitt: plaetze.length ? plaetze.reduce((a, x) => a + x[1].platz!, 0) / plaetze.length : null,
      dmgSpiel: spiele ? e.reduce((a, x) => a + x.damage, 0) / spiele : null,
      elimsSpiel: spiele ? e.reduce((a, x) => a + x.elims, 0) / spiele : null,
      quote: e.reduce((a, x) => a + x.genommen, 0) ? e.reduce((a, x) => a + x.damage, 0) / e.reduce((a, x) => a + x.genommen, 0) : null,
      elims: e.reduce((a, x) => a + x.elims, 0),
    };
  });

  /** Eine Zeile der Mitte - der bessere Wert leuchtet. */
  const zeile = (titel: string, l: number | null, r: number | null, text: (v: number) => string, kleinBesser = false, notiz?: [string?, string?]) => {
    const besser = l === null || r === null || l === r ? null : ((kleinBesser ? l < r : l > r) ? 0 : 1);
    return (
      <div key={titel} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-zinc-800/80 py-2 last:border-0">
        <div className="text-right">
          <span className={`text-2xl font-black italic tabular-nums ${besser === 0 ? 'text-amber-300' : 'text-slate-100'}`}>{l === null ? '—' : text(l)}</span>
          {notiz?.[0] && <span className="block text-[10px] text-slate-500">{notiz[0]}</span>}
        </div>
        <span className="min-w-[8rem] text-center text-[11px] font-semibold text-slate-400">{titel}</span>
        <div className="text-left">
          <span className={`text-2xl font-black italic tabular-nums ${besser === 1 ? 'text-amber-300' : 'text-slate-100'}`}>{r === null ? '—' : text(r)}</span>
          {notiz?.[1] && <span className="block text-[10px] text-slate-500">{notiz[1]}</span>}
        </div>
      </div>
    );
  };

  const teamKarte = (team: KopfSpieler[], rechts: boolean) => (
    <div className={`flex min-w-0 flex-col ${rechts ? 'items-end text-right' : 'items-start'}`}>
      <div className={`flex gap-1.5 ${rechts ? 'flex-row-reverse' : ''}`}>
        {team.map((s) => (
          <div key={s.epicId} className="h-40 w-28 overflow-hidden rounded-xl border border-zinc-800 bg-gradient-to-b from-sky-500/20 to-zinc-950 sm:h-48 sm:w-32">
            {s.bild
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={s.bild} alt="" className="h-full w-full object-cover object-top" />
              : <span className="flex h-full items-end justify-center pb-3 text-3xl font-black text-zinc-700">{s.anzeige.slice(0, 1)}</span>}
          </div>
        ))}
      </div>
      <p className="mt-3 text-2xl font-black italic uppercase leading-tight tracking-tight text-slate-50">
        {team.map((s) => s.anzeige).join(' & ')}
      </p>
      <p className={`mt-1 flex items-center gap-2 text-xs text-slate-400 ${rechts ? 'flex-row-reverse' : ''}`}>
        <span className="flex gap-1">{team.map((s) => <TeamFlagge key={s.epicId} groesse={16} laender={[s.land ?? undefined]} />)}</span>
        {REGION_NAME[team[0]?.heimat ?? ''] ?? team[0]?.heimat}
      </p>
    </div>
  );

  const fmt = (n: number, d = 0) => n.toLocaleString(en ? 'en-US' : 'de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

  return (
    <div className="space-y-5">
      {!festeTeams && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5">
          <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr]">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Duo 1</T></p>
              <Wahl wer={a1} setWer={setA1} platzhalter={t('Spieler suchen …')} t={t} />
              <Wahl wer={a2} setWer={setA2} platzhalter={t('Mitspieler suchen …')} t={t} />
            </div>
            <span className="self-center text-center text-xs font-black uppercase tracking-[0.2em] text-slate-600">VS</span>
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Duo 2</T></p>
              <Wahl wer={b1} setWer={setB1} platzhalter={t('Spieler suchen …')} t={t} />
              <Wahl wer={b2} setWer={setB2} platzhalter={t('Mitspieler suchen …')} t={t} />
            </div>
          </div>
        </div>
      )}

      {bereit && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600"><T>Zeitraum</T></span>
          {([['saison', t('Diese Season')], ['jahr', `${t('Jahr')} ${jahr}`], ['cup', t('Ein Cup')]] as Array<[Zeitraum, string]>).map(([w, titel]) => (
            <button key={w} onClick={() => setZeitraum(w)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${zeitraum === w ? 'bg-sky-500/15 text-sky-400' : 'text-slate-500 hover:text-slate-300'}`}>
              {titel}
            </button>
          ))}
          {zeitraum === 'cup' && (
            <select value={cup} onChange={(e) => setCup(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-[11px] text-slate-200">
              <option value="">{t('Cup wählen …')}</option>
              {cupAuswahl.map((f) => <option key={f.windowId} value={f.windowId}>{f.name}</option>)}
            </select>
          )}
        </div>
      )}

      {bereit && laedt && <div className="h-40 animate-pulse rounded-xl bg-zinc-900/60" />}

      {bereit && !laedt && (
        <section className="overflow-hidden rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-950/60 via-zinc-950 to-zinc-950 p-5">
          <p className="mb-4 text-xs font-bold uppercase italic tracking-[0.2em] text-sky-300/80">
            {zeitraum === 'cup' && cup ? (finals.find((f) => f.windowId === cup)?.name ?? '') : zeitraum === 'jahr' ? `${jahr}` : (saisonTitel || saison || t('Alle Saisons'))} · Head to Head
          </p>
          <div className="grid items-end gap-5 lg:grid-cols-[1fr_minmax(20rem,auto)_1fr]">
            {teamKarte(teams[0], false)}
            <div>
              <p className="mb-1 text-center text-3xl font-black italic text-slate-500">VS</p>
              {zeitraum === 'cup' && cup
                ? zeile(t('Ergebnis'), ergebnisse[0].get(cup)?.platz ?? null, ergebnisse[1].get(cup)?.platz ?? null, (v) => ordinal(v, en), true,
                  [ergebnisse[0].has(cup) ? undefined : t('Not qualified'), ergebnisse[1].has(cup) ? undefined : t('Not qualified')])
                : zeile(t('Finals erreicht'), werte[0].erreicht, werte[1].erreicht, (v) => v.toString(), false,
                  [`${t('von')} ${werte[0].gesamt}`, `${t('von')} ${werte[1].gesamt}`])}
              {!(zeitraum === 'cup' && cup) && zeile(t('Bestes Finale'), werte[0].bestes?.platz ?? null, werte[1].bestes?.platz ?? null, (v) => ordinal(v, en), true,
                [werte[0].bestes?.name, werte[1].bestes?.name])}
              {!(zeitraum === 'cup' && cup) && zeile(t('Ø Platz im Finale'), werte[0].schnitt, werte[1].schnitt, (v) => fmt(v, 1), true)}
              {zeile(t('Damage je Spiel'), werte[0].dmgSpiel, werte[1].dmgSpiel, (v) => fmt(v))}
              {zeile(t('Elims je Spiel'), werte[0].elimsSpiel, werte[1].elimsSpiel, (v) => fmt(v, 2))}
              {zeile(t('Damage Ratio'), werte[0].quote, werte[1].quote, (v) => fmt(v, 2))}
              {zeile(t('Elims gesamt'), werte[0].elims, werte[1].elims, (v) => fmt(v))}
            </div>
            {teamKarte(teams[1], true)}
          </div>
        </section>
      )}

      {/* Die Finals einzeln - wer nicht dabei war, "Not qualified". */}
      {bereit && !laedt && alleFinals.length > 0 && !(zeitraum === 'cup' && cup) && (
        <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60">
          <div className="grid grid-cols-[1fr_minmax(10rem,auto)_1fr] border-b border-zinc-800 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            <span>{teams[0].map((s) => s.anzeige).join(' & ')}</span>
            <span className="text-center"><T>Finale</T></span>
            <span className="text-right">{teams[1].map((s) => s.anzeige).join(' & ')}</span>
          </div>
          {alleFinals.map((f) => {
            const zelle = (e: Ergebnis | undefined, rechts: boolean) => (
              <span className={rechts ? 'text-right' : ''}>
                {e ? (
                  <>
                    <b className="text-slate-100">{e.platz ? ordinal(e.platz, en) : '—'}</b>
                    <span className="text-[11px] text-slate-500"> · {e.elims} Elims · {fmt(e.damage)} Dmg</span>
                  </>
                ) : <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600"><T>Not qualified</T></span>}
              </span>
            );
            return (
              <div key={f.windowId} className="grid grid-cols-[1fr_minmax(10rem,auto)_1fr] items-center gap-2 border-b border-zinc-900 px-4 py-2 text-sm last:border-0">
                {zelle(ergebnisse[0].get(f.windowId), false)}
                <span className="text-center text-[11px] text-slate-400">
                  {f.name}
                  <span className="block text-[10px] text-slate-600">{f.datum ? new Date(f.datum).toLocaleDateString(en ? 'en-GB' : 'de-DE', { day: 'numeric', month: 'short' }) : ''}</span>
                </span>
                {zelle(ergebnisse[1].get(f.windowId), true)}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
