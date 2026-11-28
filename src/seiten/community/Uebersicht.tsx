import { motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Abschnitt, Bild, Flaeche, Laedt, Leer, Marke, MedienKarte, Zaehler, dauer, useJetzt } from '../../ds/Bausteine';
import { Symbol, Uhr } from './teileA';
import { kurz, letzter, useModi, useTopInseln } from './epic/daten';
import { MiniVerlauf } from './epic/Diagramm';
import { SPIELMODI } from './epic/modi';
import { useShop, type Angebot } from './kosmetik/daten';
import { VBUCK } from './kosmetik/Raster';

/*
 * Community-Uebersicht - die Titelseite des Bereichs (neu gebaut 27.11.2026; Betreiber: "keine winzige Karte in der Ecke, kein leerer Raum").
 * Aufbau von oben nach unten:
 *   1. Buehne: die Insel von heute gross (das Kartenbild laeuft im Meerblau der Buehne aus), links Saison, Version, Countdown.
 *   2. Item Shop von heute: die auffaelligsten Angebote mit Bild und Preis.
 *   3. News (grosses Bild + Kacheln) neben "Most played right now" (Rangliste mit Vorschaubildern).
 *   4. Reload-Inseln (Bilder aus den Spieldateien) und die Werkzeuge des Bereichs als Bildkacheln.
 * Quellen - alles echt, nichts geschaetzt ohne es zu sagen:
 *   - Saison: Nummer/Version von fortnite-api.com (/v2/cosmetics/new, "build"), Beginn = erster Cup der Saison in Deep Stats (/api/deep-stats),
 *     Ende: neues Chapter am 5. Dezember (Betreiber 26.11.2026; Uhrzeit = Epics uebliche Wartung, nicht bestaetigt) bzw. Epics Cup-Kalender.
 *   - Insel: /api/fortnite-map (fortnite-api.com) mit /bilder/karte-orte.png.
 *   - Shop: fortnite-api.com /v2/shop (kosmetik/daten.ts).
 *   - News: fortnite-api.com /v2/news/br.
 *   - Meistgespielt: /api/fn-entdecken der Seite ({ stand, eintraege: [{ code, titel, bild, creator, spieler, epic }] }); antwortet die Route
 *     nicht, Epics Fortnite Data API ueber /epic-daten (epic/daten.ts).
 *   - Naechste Cups: /api/cup-catalog?modus=aktuell (Banner, naechster Start).
 *   - Reload-Inseln: /api/karten-bild (Bilder aus den Spieldateien, lib/reloadKarten auf main).
 */

interface Fenster { status: string; begin: number; end: number; windowId: string; eventId: string; name?: string }
interface Kartenbild { id: string; titel: string; groesse: number }
interface Meldung { id: string; title: string; body: string; tileImage?: string; image?: string; hidden?: boolean }

// Betreiber (26.11.2026): am 5. Dezember startet das neue Chapter. Uhrzeit ist Epics uebliche Wartung (~09:00 UTC), nicht bestaetigt.
const SAISON_ENDE_43 = Date.UTC(2026, 11, 5, 9, 0);
// Saisonnamen wie auf der Seite (lib/szeneStats.ts auf main): S43 ist die Mini-Season "Treasure Hunters" nach Chapter 7 Season 4.
const SAISON_NAME: Record<number, { name: string; unter: string }> = {
  39: { name: 'Chapter 7 Season 1', unter: 'Chapter 7' }, 40: { name: 'Chapter 7 Season 2', unter: 'Chapter 7' },
  41: { name: 'Chapter 7 Season 3', unter: 'Chapter 7' }, 42: { name: 'Chapter 7 Season 4', unter: 'Chapter 7' },
  43: { name: 'Treasure Hunters', unter: 'Chapter 7 · Mini season' },
};
const MEER = 'rgb(13,81,151)'; // Randfarbe des Kartenbilds - damit laeuft die Insel nahtlos in die Buehne aus
const tag = (t: number | string) => new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/* ------------------------------------------------------------------ 1. Buehne: Insel + Saison */

