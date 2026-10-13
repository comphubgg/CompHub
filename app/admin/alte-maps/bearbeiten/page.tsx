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
import { kartenQuelle } from '@/app/globals-solos/Bausteine';

interface P { x: number; y: number }
interface Form { id: string; punkte: P[]; teamIds: string[] }
interface Spieler { name: string; epicId?: string; land?: string | null }
interface Team { id: string; spieler: Spieler[]; rang?: number | null; punkte?: number | null; siege?: number | null; elims?: number | null }
interface Meta { cup: string; fenster: string; datum: number | null; lan: boolean; bild: string | null }
interface Eintrag { turnierId: string; region: string; windowId: string; titel: string; saisonKurz: string; saison: string }
type Modus = 'waehlen' | 'rechteck' | 'polygon';
type Reiter = 'formen' | 'teams' | 'leaderboard' | 'angaben';

const REITER: Array<[Reiter, string]> = [['formen', 'Landepunkte'], ['teams', 'Teams'], ['leaderboard', 'Leaderboard'], ['angaben', 'Angaben']];
const FARBE_LEER = 'rgba(148,163,184,.25)';
const rund = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 100) / 100;
const neueId = () => `f${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`;
const teamId = (n: number) => `hand-${Date.now().toString(36)}-${n}-${Math.floor(Math.random() * 1000).toString(36)}`;
const zahlOder = (v: string): number | null => (v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const namenVon = (t: Team) => t.spieler.map((s) => s.name).join(' & ');
const tagVon = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');

function mitte(punkte: P[]): P {
  const xs = punkte.map((p) => p.x); const ys = punkte.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

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
  const [zieht, setZieht] = useState<{ a: P; b: P } | null>(null);
  const [eckpunkte, setEckpunkte] = useState<P[]>([]);
  const [zeiger, setZeiger] = useState<P | null>(null);
  const [bild, setBild] = useState<string | null>(null);
  const [auswahl, setAuswahl] = useState<Array<{ u: string; titel: string }>>([]);
  const [bilderOffen, setBilderOffen] = useState(false);
  const [suche, setSuche] = useState('');
  const flaeche = useRef<HTMLDivElement | null>(null);

  // Teams anlegen
  const [schnell, setSchnell] = useState('');
  const [masse, setMasse] = useState('');
  const [offenesTeam, setOffenesTeam] = useState<string | null>(null);
  const [vorschlaege, setVorschlaege] = useState<Array<{ name: string; land: string; epicId: string }>>([]);
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
    ]).then(([b, bi]) => {
      if (weg) return;
      if (!b?.ok) { setFehler(b?.error || 'Die Karte ließ sich nicht laden.'); return; }
      setEintrag(b.eintrag); setTeams(b.teams ?? []); setFormen(b.formen ?? []);
      setMeta(b.meta); metaStart.current = b.meta; setEpicAn(b.epicAn !== false); setHatEpic(!!b.hatEpic);
      setEigenesEvent(!!b.eigenesEvent); setVersteckt(!!b.versteckt);
      if (bi?.ok) { setBild(bi.u ?? null); setAuswahl(bi.auswahl ?? []); }
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

  const angefangen = (schnell.split(/[&,/]/).pop() ?? '').trim();
  useEffect(() => {
    if (angefangen.length < 2) { setVorschlaege([]); return undefined; }
    let lebt = true;
    const uhr = setTimeout(() => {
      fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(angefangen)}`).then((r) => r.json()).then((j) => {
        if (!lebt) return;
        setVorschlaege((j.spieler ?? []).slice(0, 6).map((s: { anzeige?: string; name?: string; land?: string; epicId?: string }) => ({
          name: s.anzeige || s.name || '', land: s.land ?? '', epicId: s.epicId ?? '',
        })).filter((x: { name: string }) => x.name));
      }).catch(() => { /* ohne Vorschlaege */ });
    }, 250);
    return () => { lebt = false; clearTimeout(uhr); };
  }, [angefangen]);

  const nehmen = (v: { name: string; land: string; epicId: string }) => {
    gemerkt.current.set(v.name.toLowerCase(), { land: v.land, epicId: v.epicId });
    setSchnell((alt) => {
      const stuecke = alt.split(/([&,/])/);
      for (let i = stuecke.length - 1; i >= 0; i -= 1) if (!/^[&,/]$/.test(stuecke[i])) { stuecke[i] = ` ${v.name}`; break; }
      return stuecke.join('').replace(/^\s+/, '');
    });
    setVorschlaege([]);
  };

  const zeilenZuTeams = async (zeilen: string[]): Promise<Team[]> => {
    const neu: Team[] = [];
    for (const z of zeilen) {
      const namen = z.split(/[&,/]/).map((n) => n.trim()).filter(Boolean).slice(0, 4);
      if (!namen.length) continue;
      neu.push({ id: teamId(neu.length), spieler: await Promise.all(namen.map(loese)), rang: null, punkte: null, siege: null, elims: null });
    }
    return neu;
  };

  const schnellHinzu = async () => {
    const z = schnell; setSchnell('');
    const neu = await zeilenZuTeams([z]);
    if (neu.length) { setTeams((alt) => [...alt, ...neu]); aendern(); }
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

  const punktAus = useCallback((e: { clientX: number; clientY: number }): P | null => {
    const el = flaeche.current; if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: rund(((e.clientX - b.left) / b.width) * 100), y: rund(((e.clientY - b.top) / b.height) * 100) };
  }, []);

  const hinzuForm = (punkte: P[]) => {
    const id = neueId();
    setFormen((alt) => [...alt, { id, punkte, teamIds: [] }]);
    setWahl(id); aendern(); setModus('waehlen');
  };
  const polygonFertig = useCallback(() => {
    if (eckpunkte.length >= 3) hinzuForm(eckpunkte);
    setEckpunkte([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eckpunkte]);
  const formWeg = useCallback(() => {
    if (!wahl) return;
    setFormen((alt) => alt.filter((f) => f.id !== wahl));
    setWahl(null); aendern();
  }, [wahl]);

  useEffect(() => {
    if (reiter !== 'formen') return undefined;
    const taste = (e: KeyboardEvent) => {
      const ziel = (e.target as HTMLElement)?.tagName;
      if (ziel === 'INPUT' || ziel === 'TEXTAREA') return;
      if (e.key === 'Escape') { setEckpunkte([]); setZieht(null); setModus('waehlen'); }
      if (e.key === 'Enter' && modus === 'polygon') polygonFertig();
      if (e.key === 'Backspace' && modus === 'polygon') { e.preventDefault(); setEckpunkte((p) => p.slice(0, -1)); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && modus === 'waehlen' && wahl) { e.preventDefault(); formWeg(); }
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [reiter, modus, wahl, polygonFertig, formWeg]);

  const abwaerts = (e: React.PointerEvent) => {
    const p = punktAus(e); if (!p) return;
    if (modus === 'rechteck') { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); setZieht({ a: p, b: p }); return; }
    if (modus === 'polygon') {
      if (eckpunkte.length >= 3 && Math.hypot(p.x - eckpunkte[0].x, p.y - eckpunkte[0].y) < 1.6) { polygonFertig(); return; }
      setEckpunkte((alt) => [...alt, p]);
    }
  };
  const bewegt = (e: React.PointerEvent) => {
    const p = punktAus(e); if (!p) return;
    setZeiger(p);
    if (zieht) setZieht({ ...zieht, b: p });
  };
  const aufwaerts = () => {
    if (!zieht) return;
    const { a, b } = zieht; setZieht(null);
    if (Math.abs(a.x - b.x) < 0.8 || Math.abs(a.y - b.y) < 0.8) return;
    const [x1, x2] = [Math.min(a.x, b.x), Math.max(a.x, b.x)]; const [y1, y2] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
    hinzuForm([{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]);
  };

  const nummer = useMemo(() => new Map(formen.map((f, i) => [f.id, i + 1])), [formen]);
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
  const farbeVon = (f: Form) => (f.id === wahl ? 'rgba(251,191,36,.45)' : f.teamIds.length === 0 ? FARBE_LEER
    : f.teamIds.length >= (teams.some((x) => x.spieler.length > 1) ? 3 : 2) ? 'rgba(239,68,68,.45)' : 'rgba(45,212,191,.42)');
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
                      <button key={k} type="button" onClick={() => { setModus(k); setEckpunkte([]); }}
                        className={`rounded-lg px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition ${modus === k ? 'bg-sky-500 text-white' : 'border border-white/10 bg-white/[0.03] text-slate-300 hover:border-sky-500/60'}`}>
                        <T>{titel}</T>
                      </button>
                    ))}
                    {modus === 'polygon' && eckpunkte.length >= 3 && (
                      <button type="button" onClick={polygonFertig} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white"><T>Form schließen</T> ↵</button>
                    )}
                    {wahl && <button type="button" onClick={formWeg} className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-bold text-rose-300 transition hover:bg-rose-500/10"><T>Form löschen</T></button>}
                    <button type="button" onClick={() => setBilderOffen((v) => !v)} className="ml-auto rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-sky-500/60"><T>Kartenbild wählen</T></button>
                  </div>
                  <p className="mb-2 text-[11px] text-slate-500">
                    {modus === 'rechteck' && <T>Auf der Karte ziehen, um ein Rechteck zu zeichnen.</T>}
                    {modus === 'polygon' && <T>Punkt für Punkt klicken; auf den ersten Punkt oder Enter schließt die Form, Rücktaste nimmt den letzten Punkt zurück.</T>}
                    {modus === 'waehlen' && <T>Eine Form anklicken, dann rechts die Teams darauf legen. Entf löscht die Form.</T>}
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

                  <div ref={flaeche} className="relative aspect-square w-full max-w-[820px] touch-none select-none overflow-hidden rounded-2xl bg-[#0b2f83] ring-1 ring-white/10"
                    style={{ cursor: modus === 'waehlen' ? 'default' : 'crosshair' }}
                    onPointerDown={abwaerts} onPointerMove={bewegt} onPointerUp={aufwaerts} onPointerLeave={() => setZeiger(null)}
                    onDoubleClick={() => { if (modus === 'polygon') polygonFertig(); }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={kartenQuelle(bild)} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                      {formen.map((f) => (
                        <polygon key={f.id} points={f.punkte.map((p) => `${p.x},${p.y}`).join(' ')} fill={farbeVon(f)}
                          stroke={f.id === wahl ? '#fbbf24' : 'rgba(255,255,255,.75)'} strokeWidth={f.id === wahl ? 2.4 : 1.2} vectorEffect="non-scaling-stroke"
                          style={{ cursor: modus === 'waehlen' ? 'pointer' : undefined }}
                          onPointerDown={(e) => { if (modus === 'waehlen') { e.stopPropagation(); setWahl(f.id); } }} />
                      ))}
                      {formen.map((f) => {
                        const m = mitte(f.punkte);
                        return <text key={`n${f.id}`} x={m.x} y={m.y} textAnchor="middle" dominantBaseline="central" fontSize="2.4" fontWeight="800" fill="#fff"
                          stroke="rgba(0,0,0,.7)" strokeWidth="0.5" paintOrder="stroke" style={{ pointerEvents: 'none' }}>{nummer.get(f.id)}{f.teamIds.length > 1 ? `·${f.teamIds.length}` : ''}</text>;
                      })}
                      {zieht && (
                        <rect x={Math.min(zieht.a.x, zieht.b.x)} y={Math.min(zieht.a.y, zieht.b.y)} width={Math.abs(zieht.a.x - zieht.b.x)} height={Math.abs(zieht.a.y - zieht.b.y)}
                          fill="rgba(56,189,248,.25)" stroke="#38bdf8" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                      )}
                      {eckpunkte.length > 0 && (
                        <>
                          <polyline points={[...eckpunkte, ...(zeiger ? [zeiger] : [])].map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(56,189,248,.18)" stroke="#38bdf8" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                          {eckpunkte.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? 1.1 : 0.7} fill={i === 0 ? '#34d399' : '#38bdf8'} />)}
                        </>
                      )}
                    </svg>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-600">{formen.length} <T>Formen</T> · {formen.reduce((a, f) => a + f.teamIds.length, 0)} / {teams.length} <T>Teams verteilt</T></p>
                </div>

                <aside className="min-w-0">
                  <div className="rounded-xl border border-white/[0.08] bg-zinc-900/40 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {gewaehlt ? <>{t('Form')} {nummer.get(gewaehlt.id)} · {gewaehlt.teamIds.length} {t('Teams')}</> : <T>Keine Form gewählt</T>}
                    </p>
                    {gewaehlt && gewaehlt.teamIds.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {gewaehlt.teamIds.map((id) => {
                          const x = teams.find((tt) => tt.id === id);
                          return x ? (
                            <li key={id}>
                              <button type="button" onClick={() => zuordnen(id)} title={t('Von der Form nehmen')}
                                className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[11px] font-bold uppercase text-amber-100 transition hover:bg-rose-500/20">{namenVon(x).replace(/ & /g, ' · ')} ×</button>
                            </li>
                          ) : null;
                        })}
                      </ul>
                    )}
                  </div>

                  <div className="mt-3 rounded-xl border border-white/[0.08] bg-zinc-900/40 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Team schnell anlegen</T></p>
                    <div className="relative mt-2">
                      <input value={schnell} onChange={(e) => setSchnell(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void schnellHinzu(); }}
                        placeholder={t('Namen, mit & getrennt, z. B. Sky & Scroll')} className={`${FELD} w-full`} />
                      {vorschlaege.length > 0 && (
                        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 shadow-xl">
                          {vorschlaege.map((v) => (
                            <li key={v.epicId || v.name}>
                              <button type="button" onClick={() => nehmen(v)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-zinc-900">
                                <TeamFlagge groesse={16} laender={[v.land || undefined]} /><span className="truncate">{v.name}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-white/[0.08] bg-zinc-900/40 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Teams <span className="text-slate-600">{teams.length}</span></p>
                      <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Spieler suchen …')} className="w-40 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
                    </div>
                    {teams.length === 0 && <p className="py-4 text-center text-xs text-slate-500"><T>Noch keine Teams - oben eintippen oder im Reiter „Teams“ viele auf einmal anlegen.</T></p>}
                    <ul className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
                      {sichtbareTeams.map((x) => {
                        const drauf = formVon.get(x.id);
                        return (
                          <li key={x.id}>
                            <button type="button" onClick={() => zuordnen(x.id)}
                              className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${drauf === wahl && wahl ? 'border-amber-400/60 bg-amber-400/10' : drauf ? 'border-white/[0.06] bg-zinc-900/40 opacity-60 hover:opacity-100' : 'border-white/[0.08] bg-zinc-900/70 hover:border-sky-500/50'}`}>
                              <TeamFlagge groesse={x.spieler.length > 1 ? 28 : 22} laender={x.spieler.map((s) => s.land ?? undefined)} />
                              <span className="flex min-w-0 flex-col text-[11px] font-bold uppercase leading-[1.25] text-slate-100">
                                {x.spieler.map((s, i) => <span key={i} className="truncate">{s.name}</span>)}
                              </span>
                              {drauf && <span className="ml-auto shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">{nummer.get(drauf)}</span>}
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
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Viele Teams auf einmal</T></p>
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
