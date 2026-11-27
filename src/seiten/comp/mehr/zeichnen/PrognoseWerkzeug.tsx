import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Glas } from '../../../../teile/Glas';
import { useWer } from '../../../../teile/Anmeldung';
import { FehlerZeile, Laedt, SEITE, TeamFlagge } from '../teile';
import Zeichenflaeche, { IKONE, WerkzeugKnopf, type Gruppe, type Steuerung } from './Zeichenflaeche';
import {
  anker, brBildFuer, eigeneKarte, einheitsGroesse, fortniteKarte, gefaltet, inselAusPlaylist, kartenName, namensSchluessel, nobleSpotsAnzeige,
  speichereLeinwand, useEchteNamen, zeichneMarke, type Punkt, type Spot,
} from './kartenLib';

/*
 * Die Globals-Prognose im Hub - der Nachbau von PrognosenWerkzeug (app/admin/predictions/Werkzeug.tsx) in der Fassung fuer /globals/predictions:
 *  - Feld der Global Championship aus /api/globals-teams (Spieltag 1), die Plaetze 1 bis n per Klick (naechster freier) oder Drag & Drop
 *    (Plaetze tauschen beim Ablegen), herausnehmen, alles zuruecksetzen, MVP waehlen, "Advance up to place" (Sieger markiert).
 *  - Karte: steht die Globals-Turnierkarte (Admin, /api/turnier-karten, jede Minute neu), gilt deren Verteilung fest; sonst die Formvorlage des
 *    Kartenbildes (/api/karten-vorlage, Insel aus der Playlist) und man zieht die Teams selbst auf die Formen (Klick auf den Namen nimmt es herunter).
 *  - Admin: die CompHub-Prognose (/api/prognosen, Speichern-Knopf), Flagge/Name/Region je Spieler pflegen (/api/spieler-profile), Reload-Insel
 *    zuordnen, Karte leeren. VIP: die eigene Prognose (/api/meine-prognose), speichert sich eine Sekunde nach jeder Aenderung selbst.
 *  - Screenshot: Karte und Reihenfolge als ein Bild (Zwischenablage oder PNG); "Predictions" zeigt die Reihenfolge gross.
 */

const GLOBALS_EVENT = 'epicgames_MannekenPis_Official';
const REGION_REIHE = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'OCE', 'ME'];
const WETTKAMPFREGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];

interface Fenster { status: string; begin: number; end?: number; eventId: string; windowId: string; region: string; istFinale: boolean; playlist?: string }
interface Cup { id: string; titel: string; bild?: string; global: boolean; regionen: Record<string, Fenster[]> }
interface TeamImFeld { key: string; namen: string[]; ids: string[]; herkunft: string[]; besterPlatz: number; region: string }
interface PSpot { id: string; form: string; punkte: Punkt[]; name?: string; farbe?: string; quelle?: 'noble' | 'vital' }
interface Karte { id: string; bildId: string; titel: string; spots: PSpot[]; aufSpot: Record<string, string[]> }
interface Ziel { cupId: string; eventId: string; windowId: string; region: string; begin: number; name: string }
interface Prognose {
  id: string; titel: string; cupId: string; cupTitel: string; gruppe?: string; qualiBis?: number; quellen?: unknown[]; plaetze: Array<string | null>; mvp?: string;
  feld?: TeamImFeld[]; ziel?: Ziel; karten?: Karte[]; bildId?: string; kartenTitel?: string; spots?: PSpot[]; aufSpot?: Record<string, string[]>; geaendert?: number; oeffentlich?: boolean;
}
interface Profil { land?: string; anzeige?: string; namen?: string[]; name?: string; x?: string; region?: string }
interface TKarte { id: string; titel: string; cupId?: string; bildId?: string; bildTitel?: string; eventId?: string; geaendert?: number; spots?: Array<PSpot & { teams?: string[] }>; teams?: Array<{ id: string; ids?: string[] }> }

