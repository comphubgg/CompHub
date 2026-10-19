'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import OverlayGeruest, {
  overlayAdresse, useOverlays, type OverlayEintrag,
} from '../OverlayGeruest';
import { CupWahl, Regler, Vorschau, Wahlreihe } from '../Teile';
import Ablauf, { FertigSchritt, Vorlagen, type Vorlage } from '../Ablauf';
import { THEMEN, themaAkzent, themaFuerCup, deckkraftFuer, type Thema } from '../themen';
import GlobalsGeruest from '@/app/globals/GlobalsGeruest';
import GlobalsTagWahl from '@/app/globals/GlobalsTage';
import { GLOBALS_EVENT, GLOBALS_TAGE } from '@/lib/globalsCup';

/*
 * Das Standings-Overlay einstellen.
 *
 * Eine eigene Seite, so wie der Betreiber es wollte. Links die Einstellungen,
 * rechts die Vorschau und die eigenen Overlays.
 *
 * Der Kern: gespeichert wird in /api/overlay-config unter einer Kennung, und
 * die Adresse in OBS traegt nur diese Kennung. Wer hier etwas umstellt und
 * speichert, sieht es im Stream binnen Sekunden - die Browserquelle bleibt
 * unberuehrt.
 */

const STANDARD = {
  event: '', window: '',
  titel: 'STANDINGS',
  /** Das Aussehen: leer ist das gewohnte, "globals" das der FNCS-Globals. */
  thema: '' as Thema,
  /** Wie rund die Ecken sind. */
  ecken: 10,
  /** Das eigene Zeichen klein in der Kopfzeile. */
  marke: 0,
  /**
   * Alle Spieltage des Cups - fuer den Gesamtstand ueber mehrere Tage.
   *
   * Leer oder einer: es zaehlt nur das gewaehlte Fenster. Mehrere: das
   * Overlay zaehlt die Tage zusammen (siehe standings.html).
   */
  fenster: [] as string[],
  kopfrechts: 'POINTS',
  von: 1, bis: 5,
  takt: 15,
  grund: '0 0 0', deckkraft: 0.72,
  akzent: '#f5c542',
  schrift: 16,
  breite: 420,
  bilder: false,
  gold: 1,
  pausiert: 0,
  sichtbar: 15,
  /** Blättern: bis zu welchem Platz, und wie lange eine Seite steht. */
  seitenBis: 0,
  seitenTakt: 8,
};

type Config = typeof STANDARD;

/** Die Grundfarben, die er wollte - schwarz, grau, und ein paar Töne. */
const GRUENDE: Array<{ wert: string; titel: string }> = [
  { wert: '0 0 0', titel: 'Schwarz' },
  { wert: '24 24 27', titel: 'Anthrazit' },
  { wert: '63 63 70', titel: 'Grau' },
  { wert: '12 20 38', titel: 'Nachtblau' },
];

const AKZENTE: Array<{ wert: string; titel: string }> = [
  { wert: '#f5c542', titel: 'Gold' },
  { wert: '#38bdf8', titel: 'Blau' },
  { wert: '#34d399', titel: 'Grün' },
  { wert: '#f43f5e', titel: 'Rot' },
  { wert: '#ffffff', titel: 'Weiß' },
];

/**
 * Die fertigen Looks (Schritt "Vorlage"): jede setzt Grundfarbe, Akzent, Deckkraft, Ecken, Breite, Schrift, Hervorhebung und Fotos auf einmal.
 * Dazu die Looks der Cup-Reihen (Performance, Division, Cash ...) aus themen.ts.
 */
