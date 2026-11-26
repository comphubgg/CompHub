import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Glas, flagge } from '../../teile/Glas';
import { NurAdmins, WerkzeugKopf, feld, knopfHaupt, knopfLeise } from './teile';
import { useWer } from '../../teile/Anmeldung';

/*
 * Player Center (app/admin/players auf main): das ganze Spielerarchiv nach Region, Flagge / Anzeigename / @-Konto je Epic-Konto-ID pflegen, Foto hochladen.
 *   GET  /api/spieler-center?region=&mindestens=   - die vorgerechnete Liste (stuendlich)
 *   GET  /api/spieler-profile                       - die frischen Eintraege darueber
 *   POST /api/spieler-profile { id, name, land, x, anzeige }
 *   POST /api/spielerbild/hochladen (FormData datei, epicId, name) - legt das Foto dauerhaft im GitHub-Archiv ab
 * Wie auf der Seite liegt jede Aenderung zuerst im Browser (localStorage, derselbe Schluessel) und wird alle 20 s erneut geschickt, bis der Server sie annimmt.
 */
interface Spieler {
  epicId: string; name: string; turniername: string; namen: string[]; region: string; land: string; landQuelle: string; x: string;
  gepflegt: boolean; foto: string | null; matches: number; events: number; elims: number;
}
type Filterart = 'ohneFlagge' | 'ohneKonto' | 'mitFoto' | 'ohneFoto' | 'selbst';
const FILTER: Array<{ wert: Filterart; titel: string; gegenteil?: Filterart }> = [
  { wert: 'ohneFlagge', titel: 'no flag' }, { wert: 'ohneKonto', titel: 'no @ account' },
  { wert: 'mitFoto', titel: 'with photo', gegenteil: 'ohneFoto' }, { wert: 'ohneFoto', titel: 'no photo', gegenteil: 'mitFoto' },
  { wert: 'selbst', titel: 'edited by hand' },
];
const REGIONEN = ['alle', 'EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];
const SCHRITT = 150;
const zahl = (n: number) => n.toLocaleString('en-US');
interface Aenderung { id: string; name: string; land: string; x: string; anzeige: string }
const AUSSTEHEND = 'comphub.player-center.ausstehend';
const liesAusstehend = (): Record<string, Aenderung> => { try { const r = window.localStorage.getItem(AUSSTEHEND); return r ? JSON.parse(r) : {}; } catch { return {}; } };
const merkeAusstehend = (a: Record<string, Aenderung>) => { try { window.localStorage.setItem(AUSSTEHEND, JSON.stringify(a)); } catch { /* nur im Speicher */ } };
const mitAenderung = (s: Spieler, a: Aenderung): Spieler => ({ ...s, name: a.anzeige || s.turniername, land: a.land || '', landQuelle: a.land ? 'gepflegt' : '', x: a.x, gepflegt: Boolean(a.land || a.x || a.anzeige) });
const FLAGGEN = 'ae al ar at au ba be bg bh br by ca ch cn co cz de dk ee eg es fi fr gb gr hr hu ie il in ir is it jp kr kw lb lt lv mc md mk mx ng nl no nz om pe pl pt ro rs ru sa se si sk sy tr ua us ve ye'.split(' ');
const landName = (c: string) => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(c.toUpperCase()) ?? c; } catch { return c; } };
/** Vergleichsschluessel fuer die Suche - vereinfacht wie lib/homoglyph (Akzente weg, nur Buchstaben und Ziffern). */
const schluessel = (n: string) => n.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
const Flagge = ({ land }: { land: string }) => (land && /^[A-Za-z]{2}$/.test(land)
  ? <img src={flagge(land)} alt={land.toUpperCase()} title={land.toUpperCase()} width={22} height={15} className="inline-block rounded-[2px]" />
  : <span className="inline-block w-[22px] text-center text-white/25">–</span>);

