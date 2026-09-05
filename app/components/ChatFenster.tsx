'use client';

/*
 * Das Gespraech mit dem Betreiber - links am Rand.
 *
 * Aus dem Kontaktformular wurde eine Einbahnstrasse: jemand schrieb, und wer
 * eine Antwort wollte, wartete auf eine Mail. Der Betreiber wollte das im
 * Werkzeug haben - "dass ich ja auch im Tool selber zurueckantworten kann und
 * es dann eine Art Live-Chat gibt", mit einem Chatsymbol am Rand und einer
 * Zahl, wenn jemand geschrieben hat.
 *
 * Beide Seiten sehen dasselbe Fenster: der Betreiber alle Gespraeche, jeder
 * andere seine eigenen. Wer nichts laufen hat, sieht auch keinen Knopf - ein
 * leeres Chatfenster waere nur ein Kaestchen, das niemand braucht.
 *
 * Die Gegenstelle liegt bei den Sprachschaltern unten rechts; dieses Fenster
 * kommt bewusst von links, damit sich die beiden nie ins Gehege kommen.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import T from './T';
import { useT } from './SprachProvider';
import { liesChatHud, setzeChatHud, CHAT_HUD_EREIGNIS } from '@/app/lib/chatHud';

interface Nachricht {
  id: string; zeit: number; von: 'nutzer' | 'betreiber';
  name: string; text: string; bilder: string[];
}

interface Teilnehmer { id: string; name: string }

interface Gespraech {
  id: string; zeit: number; thema: string; eigenesThema: string;
  erledigt: boolean; vonName: string; vonEmail: string;
  vonVip: boolean; vonRolle: string | null; vonBestaetigt: boolean;
  teilnehmer: Teilnehmer[]; gruppe: boolean; darfVerlassen: boolean;
  darfSchreiben: boolean;
  verlauf: Nachricht[]; zuletzt: number; ungelesen: number;
}

interface Nutzer { id: string; name: string; rolle: string | null }

/** Wie oft nachgefragt wird - offen haeufiger als geschlossen. */
const TAKT_ZU_MS = 30_000;
const TAKT_OFFEN_MS = 5_000;

/*
 * Eine eigene Farbe je Person.
 *
 * In einem Gespraech zu zweit reicht links und rechts. Sobald der Betreiber
 * jemanden dazuholt, reicht es nicht mehr: dann stehen drei Leute in einem
 * Verlauf, und an der Seite allein ist nicht zu erkennen, wer was geschrieben
 * hat. Der Betreiber dazu: "man weiss nicht genau, wer geschrieben hat."
 *
 * Die Farbe kommt aus dem Namen, nicht aus einer laufenden Nummer: derselbe
 * Mensch bekommt dadurch in jedem Gespraech dieselbe Farbe, auch wenn er dort
 * als Dritter statt als Erster auftaucht. Nur die Schriftfarbe, kein Kreis davor: der Betreiber fand das
 * Profilbildartige stoerend, und der Name allein reicht. Die Klassennamen stehen ausgeschrieben
 * da, weil Tailwind sie sonst nicht findet - zusammengesetzte Namen fallen beim
 * Bauen heraus.
 */
const FARBEN = [
  'text-sky-300',
  'text-emerald-300',
  'text-amber-300',
  'text-rose-300',
  'text-violet-300',
  'text-cyan-300',
  'text-lime-300',
  'text-orange-300',
];

/** Der Betreiber hat immer dieselbe Farbe - er kommt in jedem Gespraech vor. */
const BETREIBER_FARBE = FARBEN[0];

function farbeFuer(name: string, vonBetreiber: boolean) {
  if (vonBetreiber) return BETREIBER_FARBE;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  // Die erste Farbe gehoert dem Betreiber, die anderen werden verteilt.
  return FARBEN[1 + (h % (FARBEN.length - 1))];
}

const THEMENNAME: Record<string, string> = {
  support: 'Support', report: 'Report', feedback: 'Feedback', hilfe: 'Hilfe',
  idee: 'Idee', anderes: 'Anderes',
};

/**
 * Das Chatfenster.
 *
 * Zwei Erscheinungsformen aus einem Bauteil: schwebend am Rand, und als ganze
 * Seite unter /nachrichten. Der Betreiber wollte beides - "einen Chatbalken,
 * wo ich alle meine Chats noch mal angucken kann, so wie ein Archiv", ohne
 * jedesmal ueber das Symbol gehen zu muessen. Zwei getrennte Fassungen waeren
 * zwei Stellen, an denen jede kuenftige Aenderung passieren muesste - und
 * irgendwann waere eine davon vergessen worden.
 */