const VORLAGEN_BASIS: Array<Vorlage<Config>> = [
  { schluessel: 'klassisch', titel: 'Klassisch', text: 'Schwarz mit Gold — das gewohnte Bild.',
    setzt: { thema: '' as Thema, grund: '0 0 0', akzent: '#f5c542', deckkraft: 0.72, ecken: 10, breite: 420, schrift: 16, gold: 1, bilder: false } },
  { schluessel: 'nachtblau', titel: 'Nachtblau', text: 'Dunkles Blau mit hellblauem Akzent, etwas runder.',
    setzt: { thema: '' as Thema, grund: '12 20 38', akzent: '#38bdf8', deckkraft: 0.82, ecken: 16, breite: 420, schrift: 16, gold: 1, bilder: false } },
  { schluessel: 'kompakt', titel: 'Kompakt', text: 'Schmal und klein — für die Ecke des Bildes.',
    setzt: { thema: '' as Thema, grund: '24 24 27', akzent: '#ffffff', deckkraft: 0.78, ecken: 6, breite: 320, schrift: 13, gold: 0, bilder: false } },
  { schluessel: 'gross', titel: 'Groß mit Fotos', text: 'Breit, große Schrift und das Foto vor dem Namen.',
    setzt: { thema: '' as Thema, grund: '0 0 0', akzent: '#34d399', deckkraft: 0.7, ecken: 14, breite: 640, schrift: 22, gold: 3, bilder: true } },
  { schluessel: 'rot', titel: 'Rot auf Anthrazit', text: 'Kräftiger roter Akzent auf dunklem Grau.',
    setzt: { thema: '' as Thema, grund: '24 24 27', akzent: '#f43f5e', deckkraft: 0.85, ecken: 10, breite: 440, schrift: 17, gold: 1, bilder: false } },
];
const VORLAGEN_THEMEN: Array<Vorlage<Config>> = THEMEN.filter((x) => x.wert).map((x) => ({
  schluessel: `thema-${x.wert}`, titel: x.titel, text: 'Das Aussehen dieser Cup-Reihe.',
  setzt: { thema: x.wert, akzent: themaAkzent(x.wert) ?? '#f5c542', deckkraft: deckkraftFuer(x.wert, 0.72) },
}));
const VORLAGEN_ALLE: Array<Vorlage<Config>> = [...VORLAGEN_BASIS, ...VORLAGEN_THEMEN];

/**
 * Der Baukasten des Standings-Overlays.
 *
 * Zweimal dieselbe Seite, an zwei Adressen: unter /overlays/standings mit
 * der Cup-Auswahl, unter /globals/overlays/standings fest auf die Global
 * Championship gestellt. Der Betreiber wollte die Globals-Fassung an einer
 * eigenen Adresse und ohne Cup-Auswahl - "nur die Globals Cups, also am 26.9
 * + 27.9" -, aber es sollen nicht zwei Baukaesten nebeneinander gepflegt
 * werden, die sich mit der Zeit auseinanderleben.
 */
