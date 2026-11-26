import { OV } from '../ort';
import { useEffect, useMemo, useState } from 'react';
import T from '../T';
import { useT } from '../sprache';
import OverlayGeruest, {
  overlayAdresse, useOverlays, type OverlayEintrag,
} from '../OverlayGeruest';
import { Regler, Vorschau, Wahlreihe } from '../Teile';
import { DesignGruppe, HausGruppe, HAUS_STANDARD, LOOK_STANDARD, Segmente, Text as TextFeld } from '../Bausteine';
import Ablauf, { FertigSchritt, Vorlagen, type Vorlage } from '../Ablauf';
import { THEMEN, themaAkzent, deckkraftFuer, type Thema } from '../themen';
import GlobalsGeruest from '../globals/GlobalsGeruest';

/*
 * Den Offspawn-Stand einstellen.
 *
 * Anders als die uebrigen Overlays holt dieses nichts von Epic: wer wo landet
 * und wie es steht, entscheidet sich in einer Absprache zwischen zwei Teams,
 * und davon weiss keine Schnittstelle etwas. Der Betreiber pflegt den Stand
 * deshalb hier von Hand - "nachher kann er das im Tool eingeben, und in OBS
 * wird das direkt uebernommen".
 *
 * Genau darauf ist die Seite ausgelegt: zwei grosse Knoepfe je Seite, mit
 * denen sich der Stand waehrend des Streams in einem Klick aendern laesst,
 * und alles andere darunter.
 */

const STANDARD = {
  kopf: 'OFFSPAWN',
  kopfZeigen: true,
  name1: 'TEAM 1', name2: 'TEAM 2',
  punkte1: 0, punkte2: 0,
  // Weiss als Vorgabe - so wollte es der Betreiber. Farbe ist die Ausnahme.
  farbe1: '#ffffff', farbe2: '#ffffff',
  /** Feste Breite in Pixeln - 0 heisst: so breit wie der Inhalt. */
  breite: 0,
  /** 1 oder 2 - gegen unscharfe Einblendungen in OBS. */
  massstab: 1,
  /** Die Fotos je Seite - bis zu vier, fuer 2v2 und 4v4. */
  bilder1: [] as string[], bilder2: [] as string[],
  /** Die alte Form mit einem Bild je Seite - wird beim Bearbeiten uebernommen. */
  bild1: '', bild2: '',
  grund: '0 0 0', deckkraft: 0.72,
  schrift: 30,
  /** Das Aussehen: leer ist das gewohnte, "globals" das der FNCS-Globals. */
  thema: '' as Thema,
  /** Wie rund die Ecken sind. */
  ecken: 12,
  // Redesign 11/2026: layout, footer and the CompHub house style (look.js).
  layout: 'box' as 'box' | 'breit' | 'zeile',
  fuss: '',
  ...LOOK_STANDARD,
  ...HAUS_STANDARD,
  wasserzeichen: 'aus' as typeof HAUS_STANDARD.wasserzeichen,
};

type Config = typeof STANDARD;

const GRUENDE: Array<{ wert: string; titel: string }> = [
  { wert: '0 0 0', titel: 'Schwarz' },
  { wert: '24 24 27', titel: 'Anthrazit' },
  { wert: '63 63 70', titel: 'Grau' },
  { wert: '12 20 38', titel: 'Nachtblau' },
];

const FARBEN: Array<{ wert: string; titel: string }> = [
  { wert: '#ffffff', titel: 'Weiß' },
  { wert: '#38bdf8', titel: 'Blau' },
  { wert: '#f43f5e', titel: 'Rot' },
  { wert: '#f5c542', titel: 'Gold' },
  { wert: '#34d399', titel: 'Grün' },
  { wert: '#a78bfa', titel: 'Violett' },
];

/**
 * Die fertigen Looks (Schritt "Vorlage"). Dazu die Looks der Cup-Reihen aus themen.ts: ihr Akzent wird die Farbe der Namen.
 */