export default function ChatFenster({ alsSeite = false }: { alsSeite?: boolean }) {
  const t = useT();
  const [offen, setOffen] = useState(alsSeite);
  const [gespraeche, setGespraeche] = useState<Gespraech[]>([]);
  const [ungelesen, setUngelesen] = useState(0);
  const [darf, setDarf] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [entwurf, setEntwurf] = useState('');
  const [sendet, setSendet] = useState(false);
  /** Bilder, die mit der naechsten Nachricht hinausgehen. */
  const [anhaenge, setAnhaenge] = useState<string[]>([]);
  /** Welches Bild gerade gross angesehen wird. */
  const [gross, setGross] = useState<string | null>(null);
  /** Antwort auf einen Befehl - nur fuer den Betreiber, nicht im Verlauf. */
  const [hinweis, setHinweis] = useState<string | null>(null);

  /*
   * Eine neue Gruppe zusammenstellen.
   *
   * Es gibt den Befehl /new, aber der setzt voraus, dass man die Namen
   * auswendig weiss. Der Betreiber wollte suchen koennen: "dann werden sie
   * mir angezeigt, wenn es da viele Leute gibt, und dann kann ich sie
   * hinzufuegen."
   */
  const [neuOffen, setNeuOffen] = useState(false);
  const [suche, setSuche] = useState('');
  const [treffer, setTreffer] = useState<Nutzer[]>([]);
  const [gewaehlteNutzer, setGewaehlteNutzer] = useState<Nutzer[]>([]);
  const [legtAn, setLegtAn] = useState(false);

  /*
   * Wonach die Liste gefiltert wird.
   *
   * Nur fuer den Betreiber: bei ihm laufen alle Meldungen zusammen, und wer
   * gerade Fehlerberichte abarbeitet, will nicht zwischen Lob und Ideen
   * suchen. Wer nur seine eigenen zwei Gespraeche hat, braucht das nicht.
   */
  const [filter, setFilter] = useState<string>('alle');

  /*
   * Offen oder erledigt.
   *
   * Zwei Fragen, zwei Filter: das Thema sagt, worum es geht, der Stand sagt,
   * ob noch etwas zu tun ist. In einen Filter gepresst waere "Support" und
   * "erledigt" ein Widerspruch, den man nicht zugleich waehlen koennte.
   *
   * Voreingestellt ist "alle" - wer ein geschlossenes Gespraech sucht, soll
   * es sehen, ohne erst einen Schalter zu finden.
   */
  /*
   * Am Rand nur Laufendes, im Archiv alles.
   *
   * Das schwebende Fenster ist fuer das, was gerade ansteht - ein
   * abgeschlossenes Gespraech dort waere nur eine Zeile, die im Weg steht.
   * Wer eines sucht, geht ins Archiv unter /nachrichten und sucht bewusst.
   */
  const [stand, setStand] = useState<'alle' | 'offen' | 'erledigt'>(
    alsSeite ? 'alle' : 'offen');

  /*
   * Namen vorschlagen, waehrend getippt wird.
   *
   * Wer jemanden dazuholen will, weiss den Namen selten auf den Buchstaben
   * genau. Ein "@ju" oder "/add ju" zeigt deshalb, wer mit ju anfaengt - so
   * wie man es aus jedem anderen Chat kennt.
   */
  const [vorschlaege, setVorschlaege] = useState<Nutzer[]>([]);

  /** Austreten - mit Rueckfrage und Grund. */
  const [verlassenOffen, setVerlassenOffen] = useState(false);
  const [verlassenGrund, setVerlassenGrund] = useState('');
  const endeRef = useRef<HTMLDivElement | null>(null);

  /*
   * Steht der Knopf am Rand?
   *
   * null heisst "noch nicht gelesen". Erst nach dem Zusammenfuegen im Browser
   * steht fest, was jemand eingestellt hat - haette man hier "ja" angenommen,
   * blitzte der Knopf bei jedem Seitenaufruf kurz auf, obwohl er weg sein
   * soll.
   */
  const [amRand, setAmRand] = useState<boolean | null>(null);
  useEffect(() => {
    setAmRand(liesChatHud());
    const beiAenderung = (e: Event) => setAmRand((e as CustomEvent).detail !== false);
    window.addEventListener(CHAT_HUD_EREIGNIS, beiAenderung);
    // Wurde es in einem anderen Tab umgestellt, gilt es auch hier.
    const beiSpeicher = () => setAmRand(liesChatHud());
    window.addEventListener('storage', beiSpeicher);
    return () => {
      window.removeEventListener(CHAT_HUD_EREIGNIS, beiAenderung);
      window.removeEventListener('storage', beiSpeicher);
    };
  }, []);

  /* --------------------------------------------------------------- Holen */

  const holen = useCallback(async (nurZahl: boolean) => {
    try {
      const r = await fetch(`/api/kontakt/chat${nurZahl ? '?zahl=1' : ''}`,
        { cache: 'no-store' });
      if (!r.ok) { setDarf(false); return; }
      const j = await r.json();
      setDarf(true);
      setAdmin(Boolean(j.admin));
      setUngelesen(Number(j.ungelesen ?? 0));
      if (!nurZahl && Array.isArray(j.gespraeche)) setGespraeche(j.gespraeche);
    } catch { /* Netz weg: beim naechsten Takt wieder */ }
  }, []);

  // Beim ersten Zeichnen einmal alles, danach nur noch die Zahl. Wer nichts
  // laufen hat, soll auch keinen Knopf sehen - dafuer braucht es die Liste.
  useEffect(() => { void holen(false); }, [holen]);

  useEffect(() => {
    const uhr = setInterval(() => { void holen(!offen); },
      offen ? TAKT_OFFEN_MS : TAKT_ZU_MS);
    return () => clearInterval(uhr);
  }, [offen, holen]);

  /*
   * Die offene Leitung.
   *
   * Der Takt oben ist damit nur noch das Netz fuer den Fall, dass die
   * Verbindung abreisst. Solange sie steht, meldet sich der Server von selbst,
   * sobald jemand etwas geschrieben hat - zwischen "abgeschickt" und "steht
   * beim anderen auf dem Schirm" liegt dann weniger als eine Sekunde statt
   * bis zu fuenf.
   */
  useEffect(() => {
    if (!darf) return;
    let lebt = true;
    let quelle: EventSource | null = null;
    try {
      quelle = new EventSource('/api/kontakt/chat/live');
      quelle.onmessage = () => { if (lebt) void holen(false); };
      // Bei einem Fehler verbindet die Ereignisquelle von selbst neu.
      quelle.onerror = () => {};
    } catch { /* kein EventSource: dann bleibt es beim Takt */ }
    return () => { lebt = false; quelle?.close(); };
  }, [darf, holen]);

  // Beim Zurueckkommen sofort nachsehen: Browser drosseln Zeitgeber in
  // verborgenen Tabs bis auf einen Lauf je Minute.
  useEffect(() => {
    const beimAnschauen = () => {
      if (document.visibilityState === 'visible') void holen(!offen);
    };
    document.addEventListener('visibilitychange', beimAnschauen);
    return () => document.removeEventListener('visibilitychange', beimAnschauen);
  }, [offen, holen]);

  const aktuell = gespraeche.find((g) => g.id === gewaehlt) ?? null;

  /*
   * Was in der Liste steht, und in welcher Reihenfolge.
   *
   * VIPs zuerst - so wollte es der Betreiber: "alle VIPs kommen immer nach
   * oben, alle anderen sind unten." Innerhalb der beiden Gruppen zaehlt, wo
   * zuletzt etwas geschah; wer gerade schreibt, soll nicht nach unten
   * rutschen, nur weil er kein VIP ist.
   *
   * Ungelesenes schlaegt beides: eine unbeantwortete Frage soll nicht
   * deshalb untergehen, weil sie von jemandem ohne Rang kam.
   */
  const gezeigt = gespraeche
    .filter((g) => filter === 'alle' || g.thema === filter)
    .filter((g) => stand === 'alle'
      || (stand === 'offen' ? !g.erledigt : g.erledigt))
    .slice()
    .sort((a, b) => {
      if ((a.ungelesen > 0) !== (b.ungelesen > 0)) return a.ungelesen > 0 ? -1 : 1;
      if (a.vonVip !== b.vonVip) return a.vonVip ? -1 : 1;
      // Wer seine Adresse bestaetigt hat, ist erreichbar - eine Antwort dorthin
      // kommt an. Das ist der ganze Vorzug des Hakens.
      if (a.vonBestaetigt !== b.vonBestaetigt) return a.vonBestaetigt ? -1 : 1;
      return b.zuletzt - a.zuletzt;
    });

  /** Wie viele Gespraeche auf ein Thema entfallen - fuer die Zahl am Filter. */
  const zahlJeThema = (thema: string) => (thema === 'alle'
    ? gespraeche.length
    : gespraeche.filter((g) => g.thema === thema).length);

  // Ans Ende springen, sobald ein Gespraech offen ist oder etwas dazukommt.
  useEffect(() => {
    if (offen && aktuell) endeRef.current?.scrollIntoView({ block: 'end' });
  }, [offen, aktuell?.verlauf.length, gewaehlt]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Ein Gespraech oeffnen und als gelesen vermerken. */
  const oeffne = useCallback(async (id: string) => {
    setGewaehlt(id);
    // Sofort auf null setzen, damit die Zahl nicht bis zum naechsten Takt
    // stehenbleibt, obwohl man gerade hinsieht.
    setGespraeche((alt) => alt.map((g) => (g.id === id ? { ...g, ungelesen: 0 } : g)));
    setUngelesen((n) => Math.max(0, n - (gespraeche.find((g) => g.id === id)?.ungelesen ?? 0)));
    try {
      await fetch('/api/kontakt/chat', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch { /* dann beim naechsten Oeffnen */ }
  }, [gespraeche]);

  /*
   * Ein Bild aufnehmen - aus der Dateiwahl oder aus der Zwischenablage.
   *
   * Strg+V ist der Weg, den die meisten nehmen: Bildschirmausschnitt machen,
   * ins Fenster einfuegen, fertig. Wer die Datei erst speichern muss, schickt
   * am Ende keins mit - und gerade bei einem Fehlerbericht sagt ein Bild mehr
   * als drei Saetze.
   */
  const nimmDatei = useCallback((datei: File) => {
    if (!datei.type.startsWith('image/')) return;
    // Fuenf Megabyte je Bild - dieselbe Grenze wie im Kontaktformular.
    if (datei.size > 5 * 1024 * 1024) return;
    const leser = new FileReader();
    leser.onload = () => setAnhaenge((a) => (a.length >= 4 ? a : [...a, String(leser.result)]));
    leser.readAsDataURL(datei);
  }, []);

  useEffect(() => {
    if (!offen) return;
    const rein = (e: ClipboardEvent) => {
      const datei = [...(e.clipboardData?.items ?? [])]
        .find((i) => i.type.startsWith('image/'))?.getAsFile();
      if (datei) { e.preventDefault(); nimmDatei(datei); }
    };
    window.addEventListener('paste', rein);
    return () => window.removeEventListener('paste', rein);
  }, [offen, nimmDatei]);

  /*
   * Konten suchen, waehrend getippt wird.
   *
   * Mit kurzer Verzoegerung: bei jedem Tastendruck zu fragen waere ein
   * Dutzend Anfragen fuer einen Namen. Ohne Suchbegriff kommen die letzten
   * zwanzig - man will ja auch stoebern koennen.
   */
  useEffect(() => {
    if (!neuOffen || !admin) return;
    let lebt = true;
    const uhr = setTimeout(() => {
      void (async () => {
        try {
          const r = await fetch(`/api/kontakt/chat?nutzer=${encodeURIComponent(suche)}`);
          if (!r.ok) return;
          const j = await r.json();
          if (lebt) setTreffer(j.nutzer ?? []);
        } catch { /* dann bleibt die Liste, wie sie ist */ }
      })();
    }, 250);
    return () => { lebt = false; clearTimeout(uhr); };
  }, [neuOffen, admin, suche]);

  /** Die zusammengestellte Gruppe anlegen und gleich hineingehen. */
  async function gruppeAnlegen() {
    if (!gewaehlteNutzer.length || legtAn) return;
    setLegtAn(true);
    try {
      const r = await fetch('/api/kontakt/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neu: true, teilnehmer: gewaehlteNutzer.map((n) => n.id) }),
      });
      if (r.ok) {
        const j = await r.json();
        await holen(false);
        setNeuOffen(false);
        setGewaehlteNutzer([]);
        setSuche('');
        if (j.gespraech?.id) setGewaehlt(j.gespraech.id);
      }
    } catch { /* dann eben nicht - der Knopf bleibt stehen */ }
    finally { setLegtAn(false); }
  }

  /**
   * Ein Gespraech schliessen oder wieder aufmachen.
   *
   * Geht ueber denselben Weg wie der Befehl /close - eine zweite Schnittstelle
   * fuer dieselbe Sache waeren zwei Stellen, an denen sich das Verhalten
   * auseinanderentwickeln koennte.
   */
  async function standWechseln(warErledigt: boolean) {
    if (!gewaehlt) return;
    try {
      await fetch('/api/kontakt/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gewaehlt, text: warErledigt ? '/open' : '/close' }),
      });
    } catch { /* dann eben nicht */ }
    void holen(false);
  }

  /** Aus einer Gruppe austreten, mit Grund. */
  async function verlassen() {
    if (!gewaehlt) return;
    try {
      await fetch('/api/kontakt/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gewaehlt, verlassen: true, grund: verlassenGrund }),
      });
    } catch { /* trotzdem schliessen - beim naechsten Laden steht der Stand */ }
    setVerlassenOffen(false);
    setVerlassenGrund('');
    setGewaehlt(null);
    void holen(false);
  }

  /*
   * Was gerade angefangen wurde: "@ju" oder "/add ju" am Ende des Entwurfs.
   *
   * Nur am Ende - mitten im Satz waere jedes @ ein Vorschlagsfenster, und
   * eine Mailadresse enthaelt eins.
   */
  const angefangen = (() => {
    const t = entwurf;
    const m = /(?:^|\s)@([\p{L}\p{N}_.-]{1,24})$/u.exec(t)
      || /^\/(?:add|remove|new|neu|raus)\s+(?:[^\s]+\s+)*([\p{L}\p{N}_.-]{1,24})$/u.exec(t);
    return m ? m[1] : null;
  })();

  useEffect(() => {
    if (!admin || !angefangen) { setVorschlaege([]); return; }
    let lebt = true;
    const uhr = setTimeout(() => {
      void (async () => {
        try {
          const r = await fetch(
            `/api/kontakt/chat?nutzer=${encodeURIComponent(angefangen)}`);
          if (!r.ok) return;
          const j = await r.json();
          if (lebt) setVorschlaege((j.nutzer ?? []).slice(0, 6));
        } catch { /* dann eben keine Vorschlaege */ }
      })();
    }, 200);
    return () => { lebt = false; clearTimeout(uhr); };
  }, [admin, angefangen]);

  /** Einen Vorschlag uebernehmen - das angefangene Wort wird ersetzt. */
  function uebernimmVorschlag(name: string) {
    if (!angefangen) return;
    const bis = entwurf.length - angefangen.length;
    setEntwurf(entwurf.slice(0, bis) + name + ' ');
    setVorschlaege([]);
  }

  /** Eine Anfrage stellen, ein abgeschlossenes Gespraech wieder aufzumachen. */
  async function anfrageSenden() {
    const text = entwurf.trim();
    if (!text || !gewaehlt || sendet) return;
    setSendet(true);
    try {
      const r = await fetch('/api/kontakt/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: gewaehlt, anfrage: true, text }),
      });
      if (r.ok) { setEntwurf(''); setHinweis(null); void holen(false); }
    } catch { /* stehen lassen, damit nichts verlorengeht */ }
    finally { setSendet(false); }
  }

  async function senden() {
    const text = entwurf.trim();
    // Ein Bild allein ist auch eine Nachricht - dann steht eben kein Satz
    // dabei. Der Server verlangt allerdings Text, also geht ein Punkt mit.
    if ((!text && anhaenge.length === 0) || !gewaehlt || sendet) return;
    setSendet(true);
    try {
      const r = await fetch('/api/kontakt/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: gewaehlt,
          text: text || '📷',
          bilder: anhaenge,
        }),
      });
      if (r.ok) {
        const j = await r.json();
        setEntwurf('');
        setAnhaenge([]);
        // Die Antwort auf einen Befehl steht ueber dem Schreibfeld, nicht im
        // Verlauf: der Gegenueber muss nicht sehen, dass jemand eine Liste
        // abgerufen hat.
        setHinweis(j.hinweis ?? null);
        if (j.gespraech) {
          setGespraeche((alt) => alt.map((g) => (g.id === j.gespraech.id ? j.gespraech : g)));
        }
        // Ein Befehl kann mehr veraendert haben als dieses eine Gespraech -
        // /neu legt eines an, /add nimmt jemanden auf.
        if (j.neuLaden) void holen(false);
      }
    } catch { /* stehen lassen, damit nichts verlorengeht */ }
    finally { setSendet(false); }
  }

  /* ------------------------------------------------------------- Anzeige */

  // Kein Zugang, oder nichts zu besprechen: dann auch kein Knopf.
  if (!darf) return null;
  if (!admin && gespraeche.length === 0) return null;
  // Ausgeblendet, oder noch nicht gelesen: dann nichts am Rand. Ein offenes
  // Fenster bleibt offen - wer gerade schreibt, soll nicht unterbrochen werden.
  // Als ganze Seite gilt das nicht: wer /nachrichten aufruft, will sie sehen,
  // auch wenn er das Symbol am Rand weggeklickt hat.
  if (!alsSeite && (amRand === null || (amRand === false && !offen))) return null;

  const betreff = (g: Gespraech) => (g.eigenesThema
    || t(THEMENNAME[g.thema] ?? 'Anderes'));

  const uhrzeit = (ms: number) => new Date(ms).toLocaleString(undefined, {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  return (
    <>
      {/* ------------------------------------------------- Der Knopf am Rand */}
      {!alsSeite && (
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        aria-label={t('Nachrichten')}
        className="fixed left-0 top-1/2 z-40 flex -translate-y-1/2 items-center
                   gap-2 rounded-r-xl border border-l-0 border-zinc-800
                   bg-zinc-900/95 py-3 pl-2 pr-3 text-slate-300 shadow-lg
                   backdrop-blur transition hover:border-sky-500
                   hover:text-sky-400"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
          strokeLinejoin="round">
          <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4.2-.9L3 21l1.9-4.4A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />
        </svg>
        {ungelesen > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full
                           bg-sky-500 px-1.5 text-[11px] font-bold text-white">
            {ungelesen > 99 ? '99+' : ungelesen}
          </span>
        )}
      </button>
      )}

      {/* ------------------------------------------------------ Das Fenster */}
      {offen && (
        <div
          className={alsSeite
            ? 'mx-auto w-full max-w-3xl px-4 py-6'
            : 'fixed inset-0 z-50 flex'}
          onClick={alsSeite ? undefined : () => setOffen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className={alsSeite
              ? 'flex h-[calc(100vh-9rem)] w-full flex-col rounded-2xl border border-zinc-800 bg-zinc-950'
              : `flex h-full w-full max-w-md flex-col border-r
                 border-zinc-800 bg-zinc-950 shadow-2xl sm:h-[80vh]
                 sm:my-auto sm:rounded-r-2xl sm:border`}
          >
            <div className="flex items-center justify-between border-b
                            border-zinc-800 px-4 py-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-100">
                  {aktuell ? betreff(aktuell) : <T>Nachrichten</T>}
                </h2>
                {aktuell && (
                  <p className="truncate text-[11px] text-slate-500">
                    {/* Bei einer Gruppe steht da, wer dabei ist - sonst nur
                        die Gegenstelle. */}
                    {aktuell.gruppe
                      ? [aktuell.vonName, ...aktuell.teilnehmer.map((x) => x.name)]
                        .filter(Boolean).join(', ')
                      : (admin ? aktuell.vonName : t('CompHub'))}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* Eine neue Gruppe - nur der Betreiber macht die auf. */}
                {admin && !aktuell && (
                  <button onClick={() => { setNeuOffen((v) => !v); setSuche(''); }}
                    title={t('Neue Gruppe')}
                    className={`rounded-lg border px-2 py-1 text-sm transition
                      ${neuOffen
                        ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                        : 'border-zinc-700 text-slate-300 hover:border-sky-500'}`}>
                    +
                  </button>
                )}
                {/* Ein Gespraech zumachen oder wieder aufmachen. Es gibt dafuer
                    auch /close und /open, aber wer gerade liest, will nicht
                    tippen muessen. */}
                {aktuell && admin && (
                  <button onClick={() => void standWechseln(aktuell.erledigt)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px]
                      transition ${aktuell.erledigt
                        ? 'border-zinc-700 text-slate-300 hover:border-sky-500 hover:text-sky-400'
                        : 'border-emerald-600/60 text-emerald-400 hover:bg-emerald-500/10'}`}>
                    {aktuell.erledigt ? <T>wieder öffnen</T> : <T>erledigt</T>}
                  </button>
                )}
                {aktuell && aktuell.darfVerlassen && (
                  <button onClick={() => setVerlassenOffen(true)}
                    className="rounded-lg px-2 py-1 text-[11px] text-slate-500
                               transition hover:text-red-400">
                    <T>verlassen</T>
                  </button>
                )}
                {aktuell && (
                  <button onClick={() => setGewaehlt(null)}
                    className="rounded-lg px-2 py-1 text-xs text-slate-400
                               transition hover:text-sky-400">
                    ← <T>zurück</T>
                  </button>
                )}
                {/*
                  * Weg mit dem Knopf.
                  *
                  * Hier und nicht nur in den Einstellungen: wer das Ding
                  * loswerden will, sitzt gerade davor. Zurueckholen laesst es
                  * sich unter "Mein Konto".
                  */}
                {!alsSeite && (
                <button
                  onClick={() => { setzeChatHud(false); setOffen(false); }}
                  title={t('Symbol am Rand ausblenden — zurück unter „Mein Konto"')}
                  className="rounded-lg px-2 py-1 text-[11px] text-slate-500
                             transition hover:text-sky-400">
                  <T>ausblenden</T>
                </button>
                )}
                {!alsSeite && (
                <button onClick={() => setOffen(false)} aria-label={t('schließen')}
                  className="rounded-lg p-1.5 text-slate-500 transition
                             hover:text-slate-200">
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none"
                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M5 5l10 10M15 5L5 15" />
                  </svg>
                </button>
                )}
              </div>
            </div>

            {/* Wen soll die neue Gruppe umfassen? */}
            {!aktuell && neuOffen && (
              <div className="border-b border-zinc-800 bg-zinc-900/40 p-3">
                <input value={suche} autoFocus
                  onChange={(e) => setSuche(e.target.value)}
                  placeholder={t('Namen suchen …')}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950
                             px-3 py-2 text-sm text-slate-100 outline-none
                             placeholder:text-slate-600 focus:border-sky-500" />

                {gewaehlteNutzer.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {gewaehlteNutzer.map((n) => (
                      <button key={n.id} type="button"
                        onClick={() => setGewaehlteNutzer((a) => a.filter((x) => x.id !== n.id))}
                        className="rounded-full border border-sky-500/50 bg-sky-500/10
                                   px-2.5 py-1 text-[11px] text-sky-300 transition
                                   hover:border-red-500 hover:text-red-400">
                        {n.name} ×
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border
                                border-zinc-800">
                  {treffer.length === 0 ? (
                    <p className="p-3 text-[11px] text-slate-600">
                      <T>Niemand gefunden.</T>
                    </p>
                  ) : treffer
                    .filter((n) => !gewaehlteNutzer.some((g) => g.id === n.id))
                    .map((n) => (
                      <button key={n.id} type="button"
                        onClick={() => setGewaehlteNutzer((a) => [...a, n])}
                        className="flex w-full items-center justify-between gap-2
                                   border-b border-zinc-900 px-3 py-2 text-left
                                   text-xs text-slate-300 last:border-0
                                   transition hover:bg-zinc-900">
                        <span className="truncate">{n.name}</span>
                        {n.rolle && (
                          <span className="shrink-0 text-[10px] text-slate-600">
                            {n.rolle}
                          </span>
                        )}
                      </button>
                    ))}
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => void gruppeAnlegen()}
                    disabled={!gewaehlteNutzer.length || legtAn}
                    className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-medium
                               text-white transition hover:bg-sky-400
                               disabled:opacity-40">
                    {legtAn ? <T>wird angelegt …</T> : <T>Gruppe anlegen</T>}
                  </button>
                  <span className="text-[10px] text-slate-600">
                    {gewaehlteNutzer.length === 1
                      ? <T>eine Person — es wird ein Einzelgespräch</T>
                      : <T>ab zwei Personen wird es eine Gruppe</T>}
                  </span>
                </div>
              </div>
            )}

            {/* Wonach gefiltert wird - nur beim Betreiber, und nur wenn es
                ueberhaupt etwas zu sortieren gibt. */}
            {!aktuell && admin && gespraeche.length > 1 && (
              <div className="flex flex-wrap gap-1.5 border-b border-zinc-800
                              px-3 py-2">
                {['alle', ...Object.keys(THEMENNAME)].map((th) => {
                  const zahl = zahlJeThema(th);
                  if (th !== 'alle' && zahl === 0) return null;
                  return (
                    <button key={th} type="button" onClick={() => setFilter(th)}
                      className={`rounded-full border px-2.5 py-1 text-[11px]
                        transition ${filter === th
                          ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                          : 'border-zinc-800 text-slate-500 hover:border-zinc-600'}`}>
                      {th === 'alle' ? <T>Alle</T> : <T>{THEMENNAME[th]}</T>}
                      <span className="ml-1.5 text-slate-600">{zahl}</span>
                    </button>
                  );
                })}

                {/* Offen oder erledigt - die zweite Frage. */}
                <span className="mx-1 w-px self-stretch bg-zinc-800" />
                {(['alle', 'offen', 'erledigt'] as const).map((w) => (
                  <button key={w} type="button" onClick={() => setStand(w)}
                    className={`rounded-full border px-2.5 py-1 text-[11px]
                      transition ${stand === w
                        ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                        : 'border-zinc-800 text-slate-500 hover:border-zinc-600'}`}>
                    {w === 'alle' ? <T>alle</T>
                      : w === 'offen' ? <T>offen</T> : <T>erledigt</T>}
                  </button>
                ))}
              </div>
            )}

            {/* Die Liste der Gespraeche */}
            {!aktuell && (
              <div className="flex-1 overflow-y-auto">
                {gezeigt.length === 0 ? (
                  <p className="p-8 text-center text-sm text-slate-500">
                    <T>Noch keine Nachrichten.</T>
                  </p>
                ) : gezeigt.map((g) => (
                  <button key={g.id} onClick={() => void oeffne(g.id)}
                    className="flex w-full items-start gap-3 border-b
                               border-zinc-900 px-4 py-3 text-left transition
                               hover:bg-zinc-900/60">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`truncate text-sm font-medium
                          ${g.erledigt ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                          {betreff(g)}
                        </span>
                        {admin && (
                          <span className="truncate text-[11px] text-slate-500">
                            · {g.vonName}
                          </span>
                        )}
                        {/* Woran man den Rang sieht, ohne ihn nachschlagen zu
                            muessen. */}
                        {/* Der blaue Haken: die Adresse ist bestaetigt. */}
                        {admin && g.vonBestaetigt && (
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-sky-400"
                            fill="currentColor" aria-hidden>
                            <path d="M12 2l2.4 1.8 3-.3 1 2.8 2.6 1.5-.9 2.9.9 2.9-2.6 1.5-1 2.8-3-.3L12 22l-2.4-1.8-3 .3-1-2.8L3 16.2l.9-2.9L3 10.4l2.6-1.5 1-2.8 3 .3L12 2z" opacity=".25" />
                            <path d="M10.6 15.4l-2.9-2.9 1.3-1.3 1.6 1.6 4-4 1.3 1.3-5.3 5.3z" />
                          </svg>
                        )}
                        {admin && g.vonVip && (
                          <span className="shrink-0 rounded border
                                           border-amber-500/50 bg-amber-500/10
                                           px-1.5 text-[9px] font-bold uppercase
                                           tracking-wider text-amber-400">
                            {g.vonRolle === 'pro' ? 'Pro' : 'VIP'}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {g.verlauf[g.verlauf.length - 1]?.text}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[10px] text-slate-600">
                        {uhrzeit(g.zuletzt)}
                      </span>
                      {g.ungelesen > 0 && (
                        <span className="grid h-4 min-w-4 place-items-center
                                         rounded-full bg-sky-500 px-1
                                         text-[10px] font-bold text-white">
                          {g.ungelesen}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Der Verlauf */}
            {aktuell && (
              <>
                <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                  {aktuell.verlauf.map((n) => {
                    const eigen = admin ? n.von === 'betreiber' : n.von === 'nutzer';
                    const vonBetreiber = n.von === 'betreiber';
                    const name = vonBetreiber ? 'CompHub' : (n.name || aktuell.vonName || '?');
                    const f = farbeFuer(name, vonBetreiber);
                    return (
                      <div key={n.id}
                        className={`flex ${eigen ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5
                          ${eigen
                            ? 'bg-sky-500/15 text-slate-100'
                            : 'bg-zinc-900 text-slate-200'}`}>
                          {/* Wer geschrieben hat - vorher stand dort nur die
                              Uhrzeit, und in einer Gruppe half die nicht weiter. */}
                          <p className={`mb-0.5 text-[11px] font-semibold ${f}`}>
                            {name}
                          </p>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">
                            {n.text}
                          </p>
                          {n.bilder.length > 0 && (
                            <div className="mt-2 grid grid-cols-2 gap-1.5">
                              {n.bilder.map((b) => (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <button key={b} type="button"
                                  onClick={() => setGross(b)}
                                  className="overflow-hidden rounded-lg transition
                                             hover:opacity-80">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img alt=""
                                    src={`/api/kontakt-bild?datei=${encodeURIComponent(b)}`}
                                    className="h-20 w-full object-cover" />
                                </button>
                              ))}
                            </div>
                          )}
                          <p className={`mt-1 text-[10px] text-slate-500
                            ${eigen ? 'text-right' : 'text-left'}`}>
                            {uhrzeit(n.zeit)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={endeRef} />
                </div>

                <div className="border-t border-zinc-800 p-3">
                  {/*
                    * Ein abgeschlossenes Gespraech nimmt nichts mehr an.
                    *
                    * Der Verlauf bleibt lesbar - abgelegt, nicht geloescht.
                    * Wer doch noch etwas braucht, stellt eine Anfrage; darueber
                    * entscheidet der Betreiber.
                    */}
                  {!aktuell.darfSchreiben && (
                    <p className="mb-2 rounded-lg border border-zinc-800
                                  bg-zinc-900/60 px-3 py-2 text-[11px]
                                  leading-relaxed text-slate-500">
                      <T>Dieses Gespräch ist abgeschlossen. Du kannst es
                      nachlesen und eine Anfrage stellen, es wieder zu
                      öffnen.</T>
                    </p>
                  )}

                  {/* Die Antwort auf einen Befehl. Verschwindet beim naechsten
                      Absenden von selbst. */}
                  {hinweis && (
                    <div className="mb-2 rounded-lg border border-zinc-800
                                    bg-zinc-900/60 p-3">
                      <pre className="overflow-x-auto whitespace-pre-wrap font-mono
                                      text-[11px] leading-relaxed text-slate-300">{hinweis}</pre>
                      <button type="button" onClick={() => setHinweis(null)}
                        className="mt-1 text-[10px] text-slate-500 transition
                                   hover:text-sky-400">
                        <T>schließen</T>
                      </button>
                    </div>
                  )}

                  {/* Was mitgeht, bevor es mitgeht. */}
                  {anhaenge.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {anhaenge.map((b, i) => (
                        <div key={i} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={b} alt=""
                            className="h-14 w-14 rounded-lg border border-zinc-800
                                       object-cover" />
                          <button type="button"
                            onClick={() => setAnhaenge((a) => a.filter((_, k) => k !== i))}
                            aria-label={t('entfernen')}
                            className="absolute -right-1.5 -top-1.5 grid h-5 w-5
                                       place-items-center rounded-full bg-zinc-800
                                       text-xs text-slate-300 transition
                                       hover:bg-red-500 hover:text-white">
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Wer passt zum angefangenen Namen. */}
                  {vorschlaege.length > 0 && (
                    <div className="mb-2 overflow-hidden rounded-lg border
                                    border-zinc-800">
                      {vorschlaege.map((n) => (
                        <button key={n.id} type="button"
                          onClick={() => uebernimmVorschlag(n.name)}
                          className="flex w-full items-center justify-between gap-2
                                     border-b border-zinc-900 px-3 py-1.5 text-left
                                     text-xs text-slate-300 last:border-0
                                     transition hover:bg-zinc-900">
                          <span className="truncate">{n.name}</span>
                          {n.rolle && (
                            <span className="shrink-0 text-[10px] text-slate-600">
                              {n.rolle}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    {aktuell.darfSchreiben && anhaenge.length < 4 && (
                      <label title={t('Bild anhängen (Strg+V geht auch)')}
                        className="cursor-pointer rounded-xl border border-zinc-800
                                   px-3 py-2.5 text-slate-400 transition
                                   hover:border-sky-500 hover:text-sky-400">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none"
                          stroke="currentColor" strokeWidth="1.7"
                          strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21.4 11.05 12.25 20.2a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                        </svg>
                        <input type="file" accept="image/*" multiple className="hidden"
                          onChange={(e) => {
                            for (const d of Array.from(e.target.files ?? [])) nimmDatei(d);
                            e.target.value = '';
                          }} />
                      </label>
                    )}
                    <textarea
                      value={entwurf}
                      onChange={(e) => setEntwurf(e.target.value)}
                      onKeyDown={(e) => {
                        // Enter schickt, Umschalt+Enter macht einen Absatz -
                        // so wie in jedem anderen Chat auch.
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (aktuell.darfSchreiben) void senden();
                          else void anfrageSenden();
                        }
                      }}
                      rows={2}
                      placeholder={!aktuell.darfSchreiben
                        ? t('Warum soll es wieder geöffnet werden?')
                        : admin
                          ? t('Antwort schreiben — /hilfe zeigt die Befehle')
                          : t('Antwort schreiben …')}
                      className="flex-1 resize-none rounded-xl border
                                 border-zinc-800 bg-zinc-950 px-3 py-2 text-sm
                                 text-slate-100 outline-none
                                 placeholder:text-slate-600
                                 focus:border-sky-500" />
                    <button
                      onClick={() => (aktuell.darfSchreiben
                        ? void senden() : void anfrageSenden())}
                      disabled={sendet || (!entwurf.trim() && anhaenge.length === 0)}
                      className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm
                                 font-medium text-white transition
                                 hover:bg-sky-400 disabled:opacity-40">
                      {sendet ? <T>sendet …</T>
                        : aktuell.darfSchreiben ? <T>Senden</T> : <T>Anfrage senden</T>}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/*
        * Wirklich austreten?
        *
        * Mit Rueckfrage und Grund: wer aus einer Gruppe verschwindet, ohne
        * etwas zu sagen, hinterlaesst bei den anderen ein Raetsel. Der Grund
        * bleibt im Gespraech stehen - anders als die Befehle des Betreibers
        * ist er eine Nachricht an die anderen.
        */}
      {verlassenOffen && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-zinc-950/90 p-6">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800
                          bg-zinc-950 p-5">
            <h3 className="text-sm font-semibold text-slate-100">
              <T>Dieses Gespräch wirklich verlassen?</T>
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              <T>Du siehst es danach nicht mehr. Der Betreiber kann dich wieder
              hinzufügen.</T>
            </p>
            <textarea value={verlassenGrund} rows={3} maxLength={500}
              onChange={(e) => setVerlassenGrund(e.target.value)}
              placeholder={t('Grund (Spam, erledigt, …) — bleibt im Gespräch stehen')}
              className="mt-3 w-full resize-none rounded-lg border border-zinc-800
                         bg-zinc-950 px-3 py-2 text-sm text-slate-100 outline-none
                         placeholder:text-slate-600 focus:border-sky-500" />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => { setVerlassenOffen(false); setVerlassenGrund(''); }}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-xs
                           text-slate-300 transition hover:border-zinc-500">
                <T>Abbrechen</T>
              </button>
              <button onClick={() => void verlassen()}
                className="rounded-lg border border-red-500/60 px-4 py-2 text-xs
                           text-red-400 transition hover:bg-red-500/10">
                <T>Verlassen</T>
              </button>
            </div>
          </div>
        </div>
      )}

      {/*
        * Ein Bild gross ansehen.
        *
        * Ein Bildschirmausschnitt in Briefmarkengroesse nuetzt bei einem
        * Fehlerbericht nichts - man will lesen koennen, was daraufsteht.
        * Klick irgendwohin schliesst wieder.
        */}
      {gross && (
        <div onClick={() => setGross(null)}
          className="fixed inset-0 z-[60] grid place-items-center bg-zinc-950/95 p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt=""
            src={`/api/kontakt-bild?datei=${encodeURIComponent(gross)}`}
            className="max-h-full max-w-full rounded-lg" />
          <button type="button" aria-label={t('schließen')}
            className="absolute right-6 top-6 rounded-lg bg-zinc-900/80 p-2
                       text-slate-300 transition hover:text-white">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
