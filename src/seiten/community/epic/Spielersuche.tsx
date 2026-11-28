import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Abschnitt, Flaeche, Laedt, Leer, Marke, Segment, SeitenKopf, Zaehler } from '../../../ds/Bausteine';

/*
 * Player lookup (Design-System 3.0, neu gebaut 28.11.2026; Betreiber: "meinen eigenen Namen finde ich nicht").
 *   Suche      jeder Epic-Anzeigename (Gross/Klein egal) -> /api/fn-spieler?name=.. (Epics Konto- und Statistik-Daten der Seite).
 *              ?name= in der Adresse wird beim Laden sofort gesucht (Ctrl+K-Suche verlinkt hierher) und beim Suchen gesetzt.
 *   Vorschlaege beim Tippen aus /api/szene-stats?ansicht=suche&q= (Turnierspieler mit Foto, Pros zuerst) - Klick sucht den aktuellen Namen.
 *   Profil     Kopf mit Name, Level, Saison und Link aufs Competitive-Profil (wenn die Konto-ID in /api/spieler-namen steht);
 *              Ranked-Kacheln je Modus (Stufe, Fortschritt, Bestwert, Platz bei Unreal); Gesamtzahlen; Tabelle umschaltbar
 *              nach Teamgroesse / Spielmodus / Eingabegeraet. Private Profile: klarer Hinweis statt leerer Zahlen.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Werte { matches?: number; wins?: number; kills?: number; kd?: number; winrate?: number; killsProMatch?: number; minutesplayed?: number; playersoutlived?: number; top3?: number; top5?: number; top6?: number; top10?: number; top12?: number; top25?: number; lastmodified?: string }
interface Rang { k: string; titel: string; name: string; stufe: number | null; fortschritt: number | null; bestName: string | null; platz: number | null; stand: string | null }
interface Profil { name: string; id: string | null; privat: boolean; level: number | null; saison: number | null; raenge: Rang[]; gesamt: Werte | null; gruppen: Record<Gruppe, Array<{ k: string; name: string; w: Werte }>> }
type Gruppe = 'team' | 'modus' | 'eingabe';
interface Vorschlag { epicId: string; name: string; aktuell?: string; anzeige?: string; bild?: string | null; land?: string | null; events?: number; gepflegt?: boolean }

const TEAM: Record<string, string> = { solo: 'Solo', duo: 'Duos', trio: 'Trios', squad: 'Squads', sonstige: 'Other modes' };
const MODUS: Record<string, string> = {
  br: 'Battle Royale', zb: 'Zero Build', ranked: 'Ranked BR', rankedZb: 'Ranked Zero Build', reload: 'Reload', reloadRanked: 'Ranked Reload', reloadZb: 'Reload Zero Build',
  og: 'OG', ogZb: 'OG Zero Build', ogRanked: 'Ranked OG', creative: 'Creative', turnier: 'Tournaments', bots: 'Bot matches', sonstige: 'Other modes', arena: 'Arena',
};
const EINGABE: Record<string, string> = { keyboardmouse: 'Keyboard & mouse', gamepad: 'Controller', touch: 'Touch' };
const RANG_REIHE = ['brGesamt', 'zbGesamt', 'reloadGesamt', 'reloadZbGesamt', 'arenas'];
const menschlich = (k: string) => k.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

/** Farbe je Rangstufe (Bronze .. Unreal) - nur die Stufe, nichts erfunden. */
function rangTon(name: string): string {
  const n = name.toLowerCase();
  if (n.startsWith('unreal')) return 'from-fuchsia-400/35 via-violet-500/20';
  if (n.startsWith('champion')) return 'from-orange-400/35 via-rose-500/15';
  if (n.startsWith('elite')) return 'from-slate-200/25 via-slate-400/10';
  if (n.startsWith('diamond')) return 'from-sky-400/35 via-blue-500/15';
  if (n.startsWith('platin')) return 'from-cyan-300/30 via-teal-500/10';
  if (n.startsWith('gold')) return 'from-amber-400/35 via-yellow-500/10';
  if (n.startsWith('silver')) return 'from-zinc-300/25 via-zinc-400/10';
  return 'from-orange-700/30 via-amber-900/10';
}