const VORLAGEN_BASIS: Array<Vorlage<Config>> = [
  { schluessel: 'haus', titel: 'CompHub', text: 'Transparent black, white text, the rotating frame — the house style.',
    setzt: { thema: '' as Thema, look: 'clean', grund: '0 0 0', deckkraft: 0.66, farbe1: '#ffffff', farbe2: '#ffffff', schrift: 30, ecken: 14 } },
  { schluessel: 'klassisch', titel: 'Klassisch', text: 'Schwarz mit weißen Namen — das gewohnte Bild.',
    setzt: { look: 'klassisch', thema: '' as Thema, grund: '0 0 0', deckkraft: 0.72, farbe1: '#ffffff', farbe2: '#ffffff', schrift: 30, ecken: 12 } },
  { schluessel: 'blau-rot', titel: 'Blau gegen Rot', text: 'Jedes Team in seiner Farbe — gut für 1v1 und 2v2.',
    setzt: { look: 'klassisch', thema: '' as Thema, grund: '12 20 38', deckkraft: 0.8, farbe1: '#38bdf8', farbe2: '#f43f5e', schrift: 30, ecken: 14 } },
  { schluessel: 'gold', titel: 'Gold', text: 'Beide Namen in Gold auf Schwarz.',
    setzt: { look: 'klassisch', thema: '' as Thema, grund: '0 0 0', deckkraft: 0.75, farbe1: '#f5c542', farbe2: '#f5c542', schrift: 30, ecken: 12 } },
  { schluessel: 'gross', titel: 'Groß', text: 'Große Schrift, runde Ecken — für Offspawns, die man aus der Ferne lesen soll.',
    setzt: { look: 'klassisch', thema: '' as Thema, grund: '0 0 0', deckkraft: 0.72, farbe1: '#ffffff', farbe2: '#ffffff', schrift: 52, ecken: 20 } },
  { schluessel: 'sauber', titel: 'Sauber', text: 'Anthrazit, fast deckend, schlichte Ecken.',
    setzt: { look: 'klassisch', thema: '' as Thema, grund: '24 24 27', deckkraft: 0.92, farbe1: '#ffffff', farbe2: '#ffffff', schrift: 26, ecken: 8 } },
];
const VORLAGEN_THEMEN: Array<Vorlage<Config>> = THEMEN.filter((x) => x.wert).map((x) => ({
  schluessel: `thema-${x.wert}`, titel: x.titel, text: 'Das Aussehen dieser Cup-Reihe.',
  setzt: { look: 'klassisch', thema: x.wert, deckkraft: deckkraftFuer(x.wert, 0.72), farbe1: themaAkzent(x.wert) ?? '#ffffff', farbe2: themaAkzent(x.wert) ?? '#ffffff' },
}));
const VORLAGEN_ALLE: Array<Vorlage<Config>> = [...VORLAGEN_BASIS, ...VORLAGEN_THEMEN];

/**
 * Der Baukasten des freien Overlays - 1v1s, 2v2s, alles von Hand.
 *
 * Zweimal dieselbe Seite: unter /overlays/offspawn wie bisher, unter
 * /globals/overlays/custom von Haus aus im Aussehen der Global
 * Championship.
 */