export default function Spieler({ klassisch }: { klassisch: () => void }) {
  const { wer } = useWer();
  const [region, setRegion] = useState('EU');
  const [alle, setAlle] = useState<Spieler[]>([]);
  const [jeRegion, setJeRegion] = useState<Record<string, number>>({});
  const [laedt, setLaedt] = useState(false);
  const [suche, setSuche] = useState('');
  const [filter, setFilter] = useState<Set<Filterart>>(new Set());
  const [menge, setMenge] = useState(SCHRITT);
  const [mindestens, setMindestens] = useState(1);
  const [offen, setOffen] = useState<string | null>(null);
  const [eLand, setELand] = useState(''); const [eX, setEX] = useState(''); const [eName, setEName] = useState(''); const [landSuche, setLandSuche] = useState('');
  const [ausstehend, setAusstehend] = useState<Record<string, Aenderung>>({});
  const [sendeFehler, setSendeFehler] = useState('');
  const [fotoStand, setFotoStand] = useState<{ id: string; text: string } | null>(null);
  const ausstehendRef = useRef<Record<string, Aenderung>>({});
  useEffect(() => { const da = liesAusstehend(); ausstehendRef.current = da; if (Object.keys(da).length) setAusstehend(da); }, []);

  useEffect(() => {
    let weg = false;
    void (async () => {
      setLaedt(true);
      try {
        const j = await (await fetch(`/api/spieler-center?region=${encodeURIComponent(region === 'alle' ? '' : region)}&mindestens=${mindestens}`, { cache: 'no-store' })).json();
        if (weg) return;
        let liste: Spieler[] = j?.spieler ?? [];
        try {
          const pr = await (await fetch('/api/spieler-profile', { cache: 'no-store' })).json() as { profile?: Record<string, { id?: string; land?: string; x?: string; anzeige?: string }> };
          const nachId = new Map(Object.values(pr.profile ?? {}).filter((e) => e.id).map((e) => [e.id!, e]));
          liste = liste.map((sp) => { const e = nachId.get(sp.epicId); return e ? mitAenderung(sp, { id: sp.epicId, name: sp.turniername, land: e.land ?? '', x: e.x ?? '', anzeige: e.anzeige ?? '' }) : sp; });
        } catch { /* dann der vorgerechnete Stand */ }
        if (weg) return;
        const warten = ausstehendRef.current;
        setAlle(liste.map((sp) => (warten[sp.epicId] ? mitAenderung(sp, warten[sp.epicId]) : sp)));
        setJeRegion(j?.jeRegion ?? {});
      } catch { if (!weg) setAlle([]); } finally { if (!weg) setLaedt(false); }
    })();
    return () => { weg = true; };
  }, [region, mindestens]);

  const waehle = <T,>(setzen: (w: T) => void) => (w: T) => { setzen(w); setMenge(SCHRITT); };
  const q = schluessel(suche);
  const gezeigt = alle.filter((s) => {
    if (filter.has('ohneFlagge') && s.land) return false;
    if (filter.has('ohneKonto') && s.x) return false;
    if (filter.has('mitFoto') && !s.foto) return false;
    if (filter.has('ohneFoto') && s.foto) return false;
    if (filter.has('selbst') && !s.gepflegt) return false;
    if (!suche.trim()) return true;
    if (s.epicId.startsWith(suche.trim().toLowerCase())) return true;
    if (q.length < 2) return false;
    return [s.name, s.turniername, s.x, ...s.namen].filter(Boolean).some((n) => schluessel(n).includes(q));
  });
  const oeffnen = (s: Spieler) => { setOffen(s.epicId); setLandSuche(''); setELand(s.land); setEX(s.x); setEName(s.name === s.turniername ? '' : s.name); };

  const sendet = useRef(false);
  const senden = useCallback(async () => {
    if (sendet.current) return; sendet.current = true;
    try {
      for (const a of Object.values(ausstehendRef.current)) {
        let grund = '';
        try {
          const r = await fetch('/api/spieler-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) });
          if (!r.ok) grund = r.status === 402 ? 'The site is blocked at Vercel (402).' : `HTTP ${r.status}`;
        } catch { grund = 'No connection to the server.'; }
        if (grund) { setSendeFehler(grund); break; }
        if (ausstehendRef.current[a.id] === a) { const rest = { ...ausstehendRef.current }; delete rest[a.id]; ausstehendRef.current = rest; merkeAusstehend(rest); setAusstehend(rest); }
      }
      if (!Object.keys(ausstehendRef.current).length) setSendeFehler('');
    } finally { sendet.current = false; }
  }, []);
  const wartend = Object.keys(ausstehend).length;
  useEffect(() => { if (!wartend) return undefined; void senden(); const u = setInterval(() => void senden(), 20_000); return () => clearInterval(u); }, [wartend, senden]);

  const fotoHochladen = async (s: Spieler, datei: File) => {
    setFotoStand({ id: s.epicId, text: 'uploading …' });
    try {
      const f = new FormData(); f.set('datei', datei); f.set('epicId', s.epicId); f.set('name', s.name);
      const r = await fetch('/api/spielerbild/hochladen', { method: 'POST', body: f });
      const j = await r.json().catch(() => ({})) as { bild?: string; fehler?: string };
      if (!r.ok || !j.bild) { setFotoStand({ id: s.epicId, text: String(j.fehler ?? 'That did not work.') }); return; }
      setAlle((v) => v.map((x) => (x.epicId === s.epicId ? { ...x, foto: j.bild as string } : x)));
      setFotoStand({ id: s.epicId, text: 'Photo saved — it is stored permanently in the GitHub archive.' });
    } catch { setFotoStand({ id: s.epicId, text: 'No connection to the server.' }); }
  };
  const speichern = (s: Spieler) => {
    const a: Aenderung = { id: s.epicId, name: s.turniername, land: eLand.trim().toUpperCase(), x: eX.trim().replace(/^@/, ''), anzeige: eName.trim() };
    const neu = { ...ausstehendRef.current, [s.epicId]: a }; ausstehendRef.current = neu; merkeAusstehend(neu); setAusstehend(neu);
    setAlle((v) => v.map((x) => (x.epicId === s.epicId ? mitAenderung(x, a) : x))); setOffen(null); void senden();
  };
  const speichernUndWeiter = (s: Spieler) => { const i = gezeigt.findIndex((x) => x.epicId === s.epicId); const n = i >= 0 ? gezeigt[i + 1] : undefined; speichern(s); if (n) oeffnen(n); };

  const kopf = <WerkzeugKopf ueber="Players & Teams" titel="Player Center" text="Flag and @ account belong to the account ID, not the name — a name change changes nothing." klassisch={klassisch}
    rechts={<span className="rounded-full border border-white/10 px-3 py-1 text-xs tabular-nums text-white/60">{zahl(gezeigt.length)} of {zahl(alle.length)}</span>} />;
  if (wer && !wer.isAdmin) return <>{kopf}<NurAdmins /></>;
  const gewaehlt = offen ? alle.find((x) => x.epicId === offen) ?? null : null;
  const lq = landSuche.trim().toLowerCase();
  const landTreffer = FLAGGEN.filter((c) => !lq || c.includes(lq) || landName(c).toLowerCase().includes(lq));
  const chip = (an: boolean) => `rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${an ? 'border-sky-400 bg-sky-400 text-[#06080f]' : 'border-white/10 bg-white/[0.03] text-white/60 hover:text-white'}`;
  const frueher = gewaehlt ? gewaehlt.namen.filter((n) => n !== gewaehlt.name && n !== gewaehlt.turniername) : [];

  return (
    <>
      {kopf}
      {wartend > 0 && (
        <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${sendeFehler ? 'border-rose-400/50 bg-rose-500/10 text-rose-100' : 'border-amber-400/40 bg-amber-400/10 text-amber-100'}`}>
          <b>{wartend} changes not saved yet.</b>{' '}
          {sendeFehler ? <>The server is not accepting them right now: {sendeFehler} They stay in this browser and are re-sent every 20 seconds, also after a reload.</> : 'Saving …'}
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {REGIONEN.map((r) => (
          <button key={r} type="button" onClick={() => waehle(setRegion)(r)} className={chip(region === r)}>
            {r === 'alle' ? 'All' : r}<span className="ml-1.5 font-normal tabular-nums opacity-70">{jeRegion[r] ?? '–'}</span>
          </button>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input value={suche} onChange={(e) => waehle(setSuche)(e.target.value)} placeholder="Name, old name or account ID" spellCheck={false} className={`${feld} w-72 max-w-full rounded-full`} />
        <button type="button" onClick={() => waehle(setFilter)(new Set<Filterart>())} className={chip(!filter.size)}>all</button>
        {FILTER.map((f) => (
          <button key={f.wert} type="button" title="Shift-click to combine several" className={chip(filter.has(f.wert))}
            onClick={(e) => {
              const n = new Set(e.shiftKey ? filter : []);
              if (n.has(f.wert)) n.delete(f.wert); else { n.add(f.wert); if (f.gegenteil) n.delete(f.gegenteil); }
              waehle(setFilter)(n);
            }}>{f.titel}</button>
        ))}
        {filter.size > 1 && <span className="text-[11px] text-white/40">{filter.size} combined</span>}
        <label className="flex items-center gap-1.5 text-xs text-white/45">from
          <input type="number" min={1} value={mindestens} onChange={(e) => waehle(setMindestens)(Math.max(1, Number(e.target.value) || 1))} className={`${feld} w-20 py-1 text-center`} />matches</label>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <div>
          {laedt ? <p className="py-16 text-center text-sm text-white/45">Loading …</p>
            : !gezeigt.length ? <p className="py-16 text-center text-sm text-white/45">Nobody matches.</p> : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7">
                  {gezeigt.slice(0, menge).map((s, i) => {
                    const auf = offen === s.epicId;
                    return (
                      <motion.button key={s.epicId} type="button" onClick={() => oeffnen(s)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 28) * 0.012 }}
                        className={`group rounded-2xl border bg-white/[0.03] p-2 text-left transition hover:-translate-y-0.5 ${auf ? 'border-sky-400 ring-2 ring-sky-400/40' : 'border-white/10 hover:border-white/25'}`}>
                        <span className="relative block aspect-[3/4] overflow-hidden rounded-xl bg-black/30">
                          {s.foto ? <img src={s.foto} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
                            : <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-white/[0.06] to-transparent p-2 text-center text-sm font-black uppercase leading-tight text-white/40">{s.name}</span>}
                          <span className="absolute left-1.5 top-1.5 flex h-6 min-w-[2rem] items-center justify-center rounded bg-black/65 px-1">
                            {s.land ? <Flagge land={s.land} /> : <span className="text-[10px] font-bold text-amber-300">?</span>}
                          </span>
                        </span>
                        <span className="mt-2 block truncate text-[13px] font-bold text-white">{s.name}</span>
                        <span className="block truncate text-[11px]">{s.x ? <span className="text-sky-300">@{s.x}</span> : <span className="text-white/35">no @ account</span>}</span>
                      </motion.button>
                    );
                  })}
                </div>
                {gezeigt.length > menge && (
                  <button type="button" onClick={() => setMenge((m) => m + SCHRITT)} className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.03] py-2.5 text-xs text-white/55 transition hover:border-sky-400/50 hover:text-sky-300">
                    show more ({zahl(gezeigt.length - menge)})
                  </button>
                )}
              </>
            )}
        </div>

        <Glas className="p-5 lg:sticky lg:top-20">
          <AnimatePresence mode="wait">
            {!gewaehlt ? (
              <motion.div key="leer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-12 text-center">
                <p className="text-sm font-bold text-white">Choose a player</p>
                <p className="mx-auto mt-2 max-w-[30ch] text-xs leading-relaxed text-white/45">Click a player on the left. Tip: set the “no flag” filter and go through them with “Save and next”.</p>
              </motion.div>
            ) : (
              <motion.div key={gewaehlt.epicId} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
                <div className="flex items-start gap-4">
                  <span className="block h-28 shrink-0 overflow-hidden rounded-xl bg-black/30" style={{ width: 84 }}>
                    {gewaehlt.foto ? <img src={gewaehlt.foto} alt="" className="h-full w-full object-cover object-top" />
                      : <span className="flex h-full w-full items-center justify-center p-1 text-center text-xs font-black uppercase leading-tight text-white/35">{gewaehlt.name}</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xl font-extrabold text-white">{gewaehlt.name}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-white/40">{gewaehlt.turniername}</span>
                    <span className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-white/60">
                      <span>{zahl(gewaehlt.matches)} matches</span><span>{zahl(gewaehlt.events)} event days</span><span>{zahl(gewaehlt.elims)} elims</span>
                    </span>
                    <label className={`${knopfLeise} mt-2 inline-flex cursor-pointer items-center`}>
                      {gewaehlt.foto ? 'Replace photo' : 'Upload photo'}
                      <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const d = e.target.files?.[0]; e.target.value = ''; if (d) void fotoHochladen(gewaehlt, d); }} />
                    </label>
                  </span>
                </div>
                {fotoStand && fotoStand.id === gewaehlt.epicId && <p className="text-[11px] leading-relaxed text-white/55">{fotoStand.text}</p>}
                <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/45">Display name</span>
                  <input value={eName} onChange={(e) => setEName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') speichernUndWeiter(gewaehlt); }} placeholder={gewaehlt.turniername} spellCheck={false} className={`${feld} w-full`} /></label>
                <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/45">@ account</span>
                  <span className="flex items-center rounded-xl border border-white/10 bg-black/40 focus-within:border-sky-400/60">
                    <span className="pl-3 text-sm text-white/40">@</span>
                    <input value={eX} onChange={(e) => setEX(e.target.value.replace(/^@/, ''))} onKeyDown={(e) => { if (e.key === 'Enter') speichernUndWeiter(gewaehlt); }} placeholder="without @" spellCheck={false} className="min-w-0 flex-1 bg-transparent px-1.5 py-2 text-sm text-white outline-none" />
                  </span></label>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">Flag</span>
                    <span className="flex items-center gap-2 text-xs text-white/75">
                      {eLand && FLAGGEN.includes(eLand.toLowerCase()) ? <><Flagge land={eLand} /><span className="font-semibold">{eLand.toUpperCase()} · {landName(eLand)}</span>
                        <button type="button" onClick={() => setELand('')} className="text-[11px] text-white/45 underline hover:text-rose-300">no country</button></> : <span className="text-white/30">—</span>}
                    </span>
                  </div>
                  <input value={landSuche} onChange={(e) => setLandSuche(e.target.value)} spellCheck={false} placeholder="Search country …" className={`${feld} mb-2 w-full py-1.5 text-xs`} />
                  <div className="grid max-h-56 grid-cols-5 gap-1.5 overflow-y-auto pr-1">
                    {landTreffer.map((c) => (
                      <button key={c} type="button" onClick={() => setELand(c.toUpperCase())} title={`${c.toUpperCase()} · ${landName(c)}`}
                        className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 transition ${eLand.toLowerCase() === c ? 'border-sky-400 bg-sky-400/15' : 'border-white/5 bg-black/20 hover:border-white/20'}`}>
                        <Flagge land={c} /><span className="text-[10px] font-bold uppercase text-white/55">{c}</span>
                      </button>
                    ))}
                    {!landTreffer.length && <p className="col-span-5 py-3 text-center text-xs text-white/40">Nothing matches.</p>}
                  </div>
                </div>
                {frueher.length > 0 && <p className="text-[11px] leading-relaxed text-white/45">Previously played as: {frueher.slice(0, 6).join(' · ')}</p>}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button type="button" onClick={() => speichernUndWeiter(gewaehlt)} className={`${knopfHaupt} px-5 py-2`}>Save and next</button>
                  <button type="button" onClick={() => speichern(gewaehlt)} className={`${knopfLeise} py-2`}>Save</button>
                  <button type="button" onClick={() => setOffen(null)} className="text-[11px] text-white/45 transition hover:text-white">cancel</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Glas>
      </div>
    </>
  );
}