const zahl = (v: any): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
function werteAus(o: any): Werte | null {
  if (!o || typeof o !== 'object') return null;
  const w: Werte = {};
  for (const k of ['matches', 'wins', 'kills', 'kd', 'winrate', 'killsProMatch', 'minutesplayed', 'playersoutlived', 'top3', 'top5', 'top6', 'top10', 'top12', 'top25'] as const) { const v = zahl(o[k]); if (v !== undefined) w[k] = v; }
  if (typeof o.lastmodified === 'string') w.lastmodified = o.lastmodified;
  return w.matches ? w : null;
}
function profilAus(j: any, gesucht: string): Profil | null {
  if (!j || typeof j !== 'object' || j.gefunden === false || (!j.konto && !j.stats && !j.rang)) return null;
  const raenge: Rang[] = Object.entries((j.rang && typeof j.rang === 'object' ? j.rang : {}) as Record<string, any>).map(([k, v]) => ({
    k, titel: String(v?.titel ?? menschlich(k)).replace(/\s*\(combined\)/i, ''), name: String(v?.name ?? ''), stufe: zahl(v?.stufe) ?? null,
    fortschritt: zahl(v?.fortschritt) ?? null, bestName: v?.hoechsteName && v.hoechsteName !== v.name ? String(v.hoechsteName) : null, platz: zahl(v?.platz) ?? null, stand: v?.aktualisiert ?? null,
  })).filter((r) => r.name && !/^unranked$/i.test(r.name))
    .sort((a, b) => ((RANG_REIHE.indexOf(a.k) + 1 || 99) - (RANG_REIHE.indexOf(b.k) + 1 || 99)));
  const st = j.stats && typeof j.stats === 'object' ? j.stats : {};
  const liste = (o: any, namen: Record<string, string>) => Object.entries((o && typeof o === 'object' ? o : {}) as Record<string, any>)
    .map(([k, v]) => ({ k, name: namen[k] ?? menschlich(k), w: werteAus(v) })).filter((x): x is { k: string; name: string; w: Werte } => !!x.w)
    .sort((a, b) => (b.w.matches ?? 0) - (a.w.matches ?? 0));
  const team = liste(Object.fromEntries(Object.keys(TEAM).map((k) => [k, st[k]])), TEAM);
  const lv = zahl(j.level);
  return {
    name: String(j.konto?.name ?? gesucht), id: j.konto?.id ?? null, privat: !!j.privat, level: lv && lv > 0 ? lv : null, saison: zahl(j.saison) ?? null, raenge,
    gesamt: werteAus(st.gesamt), gruppen: { team, modus: liste(st.bereich, MODUS), eingabe: liste(st.eingabe, EINGABE) },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const ganz = (v?: number) => (v === undefined ? '–' : Math.round(v).toLocaleString('en'));
const stunden = (min?: number) => (min === undefined ? '–' : min >= 6000 ? `${Math.round(min / 60).toLocaleString('en')} h` : `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`);
const vorTagen = (s?: string | null) => { if (!s) return ''; const t = Date.parse(s); if (!t) return ''; const d = Math.floor((Date.now() - t) / 864e5); return d < 1 ? 'today' : d === 1 ? 'yesterday' : d < 60 ? `${d} days ago` : new Date(t).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); };

type Verzeichnis = Record<string, { namen: string[]; haupt: string; schluessel: string }>;

/** Vorschlaege beim Tippen (Turnierspieler mit Foto) - leise, verzoegert, Fehler = keine Vorschlaege. */
function useVorschlaege(q: string): Vorschlag[] {
  const [l, setL] = useState<Vorschlag[]>([]);
  useEffect(() => {
    const t = q.trim(); if (t.length < 2) { setL([]); return undefined; }
    let weg = false;
    const zeit = setTimeout(() => {
      fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(t)}`).then((r) => r.json()).then((j) => { if (!weg) setL(((j?.spieler ?? []) as Vorschlag[]).slice(0, 8)); }).catch(() => { if (!weg) setL([]); });
    }, 220);
    return () => { weg = true; clearTimeout(zeit); };
  }, [q]);
  return l;
}

export function Stats() {
  const [params, setParams] = useSearchParams();
  const name = params.get('name') ?? '';
  const [q, setQ] = useState(name);
  const [offen, setOffen] = useState(false);
  const [verz, setVerz] = useState<Verzeichnis | null>(null);
  const [gruppe, setGruppe] = useState<Gruppe>('team');
  const [zuletzt, setZuletzt] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('hub-stats-zuletzt') ?? '[]'); } catch { return []; } });
  const [z, setZ] = useState<{ status: 'leer' | 'laedt' | 'da' | 'unbekannt' | 'aus'; p: Profil | null }>({ status: name ? 'laedt' : 'leer', p: null });
  const vorschlaege = useVorschlaege(offen ? q : '');
  const feld = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch('/api/spieler-namen').then((r) => r.json()).then((j) => setVerz(j?.verzeichnis ?? {})).catch(() => setVerz({})); }, []);
  useEffect(() => {
    setQ(name); setOffen(false);
    if (!name) { setZ({ status: 'leer', p: null }); return undefined; }
    let weg = false; setZ({ status: 'laedt', p: null });
    fetch(`/api/fn-spieler?name=${encodeURIComponent(name)}`).then(async (r) => {
      if (!(r.headers.get('content-type') ?? '').includes('json')) return { status: 'aus' as const, p: null };
      const j = await r.json().catch(() => null);
      const p = profilAus(j, name);
      return p ? { status: 'da' as const, p } : { status: r.status === 404 || j?.gefunden === false ? 'unbekannt' as const : 'aus' as const, p: null };
    }).catch(() => ({ status: 'aus' as const, p: null })).then((x) => {
      if (weg) return; setZ(x);
      if (x.p) setZuletzt((l) => { const neu = [x.p!.name, ...l.filter((n) => n.toLowerCase() !== x.p!.name.toLowerCase())].slice(0, 8); try { localStorage.setItem('hub-stats-zuletzt', JSON.stringify(neu)); } catch { /* egal */ } return neu; });
    });
    return () => { weg = true; };
  }, [name]);

  const p = z.p;
  // Steht der Spieler in unserem Turnier-Verzeichnis? Erst ueber die Konto-ID, sonst ueber den Namen.
  const comp = useMemo(() => {
    if (!verz || !name) return null;
    if (p?.id && verz[p.id]) return p.id;
    const n = (p?.name ?? name).toLowerCase();
    return Object.entries(verz).find(([, v]) => v.namen.some((x) => x.toLowerCase() === n))?.[0] ?? null;
  }, [verz, name, p]);
  const suchen = (n: string) => { const t = n.trim(); if (!t) return; setOffen(false); feld.current?.blur(); setParams({ name: t }); };
  const zeilen = p ? p.gruppen[gruppe] : [];
  const maxMatches = Math.max(1, ...zeilen.map((r) => r.w.matches ?? 0));
  const g = p?.gesamt;

  return (
    <div className="space-y-7">
      <SeitenKopf klein ueber="Live · Player lookup" titel="Fortnite stats" text="Any Epic name – ranks, level, wins, K/D, matches and playtime, mode by mode. Capitals don't matter.">
        <form onSubmit={(e) => { e.preventDefault(); suchen(q); }} className="relative flex max-w-3xl flex-wrap gap-2">
          <div className="relative min-w-0 flex-1">
            <input ref={feld} value={q} onChange={(e) => { setQ(e.target.value); setOffen(true); }} onFocus={() => setOffen(true)} onBlur={() => setTimeout(() => setOffen(false), 160)}
              placeholder="Epic display name" autoFocus={!name} className="eingabe w-full !px-5 !py-4 !text-xl font-bold" autoComplete="off" spellCheck={false} />
            <AnimatePresence>
              {offen && vorschlaege.length > 0 && (
                <motion.ul initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }} className="fl-fest absolute inset-x-0 top-full z-30 mt-2 overflow-hidden p-1.5">
                  {vorschlaege.map((v) => {
                    const n = v.aktuell || v.name;
                    return (
                      <li key={v.epicId}>
                        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setQ(n); suchen(n); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/[0.06]">
                          {v.bild && <img src={v.bild} alt="" className="h-12 w-9 shrink-0 rounded-lg object-cover object-top" />}
                          <span className="min-w-0 flex-1"><span className="block truncate font-bold text-white">{n}</span>
                            <span className="block truncate text-xs text-white/45">{[v.anzeige && v.anzeige !== n ? v.anzeige : null, v.land, v.events ? `${v.events} cups tracked` : null].filter(Boolean).join(' · ') || 'Tournament player'}</span></span>
                          <span className="shrink-0 text-xs font-semibold text-akz">Stats →</span>
                        </button>
                      </li>
                    );
                  })}
                  <li className="px-3 pb-1 pt-2 text-[11px] text-white/35">Suggestions are tournament players. Anyone else: type the exact Epic name and press Enter.</li>
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
          <button type="submit" disabled={!q.trim()} className="knopf-prim !px-8 !text-base">Search</button>
        </form>
        {zuletzt.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-1.5"><span className="text-xs text-white/40">Recent</span>{zuletzt.map((n) => <button key={n} type="button" onClick={() => suchen(n)} className={`chip ${p && n.toLowerCase() === p.name.toLowerCase() ? 'chip-an' : ''}`}>{n}</button>)}</div>}
      </SeitenKopf>

      {z.status === 'laedt' && <Laedt text={`Looking up ${name}`} />}
      {z.status === 'unbekannt' && <Leer text={<>No Epic account is called <b className="text-white">{name}</b>. It has to be the Epic display name (capitals don't matter) – console names that were never linked to Epic can't be found.</>} />}
      {z.status === 'aus' && <Leer text={<>Fortnite stats aren't answering right now, so <b className="text-white">{name}</b> can't be looked up at the moment.</>}>{comp && <Link to={`/competitive/player/${comp}`} className="knopf-prim">Open the competitive profile →</Link>}</Leer>}

      {p && (
        <>
          {/* Kopf: Name links, Gesamtzahlen rechts */}
          <Flaeche fest className="overflow-hidden">
            <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <div className="relative isolate flex flex-col justify-between gap-6 overflow-hidden p-7 lg:p-9">
                <div className={`absolute inset-0 -z-10 bg-gradient-to-br ${p.raenge[0] ? rangTon(p.raenge[0].name) : 'from-akz/20 via-transparent'} to-transparent opacity-80`} />
                <div>
                  <p className="ueber">Epic account{p.saison ? ` · season ${p.saison}` : ''}</p>
                  <h2 className="titel mt-2 break-words text-6xl lg:text-8xl">{p.name}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {p.level !== null && <Marke ton="akz">Level {p.level}</Marke>}
                    {p.privat && <Marke ton="gold">Private profile</Marke>}
                    {comp && <Marke ton="gruen">Tournament player</Marke>}
                    {g?.lastmodified && <Marke>Last match {vorTagen(g.lastmodified)}</Marke>}
                  </div>
                </div>
                {comp ? <Link to={`/competitive/player/${comp}`} className="knopf-prim self-start">Competitive profile →</Link> : <p className="text-xs text-white/40">Not in our tournament directory – no cups played that we track.</p>}
              </div>
              <div className="border-t border-white/[0.06] p-7 lg:border-l lg:border-t-0 lg:p-9">
                {!g ? (
                  <p className="grid h-full min-h-[160px] place-items-center text-center text-sm leading-relaxed text-white/55">
                    {p.privat ? <>This player keeps their stats private in Fortnite's settings,<br />so wins, K/D and matches aren't public.</> : 'No match stats for this account yet.'}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
                    {([['Wins', g.wins, 'akz'], ['Win rate', g.winrate !== undefined ? `${g.winrate.toFixed(1)}%` : undefined], ['K/D', g.kd?.toFixed(2)], ['Kills', g.kills], ['Matches', g.matches], ['Playtime', stunden(g.minutesplayed)]] as Array<[string, number | string | undefined, string?]>).map(([t, v, ton]) => (
                      <div key={t}><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/45">{t}</p>
                        <p className={`titel mt-1 text-5xl ${ton ? 'text-akz' : ''}`}>{typeof v === 'number' ? <Zaehler wert={v} /> : v ?? '–'}</p></div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Flaeche>

          {p.raenge.length > 0 && (
            <Abschnitt titel="Ranked" ueber={`Current rank per mode${p.saison ? ` · season ${p.saison}` : ''}`}>
              <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${['', 'xl:grid-cols-2', 'xl:grid-cols-2', 'xl:grid-cols-3'][p.raenge.length] ?? 'xl:grid-cols-4'}`}>
                {p.raenge.map((r, i) => (
                  <Flaeche key={r.k} fest className="relative isolate overflow-hidden p-6" verz={i * 0.05}>
                    <div className={`absolute inset-0 -z-10 bg-gradient-to-br ${rangTon(r.name)} to-transparent`} />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/55">{r.titel}</p>
                    <p className="titel mt-2 text-5xl">{r.name}</p>
                    {r.platz !== null && <p className="zahl mt-1 text-sm font-bold text-fuchsia-200">#{r.platz.toLocaleString('en')} in the world</p>}
                    {r.fortschritt !== null && (
                      <>
                        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.08]"><motion.div className="h-full rounded-full bg-white/85" initial={{ width: 0 }} whileInView={{ width: `${Math.min(100, r.fortschritt * 100)}%` }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.1 + i * 0.05 }} /></div>
                        <p className="zahl mt-1.5 text-[11px] text-white/50">{Math.round(r.fortschritt * 100)}% {/^unreal/i.test(r.name) ? 'progress' : 'to the next rank'}{r.bestName ? ` · best ${r.bestName}` : ''}{r.stand ? ` · ${vorTagen(r.stand)}` : ''}</p>
                      </>
                    )}
                  </Flaeche>
                ))}
              </div>
            </Abschnitt>
          )}

          {g && (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {([['Kills / match', g.killsProMatch?.toFixed(2)], ['Top 3–6', ganz((g.top3 ?? 0) + (g.top5 ?? 0) + (g.top6 ?? 0))], ['Top 10–12', ganz((g.top10 ?? 0) + (g.top12 ?? 0))], ['Top 25', ganz(g.top25)], ['Outlived', ganz(g.playersoutlived)], ['Minutes / match', g.minutesplayed && g.matches ? `${(g.minutesplayed / g.matches).toFixed(0)} min` : '–']] as Array<[string, string | undefined]>).map(([t, v], i) => (
                <Flaeche key={t} className="px-4 py-3" verz={i * 0.03}><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/45">{t}</p><p className="zahl mt-1 text-xl font-extrabold text-white">{v ?? '–'}</p></Flaeche>
              ))}
            </div>
          )}

          {(p.gruppen.team.length + p.gruppen.modus.length + p.gruppen.eingabe.length) > 0 && (
            <Abschnitt titel="Mode by mode" ueber="All seasons combined" rechts={<Segment id="stats-gruppe" klein wert={gruppe} onWahl={setGruppe} wahl={[{ k: 'team', titel: 'Team size' }, { k: 'modus', titel: 'Game mode' }, { k: 'eingabe', titel: 'Input' }]} />}>
              <Flaeche fest className="overflow-x-auto">
                <table className="tabelle min-w-[760px]">
                  <thead><tr><th>{gruppe === 'team' ? 'Team size' : gruppe === 'modus' ? 'Mode' : 'Input'}</th><th className="w-[22%]">Matches</th><th className="!text-right">Wins</th><th className="!text-right">Win rate</th><th className="!text-right">K/D</th><th className="!text-right">Kills</th><th className="!text-right">Kills/match</th><th className="!text-right">Playtime</th><th className="!text-right">Last played</th></tr></thead>
                  <tbody>
                    {zeilen.map((r) => (
                      <tr key={r.k}>
                        <td className="font-bold text-white">{r.name}</td>
                        <td><div className="flex items-center gap-3"><span className="zahl w-14 shrink-0 text-white/80">{ganz(r.w.matches)}</span><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]"><motion.span className="block h-full rounded-full bg-akz/80" initial={{ width: 0 }} animate={{ width: `${((r.w.matches ?? 0) / maxMatches) * 100}%` }} transition={{ duration: 0.6 }} /></span></div></td>
                        <td className="zahl text-right font-bold text-white">{ganz(r.w.wins)}</td>
                        <td className="zahl text-right text-white/80">{r.w.winrate !== undefined ? `${r.w.winrate.toFixed(1)}%` : '–'}</td>
                        <td className="zahl text-right text-white/80">{r.w.kd?.toFixed(2) ?? '–'}</td>
                        <td className="zahl text-right text-white/80">{ganz(r.w.kills)}</td>
                        <td className="zahl text-right text-white/80">{r.w.killsProMatch?.toFixed(2) ?? '–'}</td>
                        <td className="zahl text-right text-white/80">{stunden(r.w.minutesplayed)}</td>
                        <td className="text-right text-xs text-white/45">{vorTagen(r.w.lastmodified)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!zeilen.length && <p className="px-5 py-8 text-center text-sm text-white/45">Nothing recorded for this split.</p>}
              </Flaeche>
            </Abschnitt>
          )}
        </>
      )}

      {z.status === 'leer' && (
        <div className="grid gap-4 md:grid-cols-3">
          {[['Any Epic name', 'Not just pros: search your own name or a friend’s. It has to be the Epic display name – capitals don’t matter.'], ['Casual and ranked', 'Rank per mode, account level, wins, K/D, matches and playtime – split by team size, game mode and input.'], ['Plus competitive', verz ? `${Object.keys(verz).length.toLocaleString('en')} tournament players are linked to their full competitive profile.` : 'Tournament players are linked to their full competitive profile.']].map(([t, x], i) => (
            <Flaeche key={t} className="p-6" verz={i * 0.05}><p className="titel text-3xl">{t}</p><p className="mt-2 text-sm leading-relaxed text-white/55">{x}</p></Flaeche>
          ))}
        </div>
      )}
      <p className="text-xs text-white/35">Stats: Epic's account and stats data via CompHub. Private profiles only show what Epic makes public.</p>
    </div>
  );
}
