'use client';

/*
 * Der Editor einer alten Map - eigene Seite, reine Handarbeit.
 *
 * Der Betreiber (13.10.2026): "Edit-Menü komplett extra ... da kann ich keine Teams laden, nur Teams erstellen, löschen,
 * bearbeiten - genauso wie die Formen, mehr nicht. Und für jede einzelne Map das Einzelne machen, Leaderboard auch von
 * Hand." Vier Reiter: Landepunkte (Formen auf die Insel ziehen und Teams darauf legen), Teams (anlegen, ändern, löschen -
 * auch mehrere auf einmal), Leaderboard (Platz, Punkte, VR, Eliminierungen je Team) und Angaben (Titel, Datum, LAN, Bild).
 * Nichts wird geladen; was hier steht, speichert lib/alteMaps in alte-maps.json und die öffentliche Karte zeigt es sofort.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import TeamFlagge from '@/components/TeamFlagge';
import { useZugang } from '@/app/lib/zugang';
import Zeichenflaeche, { type ZForm } from './Zeichenflaeche';
import TeamEingabe from './TeamEingabe';

interface P { x: number; y: number }
interface Form { id: string; punkte: P[]; teamIds: string[] }
interface Spieler { name: string; epicId?: string; land?: string | null }
interface Team { id: string; spieler: Spieler[]; rang?: number | null; punkte?: number | null; siege?: number | null; elims?: number | null }
interface Meta { cup: string; fenster: string; datum: number | null; lan: boolean; bild: string | null }
interface Eintrag { turnierId: string; region: string; windowId: string; titel: string; saisonKurz: string; saison: string }
type Modus = 'waehlen' | 'rechteck' | 'polygon';
type Reiter = 'formen' | 'teams' | 'leaderboard' | 'angaben';

const REITER: Array<[Reiter, string]> = [['formen', 'Landepunkte'], ['teams', 'Teams'], ['leaderboard', 'Leaderboard'], ['angaben', 'Angaben']];
const neueId = () => `f${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`;
const teamId = (n: number) => `hand-${Date.now().toString(36)}-${n}-${Math.floor(Math.random() * 1000).toString(36)}`;
const zahlOder = (v: string): number | null => (v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const namenVon = (t: Team) => t.spieler.map((s) => s.name).join(' & ');
const tagVon = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');

const FELD = 'rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500';
const ZAHL = 'w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-right text-sm tabular-nums text-slate-100 outline-none focus:border-sky-500';

export default function AlteMapBearbeiten() {
  const t = useT();
  const zugang = useZugang();
  const [par, setPar] = useState<{ t: string; r: string; w: string } | null>(null);
  const [eintrag, setEintrag] = useState<Eintrag | null>(null);
  const [fehler, setFehler] = useState('');
  const [bereit, setBereit] = useState(false);
  const [reiter, setReiter] = useState<Reiter>('formen');
  const [teams, setTeams] = useState<Team[]>([]);
  const [formen, setFormen] = useState<Form[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const metaStart = useRef<Meta | null>(null);
  const [epicAn, setEpicAn] = useState(true);
  const [hatEpic, setHatEpic] = useState(false);
  const [eigenesEvent, setEigenesEvent] = useState(false);
  const [versteckt, setVersteckt] = useState(false);
  const [geaendert, setGeaendert] = useState(false);
  const [status, setStatus] = useState('');

  // Landepunkte
  const [wahl, setWahl] = useState<string | null>(null);
  const [modus, setModus] = useState<Modus>('rechteck');
  /** Die Wahl des Admins fuer dieses Kartenbild - und das, was die Ansicht ohne Wahl zeigt (die Insel der Saison). */
  const [bild, setBild] = useState<string | null>(null);
  const [standardBild, setStandardBild] = useState<string | null>(null);
  const [auswahl, setAuswahl] = useState<Array<{ u: string; titel: string }>>([]);
  const [bilderOffen, setBilderOffen] = useState(false);
  const [suche, setSuche] = useState('');
  /** Wie viele Spieler ein Team in diesem Cup hat (null: nicht herauszufinden). */
  const [teamGroesse, setTeamGroesse] = useState<number | null>(null);
  /** Bei einer Karte von Noble Practice: deren Teams (zum Auflegen auf Formen) und wie viele Landepunkte Noble dort hat. */
  const [noble, setNoble] = useState<{ teams: Team[]; formen: number } | null>(null);

  // Teams anlegen
  const [masse, setMasse] = useState('');
  const [offenesTeam, setOffenesTeam] = useState<string | null>(null);
  const gemerkt = useRef(new Map<string, { land: string; epicId: string }>());

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const [tid, r, w] = [p.get('t') ?? '', p.get('r') ?? '', p.get('w') ?? ''];
    if (!tid || !r || !w) { setFehler('Diese Karte ist nicht angegeben.'); return; }
    setPar({ t: tid, r, w });
  }, []);

  useEffect(() => {
    if (!par || !zugang.admin) return undefined;
    let weg = false;
    void Promise.all([
      fetch(`/api/alte-maps?t=${encodeURIComponent(par.t)}&w=${encodeURIComponent(par.w)}`, { cache: 'no-store' }).then((r) => r.json()),
      fetch(`/api/maps-bild?w=${encodeURIComponent(par.w)}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      // Dasselbe Kartenbild wie die Ansicht: ohne eigene Wahl die Insel der Saison (/api/maps-karte, wie die Karten-Seite sie holt).
      fetch(`/api/maps-karte?t=${encodeURIComponent(par.t)}&r=${encodeURIComponent(par.r)}&w=${encodeURIComponent(par.w)}&tag=gesamt`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    ]).then(([b, bi, ka]) => {
      if (weg) return;
      if (!b?.ok) { setFehler(b?.error || 'Die Karte ließ sich nicht laden.'); return; }
      setEintrag(b.eintrag); setTeams(b.teams ?? []); setFormen(b.formen ?? []);
      setMeta(b.meta); metaStart.current = b.meta; setEpicAn(b.epicAn !== false); setHatEpic(!!b.hatEpic);
      setEigenesEvent(!!b.eigenesEvent); setVersteckt(!!b.versteckt);
      setTeamGroesse(typeof b.teamGroesse === 'number' ? b.teamGroesse : null);
      setNoble(b.noble && Array.isArray(b.noble.teams) ? { teams: b.noble.teams, formen: Number(b.noble.formen) || 0 } : null);
      if (bi?.ok) { setBild(bi.u ?? null); setAuswahl(bi.auswahl ?? []); }
      if (ka?.ok) setStandardBild(ka.fenster?.bild ?? null);
      setBereit(true);
    }).catch(() => { if (!weg) setFehler('Die Karte ließ sich nicht laden.'); });
    return () => { weg = true; };
  }, [par, zugang.admin]);

  useEffect(() => {
    const fertig = (e: BeforeUnloadEvent) => { if (geaendert) e.preventDefault(); };
    window.addEventListener('beforeunload', fertig);
    return () => window.removeEventListener('beforeunload', fertig);
  }, [geaendert]);

  const aendern = () => { setGeaendert(true); setStatus(''); };

  /* ------------------------------------------------------------ Spieler im Archiv suchen */

  /** Einen Namen im Archiv suchen: bei genau einem gleichlautenden Treffer kommen Konto und Land dazu, sonst bleibt es der Name. */
  const loese = useCallback(async (n: string): Promise<Spieler> => {
    const m = gemerkt.current.get(n.toLowerCase());
    if (m) return { name: n, ...(m.epicId ? { epicId: m.epicId } : {}), ...(m.land ? { land: m.land } : {}) };
    try {
      const j = await fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(n)}`).then((r) => r.json());
      const gleich = (j.spieler ?? []).filter((x: { anzeige?: string; name?: string }) => (x.anzeige || x.name || '').toLowerCase() === n.toLowerCase());
      if (gleich.length === 1) {
        const g = { land: String(gleich[0].land ?? ''), epicId: String(gleich[0].epicId ?? '') };
        gemerkt.current.set(n.toLowerCase(), g);
        return { name: n, ...(g.epicId ? { epicId: g.epicId } : {}), ...(g.land ? { land: g.land } : {}) };
      }
    } catch { /* dann bleibt es beim Namen */ }
    return { name: n };
  }, []);

  /** Wie viele Plaetze ein Team hat: die Groesse des Cups, sonst vier. */
  const platzZahl = teamGroesse ?? 4;

  const zeilenZuTeams = async (zeilen: string[]): Promise<Team[]> => {
    const neu: Team[] = [];
    for (const z of zeilen) {
      const namen = z.split(/[&,/]/).map((n) => n.trim()).filter(Boolean).slice(0, 4);
      if (!namen.length) continue;
      neu.push({ id: teamId(neu.length), spieler: await Promise.all(namen.map(loese)), rang: null, punkte: null, siege: null, elims: null });
    }
    return neu;
  };

  /** Ein Team aus der Eingabe (Spieler mit Konto und Land): doppelte Teams werden abgewiesen. */
  const teamHinzu = (spieler: Spieler[]) => {
    const schluessel = (l: Spieler[]) => l.map((s) => s.name.toLowerCase()).sort().join('|');
    if (teams.some((x) => schluessel(x.spieler) === schluessel(spieler))) { setStatus('Dieses Team steht schon in der Liste.'); return; }
    setTeams((alt) => [...alt, { id: teamId(alt.length), spieler: spieler.slice(0, 4), rang: null, punkte: null, siege: null, elims: null }]);
    aendern(); setStatus('');
  };
  const masseHinzu = async () => {
    const zeilen = masse.split('\n'); setMasse(''); setStatus('Löst die Namen auf …');
    const neu = await zeilenZuTeams(zeilen);
    setTeams((alt) => [...alt, ...neu]); aendern(); setStatus(`${neu.length} Teams angelegt.`);
  };

  const teamAendern = (id: string, f: (t: Team) => Team) => { setTeams((alt) => alt.map((x) => (x.id === id ? f(x) : x))); aendern(); };
  const teamWeg = (id: string) => {
    setTeams((alt) => alt.filter((x) => x.id !== id));
    setFormen((alt) => alt.map((f) => ({ ...f, teamIds: f.teamIds.filter((i) => i !== id) })));
    aendern();
  };
  const alleWeg = () => {
    if (!window.confirm('Wirklich alle Teams dieser Karte löschen?')) return;
    setTeams([]); setFormen((alt) => alt.map((f) => ({ ...f, teamIds: [] }))); aendern();
  };
  /** Die Namen einer Zeile geaendert: bekannte Spieler behalten Konto und Land, neue werden im Archiv gesucht. */
  const namenAendern = async (x: Team, text: string) => {
    if (text.trim() === namenVon(x)) return;
    const namen = text.split(/[&,/]/).map((n) => n.trim()).filter(Boolean).slice(0, 4);
    if (!namen.length) return;
    const neu = await Promise.all(namen.map(async (n) => x.spieler.find((s) => s.name.toLowerCase() === n.toLowerCase()) ?? await loese(n)));
    teamAendern(x.id, (alt) => ({ ...alt, spieler: neu }));
  };

  /* ------------------------------------------------------------ Zeichnen */

  // Gezeichnet wird auf der Zeichenflaeche (Zeichenflaeche.tsx); sie meldet fertige Formen, die Wahl und das Loeschen.
  const hinzuForm = (punkte: P[]) => {
    const id = neueId();
    setFormen((alt) => [...alt, { id, punkte, teamIds: [] }]);
    setWahl(id); aendern(); setModus('waehlen');
  };
  const formWeg = useCallback(() => {
    if (!wahl) return;
    setFormen((alt) => alt.filter((f) => f.id !== wahl));
    setWahl(null); aendern();
  }, [wahl]);

  /** Eine Form wurde verschoben oder an einer Ecke gezogen. */
  const formAendern = (id: string, punkte: P[]) => {
    setFormen((alt) => alt.map((f) => (f.id === id ? { ...f, punkte } : f)));
    aendern();
  };

  /** Die Formen fuer die Zeichenflaeche: je Form die Spieler der Teams darauf (fuer die Namen auf der Karte). */
  /** Alle Teams, die sich auf eine Form legen lassen: bei einer Karte von Noble deren Teams, dazu die eigenen. */
  const pool = useMemo(() => [...(noble?.teams ?? []), ...teams], [noble, teams]);
  const zformen = useMemo((): ZForm[] => formen.map((f) => ({
    id: f.id, punkte: f.punkte,
    teams: f.teamIds.map((id) => pool.find((x) => x.id === id)?.spieler.map((s) => s.name) ?? []).filter((n) => n.length),
  })), [formen, pool]);

  const formVon = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of formen) for (const id of f.teamIds) m.set(id, f.id);
    return m;
  }, [formen]);
  const gewaehlt = formen.find((f) => f.id === wahl) ?? null;

  const zuordnen = (id: string) => {
    if (!gewaehlt) { setStatus('Erst eine Form anklicken, dann das Team.'); return; }
    setFormen((alt) => alt.map((f) => {
      const ohne = f.teamIds.filter((i) => i !== id);
      if (f.id !== gewaehlt.id) return { ...f, teamIds: ohne };
      return { ...f, teamIds: f.teamIds.includes(id) ? ohne : [...ohne, id] };
    }));
    aendern();
  };

  const sichtbareTeams = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return q ? teams.filter((x) => namenVon(x).toLowerCase().includes(q)) : teams;
  }, [teams, suche]);
  /** Die Teams neben der Karte (Landepunkte): bei Noble-Karten ohne eigene Teams deren Teams, sonst die eigenen. */
  const poolSichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const basis = teams.length ? teams : pool;
    return q ? basis.filter((x) => namenVon(x).toLowerCase().includes(q)) : basis;
  }, [teams, pool, suche]);

  /* ------------------------------------------------------------ Speichern und Angaben */

  const speichern = async () => {
    if (!par) return;
    setStatus('Speichert …');
    // Von den Angaben geht nur, was sich geaendert hat - sonst friert jede Speicherung Archivwerte ein.
    const diff: Partial<Meta> = {};
    if (meta && metaStart.current) {
      (['cup', 'fenster', 'datum', 'lan', 'bild'] as const).forEach((k) => { if (meta[k] !== metaStart.current![k]) (diff as Record<string, unknown>)[k] = meta[k]; });
    }
    try {
      const r = await fetch('/api/alte-maps', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aktion: 'speichern', w: par.w, formen, teams, ...(hatEpic ? { epicAn } : {}), ...(Object.keys(diff).length ? { meta: diff } : {}) }),
      });
      const j = await r.json();
      if (j?.ok) { setGeaendert(false); setStatus('Gespeichert.'); metaStart.current = meta; } else setStatus(j?.error || 'Nicht gespeichert.');
    } catch { setStatus('Nicht gespeichert.'); }
  };

  const bildWaehlen = async (u: string) => {
    if (!par) return;
    const r = await fetch('/api/maps-bild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ w: par.w, u }) });
    const j = await r.json().catch(() => ({}));
    if (j?.ok) { setBild(j.u ?? null); setBilderOffen(false); }
  };
  const hochladen = async (datei: File | null) => {
    if (!datei) return;
    setStatus('Lädt hoch …');
    const f = new FormData(); f.set('bild', datei); f.set('titel', datei.name.replace(/\.[^.]+$/, ''));
    const r = await fetch('/api/karten-bild', { method: 'POST', body: f });
    const j = await r.json().catch(() => ({}));
    if (!j?.ok) { setStatus(j?.error || 'Hochladen fehlgeschlagen.'); return; }
    const bi = await fetch(`/api/maps-bild?w=${encodeURIComponent(par?.w ?? '')}`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
    if (bi?.ok) setAuswahl(bi.auswahl ?? []);
    setStatus('Hochgeladen - jetzt auswählen.');
  };
  const verstecken = async (v: boolean) => {
    if (!par) return;
    await fetch('/api/alte-maps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'verstecken', w: par.w, versteckt: v }) });
    setVersteckt(v);
  };
  const loeschen = async () => {
    if (!par || !window.confirm('Dieses Event samt Formen und Teams endgültig löschen?')) return;
    const r = await fetch('/api/alte-maps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'loeschen', w: par.w }) });
    const j = await r.json().catch(() => ({}));
    if (j?.ok) { setGeaendert(false); window.location.href = '/admin/alte-maps'; } else window.alert(j?.error || 'Nicht gelöscht.');
  };

  /* ------------------------------------------------------------ Ansicht */

  if (zugang.laedt) return <main className="min-h-screen bg-zinc-950"><LadeSchirm /></main>;
  if (!zugang.admin) return <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-sm text-slate-400"><T>Nur für den Admin.</T></main>;

  const oeffentlich = par ? `/tournament-maps/karte?t=${encodeURIComponent(par.t)}&r=${encodeURIComponent(par.r)}&w=${encodeURIComponent(par.w)}` : '/tournament-maps';
  const sortiert = [...teams].sort((a, b) => (a.rang ?? 99999) - (b.rang ?? 99999));

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1600px] px-4 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/admin/alte-maps" className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition hover:border-sky-500/60">← <T>Alte Maps</T></Link>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black tracking-tight sm:text-3xl">{eintrag ? (meta ? `${meta.cup} · ${meta.fenster}` : eintrag.titel) : t('Karte bearbeiten')}</h1>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{eintrag?.saisonKurz}</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {status && <span className="text-xs text-slate-400">{status}</span>}
            <Link href={oeffentlich} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-sky-500/60"><T>Ansehen</T> →</Link>
            <button type="button" onClick={() => void speichern()} disabled={!geaendert}
              className="rounded-lg bg-amber-400 px-5 py-2 text-sm font-black text-zinc-950 transition hover:bg-amber-300 disabled:opacity-40"><T>Speichern</T></button>
          </div>
        </div>

        {fehler && <p className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300"><T>{fehler}</T></p>}
        {!bereit && !fehler && <div className="mt-10"><LadeSchirm /></div>}

        {bereit && (
          <>
            <div className="mt-5 inline-flex flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-black/30 p-1">
              {REITER.map(([k, titel]) => (
                <button key={k} type="button" onClick={() => setReiter(k)}
                  className={`rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${reiter === k ? 'bg-white text-zinc-900' : 'text-slate-400 hover:text-slate-100'}`}>
                  <T>{titel}</T>{k === 'teams' && <span className="ml-1.5 opacity-60">{teams.length}</span>}{k === 'formen' && <span className="ml-1.5 opacity-60">{formen.length}</span>}
                </button>
              ))}
            </div>

            {/* ============================================================ Landepunkte */}
            {reiter === 'formen' && (
              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {([['rechteck', 'Rechteck'], ['polygon', 'Freie Form'], ['waehlen', 'Auswählen']] as const).map(([k, titel]) => (
                      <button key={k} type="button" onClick={() => setModus(k)}
                        className={`rounded-lg px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition ${modus === k ? 'bg-sky-500 text-white' : 'border border-white/10 bg-white/[0.03] text-slate-300 hover:border-sky-500/60'}`}>
                        <T>{titel}</T>
                      </button>
                    ))}
                    {wahl && <button type="button" onClick={formWeg} className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-bold text-rose-300 transition hover:bg-rose-500/10"><T>Form löschen</T></button>}
                    <button type="button" onClick={() => setBilderOffen((v) => !v)} className="ml-auto rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-sky-500/60"><T>Kartenbild wählen</T></button>
                  </div>
                  <p className="mb-2 text-[11px] text-slate-500">
                    {modus === 'rechteck' && <T>Auf der Karte ziehen, um ein Rechteck zu zeichnen.</T>}
                    {modus === 'polygon' && <T>Punkt für Punkt klicken; auf den ersten Punkt, Doppelklick oder Enter schließt die Form, Rücktaste nimmt den letzten Punkt zurück.</T>}
                    {modus === 'waehlen' && <T>Eine Form anklicken, dann rechts die Teams darauf legen. Die gewählte Form lässt sich ziehen (verschieben); die Punkte an den Ecken ziehen sie größer oder kleiner. Doppelklick fährt die Form an, Entf löscht sie.</T>}
                    {' '}<T>Mausrad zoomt; verschieben mit rechter Maustaste oder Leertaste und Ziehen.</T>
                  </p>

                  {bilderOffen && (
                    <div className="mb-3 rounded-xl border border-white/[0.08] bg-black/30 p-2">
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                        {auswahl.map((a) => (
                          <button key={a.u} type="button" title={a.titel} onClick={() => void bildWaehlen(a.u)}
                            className={`overflow-hidden rounded-lg border text-left transition ${bild === a.u ? 'border-sky-400' : 'border-white/10 hover:border-sky-500/60'}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={encodeURI(a.u)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                            <span className="block truncate px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">{a.titel}</span>
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/[0.08] pt-2 text-xs text-slate-400">
                        <T>Eigenes Kartenbild hochladen:</T>
                        <input type="file" accept="image/*" onChange={(e) => void hochladen(e.target.files?.[0] ?? null)} className="text-xs" />
                      </div>
                    </div>
                  )}

                  {noble && (
                    <p className="mb-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-100/90">
                      <T>Diese Karte führt Noble Practice.</T> {noble.formen > 0 ? `${noble.formen} ` : ''}{noble.formen > 0 ? <T>Landepunkte stehen dort schon - sobald du hier Formen speicherst, gelten nur deine.</T> : <T>Dort stehen keine Landepunkte - zeichne sie hier ein.</T>}
                    </p>
                  )}
                  <Zeichenflaeche bild={bild ?? standardBild} formen={zformen} wahl={wahl} modus={modus} onWahl={setWahl}
                    onNeueForm={hinzuForm} onFormAendern={formAendern} onLoeschen={formWeg} onModus={setModus} />
                  <p className="mt-2 text-[11px] text-slate-600">{formen.length} <T>Formen</T> · {formen.reduce((a, f) => a + f.teamIds.length, 0)} / {teams.length} <T>Teams verteilt</T></p>
                </div>

                <aside className="min-w-0">
                  <div className="rounded-xl border border-white/[0.08] bg-zinc-900/40 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {gewaehlt ? <><T>Form gewählt</T> · {gewaehlt.teamIds.length} {t('Teams')}</> : <T>Keine Form gewählt</T>}
                    </p>
                    {gewaehlt && gewaehlt.teamIds.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {gewaehlt.teamIds.map((id) => {
                          const x = pool.find((tt) => tt.id === id);
                          return x ? (
                            <li key={id}>
                              <button type="button" onClick={() => zuordnen(id)} title={t('Von der Form nehmen')}
                                className="rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-[11px] font-bold uppercase text-sky-100 transition hover:bg-rose-500/20">{namenVon(x).replace(/ & /g, ' · ')} ×</button>
                            </li>
                          ) : null;
                        })}
                      </ul>
                    )}
                  </div>

                  <div className="mt-3 rounded-xl border border-white/[0.08] bg-zinc-900/40 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Team schnell anlegen</T></p>
                    <div className="mt-2"><TeamEingabe max={platzZahl} unbekannt={teamGroesse === null} onTeam={teamHinzu} loese={loese} /></div>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/[0.08] bg-zinc-900/40 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Teams <span className="text-slate-600">{teams.length ? teams.length : pool.length}</span></p>
                      <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Spieler suchen …')} className="w-40 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
                    </div>
                    {poolSichtbar.length === 0 && <p className="py-4 text-center text-xs text-slate-500"><T>Noch keine Teams - oben Spieler suchen oder im Reiter „Teams“ viele auf einmal anlegen.</T></p>}
                    <ul className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
                      {poolSichtbar.map((x) => {
                        const drauf = formVon.get(x.id);
                        return (
                          <li key={x.id}>
                            <button type="button" onClick={() => zuordnen(x.id)}
                              className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${drauf === wahl && wahl ? 'border-sky-500/70 bg-sky-500/10' : drauf ? 'border-white/[0.06] bg-zinc-900/40 opacity-60 hover:opacity-100' : 'border-white/[0.08] bg-zinc-900/70 hover:border-sky-500/50'}`}>
                              <TeamFlagge groesse={x.spieler.length > 1 ? 28 : 22} laender={x.spieler.map((s) => s.land ?? undefined)} />
                              <span className="flex min-w-0 flex-col text-[11px] font-bold uppercase leading-[1.25] text-slate-100">
                                {x.spieler.map((s, i) => <span key={i} className="truncate">{s.name}</span>)}
                              </span>
                              {drauf && <span className="ml-auto shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-300" title={t('Liegt auf einer Form')}>✓</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </aside>
              </div>
            )}

            {/* ============================================================ Teams */}
            {reiter === 'teams' && (
              <div className="mt-5 grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
                <div className="rounded-xl border border-white/[0.08] bg-zinc-900/40 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Team anlegen</T></p>
                  <div className="mb-5 mt-2"><TeamEingabe max={platzZahl} unbekannt={teamGroesse === null} onTeam={teamHinzu} loese={loese} /></div>
                  <p className="border-t border-white/[0.08] pt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Viele Teams auf einmal</T></p>
                  <p className="mt-1 text-xs text-slate-500"><T>Eine Zeile pro Team, die Namen mit & getrennt. Jeder Name wird im Archiv gesucht: gibt es genau einen Treffer, kommen Flagge und Konto dazu.</T></p>
                  <textarea value={masse} onChange={(e) => setMasse(e.target.value)} rows={10} placeholder={'Sky & Scroll\nVico & Malibuca\nPeterbot & Pollo'} className={`${FELD} mt-3 w-full font-mono`} />
                  <div className="mt-3 flex items-center gap-3">
                    <button type="button" onClick={() => void masseHinzu()} disabled={!masse.trim()} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-zinc-900 transition hover:bg-sky-100 disabled:opacity-40"><T>Teams anlegen</T></button>
                    {teams.length > 0 && <button type="button" onClick={alleWeg} className="ml-auto text-xs font-semibold text-slate-500 transition hover:text-rose-300"><T>Alle löschen</T></button>}
                  </div>
                </div>

                <div className="min-w-0 rounded-xl border border-white/[0.08] bg-zinc-900/40 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Teams <span className="text-slate-600">{teams.length}</span></p>
                    <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Spieler suchen …')} className="w-48 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
                  </div>
                  {teams.length === 0 && <p className="py-8 text-center text-sm text-slate-500"><T>Noch keine Teams.</T></p>}
                  <ul className="space-y-1.5">
                    {sichtbareTeams.map((x) => (
                      <li key={x.id} className="rounded-lg border border-white/[0.07] bg-zinc-900/60">
                        <div className="flex items-center gap-2.5 px-2.5 py-1.5">
                          <TeamFlagge groesse={x.spieler.length > 1 ? 28 : 22} laender={x.spieler.map((s) => s.land ?? undefined)} />
                          <input defaultValue={namenVon(x)} key={`${x.id}|${namenVon(x)}`} onBlur={(e) => void namenAendern(x, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-bold uppercase text-slate-100 outline-none transition hover:border-zinc-700 focus:border-sky-500 focus:bg-zinc-950" />
                          <button type="button" onClick={() => setOffenesTeam(offenesTeam === x.id ? null : x.id)} className="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-400 transition hover:bg-white/[0.06]"><T>Länder</T></button>
                          <button type="button" onClick={() => teamWeg(x.id)} title={t('Team löschen')} className="rounded-md px-2 py-1 text-slate-600 transition hover:bg-rose-500/15 hover:text-rose-300">×</button>
                        </div>
                        {offenesTeam === x.id && (
                          <div className="flex flex-wrap gap-3 border-t border-white/[0.06] px-3 py-2">
                            {x.spieler.map((s, i) => (
                              <label key={i} className="flex items-center gap-2 text-xs text-slate-400">
                                <span className="font-bold uppercase text-slate-300">{s.name}</span>
                                <TeamFlagge groesse={16} laender={[s.land ?? undefined]} />
                                <input value={s.land ?? ''} maxLength={2} placeholder="DE" onChange={(e) => teamAendern(x.id, (alt) => ({ ...alt, spieler: alt.spieler.map((q, j) => (j === i ? { ...q, land: e.target.value.toUpperCase() } : q)) }))}
                                  className="w-12 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-center text-xs uppercase text-slate-100 outline-none focus:border-sky-500" />
                              </label>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* ============================================================ Leaderboard */}
            {reiter === 'leaderboard' && (
              <div className="mt-5">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <p className="text-xs text-slate-500"><T>Platz, Punkte, Victory Royales und Eliminierungen je Team - alles von Hand. Teams legst du im Reiter „Teams“ an.</T></p>
                  <button type="button" onClick={() => { const nach = [...teams].filter((x) => x.punkte != null).sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0)); setTeams((alt) => alt.map((x) => ({ ...x, rang: x.punkte != null ? nach.findIndex((y) => y.id === x.id) + 1 : x.rang ?? null }))); aendern(); }}
                    className="ml-auto rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-sky-500/60"><T>Plätze nach Punkten vergeben</T></button>
                  <button type="button" onClick={() => { setTeams((alt) => alt.map((x) => ({ ...x, rang: null }))); aendern(); }} className="text-xs font-semibold text-slate-500 transition hover:text-rose-300"><T>Plätze löschen</T></button>
                </div>
                {teams.length === 0 ? <p className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-8 text-center text-sm text-slate-500"><T>Noch keine Teams - lege sie zuerst im Reiter „Teams“ an.</T></p> : (
                  <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-zinc-900/40">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.08] text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          <th className="w-24 px-3 py-2"><T>Platz</T></th><th className="px-3 py-2">Team</th>
                          <th className="w-24 px-3 py-2 text-right">Pts</th><th className="w-20 px-3 py-2 text-right" title="Victory Royales">VR</th><th className="w-24 px-3 py-2 text-right">Elims</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortiert.map((x) => (
                          <tr key={x.id} className="border-b border-white/[0.04]">
                            <td className="px-3 py-1.5"><input inputMode="numeric" value={x.rang ?? ''} onChange={(e) => teamAendern(x.id, (alt) => ({ ...alt, rang: zahlOder(e.target.value) }))} className={ZAHL} /></td>
                            <td className="px-3 py-1.5">
                              <span className="flex items-center gap-2.5">
                                <TeamFlagge groesse={x.spieler.length > 1 ? 26 : 20} laender={x.spieler.map((s) => s.land ?? undefined)} />
                                <span className="flex flex-col text-[11px] font-bold uppercase leading-[1.25] text-slate-100">{x.spieler.map((s, i) => <span key={i}>{s.name}</span>)}</span>
                              </span>
                            </td>
                            <td className="px-3 py-1.5"><input inputMode="numeric" value={x.punkte ?? ''} onChange={(e) => teamAendern(x.id, (alt) => ({ ...alt, punkte: zahlOder(e.target.value) }))} className={ZAHL} /></td>
                            <td className="px-3 py-1.5"><input inputMode="numeric" value={x.siege ?? ''} onChange={(e) => teamAendern(x.id, (alt) => ({ ...alt, siege: zahlOder(e.target.value) }))} className={ZAHL} /></td>
                            <td className="px-3 py-1.5"><input inputMode="numeric" value={x.elims ?? ''} onChange={(e) => teamAendern(x.id, (alt) => ({ ...alt, elims: zahlOder(e.target.value) }))} className={ZAHL} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ============================================================ Angaben */}
            {reiter === 'angaben' && meta && (
              <div className="mt-5 max-w-2xl space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-slate-400"><T>Cup</T>
                    <input value={meta.cup} onChange={(e) => { setMeta({ ...meta, cup: e.target.value }); aendern(); }} className={`${FELD} mt-1 w-full`} /></label>
                  <label className="text-xs text-slate-400"><T>Spieltag</T>
                    <input value={meta.fenster} onChange={(e) => { setMeta({ ...meta, fenster: e.target.value }); aendern(); }} className={`${FELD} mt-1 w-full`} /></label>
                  <label className="text-xs text-slate-400"><T>Datum</T>
                    <input type="date" value={tagVon(meta.datum)} onChange={(e) => { setMeta({ ...meta, datum: e.target.value ? Date.parse(e.target.value) : null }); aendern(); }} className={`${FELD} mt-1 w-full`} /></label>
                  <label className="flex items-end gap-2 pb-2 text-sm font-semibold text-slate-300"><input type="checkbox" checked={meta.lan} onChange={(e) => { setMeta({ ...meta, lan: e.target.checked }); aendern(); }} /> LAN</label>
                </div>
                <label className="block text-xs text-slate-400"><T>Bild der Kachel (Adresse)</T>
                  <input value={meta.bild ?? ''} onChange={(e) => { setMeta({ ...meta, bild: e.target.value.trim() || null }); aendern(); }} placeholder="/saisonbilder/CH3.jpg" className={`${FELD} mt-1 w-full`} /></label>
                {hatEpic && (
                  <label className="flex items-start gap-2 rounded-xl border border-white/[0.08] bg-zinc-900/40 p-3 text-sm text-slate-300">
                    <input type="checkbox" className="mt-1" checked={epicAn} onChange={(e) => { setEpicAn(e.target.checked); aendern(); }} />
                    <span><T>Epics Bestenliste und Teams zeigen, solange hier keine eigenen Teams stehen.</T>
                      <span className="mt-0.5 block text-xs text-slate-500"><T>Sobald du das erste eigene Team anlegst, gilt nur noch, was du eingetragen hast.</T></span></span>
                  </label>
                )}
                <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.08] pt-4">
                  <button type="button" onClick={() => void verstecken(!versteckt)} className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-sky-500/60">{versteckt ? <T>Wieder zeigen</T> : <T>Aus der Liste nehmen</T>}</button>
                  {eigenesEvent && <button type="button" onClick={() => void loeschen()} className="rounded-lg border border-rose-500/40 px-4 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/10"><T>Event löschen</T></button>}
                  {versteckt && <span className="text-xs text-rose-300"><T>Diese Karte ist gerade versteckt.</T></span>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
