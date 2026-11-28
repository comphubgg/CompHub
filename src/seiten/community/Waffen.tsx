import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Glas } from '../../teile/Glas';
import { Bald, Laedt, TEAL, Ueberschrift } from './Teile';
import { kern, waffeVon } from './waffenNamen';
import { useDatenbank } from './waffenDaten';
import { useWikiWaffen, wikiProxy, zusammenfuehren } from './waffenWiki';
import WaffenDatenbank, { turnierZuordnen } from './WaffenDatenbank';
import { Aenderungen, Einzelwaffe, VergleichSeite, WaffenTabs } from './WaffenSeiten';
import { DatenFehlen, Hinweis } from './Bausteine';
import { Route, Routes } from 'react-router-dom';

/*
 * Loot-Pool im Stil von fortnite.gg/weapons - aber mit dem, was sonst niemand hat: wie die Waffen in echten Turnieren dieser Saison wirken.
 *
 * Welche Waffen im Pool sind und was sie in der Hand der Profis tun, kommt aus Deep Stats (/api/deep-stats): die letzten Spieltage der laufenden
 * Saison auf der grossen Insel (ohne Reload), je Waffe Schaden, Treffer, Kopftreffer und Spieler. Daraus: Schaden je Treffer im Mittel,
 * Kopftreffer-Anteil, Anteil am ganzen Schaden, wie viele Spieler sie benutzten.
 *
 * Grundwerte (Schaden, DPS, Magazin, Nachladen je Seltenheit) und Truhen-/Boden-Chancen stehen in keiner offenen Quelle (fortnite-api.com kennt keine
 * Waffenwerte, fortnite.gg darf nicht abgegriffen werden) - sie kommen aus dem eigenen Export der Spieldateien: public/hub-daten/waffen.json
 * (Format in waffenDaten.ts). Liegt die Datei da, zeigt WaffenDatenbank.tsx die volle Datenbank mit den Turnierwerten als Zusatz; sonst
 * bleibt diese Seite mit einem ehrlichen Hinweis - nie eine erfundene Zahl.
 */

interface Tag { windowId: string; eventId: string; titel: string; beginn: string; matches: number }
interface WaffeRoh { roh: string; art: string; dmg: number; hits: number; krit: number; spieler: number }
interface Ansicht { windowId: string; matches: number; spielerGesamt?: number; waffen?: WaffeRoh[] }
interface Waffe { roh: string; art: string; dmg: number; hits: number; krit: number; spieler: number; tage: number }

const KLASSEN: Array<{ art: string; titel: string }> = [
  { art: 'ar', titel: 'Assault Rifles' }, { art: 'shotgun', titel: 'Shotguns' }, { art: 'smg', titel: 'SMGs' },
  { art: 'pistol', titel: 'Pistols' }, { art: 'sniper', titel: 'Snipers' }, { art: 'sonst', titel: 'Specials & Throwables' },
];
const SELTEN = [
  { k: 'C', titel: 'Common', farbe: '#9ca3af' }, { k: 'UC', titel: 'Uncommon', farbe: '#22c55e' }, { k: 'R', titel: 'Rare', farbe: '#38bdf8' },
  { k: 'VR', titel: 'Epic', farbe: '#a855f7' }, { k: 'SR', titel: 'Legendary', farbe: '#f59e0b' }, { k: 'M', titel: 'Mythic', farbe: '#facc15' },
];
const ANZAHL_TAGE = 10;

function useWiki() {
  const [m, setM] = useState<Map<string, { name: string; bild: string }>>();
  useEffect(() => {
    fetch('/api/waffen-bilder').then((r) => r.json()).then((j: Record<string, { name: string; bild: string }>) => {
      const neu = new Map<string, { name: string; bild: string }>();
      for (const [k, v] of Object.entries(j ?? {})) { const n = kern(k); if (!neu.has(n)) neu.set(n, { ...v, bild: wikiProxy(v.bild) ?? v.bild }); }
      setM(neu);
    }).catch(() => {});
  }, []);
  return m;
}

