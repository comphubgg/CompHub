import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bild, Flaeche, Kennzahl, Laedt, Leer, Marke, Segment, SeitenKopf, Zaehler } from '../../ds/Bausteine';
import { flagge } from '../../teile/Glas';
import { Treppchen } from '../../teile/Podest';
import { Fehler, geld } from './tools/Gemeinsam';
import { Klein, Portraet } from './stats/teile';

/*
 * FNCS im Hub - wie /fncs der echten Seite: Endspiele (/api/fncs-ereignisse: Grand Finals, Global Championships, Invitational, Summit mit den
 * besten fuenf Teams, Punkten, Siegen, Elims, Preisgeld) und All-Time (/api/fncs-alltime: Titel je Spieler und Land, All-Time-Leaderboard und
 * Rekorde der Grand Finals, Eliminierungen je Grand Final).
 *
 * Aufbau (Design-System 3.0, neu komponiert):
 *   Finals   - Zeitleiste und Buehne: links ALLE Endspiele als Liste nach Jahren (Sieger auf einen Blick), rechts das gewaehlte Endspiel gross -
 *              Banner, die Champions mit Hochkant-Fotos, Plaetze 2-5, Preisgeld. Frueher 33 gleiche Textkarten; jetzt steht jedes Endspiel
 *              einen Klick entfernt in voller Groesse da. Das Cup-Bild steht nur einmal auf dem Schirm (auf der Buehne).
 *   All-time - Treppchen der meisten Titel neben der Titelliste und den Nationen, darunter Leaderboard und Preisgeld, die Rekorde, die Elim-Tabelle.
 * Fotos nur als Hochkant-Rechtecke nebeneinander und nur, wenn jeder Spieler des Teams eines hat; ohne Foto steht nichts.
 */

interface SpS { name: string; land: string | null; bild?: string | null }
interface Spitze { rang: number; punkte: number | null; siege?: number | null; elims?: number | null; spiele?: number | null; preis?: string; spieler: SpS[] }
interface Ereignis { key: string; saison: string; saisonKurz: string; saisonTitel: string | null; kopf1: string; kopf2: string; titel: string; datum: number | null; lan: boolean; ort: string | null; region: string; regionCode: string; preisgeld: string | null; bild: string | null; teams?: number; spitze: Spitze[] }
interface Ev { key: string; titel: string; saison: string; saisonKurz: string; saisonName: string }
interface SpA { id: string; name: string; land: string | null; bild: string | null; gesamt: number; je: Record<string, number> }
interface RekordZeile { event: string; wert: number; spieler: Array<{ name: string; land: string | null }> }
interface Rekorde { ab: string; spieler: Array<{ name: string; land: string | null; punkte: number; siege: number; elims: number; finals: number }>; punkte: RekordZeile[]; siege: RekordZeile[]; elims: RekordZeile[]; fehlend?: number }
interface AllTime { events: Ev[]; spieler: SpA[]; ab: string; titel: Array<{ id: string; name: string; land: string | null; titel: number }>; laender: Array<{ land: string; titel: number }>; rekorde: Rekorde | null }

const MEDAILLE = ['#facc15', '#cbd5e1', '#f59e0b'];
const landName = (c: string) => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(c.toUpperCase()) ?? c; } catch { return c; } };
const datum = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
/** "$400K" / "$1.2M" -> Zahl. */
const betrag = (s?: string | null) => { const m = /\$?([\d.,]+)\s*([KM])?/i.exec(s ?? ''); if (!m) return 0; const n = parseFloat(m[1].replace(/,/g, '')); return n * (m[2]?.toUpperCase() === 'M' ? 1e6 : m[2]?.toUpperCase() === 'K' ? 1e3 : 1); };
const namen = (sp: SpS[]) => sp.map((s) => s.name).join(' · ');

