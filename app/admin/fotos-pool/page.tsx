'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import SeitenKopf from '@/app/components/SeitenKopf';
import { useZugang } from '@/app/lib/zugang';

/*
 * Der Foto-Pool (Betreiber, 17.11.2026): zugeschnittene Spielerfotos ohne Namen (scripts/fotos-pool-import.mjs), die der Betreiber hier Spielern
 * zuordnet. Name eintippen, Spieler aus der Suche waehlen (dieselbe Suche wie oben auf der Seite: unsere Profile und alle Epic-Namen aus den
 * Bestenlisten) - das Foto ersetzt beim Spieler den Platzhalter. Den Credit zeigt die Seite nur, wenn er bestaetigt ist (lib/fotoCredits.ts).
 *
 * Mehrere Fotos je Spieler: oeffentlich ist das "aktive" (das erste zugeordnete, bis ein anderes gewaehlt wird). Name aendern = umhaengen,
 * Name leeren = loesen. Erreichbar aus der Statistik (Spieler -> "Fotos", nur fuer den Admin); alles prueft /api/admin/foto-pool serverseitig.
 */

interface Credit { quelle?: string; fotograf?: string; handle?: string; link?: string; lizenz?: string; bestaetigt?: boolean }
interface Foto { id: string; erstellt: number; epicId: string; name: string; aktiv: boolean; oeffentlich: boolean; credit: Credit | null; original: string; bild: string }
interface Treffer { epicId: string; name: string; anzeige?: string; region?: string; events?: number; ausIndex?: boolean }
type Filter = 'frei' | 'zugeordnet' | 'alle';
type CreditEntwurf = { quelle: string; fotograf: string; handle: string; link: string; lizenz: string; bestaetigt: boolean };

const JE_SEITE = 48;

/*
 * Jede Antwort sicher lesen (17.11.2026: "Fehler: Unexpected token '<', "<!DOCTYPE "... is not valid JSON" - statt JSON kam die HTML-Seite von
 * Cloudflare, weil der Server zu lange brauchte). Kommt kein JSON, entsteht eine verstaendliche Meldung mit dem HTTP-Status.
 */
type Antwort = { ok: boolean; error?: string; status: number; vorlaeufig?: boolean; [k: string]: unknown };
function statusText(status: number): string {
  if (status === 401 || status === 403) return `Nicht angemeldet oder keine Admin-Rechte (HTTP ${status}) – bitte neu anmelden.`;
  if (status === 524 || status === 504 || status === 522) return `Zeitüberschreitung – der Server hat nicht rechtzeitig geantwortet (HTTP ${status}).`;
  if (status === 502 || status === 503 || status === 520 || status === 521 || status === 523) return `Server gerade nicht erreichbar oder überlastet (HTTP ${status}).`;
  if (status >= 500) return `Serverfehler (HTTP ${status}).`;
  if (status === 404) return 'Schnittstelle nicht gefunden (HTTP 404).';
  return `Unerwartete Antwort vom Server (HTTP ${status}).`;
}
async function holeJson(url: string, init?: RequestInit): Promise<Antwort> {
  let r: Response;
  try { r = await fetch(url, { cache: 'no-store', ...init }); } catch {
    return { ok: false, status: 0, vorlaeufig: true, error: 'Keine Verbindung zum Server.' };
  }
  const text = await r.text().catch(() => '');
  let j: Record<string, unknown> | null = null;
  try { j = text ? JSON.parse(text) as Record<string, unknown> : null; } catch { j = null; }
  // Voruebergehend: Zeitueberschreitung, Server weg, Verbindung - dann lohnt ein neuer Versuch.
  const vorlaeufig = r.status === 0 || r.status === 408 || r.status === 429 || r.status >= 500;
  if (!j || typeof j !== 'object') return { ok: false, status: r.status, vorlaeufig, error: statusText(r.status) };
  if (!r.ok || j.ok === false) return { ...j, ok: false, status: r.status, vorlaeufig, error: String(j.error || statusText(r.status)) };
  return { ...j, ok: true, status: r.status };
}
const neueCid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
interface Unterwegs { cid: string; id: string; body: Record<string, unknown>; fertig: string; gesendet: boolean; versuche: number }
const feld = 'w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-sky-500';
const ausCredit = (c: Credit | null): CreditEntwurf => ({
  quelle: c?.quelle ?? '', fotograf: c?.fotograf ?? '', handle: c?.handle ?? '', link: c?.link ?? '', lizenz: c?.lizenz ?? '', bestaetigt: Boolean(c?.bestaetigt),
});