function Karte({ w, gesamt, spielerTage, wiki, i }: { w: Waffe; gesamt: number; spielerTage: number; wiki?: Map<string, { name: string; bild: string }>; i: number }) {
  const { name, bild } = waffeVon(w.roh, wiki);
  const [selten, setSelten] = useState('R');
  const [kaputt, setKaputt] = useState(false);
  const farbe = SELTEN.find((s) => s.k === selten)!.farbe;
  const proTreffer = w.hits ? w.dmg / w.hits : 0;
  const kopf = w.hits ? (w.krit / w.hits) * 100 : 0;
  const anteil = gesamt ? (w.dmg / gesamt) * 100 : 0;
  const genutzt = spielerTage ? Math.min(100, (w.spieler / spielerTage) * 100) : 0;
  return (
    <motion.article initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i, duration: 0.45 }} whileHover={{ y: -5 }}
      className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl">
      {/* Kopf: Symbol auf der Farbe der gewaehlten Seltenheit */}
      <div className="relative h-36 overflow-hidden" style={{ background: `radial-gradient(120% 100% at 50% 0%, ${farbe}55, ${farbe}10 60%, transparent)` }}>
        <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: farbe }} />
        {bild && !kaputt
          ? <img src={bild} alt={name} loading="lazy" referrerPolicy="no-referrer" onError={() => setKaputt(true)} className="absolute left-1/2 top-1/2 h-[110px] w-[110px] -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)] transition duration-500 group-hover:scale-110" />
          : null}
        <span className="absolute right-3 top-3 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white/70 backdrop-blur">{w.tage} {w.tage === 1 ? 'day' : 'days'}</span>
      </div>
      <div className="p-5 pt-4">
        <h3 className="truncate text-lg font-extrabold tracking-tight text-white" title={w.roh}>{name}</h3>
        <div className="mt-2.5 flex gap-1">
          {SELTEN.map((s) => (
            <button key={s.k} type="button" title={s.titel} onClick={() => setSelten(s.k)}
              className={`h-5 flex-1 rounded-md transition ${selten === s.k ? 'ring-2 ring-white/80' : 'opacity-40 hover:opacity-80'}`} style={{ background: s.farbe }} />
          ))}
        </div>
        <p className="mt-1 text-[11px] font-semibold" style={{ color: farbe }}>{SELTEN.find((s) => s.k === selten)!.titel}</p>

        {/* Grundwerte je Seltenheit - aus den Spieldateien, noch nicht da */}
        <dl className="mt-3 grid grid-cols-4 gap-1.5 text-center">
          {['DMG', 'DPS', 'MAG', 'RELOAD'].map((k) => (
            <div key={k} className="rounded-lg bg-white/[0.03] py-1.5"><dt className="text-[9px] font-semibold uppercase tracking-wider text-white/35">{k}</dt><dd className="text-sm font-bold text-white/25">—</dd></div>
          ))}
        </dl>

        {/* Was Profis damit in Turnieren gemacht haben */}
        <div className="mt-4 space-y-2.5">
          <Zeile titel="Avg. damage per hit" wert={proTreffer.toFixed(1)} />
          <Balken titel="Headshot rate" wert={kopf} text={`${kopf.toFixed(1)} %`} />
          <Balken titel="Share of all damage" wert={anteil} max={40} text={`${anteil.toFixed(1)} %`} />
          <Balken titel="Players who used it" wert={genutzt} text={`${genutzt.toFixed(0)} %`} />
          <Zeile titel="Damage dealt" wert={w.dmg.toLocaleString('en')} klein />
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl border border-dashed border-white/10 px-3 py-2 text-[11px] text-white/40">
          <span>Chest · floor loot chance</span><Bald text="soon" />
        </div>
      </div>
    </motion.article>
  );
}