function Flaggen({ sp, gross = false }: { sp: Array<{ land: string | null }>; gross?: boolean }) {
  const l = [...new Set(sp.map((s) => s.land).filter(Boolean))] as string[];
  return <span className="flex shrink-0 gap-1">{l.map((x) => <img key={x} src={flagge(x)} alt="" className={`${gross ? 'h-5 w-5' : 'h-3.5 w-3.5'} rounded-full object-cover`} />)}</span>;
}

/** Fotos eines Teams als Hochkant-Rechtecke nebeneinander - nur wenn JEDER eines hat, sonst nichts. */
function TeamFotos({ sp, klasse }: { sp: SpS[]; klasse: string }) {
  if (!sp.length || !sp.every((s) => s.bild)) return null;
  return <span className="flex shrink-0 gap-1">{sp.map((s) => <img key={s.name} src={s.bild!} alt="" loading="lazy" draggable={false} className={`rounded-lg object-cover object-top ${klasse}`} />)}</span>;
}

/* --- Finals: Zeitleiste und Buehne --- */

/** Eine Zeile der Zeitleiste: Saison, Art des Endspiels, die Sieger. */
function ZeitZeile({ e, an, onClick }: { e: Ereignis; an: boolean; onClick: () => void }) {
  const global = e.regionCode === 'GLOBAL';
  const sieger = e.spitze[0];
  return (
    <button type="button" onClick={onClick} aria-pressed={an}
      className={`relative flex w-[270px] shrink-0 items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition xl:w-full xl:rounded-none xl:border-x-0 xl:border-b-0 xl:border-t xl:border-white/[0.06]
        ${an ? 'border-akz/50 bg-akz/10 xl:bg-akz/[0.08]' : 'border-white/[0.07] bg-black/25 hover:bg-white/[0.04] xl:bg-transparent'}`}>
      {an && <motion.span layoutId="fncs-wahl" className="absolute inset-y-2 left-0 hidden w-1 rounded-r-full bg-akz shadow-[0_0_14px_rgb(var(--akz)/0.9)] xl:block" />}
      <span className="w-[5.4rem] shrink-0">
        <span className="block font-titel text-2xl leading-none tracking-wide text-white">{e.kopf1}</span>
        <span className={`mt-0.5 block text-[9px] font-bold uppercase leading-tight tracking-[0.12em] ${global ? 'text-amber-300' : 'text-akz'}`}>{e.kopf2}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">{sieger && <Flaggen sp={sieger.spieler} />}<span className="truncate text-[13px] font-bold uppercase text-white">{sieger ? namen(sieger.spieler) : '–'}</span></span>
        <span className="mt-0.5 block truncate text-[11px] text-white/40">{[datum(e.datum), e.lan ? 'LAN' : 'Online', e.region].filter(Boolean).join(' · ')}</span>
      </span>
      {e.preisgeld && <span className="zahl shrink-0 text-xs font-bold text-emerald-300">{e.preisgeld}</span>}
    </button>
  );
}