/** Spielersuche wie app/components/KopfSuche: erst unsere Profile, dann der Index aller Turnierspieler (Epic-Namen). */
async function sucheSpieler(q: string, signal: AbortSignal): Promise<Treffer[]> {
  const index = q.length >= 3
    ? fetch(`/api/spieler-verlauf?q=${encodeURIComponent(q)}`, { signal }).then((x) => x.json()).catch(() => null)
    : Promise.resolve(null);
  const r = await fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`, { signal }).then((x) => x.json()).catch(() => null);
  const profile = (Array.isArray(r?.spieler) ? r.spieler : []) as Treffer[];
  const da = new Set(profile.map((x) => x.epicId));
  const aus = (((await index)?.treffer ?? []) as Treffer[]).filter((x) => !da.has(x.epicId)).map((x) => ({ ...x, ausIndex: true }));
  return [...profile.slice(0, aus.length ? 6 : 10), ...aus].filter((x) => /^[0-9a-f]{32}$/.test(x.epicId)).slice(0, 10);
}

function NamensFeld({ foto, anzeige, onWahl }: { foto: Foto; anzeige: string; onWahl: (t: Treffer | null) => void }) {
  const [text, setText] = useState(anzeige);
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [offen, setOffen] = useState(false);
  const [aktiv, setAktiv] = useState(0);
  const [laedt, setLaedt] = useState(false);
  const rahmen = useRef<HTMLDivElement>(null);
  const [zuletzt, setZuletzt] = useState(anzeige);
  if (anzeige !== zuletzt) { setZuletzt(anzeige); setText(anzeige); }

  useEffect(() => {
    const q = text.trim();
    if (!offen || q.length < 2 || q === anzeige) return;
    const abbruch = new AbortController();
    const z = setTimeout(async () => {
      setLaedt(true);
      try { setTreffer(await sucheSpieler(q, abbruch.signal)); setAktiv(0); } catch { /* abgebrochen */ }
      setLaedt(false);
    }, 250);
    return () => { clearTimeout(z); abbruch.abort(); };
  }, [text, offen, anzeige]);

  useEffect(() => {
    const aus = (e: PointerEvent) => { if (!rahmen.current?.contains(e.target as Node)) setOffen(false); };
    document.addEventListener('pointerdown', aus);
    return () => document.removeEventListener('pointerdown', aus);
  }, []);

  const waehle = (t: Treffer) => { setOffen(false); setTreffer([]); setText(t.anzeige || t.name); onWahl(t); };
  const zeige = offen && text.trim().length >= 2 && text.trim() !== anzeige;

  return (
    <div ref={rahmen} className="relative">
      <input value={text} placeholder={foto.epicId ? 'Name …' : 'Name eintippen …'} aria-label="Spieler" autoComplete="off" spellCheck={false}
        className={`${feld} ${foto.epicId ? 'font-semibold' : ''}`}
        onFocus={() => setOffen(true)}
        onChange={(e) => { setText(e.target.value); setOffen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && treffer.length) { e.preventDefault(); setAktiv((a) => (a + 1) % treffer.length); }
          else if (e.key === 'ArrowUp' && treffer.length) { e.preventDefault(); setAktiv((a) => (a <= 0 ? treffer.length - 1 : a - 1)); }
          else if (e.key === 'Enter') {
            e.preventDefault();
            if (!text.trim() && foto.epicId) { setOffen(false); onWahl(null); }
            else if (zeige && treffer[aktiv]) waehle(treffer[aktiv]);
          } else if (e.key === 'Escape') { setOffen(false); setText(anzeige); }
        }}
        onBlur={() => { if (!text.trim() && foto.epicId) onWahl(null); }} />
      {zeige && (
        <ul className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-auto rounded-lg border border-zinc-700 bg-zinc-950 py-1 shadow-2xl" role="listbox">
          {laedt && !treffer.length && <li className="px-2 py-1 text-[11px] text-slate-500"><T>Sucht …</T></li>}
          {!laedt && !treffer.length && <li className="px-2 py-1 text-[11px] text-slate-500"><T>Kein Spieler gefunden</T></li>}
          {treffer.map((t, i) => (
            <li key={t.epicId} role="option" aria-selected={i === aktiv}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => waehle(t)}
                className={`flex w-full items-baseline justify-between gap-2 px-2 py-1 text-left text-xs ${i === aktiv ? 'bg-sky-500/15 text-slate-100' : 'text-slate-300 hover:bg-zinc-800'}`}>
                <span className="truncate">{t.anzeige || t.name}</span>
                <span className="shrink-0 text-[10px] text-slate-500">{t.ausIndex ? `${t.region ?? ''} · ${t.events ?? 0} Events` : 'Profil'} · {t.epicId.slice(0, 6)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function FotosPoolSeite() {
  const zugang = useZugang();
  const [fotos, setFotos] = useState<Foto[] | null>(null);
  const [namen, setNamen] = useState<Record<string, string>>({});
  const [fehler, setFehler] = useState('');
  const [filter, setFilter] = useState<Filter>('frei');
  const [suche, setSuche] = useState('');
  const [seite, setSeite] = useState(0);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [creditOffen, setCreditOffen] = useState<string | null>(null);
  const [entwurf, setEntwurf] = useState<CreditEntwurf>(ausCredit(null));
  const [hochladen, setHochladen] = useState('');

  const unterwegs = useRef(new Map<string, Unterwegs>());
  const [offenZahl, setOffenZahl] = useState(0);
  const [reiheFehler, setReiheFehler] = useState('');
  const laden = useCallback(async () => {
    const j = await holeJson('/api/admin/foto-pool');
    if (!j.ok) { setFehler(`Laden gescheitert: ${j.error}`); return; }
    setFotos(j.fotos as Foto[]); setNamen((j.namen as Record<string, string>) ?? {}); setFehler('');
  }, []);
  useEffect(() => {
    if (!zugang.admin) return;
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [zugang.admin, laden]);

  const jeSpieler = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of fotos ?? []) if (f.epicId) m.set(f.epicId, (m.get(f.epicId) ?? 0) + 1);
    return m;
  }, [fotos]);
  const zahlen = useMemo(() => ({
    frei: (fotos ?? []).filter((f) => !f.epicId).length, zugeordnet: (fotos ?? []).filter((f) => f.epicId).length, alle: fotos?.length ?? 0,
  }), [fotos]);
  const anzeigeName = (f: Foto) => (f.epicId ? namen[f.epicId] || f.name || f.epicId.slice(0, 8) : '');
  const liste = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (fotos ?? [])
      .filter((f) => filter === 'alle' || (filter === 'frei' ? !f.epicId : Boolean(f.epicId)))
      .filter((f) => !q || [f.name, namen[f.epicId] ?? '', f.epicId, f.original, f.credit?.fotograf ?? '', f.credit?.handle ?? ''].some((s) => s.toLowerCase().includes(q)));
  }, [fotos, filter, suche, namen]);
  const seiten = Math.max(1, Math.ceil(liste.length / JE_SEITE));
  const aufSeite = liste.slice(seite * JE_SEITE, (seite + 1) * JE_SEITE);
  const zeige = (id: string, t: string) => setStatus((s) => ({ ...s, [id]: t }));

  /*
   * Aendern: sofort auf der Seite, dann an den Server (der antwortet gleich und schreibt gesammelt). "wird gespeichert …" bis die Schreibreihe
   * den Commit gemeldet hat (/api/admin/foto-pool/status), dann "gespeichert". Kommt keine Antwort (Zeitueberschreitung, Neustart), geht dieselbe
   * Aenderung (gleiche cid, der Server wendet sie nur einmal an) von selbst noch einmal hinaus.
   */
  const lokal = (id: string, body: Record<string, unknown>) => setFotos((alt) => {
    if (!alt) return alt;
    const f = alt.find((x) => x.id === id);
    if (!f) return alt;
    if (body.aktion === 'loeschen') return alt.filter((x) => x.id !== id);
    if (body.aktion === 'aktiv') return alt.map((x) => (x.epicId === f.epicId ? { ...x, aktiv: x.id === id } : x));
    if (body.aktion === 'credit') return alt.map((x) => (x.id === id ? { ...x, credit: { ...(body.felder as Credit) } } : x));
    if (body.aktion === 'zuordnen') {
      const epicId = String(body.epicId ?? '');
      const naechste = alt.map((x) => (x.id === id ? { ...x, epicId, name: String(body.name ?? ''), aktiv: Boolean(epicId) && !alt.some((y) => y.id !== id && y.epicId === epicId && y.aktiv), oeffentlich: false } : x));
      // Der vorige Spieler: hat er kein aktives Foto mehr, rueckt sein naechstes nach.
      if (f.epicId && f.aktiv) { const n = naechste.find((x) => x.epicId === f.epicId); if (n) n.aktiv = true; }
      return naechste;
    }
    return alt;
  });

  const senden = useCallback(async (u: Unterwegs) => {
    for (;;) {
      u.versuche += 1;
      const r = await holeJson('/api/admin/foto-pool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cid: u.cid, id: u.id, ...u.body }) });
      if (r.ok) { u.gesendet = true; return; }
      if (r.vorlaeufig && u.versuche < 8) {
        zeige(u.id, `wird gespeichert … (${r.error} Neuer Versuch läuft.)`);
        await new Promise((f) => setTimeout(f, Math.min(30_000, 2000 * 2 ** (u.versuche - 1))));
        if (!unterwegs.current.has(u.cid)) return;
        continue;
      }
      unterwegs.current.delete(u.cid); setOffenZahl(unterwegs.current.size);
      zeige(u.id, `Fehler: ${r.error}${r.vorlaeufig ? ' Bitte später noch einmal versuchen.' : ''}`);
      void laden();
      return;
    }
  }, [laden]);

  const schicke = (id: string, body: Record<string, unknown>, fertig: string) => {
    const u: Unterwegs = { cid: neueCid(), id, body, fertig, gesendet: false, versuche: 0 };
    unterwegs.current.set(u.cid, u); setOffenZahl(unterwegs.current.size);
    lokal(id, body);
    zeige(id, 'wird gespeichert …');
    void senden(u);
  };

  // Solange etwas unterwegs ist: alle 1,5 s nach dem Stand fragen.
  useEffect(() => {
    if (!offenZahl) return;
    let aus = false;
    const runde = async () => {
      const liste = [...unterwegs.current.values()].filter((u) => u.gesendet);
      if (!liste.length) return;
      const r = await holeJson(`/api/admin/foto-pool/status?cids=${liste.map((u) => u.cid).join(',')}`);
      if (aus) return;
      if (!r.ok) { setReiheFehler(`Stand nicht abrufbar: ${r.error}`); return; }
      const reihe = r.reihe as { letzterFehler?: { text: string } | null } | undefined;
      setReiheFehler(reihe?.letzterFehler ? `Speichern hakt: ${reihe.letzterFehler.text} – neuer Versuch läuft automatisch.` : '');
      const stand = (r.stand ?? {}) as Record<string, { art: string; fehler?: string; endgueltig?: boolean }>;
      let fertig = false;
      for (const u of liste) {
        const s = stand[u.cid];
        if (!s) { u.gesendet = false; u.versuche = 0; void senden(u); continue; } // Server kennt sie nicht (Neustart): noch einmal
        if (s.art === 'gespeichert') { unterwegs.current.delete(u.cid); zeige(u.id, u.fertig); fertig = true; }
        else if (s.art === 'fehler') { unterwegs.current.delete(u.cid); zeige(u.id, `Fehler: ${s.fehler ?? 'nicht gespeichert'}`); fertig = true; }
        else zeige(u.id, s.fehler ? `wird gespeichert … (${s.fehler})` : 'wird gespeichert …');
      }
      setOffenZahl(unterwegs.current.size);
      if (fertig && !unterwegs.current.size) void laden();
    };
    const t = setInterval(() => { void runde(); }, 1500);
    return () => { aus = true; clearInterval(t); };
  }, [offenZahl, laden, senden]);

  // Nicht wegklicken, solange etwas nicht gespeichert ist.
  useEffect(() => {
    if (!offenZahl) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [offenZahl]);

  const zuordnen = (f: Foto, t: Treffer | null) => {
    if (!t) { if (f.epicId) schicke(f.id, { aktion: 'zuordnen', epicId: '', name: '' }, 'gelöst · gespeichert'); return; }
    if (t.epicId === f.epicId) return;
    const name = t.anzeige || t.name;
    setNamen((n) => ({ ...n, [t.epicId]: name }));
    schicke(f.id, { aktion: 'zuordnen', epicId: t.epicId, name }, `${name} · gespeichert`);
  };

  const creditSpeichern = (f: Foto) => {
    schicke(f.id, { aktion: 'credit', felder: entwurf }, 'Credit gespeichert');
    setCreditOffen(null);
  };

  const dateienHochladen = async (liste: FileList) => {
    let gut = 0; const nicht: string[] = [];
    for (const d of Array.from(liste)) {
      setHochladen(`lädt ${d.name} …`);
      const form = new FormData(); form.set('datei', d);
      const r = await holeJson('/api/admin/foto-pool', { method: 'POST', body: form });
      if (r.ok) gut += 1; else nicht.push(`${d.name}: ${r.error}`);
    }
    setHochladen(`${gut} aufgenommen${nicht.length ? ` · ${nicht.join(' · ')}` : ''}`);
    await laden();
  };

  if (!zugang.laedt && !zugang.admin) {
    return <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-center text-slate-400"><p className="text-sm"><T>Nur für Admins.</T></p></main>;
  }

  const chip = (an: boolean) => `rounded-full px-3 py-1 text-xs font-bold transition ${an ? 'bg-sky-500 text-white' : 'border border-zinc-800 bg-zinc-900 text-slate-400 hover:text-slate-100'}`;
  const FILTER: Array<[Filter, string]> = [['frei', 'Ohne Namen'], ['zugeordnet', 'Zugeordnet'], ['alle', 'Alle']];

  return (
    <main className="flex-1 bg-zinc-950 px-4 py-6 text-slate-200" data-ohne-foto-credit>
      <div className="mx-auto max-w-[1400px]">
        <SeitenKopf className="mb-5" marke={<T>Spieler & Teams</T>} titel={<T>Foto-Pool</T>}
          text={<T>Zugeschnittene Fotos ohne Namen. Namen eintippen und den Spieler wählen – das Foto ersetzt bei ihm den Platzhalter. Hat ein Spieler mehrere Fotos, ist das aktive öffentlich. Der Credit steht nur, wenn er bestätigt ist.</T>} />

        <p className="mb-3 text-xs" data-pool-speicherstand>
          {offenZahl
            ? <span className="text-amber-300">{offenZahl} {offenZahl === 1 ? 'Änderung wird' : 'Änderungen werden'} gespeichert …</span>
            : <span className="text-emerald-400">Alles gespeichert</span>}
        </p>
        {reiheFehler && <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{reiheFehler}</p>}
        {fehler && <p className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{fehler}</p>}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {FILTER.map(([f, titel]) => (
            <button key={f} type="button" className={chip(filter === f)} onClick={() => { setFilter(f); setSeite(0); }}><T>{titel}</T> <span className="opacity-70">{zahlen[f]}</span></button>
          ))}
          <label className="cursor-pointer rounded-full border border-sky-500/50 px-3 py-1 text-xs font-semibold text-sky-300 hover:bg-sky-500/10">
            <T>Zugeschnittene Fotos hinzufügen …</T>
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const l = e.target.files; if (l?.length) dateienHochladen(l); e.target.value = ''; }} />
          </label>
          <Link href="/admin/fotos-credits" className="text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"><T>Fotos & Fotografen</T></Link>
          <input value={suche} onChange={(e) => { setSuche(e.target.value); setSeite(0); }} placeholder="Spieler, Datei, Fotograf …"
            className="ml-auto w-56 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-sky-500" />
        </div>
        {hochladen && <p className="mb-3 text-xs text-slate-400">{hochladen}</p>}

        {!fotos && !fehler && <p className="text-sm text-slate-500"><T>Lädt …</T></p>}
        {fotos && !liste.length && <p className="text-sm text-slate-500"><T>Keine Fotos in dieser Ansicht.</T></p>}

        {seiten > 1 && (
          <div className="mb-3 flex items-center justify-end gap-2 text-xs text-slate-400">
            <button type="button" className="rounded-md border border-zinc-800 px-2 py-1 disabled:opacity-40" disabled={seite === 0} onClick={() => setSeite(seite - 1)}>←</button>
            <span className="tabular-nums">{seite + 1} / {seiten}</span>
            <button type="button" className="rounded-md border border-zinc-800 px-2 py-1 disabled:opacity-40" disabled={seite + 1 >= seiten} onClick={() => setSeite(seite + 1)}>→</button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" data-pool-raster>
          {aufSeite.map((f) => {
            const anzahl = f.epicId ? jeSpieler.get(f.epicId) ?? 0 : 0;
            const c = f.credit;
            const st = status[f.id];
            return (
              <div key={f.id} data-pool-foto={f.id} className={`flex flex-col gap-1.5 rounded-xl border bg-zinc-900 p-2 ${f.aktiv ? 'border-emerald-500/50' : 'border-zinc-800'}`}>
                <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-zinc-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.bild} alt="" loading="lazy" className="h-full w-full object-cover" />
                  {f.epicId && (
                    <span className={`absolute left-1 top-1 rounded-full px-1.5 text-[10px] font-bold ${f.aktiv ? 'bg-emerald-500 text-white' : 'bg-zinc-950/80 text-slate-300'}`}>
                      {f.aktiv ? 'aktiv' : 'weiteres'}
                    </span>
                  )}
                </div>
                <NamensFeld foto={f} anzeige={anzeigeName(f)} onWahl={(t) => zuordnen(f, t)} />
                {f.epicId && (
                  <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
                    <Link href={`/statistics?spieler=${f.epicId}`} target="_blank" className="hover:text-slate-300" title={f.epicId}>{f.epicId.slice(0, 8)}</Link>
                    {anzahl > 1 && <span>· {anzahl} <T>Fotos</T></span>}
                    {!f.aktiv && <button type="button" className="rounded border border-emerald-500/40 px-1 text-emerald-300 hover:bg-emerald-500/10" onClick={() => schicke(f.id, { aktion: 'aktiv' }, 'aktiv · gespeichert')}><T>aktiv setzen</T></button>}
                    <button type="button" className="rounded border border-zinc-700 px-1 hover:text-slate-200" onClick={() => zuordnen(f, null)}><T>lösen</T></button>
                  </div>
                )}
                <div className="flex items-center justify-between gap-1 text-[10px]">
                  <button type="button" className="truncate text-left text-slate-500 hover:text-slate-300" title={f.original}
                    onClick={() => { if (creditOffen === f.id) setCreditOffen(null); else { setCreditOffen(f.id); setEntwurf(ausCredit(c)); } }}>
                    {c?.handle || c?.fotograf || c?.quelle ? `📷 ${c.handle ? `@${c.handle}` : c.fotograf || c.quelle}${c.bestaetigt ? ' ✓' : ''}` : 'Credit …'}
                  </button>
                  <button type="button" className="shrink-0 rounded px-1 text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-300"
                    onClick={() => { if (window.confirm('Dieses Foto aus dem Pool löschen?')) schicke(f.id, { aktion: 'loeschen' }, 'gelöscht'); }}><T>Löschen</T></button>
                </div>
                {creditOffen === f.id && (
                  <div className="space-y-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1.5">
                    <input className={feld} placeholder="Quelle" value={entwurf.quelle} onChange={(e) => setEntwurf({ ...entwurf, quelle: e.target.value })} />
                    <input className={feld} placeholder="Fotograf" value={entwurf.fotograf} onChange={(e) => setEntwurf({ ...entwurf, fotograf: e.target.value })} />
                    <input className={feld} placeholder="X-Konto (@…)" value={entwurf.handle} onChange={(e) => setEntwurf({ ...entwurf, handle: e.target.value })} />
                    <input className={feld} placeholder="Link" value={entwurf.link} onChange={(e) => setEntwurf({ ...entwurf, link: e.target.value })} />
                    <input className={feld} placeholder="Lizenz (intern)" value={entwurf.lizenz} onChange={(e) => setEntwurf({ ...entwurf, lizenz: e.target.value })} />
                    <div className="flex items-center justify-between text-[11px]">
                      <label className="flex items-center gap-1 text-slate-300">
                        <input type="checkbox" className="accent-emerald-500" checked={entwurf.bestaetigt}
                          disabled={!entwurf.quelle.trim() && !entwurf.fotograf.trim() && !entwurf.handle.trim()}
                          onChange={(e) => setEntwurf({ ...entwurf, bestaetigt: e.target.checked })} />
                        <T>bestätigt</T>
                      </label>
                      <button type="button" className="rounded bg-sky-500 px-2 py-0.5 font-bold text-white" onClick={() => creditSpeichern(f)}><T>Speichern</T></button>
                    </div>
                  </div>
                )}
                {st && <p data-pool-stand className={`text-[10px] ${st.startsWith('Fehler') ? 'text-rose-300' : st.startsWith('wird') ? 'text-amber-300' : 'text-emerald-400'}`}>{st}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