function Buehne() {
  const [build, setBuild] = useState<string | null>(null);
  const [fenster, setFenster] = useState<Fenster[] | null>(null);
  const [beginn, setBeginn] = useState<number | null>(null);
  const [karte, setKarte] = useState<{ stand?: string; anzahlOrte?: number; orte?: unknown[] } | null>(null);
  useEffect(() => {
    fetch('https://fortnite-api.com/v2/cosmetics/new').then((r) => r.json()).then((j) => setBuild(j?.data?.build ?? null)).catch(() => {});
    fetch('/api/cup-events?region=EU').then((r) => r.json()).then((j) => setFenster(Array.isArray(j?.windows) ? j.windows : [])).catch(() => setFenster([]));
    fetch('/api/fortnite-map').then((r) => r.json()).then(setKarte).catch(() => {});
  }, []);
  // Version "++Fortnite+Release-43.11-CL-60803671" -> Saison 43, v43.11
  const version = build?.match(/Release-(\d+)\.(\d+)/);
  const saisonAusFenster = useMemo(() => {
    const s = (fenster ?? []).map((w) => Number(/^S(\d+)_/.exec(w.windowId)?.[1] ?? 0)).filter(Boolean);
    return s.length ? Math.max(...s) : null;
  }, [fenster]);
  const saison = version ? Number(version[1]) : saisonAusFenster;
  useEffect(() => {
    if (!saison) return;
    fetch('/api/deep-stats').then((r) => r.json()).then((j: { cups?: Array<{ tage: Array<{ windowId: string; beginn: string }> }> }) => {
      const t = (j.cups ?? []).flatMap((c) => c.tage).filter((x) => x.windowId.startsWith(`S${saison}_`)).map((x) => Date.parse(x.beginn)).filter(Number.isFinite);
      if (t.length) setBeginn(Math.min(...t));
    }).catch(() => {});
  }, [saison]);
  const dieser = (fenster ?? []).filter((w) => saison && w.windowId.startsWith(`S${saison}_`));
  const letzterCup = dieser.length ? Math.max(...dieser.map((w) => w.end)) : null;
  const offen = dieser.filter((w) => w.status !== 'vorbei').length;
  const naechste = fenster?.find((w) => saison && new RegExp(`^S${saison + 1}_`).test(w.windowId));
  const saisonTag = beginn ? Math.floor((Date.now() - beginn) / 864e5) + 1 : null;
  const orte = karte?.anzahlOrte ?? (Array.isArray(karte?.orte) ? karte!.orte!.length : null);
  // Worauf die Uhr zaehlt - in dieser Reihenfolge: erster Cup der naechsten Saison, bekannter Chapter-Start, letzter angesetzter Cup
  const ziel = naechste ? { t: naechste.begin, titel: `First Season ${saison! + 1} cup starts`, text: null as string | null }
    : saison === 43 && Date.now() < SAISON_ENDE_43 ? { t: SAISON_ENDE_43, titel: `New chapter launches ${tag(SAISON_ENDE_43)}`, text: 'Counting down to the usual update downtime (about 09:00 UTC) – Epic confirms the exact minute on the day.' }
      : letzterCup ? { t: letzterCup, titel: `Season ${saison} cups run until ${tag(letzterCup)}`, text: `Epic doesn't publish the season end yet – this counts down to the last tournament on Epic's calendar (${offen} still to come in EU).` }
        : null;
  const name = saison ? (SAISON_NAME[saison]?.name ?? `Season ${saison}`) : 'Fortnite';
  return (
    <section className="fl-fest relative isolate overflow-hidden">
      <div className="grid lg:min-h-[min(640px,calc(100vh-190px))] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* Insel - auf dem Handy oben, am breiten Schirm rechts; das Bild ist groesser als die Buehne und auf die Landmasse gerueckt */}
        <Link to="/community/map" aria-label="Open the interactive map" className="group relative order-first block aspect-square overflow-hidden sm:aspect-[4/3] lg:order-last lg:aspect-auto" style={{ background: MEER }}>
          <motion.img src="/bilder/karte-orte.png" alt="Today's island" draggable={false} initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-1/2 top-1/2 aspect-square h-[135%] max-w-none sm:h-[150%] transition duration-[1200ms] group-hover:scale-[1.04] lg:h-[158%]" style={{ translate: '-54% -56.5%' }} />
          <div className="absolute inset-y-0 left-0 hidden w-1/4 bg-gradient-to-r from-fl via-fl/60 to-transparent lg:block" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-fl/90 to-transparent lg:h-1/4 lg:from-fl/70" />
          <div className="absolute left-4 top-4 flex flex-wrap gap-1.5 lg:left-auto lg:right-5 lg:top-5">
            <Marke ton="akz">Today's island</Marke>
            {karte?.stand && <Marke>Updated {new Date(karte.stand).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Marke>}
          </div>
          <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-3 lg:inset-x-6 lg:bottom-6">
            <p className="hidden text-sm font-semibold text-white/85 [text-shadow:0_1px_8px_rgba(0,0,0,0.9)] sm:block">{orte ? <><b className="titel mr-1.5 text-3xl align-[-3px]">{orte}</b>locations · chests, ammo boxes, vehicles and more as layers</> : 'Chests, ammo boxes, vehicles and more as layers'}</p>
            <span className="knopf-prim">Open the map <span aria-hidden>→</span></span>
          </div>
        </Link>
        {/* Saison */}
        <div className="relative flex flex-col justify-center gap-6 p-6 sm:p-8 lg:p-12">
          <span aria-hidden className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-akz/15 blur-3xl" />
          <motion.div initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} className="relative">
            <p className="ueber">{saison ? `${SAISON_NAME[saison]?.unter ?? 'Current season'} · Season ${saison}` : 'Current season'}</p>
            <h1 className="titel mt-2 text-6xl sm:text-7xl xl:text-8xl 2xl:text-9xl">{name}</h1>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {version && <span className="chip !cursor-default">Game version v{version[1]}.{version[2]}</span>}
              {saisonTag && <span className="chip !cursor-default">Day {saisonTag} of the season</span>}
              {offen > 0 && <Link to="/community/tournaments" className="chip">{offen} cups still to come</Link>}
            </div>
          </motion.div>
          {ziel ? (
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }} className="relative">
              <p className="mb-2.5 text-sm font-semibold text-white/75">{ziel.titel}</p>
              <Uhr ziel={ziel.t} gross />
              {ziel.text && <p className="mt-3 max-w-xl text-xs leading-relaxed text-white/40">{ziel.text}</p>}
            </motion.div>
          ) : !fenster ? <Laedt text="Loading the schedule" /> : null}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="relative flex flex-wrap items-center gap-2">
            <Link to="/community/season" className="knopf">Season countdown</Link>
            <Link to="/community/xp" className="knopf">XP calculator</Link>
            <Link to="/community/notifications" className="knopf" title="Notifications">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-akz" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0" /></svg>Notifications
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 2. Item Shop von heute */