export default function OffspawnBaukasten({ globals = false }: {
  globals?: boolean;
} = {}) {
  const t = useT();
  const { liste, fehler, speichern, entfernen } = useOverlays('offspawn');

  const start: Config = globals
    ? { ...STANDARD, thema: 'globals', farbe1: '#f5c542', farbe2: '#f5c542' }
    : STANDARD;

  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState(globals ? 'Globals Overlay' : 'Custom overlay');
  const [cfg, setCfg] = useState<Config>(start);
  const [gespeichert, setGespeichert] = useState(false);
  const [schmutzig, setSchmutzig] = useState(false);

  /*
   * Die Spielersuche im Archiv.
   *
   * Ein Offspawn haengt an keinem Cup - es gibt also keine Bestenliste, in
   * der man suchen koennte. Gesucht wird deshalb im gepflegten Verzeichnis,
   * dort, wo auch die Fotos liegen. Der Betreiber wollte genau das: "stell
   * ein, dass ich ein Team auswaehlen kann, dass ich auch Profilbilder habe."
   *
   * Beim Tippen, mit einer kurzen Pause - und je Seite getrennt, damit links
   * und rechts unabhaengig voneinander bleiben.
   */
  const [suche, setSuche] = useState<{ seite: 1 | 2; text: string } | null>(null);
  const [funde, setFunde] = useState<Array<{
    epicId: string; anzeige: string; bild: string | null; echtesFoto?: boolean;
  }>>([]);
  useEffect(() => {
    const q = (suche?.text ?? '').trim();
    if (q.length < 2) { setFunde([]); return undefined; }
    const stift = window.setTimeout(() => {
      fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((j) => setFunde(
          /*
           * Wer ein Foto hat, steht oben.
           *
           * Hier wird nach einem Gesicht gesucht, nicht nach einer
           * Statistik: "einen Spieler suchen, der Bilder hat, dass da
           * reinkommt". Wer keines hat, faellt nicht raus - er laesst sich
           * weiterhin waehlen, dann kommt eben nur der Name - steht aber
           * hinten und ist als solcher gekennzeichnet.
           */
          (Array.isArray(j?.spieler) ? j.spieler : [])
            .slice(0, 8)
            .sort((a: { bild: string | null }, b: { bild: string | null }) =>
              Number(Boolean(b.bild)) - Number(Boolean(a.bild)))))
        .catch(() => setFunde([]));
    }, 300);
    return () => window.clearTimeout(stift);
  }, [suche]);

  /*
   * Die Fotos einer Seite - die neue Liste, sonst das eine alte Bild.
   */
  const fotosVon = (c: Config, seite: 1 | 2): string[] => {
    const liste = seite === 1 ? c.bilder1 : c.bilder2;
    const einzeln = seite === 1 ? c.bild1 : c.bild2;
    return Array.isArray(liste) && liste.length ? liste : (einzeln ? [einzeln] : []);
  };

  /** Die Fotos einer Seite setzen - das alte Einzelbild faellt dabei weg. */
  function setzeFotos(seite: 1 | 2, neu: string[]) {
    setCfg((alt) => ({
      ...alt,
      [seite === 1 ? 'bilder1' : 'bilder2']: neu.slice(0, 4),
      [seite === 1 ? 'bild1' : 'bild2']: '',
    }));
    setSchmutzig(true);
  }

  /**
   * Das Foto eines Fundes auf eine Seite legen - nur das Foto.
   *
   * Vorher wurde dabei auch der Teamname ueberschrieben. Der Betreiber: "wenn
   * ich Bild hochlade, tut es nicht den Teamnamen aendern ... sondern es
   * bleibt so, wie ich es eigentlich eingegeben habe." Und es sind bis zu
   * vier Fotos je Seite, fuer 2v2 und 4v4.
   */
  function uebernimm(seite: 1 | 2, f: { anzeige: string; bild: string | null }) {
    if (!f.bild) return;
    const bisher = fotosVon(cfg, seite);
    if (!bisher.includes(f.bild)) setzeFotos(seite, [...bisher, f.bild]);
    setSuche(null);
    setFunde([]);
  }

  const setz = <K extends keyof Config>(k: K, v: Config[K]) => {
    setCfg((alt) => ({ ...alt, [k]: v }));
    setSchmutzig(true);
  };

  useEffect(() => { setSchmutzig(false); }, [id]);
  const setzLos = (k: string, v: unknown) => setz(k as keyof Config, v as Config[keyof Config]);

  const vorschau = useMemo(
    () => `${OV}/overlay/offspawn.html?vorschau=${encodeURIComponent(JSON.stringify(cfg))}`,
    [cfg]);

  function waehlen(o: OverlayEintrag) {
    setId(o.id);
    setName(o.name);
    setCfg({ ...start, ...(o.config as Partial<Config>) });
  }

  /** Ein neues Overlay beginnen: leerer Stand, Standardaussehen. */
  function neu() {
    setId(null);
    setName(globals ? 'Globals Overlay' : 'Custom overlay');
    setCfg(start);
    setSchmutzig(false);
  }

  const [ausAdresseGeladen, setAusAdresseGeladen] = useState(false);
  useEffect(() => {
    if (ausAdresseGeladen || !liste) return;
    const wunsch = new URLSearchParams(window.location.search).get('id');
    if (!wunsch) { setAusAdresseGeladen(true); return; }
    const o = liste.find((x) => x.id === wunsch);
    if (o) waehlen(o);
    setAusAdresseGeladen(true);
    // waehlen haengt nur an setState-Funktionen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liste, ausAdresseGeladen]);

  /**
   * Speichern - und zwar sofort, wenn schon eines offen ist.
   *
   * Waehrend eines Streams zaehlt jeder Klick: wer den Stand aendert, will
   * ihn im Bild sehen und nicht erst noch "Übernehmen" suchen. Deshalb
   * schreibt jede Änderung am Stand direkt durch, sobald das Overlay einmal
   * angelegt ist.
   */
  async function sichern(neuerStand?: Partial<Config>) {
    const stand = { ...cfg, ...(neuerStand ?? {}) };
    const neu = await speichern({ id: id ?? undefined, name, config: stand });
    if (!neu) return;
    setId(neu);
    setSchmutzig(false);
    setGespeichert(true);
    window.setTimeout(() => setGespeichert(false), 1200);
  }

  /** Den Stand einer Seite ändern und, wenn möglich, gleich speichern. */
  function zaehle(welche: 'punkte1' | 'punkte2', wieviel: number) {
    const wert = Math.max(0, Math.min(99, (cfg[welche] as number) + wieviel));
    setCfg((alt) => ({ ...alt, [welche]: wert }));
    if (id) void sichern({ [welche]: wert } as Partial<Config>);
    else setSchmutzig(true);
  }

  const feld = 'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 '
    + 'text-sm text-white outline-none placeholder:text-white/30 '
    + 'focus:border-violet-500';

  const inhalt = (
    <>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-white"><T>Custom overlay</T></h1>
        <p className="mt-1 text-sm text-white/45">
          <T>Zwei Teams, ein Stand von Hand. Epic weiß davon nichts — was hier
          steht, steht im Stream.</T>
        </p>
      </div>

      <Vorschau src={vorschau} hoehe={220} />

      <Ablauf schritte={[
        /* ------------------------------------------------ 1 Teams und Stand */
        {
          schluessel: 'stand', titel: 'Teams und Stand',
          hinweis: 'Gib den Teams einen Namen, such ihre Fotos und zähl den Stand mit + und −. Ist das Overlay einmal gespeichert, steht jeder Klick sofort im Stream.',
          inhalt: (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {([['punkte1', 'name1', 'farbe1'], ['punkte2', 'name2', 'farbe2']] as const)
                  .map(([pk, nk, fk]) => (
                    <div key={pk} className="rounded-lg border border-white/10
                                             bg-[#06080f]/60 p-3">
                      <input value={cfg[nk] as string}
                        onChange={(e) => setz(nk, e.target.value)}
                        placeholder={t('Teamname')}
                        className={`${feld} text-center font-semibold`}
                        style={{ color: cfg[fk] as string }} />

                      {/*
                        * Spieler suchen - fuer den Namen und das Bild.
                        *
                        * Ein Offspawn haengt an keinem Cup; gesucht wird
                        * deshalb im Verzeichnis, nicht in einer Bestenliste.
                        */}
                      <div className="relative mt-2">
                        <input
                          value={suche?.seite === (pk === 'punkte1' ? 1 : 2)
                            ? suche.text : ''}
                          onChange={(e) => setSuche({
                            seite: pk === 'punkte1' ? 1 : 2, text: e.target.value,
                          })}
                          placeholder={t('Foto hinzufügen — Spieler suchen')}
                          className={`${feld} text-xs`} />
                        {suche?.seite === (pk === 'punkte1' ? 1 : 2)
                          && funde.length > 0 && (
                          <div className="absolute left-0 right-0 z-20 mt-1
                                          overflow-hidden rounded-lg border
                                          border-white/15 bg-black/30 shadow-xl">
                            {funde.map((f) => (
                              <button key={f.epicId} type="button"
                                disabled={!f.bild}
                                onClick={() => uebernimm(pk === 'punkte1' ? 1 : 2, f)}
                                className="flex w-full items-center gap-2 px-2 py-1.5
                                           text-left text-xs text-white/70
                                           hover:bg-white/[0.035] disabled:cursor-not-allowed
                                           disabled:opacity-50">
                                {f.bild
                                  // eslint-disable-next-line @next/next/no-img-element
                                  ? <img src={f.bild} alt=""
                                    className="h-7 w-7 shrink-0 rounded-sm
                                               object-cover" />
                                  : <span className="h-7 w-7 shrink-0 rounded-sm
                                                     bg-white/[0.07]" />}
                                <span className="min-w-0 flex-1 truncate">
                                  {f.anzeige}
                                </span>
                                {/* Damit niemand einen Spieler ohne Foto
                                    waehlt und sich dann wundert. */}
                                {!f.bild && (
                                  <span className="shrink-0 text-[10px]
                                                   text-white/30">
                                    <T>kein Foto</T>
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Die Fotos dieser Seite - jedes mit einem x zum
                          Entfernen. Bis zu vier. */}
                      {fotosVon(cfg, pk === 'punkte1' ? 1 : 2).length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                          {fotosVon(cfg, pk === 'punkte1' ? 1 : 2).map((pfad, i) => (
                            <span key={`${pfad}-${i}`} className="relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={pfad} alt=""
                                className="h-10 w-10 rounded-sm object-cover" />
                              <button type="button"
                                title={t('Foto entfernen')}
                                onClick={() => {
                                  const seite = pk === 'punkte1' ? 1 : 2;
                                  setzeFotos(seite, fotosVon(cfg, seite).filter((_, k) => k !== i));
                                }}
                                className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center
                                           rounded-full bg-white/[0.035] text-[10px] leading-none
                                           text-white/70 ring-1 ring-white/15 transition
                                           hover:bg-rose-600 hover:text-white">
                                ×
                              </button>
                            </span>
                          ))}
                          <span className="text-[10px] text-white/30">
                            {fotosVon(cfg, pk === 'punkte1' ? 1 : 2).length}/4
                          </span>
                        </div>
                      )}
                      <div className="mt-3 flex items-center justify-center gap-3">
                        <button onClick={() => zaehle(pk, -1)}
                          className="h-11 w-11 rounded-lg border border-white/10
                                     text-lg font-bold text-white/70 transition
                                     hover:border-violet-500 hover:text-violet-300">
                          −
                        </button>
                        <span className="w-14 text-center text-3xl font-black
                                         tabular-nums text-white">
                          {cfg[pk] as number}
                        </span>
                        <button onClick={() => zaehle(pk, 1)}
                          className="h-11 w-11 rounded-lg bg-violet-500 text-lg
                                     font-bold text-white transition
                                     hover:bg-violet-400">
                          +
                        </button>
                      </div>
                    </div>
                  ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs text-white/55"><T>Überschrift</T></span>
                  <input value={cfg.kopf}
                    onChange={(e) => setz('kopf', e.target.value)}
                    className={`${feld} mt-1`} />
                </label>
                <Wahlreihe titel="Überschrift zeigen" wert={cfg.kopfZeigen ? 1 : 0}
                  optionen={[{ wert: 1, titel: 'Ja' }, { wert: 0, titel: 'Nein' }]}
                  setzen={(w) => setz('kopfZeigen', w === 1)} />
              </div>
            </div>
          ),
        },

        /* ------------------------------------------------------- 2 Vorlage */
        /* Unter /globals ist das Aussehen gesetzt und steht nicht zur Wahl. */
        ...(globals ? [] : [{
          schluessel: 'vorlage', titel: 'Vorlage',
          hinweis: 'Such dir einen fertigen Look aus — ein Klick, und die Vorschau oben zeigt ihn. Die Farben der Teams kannst du im nächsten Schritt einzeln ändern.',
          inhalt: (
            <Vorlagen<Config> vorlagen={VORLAGEN_ALLE} basis={cfg}
              vorschauUrl={(c) => `${OV}/overlay/offspawn.html?vorschau=${encodeURIComponent(JSON.stringify(c))}`}
              gilt={(v) => Object.entries(v.setzt).every(([k, w]) => (cfg as Record<string, unknown>)[k] === w)}
              waehle={(v) => { setCfg((a) => ({ ...a, ...v.setzt })); setSchmutzig(true); }} />
          ),
        }]),

        /* --------------------------------------------------- Design (house style) */
        {
          schluessel: 'design', titel: 'Design',
          hinweis: 'Layout, frame, background and look. “CompHub” is the house style; the coloured templates use the classic look.',
          inhalt: (
            <div className="space-y-4">
              <Segmente titel="Layout" wert={cfg.layout} setzen={(v) => setz('layout', v)}
                optionen={[{ wert: 'box', titel: 'Photos outside' }, { wert: 'breit', titel: 'Wide' }, { wert: 'zeile', titel: 'Slim line' }]} />
              <TextFeld titel="Footer (optional)" wert={cfg.fuss} setzen={(v) => setz('fuss', v)} platzhalter="FIRST TO 3" max={40} />
              <HausGruppe cfg={cfg} setz={setzLos} fotos />
              <DesignGruppe cfg={cfg} setz={setzLos} />
            </div>
          ),
        },

        /* --------------------------------------------------- 3 Feinschliff */
        {
          schluessel: 'fein', titel: 'Feinschliff',
          hinweis: 'Optional: Farben, Größe, Breite und Schärfe. Wer mit der Vorlage zufrieden ist, geht gleich weiter.',
          inhalt: (
            <div className="grid gap-4 sm:grid-cols-2">
              <Wahlreihe titel="Farbe links" wert={cfg.farbe1} optionen={FARBEN}
                setzen={(w) => setz('farbe1', w)} />
              <Wahlreihe titel="Farbe rechts" wert={cfg.farbe2} optionen={FARBEN}
                setzen={(w) => setz('farbe2', w)} />
              <Wahlreihe titel="Grundfarbe" wert={cfg.grund} optionen={GRUENDE}
                setzen={(w) => setz('grund', w)} />
              <Regler titel="Schriftgröße" wert={cfg.schrift} von={14} bis={80}
                einheit="px" setzen={(n) => setz('schrift', n)} />
              <Regler titel="Ecken" wert={cfg.ecken} von={0} bis={28}
                einheit="px" setzen={(n) => setz('ecken', n)} />
              {/*
                * Kein Regler mehr fuer die Bildgroesse.
                *
                * Das Foto fuellt den Kasten von oben bis unten und ist immer
                * quadratisch - der Betreiber hat zweimal genau das verlangt:
                * "es soll das ganze Kaestchen sein, nicht so klein" und dann
                * "es ist immer noch nicht das ganze komplett ausgefuellt ...
                * dass es komplett rundherum ist." Ein Regler daneben koennte
                * das nur wieder kaputtmachen.
                */}
              {/*
                * Null heisst: so breit wie der Inhalt. Alles darueber zieht
                * den Kasten auf - der Betreiber wollte ihn breiter ziehen
                * koennen.
                */}
              <Regler titel="Breite" wert={cfg.breite} von={0} bis={1200}
                schritt={10} einheit="px" setzen={(n) => setz('breite', n)} />
              <Wahlreihe titel="Schärfe" wert={cfg.massstab}
                optionen={[
                  { wert: 1, titel: 'Normal' },
                  { wert: 2, titel: 'Doppelt (schärfer)' },
                ]}
                setzen={(w) => setz('massstab', w)} />
              <Regler titel="Wie deckend der Grund ist" wert={cfg.deckkraft}
                von={0} bis={1} schritt={0.02}
                setzen={(n) => setz('deckkraft', n)} />
            </div>
          ),
        },

        /* ---------------------------------------------------------- 4 Fertig */
        {
          schluessel: 'fertig', titel: 'Fertig',
          hinweis: 'Gib dem Overlay einen Namen, speichere es und kopiere die Adresse für OBS. Danach schaltet jeder Klick auf + und − den Stand direkt im Stream.',
          inhalt: (
            <FertigSchritt typ="offspawn" id={id} name={name} setName={setName} sichern={() => void sichern()}
              gespeichert={gespeichert} schmutzig={schmutzig} fehler={fehler} neu={neu}
              liste={liste} waehlen={waehlen} entfernen={(x) => { void entfernen(x); if (x === id) neu(); }}
              listeTitel={t('Meine Overlays')}
              zusatz={(
                <>
                  {/*
                    * Warum es in OBS unscharf aussieht - und was dagegen hilft.
                    *
                    * Eine Browserquelle ist dort ein Bild in genau der Groesse, die
                    * eingetragen ist; wer sie in der Szene groesser zieht,
                    * vergroessert ein fertiges Bild. Drei Zeilen sagen, wie man das
                    * vermeidet.
                    */}
                  {cfg.massstab === 2 ? (
                    <p className="text-[11px] leading-relaxed text-violet-400/80">
                      <T>Trag die Browser-Quelle in OBS mit der doppelten Breite und
                      Höhe ein und zieh sie in der Szene auf 50 % — dann wird nichts
                      hochgerechnet und alles ist scharf.</T>
                    </p>
                  ) : (
                    <p className="text-[11px] leading-relaxed text-white/45">
                      <T>Unscharf in OBS? Zieh die Quelle in der Szene nie größer,
                      als sie eingetragen ist. Mit „Schärfe: Doppelt“ wird alles
                      doppelt so groß gezeichnet — Quelle doppelt so groß eintragen,
                      in der Szene auf 50 %.</T>
                    </p>
                  )}
                </>
              )} />
          ),
        },
      ]} />
    </>
  );

  return globals
    ? <GlobalsGeruest aktiv="/streamer/overlays/globals">{inhalt}</GlobalsGeruest>
    : <OverlayGeruest aktiv="offspawn">{inhalt}</OverlayGeruest>;
}