function Zeile({ titel, wert, klein }: { titel: string; wert: string; klein?: boolean }) {
  return <div className="flex items-baseline justify-between text-sm"><span className="text-white/50">{titel}</span><span className={`font-bold tabular-nums ${klein ? 'text-white/70' : 'text-white'}`}>{wert}</span></div>;
}
function Balken({ titel, wert, text, max = 100 }: { titel: string; wert: number; text: string; max?: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm"><span className="text-white/50">{titel}</span><span className="font-bold tabular-nums text-white">{text}</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <motion.div className="h-full rounded-full bg-teal-300" initial={{ width: 0 }} animate={{ width: `${Math.min(100, (wert / max) * 100)}%` }} transition={{ duration: 0.9, delay: 0.2 }} />
      </div>
    </div>
  );
}

export default function Waffen() {
  const wiki = useWiki();
  const { db: spielDb, status: spielStatus } = useDatenbank();
  // Alle Waffen, die es je gab: Fortnite Wiki (waffenWiki.ts) - Werte aus den Spieldateien gehen vor
  const wikiW = useWikiWaffen();
  const dbRoh = useMemo(() => zusammenfuehren(spielDb, wikiW.waffen), [spielDb, wikiW.waffen]);
  const status = spielStatus === 'laedt' ? 'laedt' : dbRoh ? 'da' : wikiW.status === 'laedt' ? 'laedt' : 'fehlt';
  const wikiFortschritt = wikiW.status === 'laedt' && wikiW.gesamt > 0 ? (
    <div className="flex flex-wrap items-center gap-3 text-xs text-white/45">
      <div className="h-1 w-48 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full bg-teal-300" animate={{ width: `${(wikiW.fertig / wikiW.gesamt) * 100}%` }} /></div>
      Reading every weapon from the Fortnite Wiki · {wikiW.fertig.toLocaleString('en')} / {wikiW.gesamt.toLocaleString('en')} pages
    </div>
  ) : null;
  // Auswahl fuer den Vergleich - bleibt beim Wechsel zwischen Pool, Einzelwaffe und Vergleich erhalten.
  const [vergleich, setVergleich] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('hub-waffen-vergleich') ?? '[]'); } catch { return []; } });
  const vergleichSetzen = (l: string[]) => { setVergleich(l); try { localStorage.setItem('hub-waffen-vergleich', JSON.stringify(l)); } catch { /* egal */ } };
  const umschalten = (id: string) => vergleichSetzen(vergleich.includes(id) ? vergleich.filter((x) => x !== id) : vergleich.length >= 4 ? [...vergleich.slice(1), id] : [...vergleich, id]);
  const [tage, setTage] = useState<Tag[] | null>(null);
  const [ansichten, setAnsichten] = useState<Ansicht[]>([]);
  const [fehler, setFehler] = useState(false);
  const [klasse, setKlasse] = useState('alle');

  useEffect(() => {
    let weg = false;
    fetch('/api/deep-stats').then((r) => r.json()).then((j: { cups?: Array<{ tage: Tag[] }> }) => {
      const alle = (j.cups ?? []).flatMap((c) => c.tage).filter((t) => t.matches > 0 && /^S\d+_/.test(t.windowId));
      const saison = Math.max(0, ...alle.map((t) => Number(/^S(\d+)_/.exec(t.windowId)![1])));
      // Nur die grosse Insel: Reload hat einen eigenen Pool.
      const liste = alle.filter((t) => t.windowId.startsWith(`S${saison}_`) && !/reload/i.test(`${t.windowId} ${t.eventId} ${t.titel}`))
        .sort((a, b) => b.beginn.localeCompare(a.beginn)).slice(0, ANZAHL_TAGE);
      if (weg) return;
      setTage(liste);
      liste.forEach((t) => fetch(`/api/deep-stats?window=${encodeURIComponent(t.windowId)}`).then((r) => r.json()).then((a: Ansicht) => {
        if (!weg && Array.isArray(a?.waffen)) setAnsichten((v) => [...v.filter((x) => x.windowId !== a.windowId), a]);
      }).catch(() => {}));
    }).catch(() => setFehler(true));
    return () => { weg = true; };
  }, []);

  const { waffen, gesamt, spielerTage, matches, treffer } = useMemo(() => {
    const m = new Map<string, Waffe>();
    let g = 0; let st = 0; let ma = 0; let tr = 0;
    for (const a of ansichten) {
      st += a.spielerGesamt ?? 0; ma += a.matches ?? 0;
      for (const w of a.waffen ?? []) {
        if (w.roh === '?' || w.art === 'hacke' || w.art === '?') continue;
        g += w.dmg; tr += w.hits;
        const x = m.get(w.roh) ?? { roh: w.roh, art: w.art, dmg: 0, hits: 0, krit: 0, spieler: 0, tage: 0 };
        x.dmg += w.dmg; x.hits += w.hits; x.krit += w.krit; x.spieler += w.spieler; x.tage += 1;
        m.set(w.roh, x);
      }
    }
    // Einzelne Treffer an einem Tag (ein Spieler hob etwas Seltenes auf) machen noch keinen Pool-Eintrag.
    return { waffen: [...m.values()].filter((w) => w.hits >= 5).sort((a, b) => b.dmg - a.dmg), gesamt: g, spielerTage: st, matches: ma, treffer: tr };
  }, [ansichten]);

  const saison = tage?.[0] ? /^S(\d+)_/.exec(tage[0].windowId)?.[1] : null;
  const gruppen = KLASSEN.map((k) => ({ ...k, liste: waffen.filter((w) => (k.art === 'sonst' ? !KLASSEN.slice(0, 5).some((x) => x.art === w.art) : w.art === k.art)) })).filter((g) => g.liste.length);
  const gezeigt = klasse === 'alle' ? gruppen : gruppen.filter((g) => g.art === klasse);
  const laedtNoch = tage && ansichten.length < tage.length;

  // Ohne Spieldateien-Export: was in den Turnieren dieser Saison benutzt wurde, ist im aktuellen Pool (nicht vaulted)
  const db = useMemo(() => {
    if (!dbRoh || spielDb || !waffen.length) return dbRoh;
    const gesehen = turnierZuordnen(dbRoh, waffen).proWaffe;
    return { ...dbRoh, weapons: dbRoh.weapons.map((w) => (gesehen.has(w.id) ? { ...w, vaulted: false } : w)) };
  }, [dbRoh, spielDb, waffen]);
  const proWaffe = useMemo(() => (db ? turnierZuordnen(db, waffen).proWaffe : new Map()), [db, waffen]);
  const pool = (
    <div className="space-y-8">
      <Ueberschrift ueber="Community · Weapons" titel="Loot pool" farbe={TEAL}
        text={db && !spielDb
          ? <>Every Fortnite weapon ever – the current pool and everything vaulted, with stats per rarity and the seasons each one was in – plus how today's weapons perform in tournaments.</>
          : db
          ? <>Every weapon in {db.season ? `Season ${db.season}` : 'this season'}'s pool with its real stats per rarity and loot chances – straight from the game files – plus how it performs in the latest tournaments.</>
          : <>Every weapon in {saison ? `Season ${saison}` : 'this season'}'s pool – and how it really performs: measured from every hit in the latest tournament replays, not from a patch note.</>} />

      {!db && wikiFortschritt}
      {status === 'laedt' && !wikiFortschritt && <Laedt farbe={TEAL} text="Loading the weapon database …" />}
      {db && <WaffenDatenbank db={db} turnier={waffen} gesamt={gesamt} spielerTage={spielerTage} wiki={wiki} vergleich={vergleich} umschalten={umschalten} wikiZustand={wikiW} />}
      {status === 'fehlt' && <>
      <Hinweis mehr={<>Damage, DPS, fire rate, magazine, reload, headshot and structure damage per rarity come from the Fortnite Wiki (every weapon ever) and, for the current season, from our game-file export with exact floor and chest chances. Neither answered just now – below is what we measured ourselves in tournaments.</>}>
        Full stats per rarity load from the Fortnite Wiki and the game-file export – showing tournament measurements for now.
      </Hinweis>
      {wikiW.status === 'fehlt' && <p className="flex flex-wrap items-center gap-2 text-xs text-white/55"><span className="h-1.5 w-1.5 rounded-full bg-amber-300" />The Fortnite Wiki didn't answer.<button type="button" onClick={wikiW.neu} className="font-semibold text-akz hover:text-white">Try again</button></p>}

      {/* Kennzahlen der Messung */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ['Tournament days', `${ansichten.length}${tage ? ` / ${tage.length}` : ''}`],
          ['Matches analysed', matches.toLocaleString('en')],
          ['Hits measured', treffer.toLocaleString('en')],
          ['Weapons seen', String(waffen.length)],
        ].map(([k, v], i) => (
          <Glas key={k} className="p-5" verzoegerung={0.05 * i}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">{k}</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums text-white">{v}</p>
          </Glas>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[{ art: 'alle', titel: 'All' }, ...gruppen].map((g) => (
          <button key={g.art} type="button" onClick={() => setKlasse(g.art)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${klasse === g.art ? 'border-teal-300/50 bg-teal-300/15 text-white' : 'border-white/10 text-white/55 hover:bg-white/5 hover:text-white'}`}>
            {g.titel}{'liste' in g ? <span className="ml-1.5 text-white/40">{(g as { liste: Waffe[] }).liste.length}</span> : null}
          </button>
        ))}
      </div>

      {fehler && <Glas className="p-6 text-sm text-white/60">Deep Stats isn't answering right now – try again in a moment.</Glas>}
      {!fehler && !waffen.length && <Laedt farbe={TEAL} text="Reading the latest tournament replays …" />}
      {laedtNoch && waffen.length > 0 && <p className="text-xs text-white/40">Still adding tournament days ({ansichten.length} / {tage!.length}) …</p>}

      {gezeigt.map((g) => (
        <section key={g.art} className="space-y-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-2xl font-extrabold tracking-tight text-white">{g.titel}</h2>
            <span className="text-sm text-white/40">{g.liste.length}</span>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {g.liste.map((w, i) => <Karte key={w.roh} w={w} gesamt={gesamt} spielerTage={spielerTage} wiki={wiki} i={i} />)}
          </div>
        </section>
      ))}

      {waffen.length > 0 && (
        <p className="text-xs leading-relaxed text-white/35">
          How it's measured: the {ansichten.length} most recent Season {saison} tournament days on the main island (Reload excluded), every damage event
          from the replays. "Players who used it" counts per tournament day. Rarities are pooled – the replays don't say which rarity dealt a hit.
        </p>
      )}
      </>}
    </div>
  );
  const ohneDatei = status === 'laedt' || wikiW.status === 'laedt' ? (wikiFortschritt ?? <Laedt farbe={TEAL} />) : <DatenFehlen titel="Weapon pages need the stats from the game files" text="Each weapon gets its own page – stats per rarity, rank in its class, time-to-kill per shield level, damage by distance and where to find it – as soon as hub-daten/waffen.json is there." />;
  return (
    <div className="space-y-6">
      <WaffenTabs ids={vergleich} />
      <Routes>
        <Route index element={pool} />
        <Route path="compare" element={status === 'laedt' ? <Laedt farbe={TEAL} /> : <VergleichSeite db={db} wiki={wiki} proWaffe={proWaffe} setVergleich={vergleichSetzen} />} />
        <Route path="changes" element={status === 'laedt' ? <Laedt farbe={TEAL} /> : <Aenderungen db={db} wiki={wiki} />} />
        <Route path=":id" element={db ? <Einzelwaffe db={db} wiki={wiki} proWaffe={proWaffe} imVergleich={(id) => vergleich.includes(id)} vergleichen={umschalten} /> : ohneDatei} />
      </Routes>
    </div>
  );
}