/** Die auffaelligsten Angebote: grosse Kacheln und Bundles zuerst, je Shop-Abschnitt hoechstens zwei, nur Angebote mit Bild. */
function highlights(angebote: Angebot[], n: number): Angebot[] {
  const gewicht = (a: Angebot) => (Number(/Size_(\d)/.exec(a.groesse)?.[1] ?? 1)) * 10 + (a.bundle ? 6 : 0) + (a.teile[0]?.typ === 'outfit' ? 4 : 0);
  const sortiert = angebote.filter((a) => a.bild && a.art === 'br').sort((a, b) => gewicht(b) - gewicht(a) || a.abschnittRang - b.abschnittRang);
  const jeAbschnitt = new Map<string, number>(); const bilder = new Set<string>(); const aus: Angebot[] = [];
  for (const a of sortiert) {
    if ((jeAbschnitt.get(a.abschnitt) ?? 0) >= 2 || bilder.has(a.bild)) continue;
    jeAbschnitt.set(a.abschnitt, (jeAbschnitt.get(a.abschnitt) ?? 0) + 1); bilder.add(a.bild); aus.push(a);
    if (aus.length >= n) break;
  }
  return aus;
}

function ShopHeute() {
  const { angebote, laedt, fehler } = useShop();
  const jetzt = useJetzt(30_000);
  const liste = useMemo(() => highlights(angebote, 12), [angebote]);
  // Der Shop wechselt taeglich um 00:00 UTC
  const wechsel = useMemo(() => { const d = new Date(jetzt); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); }, [jetzt]);
  if (fehler || (!laedt && !liste.length)) return null;
  return (
    <Abschnitt ueber={`${angebote.length || ''} offers today`.trim()} titel="Item Shop" rechts={
      <div className="flex items-center gap-4"><span className="hidden text-xs text-white/45 sm:inline">New shop in <b className="zahl text-white">{dauer(wechsel - jetzt)}</b></span><Link to="/community/shop" className="knopf-leer">Whole shop <span aria-hidden>→</span></Link></div>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {laedt ? Array.from({ length: 6 }, (_, i) => <div key={i} className="fl-fest aspect-[4/5] animate-pulse" />) : liste.map((a, i) => (
          <motion.div key={a.id} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: Math.min(i, 6) * 0.04, duration: 0.45 }}
            className={`fl-fest fl-klick group overflow-hidden ${i >= 6 ? 'xl:hidden' : ''} ${i >= 8 ? 'lg:hidden' : ''}`}>
            <Link to="/community/shop" className="block">
              <div className="relative aspect-square overflow-hidden" style={{ background: a.farben?.length ? `linear-gradient(160deg, ${a.farben[0]}, ${a.farben[a.farben.length - 1]})` : 'linear-gradient(160deg, rgb(var(--akz) / 0.35), rgb(var(--fl)))' }}>
                <Bild src={a.bild} alt={a.name} className="absolute inset-0 h-full w-full transition duration-700 group-hover:scale-[1.07]" />
                <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-fl to-transparent" />
                {a.banner && <div className="absolute left-2.5 top-2.5"><Marke ton="gold">{a.banner}</Marke></div>}
              </div>
              <div className="px-3.5 pb-3.5 pt-1">
                <p className="truncate text-sm font-bold text-white">{a.name}</p>
                <p className="mt-0.5 flex items-center justify-between gap-2 text-xs text-white/50">
                  <span className="truncate">{a.bundle ? 'Bundle' : a.teile[0]?.typName ?? a.abschnitt}</span>
                  <span className="zahl inline-flex shrink-0 items-center gap-1 font-bold text-white">{VBUCK}{a.preis.toLocaleString('en')}{a.regulaer > a.preis && <s className="font-normal text-white/35">{a.regulaer.toLocaleString('en')}</s>}</span>
                </p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </Abschnitt>
  );
}

/* ------------------------------------------------------------------ 3a. News */

function Neuigkeiten() {
  const [liste, setListe] = useState<Meldung[] | null>(null);
  useEffect(() => {
    fetch('https://fortnite-api.com/v2/news/br').then((r) => r.json()).then((j) => setListe(((j?.data?.motds ?? []) as Meldung[]).filter((m) => !m.hidden))).catch(() => setListe([]));
  }, []);
  if (liste && !liste.length) return null;
  const [erste, ...rest] = liste ?? [];
  return (
    <Abschnitt ueber="From Epic" titel="In the game right now" zu="/community/news" zuText="All news">
      {!liste ? <Laedt /> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {erste && (
            <motion.article initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="fl-fest fl-klick group overflow-hidden sm:col-span-2">
              <Link to="/community/news" className="grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <div className="relative aspect-video overflow-hidden"><Bild src={erste.image || erste.tileImage} className="absolute inset-0 h-full w-full transition duration-700 group-hover:scale-[1.05]" /></div>
                <div className="flex flex-col justify-center p-6 lg:p-8">
                  <p className="ueber">Top story</p>
                  <h3 className="titel mt-2 text-4xl xl:text-5xl">{erste.title}</h3>
                  <p className="mt-3 line-clamp-5 text-sm leading-relaxed text-white/60">{erste.body}</p>
                </div>
              </Link>
            </motion.article>
          )}
          {rest.slice(0, 4).map((m, i) => (
            <MedienKarte key={m.id} zu="/community/news" bild={m.tileImage || m.image} titel={m.title} verz={0.05 * (i + 1)}>
              <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-white/55">{m.body}</p>
            </MedienKarte>
          ))}
        </div>
      )}
    </Abschnitt>
  );
}

