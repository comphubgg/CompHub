import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { Glas, Titel, flagge } from '../../teile/Glas';
import { useWer } from '../../teile/Anmeldung';
import { Laedt } from './tools/Gemeinsam';

/*
 * Tierlist im Hub - wie /tierlist der echten Seite: Spieler-Pool je Modus (Solo/Duo: /api/tierlist-pool?modus=, Trio: /api/tierlist-trios), Fotos
 * ueber POST /api/spielerbild (klein: ?w=128), Stufen S-F per Ziehen und Ablegen (oder antippen und Stufe waehlen). Der Stand liegt im Browser; wer
 * angemeldet ist, sichert ihn in sein Archiv (/api/tierlists, eigene Liste "Hub · Solos" usw. - die Listen der echten Seite bleiben unberuehrt).
 */

type Modus = 'solo' | 'duo' | 'trio';
type Stufe = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
interface Sp { name: string; land?: string }
interface Eintrag { key: string; spieler: Sp[]; region: string }
interface Stand { stufen: Record<string, Stufe>; reihe: string[] }

const STUFEN: Stufe[] = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];
const FARBE: Record<Stufe, string> = {
  S: 'from-rose-500 to-orange-400', A: 'from-orange-400 to-amber-300', B: 'from-amber-300 to-yellow-200', C: 'from-lime-400 to-emerald-300',
  D: 'from-teal-400 to-sky-400', E: 'from-sky-400 to-indigo-400', F: 'from-violet-500 to-fuchsia-400',
};
const MODI: Array<{ id: Modus; name: string }> = [{ id: 'solo', name: 'Solos' }, { id: 'duo', name: 'Duos' }, { id: 'trio', name: 'Trios' }];
const LEER: Stand = { stufen: {}, reihe: [] };
const speicherSchluessel = (m: Modus) => `hub:tierlist:${m}`;
function lese(m: Modus): Stand {
  try { const s = JSON.parse(localStorage.getItem(speicherSchluessel(m)) || 'null'); if (s && s.stufen && Array.isArray(s.reihe)) return s; } catch { /* leer */ }
  return LEER;
}
const schluessel = (spieler: Sp[]) => spieler.map((s) => s.name.toLowerCase().replace(/[^a-z0-9]/g, '')).sort().join('|');

/* Fotos: einmal je Name holen, gemeinsam fuer alle Kacheln. */
const FOTOS = new Map<string, string | null>();
async function fotosHolen(namen: string[]): Promise<void> {
  const offen = [...new Set(namen)].filter((n) => !FOTOS.has(n));
  for (let i = 0; i < offen.length; i += 150) {
    const teil = offen.slice(i, i + 150);
    try {
      const j = await fetch('/api/spielerbild', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ namen: teil }) }).then((r) => r.json()) as { bilder?: Record<string, string | null> };
      for (const n of teil) {
        const b = j.bilder?.[n];
        FOTOS.set(n, b ? `${b.split('?')[0]}?w=128` : null);
      }
    } catch { /* bleibt ohne Foto */ }
  }
}

/** Fotos als kleine Hochkant-Rechtecke nebeneinander - nur wenn JEDER Spieler des Teams eines hat (Betreiber-Regel). */
function Fotos({ spieler }: { spieler: Sp[] }) {
  const fotos = spieler.map((s) => FOTOS.get(s.name));
  if (!fotos.every(Boolean)) {
    // Ohne vollstaendige Fotos: Solo bekommt den Anfangsbuchstaben, Teams gar kein Bild.
    return spieler.length === 1
      ? <span className="grid h-12 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#1c2333] to-[#111622] text-sm font-extrabold text-white/40 ring-1 ring-white/10">{spieler[0].name.slice(0, 1).toUpperCase()}</span>
      : null;
  }
  return <div className="flex shrink-0 gap-1">{fotos.map((f, i) => <img key={i} src={f!} alt="" draggable={false} className="h-12 w-9 rounded-lg object-cover object-top ring-1 ring-white/15" />)}</div>;
}

