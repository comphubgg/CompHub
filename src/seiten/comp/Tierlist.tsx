import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Laedt, Segment, SeitenKopf } from '../../ds/Bausteine';
import { flagge } from '../../teile/Glas';
import { useWer } from '../../teile/Anmeldung';

/*
 * Tierlist im Hub - wie /tierlist der echten Seite: Spieler-Pool je Modus (Solo/Duo: /api/tierlist-pool?modus=, Trio: /api/tierlist-trios), Fotos
 * ueber POST /api/spielerbild (klein: ?w=128), Stufen per Ziehen und Ablegen (oder antippen und Stufe waehlen). Der Stand liegt im Browser; wer
 * angemeldet ist, sichert ihn in sein Archiv (/api/tierlists, eigene Liste "Hub · Solos" usw. - die Listen der echten Seite bleiben unberuehrt).
 *
 * Aufbau (Design-System 3.0, neu komponiert): oben das Brett mit den Stufen ueber die volle Breite, unten der Pool als ANGEDOCKTE Leiste, die beim
 * Rollen stehen bleibt - so ist beim Ziehen immer beides zu sehen. Ist ein Spieler angetippt, zeigt die Leiste "Place ... in:" mit einem Knopf je Stufe.
 * Betreiber (27.11.2026):
 *   - Stufen lassen sich UMBENENNEN (Klick auf das Farbfeld), hinzufuegen und entfernen; die Farbe bleibt an der Stufe.
 *   - Alle Kacheln sind gleich gross und gleich aufgebaut (ein Raster): Fotostreifen nur, wenn JEDER Spieler des Teams ein Foto hat - sonst dieselbe
 *     Kachel ohne Streifen. Keine Buchstaben-Kaesten.
 */

type Modus = 'solo' | 'duo' | 'trio';
interface Sp { name: string; land?: string }
interface Eintrag { key: string; spieler: Sp[]; region: string }
/** Eine Stufe: feste Kennung (S, A ... oder G, H ... fuer neue), frei waehlbarer Name, Farbe als Nummer in FARBEN. */
interface Tier { id: string; name: string; farbe: number }
interface Stand { stufen: Record<string, string>; reihe: string[]; tiers?: Tier[] }