/* ------------------------------------------------------------------ 3b. Meistgespielt */

interface Eintrag { code: string; titel: string; bild?: string | null; creator?: string; spieler: number; epic?: boolean; verlauf?: Array<{ t: number; v: number }> }

function Rangliste({ liste, hinweis }: { liste: Eintrag[]; hinweis?: string }) {
  const max = Math.max(1, ...liste.map((e) => e.spieler));
  return (
    <Flaeche fest className="overflow-hidden">
      <ul className="divide-y divide-white/[0.05]">
        {liste.map((e, i) => (
          <motion.li key={e.code} initial={{ opacity: 0, x: 12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }}>
            <Link to={e.epic && !/^\d{4}-/.test(e.code) ? '/community/players' : `/community/creative/${encodeURIComponent(e.code)}`} className="group relative flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.04]">
              <span aria-hidden className="absolute inset-y-0 left-0 bg-akz/[0.07]" style={{ width: `${(e.spieler / max) * 100}%` }} />
              <span className={`titel relative w-6 text-center text-2xl ${i === 0 ? '!text-amber-300' : '!text-white/35'}`}>{i + 1}</span>
              {e.bild && <Bild src={e.bild} className="relative aspect-video h-12 shrink-0 rounded-lg" />}
              <span className="relative min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-white group-hover:text-akz">{e.titel}</span>
                <span className="block truncate text-[11px] text-white/40">{e.epic ? 'Epic Games' : e.creator || 'Creator island'}</span>
              </span>
              {e.verlauf && e.verlauf.length > 2 && <span className="relative hidden w-20 xl:block"><MiniVerlauf punkte={e.verlauf} farbe="rgb(var(--akz))" hoehe={22} /></span>}
              <span className="relative text-right"><Zaehler wert={e.spieler} format={kurz} className="text-lg font-extrabold text-white" /><span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-white/35">players</span></span>
            </Link>
          </motion.li>
        ))}
      </ul>
      {hinweis && <p className="border-t border-white/[0.05] px-4 py-2.5 text-[11px] text-white/35">{hinweis}</p>}
    </Flaeche>
  );
}