function Kachel({ e, gewaehlt, ziehtGerade, onDragStart, onDragEnd, onClick, onDropVor }: {
  e: Eintrag; gewaehlt: boolean; ziehtGerade: boolean;
  onDragStart: (ev: DragEvent) => void; onDragEnd: () => void; onClick: () => void; onDropVor?: (ev: DragEvent) => void;
}) {
  const solo = e.spieler.length === 1;
  return (
    <motion.div layout="position" layoutId={`tl-${e.key}`} transition={{ type: 'spring', stiffness: 500, damping: 38 }} whileHover={{ y: -3 }}>
      {/* Natives Ziehen am inneren div - framer-motion reicht onDragStart nicht an das DOM weiter. */}
      <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick}
        onDragOver={onDropVor ? (ev) => ev.preventDefault() : undefined} onDrop={onDropVor}
        title={e.spieler.map((s) => s.name).join(' · ')}
        className={`group relative flex cursor-grab select-none items-center gap-2 rounded-2xl border px-2 py-1.5 backdrop-blur active:cursor-grabbing
          ${gewaehlt ? 'border-sky-400 bg-sky-400/15 shadow-[0_0_24px_-6px_rgba(56,189,248,0.8)]' : 'border-white/10 bg-white/[0.05] hover:border-white/25'} ${ziehtGerade ? 'opacity-30' : ''}`}>
        <Fotos spieler={e.spieler} />
        <div className="min-w-0 pr-1">
          {e.spieler.map((s) => (
            <p key={s.name} className={`flex items-center gap-1.5 truncate font-bold leading-tight text-white ${solo ? 'text-sm' : 'text-[11px]'}`}>
              {s.land && <img src={flagge(s.land)} alt="" className="h-3 w-3 shrink-0 rounded-full object-cover" />}
              <span className="max-w-[110px] truncate">{s.name}</span>
            </p>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export default function Tierlist() {
  const { wer } = useWer();
  const [modus, setModus] = useState<Modus>('solo');
  const [pools, setPools] = useState<Partial<Record<Modus, Eintrag[]>>>({});
  const [stand, setStand] = useState<Stand>(() => lese('solo'));
  const [region, setRegion] = useState<'alle' | 'EU' | 'NAC'>('alle');
  const [suche, setSuche] = useState('');
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [zieht, setZieht] = useState<string | null>(null);
  const [ueber, setUeber] = useState<Stufe | 'pool' | null>(null);
  const [, setFotoTakt] = useState(0);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [sichert, setSichert] = useState(false);

  // Pool des Modus laden.
  useEffect(() => {
    if (pools[modus]) return;
    const url = modus === 'trio' ? '/api/tierlist-trios' : `/api/tierlist-pool?modus=${modus}`;
    fetch(url).then((r) => r.json()).then((j) => {
      const roh = (modus === 'trio' ? j.trios : j.pool) as Array<{ spieler: Sp[]; region?: string }> ?? [];
      const liste: Eintrag[] = []; const da = new Set<string>();
      for (const p of roh) {
        if (!Array.isArray(p.spieler) || !p.spieler.length) continue;
        const k = schluessel(p.spieler);
        if (da.has(k)) continue;
        da.add(k); liste.push({ key: k, spieler: p.spieler, region: p.region || 'EU' });
      }
      setPools((alt) => ({ ...alt, [modus]: liste }));
      void fotosHolen(liste.flatMap((e) => e.spieler.map((s) => s.name))).then(() => setFotoTakt((n) => n + 1));
    }).catch(() => setPools((alt) => ({ ...alt, [modus]: [] })));
  }, [modus, pools]);

  // Stand je Modus im Browser (sofort beim Aufbau gelesen, danach bei jeder Aenderung geschrieben).
  useEffect(() => {
    try { localStorage.setItem(speicherSchluessel(modus), JSON.stringify(stand)); } catch { /* egal */ }
  }, [stand, modus]);
  const modusWechseln = (m: Modus) => { setModus(m); setStand(lese(m)); setGewaehlt(null); };

  const pool = useMemo(() => pools[modus] ?? [], [pools, modus]);
  const nachKey = useMemo(() => new Map(pool.map((e) => [e.key, e])), [pool]);

  const platziere = useCallback((key: string, stufe: Stufe | null, vor?: string) => {
    setStand((alt) => {
      const stufen = { ...alt.stufen };
      let reihe = alt.reihe.filter((k) => k !== key);
      if (stufe === null) { delete stufen[key]; return { stufen, reihe }; }
      stufen[key] = stufe;
      const i = vor ? reihe.indexOf(vor) : -1;
      reihe = i >= 0 ? [...reihe.slice(0, i), key, ...reihe.slice(i)] : [...reihe, key];
      return { stufen, reihe };
    });
  }, []);

  const ziehStart = (key: string) => (ev: DragEvent) => { ev.dataTransfer.setData('text/plain', key); ev.dataTransfer.effectAllowed = 'move'; setZieht(key); };
  const ziehEnde = () => { setZieht(null); setUeber(null); };
  const ablegen = (stufe: Stufe | null, vor?: string) => (ev: DragEvent) => {
    ev.preventDefault(); ev.stopPropagation();
    const key = ev.dataTransfer.getData('text/plain');
    if (key && key !== vor) platziere(key, stufe, vor);
    ziehEnde();
  };

  const q = suche.trim().toLowerCase();
  const imPool = pool.filter((e) => !stand.stufen[e.key] && (region === 'alle' || e.region === region) && (!q || e.spieler.some((s) => s.name.toLowerCase().includes(q))));
  const reihen = STUFEN.map((st) => ({ st, liste: stand.reihe.filter((k) => stand.stufen[k] === st).map((k) => nachKey.get(k)).filter(Boolean) as Eintrag[] }));
  const gesetzt = reihen.reduce((s, r) => s + r.liste.length, 0);

  /** In das Archiv des Kontos sichern: eigene Liste "hub-<modus>", die uebrigen Listen bleiben, wie sie sind. */
  const sichern = async () => {
    setSichert(true); setMeldung(null);
    try {
      const alt = await fetch('/api/tierlists', { cache: 'no-store' }).then((r) => r.json()) as { lists?: Array<{ listId?: string }>; currentListId?: string | null; angemeldet?: boolean };
      if (!alt.angemeldet) { setMeldung({ ok: false, text: 'Sign in to save your tierlist to your account.' }); return; }
      const id = `hub-${modus}`;
      const eintraege = stand.reihe.filter((k) => stand.stufen[k]).map((k) => {
        const e = nachKey.get(k)!;
        const sp = e.spieler.map((s, i) => ({ id: `${k}-${i}`, name: s.name, countryCode: s.land?.toLowerCase(), region: e.region }));
        const data = sp.length === 1 ? sp[0] : sp.length === 2 ? { id: k, player1: sp[0], player2: sp[1], region: e.region } : { id: k, player1: sp[0], player2: sp[1], player3: sp[2], region: e.region };
        return { id: k, tier: stand.stufen[k], data, isDuo: sp.length === 2, isTrio: sp.length === 3, vonHand: true };
      });
      const liste = { listId: id, listName: `Hub · ${MODI.find((m) => m.id === modus)!.name}`, modus, tierLabels: Object.fromEntries(STUFEN.map((s) => [s, s])), entries: eintraege, eigeneStufen: true, updatedAt: Date.now() };
      const lists = [...(alt.lists ?? []).filter((l) => l.listId !== id), liste];
      const r = await fetch('/api/tierlists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lists, currentListId: alt.currentListId ?? null }) });
      const j = await r.json().catch(() => ({}));
      setMeldung(r.ok && j.success ? { ok: true, text: 'Saved to your CompHub archive.' } : { ok: false, text: j.error || 'Could not save.' });
    } catch { setMeldung({ ok: false, text: 'Could not save.' }); } finally { setSichert(false); window.setTimeout(() => setMeldung(null), 4000); }
  };

  const laedt = !pools[modus];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <Titel ueber="Your ranking" titel="Tierlist" text="Drag players into the tiers – or tap a player, then a tier. Your list is kept in this browser and can be saved to your account." />
        <div className="ml-auto flex rounded-full border border-white/10 bg-white/[0.03] p-1 text-sm font-semibold">
          {MODI.map((m) => (
            <button key={m.id} type="button" onClick={() => modusWechseln(m.id)} className="relative rounded-full px-5 py-2">
              {modus === m.id && <motion.span layoutId="tl-modus" className="absolute inset-0 rounded-full bg-sky-400" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
              <span className={`relative ${modus === m.id ? 'text-[#06080f]' : 'text-white/60 hover:text-white'}`}>{m.name}</span>
            </button>
          ))}
        </div>
      </div>

      {laedt ? <Laedt text="Loading the player pool …" /> : (
        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_520px]">
          {/* Stufen */}
          <Glas className="overflow-hidden p-2">
            <div className="flex items-center gap-3 px-3 pb-2 pt-2">
              <span className="text-sm text-white/50"><span className="font-bold tabular-nums text-white">{gesetzt}</span> placed</span>
              {gewaehlt && <span className="rounded-full bg-sky-400/15 px-3 py-1 text-xs font-semibold text-sky-300">Tap a tier to place the selected player</span>}
              <div className="ml-auto flex items-center gap-2">
                <AnimatePresence>{meldung && <motion.span initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className={`text-xs ${meldung.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{meldung.text}</motion.span>}</AnimatePresence>
                <button type="button" onClick={() => { if (window.confirm('Clear all tiers?')) setStand(LEER); }} className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/60 hover:border-rose-400/50 hover:text-rose-300">Reset</button>
                {wer?.userName && <button type="button" disabled={sichert} onClick={() => void sichern()} className="rounded-xl bg-sky-400 px-3.5 py-1.5 text-xs font-bold text-[#06080f] hover:bg-sky-300 disabled:opacity-50">{sichert ? 'Saving …' : 'Save to account'}</button>}
              </div>
            </div>
            <div className="space-y-2">
              {reihen.map(({ st, liste }, i) => (
                <motion.div key={st} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i }}
                  onDragOver={(ev) => { ev.preventDefault(); setUeber(st); }} onDragLeave={() => setUeber((u) => (u === st ? null : u))} onDrop={ablegen(st)}
                  className={`flex min-h-[84px] overflow-hidden rounded-2xl border transition-colors ${ueber === st ? 'border-sky-400/70 bg-sky-400/[0.07]' : 'border-white/[0.06] bg-black/20'}`}>
                  <button type="button" onClick={() => { if (gewaehlt) { platziere(gewaehlt, st); setGewaehlt(null); } }}
                    className={`grid w-20 shrink-0 place-items-center bg-gradient-to-br ${FARBE[st]} text-3xl font-black text-[#06080f] ${gewaehlt ? 'cursor-pointer hover:brightness-110' : 'cursor-default'}`}>{st}</button>
                  <div className="flex flex-1 flex-wrap content-center items-center gap-2 p-2.5">
                    {liste.map((e) => (
                      <Kachel key={e.key} e={e} gewaehlt={gewaehlt === e.key} ziehtGerade={zieht === e.key}
                        onDragStart={ziehStart(e.key)} onDragEnd={ziehEnde} onDropVor={ablegen(st, e.key)}
                        onClick={() => { if (gewaehlt && gewaehlt !== e.key) { platziere(gewaehlt, st, e.key); setGewaehlt(null); } else platziere(e.key, null); }} />
                    ))}
                    {!liste.length && <span className="pl-2 text-xs text-white/20">Drop players here</span>}
                  </div>
                </motion.div>
              ))}
            </div>
          </Glas>

          {/* Pool */}
          <Glas className="flex h-fit flex-col p-4 2xl:sticky 2xl:top-24 2xl:max-h-[calc(100vh-7rem)]" verzoegerung={0.1}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-white">Player pool</h3>
              <span className="text-xs text-white/40">{imPool.length} left</span>
              <div className="ml-auto flex rounded-full border border-white/10 bg-black/20 p-0.5 text-xs font-semibold">
                {(['alle', 'EU', 'NAC'] as const).map((r) => (
                  <button key={r} type="button" onClick={() => setRegion(r)} className={`rounded-full px-3 py-1 ${region === r ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white'}`}>{r === 'alle' ? 'All' : r}</button>
                ))}
              </div>
            </div>
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search the pool…"
              className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2 text-sm text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none" />
            <div onDragOver={(ev) => { ev.preventDefault(); setUeber('pool'); }} onDragLeave={() => setUeber((u) => (u === 'pool' ? null : u))} onDrop={ablegen(null)}
              className={`mt-3 flex min-h-[200px] flex-1 flex-wrap content-start gap-2 overflow-y-auto rounded-2xl p-1 transition-colors ${ueber === 'pool' ? 'bg-rose-400/[0.06] ring-1 ring-rose-400/40' : ''}`}>
              {imPool.slice(0, 400).map((e) => (
                <Kachel key={e.key} e={e} gewaehlt={gewaehlt === e.key} ziehtGerade={zieht === e.key}
                  onDragStart={ziehStart(e.key)} onDragEnd={ziehEnde} onClick={() => setGewaehlt(gewaehlt === e.key ? null : e.key)} />
              ))}
              {!imPool.length && <p className="w-full py-10 text-center text-sm text-white/35">{q ? 'Nobody matches the search.' : 'Everyone is placed – nice.'}</p>}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-white/30">Pool: the best {modus === 'solo' ? 'EU and NAC players by Power Ranking' : modus === 'duo' ? 'duos of the latest EU and NAC duo cups' : 'trios tracked by CompHub'}. Click a placed player to send them back.</p>
          </Glas>
        </div>
      )}
    </div>
  );
}
