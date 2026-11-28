import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Flaeche, Kennzahl, Laedt, Marke, SeitenKopf } from '../../ds/Bausteine';
import { kern, waffeVon } from './waffenNamen';
import { useDatenbank } from './waffenDaten';
import { useWikiWaffen, wikiProxy, zusammenfuehren } from './waffenWiki';
import WaffenDatenbank, { turnierZuordnen } from './WaffenDatenbank';
import { Aenderungen, Einzelwaffe, VergleichSeite } from './WaffenSeiten';
import { Linie, WaffenBild, WaffenReiter } from './waffenTeile';
import { eintragVon, pfad, useWaffenBilder, type BilderTafel } from './waffenBilder';

/*
 * Waffen (Design 3.0, neu komponiert 28.11.2026) - Loot Pool, eigene Seite je Waffe, Vergleich, Aenderungen.
 *
 * Datenquellen (unveraendert):
 *   - Alle Waffen, die es je gab: Fortnite Wiki ueber den Vite-Proxy /fandom (waffenWiki.ts). Bilder NICHT mehr aus dem Wiki, sondern eigene
 *     unter /waffen/alle (waffenBilder.ts, vom Runner abgelegt) und die Spiel-Symbole unter /waffen.
 *   - Spieldateien-Export public/hub-daten/waffen.json (nur lokal beim Betreiber, nie im Repo) - Werte daraus gehen vor (waffenDaten.ts).
 *   - Was die Waffen in echten Turnieren tun: Deep Stats (/api/deep-stats) - die letzten Spieltage der laufenden Saison auf der grossen Insel
 *     (ohne Reload), je Waffe Schaden, Treffer, Kopftreffer und Spieler.
 * Antwortet weder Wiki noch Export, zeigt die Seite die Turnierwerte allein (eigene Karten) - nie eine erfundene Zahl.
 */

interface Tag { windowId: string; eventId: string; titel: string; beginn: string; matches: number }
interface WaffeRoh { roh: string; art: string; dmg: number; hits: number; krit: number; spieler: number }
interface Ansicht { windowId: string; matches: number; spielerGesamt?: number; waffen?: WaffeRoh[] }
interface Waffe { roh: string; art: string; dmg: number; hits: number; krit: number; spieler: number; tage: number }

const KLASSEN: Array<{ art: string; titel: string }> = [
  { art: 'ar', titel: 'Assault Rifles' }, { art: 'shotgun', titel: 'Shotguns' }, { art: 'smg', titel: 'SMGs' },
  { art: 'pistol', titel: 'Pistols' }, { art: 'sniper', titel: 'Snipers' }, { art: 'sonst', titel: 'Specials & Throwables' },
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

/** Karte nur mit Turnierwerten (ohne Wiki und Export) - gleich gebaut wie die Karten der Datenbank. */
function TurnierKarte({ w, gesamt, spielerTage, wiki, bilder, i }: { w: Waffe; gesamt: number; spielerTage: number; wiki?: Map<string, { name: string; bild: string }>; bilder: BilderTafel | null; i: number }) {
  const { name, bild: roh } = waffeVon(w.roh, wiki);
  // Nur eigene Dateien: Spiel-Symbol, sonst das eigene Bild nach Namen - kein Wiki-Hotlink
  const e = eintragVon(bilder, { name });
  const bild = (roh?.startsWith('/waffen/') ? roh : null) ?? (e ? pfad(e) : null);
  const proTreffer = w.hits ? w.dmg / w.hits : 0; const kopf = w.hits ? (w.krit / w.hits) * 100 : 0;
  const anteil = gesamt ? (w.dmg / gesamt) * 100 : 0; const genutzt = spielerTage ? Math.min(100, (w.spieler / spielerTage) * 100) : 0;
  return (
    <motion.article initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 16) * 0.025 }} className="fl-fest fl-klick group overflow-hidden !rounded-2xl">
      <div className="relative flex aspect-[16/10] items-center justify-center bg-[radial-gradient(90%_85%_at_50%_30%,rgb(var(--akz)/0.2),transparent_75%)] p-4">
        <WaffenBild bild={bild} name={name} className="h-full w-full transition duration-500 group-hover:scale-[1.08]" />
        <span className="absolute right-2 top-2"><Marke>{w.tage} {w.tage === 1 ? 'day' : 'days'}</Marke></span>
      </div>
      <div className="space-y-2.5 p-4">
        <h3 className="truncate text-[15px] font-bold text-white" title={w.roh}>{name}</h3>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-black/30 py-1.5"><p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">Dmg / hit</p><p className="zahl text-sm font-bold text-white">{proTreffer.toFixed(1)}</p></div>
          <div className="rounded-lg bg-black/30 py-1.5"><p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">Headshots</p><p className="zahl text-sm font-bold text-white">{kopf.toFixed(1)} %</p></div>
        </div>
        {[['Share of all damage', anteil, anteil * 2.5], ['Players who used it', genutzt, genutzt]].map(([t, v, b]) => (
          <div key={t as string}><div className="mb-1 flex justify-between text-[11px]"><span className="text-white/50">{t as string}</span><span className="zahl font-bold text-white">{(v as number).toFixed(1)} %</span></div><Linie anteil={b as number} /></div>
        ))}
      </div>
    </motion.article>
  );
}

