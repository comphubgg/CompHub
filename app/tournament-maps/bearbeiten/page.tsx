'use client';

/*
 * Die Landepunkte einer alten Karte einzeichnen - nur Admin.
 *
 * Der Betreiber (12.10.2026): "extra Seite nur für diese Pages ... und selber machen mit Spieler und so". Hier zieht der
 * Admin Rechtecke oder freie Formen auf die Inselkarte und legt die Teams darauf. Gibt es zum Event Epics Bestenliste,
 * kommen die Teams von dort; sonst tippt er sie selbst ein (Namen mit Vorschlägen aus dem Archiv, Platz und Punkte
 * optional). Gespeichert wird in alte-maps.json (lib/alteMaps), die Seite zeigt das Ergebnis sofort in der Karte.
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
interface EditSpieler { name: string; epicId?: string; land?: string | null }
interface EditTeam { id: string; spieler: EditSpieler[]; rang?: number | null; punkte?: number | null }
interface Eintrag { turnierId: string; region: string; windowId: string; cup: string; fenster: string; titel: string; saisonKurz: string }
type Modus = 'waehlen' | 'rechteck' | 'polygon';

const FARBE_LEER = 'rgba(148,163,184,.25)';
const rund = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 100) / 100;
const neueId = () => `f${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`;

/** Die Mitte einer Form - dort steht ihre Nummer. */
function mitte(punkte: P[]): P {
  const xs = punkte.map((p) => p.x); const ys = punkte.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

export default function Bearbeiten() {
  const t = useT();
  const zugang = useZugang();
  const [par, setPar] = useState<{ t: string; r: string; w: string } | null>(null);
  const [meta, setMeta] = useState<Eintrag | null>(null);
  const [fehler, setFehler] = useState('');
  const [bereit, setBereit] = useState(false);
  const [manuell, setManuell] = useState(false);
  const [teams, setTeams] = useState<EditTeam[]>([]);
  const [formen, setFormen] = useState<Form[]>([]);
  const [wahl, setWahl] = useState<string | null>(null);
  const [modus, setModus] = useState<Modus>('rechteck');
  const [zieht, setZieht] = useState<{ a: P; b: P } | null>(null);
  const [eckpunkte, setEckpunkte] = useState<P[]>([]);
  const [zeiger, setZeiger] = useState<P | null>(null);
  const [geaendert, setGeaendert] = useState(false);
  const [status, setStatus] = useState('');
  const [bild, setBild] = useState<string | null>(null);
  const [auswahl, setAuswahl] = useState<Array<{ u: string; titel: string }>>([]);
  const [bilderOffen, setBilderOffen] = useState(false);
  const [suche, setSuche] = useState('');
  const flaeche = useRef<HTMLDivElement | null>(null);

  // Team von Hand eintippen
  const [eintippen, setEintippen] = useState('');
  const [platz, setPlatz] = useState('');
  const [punkte, setPunkte] = useState('');
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
    const q = `t=${encodeURIComponent(par.t)}&w=${encodeURIComponent(par.w)}`;
    void Promise.all([
      fetch(`/api/alte-maps?${q}`, { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/maps-liste').then((r) => r.json()),
      fetch(`/api/maps-bild?w=${encodeURIComponent(par.w)}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch(`/api/maps-karte?t=${encodeURIComponent(par.t)}&r=${encodeURIComponent(par.r)}&w=${encodeURIComponent(par.w)}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    ]).then(([b, l, bi, k]) => {
      if (weg) return;
      if (!b?.ok) { setFehler(b?.error || 'Die Karte ließ sich nicht laden.'); return; }
      setManuell(!!b.manuell);
      setTeams(b.manuell ? (b.rohTeams ?? []) : (b.teams ?? []));
      setFormen(b.formen ?? []);
      setMeta((l?.eintraege ?? []).find((e: Eintrag) => e.windowId === par.w) ?? null);
      if (bi?.ok) { setBild(bi.u ?? null); setAuswahl(bi.auswahl ?? []); }
      if (!bi?.u && k?.ok) setBild(k.fenster?.bild ?? null);
      setBereit(true);
    }).catch(() => { if (!weg) setFehler('Die Karte ließ sich nicht laden.'); });
    return () => { weg = true; };
  }, [par, zugang.admin]);

  useEffect(() => {
    const fertig = (e: BeforeUnloadEvent) => { if (geaendert) { e.preventDefault(); } };
    window.addEventListener('beforeunload', fertig);
    return () => window.removeEventListener('beforeunload', fertig);
  }, [geaendert]);

  /* ------------------------------------------------------------ Zeichnen */

  const punktAus = useCallback((e: { clientX: number; clientY: number }): P | null => {
    const el = flaeche.current; if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: rund(((e.clientX - b.left) / b.width) * 100), y: rund(((e.clientY - b.top) / b.height) * 100) };
  }, []);

  const hinzu = (punkte: P[]) => {
    const id = neueId();
    setFormen((alt) => [...alt, { id, punkte, teamIds: [] }]);
    setWahl(id); setGeaendert(true); setModus('waehlen');
  };

  const polygonFertig = useCallback(() => {
    if (eckpunkte.length >= 3) hinzu(eckpunkte);
    setEckpunkte([]);
  }, [eckpunkte]);

  const loeschen = useCallback(() => {
    if (!wahl) return;
    setFormen((alt) => alt.filter((f) => f.id !== wahl));
    setWahl(null); setGeaendert(true);
  }, [wahl]);

  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Escape') { setEckpunkte([]); setZieht(null); setModus('waehlen'); }
      if (e.key === 'Enter' && modus === 'polygon') polygonFertig();
      if (e.key === 'Backspace' && modus === 'polygon') { e.preventDefault(); setEckpunkte((p) => p.slice(0, -1)); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && modus === 'waehlen' && wahl) { e.preventDefault(); loeschen(); }
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [modus, wahl, polygonFertig, loeschen]);

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
    hinzu([{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }]);
  };

  /* ------------------------------------------------------------ Teams */

  const nummer = useMemo(() => new Map(formen.map((f, i) => [f.id, i + 1])), [formen]);
  const formVon = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of formen) for (const id of f.teamIds) m.set(id, f.id);
    return m;
  }, [formen]);
  const gewaehlt = formen.find((f) => f.id === wahl) ?? null;

  const zuordnen = (teamId: string) => {
    if (!gewaehlt) { setStatus('Erst eine Form anklicken, dann das Team.'); return; }
    setFormen((alt) => alt.map((f) => {
      const ohne = f.teamIds.filter((i) => i !== teamId);
      if (f.id !== gewaehlt.id) return { ...f, teamIds: ohne };
      return { ...f, teamIds: f.teamIds.includes(teamId) ? ohne : [...ohne, teamId] };
    }));
    setGeaendert(true); setStatus('');
  };

  const sichtbareTeams = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return q ? teams.filter((x) => x.spieler.some((s) => s.name.toLowerCase().includes(q))) : teams;
  }, [teams, suche]);

  // Vorschlaege fuer das Eintippen eines Teams
  const angefangen = (eintippen.split(/[&,/]/).pop() ?? '').trim();
  useEffect(() => {
    if (!manuell || angefangen.length < 2) { setVorschlaege([]); return undefined; }
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
  }, [angefangen, manuell]);

  const nehmen = (v: { name: string; land: string; epicId: string }) => {
    gemerkt.current.set(v.name.toLowerCase(), { land: v.land, epicId: v.epicId });
    setEintippen((alt) => {
      const stuecke = alt.split(/([&,/])/);
      for (let i = stuecke.length - 1; i >= 0; i -= 1) if (!/^[&,/]$/.test(stuecke[i])) { stuecke[i] = ` ${v.name}`; break; }
      return stuecke.join('').replace(/^\s+/, '');
    });
    setVorschlaege([]);
  };

  /**
   * Ein Team aufnehmen. Jeder Name wird im Archiv gesucht und - bei genau einem gleichlautenden Treffer - mit Epic-Konto und
   * Land versehen; sonst bleibt es beim blossen Namen (eine Zuordnung wird nicht geraten, die Flagge bleibt dann die Weltkugel).
   */
  const teamHinzu = async () => {
    const namen = eintippen.split(/[&,/]/).map((n) => n.trim()).filter(Boolean).slice(0, 4);
    if (!namen.length) return;
    const zahl = (v: string) => (v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
    const rang = zahl(platz); const pkt = zahl(punkte);
    setEintippen(''); setPlatz(''); setPunkte('');
    const spieler: EditSpieler[] = await Promise.all(namen.map(async (n) => {
      let m = gemerkt.current.get(n.toLowerCase());
      if (!m) {
        try {
          const j = await fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(n)}`).then((r) => r.json());
          const gleich = (j.spieler ?? []).filter((x: { anzeige?: string; name?: string }) => (x.anzeige || x.name || '').toLowerCase() === n.toLowerCase());
          if (gleich.length === 1) m = { land: gleich[0].land ?? '', epicId: gleich[0].epicId ?? '' };
        } catch { /* dann bleibt es beim Namen */ }
      }
      return { name: n, ...(m?.epicId ? { epicId: m.epicId } : {}), ...(m?.land ? { land: m.land } : {}) };
    }));
    setTeams((alt) => [...alt, { id: `hand-${Date.now().toString(36)}-${alt.length}`, spieler, rang, punkte: pkt }]);
    setGeaendert(true);
  };

  const teamWeg = (id: string) => {
    setTeams((alt) => alt.filter((x) => x.id !== id));
    setFormen((alt) => alt.map((f) => ({ ...f, teamIds: f.teamIds.filter((i) => i !== id) })));
    setGeaendert(true);
  };

  /* ------------------------------------------------------------ Speichern */

  const speichern = async () => {
    if (!par) return;
    setStatus('Speichert …');
    try {
      const r = await fetch('/api/alte-maps', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aktion: 'speichern', w: par.w, formen, ...(manuell ? { teams } : {}) }),
      });
      const j = await r.json();
      if (j?.ok) { setGeaendert(false); setStatus('Gespeichert.'); } else setStatus(j?.error || 'Nicht gespeichert.');
    } catch { setStatus('Nicht gespeichert.'); }
  };

  const bildWaehlen = async (u: string) => {
    if (!par) return;
    const r = await fetch('/api/maps-bild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ w: par.w, u }) });
    const j = await r.json().catch(() => ({}));
    if (j?.ok) { setBild(j.u ?? null); setBilderOffen(false); }
  };

  const hochladen = async (datei: File | null, titel: string) => {
    if (!datei) return;
    setStatus('Lädt hoch …');
    const f = new FormData(); f.set('bild', datei); f.set('titel', titel || datei.name.replace(/\.[^.]+$/, ''));
    const r = await fetch('/api/karten-bild', { method: 'POST', body: f });
    const j = await r.json().catch(() => ({}));
    if (!j?.ok) { setStatus(j?.error || 'Hochladen fehlgeschlagen.'); return; }
    const bi = await fetch(`/api/maps-bild?w=${encodeURIComponent(par?.w ?? '')}`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
    if (bi?.ok) setAuswahl(bi.auswahl ?? []);
    setStatus('Hochgeladen - jetzt auswählen.');
  };

  /* ------------------------------------------------------------ Ansicht */

  if (!zugang.admin) {
    return <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-sm text-slate-400"><T>Nur für den Admin.</T></main>;
  }
  const zurueck = par ? `/tournament-maps/karte?t=${encodeURIComponent(par.t)}&r=${encodeURIComponent(par.r)}&w=${encodeURIComponent(par.w)}` : '/tournament-maps';
  const farbeVon = (f: Form) => (f.id === wahl ? 'rgba(251,191,36,.45)' : f.teamIds.length === 0 ? FARBE_LEER : f.teamIds.length >= (teams.some((x) => x.spieler.length > 1) ? 3 : 2) ? 'rgba(239,68,68,.45)' : 'rgba(45,212,191,.42)');

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1600px] px-4 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <Link href={zurueck} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition hover:border-sky-500/60">← <T>Zur Karte</T></Link>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black tracking-tight sm:text-3xl">{meta?.titel ?? t('Landepunkte bearbeiten')}</h1>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{meta?.saisonKurz} · <T>Landepunkte bearbeiten</T></p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {status && <span className="text-xs text-slate-400">{status}</span>}
            <button type="button" onClick={() => void speichern()} disabled={!geaendert}
              className="rounded-lg bg-amber-400 px-5 py-2 text-sm font-black text-zinc-950 transition hover:bg-amber-300 disabled:opacity-40"><T>Speichern</T></button>
          </div>
        </div>

        {fehler && <p className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300"><T>{fehler}</T></p>}
        {!bereit && !fehler && <div className="mt-10"><LadeSchirm /></div>}

        {bereit && (
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
                {wahl && (
                  <button type="button" onClick={loeschen} className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-bold text-rose-300 transition hover:bg-rose-500/10"><T>Form löschen</T></button>
                )}
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
                    <input type="file" accept="image/*" onChange={(e) => void hochladen(e.target.files?.[0] ?? null, '')} className="text-xs" />
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

            {/* ------------------------------------------------------ Teams */}
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
                            className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[11px] font-bold uppercase text-amber-100 transition hover:bg-rose-500/20">
                            {x.spieler.map((s) => s.name).join(' · ')} ×
                          </button>
                        </li>
                      ) : null;
                    })}
                  </ul>
                )}
              </div>

              {manuell && (
                <div className="mt-3 rounded-xl border border-white/[0.08] bg-zinc-900/40 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"><T>Team von Hand anlegen</T></p>
                  <div className="relative mt-2">
                    <input value={eintippen} onChange={(e) => setEintippen(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void teamHinzu(); }}
                      placeholder={t('Namen, mit & getrennt, z. B. Sky & Scroll')}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
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
                  <div className="mt-2 flex items-center gap-2">
                    <input value={platz} onChange={(e) => setPlatz(e.target.value)} inputMode="numeric" placeholder={t('Platz')}
                      className="w-20 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
                    <input value={punkte} onChange={(e) => setPunkte(e.target.value)} inputMode="numeric" placeholder={t('Punkte')}
                      className="w-24 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
                    <button type="button" onClick={() => void teamHinzu()} disabled={!eintippen.trim()} className="ml-auto rounded-lg bg-zinc-800 px-4 py-1.5 text-sm font-semibold text-slate-100 transition hover:bg-zinc-700 disabled:opacity-40"><T>hinzufügen</T></button>
                  </div>
                </div>
              )}

              <div className="mt-3 rounded-xl border border-white/[0.08] bg-zinc-900/40 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Teams <span className="text-slate-600">{teams.length}</span></p>
                  <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Spieler suchen …')}
                    className="w-40 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
                </div>
                {teams.length === 0 && <p className="py-4 text-center text-xs text-slate-500">{manuell ? <T>Noch keine Teams - oben eintippen.</T> : <T>Zu diesem Event liegen keine Teams vor.</T>}</p>}
                <ul className="max-h-[560px] space-y-1.5 overflow-y-auto pr-1">
                  {sichtbareTeams.map((x) => {
                    const drauf = formVon.get(x.id);
                    return (
                      <li key={x.id} className="flex items-center gap-1.5">
                        <button type="button" onClick={() => zuordnen(x.id)}
                          className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${drauf === wahl && wahl ? 'border-amber-400/60 bg-amber-400/10' : drauf ? 'border-white/[0.06] bg-zinc-900/40 opacity-60 hover:opacity-100' : 'border-white/[0.08] bg-zinc-900/70 hover:border-sky-500/50'}`}>
                          <TeamFlagge groesse={x.spieler.length > 1 ? 28 : 22} laender={x.spieler.map((s) => s.land ?? undefined)} />
                          <span className="flex min-w-0 flex-col text-[11px] font-bold uppercase leading-[1.25] text-slate-100">
                            {x.spieler.map((s, i) => <span key={i} className="truncate">{s.name}</span>)}
                          </span>
                          {x.rang != null && <span className="ml-auto shrink-0 text-[10px] font-bold tabular-nums text-slate-500">#{x.rang}</span>}
                          {drauf && <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">{nummer.get(drauf)}</span>}
                        </button>
                        {manuell && <button type="button" onClick={() => teamWeg(x.id)} title={t('Team löschen')} className="shrink-0 rounded-md px-1.5 py-1 text-slate-600 transition hover:bg-rose-500/15 hover:text-rose-300">×</button>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
