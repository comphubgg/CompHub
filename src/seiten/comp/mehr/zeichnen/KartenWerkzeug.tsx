import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Glas } from '../../../../teile/Glas';
import { useWer } from '../../../../teile/Anmeldung';
import { SEITE, TeamFlagge, flaggenPfad } from '../teile';
import Zeichenflaeche, { IKONE, WerkzeugKnopf, type Gruppe, type Steuerung } from './Zeichenflaeche';
import { leseWoerter } from './bildLesen';
import {
  FARBEN, anker, brBildFuer, eigeneKarte, einheitsGroesse, formFarbe, fortniteKarte, gefaltet, imPolygon, inselAusPlaylist, istGrossesTurnier,
  kartenName, kartenTitel, kontoSchluessel, namensSchluessel, nobleSpotsAnzeige, rahmen, rechteckPunkte, speichereLeinwand, useEchteNamen, zeichneMarke,
  type Form, type Punkt, type Spot,
} from './kartenLib';

/*
 * Das Karten-Werkzeug im Hub - der Nachbau von /maps auf main (app/maps/page.tsx), mit denselben Schnittstellen:
 *  - Admin: Cup (/api/cup-catalog?modus=alle) und Spieltag waehlen, Teams laden (/api/cup-leaderboard, sonst die Qualifizierten der Vorrunde mit
 *    /api/qualifikation), "Generate map" / "Finish map" von Noble Practice (/api/noble-karte, mit Rueckfrage und Liste der Noble-Spieltage),
 *    Formen zeichnen (Rechteck, freie Form), verschieben, Ecken ziehen, loeschen, Strg+Z, Teams per Drag & Drop setzen, Team von Hand mit
 *    Vorschlaegen (/api/szene-stats?ansicht=suche), Namen und Flaggen pflegen (/api/spieler-profile), Vorlage einfuegen (Strg+V) und Spieler daraus
 *    lesen (Texterkennung + /api/karten/namen), Kartenbild waehlen/hochladen/umbenennen (/api/karten-bild), Reload-Inseln zuordnen, Karte
 *    sperren, als Bild kopieren, speichern/veroeffentlichen (/api/turnier-karten, POST mit Basisstand -> 409 bei neuerem Stand), sich selbst
 *    sichern, Formvorlage je Kartenbild (/api/karten-vorlage), gespeicherte Karten ein-/ausblenden (PATCH) und loeschen (DELETE).
 *  - Pro/Manager, dessen Team auf der Karte steht: sich selbst auf eine Form ziehen oder herunternehmen (/api/turnier-karten/mich).
 *  - Alle: der Stand wandert live mit (EventSource /api/turnier-karten/live, Netz: ?nur=stand alle 20 s).
 */

interface KTeam { id: string; spieler: string[]; farbe: string; ids?: string[]; quelle?: 'noble' }
interface Fenster { status: string; begin: number; end?: number; eventId: string; windowId: string; region: string; istFinale: boolean; playlist?: string }
interface Cup { id: string; titel: string; art: string; global: boolean; regionen: Record<string, Fenster[]> }
interface GKarte {
  id: string; titel: string; spots: Spot[]; teams: KTeam[]; namenSichtbar?: boolean; gesperrt?: boolean; geaendert: number; bildId?: string; bildTitel?: string;
  bildAutomatisch?: boolean; spiele?: string; eventId?: string; windowId?: string; oeffentlich?: boolean; cupTitel?: string; cupId?: string; region?: string;
}
interface Kartenbild { id: string; titel: string; hochgeladen?: number }
interface Profil { anzeige?: string; land?: string; x?: string; region?: string; name?: string; namen?: string[] }
interface Fund { roh: string; name: string; land: string; epicId: string; guete: number; x: number; y: number; wert: number; nehmen: boolean }
type NobleTag = { turnierId: string; turnier: string; region: string; windowId: string; name: string; start: string | null };

const KARTEN_REGIONEN = ['EU', 'NAC'];
const NACHLAUF_MS = 30 * 60_000, RUHIG_MS = 5 * 60_000, SCHNELL_MS = 30_000;
const tagKurz = (ms: number | string) => new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
const kartenAbdruck = (spots: Spot[]) => JSON.stringify(spots.map((s) => [s.punkte, s.teams]));
const gleichesTeam = (a: KTeam, b: KTeam) => a.id === b.id || (a.ids ?? []).some((x) => x && (b.ids ?? []).includes(x));

/** Hoechstens so viele Teams, wie in ein Spiel passen (bzw. sich qualifizieren) - wer auf einer Form steht, bleibt; dann Noble, dann Rangliste. */
function begrenzeTeams(liste: KTeam[], platziert: Set<string>, qualifiziert = 0): KTeam[] {
  const groesse = Math.max(0, ...liste.map((t) => t.spieler.length));
  const platz = groesse ? Math.floor(100 / groesse) : 0;
  const grenze = qualifiziert > 0 ? Math.max(Math.min(qualifiziert, platz || qualifiziert), platziert.size) : platz;
  if (!grenze || liste.length <= grenze) return liste;
  const rang = (t: KTeam) => (platziert.has(t.id) ? 0 : t.quelle === 'noble' ? 1 : 2);
  const behalten = new Set(liste.map((t, i) => ({ t, i })).sort((a, b) => rang(a.t) - rang(b.t) || a.i - b.i).slice(0, grenze).map((x) => x.t.id));
  return liste.filter((t) => behalten.has(t.id));
}
/** Alte Karten mit Platznummern ("t18") auf Konto-Schluessel heben - nie zwei Teams verschmelzen. */
function migriereZuordnung(k: { spots?: Spot[]; teams?: KTeam[] }): { spots: Spot[]; teams: KTeam[] } {
  const teams = k.teams ?? [];
  const zaehler = new Map<string, number>();
  for (const t of teams) { const s = kontoSchluessel(t.ids); if (s) zaehler.set(s, (zaehler.get(s) ?? 0) + 1); }
  const neu = new Map<string, string>();
  for (const t of teams) { const s = kontoSchluessel(t.ids); neu.set(t.id, s && zaehler.get(s) === 1 ? s : t.id); }
  return {
    teams: teams.map((t) => ({ ...t, id: neu.get(t.id) ?? t.id })),
    spots: (k.spots ?? []).map((s) => ({ ...s, teams: (s.teams ?? []).map((id) => neu.get(id) ?? id) })),
  };
}
function finaleFenster(c: Cup | undefined): (Fenster & { region: string }) | null {
  if (!c) return null;
  const finals = Object.entries(c.regionen).flatMap(([region, l]) => l.map((f) => ({ ...f, region }))).filter((f) => f.istFinale);
  return finals.find((f) => f.region === 'EU') ?? finals[0] ?? null;
}

const feldKlasse = 'mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-sky-400/60';
const knopfHell = 'rounded-xl bg-sky-400 px-4 py-2 text-sm font-bold text-[#06080f] transition hover:bg-sky-300 disabled:opacity-40';
const knopfLeise = 'rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/80 transition hover:border-sky-400/50 hover:text-white disabled:opacity-40';
const etikett = 'block text-[10px] font-bold uppercase tracking-[0.2em] text-white/40';