export default function Waffen() {
  const wiki = useWiki();
  const { db: spielDb, status: spielStatus } = useDatenbank();
  // Alle Waffen, die es je gab: Fortnite Wiki (waffenWiki.ts) - Werte aus den Spieldateien gehen vor
  const wikiW = useWikiWaffen();
  const bilder = useWaffenBilder();
  // Eigene Bilder (/waffen/alle.json) an jede Waffe haengen - nach Kennung, sonst nach Namen
  const dbRoh = useMemo(() => {
    const d = zusammenfuehren(spielDb, wikiW.waffen);
    return d && bilder ? { ...d, weapons: d.weapons.map((w) => { const e = eintragVon(bilder, w); return e ? { ...w, eigen: e } : w; }) } : d;
  }, [spielDb, wikiW.waffen, bilder]);
  const status = spielStatus === 'laedt' ? 'laedt' : dbRoh ? 'da' : wikiW.status === 'laedt' ? 'laedt' : 'fehlt';
  // Auswahl fuer den Vergleich - bleibt beim Wechsel zwischen Pool, Einzelwaffe und Vergleich erhalten.
  const [vergleich, setVergleich] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('hub-waffen-vergleich') ?? '[]'); } catch { return []; } });
  const vergleichSetzen = (l: string[]) => { setVergleich(l); try { localStorage.setItem('hub-waffen-vergleich', JSON.stringify(l)); } catch { /* egal */ } };
  const umschalten = (id: string) => vergleichSetzen(vergleich.includes(id) ? vergleich.filter((x) => x !== id) : vergleich.length >= 4 ? [...vergleich.slice(1), id] : [...vergleich, id]);
  const [tage, setTage] = useState<Tag[] | null>(null);
  const [ansichten, setAnsichten] = useState<Ansicht[]>([]);
  const [fehler, setFehler] = useState(false);
  const [klasse, setKlasse] = useState('alle');
  const ort = useLocation();

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
  const fortschritt = wikiW.status === 'laedt' && wikiW.gesamt > 0 ? (
    <div className="flex flex-wrap items-center gap-3 text-xs text-white/50">
      <div className="h-1 w-48 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full bg-akz" animate={{ width: `${(wikiW.fertig / wikiW.gesamt) * 100}%` }} /></div>
      Reading every weapon from the Fortnite Wiki · <span className="zahl">{wikiW.fertig.toLocaleString('en')} / {wikiW.gesamt.toLocaleString('en')}</span> pages
    </div>
  ) : null;

  const pool = (
    <div className="space-y-6">
      {!db && fortschritt}
      {status === 'laedt' && !fortschritt && <Laedt text="Loading the weapon database" />}
      {db && <WaffenDatenbank db={db} turnier={waffen} gesamt={gesamt} spielerTage={spielerTage} wiki={wiki} vergleich={vergleich} umschalten={umschalten} wikiZustand={wikiW} />}
      {status === 'fehlt' && <>
        <p className="flex flex-wrap items-center gap-2 text-xs text-white/55"><span className="h-1.5 w-1.5 rounded-full bg-amber-300" />Stats per rarity come from the Fortnite Wiki and the game-file export – neither answered, so this shows what we measured in tournaments.{wikiW.status === 'fehlt' && <button type="button" onClick={wikiW.neu} className="font-semibold text-akz hover:text-white">Try again</button>}</p>
        <Flaeche fest className="grid grid-cols-2 gap-5 p-5 md:grid-cols-4">
          <Kennzahl label="Tournament days" wert={`${ansichten.length}${tage ? ` / ${tage.length}` : ''}`} />
          <Kennzahl label="Matches analysed" wert={matches} />
          <Kennzahl label="Hits measured" wert={treffer} />
          <Kennzahl label="Weapons seen" wert={waffen.length} ton="akz" />
        </Flaeche>
        <div className="ohne-leiste flex gap-1.5 overflow-x-auto">
          {[{ art: 'alle', titel: 'All', n: waffen.length }, ...gruppen.map((g) => ({ art: g.art, titel: g.titel, n: g.liste.length }))].map((g) => (
            <button key={g.art} type="button" onClick={() => setKlasse(g.art)} className={`chip ${klasse === g.art ? 'chip-an' : ''}`}>{g.titel}<span className="zahl text-white/40">{g.n}</span></button>
          ))}
        </div>
        {fehler && <p className="text-sm text-white/55">Deep Stats isn't answering right now – try again in a moment.</p>}
        {!fehler && !waffen.length && <Laedt text="Reading the latest tournament replays" />}
        {laedtNoch && waffen.length > 0 && <p className="text-xs text-white/40">Still adding tournament days ({ansichten.length} / {tage!.length}) …</p>}
        {gezeigt.map((g) => (
          <section key={g.art}>
            <div className="mb-3 flex items-baseline gap-3"><h2 className="titel text-3xl">{g.titel}</h2><span className="zahl text-sm text-white/40">{g.liste.length}</span></div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {g.liste.map((w, i) => <TurnierKarte key={w.roh} w={w} gesamt={gesamt} spielerTage={spielerTage} wiki={wiki} bilder={bilder} i={i} />)}
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
  const warten = status === 'laedt' || wikiW.status === 'laedt' ? (fortschritt ?? <Laedt />) : (
    <p className="text-sm text-white/55">Weapon pages need the stats from the Fortnite Wiki or the game-file export – neither answered. <button type="button" onClick={wikiW.neu} className="font-semibold text-akz hover:text-white">Try again</button></p>
  );
  const unterseite = /\/weapons\/(?!compare|changes)[^/]+/.test(ort.pathname);
  return (
    <div className="space-y-6">
      {!unterseite && (
        <SeitenKopf klein ueber="Community · Loot" titel="Weapons"
          text={db && !spielDb ? 'Every Fortnite weapon ever – what is in the pool right now, everything vaulted, stats per rarity and the seasons each one was in – plus how today’s weapons perform in real cups.'
            : db ? `Every weapon in ${db.season ? `Season ${db.season}` : 'this season'}’s pool with its stats per rarity and loot chances – straight from the game files – plus how it performs in real cups.`
            : `Every weapon in ${saison ? `Season ${saison}` : 'this season'}’s pool – measured from every hit in the latest tournament replays.`}
          rechts={<WaffenReiter ids={vergleich} />} />
      )}
      <Routes>
        <Route index element={pool} />
        <Route path="compare" element={status === 'laedt' ? <Laedt /> : <VergleichSeite db={db} wiki={wiki} proWaffe={proWaffe} setVergleich={vergleichSetzen} />} />
        <Route path="changes" element={status === 'laedt' ? <Laedt /> : <Aenderungen db={db} wiki={wiki} />} />
        <Route path=":id" element={db ? <Einzelwaffe db={db} wiki={wiki} proWaffe={proWaffe} gesamt={gesamt} spielerTage={spielerTage} vergleich={vergleich} vergleichen={umschalten} /> : warten} />
      </Routes>
    </div>
  );
}