/** Ersatz, wenn /api/fn-entdecken nicht antwortet: Epics Fortnite Data API (Spitzenwert der letzten Stunde je Insel, dazu Epics Modi, wenn sie antworten). */
function MeistGespieltEpic() {
  const { daten } = useModi('1D');
  const r = useTopInseln('1H', true);
  const modi: Eintrag[] = SPIELMODI.filter((m) => daten[m.k]).map((m) => ({ code: `modus:${m.k}`, titel: m.titel, spieler: letzter(daten[m.k]!.m.peakCCU) ?? 0, epic: true, verlauf: daten[m.k]!.m.peakCCU }));
  const inseln: Eintrag[] = r.liste.slice(0, 8).map((x) => ({ code: x.i.code, titel: x.i.titel, bild: x.i.bild, creator: x.i.creator, spieler: x.v, verlauf: x.w.serie.filter((p) => p.t >= Date.now() - 864e5) }));
  const liste = [...modi, ...inseln].filter((e) => e.spieler > 0).sort((a, b) => b.spieler - a.spieler).slice(0, 8);
  if (!liste.length) return r.laedt || !r.fertig ? <Flaeche fest className="px-4"><Laedt text="Asking Epic for player numbers" /></Flaeche> : <Leer text="Epic's player numbers aren't answering right now."><Link to="/community/players" className="knopf-leer">Player count <span aria-hidden>→</span></Link></Leer>;
  return <Rangliste liste={liste} hinweis={modi.length ? 'Peak players in the latest hour.' : "Peak players in the latest hour – creator islands from Epic's public data."} />;
}

function MeistGespielt() {
  const [server, setServer] = useState<Eintrag[] | null | 'fehlt'>(null);
  useEffect(() => {
    fetch('/api/fn-entdecken').then((r) => { if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error(); return r.json(); })
      .then((j: { eintraege?: Eintrag[] }) => { const l = (j?.eintraege ?? []).filter((e) => e?.code && Number.isFinite(e.spieler)); setServer(l.length ? l : 'fehlt'); })
      .catch(() => setServer('fehlt'));
  }, []);
  return (
    <Abschnitt ueber="Live" titel="Most played" zu="/community/discover" zuText="Discover">
      {server === null ? <Flaeche fest className="px-4"><Laedt /></Flaeche> : server === 'fehlt' ? <MeistGespieltEpic />
        : <Rangliste liste={[...server].sort((a, b) => b.spieler - a.spieler).slice(0, 8)} hinweis="Players right now, straight from Fortnite's Discover." />}
    </Abschnitt>
  );
}

/* ------------------------------------------------------------------ 3c. Naechste Cups */

interface Cup { id: string; titel: string; bild?: string | null; live?: boolean; naechsterStart?: number | null; regionen?: Record<string, unknown> }

