'use client';

/*
 * Der Konfigurator fuer das Stream-Banner.
 *
 * Vorher standen hier vier Overlay-Arten nebeneinander und dazu rund dreissig
 * Stellschrauben: fuenf Farbwaehler, acht Formen, Rundung, Schraege,
 * Innenabstand, Bildausschnitt, Zoom. Der Betreiber hat das abgelehnt - "viel
 * zu viele Optionen beziehungsweise einfach unnoetige Optionen".
 *
 * Jetzt drei Schritte: Cup waehlen, Duo waehlen, Vorlage waehlen. Dazu genau
 * zwei Regler - wie durchsichtig und wie hoch -, eine Vorschau und die Adresse
 * zum Kopieren. Die ausfuehrliche Bestenliste ist ein eigenes Overlay und
 * steht unten, damit sie den Weg nicht verstellt.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { useZugang } from '@/app/lib/zugang';
import { rundenName } from '@/lib/rundenName';

interface Fenster {
  status: 'live' | 'kommt' | 'vorbei';
  begin: number; name: string; eventId: string; windowId: string;
}
interface Spieler { id: string; name: string; img?: string | null }
interface Team { rank: number; spieler: Spieler[] }

/** Muss zu public/overlay/vorlagen.js passen. */
const VORLAGEN = [
  { id: 'nacht', titel: 'Nacht', grund: '#0d1b3a', akzent: '#38bdf8', schrift: '#ffffff' },
  { id: 'kohle', titel: 'Kohle', grund: '#0b0b0e', akzent: '#38bdf8', schrift: '#ffffff' },
  { id: 'eis', titel: 'Eis', grund: '#0b3d7a', akzent: '#7dd3fc', schrift: '#ffffff' },
  { id: 'glut', titel: 'Glut', grund: '#2a0f0f', akzent: '#fb923c', schrift: '#ffffff' },
  { id: 'rein', titel: 'Rein', grund: '#f4f6fb', akzent: '#0284c7', schrift: '#111827' },
];

const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];

/**
 * Der Name, wie er im Banner stehen soll - derselbe Vorschlag wie dort.
 *
 * Eckige Klammern und ein vorangestelltes Teamkuerzel fallen weg, aus
 * "[EWC2026] TWIS Cold" wird "Cold". Ueberschreiben kann man ihn trotzdem;
 * dieser Vorschlag steht nur im Feld, bis jemand etwas anderes hineinschreibt.
 */
function namensVorschlag(roh: string): string {
  let n = String(roh || '').replace(/\[[^\]]*\]/g, ' ').trim();
  n = n.replace(/^[A-Z0-9]{2,5}\s+(?=\S)/, '').trim();
  return n || String(roh || '');
}

function Schritt({ nummer, titel, children }: {
  nummer: number; titel: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-100">
        <span className="flex h-5 w-5 items-center justify-center rounded-full
                         bg-sky-500 text-[11px] font-bold text-white">
          {nummer}
        </span>
        <T>{titel}</T>
      </h2>
      {children}
    </section>
  );
}