const ordnung = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
const kennung = (cId: string, grp: string) => `${cId}-${grp || 'gesamt'}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const knopfLeise = 'rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/80 transition hover:border-sky-400/50 hover:text-white disabled:opacity-40';

function MvpWahl({ wert, setzen, spieler, gross }: { wert: string; setzen: (n: string) => void; spieler: Array<{ name: string; land?: string | null; region: string; schluessel: string }>; gross: boolean }) {
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState('');
  const treffer = useMemo(() => { const q = suche.trim().toLowerCase(); return q ? spieler.filter((x) => x.name.toLowerCase().includes(q)) : spieler; }, [spieler, suche]);
  const waehle = (n: string) => { setzen(n); setOffen(false); setSuche(''); };
  return (
    <div className="relative min-w-0 flex-1">
      <input value={offen ? suche : wert} placeholder="Search a player …" onFocus={() => { setOffen(true); setSuche(''); }} onChange={(e) => { setSuche(e.target.value); setOffen(true); }}
        onBlur={() => setTimeout(() => setOffen(false), 150)} onKeyDown={(e) => { if (e.key === 'Enter' && treffer[0]) { e.preventDefault(); waehle(treffer[0].name); } if (e.key === 'Escape') setOffen(false); }}
        className="w-full min-w-0 bg-transparent font-semibold text-white outline-none placeholder:text-white/30" />
      {offen && (
        <ul className="absolute bottom-full left-0 right-0 z-40 mb-2 max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0e18]/95 py-1 shadow-2xl backdrop-blur-xl">
          {treffer.length ? treffer.map((x) => (
            <li key={x.schluessel}><button type="button" onMouseDown={(e) => { e.preventDefault(); waehle(x.name); }}
              className={`flex w-full items-center gap-2 px-2.5 text-left transition hover:bg-sky-400/10 ${gross ? 'py-2 text-[15px]' : 'py-1.5 text-[12px]'} ${x.name === wert ? 'bg-amber-400/10' : ''}`}>
              <TeamFlagge laender={[x.land]} groesse={gross ? 22 : 18} /><span className="min-w-0 flex-1 truncate font-semibold text-white">{x.name}</span>
              {x.region && <span className="shrink-0 rounded border border-white/15 px-1.5 text-[10px] font-semibold text-white/50">{x.region}</span>}
            </button></li>
          )) : <li className="px-2.5 py-2 text-[12px] text-white/40">No player found</li>}
        </ul>
      )}
    </div>
  );
}

export default function PrognoseWerkzeug() {
  const { wer } = useWer();
  const istAdmin = !!wer?.isAdmin;
  const eigen = !istAdmin;
  const api = eigen ? '/api/meine-prognose' : '/api/prognosen';

  const [cups, setCups] = useState<Cup[]>([]);
  const [cupsLaden, setCupsLaden] = useState(true);
  const [cupId, setCupId] = useState('');
  const [ziel, setZiel] = useState<Ziel | null>(null);
  const [gruppe, setGruppe] = useState('');
  const [qualiBis, setQualiBis] = useState(0);
  const [titel, setTitel] = useState('Global Championship (2026)');
  const [feld, setFeld] = useState<TeamImFeld[]>([]);
  const [lanZuKey, setLanZuKey] = useState<Record<string, string>>({});
  const [laedt, setLaedt] = useState(false);
  const [status, setStatus] = useState('');
  const [plaetze, setPlaetze] = useState<Array<string | null>>([]);
  const [mvp, setMvp] = useState('');
  const [profile, setProfile] = useState<Record<string, Profil>>({});
  const [bilder, setBilder] = useState<Array<{ id: string; titel: string }>>([]);
  const [inseln, setInseln] = useState<Record<string, string>>({});
  const [bildId, setBildId] = useState('');
  const [spots, setSpots] = useState<PSpot[]>([]);
  const [aufSpot, setAufSpot] = useState<Record<string, string[]>>({});
  const [karteEigen, setKarteEigen] = useState(false);
  const [kartenTitel, setKartenTitel] = useState('');
  const [turnierKarten, setTurnierKarten] = useState<TKarte[]>([]);
  const [gespeicherte, setGespeicherte] = useState<Prognose[]>([]);
  const [gespeicherteDa, setGespeicherteDa] = useState(false);
  const [ladeFehler, setLadeFehler] = useState('');
  const [anmelden, setAnmelden] = useState(false);
  const [vollbildListe, setVollbildListe] = useState(false);
  const [voll, setVoll] = useState(false);
  const [suche, setSuche] = useState('');
  const [pflegt, setPflegt] = useState<TeamImFeld | null>(null);
  const [entwurf, setEntwurf] = useState<string[]>([]);
  const [namensEntwurf, setNamensEntwurf] = useState<string[]>([]);
  const [regionEntwurf, setRegionEntwurf] = useState<string[]>([]);
  const [flaggen, setFlaggen] = useState<string[]>([]);
  const [flaggenSuche, setFlaggenSuche] = useState('');
  const [pflegeStand, setPflegeStand] = useState('');
  const [schnappschuss, setSchnappschuss] = useState('');
  const [gespeichertUm, setGespeichertUm] = useState<number | null>(null);
  const gezogen = useRef<string | null>(null);
  const steuerung = useRef<Steuerung | null>(null);
  const huelle = useRef<HTMLDivElement | null>(null);
  const bildRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    fetch('/api/cup-catalog?modus=alle').then((r) => r.json()).then((d) => setCups(d.cups ?? [])).catch(() => { /* unten gemeldet */ }).finally(() => setCupsLaden(false));
    fetch('/api/spieler-profile').then((r) => r.json()).then((j) => setProfile(j.profile ?? {})).catch(() => { /* ohne Profile */ });
    fetch('/api/karten-bild').then((r) => r.json()).then((d) => { setBilder(d.karten ?? []); setInseln(d.inseln ?? {}); }).catch(() => { /* ohne Bilder */ });
    fetch('/api/flaggen').then((r) => r.json()).then((d) => setFlaggen(d.flaggen ?? [])).catch(() => { /* ohne Flaggen */ });
  }, []);
  useEffect(() => {
    if (!wer) return;
    fetch(api, { cache: 'no-store' }).then(async (r) => {
      if (r.status === 401 || r.status === 403) { setAnmelden(true); return; }
      const d = await r.json();
      if (d.fehler) { setLadeFehler(String(d.fehler)); return; }
      setGespeicherte(d.prognosen ?? []); setGespeicherteDa(true);
    }).catch(() => setLadeFehler('The store is not answering right now.'));
  }, [api, wer]);
  useEffect(() => {
    const w = () => setVoll(document.fullscreenElement !== null && document.fullscreenElement === huelle.current);
    document.addEventListener('fullscreenchange', w);
    return () => document.removeEventListener('fullscreenchange', w);
  }, []);

  /* Die Globals-Turnierkarte des Admins - jede Minute neu (der Admin verteilt waehrenddessen). */
  useEffect(() => {
    const hol = () => fetch('/api/turnier-karten', { cache: 'no-store' }).then((r) => r.json()).then((d) => setTurnierKarten((alt) => (d.ersatz && alt.length ? alt : d.karten ?? []))).catch(() => { /* naechste Minute */ });
    void hol();
    const u = setInterval(hol, 60_000);
    return () => clearInterval(u);
  }, []);
  const globalsKarte = useMemo(() => turnierKarten.find((k) => k.eventId === GLOBALS_EVENT && k.spots?.length) ?? null, [turnierKarten]);
  const karteFest = !!globalsKarte;

  /* Ohne feste Karte: die Formvorlage des Kartenbildes. */
  useEffect(() => {
    if (karteEigen || karteFest) return undefined;
    let weg = false;
    fetch(`/api/karten-vorlage?bild=${encodeURIComponent(bildId || 'fortnite-karte')}`).then((r) => r.json()).then((d) => { if (!weg) setSpots(d.spots ?? []); }).catch(() => { if (!weg) setSpots([]); });
    return () => { weg = true; };
  }, [bildId, karteEigen, karteFest]);

  const findeProfil = useCallback((name: string, id?: string): Profil | undefined => {
    if (id && profile[id]) return profile[id];
    const s = namensSchluessel(name);
    return Object.values(profile).find((p) => (p.namen ?? [p.name ?? '']).some((n) => namensSchluessel(n) === s));
  }, [profile]);

  const cup = cups.find((c) => c.id === cupId);
  /* Insel der Playlist -> Kartenbild (Reload) bzw. Saison-Bild (Battle Royale), solange die Karte nicht fest ist. */
  const inselJetzt = useMemo(() => {
    const alle = cup ? Object.values(cup.regionen).flat() : [];
    const zf = ziel ? alle.find((f) => f.windowId === ziel.windowId) : undefined;
    const erstes = (zf?.playlist ? zf : undefined) ?? alle.find((f) => f.playlist);
    return { ...inselAusPlaylist(erstes?.playlist), fenster: zf?.windowId ?? erstes?.windowId ?? null };
  }, [cup, ziel]);
  useEffect(() => {
    if (karteEigen || karteFest || !inselJetzt.schluessel) return;
    const z = inselJetzt.art === 'br' ? brBildFuer(inseln, inselJetzt.fenster) : (inseln[inselJetzt.schluessel] ?? null);
    if (z !== null) setBildId(z);
  }, [inselJetzt, inseln, karteEigen, karteFest]);
  const inselZuordnen = async (insel: string, bild: string) => {
    setInseln((alt) => { const n = { ...alt }; if (bild) n[insel] = bild; else delete n[insel]; return n; });
    await fetch('/api/karten-bild', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ insel, bildId: bild }) });
  };

  const feldLaden = useCallback(async (z: Ziel, behalten = false) => {
    setLaedt(true); setStatus('Loading the field …');
    try {
      const r = await fetch(`/api/globals-teams?fenster=${encodeURIComponent(z.windowId)}`);
      const d = await r.json() as { error?: string; teams?: Array<{ rang: number; region?: string | null; spieler: Array<{ turnierId: string; epicId: string | null; anzeige: string }> }> };
      if (!r.ok || d.error) throw new Error(d.error ?? 'not available');
      const lan: Record<string, string> = {};
      const liste: TeamImFeld[] = (d.teams ?? []).map((t) => {
        const ids = t.spieler.map((s) => s.epicId || s.turnierId);
        // Die Turnierkarte fuehrt inzwischen Epic-Konten (frueher die Turnier-IDs der LAN) - beide fuehren zum Team.
        for (const s of t.spieler) { lan[s.turnierId] = [...ids].sort().join('|'); if (s.epicId) lan[s.epicId] = lan[s.turnierId]; }
        return { key: [...ids].sort().join('|'), namen: t.spieler.map((s) => s.anzeige), ids, herkunft: [], besterPlatz: t.rang, region: t.region || '' };
      });
      setFeld(liste); setLanZuKey(lan);
      setPlaetze((alt) => (behalten && alt.length ? alt : Array.from({ length: liste.length }, () => null)));
      setStatus(liste.length ? `${liste.length} teams in the field` : '');
    } catch (e) { setStatus(`Error: ${(e as Error).message}`); } finally { setLaedt(false); }
  }, []);

  const laden = useCallback((p: Prognose) => {
    setCupId(p.cupId); setTitel(p.titel); setGruppe(p.gruppe ?? ''); setQualiBis(p.qualiBis ?? 0); setPlaetze(p.plaetze ?? []); setMvp(p.mvp ?? ''); setZiel(p.ziel ?? null);
    setFeld(p.feld ?? []);
    if (p.ziel) void feldLaden(p.ziel, true);
    const k = p.karten?.[0] ?? (p.spots?.length ? { id: 'k1', bildId: p.bildId ?? '', titel: p.kartenTitel || 'Map', spots: p.spots, aufSpot: p.aufSpot ?? {} } : null);
    if (k) { setBildId(k.bildId ?? ''); setKartenTitel(k.titel); setSpots(k.spots ?? []); setAufSpot(k.aufSpot ?? {}); setKarteEigen(!!k.spots?.length); }
    setStatus('Loaded');
  }, [feldLaden]);

  /* Die Global Championship von selbst oeffnen - die eigene (bzw. CompHub-)Prognose, sonst frisch. */
  const geoeffnet = useRef(false);
  useEffect(() => {
    if (geoeffnet.current || cupsLaden || !gespeicherteDa || cupId) return;
    const c = cups.find((x) => Object.values(x.regionen).some((l) => l.some((f) => f.eventId === GLOBALS_EVENT)));
    if (!c) return;
    const [region, liste] = Object.entries(c.regionen).find(([, l]) => l.some((f) => f.eventId === GLOBALS_EVENT))!;
    const fenster = liste.filter((f) => f.eventId === GLOBALS_EVENT).sort((a, b) => a.begin - b.begin);
    geoeffnet.current = true;
    const f0 = fenster[0];
    // Wie gruppenName auf main: gemeinsamer Teil der Kennungen nach dem Eventnamen (bei Day1/Day2 leer).
    const stuecke = fenster.map((f) => f.windowId.split('_').slice(1));
    const gemeinsam: string[] = [];
    for (let i = 0; i < (stuecke[0]?.length ?? 0); i++) { if (stuecke.every((s) => s[i] === stuecke[0][i])) gemeinsam.push(stuecke[0][i]); else break; }
    const name = (fenster.length === 1 ? stuecke[0] : gemeinsam).join(' · ');
    const grp = `${region} ${name}`.trim();
    const da = gespeicherte.find((p) => p.id === kennung(c.id, grp)) ?? (eigen ? gespeicherte.find((p) => p.cupId === c.id) : undefined);
    if (da) { laden(da); return; }
    const z: Ziel = { cupId: c.id, eventId: f0.eventId, windowId: f0.windowId, region, begin: f0.begin, name };
    setCupId(c.id); setZiel(z); setTitel('Global Championship (2026)'); setGruppe(grp); setQualiBis(1); setMvp(''); setPlaetze([]); setAufSpot({});
    void feldLaden(z);
  }, [cupsLaden, gespeicherteDa, cups, cupId, gespeicherte, eigen, laden, feldLaden]);

  /* Steht die Globals-Turnierkarte, gilt deren Verteilung (Teams ueber die Konten dem Feld zugeordnet). */
  const festStand = useRef('');
  useEffect(() => {
    if (!globalsKarte || !cupId) return;
    const st = `${globalsKarte.id}|${globalsKarte.geaendert ?? 0}|${Object.keys(lanZuKey).length}`;
    if (festStand.current === st) return;
    festStand.current = st;
    const teamKey = new Map((globalsKarte.teams ?? []).map((t) => [t.id, (t.ids ?? []).map((id) => lanZuKey[id]).find(Boolean) ?? null]));
    const neu: Record<string, string[]> = {};
    for (const sp of globalsKarte.spots ?? []) { const ks = (sp.teams ?? []).map((t) => teamKey.get(t)).filter((k): k is string => !!k); if (ks.length) neu[sp.id] = ks; }
    setBildId(globalsKarte.bildId ?? ''); setKartenTitel('Global Championship (2026)');
    setSpots((globalsKarte.spots ?? []).map((sp) => ({ id: sp.id, form: sp.form, punkte: sp.punkte, ...(sp.name ? { name: sp.name } : {}), ...(sp.farbe ? { farbe: sp.farbe } : {}), ...(sp.quelle ? { quelle: sp.quelle } : {}) })));
    setAufSpot(neu); setKarteEigen(true);
  }, [globalsKarte, cupId, lanZuKey]);

  const speichern = useCallback(async () => {
    if (!cup) { setStatus('Choose a cup first'); return; }
    const id = kennung(cupId, gruppe);
    const inhalt = {
      id, titel, cupId, cupTitel: cup.titel, gruppe: gruppe || undefined, qualiBis, quellen: [], plaetze, mvp: mvp || undefined, oeffentlich: !eigen, feld, ziel: ziel ?? undefined,
      karten: [{ id: 'k1', bildId, titel: kartenTitel || bilder.find((b) => b.id === bildId)?.titel || 'Battle Royale', spots, aufSpot }],
    };
    const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inhalt) });
    if (r.status === 401 || r.status === 403) { setAnmelden(true); return; }
    if (!r.ok) { setStatus('Saving failed'); return; }
    setGespeichertUm(Date.now());
    if (eigen) { setGespeicherte([inhalt as unknown as Prognose]); setKarteEigen(true); setStatus('Saved automatically'); return; }
    const d = await fetch('/api/prognosen', { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
    if (d?.prognosen) setGespeicherte(d.prognosen);
    setKarteEigen(true); setStatus('Saved — map, shapes and assignment belong to it now');
  }, [cup, cupId, gruppe, titel, qualiBis, plaetze, mvp, eigen, feld, ziel, bildId, kartenTitel, bilder, spots, aufSpot, api]);
  /* Die eigene Prognose speichert sich eine Sekunde nach jeder Aenderung. */
  const speichernRef = useRef(speichern);
  useEffect(() => { speichernRef.current = speichern; });
  useEffect(() => {
    if (!eigen || !cupId || !gespeicherteDa || !feld.length) return undefined;
    const u = setTimeout(() => { void speichernRef.current(); }, 1000);
    return () => clearTimeout(u);
  }, [eigen, cupId, gespeicherteDa, feld.length, plaetze, aufSpot, mvp, qualiBis, titel]);

  /* ---------------------------------------------------------------- Reihenfolge */

  const echteNamen = useEchteNamen(useMemo(() => feld.flatMap((t) => t.ids), [feld]), GLOBALS_EVENT);
  const nameVon = useCallback((n: string, id?: string | null) => kartenName(echteNamen[id ?? ''] || findeProfil(n, id ?? undefined)?.anzeige || n), [echteNamen, findeProfil]);
  const teamZu = useCallback((key: string | null) => (key ? feld.find((t) => t.key === key) ?? null : null), [feld]);
  const offen = useMemo(() => feld.filter((t) => !plaetze.includes(t.key)), [feld, plaetze]);
  const passt = useCallback((t: TeamImFeld) => {
    const q = gefaltet(namensSchluessel(suche)); if (!q) return true;
    return t.namen.some((n, k) => [n, findeProfil(n, t.ids[k])?.anzeige ?? ''].some((x) => gefaltet(namensSchluessel(x)).includes(q)));
  }, [suche, findeProfil]);
  const aufPlatz = (i: number, key: string) => setPlaetze((alt) => { const neu = [...alt]; const vorher = neu.indexOf(key); const weg = neu[i]; neu[i] = key; if (vorher >= 0 && vorher !== i) neu[vorher] = weg; return neu; });
  const setzen = (key: string) => setPlaetze((alt) => { const i = alt.indexOf(null); if (i < 0) return alt; const neu = [...alt]; neu[i] = key; return neu; });
  const raeumen = (i: number) => setPlaetze((alt) => { const neu = [...alt]; neu[i] = null; return neu; });

  /* ---------------------------------------------------------------- Karte */

  const aufForm = (spotId: string, key: string) => {
    if (karteFest) { setStatus('The map is placed in the map tool.'); return; }
    setAufSpot((alt) => { const neu: Record<string, string[]> = {}; for (const [id, ks] of Object.entries(alt)) { const r = ks.filter((k) => k !== key); if (r.length) neu[id] = r; } neu[spotId] = [...(neu[spotId] ?? []), key]; return neu; });
  };
  const vonForm = (spotId: string, key: string) => {
    if (karteFest) return;
    setAufSpot((alt) => { const r = (alt[spotId] ?? []).filter((k) => k !== key); const neu = { ...alt }; if (r.length) neu[spotId] = r; else delete neu[spotId]; return neu; });
  };
  const zeilenFuer = useCallback((key: string, alleine: boolean) => {
    const t = feld.find((x) => x.key === key); if (!t) return [];
    const n = t.namen.map((x, k) => nameVon(x, t.ids[k]));
    return alleine && n.length > 1 ? n : [n.join(' ')];
  }, [feld, nameVon]);
  const anzeigeSpots = useMemo(() => nobleSpotsAnzeige(spots, (sp) => sp.quelle === 'noble' || (!sp.quelle && sp.id.startsWith('noble-'))), [spots]);
  const flaechen: Spot[] = useMemo(() => spots.map((s) => ({ ...s, teams: aufSpot[s.id] ?? [] })), [spots, aufSpot]);
  const anzeigeFlaechen: Spot[] = useMemo(() => anzeigeSpots.map((s) => ({ ...s, teams: aufSpot[s.id] ?? [] })), [anzeigeSpots, aufSpot]);
  const gruppen = useCallback((s: Spot): Gruppe[] => { const ks = aufSpot[s.id] ?? []; return ks.map((k) => ({ key: k, zeilen: zeilenFuer(k, ks.length === 1) })).filter((g) => g.zeilen.length); }, [aufSpot, zeilenFuer]);
  const schrift = useMemo(() => einheitsGroesse(anzeigeFlaechen.flatMap((s) => { const g = gruppen(s); return g.length ? g.map((x) => ({ punkte: s.punkte, anzahl: g.length, texte: x.zeilen })) : s.name ? [{ punkte: s.punkte, anzahl: 1, texte: [s.name] }] : []; })), [anzeigeFlaechen, gruppen]);
  const kartenName2 = kartenTitel || bilder.find((b) => b.id === bildId)?.titel || 'Battle Royale';
  const bild = bildId ? eigeneKarte(bildId) : fortniteKarte();

  /** Karte und Reihenfolge als ein Bild - wie der Screenshot der Seite. */
  async function alsSchnappschuss() {
    if (!plaetze.length) { setSchnappschuss('Load a field first.'); return; }
    setSchnappschuss('drawing …');
    const KARTE = 1200, RAND = 40, SPALTE = 330, ZEILE = 46, KOPF = 96;
    const passen = Math.max(1, Math.floor((KARTE - KOPF) / ZEILE)); const spalten = Math.max(1, Math.ceil(plaetze.length / passen)); const pro = Math.ceil(plaetze.length / spalten);
    const c = document.createElement('canvas'); c.width = RAND * 3 + KARTE + spalten * SPALTE; c.height = RAND * 2 + KARTE;
    const g = c.getContext('2d'); if (!g) return;
    g.fillStyle = '#06080f'; g.fillRect(0, 0, c.width, c.height);
    try { if (bildRef.current) g.drawImage(bildRef.current, RAND, RAND, KARTE, KARTE); } catch { /* ohne Bild */ }
    const X = (x: number) => RAND + (x / 100) * KARTE, Y = (y: number) => RAND + (y / 100) * KARTE;
    for (const sp of anzeigeFlaechen) {
      const ks = aufSpot[sp.id] ?? [];
      g.beginPath(); sp.punkte.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y)))); g.closePath();
      g.fillStyle = ks.length >= 2 ? 'rgba(220,38,38,0.34)' : ks.length === 1 ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0.14)'; g.fill();
      g.strokeStyle = ks.length >= 2 ? 'rgb(248,60,60)' : ks.length === 1 ? 'rgba(0,0,0,0.95)' : sp.farbe ?? 'rgba(0,0,0,0.75)'; g.lineWidth = 2.5; g.stroke();
      const alle = ks.length ? ks.flatMap((k) => zeilenFuer(k, ks.length === 1)) : sp.name ? [sp.name] : [];
      if (!alle.length) continue;
      const ak = anker(sp.punkte); const grad = (schrift / 100) * KARTE;
      g.font = `700 ${grad}px Inter, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      alle.forEach((t, z) => { const y = Y(ak.y) + (z - (alle.length - 1) / 2) * grad * 1.12; g.lineWidth = Math.max(2, grad * 0.18); g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(t, X(ak.x), y); g.fillStyle = '#fff'; g.fillText(t, X(ak.x), y); });
    }
    await zeichneMarke(g, RAND, RAND, KARTE);
    const lx = RAND * 2 + KARTE;
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = '800 30px Inter, system-ui, sans-serif'; g.fillStyle = '#f1f5f9'; g.fillText(titel || 'Prediction', lx, RAND + 26);
    g.font = '500 18px Inter, system-ui, sans-serif'; g.fillStyle = '#64748b';
    g.fillText(`Place 1 to ${plaetze.length}${qualiBis === 1 ? ' · winner marked' : qualiBis ? ` · advance up to place ${qualiBis}` : ''}${mvp ? ` · MVP ${mvp}` : ''}`, lx, RAND + 58);
    plaetze.forEach((key, i) => {
      const t = teamZu(key); const x = lx + Math.floor(i / pro) * SPALTE, y = RAND + KOPF + (i % pro) * ZEILE + ZEILE / 2; const weiter = qualiBis > 0 && i < qualiBis;
      g.font = '700 20px Inter, system-ui, sans-serif'; g.fillStyle = weiter ? '#fcd34d' : '#64748b'; g.textAlign = 'right'; g.fillText(String(i + 1), x + 34, y);
      g.textAlign = 'left'; g.font = '600 19px Inter, system-ui, sans-serif'; g.fillStyle = t ? '#e2e8f0' : '#3f3f46';
      const text = t ? t.namen.map((n, k) => nameVon(n, t.ids[k])).join(' + ') : 'open';
      let kurz = text; while (g.measureText(kurz).width > SPALTE - 60 && kurz.length > 4) kurz = kurz.slice(0, -2);
      g.fillText(kurz === text ? text : `${kurz}…`, x + 46, y);
    });
    try { const wie = await speichereLeinwand(c, `prediction-${(titel || 'map').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`); setSchnappschuss(wie === 'kopiert' ? 'copied' : 'saved'); setTimeout(() => setSchnappschuss(''), 2500); }
    catch (e) { setSchnappschuss(`Did not work: ${(e as Error).message}`); }
  }

  /* ---------------------------------------------------------------- Pflege (Admin) */

  const pflegeOeffnen = (t: TeamImFeld) => {
    setPflegt(t); setFlaggenSuche(''); setPflegeStand('');
    setEntwurf(t.namen.map((n, k) => findeProfil(n, t.ids[k])?.land ?? ''));
    setNamensEntwurf(t.namen.map((n, k) => findeProfil(n, t.ids[k])?.anzeige ?? ''));
    setRegionEntwurf(t.namen.map((n, k) => findeProfil(n, t.ids[k])?.region ?? ''));
  };
  const pflegeSichern = async () => {
    if (!pflegt) return;
    setPflegeStand('saving …');
    for (let k = 0; k < pflegt.namen.length; k++) {
      const name = pflegt.namen[k]; const id = pflegt.ids[k] || undefined; const vorher = findeProfil(name, id);
      const land = (entwurf[k] ?? '').trim().toUpperCase(), anzeige = (namensEntwurf[k] ?? '').trim(), region = (regionEntwurf[k] ?? '').trim().toUpperCase();
      if ((vorher?.land ?? '') === land && (vorher?.anzeige ?? '') === anzeige && (vorher?.region ?? '') === region) continue;
      await fetch('/api/spieler-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, name, land, x: vorher?.x ?? '', region, anzeige }) });
    }
    const j = await fetch('/api/spieler-profile').then((r) => r.json()).catch(() => null);
    if (j?.profile) setProfile(j.profile);
    setPflegt(null);
  };

  /* ---------------------------------------------------------------- Ansicht */

  if (!wer) return <Laedt />;
  if (anmelden) return <Glas className="px-6 py-10 text-center text-sm text-white/55">Your own Globals prediction is saved with your VIP account — please sign in.</Glas>;
  if (!cupId) {
    return ladeFehler ? <FehlerZeile text="Your prediction is not reachable right now — the store is not answering. Nothing is lost; please reload in a moment." />
      : cupsLaden || !gespeicherteDa ? <Laedt text="Loading your prediction …" /> : <Glas className="px-6 py-10 text-center text-sm text-white/50">The Global Championship is not in the tournament catalogue right now.</Glas>;
  }

  const gesetzt = feld.length - offen.length;
  const regionen = (() => {
    const m = new Map<string, TeamImFeld[]>();
    for (const t of offen.filter(passt)) { const r = t.region || '?'; m.set(r, [...(m.get(r) ?? []), t]); }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || REGION_REIHE.indexOf(a[0]) - REGION_REIHE.indexOf(b[0]));
  })();

  const platzListe = (gross: boolean) => (
    <div className={gross ? 'grid content-start gap-2 md:grid-cols-2 xl:grid-cols-3' : 'grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-1.5'}>
      {plaetze.map((key, i) => {
        const t = teamZu(key); const weiter = qualiBis > 0 && i < qualiBis;
        return (
          <div key={i} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const k = e.dataTransfer.getData('text/team') || gezogen.current; if (k) aufPlatz(i, k); }}
            draggable={!!t} onDragStart={(e) => { if (!key) return; e.dataTransfer.setData('text/team', key); gezogen.current = key; }}
            className={`flex items-center rounded-xl border transition ${gross ? 'gap-3 px-3 py-2.5 text-[15px]' : 'gap-2 px-2 py-1.5 text-[12px]'} ${weiter ? 'border-amber-400/60 bg-amber-400/10' : t ? 'cursor-grab border-white/10 bg-black/30 hover:border-sky-400/40' : 'border-dashed border-white/10'}`}>
            <span className={`shrink-0 text-right text-[11px] font-black tabular-nums ${gross ? 'w-10' : 'w-8'} ${weiter ? 'text-amber-300' : 'text-white/40'}`}>{ordnung(i + 1)}</span>
            {t ? <>
              <TeamFlagge groesse={gross ? 32 : 22} laender={t.namen.map((n, k) => findeProfil(n, t.ids[k])?.land)} />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">{t.namen.map((n, k) => <span key={k} className="truncate font-semibold text-white">{nameVon(n, t.ids[k])}</span>)}</span>
              {!eigen && <button type="button" onClick={() => pflegeOeffnen(t)} title="Set flags, names and regions of this team" className="shrink-0 text-white/30 hover:text-amber-300">✎</button>}
              <button type="button" onClick={() => raeumen(i)} title="Back to the list" className="shrink-0 text-white/30 hover:text-rose-300">×</button>
            </> : <span className="text-white/20">–</span>}
          </div>
        );
      })}
      {feld.length > 0 && (
        <div className={`flex items-center rounded-xl border border-amber-400/40 bg-amber-400/[0.06] ${gross ? 'gap-3 px-3 py-2 text-[15px]' : 'gap-2 px-2 py-1.5 text-[12px]'}`}>
          <span className={`shrink-0 text-[11px] font-black text-amber-300 ${gross ? 'w-10' : 'w-8'}`}>MVP</span>
          <MvpWahl wert={mvp} setzen={setMvp} gross={gross} spieler={feld.flatMap((t) => t.namen.map((n, k) => ({ name: nameVon(n, t.ids[k]), land: findeProfil(n, t.ids[k])?.land, region: t.region, schluessel: `${t.key}#${k}` })))} />
          {mvp && <button type="button" onClick={() => setMvp('')} title="Clear" className="shrink-0 text-white/30 hover:text-rose-300">×</button>}
        </div>
      )}
    </div>
  );

  const knopf = (
    <>
      <button type="button" onClick={() => setPlaetze((a) => a.map(() => null))} disabled={!plaetze.some(Boolean)} className={knopfLeise}>Reset</button>
      <button type="button" onClick={() => setVollbildListe((v) => !v)} className={`${knopfLeise} ${vollbildListe ? '' : 'border-sky-400/50 text-sky-200'}`}>{vollbildListe ? '✕ Close' : 'Predictions'}</button>
      <button type="button" onClick={() => void alsSchnappschuss()} disabled={!plaetze.length} title="Save map and ranking as one image" className={knopfLeise}>Screenshot</button>
      {schnappschuss && <span className="self-center text-[11px] text-white/45">{schnappschuss}</span>}
    </>
  );

  return (
    <div className="space-y-4">
      <Glas className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <input value={titel} onChange={(e) => setTitel(e.target.value)} title="Title" className="w-full max-w-xl bg-transparent text-lg font-extrabold text-white outline-none focus:text-sky-200" />
          <p className="truncate text-xs text-white/45">{ziel && <>{new Date(ziel.begin).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })} · </>}Field according to Epic · {eigen ? 'Only you can see your own prediction.' : 'The CompHub prediction — visible on the Predictions page.'}</p>
        </div>
        <label className="text-[11px] text-white/50">Advance up to place
          <input value={qualiBis || ''} inputMode="numeric" onChange={(e) => { const n = parseInt(e.target.value, 10); setQualiBis(Number.isFinite(n) && n > 0 ? n : 0); }} className="ml-1.5 w-12 rounded-lg border border-white/10 bg-black/40 px-1.5 py-1 text-center text-xs text-white outline-none focus:border-amber-400/60" />
        </label>
        {ziel && <button type="button" onClick={() => void feldLaden(ziel, true)} disabled={laedt} title="Fetch the field from Epic again" className={knopfLeise}>{laedt ? 'loading …' : 'Reload field'}</button>}
        {eigen ? <span className="rounded-xl border border-white/10 px-3 py-1.5 text-[11px] text-white/45">{gespeichertUm ? `Saved ${new Date(gespeichertUm).toLocaleTimeString('en-GB')}` : 'Saves itself'}</span>
          : <button type="button" onClick={() => void speichern()} disabled={!feld.length} className="rounded-xl bg-sky-400 px-4 py-2 text-sm font-bold text-[#06080f] transition hover:bg-sky-300 disabled:opacity-40">Save</button>}
        <a href={`${SEITE}/globals/predictions`} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/45 transition hover:border-white/30 hover:text-white">Classic view ↗</a>
      </Glas>
      {!eigen && gespeicherte.filter((x) => x.cupId === cupId).length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {gespeicherte.filter((x) => x.cupId === cupId).map((x) => (
            <button key={x.id} type="button" onClick={() => laden(x)} className={`rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${(x.gruppe ?? '') === gruppe ? 'border-amber-400 bg-amber-400/10 text-amber-200' : 'border-white/10 text-white/50 hover:border-white/30'}`}>{x.gruppe || x.titel}</button>
          ))}
        </div>
      )}
      {status && <p className="text-xs text-white/45">{status}</p>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,min(calc(100vh-11rem),900px))_minmax(300px,1fr)_280px]">
        <div ref={huelle} className={voll ? 'flex h-full w-full items-center justify-center bg-[#0b2340]' : 'min-w-0'}>
          {istAdmin && !voll && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-white/50">
              <span className="text-sm font-bold text-white">Map</span>
              <span>{spots.length} spots · {Object.values(aufSpot).flat().length} placed</span>
              <span className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-white/80">{kartenName2}</span>
              {!karteFest && inselJetzt.art === 'reload' && inselJetzt.schluessel && (
                <span className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2 py-1">Reload island <b className="text-white/80">{inselJetzt.schluessel}</b> →
                  <select value={inseln[inselJetzt.schluessel] ?? ''} onChange={(e) => void inselZuordnen(inselJetzt.schluessel as string, e.target.value)} className="rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 text-white outline-none">
                    <option value="">Assign image …</option>{bilder.map((b) => <option key={b.id} value={b.id}>{b.titel}</option>)}
                  </select></span>
              )}
              {globalsKarte && <Link to={`/competitive/maps/view?id=${encodeURIComponent(globalsKarte.id)}&edit=1`} className="rounded-lg border border-white/10 px-2 py-1 text-white/70 hover:border-sky-400/50 hover:text-sky-200">Open in the map tool</Link>}
              {Object.keys(aufSpot).length > 0 && !karteFest && <button type="button" onClick={() => setAufSpot({})} className="rounded-lg border border-white/10 px-2 py-1 text-white/70 hover:border-rose-400/60">Clear map</button>}
            </div>
          )}
          <div className={voll ? 'h-full' : ''} style={voll ? { aspectRatio: '1 / 1' } : undefined}>
            <Zeichenflaeche spots={flaechen} anzeige={anzeigeFlaechen} gruppen={gruppen} schrift={schrift} bild={bild} bildRef={bildRef} steuerung={steuerung} voll={voll}
              darfAblegen={!karteFest} gezogen={gezogen} labelZiehbar={!karteFest} labelKlick={karteFest ? undefined : vonForm}
              abgelegt={(sp, key) => { if (!key) return; if (sp) aufForm(sp.id, key); else setStatus('There is no shape there — drag the team onto a spot'); }}
              oben={<>
                <WerkzeugKnopf titel={voll ? 'Close' : 'Fullscreen'} aktiv={voll} kind={IKONE.vollbild} onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void huelle.current?.requestFullscreen?.())} />
                <WerkzeugKnopf titel="Whole map" kind={IKONE.mittig} onClick={() => steuerung.current?.zurueck()} />
              </>}
              unten={!spots.length ? <span className="rounded-xl bg-black/70 px-2.5 py-2 text-[11px] text-white/60">No shapes have been drawn for this map image yet.</span>
                : karteFest ? <span className="rounded-xl bg-black/70 px-2.5 py-2 text-[11px] text-white/60">The drop spots come from the CompHub map</span> : undefined} />
          </div>
        </div>

        <Glas className="flex min-w-0 flex-col p-3 xl:max-h-[calc(100vh-9rem)]">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-white">Order{plaetze.length ? <span className="ml-1.5 font-normal text-white/40">place 1 to {plaetze.length}</span> : null}</h2>
            <div className="flex flex-wrap gap-1.5">{knopf}</div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {!plaetze.length ? <p className="py-8 text-center text-xs text-white/40">{laedt ? 'Loading the field …' : 'No field yet.'}</p> : platzListe(false)}
          </div>
        </Glas>

        <Glas className="flex min-w-0 flex-col p-3 xl:max-h-[calc(100vh-9rem)]">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-bold text-white">List</h2><span className="text-xs tabular-nums text-white/40">{gesetzt}/{feld.length} placed</span></div>
          {feld.length > 0 && (
            <div className="relative mb-2">
              <input value={suche} onChange={(e) => setSuche(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setSuche(''); }} placeholder="Search a player …" className="w-full rounded-xl border border-white/10 bg-black/40 py-2 pl-3 pr-8 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-sky-400/60" />
              {suche && <button type="button" onClick={() => setSuche('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">×</button>}
            </div>
          )}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: '70vh' }}>
            {regionen.map(([region, ts]) => (
              <div key={region}>
                {regionen.length > 1 && <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300/70">{region} <span className="text-white/30">{ts.length}</span></p>}
                <div className="space-y-1">
                  {ts.map((t) => (
                    <button key={t.key} type="button" draggable onClick={() => setzen(t.key)} onDragStart={(e) => { e.dataTransfer.setData('text/team', t.key); gezogen.current = t.key; }} onDragEnd={() => { gezogen.current = null; }}
                      title="Drag for a specific place (or onto a spot), click for the next free one"
                      className="flex w-full items-center gap-2.5 rounded-xl border border-white/[0.07] px-2.5 py-2 text-left text-[13px] transition hover:border-sky-400/50 hover:bg-sky-400/[0.06]">
                      <TeamFlagge laender={t.namen.map((n, k) => findeProfil(n, t.ids[k])?.land)} />
                      <span className="flex min-w-0 flex-1 flex-col leading-tight">{t.namen.map((n, k) => <span key={k} className="truncate font-semibold text-white">{nameVon(n, t.ids[k])}</span>)}</span>
                      <span className="shrink-0 rounded border border-sky-400/40 px-1 py-px text-[9px] font-bold uppercase text-sky-300">{t.region || '?'}</span>
                      {!eigen && <span role="button" tabIndex={0} title={`Set flags of this team by hand · #${t.besterPlatz}`} onClick={(e) => { e.stopPropagation(); pflegeOeffnen(t); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); pflegeOeffnen(t); } }} className="shrink-0 cursor-pointer text-white/30 hover:text-amber-300">✎</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {suche.trim() && (() => {
              const schon = plaetze.map((key, i) => ({ t: teamZu(key), i })).filter((x): x is { t: TeamImFeld; i: number } => !!x.t && passt(x.t));
              return schon.length ? <div><p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">Already placed</p>
                <div className="space-y-1">{schon.map(({ t, i }) => (
                  <div key={t.key} className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] px-2.5 py-2 text-[13px] opacity-70">
                    <span className="w-9 shrink-0 text-[11px] font-bold tabular-nums text-sky-300">{ordnung(i + 1)}</span><TeamFlagge laender={t.namen.map((n, k) => findeProfil(n, t.ids[k])?.land)} />
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">{t.namen.map((n, k) => <span key={k} className="truncate text-white/70">{nameVon(n, t.ids[k])}</span>)}</span>
                  </div>
                ))}</div></div> : null;
            })()}
            {suche.trim() && feld.length > 0 && !feld.some(passt) && <p className="py-4 text-center text-[11px] text-white/40">No player in the field matches the search.</p>}
            {!offen.length && feld.length > 0 && !suche.trim() && <p className="py-4 text-center text-[11px] text-white/40">All teams are placed.</p>}
            {!feld.length && <p className="py-4 text-center text-[11px] text-white/40">No field loaded yet.</p>}
          </div>
        </Glas>
      </div>
      <p className="text-center text-[11px] text-white/30">Drag teams from the list onto the places{karteFest ? '' : ' or onto a spot on the map'} — or click for the next free place. Wheel zooms, drag moves, double-click zooms in.</p>

      <AnimatePresence>
        {vollbildListe && (
          <motion.div key="liste" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[400] overflow-auto bg-[#06080f]/95 p-6 backdrop-blur-xl">
            <div className="mb-4 flex flex-wrap items-center gap-3"><h2 className="text-2xl font-extrabold text-white">{titel}</h2><div className="ml-auto flex flex-wrap gap-1.5">{knopf}</div></div>
            {platzListe(true)}
            {!!qualiBis && <p className="mt-4 flex items-center justify-center gap-5 text-[11px] uppercase tracking-wider text-white/45">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" />{qualiBis === 1 ? 'Winning team' : `Advance, place 1 to ${qualiBis}`}</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-white/30" />Other places</span></p>}
          </motion.div>
        )}
        {pflegt && (
          <motion.div key="pflege" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPflegt(null)} className="fixed inset-0 z-[450] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <motion.div initial={{ y: 16, scale: 0.98 }} animate={{ y: 0, scale: 1 }} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0a0e18]/95 p-5 shadow-2xl backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-white">Flag, name and region<span className="ml-2 text-[11px] font-normal text-white/40">{pflegt.namen.map(kartenName).join(' + ')}</span></h3>
                <button type="button" onClick={() => setPflegt(null)} className="text-white/40 hover:text-white">✕</button>
              </div>
              <input value={flaggenSuche} onChange={(e) => setFlaggenSuche(e.target.value)} placeholder="Search a code — de, ro, us …" className="mb-3 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-400/60" />
              <div className="space-y-4">
                {pflegt.namen.map((n, k) => {
                  const gesetztL = (entwurf[k] ?? '').toLowerCase(); const q = flaggenSuche.trim().toLowerCase(); const liste = q ? flaggen.filter((f) => f.includes(q)) : flaggen;
                  return (
                    <div key={k} className="rounded-2xl border border-white/10 p-3">
                      <div className="mb-2 flex items-center gap-2.5">
                        {gesetztL ? <img src={`/flags/${gesetztL}.png`} alt={gesetztL} className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-white/20" /> : <span className="h-7 w-7 shrink-0 rounded-full border border-white/15 bg-white/5" />}
                        <input value={namensEntwurf[k] ?? ''} placeholder={kartenName(n)} spellCheck={false} title="Display name — empty means: as Epic delivers it" onChange={(e) => setNamensEntwurf((a) => a.map((v, i) => (i === k ? e.target.value : v)))} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-400/60" />
                        <input value={entwurf[k] ?? ''} maxLength={2} placeholder="—" onChange={(e) => setEntwurf((a) => a.map((v, i) => (i === k ? e.target.value.toUpperCase() : v)))} className="w-14 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-center text-sm uppercase text-white outline-none focus:border-amber-400/60" />
                        {gesetztL && <button type="button" onClick={() => setEntwurf((a) => a.map((v, i) => (i === k ? '' : v)))} className="text-[11px] text-white/40 hover:text-rose-300">clear</button>}
                      </div>
                      <div className="mb-2 flex flex-wrap items-center gap-1">
                        <span className="mr-1 text-[10px] uppercase tracking-wider text-white/35">Region</span>
                        {WETTKAMPFREGIONEN.map((r) => <button key={r} type="button" onClick={() => setRegionEntwurf((a) => a.map((v, i) => (i === k ? (v === r ? '' : r) : v)))} className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold transition ${(regionEntwurf[k] ?? '') === r ? 'border-amber-400 bg-amber-400/15 text-amber-300' : 'border-white/10 text-white/45 hover:text-white'}`}>{r}</button>)}
                        {(regionEntwurf[k] ?? '') && <button type="button" onClick={() => setRegionEntwurf((a) => a.map((v, i) => (i === k ? '' : v)))} className="ml-1 text-[11px] text-white/35 hover:text-rose-300">as counted</button>}
                      </div>
                      <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                        {liste.map((f) => <button key={f} type="button" title={f.toUpperCase()} onClick={() => setEntwurf((a) => a.map((v, i) => (i === k ? f.toUpperCase() : v)))} className={`rounded-full p-0.5 transition ${gesetztL === f ? 'ring-2 ring-amber-400' : 'ring-1 ring-white/10 hover:ring-sky-400'}`}><img src={`/flags/${f}.png`} alt={f} className="h-6 w-6 rounded-full object-cover" /></button>)}
                        {!liste.length && <p className="py-2 text-[11px] text-white/35">No flag file for “{flaggenSuche}”.</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-[11px] leading-snug text-white/35">Only flags that exist as a file are offered — {flaggen.length} flags. An empty flag means: origin unknown. An empty name means: as Epic delivers it.</p>
                <div className="flex shrink-0 items-center gap-2">
                  {pflegeStand && <span className="text-[11px] text-white/40">{pflegeStand}</span>}
                  <button type="button" onClick={() => setPflegt(null)} className={knopfLeise}>Cancel</button>
                  <button type="button" onClick={() => void pflegeSichern()} className="rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-bold text-[#06080f] hover:bg-amber-300">Save</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