const FARBEN = [
  'from-rose-500 to-orange-400', 'from-orange-400 to-amber-300', 'from-amber-300 to-yellow-200', 'from-lime-400 to-emerald-300',
  'from-teal-400 to-sky-400', 'from-sky-400 to-indigo-400', 'from-violet-500 to-fuchsia-400', 'from-pink-400 to-rose-300', 'from-slate-300 to-slate-400', 'from-cyan-300 to-teal-300',
];
const STANDARD: Tier[] = ['S', 'A', 'B', 'C', 'D', 'E', 'F'].map((id, i) => ({ id, name: id, farbe: i }));
const MODI: Array<{ id: Modus; name: string }> = [{ id: 'solo', name: 'Solos' }, { id: 'duo', name: 'Duos' }, { id: 'trio', name: 'Trios' }];
const LEER: Stand = { stufen: {}, reihe: [] };
/** Kachelmass je Modus - im Pool (Rasterspalte) und auf dem Brett (feste Breite) dasselbe, damit alles gleich aussieht. */
const MASS: Record<Modus, { breit: number; hoch: string }> = { solo: { breit: 156, hoch: 'h-[60px]' }, duo: { breit: 204, hoch: 'h-[60px]' }, trio: { breit: 250, hoch: 'h-[64px]' } };
const speicherSchluessel = (m: Modus) => `hub:tierlist:${m}`;
function lese(m: Modus): Stand {
  try {
    const s = JSON.parse(localStorage.getItem(speicherSchluessel(m)) || 'null');
    if (s && s.stufen && Array.isArray(s.reihe)) return { stufen: s.stufen, reihe: s.reihe, tiers: Array.isArray(s.tiers) && s.tiers.length ? s.tiers : undefined };
  } catch { /* leer */ }
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

/**
 * Die Kachel eines Spielers oder Teams - ueberall dieselbe Groesse und derselbe Aufbau: links der Fotostreifen (Hochkant-Rechtecke nebeneinander,
 * nur wenn jeder ein Foto hat), daneben die Namen mit Flagge untereinander. Ohne vollstaendige Fotos dieselbe Kachel ohne Streifen.
 */
function Kachel({ e, modus, gewaehlt, ziehtGerade, fest, onDragStart, onDragEnd, onClick, onDropVor }: {
  e: Eintrag; modus: Modus; gewaehlt: boolean; ziehtGerade: boolean; fest?: boolean;
  onDragStart: (ev: DragEvent) => void; onDragEnd: () => void; onClick: () => void; onDropVor?: (ev: DragEvent) => void;
}) {
  const fotos = e.spieler.map((s) => FOTOS.get(s.name));
  const mitFotos = fotos.every(Boolean);
  const solo = e.spieler.length === 1;
  return (
    <motion.div layout="position" layoutId={`tl-${e.key}`} transition={{ type: 'spring', stiffness: 500, damping: 38 }} style={fest ? { width: MASS[modus].breit } : undefined} className="min-w-0">
      {/* Natives Ziehen am inneren div - framer-motion reicht onDragStart nicht an das DOM weiter. */}
      <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick}
        onDragOver={onDropVor ? (ev) => ev.preventDefault() : undefined} onDrop={onDropVor}
        title={e.spieler.map((s) => s.name).join(' · ')}
        className={`flex w-full cursor-grab select-none items-center gap-2 overflow-hidden rounded-xl border px-1.5 transition active:cursor-grabbing ${MASS[modus].hoch}
          ${gewaehlt ? 'border-akz bg-akz/15 shadow-[0_0_24px_-6px_rgb(var(--akz)/0.8)]' : 'border-white/[0.08] bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.07]'} ${ziehtGerade ? 'opacity-30' : ''}`}>
        {mitFotos && <div className="flex shrink-0 gap-0.5">{fotos.map((f, i) => <img key={i} src={f!} alt="" draggable={false} loading="lazy" className="h-12 w-9 rounded-lg object-cover object-top" />)}</div>}
        <div className={`min-w-0 flex-1 ${mitFotos ? '' : 'pl-1.5'}`}>
          {e.spieler.map((s) => (
            <p key={s.name} className={`flex items-center gap-1.5 font-bold leading-[1.25] text-white ${solo ? 'text-[13px]' : 'text-[11px]'}`}>
              {s.land && <img src={flagge(s.land)} alt="" className="h-3 w-3 shrink-0 rounded-full object-cover" />}
              <span className="truncate">{s.name}</span>
            </p>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/** Das Farbfeld einer Stufe: zeigt den Namen; ein Klick macht ihn zum Textfeld (Enter/Verlassen uebernimmt). */
function StufenFeld({ tier, platzieren, umbenennen }: { tier: Tier; platzieren: (() => void) | null; umbenennen: (name: string) => void }) {
  const [schreibt, setSchreibt] = useState(false);
  const [text, setText] = useState(tier.name);
  const feld = useRef<HTMLInputElement>(null);
  useEffect(() => { if (schreibt) { feld.current?.focus(); feld.current?.select(); } }, [schreibt]);
  const fertig = () => { setSchreibt(false); const n = text.trim().slice(0, 16); if (n && n !== tier.name) umbenennen(n); else setText(tier.name); };
  const gross = tier.name.length <= 2 ? 'text-4xl' : tier.name.length <= 5 ? 'text-2xl' : tier.name.length <= 9 ? 'text-lg' : 'text-sm';
  return (
    <div className={`relative grid w-20 shrink-0 place-items-center bg-gradient-to-br sm:w-28 ${FARBEN[tier.farbe % FARBEN.length]}`}>
      {schreibt ? (
        <input ref={feld} value={text} maxLength={16} onChange={(e) => setText(e.target.value)} onBlur={fertig}
          onKeyDown={(e) => { if (e.key === 'Enter') fertig(); if (e.key === 'Escape') { setText(tier.name); setSchreibt(false); } }} aria-label="Tier name"
          className="w-[calc(100%-0.75rem)] rounded-lg bg-black/25 px-1 py-1.5 text-center font-titel text-xl uppercase tracking-wide text-[#04050a] outline-none ring-2 ring-black/40" />
      ) : (
        <button type="button" onClick={() => { if (platzieren) platzieren(); else { setText(tier.name); setSchreibt(true); } }} title={platzieren ? `Place in ${tier.name}` : 'Click to rename'}
          className="group/feld flex h-full w-full flex-col items-center justify-center px-1.5 text-[#04050a] transition hover:brightness-110">
          <span className={`max-w-full break-words text-center font-titel uppercase leading-none tracking-wide ${gross}`}>{tier.name}</span>
          {!platzieren && <svg viewBox="0 0 20 20" className="absolute bottom-1.5 right-1.5 h-3 w-3 opacity-0 transition group-hover/feld:opacity-60" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 3.5l3 3L7 16H4v-3z" /></svg>}
        </button>
      )}
    </div>
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
  const [ueber, setUeber] = useState<string | null>(null);
  const [, setFotoTakt] = useState(0);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [sichert, setSichert] = useState(false);
  const [poolZu, setPoolZu] = useState(false);

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
  const tiers = stand.tiers ?? STANDARD;

  const platziere = useCallback((key: string, stufe: string | null, vor?: string) => {
    setStand((alt) => {
      const stufen = { ...alt.stufen };
      let reihe = alt.reihe.filter((k) => k !== key);
      if (stufe === null) { delete stufen[key]; return { ...alt, stufen, reihe }; }
      stufen[key] = stufe;
      const i = vor ? reihe.indexOf(vor) : -1;
      reihe = i >= 0 ? [...reihe.slice(0, i), key, ...reihe.slice(i)] : [...reihe, key];
      return { ...alt, stufen, reihe };
    });
  }, []);

  /* Stufen bearbeiten: umbenennen, hinzufuegen (naechster freier Buchstabe, naechste Farbe), entfernen (die Spieler gehen zurueck in den Pool). */
  const umbenennen = (id: string, name: string) => setStand((alt) => ({ ...alt, tiers: (alt.tiers ?? STANDARD).map((t) => (t.id === id ? { ...t, name } : t)) }));
  const dazu = () => setStand((alt) => {
    const liste = alt.tiers ?? STANDARD;
    const frei = 'SABCDEFGHIJKLMNOPQRTUVWXYZ'.split('').find((b) => !liste.some((t) => t.id === b)) ?? `T${liste.length + 1}`;
    const farbe = FARBEN.map((_, i) => i).find((i) => !liste.some((t) => t.farbe === i)) ?? liste.length % FARBEN.length;
    return { ...alt, tiers: [...liste, { id: frei, name: liste.some((t) => t.name === frei) ? 'New' : frei, farbe }] };
  });
  const entfernen = (id: string) => setStand((alt) => {
    const stufen = Object.fromEntries(Object.entries(alt.stufen).filter(([, s]) => s !== id));
    return { stufen, reihe: alt.reihe.filter((k) => stufen[k]), tiers: (alt.tiers ?? STANDARD).filter((t) => t.id !== id) };
  });

  const ziehStart = (key: string) => (ev: DragEvent) => { ev.dataTransfer.setData('text/plain', key); ev.dataTransfer.effectAllowed = 'move'; setZieht(key); };
  const ziehEnde = () => { setZieht(null); setUeber(null); };
  const ablegen = (stufe: string | null, vor?: string) => (ev: DragEvent) => {
    ev.preventDefault(); ev.stopPropagation();
    const key = ev.dataTransfer.getData('text/plain');
    if (key && key !== vor) platziere(key, stufe, vor);
    ziehEnde();
  };

  const q = suche.trim().toLowerCase();
  const imPool = pool.filter((e) => !stand.stufen[e.key] && (region === 'alle' || e.region === region) && (!q || e.spieler.some((s) => s.name.toLowerCase().includes(q))));
  const reihen = tiers.map((t) => ({ t, liste: stand.reihe.filter((k) => stand.stufen[k] === t.id).map((k) => nachKey.get(k)).filter(Boolean) as Eintrag[] }));
  const gesetzt = reihen.reduce((s, r) => s + r.liste.length, 0);
  const gewaehlterEintrag = gewaehlt ? nachKey.get(gewaehlt) : undefined;

  /** In das Archiv des Kontos sichern: eigene Liste "hub-<modus>", die uebrigen Listen bleiben, wie sie sind. */
  const sichern = async () => {
    setSichert(true); setMeldung(null);
    try {
      const alt = await fetch('/api/tierlists', { cache: 'no-store' }).then((r) => r.json()) as { lists?: Array<{ listId?: string }>; currentListId?: string | null; angemeldet?: boolean };
      if (!alt.angemeldet) { setMeldung({ ok: false, text: 'Sign in to save your tierlist to your account.' }); return; }
      const id = `hub-${modus}`;
      const eintraege = stand.reihe.filter((k) => stand.stufen[k] && nachKey.has(k)).map((k) => {
        const e = nachKey.get(k)!;
        const sp = e.spieler.map((s, i) => ({ id: `${k}-${i}`, name: s.name, countryCode: s.land?.toLowerCase(), region: e.region }));
        const data = sp.length === 1 ? sp[0] : sp.length === 2 ? { id: k, player1: sp[0], player2: sp[1], region: e.region } : { id: k, player1: sp[0], player2: sp[1], player3: sp[2], region: e.region };
        return { id: k, tier: stand.stufen[k], data, isDuo: sp.length === 2, isTrio: sp.length === 3, vonHand: true };
      });
      // tierLabels traegt die eigenen Namen (wie auf der echten Seite); hubStufen dazu Reihenfolge und Farbe fuer den Hub.
      const liste = { listId: id, listName: `Hub · ${MODI.find((m) => m.id === modus)!.name}`, modus, tierLabels: Object.fromEntries(tiers.map((t) => [t.id, t.name])), hubStufen: tiers, entries: eintraege, eigeneStufen: true, updatedAt: Date.now() };
      const lists = [...(alt.lists ?? []).filter((l) => l.listId !== id), liste];
      const r = await fetch('/api/tierlists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lists, currentListId: alt.currentListId ?? null }) });
      const j = await r.json().catch(() => ({}));
      setMeldung(r.ok && j.success ? { ok: true, text: 'Saved to your CompHub archive.' } : { ok: false, text: j.error || 'Could not save.' });
    } catch { setMeldung({ ok: false, text: 'Could not save.' }); } finally { setSichert(false); window.setTimeout(() => setMeldung(null), 4000); }
  };

  const laedt = !pools[modus];
  const raster = { gridTemplateColumns: `repeat(auto-fill, minmax(${MASS[modus].breit}px, 1fr))` };
  return (
    <div>
      <SeitenKopf klein ueber="Your ranking" titel="Tierlist"
        text="Drag players from the pool into the tiers – or tap a player, then a tier. Click a tier label to rename it."
        rechts={<Segment id="tl-modus" wert={modus} onWahl={modusWechseln} wahl={MODI.map((m) => ({ k: m.id, titel: m.name }))} />} />

      {laedt ? <Laedt text="Loading the player pool" /> : (
        <>
          {/* Das Brett: Stufen ueber die volle Breite */}
          <div className="fl-fest overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <span className="text-sm text-white/50"><span className="zahl font-titel text-2xl text-white">{gesetzt}</span> placed <span className="text-white/30">· {tiers.length} tiers</span></span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <AnimatePresence>{meldung && <motion.span initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className={`text-xs ${meldung.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{meldung.text}</motion.span>}</AnimatePresence>
                <button type="button" onClick={dazu} disabled={tiers.length >= 12} className="knopf !px-3 !py-1.5 !text-xs">+ Add tier</button>
                <button type="button" onClick={() => { if (window.confirm('Send every player back to the pool? Your tiers and their names stay.')) setStand((alt) => ({ stufen: {}, reihe: [], tiers: alt.tiers })); }} className="knopf !px-3 !py-1.5 !text-xs hover:!border-rose-400/50 hover:!text-rose-300">Reset</button>
                {wer?.userName && <button type="button" disabled={sichert} onClick={() => void sichern()} className="knopf-prim !px-3.5 !py-1.5 !text-xs">{sichert ? 'Saving …' : 'Save to account'}</button>}
              </div>
            </div>
            <div>
              {reihen.map(({ t, liste }, i) => (
                <motion.div key={t.id} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}
                  onDragOver={(ev) => { ev.preventDefault(); setUeber(t.id); }} onDragLeave={() => setUeber((u) => (u === t.id ? null : u))} onDrop={ablegen(t.id)}
                  className={`group/reihe flex min-h-[76px] border-t border-white/[0.07] transition-colors ${ueber === t.id ? 'bg-akz/[0.09]' : 'bg-black/25'}`}>
                  <StufenFeld tier={t} platzieren={gewaehlt ? () => { platziere(gewaehlt, t.id); setGewaehlt(null); } : null} umbenennen={(n) => umbenennen(t.id, n)} />
                  <div className="flex min-w-0 flex-1 flex-wrap content-center items-center gap-1.5 p-2">
                    {liste.map((e) => (
                      <Kachel key={e.key} e={e} modus={modus} fest gewaehlt={gewaehlt === e.key} ziehtGerade={zieht === e.key}
                        onDragStart={ziehStart(e.key)} onDragEnd={ziehEnde} onDropVor={ablegen(t.id, e.key)}
                        onClick={() => { if (gewaehlt && gewaehlt !== e.key) { platziere(gewaehlt, t.id, e.key); setGewaehlt(null); } else platziere(e.key, null); }} />
                    ))}
                    {!liste.length && <span className="pl-2 text-xs text-white/20">Drop players here</span>}
                  </div>
                  <button type="button" onClick={() => { if (!liste.length || window.confirm(`Remove the tier “${t.name}”? Its ${liste.length} player${liste.length === 1 ? '' : 's'} go back to the pool.`)) entfernen(t.id); }}
                    disabled={tiers.length <= 1} aria-label={`Remove tier ${t.name}`} title="Remove this tier"
                    className="grid w-9 shrink-0 place-items-center text-white/20 opacity-100 transition hover:bg-rose-500/10 hover:text-rose-400 disabled:hidden sm:opacity-0 sm:group-hover/reihe:opacity-100">
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
                  </button>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Der Pool: unten angedockt, bleibt beim Rollen stehen */}
          <div onDragOver={(ev) => { ev.preventDefault(); setUeber('pool'); }} onDragLeave={() => setUeber((u) => (u === 'pool' ? null : u))} onDrop={ablegen(null)}
            className={`fl-fest sticky bottom-3 z-20 mt-4 shadow-[0_-24px_50px_-20px_rgba(0,0,0,0.9)] transition-colors ${ueber === 'pool' ? '!border-rose-400/50' : ''}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
              {gewaehlterEintrag ? (
                <>
                  <span className="text-sm text-white/60">Place <b className="text-white">{gewaehlterEintrag.spieler.map((s) => s.name).join(' · ')}</b> in</span>
                  <div className="flex flex-wrap gap-1">
                    {tiers.map((t) => <button key={t.id} type="button" onClick={() => { platziere(gewaehlt!, t.id); setGewaehlt(null); }} className={`rounded-lg bg-gradient-to-br px-2.5 py-1 font-titel text-base uppercase leading-none tracking-wide text-[#04050a] transition hover:brightness-110 ${FARBEN[t.farbe % FARBEN.length]}`}>{t.name}</button>)}
                  </div>
                  <button type="button" onClick={() => setGewaehlt(null)} className="knopf-leer !text-xs">Cancel</button>
                </>
              ) : (
                <>
                  <h2 className="titel text-2xl">Player pool</h2>
                  <span className="zahl text-xs text-white/40">{imPool.length} left</span>
                  <Segment id="tl-region" klein wert={region} onWahl={setRegion} wahl={[{ k: 'alle', titel: 'All' }, { k: 'EU', titel: 'EU' }, { k: 'NAC', titel: 'NAC' }]} />
                  <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search the pool…" className="eingabe min-w-0 flex-1 !py-1.5 sm:max-w-xs" />
                </>
              )}
              <button type="button" onClick={() => setPoolZu(!poolZu)} aria-expanded={!poolZu} className="knopf ml-auto !px-3 !py-1.5 !text-xs">{poolZu ? 'Show pool' : 'Hide pool'}
                <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 transition ${poolZu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l5 5 5-5" /></svg></button>
            </div>
            {!poolZu && (
              <>
                <div className={`grid max-h-[24vh] min-h-[76px] content-start sm:max-h-[27vh] gap-1.5 overflow-y-auto border-t border-white/[0.07] p-2 transition-colors ${ueber === 'pool' ? 'bg-rose-400/[0.06]' : ''}`} style={raster}>
                  {imPool.slice(0, 400).map((e) => (
                    <Kachel key={e.key} e={e} modus={modus} gewaehlt={gewaehlt === e.key} ziehtGerade={zieht === e.key}
                      onDragStart={ziehStart(e.key)} onDragEnd={ziehEnde} onClick={() => setGewaehlt(gewaehlt === e.key ? null : e.key)} />
                  ))}
                  {!imPool.length && <p className="col-span-full py-5 text-center text-sm text-white/35">{q ? 'Nobody matches the search.' : 'Everyone is placed – nice.'}</p>}
                </div>
                <p className="hidden border-t border-white/[0.07] px-4 py-1.5 text-[11px] text-white/30 sm:block">Pool: the best {modus === 'solo' ? 'EU and NAC players by Power Ranking' : modus === 'duo' ? 'duos of the latest EU and NAC duo cups' : 'trios tracked by CompHub'}. Click a placed player to send them back. Kept in this browser{wer?.userName ? ' – “Save to account” stores it in your archive' : ''}.</p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