export default function StandingsBaukasten({ globals = false }: {
  globals?: boolean;
} = {}) {
  const t = useT();
  const { liste, fehler, speichern, entfernen } = useOverlays('standings');

  /*
   * Womit ein neues Overlay anfaengt.
   *
   * In der Globals-Fassung steht der Cup schon fest und das Aussehen ist
   * das des Turniers - sonst muesste er beides jedes Mal selbst einstellen.
   */
  const start: Config = globals
    ? {
      ...STANDARD,
      thema: 'globals',
      event: GLOBALS_EVENT,
      window: GLOBALS_TAGE[0].windowId,
      titel: 'GLOBAL CHAMPIONSHIP',
      marke: 1,
    }
    : STANDARD;

  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState(globals ? 'Globals Standings' : 'Standings');
  const [cfg, setCfg] = useState<Config>(start);
  const [gespeichert, setGespeichert] = useState(false);

  const setz = <K extends keyof Config>(k: K, v: Config[K]) =>
    setCfg((alt) => ({ ...alt, [k]: v }));

  function waehlen(o: OverlayEintrag) {
    setId(o.id);
    setName(o.name);
    setCfg({ ...start, ...(o.config as Partial<Config>) });
  }

  function neu() {
    setId(null);
    setName(globals ? 'Globals Standings' : 'Standings');
    setCfg(start);
  }

  async function sichern() {
    const neueId = await speichern({ id: id ?? undefined, name, config: cfg });
    if (neueId) {
      setId(neueId);
      setGespeichert(true);
      setTimeout(() => setGespeichert(false), 2000);
    }
  }

  /*
   * Die Spieltage desselben Cups - fuer den Gesamtstand.
   *
   * Ein Finale laeuft ueber mehrere Tage (Globals: Tag 1 und Tag 2), und der
   * Betreiber wollte beides zeigen koennen: nur den heutigen Tag oder den
   * Stand ueber das ganze Turnier. Welche Tage es gibt, steht im Katalog -
   * hier werden sie zum gewaehlten Fenster gesucht.
   */
  const [tage, setTage] = useState<Array<{ windowId: string; begin: number }>>([]);
  useEffect(() => {
    let weg = false;
    if (!cfg.event || !cfg.window) {
      const leer = setTimeout(() => setTage([]), 0);
      return () => { weg = true; clearTimeout(leer); };
    }
    fetch('/api/cup-catalog?modus=alle')
      .then((r) => r.json())
      .then((j) => {
        if (weg) return;
        const alle: Array<{ windowId: string; begin: number; region: string; eventId: string }> = [];
        for (const c of j.cups ?? []) {
          for (const liste of Object.values(c.regionen ?? {})) {
            for (const w of liste as Array<{ eventId: string; windowId: string; begin: number; region: string }>) {
              alle.push({ eventId: w.eventId, windowId: w.windowId, begin: w.begin, region: w.region });
            }
          }
        }
        const dieses = alle.find((w) => w.windowId === cfg.window);
        const dazu = alle
          .filter((w) => w.eventId === cfg.event && (!dieses || w.region === dieses.region))
          .sort((a, b) => a.begin - b.begin)
          .map((w) => ({ windowId: w.windowId, begin: w.begin }));
        setTage(dazu);
      })
      .catch(() => { if (!weg) setTage([]); });
    return () => { weg = true; };
  }, [cfg.event, cfg.window]);

  const gesamt = (cfg.fenster?.length ?? 0) > 1;

  /*
   * Die Vorschau zeigt dasselbe Overlay, das spaeter in OBS laeuft.
   *
   * Nicht ein nachgebautes Abbild: ein Nachbau weicht mit der Zeit ab, und
   * dann sieht man hier etwas anderes als im Stream.
   */
  /*
   * Die Vorschau folgt den Reglern, nicht dem gespeicherten Stand.
   *
   * Die eingestellten Werte reisen in der Adresse mit; das Overlay nimmt sie
   * und fragt gar nicht erst beim Server nach. Was in OBS laeuft, aendert
   * sich dadurch nicht - dort steht nur die Kennung, und die zeigt weiterhin
   * auf den gespeicherten Stand, bis auf Speichern gedrueckt wird.
   */
  const vorschau = useMemo(
    () => `/overlay/standings.html?vorschau=${encodeURIComponent(JSON.stringify(cfg))}`,
    [cfg]);

  // Ungespeicherte Aenderungen sollen sichtbar sein, sonst klickt man
  // "Adresse kopieren" und wundert sich, dass nichts anders aussieht.
  const [schmutzig, setSchmutzig] = useState(false);
  useEffect(() => { setSchmutzig(true); }, [cfg, name]);
  useEffect(() => { setSchmutzig(false); }, [id]);

  /*
   * Ein Overlay, das aus der Liste heraus bearbeitet wird.
   *
   * Die Adresse traegt dann seine Kennung. Einmal geladen, danach nicht mehr -
   * sonst spraengen die Regler bei jeder Aenderung auf den gespeicherten Stand
   * zurueck.
   */
  const [ausAdresseGeladen, setAusAdresseGeladen] = useState(false);
  useEffect(() => {
    if (ausAdresseGeladen || !liste) return;
    const wunsch = new URLSearchParams(window.location.search).get('id');
    if (!wunsch) return;
    const o = liste.find((x) => x.id === wunsch);
    if (o) waehlen(o);
    setAusAdresseGeladen(true);
    // laden() haengt an setState-Funktionen und aendert sich nicht.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liste, ausAdresseGeladen]);

  const inhalt = (
    <>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-100">
          {globals ? <T>Leaderboard</T> : <T>Standings</T>}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          <T>Die vordersten Plätze des laufenden Spieltags — als Einblendung
          für deinen Stream.</T>
        </p>
      </div>

      <Vorschau src={vorschau || null} hoehe={320}
        leer={<T>Erst anlegen — dann steht hier die Vorschau, genau so wie
          sie im Stream aussieht.</T>} />

      <Ablauf schritte={[
        /* ---------------------------------------------------- 1 Was zeigen */
        {
          schluessel: 'was', titel: 'Was zeigen',
          hinweis: 'Wähle den Cup und die Plätze, die im Overlay stehen sollen.',
          inhalt: (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {globals ? (
                  <GlobalsTagWahl fenster={cfg.window}
                    alle={cfg.fenster}
                    onTag={(w) => setCfg((alt) => ({
                      ...alt, event: GLOBALS_EVENT, window: w,
                    }))}
                    onAlle={(f) => setz('fenster', f)} />
                ) : (
                  <CupWahl event={cfg.event} window={cfg.window}
                    onWahl={(e, w, titel) => setCfg((alt) => ({
                      ...alt, event: e, window: w,
                      // Ein anderer Cup, ein anderer Gesamtstand: die Tage
                      // werden neu gesammelt, sobald er ihn wieder anhakt.
                      fenster: [],
                      // Der Titel wird vorgeschlagen, bleibt aber überschreibbar.
                      titel: alt.titel === STANDARD.titel && titel
                        ? titel.toUpperCase() : alt.titel,
                      // Das Aussehen der Reihe wird vorgeschlagen (Performance Cup,
                      // Division Cup ...), solange noch keins gewaehlt ist.
                      ...(alt.thema === '' && themaFuerCup(w, titel)
                        ? { thema: themaFuerCup(w, titel), akzent: themaAkzent(themaFuerCup(w, titel)) ?? alt.akzent,
                            deckkraft: deckkraftFuer(themaFuerCup(w, titel), alt.deckkraft) }
                        : {}),
                    }))} />
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-300"><T>Welche Plätze</T></p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {[5, 10, 20, 50].map((n) => (
                    <button key={n} type="button"
                      onClick={() => setCfg((a) => ({ ...a, von: 1, bis: n }))}
                      className={`rounded-full border px-4 py-1.5 text-xs font-bold transition ${
                        cfg.von === 1 && cfg.bis === n
                          ? 'border-sky-500 bg-sky-500/15 text-sky-400'
                          : 'border-zinc-800 text-slate-400 hover:border-zinc-600'}`}>
                      <T>Top</T> {n}
                    </button>
                  ))}
                  <span className="mx-2 text-xs text-slate-600"><T>oder von</T></span>
                  <input type="number" min={1} max={200} value={cfg.von} aria-label={t('Von Platz')}
                    onChange={(e) => setz('von', Math.max(1, +e.target.value || 1))}
                    className="w-20 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500" />
                  <span className="text-xs text-slate-600"><T>bis</T></span>
                  <input type="number" min={1} max={200} value={cfg.bis} aria-label={t('Bis Platz')}
                    onChange={(e) => setz('bis', Math.max(cfg.von, +e.target.value || 5))}
                    className="w-20 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500" />
                </div>
              </div>

              {/*
                * Ein Tag oder das ganze Turnier.
                *
                * Nur zu sehen, wenn der Cup ueberhaupt mehrere Spieltage hat -
                * sonst waere es ein Schalter ohne Wirkung.
                */}
              {!globals && tage.length > 1 && (
                <label className="flex items-start gap-2 text-xs text-slate-400">
                  <input type="checkbox" checked={gesamt}
                    onChange={(e) => setz('fenster',
                      e.target.checked ? tage.map((x) => x.windowId) : [])}
                    className="mt-0.5 accent-sky-500" />
                  <span>
                    <T>Gesamtstand über alle Tage</T>
                    <span className="mt-0.5 block text-[11px] text-slate-500">
                      {gesamt
                        ? `${tage.length} ${t('Tage werden zusammengezählt')}`
                        : t('Nur der gewählte Spieltag')}
                    </span>
                  </span>
                </label>
              )}
            </div>
          ),
        },

        /* ------------------------------------------------------- 2 Vorlage */
        /*
         * In der Globals-Fassung gibt es hier nichts zu waehlen: die
         * Seite ist das Turnier. Eine Wahl, die nur einen Wert hat,
         * ist eine Wahl zu viel.
         */
        ...(globals ? [] : [{
          schluessel: 'vorlage', titel: 'Vorlage',
          hinweis: 'Such dir einen fertigen Look aus — ein Klick, und die Vorschau oben zeigt ihn. Feinheiten stellst du im nächsten Schritt ein, wenn du willst.',
          inhalt: (
            <Vorlagen<Config> vorlagen={VORLAGEN_ALLE} basis={cfg}
              vorschauUrl={(c) => `/overlay/standings.html?vorschau=${encodeURIComponent(JSON.stringify(c))}`}
              gilt={(v) => Object.entries(v.setzt).every(([k, w]) => (cfg as Record<string, unknown>)[k] === w)}
              waehle={(v) => setCfg((a) => ({ ...a, ...v.setzt }))} />
          ),
        }]),

        /* --------------------------------------------------- 3 Feinschliff */
        {
          schluessel: 'fein', titel: 'Feinschliff',
          hinweis: 'Optional: Überschrift, Farben, Größe, Blättern und Ein- und Ausblenden. Wer mit der Vorlage zufrieden ist, geht gleich weiter.',
          inhalt: (
            <div className="space-y-7">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-400">
                  <T>Überschrift</T>
                  <input value={cfg.titel}
                    onChange={(e) => setz('titel', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950
                               px-3 py-2 text-sm text-slate-100 outline-none
                               focus:border-sky-500" />
                </label>
                <label className="text-xs text-slate-400">
                  <T>Rechts in der Kopfzeile</T>
                  <input value={cfg.kopfrechts}
                    onChange={(e) => setz('kopfrechts', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950
                               px-3 py-2 text-sm text-slate-100 outline-none
                               focus:border-sky-500" />
                </label>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-100"><T>Aussehen</T></h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Wahlreihe titel="Grundfarbe" wert={cfg.grund} optionen={GRUENDE}
                    setzen={(w) => setz('grund', w)} />
                  <Wahlreihe titel="Akzent" wert={cfg.akzent} optionen={AKZENTE}
                    setzen={(w) => setz('akzent', w)} />
                  <Regler titel="Deckkraft" wert={Math.round(cfg.deckkraft * 100)}
                    von={0} bis={100} einheit="%"
                    setzen={(n) => setz('deckkraft', n / 100)} />
                  <Regler titel="Schriftgröße" wert={cfg.schrift} von={10} bis={40}
                    einheit="px" setzen={(n) => setz('schrift', n)} />
                  <Regler titel="Breite" wert={cfg.breite} von={260} bis={900}
                    schritt={10} einheit="px" setzen={(n) => setz('breite', n)} />
                  <Regler titel="Ecken" wert={cfg.ecken} von={0} bis={28}
                    einheit="px" setzen={(n) => setz('ecken', n)} />
                  <Wahlreihe titel="Golden hervorheben" wert={cfg.gold}
                    optionen={[
                      { wert: 0, titel: 'keine' },
                      { wert: 1, titel: 'nur Platz 1' },
                      { wert: 3, titel: 'Top 3' },
                    ]}
                    setzen={(w) => setz('gold', w)} />
                  <Regler titel="Aktualisierung" wert={cfg.takt} von={3} bis={120}
                    einheit="s" setzen={(n) => setz('takt', n)} />
                  <label className="flex items-center gap-2 self-end text-xs text-slate-400">
                    <input type="checkbox" checked={Boolean(cfg.marke)}
                      onChange={(e) => setz('marke', e.target.checked ? 1 : 0)}
                      className="accent-sky-500" />
                    <T>CompHub-Zeichen in der Kopfzeile</T>
                  </label>
                  {/* In der Globals-Fassung nicht: "Die Funktion Photos before
                      the name soll weg. Das ist viel zu viel dann." */}
                  {!globals && (
                    <label className="flex items-center gap-2 self-end text-xs text-slate-400">
                      <input type="checkbox" checked={cfg.bilder}
                        onChange={(e) => setz('bilder', e.target.checked)}
                        className="accent-sky-500" />
                      <T>Fotos vor dem Namen</T>
                    </label>
                  )}
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
                  <T>Die Karte ist so breit wie eingestellt, wächst aber mit, wenn
                  die Zahlen mehr Platz brauchen — bei Platz 1100 rutscht nichts
                  zusammen. Ziehst du sie in OBS schmaler, verliert zuerst der
                  Teamname Zeichen, nie die Zahlen.</T>
                </p>
              </div>

              {/*
                * Blaettern.
                *
                * "Ich kann aus den Standings auch ein Overlay machen, indem ich
                * Top fuenf anzeige, aber es dann mehrere Seiten gibt - Seite
                * eins Top fuenf, Seite zwei fuenf bis zehn, Seite drei zehn bis
                * fuenfzehn und so weiter."
                *
                * Wie gross eine Seite ist, steht schon im ersten Schritt: es ist die Spanne
                * von/bis. Hier kommt nur dazu, wie weit geblaettert wird - und
                * wie lange eine Seite steht.
                */}
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <input type="checkbox" checked={cfg.seitenBis > 0}
                    onChange={(e) => setz('seitenBis', e.target.checked
                      ? Math.max(cfg.bis * 2, 20) : 0)}
                    className="accent-sky-500" />
                  <T>Durch die Plätze blättern</T>
                </label>

                {cfg.seitenBis > 0 && (
                  <>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <Regler titel="Blättern bis Platz" wert={cfg.seitenBis}
                        von={Math.max(2, cfg.bis + 1)} bis={200}
                        setzen={(n) => setz('seitenBis', n)} />
                      <Regler titel="Sekunden je Seite" wert={cfg.seitenTakt}
                        von={3} bis={60} einheit="s"
                        setzen={(n) => setz('seitenTakt', n)} />
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                      <T>Seiten</T>:{' '}
                      {(() => {
                        const gross = Math.max(1, cfg.bis - cfg.von + 1);
                        const zahl = Math.max(1,
                          Math.ceil((cfg.seitenBis - cfg.von + 1) / gross));
                        const teile: string[] = [];
                        for (let i = 0; i < Math.min(zahl, 4); i += 1) {
                          const a = cfg.von + i * gross;
                          teile.push(`${a}–${Math.min(a + gross - 1, cfg.seitenBis)}`);
                        }
                        return `${teile.join(' · ')}${zahl > 4 ? ' …' : ''}`
                          + ` (${zahl})`;
                      })()}
                    </p>
                  </>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-100"><T>Ein- und ausblenden</T></h3>
                <p className="mb-3 mt-1 text-[11px] text-slate-500">
                  <T>Steht die Pause auf null, bleibt das Overlay dauerhaft
                  stehen.</T>
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Regler titel="Pause" wert={cfg.pausiert} von={0} bis={900}
                    schritt={5} einheit="s" setzen={(n) => setz('pausiert', n)} />
                  <Regler titel="Dann sichtbar für" wert={cfg.sichtbar} von={3} bis={120}
                    einheit="s" setzen={(n) => setz('sichtbar', n)} />
                </div>
                {cfg.pausiert > 0 && (
                  <p className="mt-2 text-[11px] text-sky-400/80">
                    {t('Alle {p} verborgen, dann {s} zu sehen.')
                      .replace('{p}', cfg.pausiert >= 60
                        ? `${Math.round(cfg.pausiert / 60)} min` : `${cfg.pausiert} s`)
                      .replace('{s}', `${cfg.sichtbar} s`)}
                  </p>
                )}
              </div>
            </div>
          ),
        },

        /* ---------------------------------------------------------- 4 Fertig */
        {
          schluessel: 'fertig', titel: 'Fertig',
          hinweis: 'Gib dem Overlay einen Namen, speichere es und kopiere die Adresse für OBS.',
          inhalt: (
            <FertigSchritt typ="standings" id={id} name={name} setName={setName} sichern={sichern}
              gespeichert={gespeichert} schmutzig={schmutzig} fehler={fehler} neu={neu}
              liste={liste} waehlen={waehlen} entfernen={(x) => { void entfernen(x); if (x === id) neu(); }}
              listeTitel={t('Meine Standings')} />
          ),
        },
      ]} />
    </>
  );

  /*
   * Zwei Rahmen, ein Inhalt.
   *
   * Unter /overlays steht die Leiste mit allen Overlay-Arten daneben, unter
   * /globals die Leiste des Turniers - Overlays, Teams, Map, Predictions.
   */
  return globals
    ? <GlobalsGeruest aktiv="/globals/overlays">{inhalt}</GlobalsGeruest>
    : <OverlayGeruest aktiv="standings">{inhalt}</OverlayGeruest>;
}