/** Die naechsten Cups aus dem Cup-Katalog der Seite (/api/cup-catalog?modus=aktuell) - mit Banner und Countdown. */
function NaechsteCups() {
  const [cups, setCups] = useState<Cup[] | null>(null);
  const jetzt = useJetzt(30_000);
  useEffect(() => { fetch('/api/cup-catalog?modus=aktuell').then((r) => r.json()).then((j) => setCups((j?.cups ?? []) as Cup[])).catch(() => setCups([])); }, []);
  const liste = (cups ?? []).filter((c) => c.live || (c.naechsterStart ?? 0) > jetzt).sort((a, b) => Number(!!b.live) - Number(!!a.live) || (a.naechsterStart ?? 0) - (b.naechsterStart ?? 0)).slice(0, 4);
  if (!liste.length) return null;
  return (
    <Abschnitt ueber="Compete" titel="Next cups" zu="/community/tournaments" zuText="Tournaments">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        {liste.map((c, i) => (
          <Flaeche key={c.id} fest klick verz={i * 0.05} className="group overflow-hidden">
            <Link to="/community/tournaments" className="flex items-stretch">
              <div className="relative aspect-video w-40 shrink-0 overflow-hidden"><Bild src={c.bild} className="absolute inset-0 h-full w-full transition duration-700 group-hover:scale-[1.06]" /></div>
              <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-2">
                <p className="truncate text-sm font-bold text-white">{c.titel}</p>
                <p className="mt-0.5 truncate text-[11px] text-white/40">{Object.keys(c.regionen ?? {}).join(' · ')}</p>
                <p className="mt-1.5">{c.live ? <Marke ton="rot" puls>Live</Marke> : <span className="zahl text-sm font-bold text-akz">in {dauer((c.naechsterStart ?? 0) - jetzt)}</span>}</p>
              </div>
            </Link>
          </Flaeche>
        ))}
      </div>
    </Abschnitt>
  );
}

/* ------------------------------------------------------------------ 4a. Reload-Inseln */

function Reload() {
  const [karten, setKarten] = useState<Kartenbild[] | null>(null);
  const [inseln, setInseln] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch('/api/karten-bild').then((r) => r.json()).then((j) => { setKarten(j?.karten ?? []); setInseln(j?.inseln ?? {}); }).catch(() => setKarten([]));
  }, []);
  // Je Insel ein Eintrag: das Bild aus den Spieldateien (gross, scharf beim Verkleinern); Varianten ("eigenes Bild", "nah") fallen weg.
  const liste = useMemo(() => {
    const alle = (karten ?? []).filter((k) => k.id.startsWith('reload-') && !/-(png|nah)$/.test(k.id));
    const imTurnier = new Map(Object.entries(inseln).filter(([c]) => !c.startsWith('BR:')).map(([code, id]) => [id, code]));
    return alle.map((k) => ({ ...k, name: k.titel.replace(/^Reload - /, ''), code: imTurnier.get(k.id) ?? null }))
      .sort((a, b) => Number(!!b.code) - Number(!!a.code) || a.name.localeCompare(b.name));
  }, [karten, inseln]);
  if (karten && !liste.length) return null;
  return (
    <Abschnitt ueber="From the game files" titel="Reload islands" zu="/community/rotation" zuText="Which one is live now">
      <div className="ohne-leiste -mx-4 flex snap-x gap-3 overflow-x-auto px-4 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0 2xl:grid-cols-10">
        {!karten ? Array.from({ length: 5 }, (_, i) => <div key={i} className="fl-fest aspect-square w-40 shrink-0 animate-pulse lg:w-auto" />) : liste.map((k, i) => (
          <MedienKarte key={k.id} zu="/community/rotation" format="aspect-square" bild={`/api/karten-bild?id=${encodeURIComponent(k.id)}&datei=1`} titel={k.name} verz={Math.min(i, 8) * 0.04}
            unter={k.code ? 'Played in tournaments' : 'In the game files'} marke={k.code ? <Marke ton="akz">Cups</Marke> : undefined} className="w-40 shrink-0 snap-start lg:w-auto" />
        ))}
      </div>
    </Abschnitt>
  );
}

/* ------------------------------------------------------------------ 4b. Werkzeuge als Bildkacheln */

const SCHACH = { backgroundImage: 'repeating-conic-gradient(rgba(255,255,255,0.07) 0 25%, transparent 0 50%)', backgroundSize: '22px 22px' };
const WAFFEN_BILDER = ['t-icon-weapons-recoilweapon-l', 't_icon_weapons_shotgun_pump_firepetal_l', 't-icon-weapons-sk-machinepistol-br-l'];
// Asset Studio: drei andere Symbole, jedes umgefaerbt - zeigt, was das Werkzeug tut
const ASSET_BILDER: Array<[string, number]> = [['t_icon_weapons_launcher_slingshot_harmlessthrift_l', 0], ['t_icon_br_gadget_stimpulsegrenade_l', 150], ['t-icon-weapons-happyghostgun-l', 250]];