export default function OverlaySeite() {
  const t = useT();
  const zugang = useZugang();

  const [region, setRegion] = useState('EU');
  const [fenster, setFenster] = useState<Fenster[]>([]);
  const [cup, setCup] = useState('');
  const [cupSuche, setCupSuche] = useState('');
  const [alleZeigen, setAlleZeigen] = useState(false);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [loginNoetig, setLoginNoetig] = useState(false);

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamFuer, setTeamFuer] = useState('');
  const [teamLaedt, setTeamLaedt] = useState(false);
  const [teamSuche, setTeamSuche] = useState('');
  const [duo, setDuo] = useState<Spieler[]>([]);
  /** Ergebnis der Turniersuche - null heisst "es wurde nicht gesucht". */
  const [funde, setFunde] = useState<Team[] | null>(null);
  const [suchLaeuft, setSuchLaeuft] = useState(false);
  const [suchInfo, setSuchInfo] = useState('');
  const [namen, setNamen] = useState<[string, string]>(['', '']);

  /*
   * Gespeicherte Vorlagen.
   *
   * Bewusst ohne Spieltag: eine Vorlage gehoert einem Duo und einem Aussehen.
   * Die Adresse traegt statt Cup und Fenster nur die Region, und das Banner
   * sucht sich den laufenden - oder zuletzt gespielten - Spieltag selbst. So
   * steht dieselbe Adresse in OBS auch beim naechsten Turnier noch richtig.
   */
  interface Gespeichert {
    id: string; titel: string; region: string;
    ids: string[]; namen: string[];
    vorlage: string; klar: number; hoehe: number; abstand?: number;
  }
  const [gespeicherte, setGespeicherte] = useState<Gespeichert[]>([]);
  const [neuerTitel, setNeuerTitel] = useState('');

  const [vorlage, setVorlage] = useState('nacht');
  const [klar, setKlar] = useState(92);
  const [hoehe, setHoehe] = useState(108);
  /**
   * Wie weit die Fotos vom Text abruecken.
   *
   * Vorher sass der Text fest an den Bildern. Der Betreiber wollte "die
   * Overlays noch ein bisschen auseinanderziehen koennen, dass die Bilder
   * noch ein bisschen weiter weg sind von den Infos, wenn man das will".
   * Achtzehn Punkte sind der bisherige Stand und bleiben die Voreinstellung.
   */
  const [abstand, setAbstand] = useState(18);

  /**
   * Weitere Duos in derselben Quelle.
   *
   * Der Betreiber wollte "mehrere Overlays in ein Overlay packen" - eine
   * Browser-Quelle in OBS, die der Reihe nach durch mehrere Teams wechselt,
   * mit einem Uebergang statt eines harten Schnitts. Das oben gewaehlte Duo
   * ist immer das erste; was hier dazukommt, folgt danach.
   */
  const [weitere, setWeitere] = useState<Array<{
    ids: string[]; namen: [string, string]; etikett: string;
  }>>([]);
  /** Sekunden je Duo. */
  const [wechsel, setWechsel] = useState(8);

  /*
   * Die Bestenliste als zweites Overlay.
   *
   * Vier Farben und ein Bereich - mehr nicht. Der Betreiber wollte es
   * ausdruecklich knapp: "aber auch einfach nicht allzu viele Infos, sonst
   * simpel." Die Voreinstellungen sind die des Overlays selbst, damit ein
   * unangetasteter Regler nichts in die Adresse schreibt.
   */
  const BL_STANDARD = { bg: '#12101c', bg2: '#1c1830', text: '#ffffff', accent: '#38bdf8' };
  const [blFarben, setBlFarben] = useState({ ...BL_STANDARD });
  const [blVon, setBlVon] = useState(1);
  const [blBis, setBlBis] = useState(10);
  const [kopiert, setKopiert] = useState('');

  const [eventId, windowId] = useMemo(() => cup.split('|'), [cup]);

  /*
   * Lesbare Cupnamen.
   *
   * Epic gibt nur Kennungen heraus - "s42_reload_duos_victory". Der Katalog
   * kennt zu jedem Spielfenster den richtigen Titel; die Runde kommt aus
   * derselben Stelle wie auf den Event- und Kartenseiten, damit ueberall
   * dasselbe steht.
   */
  const [katalog, setKatalog] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch('/api/cup-catalog?modus=alle')
      .then((r) => r.json())
      .then((d) => {
        const karte: Record<string, string> = {};
        for (const c of d.cups ?? []) {
          for (const liste of Object.values(c.regionen ?? {}) as Array<
            Array<{ windowId: string }>>) {
            for (const w of liste ?? []) karte[w.windowId] = c.titel;
          }
        }
        setKatalog(karte);
      })
      .catch(() => {});
  }, []);

  const lesbarerName = useCallback((w: Fenster) => {
    const cupName = (katalog[w.windowId] ?? '').split('·')[0].trim();
    const runde = rundenName(w.windowId, /Final/i.test(w.windowId), t);
    if (cupName) return [cupName, runde].filter(Boolean).join(' · ');
    // Kennt der Katalog den Spieltag nicht, wenigstens die Kennung entzerren.
    return w.name.replace(/[_]+/g, ' ').trim();
  }, [katalog, t]);

  /* ---------------------------------------------------------- Cups */

  useEffect(() => {
    let weg = false;
    void (async () => {
      setLadeFehler(null);
      try {
        const r = await fetch(`/api/cup-events?region=${region}`);
        const d = await r.json();
        if (weg) return;
        if (!r.ok) {
          setLoginNoetig(Boolean(d.needsLogin));
          setLadeFehler(d.error ?? 'Cups nicht ladbar');
          setFenster([]);
          return;
        }
        setLoginNoetig(false);
        const liste: Fenster[] = d.windows ?? [];
        setFenster(liste);
        const live = liste.find((w) => w.status === 'live');
        const erste = live ?? liste[0];
        setCup(erste ? `${erste.eventId}|${erste.windowId}` : '');
      } catch (e) {
        if (!weg) setLadeFehler((e as Error).message);
      }
    })();
    return () => { weg = true; };
  }, [region]);

  /*
   * Welche Spieltage zur Wahl stehen.
   *
   * Nur Vergangenes und Laufendes - zu einem Cup naechste Woche gibt es keine
   * Zahlen, und die Liste war mit hundert leeren Terminen zugestellt. Gezeigt
   * werden acht; wer weiter zurueck will, sucht oder klappt auf. Genau das
   * hatte der Betreiber verlangt: "es waer geil, wenn man alles sehen koennte.
   * Aber das ist wie viel zu unuebersichtlich."
   */
  const auswahl = useMemo(() => {
    const tagesEnde = new Date();
    tagesEnde.setHours(23, 59, 59, 999);
    const q = cupSuche.trim().toLowerCase();
    const liste = fenster
      .filter((w) => w.begin <= tagesEnde.getTime())
      .filter((w) => !q || lesbarerName(w).toLowerCase().includes(q)
        || w.name.toLowerCase().includes(q))
      .sort((a, b) => (a.status === 'live' ? 0 : 1) - (b.status === 'live' ? 0 : 1)
        || b.begin - a.begin);
    return { alle: liste, zeig: q || alleZeigen ? liste : liste.slice(0, 8) };
  }, [fenster, cupSuche, alleZeigen, lesbarerName]);

  /* -------------------------------------------------------- Spieler */

  const ladeTeams = useCallback(async () => {
    if (!eventId || !windowId) return;
    setTeamLaedt(true);
    try {
      const r = await fetch(`/api/cup-roster?event=${encodeURIComponent(eventId)}`
        + `&window=${encodeURIComponent(windowId)}&limit=200`);
      const d = await r.json();
      setTeams(r.ok ? (d.teams ?? []) : []);
      setTeamFuer(cup);
    } catch { setTeams([]); }
    finally { setTeamLaedt(false); }
  }, [eventId, windowId, cup]);

  /*
   * Die geladene Mannschaftsliste gilt nur fuer den Cup, zu dem sie geholt
   * wurde. Beim Wechsel gilt sie damit von selbst als nicht geladen - ohne
   * einen Effekt, der hinterherraeumt und dabei eine Kette von Neuzeichnungen
   * anstoesst.
   */
  const geladen = useMemo(() => (teamFuer === cup ? teams : []), [teamFuer, cup, teams]);

  const treffer = useMemo(() => {
    if (funde) return funde.slice(0, 12);
    const q = teamSuche.trim().toLowerCase();
    if (!q) return geladen.slice(0, 12);
    return geladen.filter((tm) => tm.spieler.some((s) => s.name.toLowerCase().includes(q)))
      .slice(0, 12);
  }, [funde, geladen, teamSuche]);

  /*
   * Einen Spieler im ganzen Turnier suchen - nicht nur in der Spitze.
   *
   * Zwei Wege zugleich, weil keiner allein reicht:
   *
   *   1. Ueber das gepflegte Verzeichnis. Wer im Spiel "big tryonа" heisst, im
   *      Player Center aber als "Vico" gefuehrt wird, ist sonst nicht zu
   *      finden - man kennt ihn ja unter dem gepflegten Namen. Erst werden die
   *      Konten zu diesem Namen geholt, dann wird gefragt, ob eines davon
   *      diesen Spieltag gespielt hat. Nur dann taucht er auf.
   *   2. Ueber die freie Textsuche in der Bestenliste, fuer alle, die im
   *      Verzeichnis nicht stehen.
   *
   * Beide Wege gehen durch die ganze Bestenliste, nicht nur durch die ersten
   * hundert Plaetze - Epic laesst keine Direktsuche zu, also wird Seite fuer
   * Seite gesucht. Das dauert ein paar Sekunden und steht deshalb hinter einem
   * Knopf statt hinter jedem Tastendruck.
   */
  const sucheImTurnier = useCallback(async () => {
    const q = teamSuche.trim();
    if (q.length < 2 || !eventId || !windowId) return;
    setSuchLaeuft(true);
    setSuchInfo('');
    setFunde(null);
    const grund = `/api/cup-leaderboard?event=${encodeURIComponent(eventId)}`
      + `&window=${encodeURIComponent(windowId)}`;
    try {
      // 1. Konten zum gepflegten Namen.
      let ids: string[] = [];
      try {
        const k = await (await fetch(
          `/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`)).json();
        ids = (k?.spieler ?? []).map((x: { epicId: string }) => x.epicId)
          .filter(Boolean).slice(0, 25);
      } catch { /* ohne Verzeichnis bleibt die Textsuche */ }

      const [ueberId, ueberText] = await Promise.all([
        ids.length
          ? fetch(`${grund}&ids=${encodeURIComponent(ids.join(','))}`).then((r) => r.json())
          : Promise.resolve({ entries: [] }),
        fetch(`${grund}&q=${encodeURIComponent(q)}`).then((r) => r.json()),
      ]);

      // Doppelte zusammenlegen: derselbe Platz ist dasselbe Team.
      const nachPlatz = new Map<number, Team>();
      for (const e of [...(ueberId.entries ?? []), ...(ueberText.entries ?? [])]) {
        if (!nachPlatz.has(e.rank)) {
          nachPlatz.set(e.rank, { rank: e.rank, spieler: e.players ?? [] });
        }
      }
      const liste = [...nachPlatz.values()].sort((a, b) => a.rank - b.rank);
      setFunde(liste);
      setSuchInfo(liste.length
        ? ''
        : t('Nicht dabei — dieser Spieler steht in diesem Spieltag nicht in der Liste.'));
    } catch (e) {
      setSuchInfo((e as Error).message);
    } finally {
      setSuchLaeuft(false);
    }
  }, [teamSuche, eventId, windowId, t]);

  const waehleTeam = (tm: Team) => {
    const zwei = tm.spieler.slice(0, 2);
    setDuo(zwei);
    setNamen([
      namensVorschlag(zwei[0]?.name ?? ''),
      namensVorschlag(zwei[1]?.name ?? ''),
    ]);
  };

  useEffect(() => {
    fetch('/api/konto', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setGespeicherte(j?.konto?.bannerVorlagen ?? []))
      .catch(() => {});
  }, []);

  const schreibeVorlagen = useCallback((liste: Gespeichert[]) => {
    setGespeicherte(liste);
    void fetch('/api/konto', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ was: 'aendern', bannerVorlagen: liste }),
    }).catch(() => {});
  }, []);

  /* ---------------------------------------------------------- Adresse */

  /*
   * Die eigene Adresse - erst nach dem ersten Zeichnen.
   *
   * Vorher stand hier
   *
   *     const basis = typeof window !== 'undefined' ? window.location.origin : '';
   *
   * und damit rechnete der Server mit "" und der Browser sofort mit
   * "http://localhost:3000". Die Vorschau bekam auf beiden Seiten eine
   * andere Adresse, und React meldete beim Uebernehmen einen Unterschied,
   * den es nicht mehr ausbessert ("some attributes ... didn't match").
   *
   * Die Adresse muss vollstaendig sein - sie wird nach OBS kopiert, und
   * dort hilft kein Pfad ohne Server. Also wird sie nachgereicht: der erste
   * Zeichenvorgang im Browser sieht dasselbe wie der Server, gleich danach
   * steht sie.
   */
  const [basis, setBasis] = useState('');
  useEffect(() => { setBasis(window.location.origin); }, []);

  /**
   * Die Adresse fuer OBS.
   *
   * "mit Region" heisst: kein fester Spieltag, das Banner sucht ihn sich. Genau
   * so werden Vorlagen gespeichert - eine Adresse, die naechste Woche noch
   * stimmt. Fuer einen bestimmten vergangenen Spieltag steht daneben die
   * feste Fassung.
   */
  const baueUrl = useCallback((mitRegion: boolean, w: {
    ids: string[]; namen: string[]; vorlage: string; klar: number; hoehe: number;
    abstand?: number;
    region: string; eventId?: string; windowId?: string;
  }) => {
    const p = new URLSearchParams();
    if (basis) p.set('server', basis);
    if (mitRegion) p.set('auto', w.region);
    else {
      if (w.eventId) p.set('event', w.eventId);
      if (w.windowId) p.set('window', w.windowId);
    }
    if (w.ids.length) p.set('id', w.ids.join(','));
    if (w.namen[0]) p.set('n1', w.namen[0]);
    if (w.namen[1]) p.set('n2', w.namen[1]);
    p.set('vorlage', w.vorlage);
    p.set('klar', String(w.klar));
    p.set('hoehe', String(w.hoehe));
    if (w.abstand !== undefined) p.set('abstand', String(w.abstand));
    return `${basis}/overlay/banner.html?${p.toString()}`;
  }, [basis]);

  const bannerUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (basis) p.set('server', basis);
    if (eventId) p.set('event', eventId);
    if (windowId) p.set('window', windowId);
    const ids = duo.map((s) => s.id).filter(Boolean);
    /*
     * Ein Duo geht ueber "id", mehrere ueber "teams".
     *
     * Getrennt gehalten, damit eine bestehende Adresse in OBS weiter gilt:
     * wer nur ein Duo zeigt, bekommt genau dieselbe Adresse wie bisher.
     */
    if (weitere.length && ids.length) {
      const alle = [{ ids, namen }, ...weitere];
      p.set('teams', alle.map((w) => w.ids.join(',')).join(';'));
      p.set('namen', alle.map((w) => `${w.namen[0] ?? ''},${w.namen[1] ?? ''}`).join(';'));
      p.set('wechsel', String(wechsel));
    } else {
      if (ids.length) p.set('id', ids.join(','));
      if (namen[0]) p.set('n1', namen[0]);
      if (namen[1]) p.set('n2', namen[1]);
    }
    p.set('vorlage', vorlage);
    p.set('klar', String(klar));
    p.set('hoehe', String(hoehe));
    if (abstand !== 18) p.set('abstand', String(abstand));
    return `${basis}/overlay/banner.html?${p.toString()}`;
  }, [basis, eventId, windowId, duo, namen, vorlage, klar, hoehe, abstand,
    weitere, wechsel]);

  const bestenlisteUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (basis) p.set('server', basis);
    if (eventId) p.set('event', eventId);
    if (windowId) p.set('window', windowId);
    // "from"/"to" heissen die Felder im Overlay - "top" kannte es nie.
    p.set('from', String(blVon));
    p.set('to', String(blBis));
    // Nur was abweicht, landet in der Adresse; sonst gilt die Vorlage.
    for (const [k, v] of Object.entries(blFarben)) {
      if (v !== (BL_STANDARD as Record<string, string>)[k]) p.set(k, v);
    }
    return `${basis}/overlay/leaderboard.html?${p.toString()}`;
    // BL_STANDARD ist eine Konstante und aendert sich nie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basis, eventId, windowId, blVon, blBis, blFarben]);

  async function kopiere(was: string) {
    try {
      await navigator.clipboard.writeText(was);
      setKopiert(t('Adresse kopiert — in OBS als Browser-Quelle einfügen.'));
      setTimeout(() => setKopiert(''), 4000);
    } catch {
      setKopiert(t('Bitte den Text markieren und mit Strg+C kopieren.'));
    }
  }

  /* ------------------------------------------------------------ Bild */

  if (!zugang.laedt && !zugang.vip) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 px-4
                       text-center text-slate-100">
        <div className="max-w-md">
          <h1 className="text-xl font-bold"><T>Nur für VIPs</T></h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            <T>Die Overlays sind Teil des VIP-Zugangs. Er wird vergeben, nicht
            freigeschaltet — mit einem gewöhnlichen Konto sind sie nicht
            zugänglich.</T>
          </p>
          <Link href="/anmelden"
            className="mt-6 inline-block rounded-lg bg-sky-500 px-5 py-2.5
                       text-sm font-semibold text-white transition
                       hover:bg-sky-400">
            <T>Zur Anmeldung</T>
          </Link>
        </div>
      </main>
    );
  }

  const feld = 'w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 '
    + 'text-sm text-slate-100 outline-none placeholder:text-slate-600 '
    + 'focus:border-sky-500';

  return (
    <main className="flex-1 bg-zinc-950 px-4 py-6 text-slate-200">
      <div className="mx-auto max-w-[1500px]">
        <h1 className="text-xl font-semibold text-slate-100"><T>Overlay</T></h1>
        <p className="mb-5 mt-1 text-sm text-slate-500">
          <T>Ein Banner für deinen Stream — Cup wählen, Duo wählen, fertig.</T>
        </p>

        {/* Die Vorschau bekommt die breitere Spalte.
            Vorher waren es 380 Punkte, und das Banner musste darin waagerecht
            gescrollt werden - man sah nie das ganze Bild. Links bleibt trotzdem
            genug: die Cupliste braucht keine 700 Punkte. */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(560px,44%)]">
          <div className="space-y-4">

            <Schritt nummer={1} titel="Cup und Spieltag">
              <div className="mb-3 flex flex-wrap gap-1">
                {REGIONEN.map((r) => (
                  <button key={r} onClick={() => setRegion(r)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium
                                transition ${r === region
                      ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                      : 'border-zinc-800 text-slate-400 hover:border-zinc-600'}`}>
                    {r}
                  </button>
                ))}
              </div>

              <input value={cupSuche} onChange={(e) => setCupSuche(e.target.value)}
                placeholder={t('Cup suchen — auch vergangene')}
                className={`${feld} mb-2`} />

              {ladeFehler && (
                <p className="rounded-lg border border-amber-800 bg-amber-950/30
                              px-3 py-2 text-xs text-amber-300">
                  {ladeFehler}
                  {loginNoetig && (
                    <> — <Link href="/admin" className="underline"><T>Epic-Anmeldung</T></Link></>
                  )}
                </p>
              )}

              <div className="space-y-1">
                {auswahl.zeig.map((w) => {
                  const wert = `${w.eventId}|${w.windowId}`;
                  return (
                    <button key={wert} onClick={() => setCup(wert)}
                      className={`flex w-full items-center gap-2 rounded-lg border
                                  px-3 py-2 text-left text-[13px] transition ${wert === cup
                        ? 'border-sky-500 bg-sky-500/10 text-slate-100'
                        : 'border-zinc-800 text-slate-300 hover:border-zinc-600'}`}>
                      {w.status === 'live' && (
                        <span className="rounded bg-rose-500 px-1.5 py-0.5 text-[9px]
                                         font-bold uppercase text-white">live</span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{lesbarerName(w)}</span>
                      <span className="shrink-0 text-[11px] text-slate-500">
                        {new Date(w.begin).toLocaleDateString(undefined,
                          { day: '2-digit', month: '2-digit' })}
                      </span>
                    </button>
                  );
                })}
                {!auswahl.zeig.length && !ladeFehler && (
                  <p className="py-3 text-center text-xs text-slate-600">
                    <T>Kein Spieltag gefunden.</T>
                  </p>
                )}
              </div>

              {!cupSuche && auswahl.alle.length > 8 && (
                <button onClick={() => setAlleZeigen((v) => !v)}
                  className="mt-2 text-[11px] text-slate-500 underline hover:text-slate-300">
                  {alleZeigen ? <T>weniger zeigen</T>
                    : <>{auswahl.alle.length - 8} <T>weitere zeigen</T></>}
                </button>
              )}
            </Schritt>

            <Schritt nummer={2} titel="Duo">
              <>
                  {/* Die Suche steht sofort da - man soll jeden suchen koennen,
                      ohne vorher irgendetwas zu laden. Sie geht durch die ganze Bestenliste und braucht
                      ein paar Sekunden - deshalb ein Knopf, nicht jeder
                      Tastendruck. */}
                  <div className="mb-2 flex gap-2">
                    <input value={teamSuche}
                      onChange={(e) => { setTeamSuche(e.target.value); setFunde(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') void sucheImTurnier(); }}
                      placeholder={t('Spieler suchen — auch Platz 12 000')}
                      className={feld} />
                    <button onClick={() => void sucheImTurnier()}
                      disabled={suchLaeuft || teamSuche.trim().length < 2}
                      className="shrink-0 rounded-lg border border-zinc-700 px-4 text-sm
                                 text-slate-300 transition hover:border-sky-500
                                 disabled:opacity-40">
                      {suchLaeuft ? <T>sucht …</T> : <T>Suchen</T>}
                    </button>
                  </div>
                  {suchInfo && (
                    <p className="mb-2 text-[11px] text-amber-300">{suchInfo}</p>
                  )}
                  {/* Die Spitze der Liste zum Durchsehen - eine Bequemlichkeit
                      neben der Suche, kein Weg, den man gehen muss. */}
                  {teamFuer !== cup && !funde && (
                    <button onClick={() => void ladeTeams()} disabled={!cup || teamLaedt}
                      className="mb-2 text-[11px] text-slate-500 underline
                                 hover:text-slate-300 disabled:opacity-40">
                      {teamLaedt ? <T>lädt …</T> : <T>oder die Besten dieses Spieltags zeigen</T>}
                    </button>
                  )}

                  <div className="max-h-64 space-y-1 overflow-y-auto">
                    {treffer.map((tm) => (
                      <button key={tm.rank} onClick={() => waehleTeam(tm)}
                        className="flex w-full items-center gap-2 rounded-lg border
                                   border-zinc-800 px-3 py-2 text-left text-[13px]
                                   text-slate-300 transition hover:border-sky-700">
                        <span className="w-8 shrink-0 text-[11px] text-slate-500">
                          #{tm.rank}
                        </span>
                        {/*
                          * Kein Foto heisst kein Bild - kein Ersatzbild.
                          *
                          * Vorher stand hier eine graue Silhouette. Die sagt
                          * nichts, ausser dass etwas fehlt, und sie sah aus
                          * wie ein Spieler ohne Gesicht. Der Betreiber dazu:
                          * "Leute, die kein Profilbild haben, musst Du auch
                          * nicht mit Profilbild hochladen ... das soll nicht
                          * gezeigt werden."
                          */}
                        {tm.spieler.slice(0, 2).map((s) => (s.img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={s.id} src={s.img} alt=""
                            className="h-6 w-6 shrink-0 rounded object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }} />
                        ) : null))}
                        <span className="min-w-0 flex-1 truncate">
                          {tm.spieler.map((s) => namensVorschlag(s.name)).join(' + ')}
                        </span>
                        {funde && (
                          <span className="shrink-0 text-[10px] text-slate-600">
                            <T>gespielt</T>
                          </span>
                        )}
                      </button>
                    ))}
                    {!treffer.length && !suchLaeuft && (
                      <p className="py-3 text-center text-xs text-slate-600">
                        <T>Namen eintippen und suchen.</T>
                      </p>
                    )}
                  </div>
              </>

              {/* Die beiden Namen, wie sie im Banner stehen sollen. */}
              {duo.length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {duo.map((s, i) => (
                    <label key={s.id} className="text-[11px] text-slate-500">
                      <T>Angezeigter Name</T>
                      <span className="ml-1 text-slate-600">({s.name})</span>
                      <input value={namen[i] ?? ''}
                        onChange={(e) => setNamen((a) => (i === 0
                          ? [e.target.value, a[1]] : [a[0], e.target.value]))}
                        className={`${feld} mt-1`} />
                    </label>
                  ))}
                </div>
              )}

              {/*
                * Mehrere Duos in einer einzigen OBS-Quelle.
                *
                * Steht bewusst hier unter dem Duo und nicht als eigener
                * Schritt: es ist dieselbe Entscheidung, nur mehrfach. Das
                * oben gewaehlte Duo ist immer das erste, was hier dazukommt
                * folgt danach - und das Banner wechselt im eingestellten
                * Takt mit einem Uebergang durch.
                */}
              {duo.length > 0 && (
                <div className="mt-4 rounded-lg border border-zinc-800 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400">
                      <T>Mehrere Duos in einem Overlay</T>
                    </span>
                    <button
                      onClick={() => setWeitere((a) => (a.some((w) =>
                        w.ids.join() === duo.map((x) => x.id).join())
                        ? a
                        : [...a, {
                          ids: duo.map((x) => x.id),
                          namen: [namen[0] ?? '', namen[1] ?? ''] as [string, string],
                          etikett: duo.map((x, i) => (namen[i] || namensVorschlag(x.name)))
                            .join(' + '),
                        }]))}
                      className="rounded-lg bg-sky-500 px-3 py-1 text-xs font-medium
                                 text-white transition hover:bg-sky-400">
                      <T>Dieses Duo dazunehmen</T>
                    </button>
                  </div>

                  {weitere.length === 0 ? (
                    <p className="text-[11px] leading-relaxed text-slate-500">
                      <T>Noch keins dazugenommen — das Banner zeigt nur das Duo von oben.
                      Nimm weitere dazu, dann wechselt es der Reihe nach durch.</T>
                    </p>
                  ) : (
                    <>
                      <ul className="mb-2 space-y-1">
                        <li className="flex items-center gap-2 rounded border
                                       border-zinc-800 px-2 py-1 text-[11px] text-slate-400">
                          <span className="w-5 text-slate-600">1.</span>
                          <span className="min-w-0 flex-1 truncate text-slate-300">
                            {duo.map((x, i) => (namen[i] || namensVorschlag(x.name))).join(' + ')}
                          </span>
                          <span className="text-slate-600"><T>von oben</T></span>
                        </li>
                        {weitere.map((w, i) => (
                          <li key={w.ids.join()}
                            className="flex items-center gap-2 rounded border
                                       border-zinc-800 px-2 py-1 text-[11px]">
                            <span className="w-5 text-slate-600">{i + 2}.</span>
                            <span className="min-w-0 flex-1 truncate text-slate-300">
                              {w.etikett}
                            </span>
                            <button
                              onClick={() => setWeitere((a) => a.filter((_, j) => j !== i))}
                              className="text-slate-500 transition hover:text-red-400">
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                      <label className="block text-[11px] text-slate-500">
                        <T>Sekunden je Duo</T>
                        <span className="ml-2 tabular-nums text-slate-300">{wechsel} s</span>
                        <input type="range" min={3} max={30} value={wechsel}
                          onChange={(e) => setWechsel(Number(e.target.value))}
                          className="mt-1 w-full accent-sky-500" />
                      </label>
                    </>
                  )}
                </div>
              )}
            </Schritt>

            <Schritt nummer={3} titel="Aussehen">
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {VORLAGEN.map((v) => (
                  <button key={v.id} onClick={() => setVorlage(v.id)}
                    className={`overflow-hidden rounded-lg border transition ${
                      v.id === vorlage ? 'border-sky-500' : 'border-zinc-800 hover:border-zinc-600'}`}>
                    <span className="flex h-10 items-center justify-center gap-1"
                      style={{ background: v.grund }}>
                      <span className="h-1.5 w-8 rounded"
                        style={{ background: v.schrift, opacity: .85 }} />
                      <span className="h-1.5 w-4 rounded" style={{ background: v.akzent }} />
                    </span>
                    <span className="block py-1 text-[11px] text-slate-400">{t(v.titel)}</span>
                  </button>
                ))}
              </div>

              <label className="mb-3 block text-[11px] text-slate-500">
                <T>Wie deckend die Mitte ist</T>
                <span className="ml-2 tabular-nums text-slate-300">{klar}%</span>
                <input type="range" min={0} max={100} value={klar}
                  onChange={(e) => setKlar(Number(e.target.value))}
                  className="mt-1 w-full accent-sky-500" />
              </label>

              <label className="mb-3 block text-[11px] text-slate-500">
                <T>Abstand zwischen Bild und Text</T>
                <span className="ml-2 tabular-nums text-slate-300">{abstand} px</span>
                {/* Von der Voreinstellung nach oben statt in beide
                    Richtungen: bei 8 bis 64 lag der Ausgangswert 18 fast am
                    linken Anschlag, ein Schubs nach links aenderte drei
                    Punkte und sah aus, als tue der Regler nichts. Jetzt
                    zieht jede Bewegung sichtbar auseinander. */}
                <input type="range" min={18} max={96} value={abstand}
                  onChange={(e) => setAbstand(Number(e.target.value))}
                  className="mt-1 w-full accent-sky-500" />
              </label>

              <label className="block text-[11px] text-slate-500">
                <T>Höhe</T>
                <span className="ml-2 tabular-nums text-slate-300">{hoehe} px</span>
                <input type="range" min={70} max={180} value={hoehe}
                  onChange={(e) => setHoehe(Number(e.target.value))}
                  className="mt-1 w-full accent-sky-500" />
              </label>
            </Schritt>
          </div>

          {/* Vorschau und Adresse bleiben beim Scrollen stehen. */}
          <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-100">
                <T>Vorschau</T>
              </h2>
              {/* Ein karierter Grund zeigt, was im Stream durchsichtig bleibt. */}
              <div className="overflow-hidden rounded-lg p-3"
                style={{
                  backgroundImage:
                    'repeating-conic-gradient(#27272a 0% 25%, #18181b 0% 50%)',
                  backgroundSize: '16px 16px',
                }}>
                {/* Das Banner ist nur so breit wie sein Inhalt und sitzt in
                    der Vorschau mittig - so sieht man es ganz, ohne zu
                    schieben. */}
                <iframe key={bannerUrl} src={bannerUrl} title="Vorschau"
                  scrolling="no"
                  className="block w-full border-0"
                  style={{ height: hoehe + 8 }} />
              </div>

              <div className="mt-3 flex gap-2">
                <input readOnly value={bannerUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className={`${feld} font-mono text-[10px]`} />
                <button onClick={() => void kopiere(bannerUrl)}
                  className="shrink-0 rounded-lg bg-sky-500 px-4 text-sm font-medium
                             text-white transition hover:bg-sky-400">
                  <T>Kopieren</T>
                </button>
              </div>
              {kopiert && (
                <p className="mt-2 text-[11px] text-emerald-400">{kopiert}</p>
              )}
            </section>

            {/* Gespeicherte Vorlagen. Ohne Spieltag - siehe oben. */}
            <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <h2 className="mb-1 text-sm font-semibold text-slate-100">
                <T>Meine Vorlagen</T>
              </h2>
              <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
                <T>Gespeichert werden Duo und Aussehen — nicht der Cup. Die
                Adresse zeigt immer auf den aktuellen Spieltag deiner Region.</T>
              </p>

              <div className="mb-3 flex gap-2">
                <input value={neuerTitel} onChange={(e) => setNeuerTitel(e.target.value)}
                  placeholder={t('Name der Vorlage')} className={feld} />
                <button
                  disabled={!neuerTitel.trim() || !duo.length}
                  onClick={() => {
                    schreibeVorlagen([{
                      id: `v${Date.now().toString(36)}`,
                      titel: neuerTitel.trim(),
                      region,
                      ids: duo.map((sp) => sp.id).filter(Boolean),
                      namen: [namen[0], namen[1]],
                      vorlage, klar, hoehe,
                    }, ...gespeicherte].slice(0, 20));
                    setNeuerTitel('');
                  }}
                  className="shrink-0 rounded-lg bg-sky-500 px-4 text-sm font-medium
                             text-white transition hover:bg-sky-400 disabled:opacity-40">
                  <T>Speichern</T>
                </button>
              </div>

              <div className="space-y-1">
                {gespeicherte.map((v) => (
                  <div key={v.id}
                    className="flex items-center gap-2 rounded-lg border border-zinc-800
                               px-3 py-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate text-slate-200">
                      {v.titel}
                      <span className="ml-2 text-[11px] text-slate-600">
                        {v.namen.filter(Boolean).join(' + ')} · {v.region}
                      </span>
                    </span>
                    <button onClick={() => void kopiere(baueUrl(true, v))}
                      className="shrink-0 text-[11px] text-sky-400 underline
                                 hover:text-sky-300">
                      <T>Adresse</T>
                    </button>
                    <button
                      onClick={() => {
                        setRegion(v.region);
                        setDuo(v.ids.map((id, i) => ({ id, name: v.namen[i] ?? '' })));
                        setNamen([v.namen[0] ?? '', v.namen[1] ?? '']);
                        setVorlage(v.vorlage); setKlar(v.klar); setHoehe(v.hoehe);
                      }}
                      className="shrink-0 text-[11px] text-slate-400 underline
                                 hover:text-slate-200">
                      <T>laden</T>
                    </button>
                    <button
                      onClick={() => schreibeVorlagen(
                        gespeicherte.filter((x) => x.id !== v.id))}
                      title={t('Vorlage löschen')}
                      className="shrink-0 text-slate-600 transition hover:text-rose-400">
                      ×
                    </button>
                  </div>
                ))}
                {!gespeicherte.length && (
                  <p className="py-2 text-[11px] text-slate-600">
                    <T>Noch nichts gespeichert.</T>
                  </p>
                )}
              </div>
            </section>

            {/* Die ausfuehrliche Bestenliste ist ein eigenes Overlay - eine
                zweite Browser-Quelle in OBS, die man ein- und ausblendet. */}
            <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-100">
                <T>Bestenliste als zweites Overlay</T>
              </summary>
              <p className="mb-3 mt-2 text-[11px] leading-relaxed text-slate-500">
                <T>Die ganze Tabelle des Spieltags — als eigene Browser-Quelle,
                die du in OBS ein- und ausblendest.</T>
              </p>
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([['text', 'Schrift'], ['bg', 'Hintergrund'],
                  ['bg2', 'Zweiter Hintergrund'], ['accent', 'Akzent']] as const)
                  .map(([schluessel, titel]) => (
                    <label key={schluessel}
                      className="flex items-center gap-2 rounded-lg border
                                 border-zinc-800 px-2 py-1.5 text-[11px] text-slate-400">
                      <input type="color"
                        value={blFarben[schluessel as keyof typeof blFarben]}
                        onChange={(e) => setBlFarben((a) => ({
                          ...a, [schluessel]: e.target.value,
                        }))}
                        className="h-6 w-6 shrink-0 cursor-pointer rounded border-0
                                   bg-transparent p-0" />
                      <span className="truncate"><T>{titel}</T></span>
                    </label>
                  ))}
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-[11px] text-slate-500">
                  <T>Von Platz</T>
                  <input type="number" min={1} max={50} value={blVon}
                    onChange={(e) => {
                      const v = Math.min(50, Math.max(1, Number(e.target.value) || 1));
                      setBlVon(v);
                      if (v > blBis) setBlBis(v);
                    }}
                    className={`${feld} w-16 text-center`} />
                </label>
                <label className="flex items-center gap-2 text-[11px] text-slate-500">
                  <T>bis</T>
                  <input type="number" min={1} max={50} value={blBis}
                    onChange={(e) => {
                      const v = Math.min(50, Math.max(1, Number(e.target.value) || 1));
                      setBlBis(v);
                      if (v < blVon) setBlVon(v);
                    }}
                    className={`${feld} w-16 text-center`} />
                </label>
                <button
                  onClick={() => { setBlFarben({ ...BL_STANDARD }); setBlVon(1); setBlBis(10); }}
                  className="text-[11px] text-slate-500 underline transition
                             hover:text-sky-400">
                  <T>zurücksetzen</T>
                </button>
              </div>

              {/* Dieselbe Vorschau wie oben, nur fuer das zweite Overlay. */}
              <div className="mb-3 overflow-hidden rounded-lg border border-zinc-800"
                style={{ background:
                  'repeating-conic-gradient(#27272a 0% 25%, #18181b 0% 50%) 50%/16px 16px' }}>
                <iframe key={bestenlisteUrl} src={bestenlisteUrl} title="Vorschau"
                  scrolling="no" className="block w-full border-0"
                  style={{ height: Math.min(520, 64 + (blBis - blVon + 1) * 30) }} />
              </div>

              <div className="flex gap-2">
                <input readOnly value={bestenlisteUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className={`${feld} font-mono text-[10px]`} />
                <button onClick={() => void kopiere(bestenlisteUrl)}
                  className="shrink-0 rounded-lg border border-zinc-700 px-4 text-sm
                             text-slate-300 transition hover:border-sky-500">
                  <T>Kopieren</T>
                </button>
              </div>
            </details>
          </div>
        </div>
      </div>
    </main>
  );
}