function Hinweis({ farbe = 'sky', kind, zu }: { farbe?: 'sky' | 'amber' | 'emerald' | 'rose'; kind: ReactNode; zu?: () => void }) {
  const f = { sky: 'border-sky-400/30 bg-sky-400/[0.06] text-sky-100', amber: 'border-amber-400/30 bg-amber-400/[0.07] text-amber-100', emerald: 'border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-100', rose: 'border-rose-400/30 bg-rose-400/[0.07] text-rose-100' }[farbe];
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm backdrop-blur-xl ${f}`}>
      <div className="min-w-0 flex-1">{kind}</div>
      {zu && <button type="button" onClick={zu} title="Close" className="shrink-0 text-white/50 transition hover:text-white">×</button>}
    </motion.div>
  );
}

export default function KartenWerkzeug() {
  const [adresse] = useSearchParams();
  const { wer } = useWer();
  const istAdmin = !!wer?.isAdmin;
  const meinEpic = wer?.epicId ?? null;
  const meineRolle = wer?.rolle ?? null;

  const [linkKarte, setLinkKarte] = useState<string | null>(() => adresse.get('id'));
  const direkt = Boolean(linkKarte);
  const [stand, setStand] = useState<{ stand: string | null; tageAlt: number | null } | null>(null);
  const [gespeicherte, setGespeicherte] = useState<GKarte[]>([]);
  const [titel, setTitel] = useState('New tournament map');
  const [spots, setSpots] = useState<Spot[]>([]);
  const [teams, setTeams] = useState<KTeam[]>([]);
  const [gesperrt, setGesperrt] = useState(false);
  const [werkzeug, setWerkzeug] = useState<Form | null>(null);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [cups, setCups] = useState<Cup[]>([]);
  const [cupSuche, setCupSuche] = useState('');
  const [cupOffen, setCupOffen] = useState(false);
  const [spiele, setSpiele] = useState('');
  const [cupId, setCupId] = useState('');
  const [fensterId, setFensterId] = useState('');
  const [laedtTeams, setLaedtTeams] = useState(false);
  const [nobleLaeuft, setNobleLaeuft] = useState(false);
  const [nobleListe, setNobleListe] = useState<NobleTag[] | null>(null);
  const [nobleMeldung, setNobleMeldung] = useState<{ art: 'ok' | 'nichts' | 'leer' | 'fehler'; text: string } | null>(null);
  const [nobleFrage, setNobleFrage] = useState<{ text: string; anwenden: () => void } | null>(null);
  const [teamGrenze, setTeamGrenze] = useState(0);
  const qualZahl = useRef(0);
  const generiert = useRef('');
  const [status, setStatus] = useState('');
  const [ausErsatz, setAusErsatz] = useState(false);
  const standVon = useRef(new Map<string, number>());
  const merkeStaende = (l: Array<{ id: string; geaendert?: number }>) => { for (const k of l) if (k.geaendert) standVon.current.set(k.id, k.geaendert); };
  const [veraltet, setVeraltet] = useState(false);
  const speicherLauf = useRef<Promise<void>>(Promise.resolve());
  const [bildStand, setBildStand] = useState(0);
  const [bilder, setBilder] = useState<Kartenbild[]>([]);
  const [inseln, setInseln] = useState<Record<string, string>>({});
  const bildVonHandFuer = useRef('');
  const [bildId, setBildId] = useState('');
  const [neuerTitel, setNeuerTitel] = useState('');
  const [ausTurnier, setAusTurnier] = useState<string | null>(null);
  const [pause, setPause] = useState<string | null>(null);
  const [pauseKlar, setPauseKlar] = useState(55);
  const vorlageGeladen = useRef(false);
  const formenVomNutzer = useRef(false);
  const inhaltVomNutzer = useRef(false);
  const titelVomNutzer = useRef(false);
  const rueckgaengig = useRef<Spot[][]>([]);
  const spotsJetzt = useRef<Spot[]>([]);
  useEffect(() => { spotsJetzt.current = spots; }, [spots]);
  const gezogen = useRef<string | null>(null);
  const [selbstGesichert, setSelbstGesichert] = useState<number | null>(null);
  const spotsFuer = useRef<string | null>(null);
  const [veroeffentlicht, setVeroeffentlicht] = useState<{ id: string; cup: string | null; spieltag: string | null } | null>(null);
  const [profile, setProfile] = useState<Record<string, Profil>>({});
  const [flaggen, setFlaggen] = useState<string[]>([]);
  const [landEntwurf, setLandEntwurf] = useState<string[]>([]);
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  const [eigenesTeam, setEigenesTeam] = useState('');
  const [vorschlaege, setVorschlaege] = useState<Array<{ name: string; land: string; epicId: string }>>([]);
  const [lesen, setLesen] = useState('');
  const [funde, setFunde] = useState<Fund[] | null>(null);
  const [alsTeams, setAlsTeams] = useState(true);
  const [aufFormen, setAufFormen] = useState(true);
  const [formenAnlegen, setFormenAnlegen] = useState(false);
  const [ruecknahme, setRuecknahme] = useState<{ spots: Spot[]; teamIds: string[]; anzahl: number; neueFormen: number } | null>(null);
  const [teamSuche, setTeamSuche] = useState('');
  const [entwurf, setEntwurf] = useState('');
  const [bearbeitenAn, setBearbeitenAn] = useState(false);
  const [benennt, setBenennt] = useState<string | null>(null);
  const [benenntTitel, setBenenntTitel] = useState('');
  const [voll, setVoll] = useState(false);
  const [hervor, setHervor] = useState<string | null>(null);
  const huelle = useRef<HTMLDivElement | null>(null);
  const bildRef = useRef<HTMLImageElement | null>(null);
  const steuerung = useRef<Steuerung | null>(null);
  const cupsRef = useRef<Cup[]>([]);
  const gespeicherteRef = useRef<GKarte[]>([]);
  const direktGesetzt = useRef(false);
  const zuletztGeholt = useRef<string | null>(null);
  const spotsAktuell = useRef<Spot[]>([]);
  useEffect(() => { spotsAktuell.current = spots; });

  const darfBauen = istAdmin && !gesperrt && (!ausTurnier || bearbeitenAn || direkt);

  const merke = useCallback(() => {
    const st = rueckgaengig.current;
    if (st[st.length - 1] !== spotsJetzt.current) st.push(spotsJetzt.current);
    if (st.length > 60) st.shift();
  }, []);

  /* Strg+Z holt den zuletzt gemerkten Stand zurueck (Formen samt Teams); Esc beendet das Zeichnen. */
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setWerkzeug(null); return; }
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
      const ziel = e.target as HTMLElement | null;
      if (ziel && (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA' || ziel.isContentEditable)) return;
      if (!darfBauen) return;
      e.preventDefault();
      const vorher = rueckgaengig.current.pop();
      if (!vorher) { setStatus('Nothing left to undo'); return; }
      formenVomNutzer.current = true; inhaltVomNutzer.current = true;
      setSpots(vorher);
      setGewaehlt((g) => (g && !vorher.some((s) => s.id === g) ? null : g));
      setStatus('Undone');
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [darfBauen]);
  useEffect(() => { rueckgaengig.current = []; }, [ausTurnier, fensterId]);

  useEffect(() => {
    const w = () => setVoll(document.fullscreenElement !== null && document.fullscreenElement === huelle.current);
    document.addEventListener('fullscreenchange', w);
    return () => document.removeEventListener('fullscreenchange', w);
  }, []);

  const meinTeam = useMemo(() => (meinEpic ? teams.find((t) => (t.ids ?? []).includes(meinEpic)) ?? null : null), [teams, meinEpic]);
  const darfMichSetzen = Boolean(meinTeam) && !gesperrt && !istAdmin && (meineRolle === 'pro' || meineRolle === 'manager');
  const meinSpot = useMemo(() => (meinTeam ? spots.find((s) => s.teams.includes(meinTeam.id)) ?? null : null), [spots, meinTeam]);

  /* Der Stand wandert mit (nur wer nicht gerade baut): offene Leitung, dazu alle 20 s und beim Sichtbarwerden nachfragen. */
  useEffect(() => {
    if (!ausTurnier || darfBauen) return undefined;
    let lebt = true; let letzte = 0;
    const uebernimm = (j: { geaendert?: number; titel?: string; spiele?: string; bildId?: string; gesperrt?: boolean; spots?: Spot[]; teams?: KTeam[] }) => {
      if (!j.spots || !j.teams) return;
      letzte = j.geaendert ?? letzte;
      const zusammen = <X extends { id: string }>(alt: X[], frisch: X[]) => {
        const neu = frisch.map((f) => { const a = alt.find((x) => x.id === f.id); return a && JSON.stringify(a) === JSON.stringify(f) ? a : f; });
        return alt.length !== frisch.length || neu.some((x, i) => x !== alt[i]) ? neu : alt;
      };
      setSpots((alt) => zusammen(alt, j.spots!)); setTeams((alt) => zusammen(alt, j.teams!));
      if (j.titel) setTitel(j.titel);
      if (j.spiele !== undefined) setSpiele(j.spiele);
      if (j.bildId !== undefined) setBildId(j.bildId);
      if (j.gesperrt !== undefined) setGesperrt(j.gesperrt);
    };
    const abgleichen = async () => {
      try {
        const r = await fetch(`/api/turnier-karten?id=${encodeURIComponent(ausTurnier)}&nur=stand&seit=${letzte}`, { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        if (lebt && !j.unveraendert) uebernimm(j);
      } catch { /* naechster Takt */ }
    };
    let quelle: EventSource | null = null;
    try {
      quelle = new EventSource(`/api/turnier-karten/live?id=${encodeURIComponent(ausTurnier)}`);
      quelle.onmessage = (e) => { if (lebt) { try { uebernimm(JSON.parse(e.data)); } catch { /* halbe Nachricht */ } } };
      quelle.onerror = () => { /* verbindet von selbst neu */ };
    } catch { /* dann nur der Takt */ }
    void abgleichen();
    const uhr = setInterval(() => { if (document.visibilityState === 'visible') void abgleichen(); }, 20_000);
    const sicht = () => { if (document.visibilityState === 'visible') void abgleichen(); };
    document.addEventListener('visibilitychange', sicht);
    return () => { lebt = false; clearInterval(uhr); quelle?.close(); document.removeEventListener('visibilitychange', sicht); };
  }, [ausTurnier, darfBauen]);

  const offeneKarte = useMemo(() => (linkKarte ? gespeicherte.find((k) => k.id === linkKarte) ?? null : null), [linkKarte, gespeicherte]);
  const geschwister = useMemo(() => (offeneKarte?.windowId ? gespeicherte.filter((k) => k.eventId === offeneKarte.eventId && k.windowId === offeneKarte.windowId) : []), [offeneKarte, gespeicherte]);

  const cup = cups.find((c) => c.id === cupId);
  const fenster = useMemo(() => (cup ? Object.entries(cup.regionen).flatMap(([region, l]) => l.map((f) => ({ ...f, region }))) : []), [cup]);

  /** Eine gespeicherte Zuordnung desselben Spieltags und Kartenbildes zurueckholen - oder die Spieler leeren. */
  const stelleWiederHer = useCallback((windowId: string, bildKennung: string, liste: GKarte[], bekannt?: Fenster & { region: string }) => {
    if (ausTurnier) return;
    const f = bekannt ?? fenster.find((x) => x.windowId === windowId);
    if (!f) return;
    const t = liste.filter((k) => k.eventId === f.eventId && k.windowId === f.windowId && (k.bildId ?? '') === bildKennung).sort((a, b) => (b.geaendert ?? 0) - (a.geaendert ?? 0))[0];
    if (!t) {
      if (zuletztGeholt.current !== null) {
        zuletztGeholt.current = null;
        setSpots((alt) => alt.map((sp) => (sp.teams.length ? { ...sp, teams: [] } : sp))); setTeams([]); setGewaehlt(null);
      }
      return;
    }
    if (t.id === zuletztGeholt.current) return;
    zuletztGeholt.current = t.id;
    setGewaehlt(null);
    const g = migriereZuordnung(t);
    setSpots(g.spots); setTeams(g.teams);
    setStatus(`Saved assignment from ${new Date(t.geaendert).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} loaded`);
  }, [ausTurnier, fenster]);
  const stelleRef = useRef(stelleWiederHer);
  useEffect(() => { stelleRef.current = stelleWiederHer; });

  /** Direktlink auf einen Spieltag (?event=&window=) - genau einmal, sobald Cups und Karten da sind. */
  const pruefeDirektlink = useCallback((alleCups: Cup[], liste: GKarte[]) => {
    if (direktGesetzt.current || !alleCups.length) return;
    const ev = adresse.get('event'), w = adresse.get('window');
    if (!ev || !w) return;
    const c = alleCups.find((x) => Object.values(x.regionen).some((l) => l.some((f) => f.eventId === ev && f.windowId === w)));
    if (!c) return;
    direktGesetzt.current = true;
    const f = Object.entries(c.regionen).flatMap(([region, l]) => l.map((x) => ({ ...x, region }))).find((x) => x.windowId === w);
    setCupId(c.id); setFensterId(w);
    if (!titelVomNutzer.current) setTitel(kartenTitel(c.titel, f) || 'New tournament map');
    if (f) setTimeout(() => stelleRef.current(w, '', liste, f), 0);
  }, [adresse]);

  /* Alles Grundlegende laden - nur lesende Abrufe. */
  useEffect(() => {
    fetch('/api/fortnite-map').then((r) => r.json()).then(setStand).catch(() => { /* ohne Stand */ });
    fetch('/api/cup-catalog?modus=alle').then((r) => r.json()).then((d) => { const a: Cup[] = d.cups ?? []; setCups(a); cupsRef.current = a; pruefeDirektlink(a, gespeicherteRef.current); }).catch(() => { /* ohne Cups */ });
    fetch('/api/spieler-profile').then((r) => r.json()).then((j) => setProfile(j.profile ?? {})).catch(() => { /* ohne Profile */ });
    fetch('/api/karten-bild').then((r) => r.json()).then((d) => { setBilder(d.karten ?? []); setInseln(d.inseln ?? {}); }).catch(() => { /* ohne Bilder */ });
    fetch('/api/flaggen').then((r) => r.json()).then((j) => setFlaggen(j.flaggen ?? [])).catch(() => { /* ohne Flaggen */ });
    fetch('/api/turnier-karten', { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      const liste: GKarte[] = d.karten ?? [];
      setAusErsatz(!!d.ersatz); merkeStaende(liste); setGespeicherte(liste); gespeicherteRef.current = liste;
      pruefeDirektlink(cupsRef.current, liste);
      const gesucht = adresse.get('id');
      if (!gesucht) { vorlageGeladen.current = false; return; }
      const k = liste.find((x) => x.id === gesucht);
      if (!k) { setLinkKarte(null); vorlageGeladen.current = false; setStatus('This map does not exist (any more).'); return; }
      const g = migriereZuordnung(k);
      setTitel(k.titel); setSpots(g.spots); setTeams(g.teams); setGesperrt(k.gesperrt ?? false); setBildId(k.bildId ?? ''); setSpiele(k.spiele ?? '');
      setAusTurnier(k.id);
      if (k.windowId) setFensterId(k.windowId);
      if (k.cupId) setCupId(k.cupId);
      vorlageGeladen.current = true;
      spotsFuer.current = k.bildId || 'fortnite-karte';
    }).catch(() => setLinkKarte(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Ohne Turnierkarte: die Formvorlage des Kartenbildes holen (Zuordnungen bleiben, sofern die Form noch da ist). */
  useEffect(() => {
    if (ausTurnier || linkKarte) return undefined;
    let weg = false;
    const schluessel = bildId || 'fortnite-karte';
    fetch(`/api/karten-vorlage?bild=${encodeURIComponent(schluessel)}`).then((r) => r.json()).then((d) => {
      if (weg) return;
      setSpots((vorher) => { const drauf = new Map(vorher.map((sp) => [sp.id, sp.teams])); return (d.spots ?? []).map((sp: Spot) => ({ ...sp, teams: drauf.get(sp.id) ?? [] })); });
      setGewaehlt(null); spotsFuer.current = schluessel; vorlageGeladen.current = true;
    }).catch(() => { vorlageGeladen.current = true; });
    return () => { weg = true; };
  }, [bildId, ausTurnier, linkKarte]);

  /* Selbst geaenderte Formen wandern in die Vorlage des Kartenbildes (nie eine leere Liste, nie die Formen eines anderen Bildes). */
  useEffect(() => {
    if (!istAdmin || !vorlageGeladen.current || !formenVomNutzer.current) return undefined;
    const schluessel = bildId || 'fortnite-karte';
    if (spotsFuer.current !== schluessel || !spots.length) return undefined;
    const uhr = setTimeout(() => {
      formenVomNutzer.current = false;
      fetch('/api/karten-vorlage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bild: schluessel, spots }) }).catch(() => { /* naechstes Mal */ });
    }, 800);
    return () => clearTimeout(uhr);
  }, [spots, bildId, istAdmin]);

  const cupListe = useMemo(() => {
    const aufbereitet = cups.map((c) => {
      const alle = Object.values(c.regionen).flat();
      const termine = alle.map((f) => f.begin).sort((a, b) => a - b);
      const von = termine[0] ?? 0, bis = termine[termine.length - 1] ?? 0;
      const laeuft = alle.some((f) => f.status === 'live');
      const vorbei = alle.length > 0 && alle.every((f) => f.status === 'vorbei');
      const zeitraum = !von ? '' : von === bis ? tagKurz(von) : `${tagKurz(von)}–${tagKurz(bis)}`;
      return { cup: c, laeuft, vorbei, von, bis, etikett: `${laeuft ? '● ' : ''}${c.titel}${zeitraum ? ` · ${zeitraum}` : ''}`, heu: `${c.titel} ${c.id} ${c.art} ${zeitraum}`.toLowerCase() };
    });
    const q = cupSuche.trim().toLowerCase();
    const gefiltert = q ? aufbereitet.filter((x) => q.split(/\s+/).every((w) => x.heu.includes(w))) : aufbereitet;
    const rang = (x: typeof aufbereitet[number]) => (x.laeuft ? 0 : x.vorbei ? 2 : 1);
    return gefiltert.sort((a, b) => rang(a) - rang(b) || (rang(a) === 2 ? b.bis - a.bis : a.von - b.von));
  }, [cups, cupSuche]);
  const gewaehlterCupText = cupListe.find((x) => x.cup.id === cupId)?.etikett ?? cup?.titel ?? '';

  /* Das passende Kartenbild zum Spieltag von selbst: gespeicherte Karte, sonst die Insel aus Epics Playlist (Reload-Bild nachholen). */
  const inselnUnterwegs = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!fensterId || ausTurnier || bildVonHandFuer.current === fensterId) return;
    const f = fenster.find((x) => x.windowId === fensterId);
    if (!f) return;
    const karte = gespeicherte.filter((k) => k.windowId === f.windowId && k.eventId === f.eventId).sort((a, b) => (b.geaendert ?? 0) - (a.geaendert ?? 0))[0];
    const darfFolgen = karte?.bildAutomatisch && f.begin > Date.now() && !karte.spots.some((sp) => sp.teams?.length);
    let ziel: string | null;
    if (karte && !darfFolgen) ziel = karte.bildId ?? '';
    else {
      const insel = inselAusPlaylist(f.playlist);
      ziel = insel.art === 'br' ? brBildFuer(inseln, f.windowId) : insel.art === 'reload' && insel.schluessel ? (inseln[insel.schluessel] ?? null) : null;
      if (ziel === null && insel.art === 'reload' && insel.schluessel && !inselnUnterwegs.current.has(insel.schluessel)) {
        const code = insel.schluessel; inselnUnterwegs.current.add(code);
        void fetch(`/api/karten-bild?insel=${encodeURIComponent(code)}`).then((r) => r.json()).then(async (j) => {
          if (!j?.ok || !j.bildId) return;
          const liste = await fetch('/api/karten-bild').then((x) => x.json()).catch(() => null);
          if (liste?.karten) setBilder(liste.karten);
          setInseln((alt) => ({ ...alt, ...(liste?.inseln ?? {}), [code]: j.bildId }));
        }).catch(() => { /* von Hand */ });
      }
    }
    if (ziel === null || ziel === bildId) return;
    setBildId(ziel); setBildStand(Date.now());
    stelleWiederHer(f.windowId, ziel, gespeicherte, f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fensterId, inseln, gespeicherte, fenster, ausTurnier]);

  /** Finals der grossen Turniere (EU, NAC), zu denen es noch keine Karte gibt. */
  const offeneFinals = useMemo(() => {
    const alle = cups.filter((c) => istGrossesTurnier(c.titel)).flatMap((c) => Object.entries(c.regionen).flatMap(([region, l]) => l.map((f) => ({ ...f, region, cupTitel: c.titel }))));
    const offen = alle.filter((f) => f.status !== 'vorbei');
    const proTag = new Map<string, typeof offen>();
    for (const f of offen) { const k = `${f.region}|${new Date(f.begin).toDateString()}`; proTag.set(k, [...(proTag.get(k) ?? []), f]); }
    const finals: typeof offen = [];
    for (const l of proTag.values()) { l.sort((a, b) => a.begin - b.begin); l.forEach((f, i) => { if (f.istFinale || (l.length > 1 && i === l.length - 1)) finals.push(f); }); }
    const da = new Set(gespeicherte.map((k) => k.windowId ?? ''));
    return finals.filter((f) => KARTEN_REGIONEN.includes(f.region) && !da.has(f.windowId)).sort((a, b) => a.begin - b.begin);
  }, [cups, gespeicherte]);

  function cupGewaehlt(c: Cup) {
    setCupId(c.id);
    const f = finaleFenster(c);
    setFensterId(f?.windowId ?? '');
    if (!titelVomNutzer.current) setTitel(kartenTitel(c.titel, f) || 'New tournament map');
    if (f) stelleWiederHer(f.windowId, bildId, gespeicherte, f);
  }

  const vorrundeZu = useCallback((windowId: string) => {
    const d = fenster.find((x) => x.windowId === windowId);
    if (!d) return null;
    return fenster.filter((x) => x.region === d.region && x.begin < d.begin).sort((a, b) => b.begin - a.begin)[0] ?? null;
  }, [fenster]);

  /** Teams aus der Rangliste - hat das Finale noch keine, die Qualifizierten der Vorrunde. */
  const ladeTeams = useCallback(async () => {
    const f = fenster.find((x) => x.windowId === fensterId);
    if (!f) return;
    setLaedtTeams(true); setStatus('');
    try {
      const grenze = teamGrenze > 0 ? Math.max(1, Math.min(500, teamGrenze)) : 100;
      const hol = async (ev: string, w: string) => {
        const a = await fetch(`/api/cup-leaderboard?event=${encodeURIComponent(ev)}&window=${encodeURIComponent(w)}&limit=${grenze}`);
        const b = await a.json();
        if (!a.ok) throw new Error(b.error ?? 'Leaderboard not available');
        return (b.entries ?? []) as Array<{ rank: number; players?: Array<{ name: string; id?: string }> }>;
      };
      let roh = await hol(f.eventId, f.windowId);
      let ausVorrunde = false; qualZahl.current = 0;
      if (!roh.length) {
        const vor = vorrundeZu(f.windowId);
        if (vor) {
          roh = await hol(vor.eventId, vor.windowId); ausVorrunde = roh.length > 0;
          const q = await fetch(`/api/qualifikation?window=${encodeURIComponent(vor.windowId)}&region=${encodeURIComponent(vor.region ?? 'EU')}`).then((x) => x.json()).catch(() => null);
          qualZahl.current = Number(q?.schwelle) || 0;
        }
      }
      const alle: KTeam[] = roh.map((e, i) => {
        const ids = (e.players ?? []).map((p) => p.id ?? '');
        return { id: kontoSchluessel(ids) ?? `t${e.rank}`, spieler: (e.players ?? []).map((p) => profile[p.id ?? '']?.anzeige || p.name), ids, farbe: FARBEN[i % FARBEN.length] };
      }).filter((t) => t.spieler.length);
      const groesse = Math.max(0, ...alle.map((t) => t.spieler.length));
      const platz = Math.max(1, Math.floor(100 / (groesse || 1)));
      const liste = teamGrenze > 0 || !groesse ? alle : alle.slice(0, qualZahl.current > 0 ? Math.min(qualZahl.current, platz) : platz);
      setTeams((alt) => {
        const noble = alt.filter((t) => t.quelle === 'noble');
        if (!noble.length) return liste;
        const gemerkt = liste.map((t) => (noble.some((n) => gleichesTeam(n, t)) ? { ...t, quelle: 'noble' as const } : t));
        const zusammen = [...gemerkt, ...noble.filter((n) => !liste.some((t) => gleichesTeam(n, t)))];
        return teamGrenze > 0 ? zusammen : begrenzeTeams(zusammen, new Set(spotsAktuell.current.flatMap((sp) => sp.teams)), qualZahl.current);
      });
      setStatus(liste.length ? `${liste.length} teams loaded${ausVorrunde ? ` — the best ${liste.length} of the previous round` : ''}` : 'No results yet');
    } catch (e) { setStatus((e as Error).message); } finally { setLaedtTeams(false); }
  }, [fenster, fensterId, profile, teamGrenze, vorrundeZu]);

  /** "Generate map" / "Finish map": Formen und Spieler des Spieltags von Noble Practice - ersetzt nach Rueckfrage die Karte (Strg+Z zurueck). */
  const generiereKarte = useCallback(async (manuell?: { windowId: string; turnierId: string; region: string }) => {
    if (!fensterId) return;
    setNobleLaeuft(true); setStatus(''); setNobleMeldung(null); setNobleListe(null); setNobleFrage(null);
    try {
      const dieser = fenster.find((x) => x.windowId === fensterId);
      const wunsch = `&titel=${encodeURIComponent(cup?.titel ?? '')}&begin=${dieser?.begin ?? ''}`;
      const q = manuell ? `window=${encodeURIComponent(manuell.windowId)}&turnier=${encodeURIComponent(manuell.turnierId)}&region=${encodeURIComponent(manuell.region)}` : `window=${encodeURIComponent(fensterId)}${wunsch}`;
      const r = await fetch(`/api/noble-karte?${q}`, { cache: 'no-store' });
      const j = await r.json().catch(() => { throw new Error('The server did not answer (it may be restarting) — please try again in a minute.'); }) as {
        ok?: boolean; error?: string; nichtGefunden?: boolean; turnier?: { name: string }; fenster?: { name: string };
        formen?: Array<{ punkte: Punkt[]; teams: Array<{ ids: string[]; namen: string[] }> }>; ohneForm?: Array<{ ids: string[]; namen: string[] }>; quelle?: 'noble' | 'vital';
      };
      if (!r.ok || !j.ok) {
        if (j.nichtGefunden) {
          const l = await fetch(`/api/noble-karte?liste=1${wunsch}`, { cache: 'no-store' }).catch(() => null);
          const lj = l ? await l.json().catch(() => null) as { fenster?: NobleTag[] } | null : null;
          setNobleListe(lj?.fenster ?? []); setNobleMeldung({ art: 'nichts', text: '' });
          return;
        }
        throw new Error(r.status === 403 ? 'Only an admin can fetch Noble maps.' : j.error ?? 'Noble is not reachable');
      }
      const neueTeams: KTeam[] = []; const genutzt = new Set<string>();
      const finde = (ids: string[]) => { const s = kontoSchluessel(ids); const passt = (t: KTeam) => t.id === s || (t.ids ?? []).some((x) => x && ids.includes(x)); return teams.find(passt) ?? neueTeams.find(passt); };
      const wieNoble = (e: { ids: string[]; namen: string[] }): KTeam => {
        let t = finde(e.ids);
        if (!t) {
          t = { id: kontoSchluessel(e.ids) ?? `noble-${e.ids.join('_')}`, spieler: e.namen.map((n, i) => profile[e.ids[i] ?? '']?.anzeige || n), ids: e.ids, farbe: FARBEN[(teams.length + neueTeams.length) % FARBEN.length], quelle: 'noble' };
          neueTeams.push(t);
        }
        genutzt.add(t.id); return t;
      };
      const jetzt = Date.now().toString(36); let eingetragen = 0;
      const neueSpots: Spot[] = (j.formen ?? []).map((fo, i) => {
        const xs = [...new Set(fo.punkte.map((p) => p.x))], ys = [...new Set(fo.punkte.map((p) => p.y))];
        const recht = fo.punkte.length === 4 && xs.length === 2 && ys.length === 2;
        const ids = fo.teams.map((e) => wieNoble(e).id); eingetragen += ids.length;
        return { id: `noble-${jetzt}-${i}`, form: recht ? 'rechteck' : 'polygon', punkte: recht ? rechteckPunkte({ x: Math.min(...xs), y: Math.min(...ys) }, { x: Math.max(...xs), y: Math.max(...ys) }) : fo.punkte, teams: ids, quelle: j.quelle === 'vital' ? 'vital' : 'noble' };
      });
      if (!neueSpots.length) { setNobleMeldung({ art: 'leer', text: 'Noble knows this match day but has no shapes yet — the map stays as it is.' }); return; }
      for (const e of j.ohneForm ?? []) wieNoble(e);
      const anwenden = () => {
        merke(); formenVomNutzer.current = false; inhaltVomNutzer.current = true;
        generiert.current = kartenAbdruck(neueSpots);
        setSpots(neueSpots);
        setTeams((alt) => {
          const zusammen = [...alt.filter((t) => t.quelle !== 'noble' || genutzt.has(t.id)).map((t) => (genutzt.has(t.id) && t.quelle !== 'noble' ? { ...t, quelle: 'noble' as const } : t)), ...neueTeams.filter((n) => !alt.some((t) => t.id === n.id))];
          return teamGrenze > 0 ? zusammen : begrenzeTeams(zusammen, new Set(neueSpots.flatMap((sp) => sp.teams)), qualZahl.current);
        });
        setNobleFrage(null);
        setNobleMeldung({ art: 'ok', text: `${neueSpots.length} shapes taken from Noble, ${eingetragen} teams placed${neueTeams.length ? ` · ${neueTeams.length} not in your list, added from Noble` : ''}` });
      };
      if (spots.length) {
        setNobleFrage({ text: `Noble (${[j.turnier?.name, j.fenster?.name].filter(Boolean).join(' · ')}): ${neueSpots.length} shapes, ${genutzt.size} teams. The ${spots.length} shapes and assignments of this map will be replaced — Ctrl+Z brings them back.`, anwenden });
        return;
      }
      anwenden();
    } catch (e) { setNobleMeldung({ art: 'fehler', text: (e as Error).message }); } finally { setNobleLaeuft(false); }
  }, [fensterId, fenster, cup, spots, teams, profile, merke, teamGrenze]);

  /* Waehrend des Cups (bis 30 min danach) die Teams nachziehen: alle 5 min vorher, alle 30 s waehrenddessen. */
  const ladeTeamsRef = useRef(ladeTeams);
  useEffect(() => { ladeTeamsRef.current = ladeTeams; }, [ladeTeams]);
  const teamsDa = teams.length > 0;
  useEffect(() => {
    if (!fensterId || gesperrt) return undefined;
    const f = fenster.find((x) => x.windowId === fensterId);
    if (!f || typeof f.end !== 'number') return undefined;
    const schluss = f.end + NACHLAUF_MS;
    if (Date.now() >= schluss) return undefined;
    if (!teamsDa) void ladeTeamsRef.current();
    let uhr: ReturnType<typeof setTimeout>;
    const runde = () => {
      const jetzt = Date.now(); if (jetzt >= schluss) return;
      uhr = setTimeout(() => { void ladeTeamsRef.current(); runde(); }, Math.min(jetzt >= f.begin ? SCHNELL_MS : RUHIG_MS, Math.max(1000, schluss - jetzt)));
    };
    runde();
    return () => clearTimeout(uhr);
  }, [fensterId, fenster, gesperrt, teamsDa]);

  /* Vorschlaege beim Tippen eines Teams von Hand (mit Flagge und Konto). */
  const angefangen = (eigenesTeam.split(/[&,/]/).pop() ?? '').trim();
  useEffect(() => {
    if (angefangen.length < 2) { setVorschlaege([]); return undefined; }
    let lebt = true;
    const uhr = setTimeout(() => {
      fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(angefangen)}`).then((r) => r.json()).then((j) => {
        if (!lebt) return;
        setVorschlaege((j.spieler ?? []).slice(0, 6).map((sp: { anzeige?: string; name?: string; land?: string; epicId?: string }) => ({ name: sp.anzeige || sp.name || '', land: sp.land ?? '', epicId: sp.epicId ?? '' })).filter((x: { name: string }) => x.name));
      }).catch(() => { /* ohne Vorschlaege */ });
    }, 250);
    return () => { lebt = false; clearTimeout(uhr); };
  }, [angefangen]);
  const vorschlagNehmen = (name: string) => {
    setEigenesTeam((alt) => {
      const st = alt.split(/([&,/])/);
      for (let i = st.length - 1; i >= 0; i -= 1) if (!/^[&,/]$/.test(st[i])) { st[i] = ` ${name}`; break; }
      return st.join('').replace(/^\s+/, '');
    });
    setVorschlaege([]);
  };
  const teamEintragen = () => {
    const namen = eigenesTeam.split(/[&,/]|\s+\+\s+/).map((x) => x.trim()).filter(Boolean).slice(0, 4);
    if (!namen.length) return;
    const s = namen.map((n) => n.toLowerCase()).sort().join('|');
    if (teams.some((t) => t.spieler.map((n) => n.toLowerCase()).sort().join('|') === s)) { setStatus('This team is already in the list.'); return; }
    const ids = namen.map((n) => vorschlaege.find((v) => v.name.toLowerCase() === n.toLowerCase())?.epicId ?? '');
    inhaltVomNutzer.current = true;
    setTeams((alt) => [...alt, { id: kontoSchluessel(ids) ?? `hand-${Date.now().toString(36)}-${alt.length}`, spieler: namen, ...(ids.some(Boolean) ? { ids } : {}), farbe: FARBEN[alt.length % FARBEN.length] }]);
    setEigenesTeam(''); setStatus(`${namen.join(' & ')} added`);
  };

  /* Vorlage: Bild einfuegen (Strg+V, Datei oder hineinziehen) - es liegt nur im Browser unter der Karte. */
  const vorlageAus = (datei: File | null | undefined) => {
    if (!datei || !datei.type.startsWith('image/')) return;
    const l = new FileReader(); l.onload = () => { setPause(String(l.result)); setFunde(null); }; l.readAsDataURL(datei);
  };
  useEffect(() => {
    if (!istAdmin) return undefined;
    const rein = (e: ClipboardEvent) => {
      const ziel = e.target as HTMLElement | null;
      if (ziel && /^(INPUT|TEXTAREA)$/.test(ziel.tagName)) return;
      const d = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))?.getAsFile();
      if (!d) return;
      e.preventDefault(); vorlageAus(d);
    };
    window.addEventListener('paste', rein);
    return () => window.removeEventListener('paste', rein);
  }, [istAdmin]);

  /** Spieler aus der Vorlage lesen: Texterkennung, dann die Namen im Archiv suchen - nur Vorschlaege, nichts aendert sich bis "Apply". */
  const bildLesen = async () => {
    if (!pause || lesen) return;
    setFunde(null); setRuecknahme(null); setLesen('Loading text recognition …');
    try {
      const roh = await leseWoerter(pause, (anteil, was) => setLesen(was === 'laden' ? 'Loading text recognition …' : `Reading the image ${Math.round(anteil * 100)} %`));
      if (!roh.length) { setLesen(''); setStatus('No text could be read in the image.'); return; }
      setLesen('Looking the names up in the archive …');
      const antwort = await fetch('/api/karten/namen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ woerter: [...new Set(roh.map((r) => r.text))] }) });
      const erg = await antwort.json() as { treffer?: Array<{ roh: string; name: string; land: string; epicId: string; guete: number }> };
      const zum = new Map((erg.treffer ?? []).map((t) => [t.roh, t]));
      const da = new Set(teams.flatMap((t) => t.ids ?? []).filter(Boolean));
      const beste = new Map<string, Fund>();
      for (const r of roh) {
        const t = zum.get(r.text); if (!t || da.has(t.epicId)) continue;
        const wert = t.guete * 0.75 + (r.guete / 100) * 0.25 + (r.ganzeZeile ? 0.02 : 0);
        const alt = beste.get(t.epicId); if (alt && alt.wert >= wert) continue;
        beste.set(t.epicId, { ...t, x: r.x, y: r.y, wert, nehmen: true });
      }
      const liste = [...beste.values()].sort((a, b) => a.y - b.y || a.x - b.x);
      setFunde(liste.length ? liste : null); setLesen('');
      setStatus(liste.length ? `${liste.length} players found in the image` : 'No name that was read matches an account in the archive.');
    } catch { setLesen(''); setStatus('Text recognition could not be loaded — the browser needs an internet connection once for it.'); }
  };
  const fundeUebernehmen = () => {
    const gew = (funde ?? []).filter((f) => f.nehmen); if (!gew.length) return;
    const proTeam = alsTeams ? (teams[0]?.spieler.length || 3) : 1;
    const gruppen: Fund[][] = [];
    for (const f of [...gew].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const passend = proTeam > 1 ? gruppen.find((g) => g.length < proTeam && g.some((a) => Math.hypot(a.x - f.x, a.y - f.y) <= 5)) : undefined;
      if (passend) passend.push(f); else gruppen.push([f]);
    }
    const neue: KTeam[] = []; const dazu = new Map<string, string[]>(); const frisch: Spot[] = []; const jetzt = Date.now().toString(36);
    gruppen.forEach((g, i) => {
      const ids = g.map((f) => f.epicId); const id = kontoSchluessel(ids) ?? `bild-${jetzt}-${i}`;
      if (teams.some((t) => t.id === id) || neue.some((t) => t.id === id)) return;
      neue.push({ id, spieler: g.map((f) => f.name), ids, farbe: FARBEN[(teams.length + i) % FARBEN.length] });
      if (!aufFormen) return;
      const mx = g.reduce((a, f) => a + f.x, 0) / g.length, my = g.reduce((a, f) => a + f.y, 0) / g.length;
      const form = spots.find((sp) => imPolygon({ x: mx, y: my }, sp.punkte)) ?? spots.find((sp) => g.some((f) => imPolygon(f, sp.punkte)));
      if (form) { if (!form.teams.length && !dazu.has(form.id)) dazu.set(form.id, [id]); return; }
      if (!formenAnlegen) return;
      frisch.push({ id: `bildform-${jetzt}-${i}`, form: 'rechteck', punkte: rechteckPunkte({ x: Math.max(0, mx - 3), y: Math.max(0, my - 2.4) }, { x: Math.min(100, mx + 3), y: Math.min(100, my + 2.4) }), teams: [id] });
    });
    if (!neue.length) { setStatus('These players are already in the list.'); return; }
    setRuecknahme({ spots, teamIds: neue.map((t) => t.id), anzahl: [...dazu.values()].reduce((a, b) => a + b.length, 0) + frisch.length, neueFormen: frisch.length });
    inhaltVomNutzer.current = true; if (frisch.length) formenVomNutzer.current = true;
    setTeams((alt) => [...alt, ...neue]);
    if (dazu.size || frisch.length) setSpots((alt) => [...alt.map((sp) => (dazu.has(sp.id) ? { ...sp, teams: [...sp.teams, ...(dazu.get(sp.id) ?? [])] } : sp)), ...frisch]);
    setFunde(null); setStatus(`${neue.length} teams taken from the image`);
  };
  const leseZuruecknehmen = () => {
    if (!ruecknahme) return;
    const weg = new Set(ruecknahme.teamIds);
    setSpots(ruecknahme.spots); setTeams((alt) => alt.filter((t) => !weg.has(t.id))); setRuecknahme(null); setStatus('Taken back.');
  };

  /* ---------------------------------------------------------------- Teams auf Formen */

  const neueForm = (punkte: Punkt[], form: Form) => {
    merke();
    const id = `s${Date.now().toString(36)}`;
    formenVomNutzer.current = true; inhaltVomNutzer.current = true;
    setSpots((alt) => [...alt, { id, form, punkte, teams: [] }]); setGewaehlt(id);
  };
  const aendern = (f: (alt: Spot[]) => Spot[]) => { formenVomNutzer.current = true; inhaltVomNutzer.current = true; setSpots(f); };
  const teamAufSpot = (teamId: string, spotId: string) => {
    merke(); inhaltVomNutzer.current = true;
    setSpots((alt) => alt.map((s) => (s.id === spotId ? (s.teams.includes(teamId) ? s : { ...s, teams: [...s.teams, teamId] }) : s.teams.includes(teamId) ? { ...s, teams: s.teams.filter((t) => t !== teamId) } : s)));
  };
  const teamAbziehen = (teamId: string) => { merke(); inhaltVomNutzer.current = true; setSpots((alt) => alt.map((s) => ({ ...s, teams: s.teams.filter((t) => t !== teamId) }))); };

  async function michSetzen(spotId: string | null) {
    if (!meinTeam || !ausTurnier) return;
    const vorher = spots;
    setSpots((alt) => alt.map((s) => { const ohne = s.teams.filter((t) => t !== meinTeam.id); return { ...s, teams: s.id === spotId ? [...ohne, meinTeam.id] : ohne }; }));
    try {
      const r = await fetch('/api/turnier-karten/mich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ karte: ausTurnier, spot: spotId }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) { setSpots(vorher); setStatus(j?.error ?? 'Not saved'); return; }
      setStatus(spotId ? 'Your spot is saved' : 'You are no longer on the map');
    } catch { setSpots(vorher); setStatus('Not saved'); }
  }

  const abgelegt = (ziel: Spot | null, key: string, p: Punkt) => {
    if (!darfBauen) {
      if (!darfMichSetzen || !key || key !== meinTeam?.id) return;
      if (ziel) void michSetzen(ziel.id);
      return;
    }
    if (!key) { setStatus('No team arrived on drop'); return; }
    if (ziel) { teamAufSpot(key, ziel.id); setStatus(''); return; }
    setStatus(`There is no shape there — dropped at ${p.x.toFixed(1)} / ${p.y.toFixed(1)} (${spots.length} shapes on the map)`);
  };

  const gewaehlterSpot = spots.find((s) => s.id === gewaehlt) ?? null;
  const muellEimer = () => {
    if (!darfBauen) { setStatus(gesperrt ? 'The map is locked — open the lock first to place teams.' : 'View only — click "Edit this map" to place teams.'); return; }
    if (gewaehlterSpot) {
      merke(); formenVomNutzer.current = true; inhaltVomNutzer.current = true;
      setSpots((alt) => alt.filter((s) => s.id !== gewaehlterSpot.id)); setGewaehlt(null);
      setStatus('Shape deleted — Ctrl+Z brings it back'); return;
    }
    const belegt = spots.reduce((n, s) => n + s.teams.length, 0);
    if (!belegt) { setStatus('Nobody is on the map yet'); return; }
    if (!window.confirm(`Really take all ${belegt} teams off the whole map? The shapes stay.`)) return;
    merke(); inhaltVomNutzer.current = true;
    setSpots((alt) => alt.map((s) => ({ ...s, teams: [] }))); setStatus('All players removed, shapes stay');
  };

  /* ---------------------------------------------------------------- Speichern */

  async function speichern(still = false) {
    const f = fenster.find((x) => x.windowId === fensterId);
    const bildName = bilder.find((b) => b.id === bildId)?.titel ?? 'Battle Royale';
    const vorhanden = ausTurnier ?? gespeicherte.find((k) => k.eventId === f?.eventId && k.windowId === f?.windowId && (k.bildId ?? '') === bildId)?.id;
    const roh = `${titel} ${f?.windowId ?? ''} ${bildId || 'br'}`.trim();
    const id = vorhanden ?? (roh.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'karte');
    const schonDa = gespeicherte.find((k) => k.id !== id && k.eventId === f?.eventId && k.windowId === f?.windowId && (k.bildId ?? '') === bildId);
    if (schonDa) { if (!still) setStatus(`There already is a map for this match day on "${bildName}" ("${schonDa.titel}"). Choose another map image or open the existing one.`); return; }
    const r = await fetch('/api/turnier-karten', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id, titel, spots, teams, gesperrt, namenSichtbar: false, cupId, cupTitel: cup?.titel,
        eventId: f?.eventId, windowId: f?.windowId, region: f?.region, bildId, bildTitel: bildName,
        bildAutomatisch: bildVonHandFuer.current !== fensterId, spiele: spiele.trim() || undefined, oeffentlich: true,
        ausQuelle: generiert.current === kartenAbdruck(spots), basis: standVon.current.get(id) ?? null,
      }),
    });
    if (r.status === 409) setVeraltet(true);
    if (!r.ok) { const g = await r.json().catch(() => null); setStatus(g?.error ? String(g.error) : 'Saving failed'); if (!still) setVeroeffentlicht(null); return; }
    const antwort = await r.json().catch(() => null) as { karte?: { geaendert?: number } } | null;
    if (antwort?.karte?.geaendert) standVon.current.set(id, antwort.karte.geaendert);
    if (still) { setSelbstGesichert(Date.now()); return; }
    const d = await fetch('/api/turnier-karten', { cache: 'no-store' }).then((x) => x.json()).catch(() => ({ karten: gespeicherte }));
    merkeStaende(d.karten ?? []); setGespeicherte(d.karten ?? []);
    setVeroeffentlicht({ id, cup: cup?.titel ?? null, spieltag: f ? tagKurz(f.begin) : null }); setStatus('');
  }
  const speichernRef = useRef(speichern);
  useEffect(() => { speichernRef.current = speichern; });
  /** Speichern laeuft nacheinander, nie zwei zugleich. */
  const sichern = (still: boolean) => { speicherLauf.current = speicherLauf.current.then(() => speichernRef.current(still)).catch(() => { /* naechstes Mal */ }); };
  /* Von selbst sichern - nur nach einem eigenen Eingriff, nie nach blossem Laden. */
  useEffect(() => {
    if (!istAdmin || gesperrt || !fensterId || !inhaltVomNutzer.current || !spots.length) return undefined;
    const uhr = setTimeout(() => { inhaltVomNutzer.current = false; sichern(true); }, 200);
    return () => clearTimeout(uhr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots, teams, titel, spiele, bildId, fensterId, istAdmin, gesperrt]);

  const listeNeu = async () => { const d = await fetch('/api/turnier-karten', { cache: 'no-store' }).then((x) => x.json()); merkeStaende(d.karten ?? []); setGespeicherte(d.karten ?? []); };
  async function karteLoeschen(id: string, name: string) {
    if (!window.confirm(`Delete this map for good?\n\n${name}\n\nShapes and assignments are gone — this cannot be undone.`)) return;
    const r = await fetch(`/api/turnier-karten?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok) { const g = await r.json().catch(() => null); setStatus(g?.error ? String(g.error) : 'Deleting failed'); return; }
    await listeNeu(); setStatus(`Map deleted: ${name}`);
  }
  async function sichtbarkeit(id: string, oeffentlich: boolean) {
    const r = await fetch('/api/turnier-karten', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, oeffentlich }) });
    if (!r.ok) { setStatus('Switching failed'); return; }
    await listeNeu(); setStatus(oeffentlich ? 'The map is public again' : 'The map is hidden');
  }
  async function bildHochladen(datei: File, wieHeisst: string) {
    const daten = new FormData(); daten.append('bild', datei); daten.append('titel', wieHeisst);
    setStatus('Uploading the image …');
    const r = await fetch('/api/karten-bild', { method: 'POST', body: daten });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setStatus(j.error ?? 'Upload failed'); return; }
    const l = await fetch('/api/karten-bild').then((x) => x.json());
    setBilder(l.karten ?? []); setBildId(j.karte.id); setBildStand(Date.now()); setNeuerTitel(''); setStatus(`"${j.karte.titel}" is stored`);
  }
  async function bildUmbenennen(id: string, wieHeisst: string) {
    const name = wieHeisst.trim(); if (!name) return;
    const r = await fetch('/api/karten-bild', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, titel: name }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setStatus(j.error ?? 'Renaming failed'); return; }
    const l = await fetch('/api/karten-bild').then((x) => x.json());
    setBilder(l.karten ?? []); setBenennt(null); setStatus(`now called "${name}"`);
  }
  const inselZuordnen = (insel: string, bild: string) => {
    setInseln((alt) => { const n = { ...alt }; if (bild) n[insel] = bild; else delete n[insel]; return n; });
    void fetch('/api/karten-bild', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ insel, bildId: bild }) });
  };

  /* ---------------------------------------------------------------- Namen, Profile */

  const kartenEvent = fenster.find((x) => x.windowId === fensterId)?.eventId ?? gespeicherte.find((k) => k.id === ausTurnier)?.eventId ?? null;
  const alleKonten = useMemo(() => teams.flatMap((t) => t.ids ?? []), [teams]);
  const echteNamen = useEchteNamen(alleKonten, kartenEvent);
  const namenVon = useCallback((t: KTeam) => t.spieler.map((n, k) => kartenName(echteNamen[t.ids?.[k] ?? ''] ?? n)), [echteNamen]);
  const profilVon = useCallback((t: KTeam, i: number): Profil | undefined => {
    const id = (t.ids ?? [])[i];
    if (id && profile[id]) return profile[id];
    const s = namensSchluessel(t.spieler[i] ?? ''); if (!s) return undefined;
    return Object.values(profile).find((pr) => (pr.namen ?? [pr.name ?? '']).some((n) => namensSchluessel(n) === s));
  }, [profile]);
  const laenderVon = (t: KTeam) => t.spieler.map((_, i) => profilVon(t, i)?.land);

  async function profilSichern(t: KTeam, laender: string[], neueNamen: string[]) {
    if (!istAdmin) return;
    const ids = t.ids ?? []; let n = 0;
    for (let i = 0; i < t.spieler.length; i++) {
      const vorher = profilVon(t, i);
      const land = (laender[i] ?? '').trim().toUpperCase();
      const anzeige = neueNamen[i] && neueNamen[i] !== t.spieler[i] && ids[i] ? neueNamen[i] : vorher?.anzeige ?? '';
      if ((vorher?.land ?? '') === land && (vorher?.anzeige ?? '') === anzeige) continue;
      const r = await fetch('/api/spieler-profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ids[i] || undefined, name: t.spieler[i], land, x: vorher?.x ?? '', region: vorher?.region ?? '', anzeige }) });
      if (r.ok) { const j = await r.json().catch(() => null); if (j?.profile) setProfile((alt) => ({ ...alt, [j.schluessel]: j.profile })); n++; }
    }
    setStatus(n ? 'Saved — applies in every cup from now on' : neueNamen.some((x, i) => x !== t.spieler[i]) && !ids.some(Boolean) ? 'Without an account ID the name cannot be kept for good' : '');
  }

  const sichtbareTeams = useMemo(() => {
    const teile = teamSuche.trim().split(/[\s+]+/).map(namensSchluessel).filter(Boolean);
    if (!teile.length) return teams;
    return teams.filter((t) => { const heu = t.spieler.map(namensSchluessel).join(' '); const g = gefaltet(heu); return teile.every((w) => heu.includes(w) || g.includes(gefaltet(w))); });
  }, [teams, teamSuche]);

  /* ---------------------------------------------------------------- Anzeige */

  const anzeigeSpots = useMemo(() => nobleSpotsAnzeige(spots, (s) => s.quelle === 'noble').map((s, i) => (s === spots[i] ? s : { ...s, form: 'polygon' })), [spots]);
  const teamNach = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const gruppen = useCallback((s: Spot): Gruppe[] => {
    const belegt = s.teams.map((id) => teamNach.get(id)).filter((t): t is KTeam => Boolean(t));
    return belegt.map((t) => { const n = namenVon(t); return { key: t.id, zeilen: belegt.length === 1 && n.length > 1 ? n : [n.join(' ')] }; });
  }, [teamNach, namenVon]);
  const schrift = useMemo(() => einheitsGroesse(spots.flatMap((s) => {
    const g = gruppen(s);
    return g.length ? g.map((x) => ({ punkte: s.punkte, anzahl: g.length, texte: x.zeilen })) : s.name ? [{ punkte: s.punkte, anzahl: 1, texte: [s.name] }] : [];
  })), [spots, gruppen]);
  const bildQuelle = (bildId ? eigeneKarte(bildId) : fortniteKarte()) + (bildStand ? `?v=${bildStand}` : '');

  /** Die Karte als Bild: Kartenbild, Formen, Namen, Wasserzeichen und Logo - in die Zwischenablage oder als PNG. */
  async function alsBild() {
    const G = 1400; const c = document.createElement('canvas'); c.width = G; c.height = G;
    const g = c.getContext('2d'); if (!g) return;
    g.fillStyle = '#0a0a0b'; g.fillRect(0, 0, G, G);
    try { if (bildRef.current) g.drawImage(bildRef.current, 0, 0, G, G); } catch { /* Bild noch nicht bereit */ }
    for (const s of anzeigeSpots) {
      const gs = gruppen(s); const f = formFarbe(gs.length, s.farbe);
      g.beginPath(); s.punkte.forEach((p, i) => (i ? g.lineTo(p.x / 100 * G, p.y / 100 * G) : g.moveTo(p.x / 100 * G, p.y / 100 * G))); g.closePath();
      g.fillStyle = f.fuellung; g.fill(); g.strokeStyle = f.rand; g.lineWidth = 2; g.stroke();
      const zeilen = gs.length ? gs.flatMap((x) => x.zeilen) : s.name ? [s.name] : [];
      if (!zeilen.length) continue;
      const px = (schrift / 100) * G; const ak = anker(s.punkte);
      g.font = `600 ${px}px Inter, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      zeilen.forEach((z, j) => {
        const y = (ak.y / 100) * G + (j - (zeilen.length - 1) / 2) * px * 1.05;
        g.strokeStyle = '#000'; g.lineWidth = px * 0.14; g.strokeText(z, (ak.x / 100) * G, y);
        g.fillStyle = gs.length ? '#fff' : 'rgba(255,255,255,0.78)'; g.fillText(z, (ak.x / 100) * G, y);
      });
    }
    await zeichneMarke(g, 0, 0, G);
    try { const wie = await speichereLeinwand(c, `${titel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`); setStatus(wie === 'kopiert' ? 'Image copied' : 'Image saved'); }
    catch (e) { setStatus(`Did not work: ${(e as Error).message}`); }
  }

  const verteilt = spots.reduce((n, s) => n + s.teams.length, 0);
  const fensterJetzt = fenster.find((x) => x.windowId === fensterId);
  const insel = inselAusPlaylist(fensterJetzt?.playlist);
  const zeigeSpot = (s: Spot) => { setHervor(s.id); setTimeout(() => setHervor((x) => (x === s.id ? null : x)), 2400); steuerung.current?.zeigeSpot(s); };

  const leiste = (
    <>
      <WerkzeugKnopf titel={voll ? 'Exit fullscreen' : 'Fullscreen'} aktiv={voll} kind={IKONE.vollbild} onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void huelle.current?.requestFullscreen?.())} />
      <WerkzeugKnopf titel="Reset view — centred, no zoom" kind={IKONE.mittig} onClick={() => steuerung.current?.zurueck()} />
      {istAdmin && <>
        <span className="mx-auto my-0.5 h-px w-6 bg-white/15" />
        <WerkzeugKnopf titel={gesperrt ? 'Unlock map' : 'Lock map'} kind={IKONE.schloss} aktiv={gesperrt} onClick={() => { inhaltVomNutzer.current = true; setGesperrt((v) => !v); }} />
        <WerkzeugKnopf titel={gewaehlterSpot && darfBauen ? 'Delete this shape (Ctrl+Z brings it back)' : 'Remove all players (shapes stay)'} kind={IKONE.muell} gefahr onClick={muellEimer} />
        <WerkzeugKnopf titel="Draw a free shape" kind={IKONE.polygon} aktiv={werkzeug === 'polygon'} aus={!darfBauen} onClick={() => setWerkzeug(werkzeug === 'polygon' ? null : 'polygon')} />
        <WerkzeugKnopf titel="Draw a rectangle" kind={IKONE.rechteck} aktiv={werkzeug === 'rechteck'} aus={!darfBauen} onClick={() => setWerkzeug(werkzeug === 'rechteck' ? null : 'rechteck')} />
        <span className="mx-auto my-0.5 h-px w-6 bg-white/15" />
        <WerkzeugKnopf titel="Copy as image" kind={IKONE.bild} onClick={() => void alsBild()} />
      </>}
    </>
  );

  const teamZeile = (t: KTeam, mein = false) => {
    const spot = spots.find((s) => s.teams.includes(t.id));
    const inBearbeitung = bearbeite === t.id;
    const ziehbar = (darfBauen && !inBearbeitung) || (mein && darfMichSetzen);
    return (
      <div key={t.id} draggable={ziehbar}
        onDragStart={(e) => { gezogen.current = t.id; e.dataTransfer.setData('text/team', t.id); e.dataTransfer.effectAllowed = 'move'; }}
        onClick={() => { if (inBearbeitung || !spot) return; setGewaehlt(darfBauen ? spot.id : null); zeigeSpot(spot); }}
        title={spot ? 'Show on the map' : ziehbar ? 'Drag onto a shape' : undefined}
        className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-[13px] transition ${mein ? 'border-sky-400/50 bg-sky-400/10' : spot ? 'border-white/10 bg-black/30 hover:border-sky-400/40' : 'border-white/[0.06] hover:border-white/20'} ${spot ? 'cursor-zoom-in' : ziehbar ? 'cursor-grab' : ''}`}>
        <TeamFlagge groesse={24} laender={laenderVon(t)} />
        {inBearbeitung ? (
          <div className="min-w-0 flex-1 space-y-1.5" onClick={(e) => e.stopPropagation()}>
            <input value={entwurf} onChange={(e) => setEntwurf(e.target.value)} placeholder="Name + Name + Name" className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white outline-none focus:border-sky-400/60" />
            {t.spieler.map((sp, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <img src={flaggenPfad(landEntwurf[i] || undefined)} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-white/20" />
                <span className="min-w-0 flex-1 truncate text-[11px] text-white/50">{kartenName(sp)}</span>
                <input value={landEntwurf[i] ?? ''} maxLength={2} placeholder="—" onChange={(e) => setLandEntwurf((a) => a.map((v, k) => (k === i ? e.target.value.toUpperCase() : v)))}
                  className="w-11 rounded-md border border-white/10 bg-black/40 px-1 py-0.5 text-center text-[11px] uppercase text-white outline-none focus:border-amber-400/60" />
              </div>
            ))}
            <div className="flex max-h-16 flex-wrap gap-0.5 overflow-y-auto">
              {flaggen.map((f) => (
                <button key={f} type="button" title={f.toUpperCase()} onClick={() => setLandEntwurf((a) => { const o = a.findIndex((v) => !v); const z = o >= 0 ? o : 0; return a.map((v, k) => (k === z ? f.toUpperCase() : v)); })} className="rounded-full p-px ring-1 ring-white/10 hover:ring-sky-400">
                  <img src={`/flags/${f}.png`} alt={f} className="h-4 w-4 rounded-full object-cover" />
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={async () => {
                const neu = entwurf.split('+').map((x) => x.trim()).filter(Boolean);
                inhaltVomNutzer.current = true;
                setTeams((alt) => alt.map((x) => (x.id === t.id ? { ...x, spieler: neu } : x))); setBearbeite(null);
                await profilSichern(t, landEntwurf, neu);
              }} className="rounded-lg bg-sky-400 px-2.5 py-0.5 text-[11px] font-bold text-[#06080f]">OK</button>
              <button type="button" onClick={() => setBearbeite(null)} className="text-[11px] text-white/45 hover:text-white">Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <span className="min-w-0 truncate font-semibold uppercase tracking-wide text-white/90">{namenVon(t).join(' + ')}</span>
            {spot && <span className="ml-auto shrink-0 text-[10px] text-white/40">{spot.name || 'placed'}</span>}
            {mein && spot && (darfMichSetzen || darfBauen) && (
              <button type="button" title="Take off the map" onClick={(e) => { e.stopPropagation(); if (darfBauen) teamAbziehen(t.id); else void michSetzen(null); }} className={`shrink-0 text-white/40 transition hover:text-rose-300 ${spot ? '' : 'ml-auto'}`}>×</button>
            )}
            {istAdmin && !mein && <>
              <button type="button" title="Edit names and flags" onClick={(e) => { e.stopPropagation(); setBearbeite(t.id); setEntwurf(t.spieler.join(' + ')); setLandEntwurf(t.spieler.map((_, i) => profilVon(t, i)?.land ?? '')); }}
                className={`shrink-0 text-white/35 hover:text-sky-300 ${spot ? '' : 'ml-auto'}`}>
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M13.5 3.5 16.5 6.5 7 16H4v-3z" /></svg>
              </button>
              <button type="button" title="Remove from the list" onClick={(e) => { e.stopPropagation(); inhaltVomNutzer.current = true; setTeams((alt) => alt.filter((x) => x.id !== t.id)); setSpots((alt) => alt.map((sp) => (sp.teams.includes(t.id) ? { ...sp, teams: sp.teams.filter((id) => id !== t.id) } : sp))); }}
                className="shrink-0 text-white/30 transition hover:text-rose-300">×</button>
            </>}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={ausTurnier ? `/competitive/maps/view?id=${encodeURIComponent(ausTurnier)}` : '/competitive/maps/view'} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 py-1.5 text-xs font-semibold text-white/70 transition hover:border-sky-400/50 hover:text-white">
          ← {ausTurnier ? 'Map view' : 'Tournament maps'}
        </Link>
        {offeneKarte?.cupId && <Link to={`/competitive/events/${encodeURIComponent(offeneKarte.cupId)}`} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 py-1.5 text-xs font-semibold text-white/70 transition hover:border-sky-400/50 hover:text-white">← Back to {offeneKarte.cupTitel || 'the event'}</Link>}
        <a href={`${SEITE}/maps${linkKarte ? `?id=${encodeURIComponent(linkKarte)}` : ''}`} target="_blank" rel="noreferrer" className="ml-auto rounded-full border border-white/10 px-4 py-1.5 text-xs font-semibold text-white/50 transition hover:border-white/30 hover:text-white" title="The original map tool on thecomphub.com">Classic view ↗</a>
      </div>

      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-sky-300">{istAdmin ? 'Map tool' : 'Tournament map'}</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{istAdmin && !direkt ? 'Tournament map' : titel.replace(/\s*·\s*/g, ' – ')}</h1>
          <p className="mt-1 text-sm text-white/50">
            {!istAdmin || direkt ? (darfMichSetzen ? 'Drag your own team onto the shape where you land — it is saved at once.' : 'Who lands where. Fullscreen is on the right of the map.')
              : ausTurnier ? (bearbeitenAn ? 'Published tournament map — editing is on.' : 'Published tournament map — view only. Click "Edit this map" to change it.')
                : 'Shapes are kept per map image; players start fresh every time.'}
          </p>
          {istAdmin && ausTurnier && !direkt && (
            <button type="button" onClick={() => setBearbeitenAn((v) => !v)} className={`mt-2 inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${bearbeitenAn ? 'border-sky-400 bg-sky-400/15 text-sky-200' : 'border-white/10 text-white/70 hover:border-white/30'}`}>
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M13.5 3.5 16.5 6.5 7 16H4v-3z" /></svg>
              {bearbeitenAn ? 'Stop editing' : 'Edit this map'}
            </button>
          )}
        </div>
        {istAdmin && (
          <Glas className="px-5 py-3 text-right text-xs text-white/50">
            {bildId ? <p className="font-semibold text-emerald-300">{bilder.find((b) => b.id === bildId)?.titel ?? 'Own map image'}</p>
              : stand?.stand ? <p>Fortnite map of <span className="text-white/80">{new Date(stand.stand).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</span>{stand.tageAlt !== null && stand.tageAlt > 3 && <span className="text-amber-300"> · {stand.tageAlt} days old</span>}</p> : null}
            <p className="mt-0.5 flex items-center justify-end gap-2"><span className="text-lg font-extrabold tabular-nums text-sky-300">{spots.length}</span> spots · <span className="text-lg font-extrabold tabular-nums text-sky-300">{teams.length}</span> teams
              {darfBauen && fensterId && (
                <button type="button" onClick={() => void generiereKarte()} disabled={nobleLaeuft} title="Take shapes and players of this match day from Noble. Also to refresh shortly before the cup." aria-label="Finish map"
                  className="grid h-7 w-7 place-items-center rounded-full border border-white/15 text-white/60 transition hover:border-sky-400 hover:text-sky-300 disabled:opacity-40">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={nobleLaeuft ? 'animate-spin' : ''}><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></svg>
                </button>
              )}
            </p>
            {selbstGesichert && <p className="mt-0.5 text-[10px] text-emerald-300/80">saved automatically {new Date(selbstGesichert).toLocaleTimeString('en-GB')}</p>}
          </Glas>
        )}
      </motion.header>

      {veraltet && <Hinweis farbe="amber" kind={<div className="flex flex-wrap items-center gap-3"><span className="min-w-0 flex-1">This page shows an older state of the map. So that it overwrites nothing, nothing is saved. Please reload, then carry on.</span><button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-bold text-[#06080f]">Reload</button></div>} />}
      {ausErsatz && <Hinweis farbe="amber" kind="The store is not answering right now. You see the last backup, which may be older. Your map is not lost. Saving resumes once the store answers." />}

      {offeneKarte && geschwister.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-white/40">{geschwister.length} maps for this match day:</span>
          {geschwister.map((k) => (
            <Link key={k.id} to={`/competitive/maps/view?id=${encodeURIComponent(k.id)}&edit=1`} title={k.spiele ? `For games ${k.spiele}` : undefined}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${k.id === offeneKarte.id ? 'border-sky-400 bg-sky-400/10 text-sky-300' : 'border-white/10 text-white/70 hover:border-white/30'}`}>
              {k.bildTitel ?? k.titel}{k.spiele && <span className="ml-1.5 text-[10px] text-white/40">{k.spiele}</span>}
            </Link>
          ))}
        </div>
      )}

      {istAdmin && !direkt && (
        <Glas className="relative z-20 space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_auto_auto] lg:items-end">
            <div className="relative">
              <span className={etikett}>Cup <span className="text-white/25">({cups.length})</span></span>
              <input value={cupOffen ? cupSuche : gewaehlterCupText} placeholder="Search — name, date, type"
                onChange={(e) => { setCupSuche(e.target.value); setCupOffen(true); }} onFocus={() => { setCupSuche(''); setCupOffen(true); }} onBlur={() => setCupOffen(false)}
                onKeyDown={(e) => { if (e.key === 'Escape') setCupOffen(false); if (e.key === 'Enter' && cupListe[0]) { e.preventDefault(); cupGewaehlt(cupListe[0].cup); setCupOffen(false); } }}
                className={feldKlasse} />
              {cupOffen && (
                <div className="absolute inset-x-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0e18]/95 shadow-2xl backdrop-blur-xl">
                  {cupListe.length ? cupListe.map((x) => (
                    <button key={x.cup.id} type="button" onMouseDown={(ev) => { ev.preventDefault(); cupGewaehlt(x.cup); setCupOffen(false); }}
                      className={`block w-full border-b border-white/[0.04] px-3 py-2 text-left text-xs last:border-0 hover:bg-sky-400/10 ${cupId === x.cup.id ? 'text-sky-300' : 'text-white/80'}`}>{x.etikett}</button>
                  )) : <p className="px-3 py-2 text-xs text-white/40">No cup matches the search</p>}
                </div>
              )}
            </div>
            <label>
              <span className={etikett}>Match day</span>
              <select value={fensterId} disabled={!fenster.length} className={`${feldKlasse} disabled:opacity-40`}
                onChange={(e) => { setFensterId(e.target.value); const f = fenster.find((x) => x.windowId === e.target.value); if (!titelVomNutzer.current) setTitel(kartenTitel(cup?.titel, f) || 'New tournament map'); stelleWiederHer(e.target.value, bildId, gespeicherte); }}>
                <option value="">— choose —</option>
                {fenster.map((f) => <option key={f.windowId} value={f.windowId}>{f.region} · {tagKurz(f.begin)}{f.istFinale ? ' · Final' : ''}</option>)}
              </select>
            </label>
            {darfBauen && <button type="button" onClick={() => void generiereKarte()} disabled={!fensterId || nobleLaeuft} title="Take shapes and players of this match day from Noble. Also to refresh shortly before the cup." className={knopfHell}>{nobleLaeuft ? 'loading …' : spots.length ? 'Finish map' : 'Generate map'}</button>}
            <button type="button" onClick={() => sichern(false)} className={knopfHell}>Save</button>
          </div>
          <details className="group rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-2.5">
            <summary className="cursor-pointer select-none text-xs font-semibold text-white/55 transition hover:text-white">More options</summary>
            <div className="mt-3 grid gap-3 pb-1 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
              <label><span className={etikett}>Title</span><input value={titel} onChange={(e) => { titelVomNutzer.current = true; inhaltVomNutzer.current = true; setTitel(e.target.value); }} className={feldKlasse} /></label>
              <label><span className={etikett}>Games</span><input value={spiele} placeholder="e.g. 1–5" onChange={(e) => { inhaltVomNutzer.current = true; setSpiele(e.target.value); }} className={feldKlasse} /></label>
              <label title="How many teams are loaded. For a final map only those who advanced count."><span className={etikett}>Only the best</span>
                <input value={teamGrenze || ''} inputMode="numeric" placeholder="auto" onChange={(e) => { const n = parseInt(e.target.value, 10); setTeamGrenze(Number.isFinite(n) ? n : 0); }} className={feldKlasse} /></label>
              <button type="button" onClick={() => void ladeTeams()} disabled={!fensterId || laedtTeams} title={fensterId && vorrundeZu(fensterId) ? 'If the final has no results yet, the qualified teams of the previous round are loaded' : undefined} className={knopfLeise}>{laedtTeams ? 'loading …' : 'Load teams'}</button>
              {darfBauen && nobleListe && (
                <label><span className={etikett}>Match day at Noble</span>
                  <select defaultValue="" className={feldKlasse} onChange={(e) => { const w = nobleListe.find((x) => `${x.turnierId}|${x.region}|${x.windowId}` === e.target.value); if (w) void generiereKarte({ windowId: w.windowId, turnierId: w.turnierId, region: w.region }); }}>
                    <option value="">— choose —</option>
                    {nobleListe.map((w) => <option key={`${w.turnierId}|${w.region}|${w.windowId}`} value={`${w.turnierId}|${w.region}|${w.windowId}`}>{w.turnier} · {w.name} · {w.region}{w.start ? ` · ${tagKurz(w.start)}` : ''}</option>)}
                  </select></label>
              )}
              <label className="relative" title="Separate names with &, comma or slash. A single name is a solo.">
                <span className={etikett}>Team by hand</span>
                <input value={eigenesTeam} placeholder="Name & Name & Name" onChange={(e) => setEigenesTeam(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') teamEintragen(); }} className={feldKlasse} />
                {vorschlaege.length > 0 && (
                  <ul className="absolute z-40 mt-1 w-60 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0e18]/95 shadow-2xl backdrop-blur-xl">
                    {vorschlaege.map((v) => <li key={v.epicId || v.name}><button type="button" onClick={() => vorschlagNehmen(v.name)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-white/85 hover:bg-sky-400/10"><TeamFlagge groesse={18} laender={[v.land || undefined]} /><span className="truncate">{v.name}</span></button></li>)}
                  </ul>
                )}
              </label>
              <button type="button" onClick={teamEintragen} disabled={!eigenesTeam.trim()} className={knopfLeise}>Add</button>
              <label>
                <span className={etikett}>Map image</span>
                <select value={bildId} className={feldKlasse} onChange={(e) => { bildVonHandFuer.current = fensterId; inhaltVomNutzer.current = true; setBildId(e.target.value); setBildStand(Date.now()); stelleWiederHer(fensterId, e.target.value, gespeicherte); }}>
                  <option value="">Battle Royale</option>
                  {bilder.map((b) => <option key={b.id} value={b.id}>{b.titel}</option>)}
                </select>
                {insel.art === 'reload' && insel.schluessel && (
                  <span className="mt-1 flex items-center gap-1.5 text-[11px] text-white/50">Reload island: <b className="text-white/80">{insel.schluessel}</b> →
                    <select value={inseln[insel.schluessel] ?? ''} title="Which map image belongs to this island" onChange={(e) => inselZuordnen(insel.schluessel!, e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-1.5 py-0.5 text-[11px] text-white outline-none">
                      <option value="">Assign image …</option>
                      {bilder.map((b) => <option key={b.id} value={b.id}>{b.titel}</option>)}
                    </select>
                  </span>
                )}
              </label>
            </div>
          </details>
        </Glas>
      )}

      {istAdmin && (
        <Glas className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs text-white/55"
        >
          <span className="font-bold uppercase tracking-[0.2em] text-violet-300">Template</span>
          {!pause ? (
            <span className="min-w-0 flex-1">Paste a screenshot of another drop map (Ctrl+V) or <label className="cursor-pointer font-semibold text-sky-300 underline">choose a file<input type="file" accept="image/*" className="hidden" onChange={(e) => { vorlageAus(e.target.files?.[0]); e.target.value = ''; }} /></label> — it lies under the map to scale, stays in this browser, and can read the player names out of it.</span>
          ) : (
            <>
              <label className="flex items-center gap-2">Opacity<input type="range" min={10} max={100} value={pauseKlar} onChange={(e) => setPauseKlar(Number(e.target.value))} className="w-32 accent-sky-400" /><span className="w-8 tabular-nums">{pauseKlar}%</span></label>
              <button type="button" onClick={() => void bildLesen()} disabled={!!lesen} className={knopfLeise}>{lesen || 'Read players from the template'}</button>
              <button type="button" onClick={() => { setPause(null); setFunde(null); }} className="rounded-xl border border-white/10 px-3 py-2 font-semibold text-white/55 transition hover:border-rose-400/60 hover:text-rose-300">Remove template</button>
            </>
          )}
        </Glas>
      )}

      <AnimatePresence>
        {istAdmin && funde && (
          <Hinweis key="funde" kind={<>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="font-semibold text-sky-200">{funde.length} players found in the image</span>
              <label className="flex items-center gap-1.5 text-xs text-white/60"><input type="checkbox" checked={alsTeams} onChange={(e) => setAlsTeams(e.target.checked)} className="accent-sky-400" />join names standing together into one team</label>
              <label className="flex items-center gap-1.5 text-xs text-white/60"><input type="checkbox" checked={aufFormen} onChange={(e) => setAufFormen(e.target.checked)} className="accent-sky-400" />put them on the shape they stand in</label>
              <label className="flex items-center gap-1.5 text-xs text-white/60"><input type="checkbox" checked={formenAnlegen} disabled={!aufFormen} onChange={(e) => setFormenAnlegen(e.target.checked)} className="accent-sky-400" />create a shape where there is none</label>
              <span className="ml-auto flex gap-2">
                <button type="button" onClick={() => setFunde(null)} className={knopfLeise}>Discard</button>
                <button type="button" onClick={fundeUebernehmen} disabled={!funde.some((f) => f.nehmen)} className={knopfHell}>Apply</button>
              </span>
            </div>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {funde.map((f, i) => (
                <li key={f.epicId}><button type="button" title={`read as: ${f.roh}`} onClick={() => setFunde((alt) => (alt ?? []).map((x, k) => (k === i ? { ...x, nehmen: !x.nehmen } : x)))}
                  className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition ${f.nehmen ? 'border-sky-400/50 bg-sky-400/10 text-white' : 'border-white/10 text-white/35 line-through'}`}>
                  <TeamFlagge groesse={16} laender={[f.land || undefined]} /><span>{f.name}</span>{f.guete < 1 && <span className="text-[10px] text-white/40">“{f.roh}”</span>}
                </button></li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-relaxed text-white/40">Only names come from the image — no shapes, no background. Where the recognition read something else, it is shown in quotes; what matches no account in the archive does not appear at all. A click takes a name out of the selection.</p>
          </>} />
        )}
        {istAdmin && !funde && ruecknahme && (
          <Hinweis key="rueck" farbe="emerald" zu={() => setRuecknahme(null)} kind={<div className="flex flex-wrap items-center gap-3">
            <span>{ruecknahme.teamIds.length} teams taken from the image{ruecknahme.anzahl > 0 && `, ${ruecknahme.anzahl} of them put on a shape`}{ruecknahme.neueFormen > 0 && ` · ${ruecknahme.neueFormen} new shapes created`}</span>
            <button type="button" onClick={leseZuruecknehmen} className="rounded-xl border border-white/15 px-3 py-1 text-xs font-semibold text-white/70 hover:border-rose-400/60 hover:text-rose-300">Take back</button>
          </div>} />
        )}
        {darfBauen && nobleFrage && (
          <Hinweis key="frage" kind={<div className="flex flex-wrap items-center gap-3"><p className="min-w-0 flex-1">{nobleFrage.text}</p>
            <button type="button" onClick={() => nobleFrage.anwenden()} className={knopfHell}>Continue</button>
            <button type="button" onClick={() => setNobleFrage(null)} className={knopfLeise}>Cancel</button></div>} />
        )}
        {darfBauen && nobleMeldung && (
          <Hinweis key="meldung" farbe={nobleMeldung.art === 'ok' ? 'emerald' : 'amber'} zu={() => setNobleMeldung(null)} kind={nobleMeldung.art === 'nichts' ? (() => {
            const ref = fensterJetzt?.begin ?? Date.now();
            const ab = (s: string | null) => (s ? Math.abs(Date.parse(s) - ref) : Infinity);
            const nahe = [...(nobleListe ?? [])].sort((a, b) => ab(a.start) - ab(b.start)).slice(0, 12);
            return <>
              <p className="font-semibold">Noble has no map for this match day.</p>
              <p className="mt-1 text-xs text-white/60">{nahe.length ? 'Noble has these match days — click one to take its shapes and players. Your map stays unchanged until you confirm.' : 'The list of Noble match days could not be loaded. Try again in a moment.'}</p>
              {nahe.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{nahe.map((w) => (
                <button key={`${w.turnierId}|${w.region}|${w.windowId}`} type="button" onClick={() => void generiereKarte({ windowId: w.windowId, turnierId: w.turnierId, region: w.region })}
                  className="rounded-lg border border-amber-400/40 px-2.5 py-1 text-xs text-amber-100 transition hover:border-amber-300 hover:bg-amber-400/10">{w.turnier} · {w.name} · {w.region}{w.start ? ` · ${tagKurz(w.start)}` : ''}</button>
              ))}</div>}
            </>;
          })() : <p className={nobleMeldung.art === 'ok' ? 'font-semibold' : ''}>{nobleMeldung.text}</p>} />
        )}
      </AnimatePresence>

      {istAdmin && !direkt && (
        <details className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 backdrop-blur-xl">
          <summary className="cursor-pointer select-none text-xs font-semibold text-white/55 hover:text-white">Own map images ({bilder.length}) — rename and upload</summary>
          <div className="mt-2 flex flex-wrap items-center gap-2 pb-1">
            {bilder.map((b) => (
              <span key={b.id} className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] ${bildId === b.id ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200' : 'border-white/10 text-white/70'}`}>
                {benennt === b.id ? <>
                  <input autoFocus value={benenntTitel} list="hub-kartenvorlagen" onChange={(e) => setBenenntTitel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void bildUmbenennen(b.id, benenntTitel); if (e.key === 'Escape') setBenennt(null); }} className="w-44 rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[11px] text-white outline-none" />
                  <button type="button" onClick={() => void bildUmbenennen(b.id, benenntTitel)} className="text-emerald-300">✓</button><button type="button" onClick={() => setBenennt(null)} className="text-white/40">×</button>
                </> : <>{b.titel}<button type="button" title="Rename" onClick={() => { setBenennt(b.id); setBenenntTitel(b.titel); }} className="text-white/40 hover:text-sky-300">✎</button></>}
              </span>
            ))}
            <input value={neuerTitel} onChange={(e) => setNeuerTitel(e.target.value)} placeholder="Name of the new map" list="hub-kartenvorlagen" className="w-52 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white outline-none focus:border-sky-400/60" />
            <datalist id="hub-kartenvorlagen"><option value="Battle Royale - CH7 S4" /><option value="Battle Royale - CH7 S3" /><option value="Reload - Slurpush" /><option value="Reload - Elite Stronghold" /></datalist>
            <label className={`cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] ${neuerTitel.trim() ? 'border-sky-400 bg-sky-400/10 text-sky-300' : 'border-white/10 text-white/30'}`}>Upload PNG
              <input type="file" accept="image/*" className="hidden" disabled={!neuerTitel.trim()} onChange={(e) => { const d = e.target.files?.[0]; if (d) void bildHochladen(d, neuerTitel.trim()); e.target.value = ''; }} /></label>
            <span className="text-[10px] text-white/30">name it first, then choose the file</span>
          </div>
        </details>
      )}

      {veroeffentlicht && (
        <Hinweis farbe={veroeffentlicht.cup && veroeffentlicht.spieltag ? 'emerald' : 'amber'} zu={() => setVeroeffentlicht(null)} kind={veroeffentlicht.cup && veroeffentlicht.spieltag ? <>
          <p className="font-semibold">Saved and publicly visible</p>
          <p className="mt-1 text-xs text-white/65">Everyone now finds the map under Events → {veroeffentlicht.cup} → match day {veroeffentlicht.spieltag} via "Open map". Open pages update themselves within 20 seconds.</p>
          <p className="mt-2 flex flex-wrap gap-2">
            {cupId && <Link to={`/competitive/events/${encodeURIComponent(cupId)}`} className="rounded-lg border border-emerald-400/40 px-2 py-1 text-xs text-emerald-200 hover:border-emerald-300">Open the event page</Link>}
            <Link to={`/competitive/maps/view?id=${encodeURIComponent(veroeffentlicht.id)}`} className="rounded-lg border border-white/15 px-2 py-1 text-xs text-white/70 hover:border-white/40">As visitors see it</Link>
          </p>
        </> : <>
          <p className="font-semibold">Saved — but not public yet</p>
          <p className="mt-1 text-xs text-white/65">Without a cup and match day the assignment is missing, so the map does not show up under Events. Choose both above and save again.</p>
        </>} />
      )}

      {status && <p className="text-xs text-white/50">{status}</p>}

      {istAdmin && !direkt && (gespeicherte.length > 0 || offeneFinals.length > 0) && (
        <details className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 backdrop-blur-xl">
          <summary className="cursor-pointer select-none text-xs font-semibold text-white/55 hover:text-white">Saved maps ({gespeicherte.length})</summary>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-[11px] text-white/40">Hidden maps stay here — nothing gets lost.</p>
              <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                {gespeicherte.map((k) => {
                  const sichtbar = k.oeffentlich !== false;
                  return (
                    <div key={k.id} className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition ${k.id === ausTurnier ? 'border-sky-400/60 bg-sky-400/10' : 'border-white/[0.06] hover:border-white/20'}`}>
                      <Link to={`/competitive/maps/view?id=${encodeURIComponent(k.id)}&edit=1`} className="min-w-0 flex-1 truncate text-white/80 hover:text-sky-300">{k.titel}<span className="ml-1.5 text-[10px] text-white/35">{k.bildTitel ?? 'Battle Royale'}{k.cupTitel ? ` · ${k.cupTitel}` : ''}</span></Link>
                      {!sichtbar && <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">hidden</span>}
                      <button type="button" onClick={() => void sichtbarkeit(k.id, !sichtbar)} title={sichtbar ? 'Hide publicly — the map is kept' : 'Show publicly again'} className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${sichtbar ? 'text-white/40 hover:bg-white/10 hover:text-white' : 'text-emerald-300 hover:bg-emerald-400/10'}`}>{sichtbar ? 'Hide' : 'Show'}</button>
                      <button type="button" onClick={() => void karteLoeschen(k.id, k.titel)} title="Delete for good — shapes and assignment are gone" className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-rose-300 hover:bg-rose-400/10">×</button>
                    </div>
                  );
                })}
              </div>
            </div>
            {offeneFinals.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Finals without a map ({offeneFinals.length})</p>
                <div className="space-y-1">
                  {offeneFinals.map((f) => (
                    <Link key={f.windowId} to={`/competitive/maps/view?edit=1&event=${encodeURIComponent(f.eventId)}&window=${encodeURIComponent(f.windowId)}`}
                      className="flex items-center gap-1 rounded-xl border border-dashed border-white/10 px-2.5 py-1.5 text-xs text-white/60 transition hover:border-sky-400/50 hover:text-sky-300">
                      <span className="min-w-0 flex-1 truncate">{kartenTitel(f.cupTitel, f) || f.windowId}<span className="ml-1.5 text-[10px] text-white/30">{f.region} · {tagKurz(f.begin)}</span></span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div ref={huelle} className={voll ? 'flex h-full w-full items-center justify-center bg-[#0b2340]' : ''}>
          <div className={voll ? 'h-full' : 'mx-auto'} style={voll ? { aspectRatio: '1 / 1' } : { maxWidth: 'min(100%, 86vh)' }}>
            <Zeichenflaeche spots={spots} anzeige={anzeigeSpots} gruppen={gruppen} schrift={schrift} bild={bildQuelle} voll={voll}
              darfBauen={darfBauen} werkzeug={werkzeug} setWerkzeug={setWerkzeug} gewaehlt={gewaehlt} setGewaehlt={setGewaehlt}
              aendern={aendern} merke={merke} neueForm={neueForm} darfAblegen={darfBauen || darfMichSetzen} abgelegt={abgelegt} gezogen={gezogen}
              labelZiehbar={darfBauen} pause={pause ? { quelle: pause, klar: pauseKlar } : null} hervorheben={hervor}
              marken={funde?.map((f) => ({ id: f.epicId, x: f.x, y: f.y, text: kartenName(f.name), an: f.nehmen }))}
              steuerung={steuerung} bildRef={bildRef} oben={leiste}
              unten={<>
                {gesperrt && istAdmin && <span className="rounded-xl bg-black/70 px-2.5 py-2 text-[11px] font-semibold text-amber-300">Map locked</span>}
                {darfBauen && !werkzeug && !gewaehlterSpot && spots.length > 0 && <span className="rounded-xl bg-black/70 px-2.5 py-2 text-[11px] text-white/60">Double-click a shape to edit it</span>}
              </>} />
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3 lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)]">
          {darfBauen && gewaehlterSpot && (
            <Glas className="space-y-2 border-sky-400/30 p-3">
              <p className="text-[11px] leading-relaxed text-white/55">Shape open — dragging moves it, the corners reshape it. The bin at the map deletes it, Ctrl+Z brings it back.</p>
              <div className="flex flex-wrap items-center gap-2">
                <input value={gewaehlterSpot.name ?? ''} placeholder="Label (optional)" onChange={(e) => aendern((alt) => alt.map((x) => (x.id === gewaehlterSpot.id ? { ...x, name: e.target.value || undefined } : x)))}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white outline-none focus:border-sky-400/60" />
                <input type="color" value={gewaehlterSpot.farbe ?? '#38bdf8'} title="Own colour for this shape" onChange={(e) => aendern((alt) => alt.map((x) => (x.id === gewaehlterSpot.id ? { ...x, farbe: e.target.value } : x)))} className="h-7 w-9 cursor-pointer rounded border border-white/10 bg-black/40 p-0.5" />
                {gewaehlterSpot.farbe && <button type="button" onClick={() => aendern((alt) => alt.map((x) => (x.id === gewaehlterSpot.id ? { ...x, farbe: undefined } : x)))} className="text-[11px] text-white/45 underline">automatic</button>}
              </div>
              {gewaehlterSpot.teams.length ? (
                <div className="flex flex-wrap gap-1">
                  {gewaehlterSpot.teams.map((tid) => { const t = teamNach.get(tid); return t ? <button key={tid} type="button" onClick={() => teamAbziehen(tid)} title="Remove from the shape" className="rounded-lg border border-white/10 bg-black/40 px-2 py-0.5 text-[11px] text-white/85 hover:border-rose-400/60">{namenVon(t).join(' + ')} ×</button> : null; })}
                </div>
              ) : <p className="text-[11px] text-white/40">Drag a team from the list onto the shape.</p>}
            </Glas>
          )}

          <Glas className="flex min-h-0 flex-1 flex-col p-3">
            {meinTeam && <>
              <h2 className="mb-2 text-sm font-bold text-white">Your team</h2>
              <div className="mb-3">{teamZeile(meinTeam, true)}</div>
            </>}
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Teams</h2>
              <span className="text-xs tabular-nums text-white/40">{verteilt}/{teams.length} placed</span>
            </div>
            {teams.length > 8 && (
              <div className="relative mb-2">
                <input value={teamSuche} onChange={(e) => setTeamSuche(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setTeamSuche(''); }} placeholder="Search a player …"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 pr-14 text-[13px] text-white outline-none placeholder:text-white/30 focus:border-sky-400/60" />
                {teamSuche && <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-[10px] text-white/40">{sichtbareTeams.length}<button type="button" onClick={() => setTeamSuche('')} className="text-white/50 hover:text-white">×</button></span>}
              </div>
            )}
            {istAdmin && !darfBauen && <p className="mb-2 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] px-2.5 py-1.5 text-[11px] text-amber-200">{gesperrt ? 'The map is locked — open the lock first to place teams.' : 'View only — click "Edit this map" to place teams.'}</p>}
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5" style={{ maxHeight: '70vh' }}>
              {!sichtbareTeams.length && <p className="py-4 text-center text-[11px] text-white/40">{teams.length ? `No team found for "${teamSuche}".` : istAdmin ? 'Choose a cup and match day above.' : 'No teams yet.'}</p>}
              {sichtbareTeams.map((t) => teamZeile(t))}
            </div>
          </Glas>
        </div>
      </div>
      <p className="text-center text-[11px] text-white/30">Wheel zooms to the pointer, drag moves, double-click zooms in{darfBauen ? ' or opens a shape' : ''}, a long press jumps to a spot.{istAdmin ? ' Ctrl+Z undoes, Ctrl+V pastes a template.' : ''}</p>
    </div>
  );
}