/** Das gewaehlte Endspiel gross: Banner mit Kennzahlen, die Champions mit Fotos, Plaetze 2-5. */
function Buehne({ e, neueste }: { e: Ereignis; neueste: boolean }) {
  const [p1, ...rest] = e.spitze;
  const global = e.regionCode === 'GLOBAL';
  const zahlen: Array<[string, ReactNode]> = [['Prize pool', e.preisgeld ?? '–'], ['Teams', e.teams ? String(e.teams) : '–'], ['Winner points', p1?.punkte != null ? p1.punkte.toLocaleString('en') : '–'], ['Winner elims', p1?.elims != null ? String(p1.elims) : '–']];
  return (
    <motion.div key={`${e.key}-${e.datum}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="space-y-4">
      <div className="fl-fest relative isolate overflow-hidden">
        <Bild src={e.bild} className="absolute inset-y-0 right-0 -z-10 h-full w-full [mask-image:linear-gradient(to_right,transparent,black_45%)] lg:w-[66%]" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-fl via-fl/70 to-transparent" />
        <div className="absolute inset-0 -z-10 bg-fl/60 lg:hidden" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-fl via-transparent to-transparent" />
        <div className="p-5 lg:px-8 lg:py-6">
          <div className="flex flex-wrap items-center gap-1.5">
            {neueste && <Marke ton="akz">Latest final</Marke>}
            <Marke ton={e.lan ? 'gold' : 'still'}>{e.lan ? 'LAN' : 'Online'}</Marke><Marke>{e.region}</Marke>
            {datum(e.datum) && <Marke>{datum(e.datum)}</Marke>}{e.ort && <Marke>{e.ort}</Marke>}
          </div>
          <p className="titel mt-4 text-6xl lg:text-7xl">{e.kopf1}</p>
          <p className={`font-titel text-3xl uppercase tracking-[0.08em] lg:text-4xl ${global ? 'text-amber-300' : 'text-akz'}`}>{e.kopf2}</p>
          {e.saisonTitel && <p className="mt-1 text-sm text-white/50">{e.saisonTitel}</p>}
          <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 sm:flex sm:flex-wrap">
            {zahlen.map(([k, v]) => <div key={k}><Klein>{k}</Klein><p className="titel zahl mt-0.5 text-4xl">{v}</p></div>)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Die Champions */}
        {p1 && (
          <div className="fl-fest relative flex flex-col overflow-hidden p-5 lg:p-6">
            <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-amber-300" />
            <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-amber-300/10 blur-3xl" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-amber-300">Champions</p>
            <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-4">
              <TeamFotos sp={p1.spieler} klasse="h-40 w-[7.5rem] sm:h-48 sm:w-36 !rounded-2xl ring-1 ring-amber-300/40" />
              <div className="min-w-0 flex-1 basis-52">
                <Flaggen sp={p1.spieler} gross />
                <p className="titel mt-2 text-4xl leading-[0.95] sm:text-5xl">{p1.spieler.map((sp) => <span key={sp.name} className="block truncate">{sp.name}</span>)}</p>
              </div>
            </div>
            <div className="zahl mt-auto flex flex-wrap gap-x-7 gap-y-2 border-t border-white/[0.07] pt-4">
              {([['Points', p1.punkte], ['Victory Royales', p1.siege], ['Elims', p1.elims], ['Games', p1.spiele]] as Array<[string, number | null | undefined]>).filter(([, v]) => v != null).map(([k, v]) => (
                <div key={k}><Klein>{k}</Klein><p className="text-2xl font-extrabold leading-tight text-white">{Number(v).toLocaleString('en')}</p></div>
              ))}
              {p1.preis && <div className="ml-auto text-right"><Klein>Prize</Klein><p className="text-2xl font-extrabold leading-tight text-emerald-300">{p1.preis}</p></div>}
            </div>
          </div>
        )}
        {/* Plaetze 2-5 */}
        <div className="fl-fest overflow-hidden">
          <p className="ueber px-5 pb-2 pt-5">The top five</p>
          <ol>
            {rest.map((p) => (
              <li key={p.rang} className="flex items-center gap-3 border-t border-white/[0.06] px-5 py-2.5">
                <span className="zahl w-6 shrink-0 text-center font-titel text-3xl leading-none" style={{ color: MEDAILLE[p.rang - 1] ?? 'rgba(255,255,255,0.3)' }}>{p.rang}</span>
                <TeamFotos sp={p.spieler} klasse="h-12 w-9" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5"><Flaggen sp={p.spieler} /><span className="truncate text-sm font-bold uppercase text-white">{namen(p.spieler)}</span></span>
                  <span className="zahl mt-0.5 block truncate text-[11px] text-white/45">{[p.punkte != null ? `${p.punkte} pts` : '', p.siege != null ? `${p.siege} VR` : '', p.elims != null ? `${p.elims} elims` : ''].filter(Boolean).join(' · ')}</span>
                </span>
                {p.preis && <span className="zahl shrink-0 text-sm font-bold text-emerald-300">{p.preis}</span>}
              </li>
            ))}
            {!rest.length && <li className="border-t border-white/[0.06] px-5 py-6 text-sm text-white/40">Only the winner is on record for this final.</li>}
          </ol>
        </div>
      </div>
    </motion.div>
  );
}

/* --- All-Time --- */

function Liste({ titel, ueber, unter, children, verz = 0, className = '' }: { titel: string; ueber: string; unter?: string; children: ReactNode; verz?: number; className?: string }) {
  return (
    <Flaeche fest className={`flex max-h-[540px] flex-col overflow-hidden ${className}`} verz={verz}>
      <div className="flex items-end justify-between gap-3 px-5 pb-3 pt-5"><div><p className="ueber">{ueber}</p><h3 className="titel mt-1 text-3xl">{titel}</h3></div>{unter && <span className="text-right text-[11px] text-white/40">{unter}</span>}</div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/[0.06]">{children}</div>
    </Flaeche>
  );
}

function Rekord({ titel, einheit, zeilen, verz }: { titel: string; einheit: string; zeilen: RekordZeile[]; verz: number }) {
  const max = Math.max(1, ...zeilen.map((z) => z.wert));
  return (
    <Flaeche fest className="p-5" verz={verz}>
      <p className="ueber">Best single Grand Final</p>
      <h3 className="titel mt-1 text-3xl">{titel}</h3>
      <ol className="mt-4 space-y-3">
        {zeilen.slice(0, 6).map((z, i) => (
          <li key={`${z.event}-${i}`}>
            <div className="flex items-center gap-2">
              <span className="zahl w-5 text-sm font-black" style={{ color: MEDAILLE[i] ?? 'rgba(255,255,255,0.35)' }}>{i + 1}</span>
              <Flaggen sp={z.spieler} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold uppercase text-white">{z.spieler.map((s) => s.name).join(' · ')}</span>
              <span className="zahl text-sm font-extrabold text-white">{z.wert.toLocaleString('en')}<span className="ml-1 text-[10px] font-semibold text-white/40">{einheit}</span></span>
            </div>
            <div className="ml-7 mt-1 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-akz" initial={{ width: 0 }} whileInView={{ width: `${(z.wert / max) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.9, delay: i * 0.06 }} /></div>
              <span className="text-[10px] text-white/35">{z.event}</span>
            </div>
          </li>
        ))}
      </ol>
    </Flaeche>
  );
}