function Kachel({ zu, ueber, titel, text, verz, children }: { zu: string; ueber: string; titel: string; text: string; verz: number; children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: verz, duration: 0.5 }} className="fl-fest fl-klick group overflow-hidden">
      <Link to={zu} className="block">
        <div className="relative aspect-[16/8] overflow-hidden">{children}<div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-fl to-transparent" /></div>
        <div className="px-5 pb-5 pt-1">
          <p className="ueber !tracking-[0.25em]">{ueber}</p>
          <p className="titel mt-1 text-3xl">{titel} <span className="text-akz transition group-hover:translate-x-1">→</span></p>
          <p className="mt-1.5 text-sm text-white/55">{text}</p>
        </div>
      </Link>
    </motion.div>
  );
}

function Werkzeuge() {
  return (
    <Abschnitt ueber="Tools" titel="Dig deeper" rechts={<span />}>
      <div className="grid gap-4 md:grid-cols-3">
        <Kachel zu="/community/weapons" ueber="Loot" titel="Weapon database" text="Every weapon ever with stats per rarity – and how the current pool performs in real tournaments." verz={0}>
          <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_0%,rgb(var(--akz)/0.28),transparent_65%)]" />
          <div className="absolute inset-0 flex items-center justify-center gap-2 px-6 transition duration-700 group-hover:scale-105">
            {WAFFEN_BILDER.map((b, i) => <Symbol key={b} src={`/waffen/${b}.webp`} className={`h-full w-1/3 ${i === 1 ? '' : 'scale-90 opacity-80'}`} />)}
          </div>
        </Kachel>
        <Kachel zu="/community/map-evolution" ueber="Island" titel="Map evolution" text="Put two patches side by side or swipe between them – every map version since Chapter 1." verz={0.06}>
          <div className="absolute inset-0 grid grid-cols-2 gap-px bg-white/10">
            {['battle-royale-ch7-s3', 'battle-royale-ch7-s4'].map((id, i) => (
              <div key={id} className="relative overflow-hidden" style={{ background: MEER }}>
                <Bild src={`/api/karten-bild?id=${id}&datei=1`} className="absolute left-1/2 top-1/2 aspect-square w-[135%] max-w-none -translate-x-1/2 -translate-y-1/2 transition duration-700 group-hover:scale-105" />
                <span className="absolute left-3 top-3"><Marke ton={i ? 'akz' : 'gold'}>{i ? 'After' : 'Before'}</Marke></span>
              </div>
            ))}
          </div>
        </Kachel>
        <Kachel zu="/community/assets" ueber="Loot" titel="Asset studio" text="Weapon and item images – recolour them, add a background, download a PNG for your thumbnail." verz={0.12}>
          <div className="absolute inset-0 bg-[#0a0d15]" style={SCHACH} />
          <div className="absolute inset-0 flex items-center justify-center gap-4 px-6">
            {ASSET_BILDER.map(([b, h]) => <span key={b} className="grid h-4/5 w-1/3 place-items-center transition duration-700 group-hover:scale-105" style={{ filter: `hue-rotate(${h}deg)` }}><Symbol src={`/waffen/${b}.webp`} className="h-full w-full" schatten={false} /></span>)}
          </div>
        </Kachel>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {[['map', 'Interactive map'], ['rotation', 'Map rotation'], ['weapons/compare', 'Compare weapons'], ['treasure-hunt', 'Treasure Hunt'], ['sprites', 'Sprites'], ['lorebook', 'Lorebook'], ['cosmetics', 'Cosmetics'],
          ['players', 'Player count'], ['creative', 'Creative islands'], ['tournaments', 'Tournaments'], ['stats', 'Player lookup']].map(([p, t]) => <Link key={p} to={`/community/${p}`} className="chip">{t}</Link>)}
      </div>
    </Abschnitt>
  );
}

/* ------------------------------------------------------------------ Seite */

export default function Uebersicht() {
  return (
    <div className="space-y-10">
      <Buehne />
      <ShopHeute />
      <div className="grid gap-x-6 gap-y-10 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <Neuigkeiten />
        <div className="space-y-10"><MeistGespielt /><NaechsteCups /></div>
      </div>
      <Reload />
      <Werkzeuge />
    </div>
  );
}