const zellFarbe = (v: number) => (v >= 20 ? 'bg-akz text-[#04050a]' : v >= 12 ? 'bg-akz/60 text-white' : v >= 8 ? 'bg-akz/35 text-white' : v >= 4 ? 'bg-akz/15 text-white/80 ring-1 ring-inset ring-akz/30' : 'bg-white/[0.06] text-white/45');

function AllTimeAnsicht({ alt, liste }: { alt: AllTime; liste: Ereignis[] }) {
  const [suche, setSuche] = useState('');
  const [sort, setSort] = useState('gesamt');
  const [mehr, setMehr] = useState(false);
  const r = alt.rekorde;
  const maxLand = Math.max(1, ...alt.laender.map((l) => l.titel));

  // Preisgeld aus den Top-5-Plaetzen aller Endspiele, je Spieler gleich durch das Team geteilt.
  const geldListe = useMemo(() => {
    const m = new Map<string, { name: string; land: string | null; summe: number; plaetze: number; siege: number }>();
    for (const e of liste) for (const p of e.spitze) {
      const b = betrag(p.preis); if (!b || !p.spieler.length) continue;
      for (const s of p.spieler) {
        const k = s.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const x = m.get(k) ?? { name: s.name, land: s.land, summe: 0, plaetze: 0, siege: 0 };
        x.summe += b / p.spieler.length; x.plaetze += 1; if (p.rang === 1) x.siege += 1; if (!x.land && s.land) x.land = s.land;
        m.set(k, x);
      }
    }
    return [...m.values()].sort((a, b) => b.summe - a.summe);
  }, [liste]);
  const maxGeld = Math.max(1, geldListe[0]?.summe ?? 1);

  const zeilen = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const best = (s: SpA) => Math.max(0, ...Object.values(s.je));
    return [...alt.spieler]
      .sort(sort === 'gesamt' ? (a, b) => b.gesamt - a.gesamt || best(b) - best(a) : sort === 'best' ? (a, b) => best(b) - best(a) || b.gesamt - a.gesamt : (a, b) => (b.je[sort] ?? -1) - (a.je[sort] ?? -1) || b.gesamt - a.gesamt)
      .map((s, i) => ({ ...s, platz: i + 1 }))
      .filter((s) => !q || s.name.toLowerCase().includes(q));
  }, [alt, sort, suche]);
  const sichtbar = mehr || suche ? zeilen : zeilen.slice(0, 30);
  const [t1, t2, t3] = alt.titel;
  const bildVon = (name: string) => alt.spieler.find((s) => s.name.toLowerCase() === name.toLowerCase())?.bild ?? null;

  return (
    <div className="space-y-5">
      {/* Meiste Titel: Treppchen, daneben die ganze Titelliste und die Nationen */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]">
        <Flaeche className="h-fit p-5 lg:p-6 xl:h-auto">
          <p className="ueber">Most FNCS titles</p>
          <h2 className="titel mt-1 text-4xl">The serial champions</h2>
          {t1 && (
            <div className="mt-5">
              <Treppchen plaetze={[t1, t2, t3].map((t, i) => t && ({
                platz: (i + 1) as 1 | 2 | 3, bild: bildVon(t.name), land: t.land, name: t.name, label: 'FNCS titles', wert: <Zaehler wert={t.titel} />,
              }))} />
            </div>
          )}
        </Flaeche>
        <Liste ueber="Every champion" titel="FNCS winners" unter="titles" verz={0.05} className="xl:!max-h-[440px]">
          <ol>{alt.titel.map((s, i) => (
            <li key={`${s.id}-${i}`} className="flex items-center gap-2.5 border-b border-white/[0.05] px-5 py-1.5 transition hover:bg-white/[0.03]">
              <span className="zahl w-6 text-right text-[11px] font-black text-white/35">{i + 1}</span>
              <Portraet bild={bildVon(s.name)} gross={36} platz />
              {s.land ? <img src={flagge(s.land)} alt="" className="h-4 w-4 rounded-full object-cover" /> : <span className="h-4 w-4" />}
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold uppercase text-white">{s.name}</span>
              <span className="zahl font-titel text-2xl leading-none text-amber-300">{s.titel}</span>
            </li>
          ))}</ol>
        </Liste>
        <Liste ueber="Titles by country" titel="Nationalities" verz={0.1} className="xl:!max-h-[440px]">
          <ol className="space-y-2.5 p-5">{alt.laender.map((l) => (
            <li key={l.land} className="flex items-center gap-2.5">
              <img src={flagge(l.land)} alt="" className="h-5 w-5 rounded-full object-cover" />
              <span className="w-28 truncate text-sm text-white/80">{landName(l.land)}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-amber-300" initial={{ width: 0 }} whileInView={{ width: `${(l.titel / maxLand) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8 }} /></div>
              <span className="zahl w-6 text-right text-sm font-bold text-white">{l.titel}</span>
            </li>
          ))}</ol>
        </Liste>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Liste ueber="Grand Finals, all seasons" titel="All-time leaderboard" unter={r ? `since ${r.ab}` : ''}>
          {r ? (
            <table className="tabelle">
              <thead><tr className="sticky top-0 z-10 bg-fl"><th className="w-10 !pl-5">#</th><th>Player</th><th className="!text-right">Points</th><th className="!text-right">Victory Royales</th><th className="!pr-5 !text-right">Elims</th></tr></thead>
              <tbody>{r.spieler.map((s, i) => (
                <tr key={`${s.name}-${i}`}>
                  <td className={`zahl !pl-5 text-[11px] font-bold ${i < 3 ? 'text-amber-300' : 'text-white/35'}`}>{i + 1}</td>
                  <td className="!py-1.5"><span className="flex items-center gap-2.5"><Portraet bild={bildVon(s.name)} gross={36} platz />{s.land ? <img src={flagge(s.land)} alt="" className="h-4 w-4 rounded-full object-cover" /> : <span className="h-4 w-4" />}<span className="truncate text-[13px] font-bold uppercase text-white">{s.name}</span></span></td>
                  <td className="zahl text-right font-bold text-white">{s.punkte.toLocaleString('en')}</td>
                  <td className="zahl text-right text-white/60">{s.siege}</td>
                  <td className="zahl !pr-5 text-right text-white/60">{s.elims}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="p-5 text-xs text-white/40">Not available right now.</p>}
        </Liste>
        <Liste ueber="Top-5 finishes, team prize split" titel="Prize money" verz={0.05}>
          <ol>{geldListe.slice(0, 60).map((s, i) => (
            <li key={`${s.name}-${i}`} className="border-b border-white/[0.05] px-5 py-2 transition hover:bg-white/[0.03]">
              <div className="flex items-center gap-2.5">
                <span className="zahl w-6 text-right text-[11px] font-black text-white/35">{i + 1}</span>
                {s.land ? <img src={flagge(s.land)} alt="" className="h-4 w-4 rounded-full object-cover" /> : <span className="h-4 w-4" />}
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold uppercase text-white">{s.name}</span>
                <span className="zahl text-[11px] text-white/35">{s.plaetze} top-5{s.siege ? ` · ${s.siege} won` : ''}</span>
                <span className="zahl w-16 text-right text-sm font-black text-emerald-300">{geld(s.summe)}</span>
              </div>
              <div className="ml-[2.1rem] mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]"><motion.div className="h-full rounded-full bg-emerald-400/70" initial={{ width: 0 }} whileInView={{ width: `${(s.summe / maxGeld) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8 }} /></div>
            </li>
          ))}</ol>
        </Liste>
      </div>

      {r && (
        <div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Rekord titel="Most points" einheit="pts" zeilen={r.punkte} verz={0} />
            <Rekord titel="Most Victory Royales" einheit="VR" zeilen={r.siege} verz={0.05} />
            <Rekord titel="Most eliminations" einheit="elims" zeilen={r.elims} verz={0.1} />
          </div>
          {(r.fehlend ?? 0) > 0 && <p className="mt-2 text-[11px] text-white/35">{r.fehlend} finals are missing right now (Epic not answering) – sums may be too small.</p>}
        </div>
      )}

      {/* Eliminierungen je Grand Final */}
      <Flaeche fest className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-4 px-5 pb-3 pt-5">
          <div className="min-w-0 flex-1">
            <p className="ueber">Season by season</p>
            <h3 className="titel mt-1 text-3xl">Eliminations in the Grand Finals</h3>
            <p className="mt-1 text-xs text-white/45">Europe, both final days combined. Epic counts elims per team – in duos and trios each player shows the team's number. Since {alt.ab}. Click a column to sort.</p>
          </div>
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search a player…" className="eingabe w-full !py-2 sm:w-64" />
        </div>
        <div className="overflow-x-auto border-t border-white/[0.06]">
          <table className="tabelle min-w-[900px]">
            <thead><tr>
              <th className="w-12 !pl-5">#</th><th>Player</th>
              <th className="!text-right"><button type="button" onClick={() => setSort('gesamt')} className={`uppercase tracking-[0.2em] ${sort === 'gesamt' ? 'text-akz' : 'hover:text-white'}`}>Total</button></th>
              <th className="!text-right"><button type="button" onClick={() => setSort('best')} className={`uppercase tracking-[0.2em] ${sort === 'best' ? 'text-akz' : 'hover:text-white'}`}>Best</button></th>
              {alt.events.map((ev) => (
                <th key={ev.key} className="!px-1 !text-center !tracking-[0.08em]"><button type="button" title={ev.saisonName} onClick={() => setSort(ev.key)} className={`whitespace-nowrap uppercase ${sort === ev.key ? 'text-akz' : 'hover:text-white'}`}>{ev.saisonKurz}</button></th>
              ))}
            </tr></thead>
            <tbody>{sichtbar.map((s) => (
              <tr key={s.id}>
                <td className="zahl !pl-5 text-[11px] font-bold text-white/35">{s.platz}</td>
                <td className="!py-1"><span className="flex items-center gap-2.5"><Portraet bild={s.bild} gross={32} platz />{s.land ? <img src={flagge(s.land)} alt="" className="h-4 w-4 rounded-full object-cover" /> : <span className="h-4 w-4" />}<span className="whitespace-nowrap text-[13px] font-bold uppercase text-white">{s.name}</span></span></td>
                <td className="zahl text-right font-black text-white">{s.gesamt}</td>
                <td className="zahl text-right text-xs text-akz">{Math.max(0, ...Object.values(s.je))}</td>
                {alt.events.map((ev) => {
                  const v = s.je[ev.key];
                  return <td key={ev.key} className="!px-1 text-center">{v === undefined ? <span className="text-white/15">–</span> : <span className={`zahl inline-block min-w-[2.2rem] rounded-md px-1.5 py-0.5 text-xs font-bold ${zellFarbe(v)}`}>{v}</span>}</td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
        {!suche && zeilen.length > 30 && (
          <div className="border-t border-white/[0.06] p-3 text-center"><button type="button" onClick={() => setMehr(!mehr)} className="knopf">{mehr ? 'Show the top 30' : `Show all ${zeilen.length} players`}</button></div>
        )}
      </Flaeche>
    </div>
  );
}

export default function Fncs() {
  const [reiter, setReiter] = useState<'events' | 'alltime'>(() => (new URLSearchParams(window.location.search).get('reiter') === 'alltime' ? 'alltime' : 'events'));
  const [liste, setListe] = useState<Ereignis[] | null>(null);
  const [alt, setAlt] = useState<AllTime | null>(null);
  const [fehler, setFehler] = useState('');
  const [art, setArt] = useState<'alle' | 'lan' | 'online'>('alle');
  const [region, setRegion] = useState('');
  const [wahl, setWahl] = useState(-1);
  useEffect(() => {
    fetch('/api/fncs-ereignisse').then((r) => r.json()).then((j) => { if (j?.ok) setListe(j.ereignisse); else setFehler('The finals could not be loaded right now.'); }).catch(() => setFehler('The finals could not be loaded right now.'));
    fetch('/api/fncs-alltime').then((r) => r.json()).then((j) => { if (j?.ok) setAlt(j); }).catch(() => {});
  }, []);
  const wechsle = (r: 'events' | 'alltime') => {
    setReiter(r);
    const u = new URL(window.location.href);
    if (r === 'alltime') u.searchParams.set('reiter', 'alltime'); else u.searchParams.delete('reiter');
    window.history.replaceState(null, '', u.toString());
  };
  const sichtbar = useMemo(() => [...(liste ?? [])].reverse().filter((e) => (art === 'alle' || (art === 'lan' ? e.lan : !e.lan)) && (!region || e.regionCode === region)), [liste, art, region]);
  const regionen = useMemo(() => [...new Set((liste ?? []).map((e) => e.regionCode))], [liste]);
  const summe = useMemo(() => (liste ?? []).reduce((s, e) => s + betrag(e.preisgeld), 0), [liste]);

  // Das gewaehlte Endspiel der Zeitleiste (Nummer in der ungefilterten Liste); ohne Wahl oder ausserhalb des Filters das juengste sichtbare.
  const gewaehlt = sichtbar.find((e) => (liste ?? []).indexOf(e) === wahl) ?? sichtbar[0] ?? null;
  const jahr = (e: Ereignis) => (e.datum ? new Date(e.datum).getFullYear() : null);

  return (
    <div>
      <SeitenKopf klein ueber="Fortnite Champion Series" titel="FNCS"
        text="Every final in the archive – Grand Finals, Global Championships, Invitational and Summit – with champions, prize money and all-time records."
        rechts={liste && (
          <div className="flex gap-8">
            <Kennzahl label="Finals" wert={liste.length} /><Kennzahl label="Prize money" wert={summe} format={geld} ton="gruen" /><Kennzahl label="LAN events" wert={liste.filter((e) => e.lan).length} ton="akz" />
          </div>
        )}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Segment id="fncs-reiter" wert={reiter} onWahl={wechsle} wahl={[{ k: 'events', titel: 'Finals' }, { k: 'alltime', titel: 'All-time' }]} />
          {reiter === 'events' && liste && (
            <div className="ohne-leiste -mx-1 flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap px-1 lg:ml-auto">
              <Segment id="fncs-art" klein wert={art} onWahl={setArt} wahl={[{ k: 'alle', titel: 'All' }, { k: 'lan', titel: 'LAN' }, { k: 'online', titel: 'Online' }]} />
              <Segment id="fncs-region" klein wert={region} onWahl={setRegion} wahl={[{ k: '', titel: 'All regions' }, ...regionen.map((r) => ({ k: r, titel: r === 'GLOBAL' ? 'Global' : r }))]} />
            </div>
          )}
        </div>
      </SeitenKopf>

      {fehler && <Fehler text={fehler} />}
      <AnimatePresence mode="wait">
        {reiter === 'events' ? (
          <motion.div key="events" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {!liste && !fehler && <Laedt text="Loading the finals" />}
            {liste && !sichtbar.length && <Leer text="No finals for this filter." />}
            {gewaehlt && (
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
                {/* Zeitleiste: alle Endspiele nach Jahren; auf dem Handy eine Reihe zum Wischen */}
                <div className="fl-fest overflow-hidden xl:sticky xl:top-28 xl:flex xl:max-h-[calc(100vh-8.5rem)] xl:flex-col">
                  <div className="flex items-end justify-between px-4 pb-2.5 pt-4"><div><p className="ueber">Timeline</p><h2 className="titel mt-1 text-2xl">{sichtbar.length} finals</h2></div><span className="text-[11px] text-white/35">newest first</span></div>
                  <div className="ohne-leiste flex gap-2 overflow-x-auto px-3 pb-3 xl:block xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:p-0">
                    {sichtbar.map((e, i) => (
                      <div key={`${e.key}-${e.datum}-${i}`} className="contents xl:block">
                        {(i === 0 || jahr(sichtbar[i - 1]) !== jahr(e)) && jahr(e) && <p className="sticky top-0 z-10 hidden border-t border-white/[0.06] bg-fl px-4 py-1 font-titel text-sm tracking-[0.2em] text-white/35 xl:block">{jahr(e)}</p>}
                        <ZeitZeile e={e} an={e === gewaehlt} onClick={() => setWahl((liste ?? []).indexOf(e))} />
                      </div>
                    ))}
                  </div>
                </div>
                <Buehne e={gewaehlt} neueste={gewaehlt === [...(liste ?? [])].reverse()[0]} />
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="alltime" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {alt && liste ? <AllTimeAnsicht alt={alt} liste={liste} /> : <Laedt text="Loading all-time stats" />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
