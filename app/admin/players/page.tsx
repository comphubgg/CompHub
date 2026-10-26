'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import SeitenKopf from '@/app/components/SeitenKopf';
import { useT, useSprache } from '@/app/components/SprachProvider';
import { namensSchluessel } from '@/lib/homoglyph';

// Das Player Center.
//
// Flagge und X-Konto wurden bisher im Beitrags-Panel gepflegt - zwischen den
// Kacheln eines einzelnen Spieltags. Das hiess: wer gerade nicht mitspielte,
// war nicht zu erreichen, und wer in mehreren Cups antrat, tauchte immer
// wieder auf. Hier steht stattdessen das ganze Archiv, nach Heimatregion
// geordnet, und jede Zeile laesst sich an Ort und Stelle bearbeiten.
//
// Geschluesselt wird ueber die Epic-Konto-ID. Namen wechseln von Turnier zu
// Turnier; wer danach zuordnet, heftet einem Nachahmer die Flagge des Profis
// an - genau der Fehler, wegen dem die Zuordnung einmal umgestellt wurde.

interface Spieler {
  epicId: string; name: string; turniername: string; namen: string[];
  region: string; land: string; landQuelle: string; x: string;
  gepflegt: boolean; foto: string | null;
  matches: number; events: number; elims: number;
}

/**
 * Die Reiter. "alle" steht voran: manchmal sucht man jemanden, ohne zu
 * wissen, wo er zu Hause ist - und dann ist ein Reiter nach dem anderen
 * durchzuklicken die falsche Bedienung.
 */
/**
 * Die Filter - und welche sich gegenseitig ausschliessen.
 *
 * "mit Foto" und "ohne Foto" zusammen ergaeben nie einen Treffer. Statt den
 * Nutzer in diese Leere laufen zu lassen, loest der eine den anderen ab;
 * genau so verhalten sich "ohne @-Konto" und "selbst eingetragen" nicht -
 * die duerfen zusammen stehen.
 */
type Filterart = 'ohneFlagge' | 'ohneKonto' | 'mitFoto' | 'ohneFoto' | 'selbst';

const FILTER: Array<{ wert: Filterart; titel: string; gegenteil?: Filterart }> = [
  { wert: 'ohneFlagge', titel: 'ohne Flagge' },
  { wert: 'ohneKonto', titel: 'ohne @-Konto' },
  { wert: 'mitFoto', titel: 'mit Foto', gegenteil: 'ohneFoto' },
  { wert: 'ohneFoto', titel: 'ohne Foto', gegenteil: 'mitFoto' },
  { wert: 'selbst', titel: 'selbst eingetragen' },
];

const REGIONEN = ['alle', 'EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];

/** Wie viele Zeilen auf einmal - der Rest kommt auf Knopfdruck. */
const SCHRITT = 150;

const zahl = (n: number) => n.toLocaleString('de-DE');

/*
 * Aenderungen, die noch nicht beim Server angekommen sind.
 *
 * Am 27.9.2026 hat der Betreiber rund hundert Spieler umbenannt und ihre
 * X-Konten eingetragen - eine halbe Stunde Arbeit. Waehrenddessen hat Vercel
 * die Seite gesperrt, jedes Speichern scheiterte, und die Seite sagte nichts
 * dazu. Nach dem Neuladen war alles weg.
 *
 * Deshalb liegt jede Aenderung zuerst hier im Browser und wird von dort
 * geschickt, bis der Server sie bestaetigt. Scheitert das, bleibt sie
 * liegen, steht weiter in der Liste und wird erneut versucht - auch nach
 * einem Neuladen. Oben steht, wie viele noch fehlen.
 */
interface Aenderung { id: string; name: string; land: string; x: string; anzeige: string }
const AUSSTEHEND = 'comphub.player-center.ausstehend';

function liesAusstehend(): Record<string, Aenderung> {
  try {
    const roh = window.localStorage.getItem(AUSSTEHEND);
    return roh ? JSON.parse(roh) as Record<string, Aenderung> : {};
  } catch { return {}; }
}

function merkeAusstehend(a: Record<string, Aenderung>) {
  try { window.localStorage.setItem(AUSSTEHEND, JSON.stringify(a)); } catch { /* dann nur im Speicher */ }
}

/** Was eine Aenderung an der Zeile bewirkt - vor und nach dem Speichern gleich. */
function mitAenderung(s: Spieler, a: Aenderung): Spieler {
  return {
    ...s,
    name: a.anzeige || s.turniername,
    land: a.land || '',
    landQuelle: a.land ? 'gepflegt' : '',
    x: a.x,
    gepflegt: Boolean(a.land || a.x || a.anzeige),
  };
}

/*
 * Die Laender, fuer die ein Flaggenbild im Ordner liegt (public/flags). Die Auswahl in der Zeile zeigt Kuerzel und Landesnamen - tippen muss man nichts
 * (Betreiber, 19.10.2026: der Flaggen-Picker braucht Hilfe).
 */
const FLAGGEN_CODES = 'ae al ar at au ba be bg bh br by ca ch cn co cz de dk ee eg es fi fr gb gr hr hu ie il in ir is it jp kr kw lb lt lv mc md mk mx ng nl no nz om pe pl pt ro rs ru sa se si sk sy tr ua us ve ye'.split(' ');
const FLAGGEN_LISTE: string[] = FLAGGEN_CODES.filter(Boolean);
const landName = (code: string, sprache: string) => {
  try { return new Intl.DisplayNames([sprache === 'en' ? 'en' : 'de'], { type: 'region' }).of(code.toUpperCase()) ?? code; } catch { return code; }
};

/** Das Flaggenbild aus dem eigenen Ordner - Windows hat keine Flaggenschrift. */
function Flagge({ land }: { land: string }) {
  if (!land || !/^[A-Za-z]{2}$/.test(land)) {
    return <span className="inline-block w-[22px] text-center text-slate-700">–</span>;
  }
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img src={`/flags/${land.toLowerCase()}.png`} alt={land.toUpperCase()}
    title={land.toUpperCase()} width={22} height={15}
    className="inline-block rounded-[2px]" />;
}

export default function PlayerCenter() {
  const t = useT();
  const { sprache } = useSprache();
  const [istAdmin, setIstAdmin] = useState<boolean | null>(null);
  const [region, setRegion] = useState('EU');
  const [alle, setAlle] = useState<Spieler[]>([]);
  const [jeRegion, setJeRegion] = useState<Record<string, number>>({});
  const [laedt, setLaedt] = useState(false);
  const [suche, setSuche] = useState('');
  /**
   * Mehrere Filter zugleich.
   *
   * Ein einzelner Filter beantwortet selten die Frage, die man wirklich hat.
   * "Wer ist wichtig genug fuer einen Beitrag, hat aber noch kein X-Konto?"
   * heisst: mit Foto UND ohne @-Konto. Deshalb ein Satz statt eines Wertes -
   * verbunden mit UND, denn jeder Filter engt weiter ein.
   *
   * Ein leerer Satz heisst "alle".
   */
  const [filter, setFilter] = useState<Set<Filterart>>(new Set());
  const [menge, setMenge] = useState(SCHRITT);
  /** Ab wie vielen Matches jemand ueberhaupt auftaucht. */
  const [mindestens, setMindestens] = useState(20);

  // Was gerade bearbeitet wird
  const [offen, setOffen] = useState<string | null>(null);
  const [eLand, setELand] = useState('');
  const [eX, setEX] = useState('');
  /** Der Anzeigename - was im Beitrag steht, wenn kein @-Konto da ist. */
  const [eName, setEName] = useState('');
  /** Die Suche in der Flaggenauswahl. */
  const [landSuche, setLandSuche] = useState('');
  /** Noch nicht bestaetigte Aenderungen, je Konto - siehe AUSSTEHEND. */
  const [ausstehend, setAusstehend] = useState<Record<string, Aenderung>>({});
  const [sendeFehler, setSendeFehler] = useState('');
  /** Stand des Foto-Hochladens - mit dem Spieler, zu dem er gehoert. */
  const [fotoStand, setFotoStand] = useState<{ id: string; text: string } | null>(null);
  const ausstehendRef = useRef<Record<string, Aenderung>>({});
  useEffect(() => {
    const da = liesAusstehend();
    ausstehendRef.current = da;
    if (Object.keys(da).length) void Promise.resolve().then(() => setAusstehend(da));
  }, []);

  useEffect(() => {
    fetch('/api/auth/check-admin')
      .then((r) => r.json())
      .then((j) => setIstAdmin(j.isAdmin === true))
      .catch(() => setIstAdmin(false));
  }, []);

  /*
   * Die Liste holen.
   *
   * Der Abruf startet einen Mikrotask spaeter: ein Effekt, der noch im selben
   * Durchlauf Zustand setzt, loest eine zweite Renderrunde aus, bevor die
   * erste fertig ist. Der Abruf ist ohnehin asynchron - ihn eine
   * Warteschlange spaeter zu beginnen kostet nichts.
   */
  useEffect(() => {
    let weg = false;
    void Promise.resolve().then(async () => {
      setLaedt(true);
      try {
        const r = await fetch(
          '/api/spieler-center?region='
          + encodeURIComponent(region === 'alle' ? '' : region)
          + `&mindestens=${mindestens}`, { cache: 'no-store' });
        const j = await r.json();
        if (weg) return;
        /*
         * Die Liste selbst wird stuendlich vorgerechnet - wer eben etwas
         * gespeichert hat, saehe dort bis zu einer Stunde den alten Stand.
         * Deshalb kommen Name, Flagge und X-Konto frisch aus den Profilen
         * dazu, und darueber noch, was hier im Browser auf den Server wartet.
         */
        let liste: Spieler[] = j?.spieler ?? [];
        try {
          const pr = await (await fetch('/api/spieler-profile', { cache: 'no-store' })).json() as {
            profile?: Record<string, { id?: string; land?: string; x?: string; anzeige?: string }>;
          };
          const nachId = new Map(Object.values(pr.profile ?? {}).filter((e) => e.id).map((e) => [e.id!, e]));
          liste = liste.map((sp) => {
            const e = nachId.get(sp.epicId);
            return e ? mitAenderung(sp, { id: sp.epicId, name: sp.turniername, land: e.land ?? '', x: e.x ?? '', anzeige: e.anzeige ?? '' }) : sp;
          });
        } catch { /* dann bleibt es beim vorgerechneten Stand */ }
        if (weg) return;
        const warten = ausstehendRef.current;
        liste = liste.map((sp) => (warten[sp.epicId] ? mitAenderung(sp, warten[sp.epicId]) : sp));
        setAlle(liste);
        setJeRegion(j?.jeRegion ?? {});
      } catch { if (!weg) setAlle([]); }
      finally { if (!weg) setLaedt(false); }
    });
    return () => { weg = true; };
  }, [region, mindestens]);

  /*
   * Die Anzahl gezeigter Zeilen wird dort zurueckgesetzt, wo sich die Auswahl
   * aendert - nicht in einem Effekt. Ein Effekt dafuer waere eine zweite
   * Renderrunde fuer etwas, das der Klick ohnehin schon weiss.
   */
  const waehle = <T,>(setzen: (w: T) => void) => (wert: T) => {
    setzen(wert);
    setMenge(SCHRITT);
  };

  /**
   * Was zu sehen ist.
   *
   * Die Suche geht ueber alle Namen eines Kontos, nicht nur den aktuellen:
   * wer "scroll" tippt, findet ihn auch, wenn er zuletzt als "AG Scroll 10!"
   * antrat. Ueber die Konto-ID laesst sich ebenfalls suchen - manchmal hat
   * man nur die.
   */
  const q = namensSchluessel(suche);
  const gezeigt = alle.filter((s) => {
    // UND, nicht ODER: jeder gewaehlte Filter engt weiter ein.
    if (filter.has('ohneFlagge') && s.land) return false;
    if (filter.has('ohneKonto') && s.x) return false;
    if (filter.has('mitFoto') && !s.foto) return false;
    if (filter.has('ohneFoto') && s.foto) return false;
    if (filter.has('selbst') && !s.gepflegt) return false;
    if (!suche.trim()) return true;
    if (s.epicId.startsWith(suche.trim().toLowerCase())) return true;
    if (q.length < 2) return false;
    return [s.name, s.turniername, s.x, ...s.namen]
      .filter(Boolean).some((n) => namensSchluessel(n).includes(q));
  });

  const oeffnen = (s: Spieler) => {
    setOffen(s.epicId);
    setLandSuche('');
    // Die Flagge aus der Quelle wird vorbelegt: sonst muesste man abtippen,
    // was danebensteht - und ein leeres Feld beim Speichern loeschte sie.
    setELand(s.land);
    setEX(s.x);
    // Nur einen selbst gesetzten Namen vorbelegen. Stuende hier der
    // Turniername, machte das blosse Oeffnen und Speichern ihn dauerhaft -
    // und beim naechsten Namenswechsel des Spielers waere er veraltet.
    setEName(s.name === s.turniername ? '' : s.name);
  };

  /**
   * Alles Ausstehende schicken, eines nach dem anderen.
   *
   * Was der Server bestaetigt, faellt aus der Liste; was scheitert, bleibt
   * und kommt beim naechsten Durchgang wieder dran.
   */
  const sendet = useRef(false);
  const senden = useCallback(async () => {
    if (sendet.current) return;
    sendet.current = true;
    try {
      for (const a of Object.values(ausstehendRef.current)) {
        let grund = '';
        try {
          const r = await fetch('/api/spieler-profile', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(a),
          });
          if (!r.ok) grund = r.status === 402 ? t('Die Seite ist bei Vercel gesperrt (402).') : `HTTP ${r.status}`;
        } catch { grund = t('Keine Verbindung zum Server.'); }
        if (grund) { setSendeFehler(grund); break; }
        // Nur entfernen, wenn in der Zwischenzeit nichts Neueres dazukam.
        if (ausstehendRef.current[a.id] === a) {
          const rest = { ...ausstehendRef.current };
          delete rest[a.id];
          ausstehendRef.current = rest;
          merkeAusstehend(rest);
          setAusstehend(rest);
        }
      }
      if (!Object.keys(ausstehendRef.current).length) setSendeFehler('');
    } finally { sendet.current = false; }
  }, [t]);

  // Solange etwas wartet, alle zwanzig Sekunden ein neuer Versuch.
  const wartend = Object.keys(ausstehend).length;
  useEffect(() => {
    if (!wartend) return undefined;
    void Promise.resolve().then(() => senden());
    const uhr = setInterval(() => { void senden(); }, 20_000);
    return () => clearInterval(uhr);
  }, [wartend, senden]);

  /*
   * Ein Foto zu diesem Spieler hochladen (Betreiber, 26.10.2026: "wenn ich sie im Player Center hochladen kann, speichert es direkt auch auf GitHub, fuer immer").
   * Die Schnittstelle legt es im Archiv auf GitHub ab und traegt es unter dem Konto ein - es steht danach sofort ueberall, wo der Spieler ein Foto hat.
   */
  const fotoHochladen = useCallback(async (s: Spieler, datei: File) => {
    setFotoStand({ id: s.epicId, text: t('lädt hoch …') });
    try {
      const form = new FormData();
      form.set('datei', datei); form.set('epicId', s.epicId); form.set('name', s.name);
      const r = await fetch('/api/spielerbild/hochladen', { method: 'POST', body: form });
      const j = await r.json().catch(() => ({} as { ok?: boolean; bild?: string; fehler?: string }));
      if (!r.ok || !j.bild) { setFotoStand({ id: s.epicId, text: String(j.fehler ?? t('Das hat nicht geklappt.')) }); return; }
      setAlle((vorher) => vorher.map((x) => (x.epicId === s.epicId ? { ...x, foto: j.bild as string } : x)));
      setFotoStand({ id: s.epicId, text: t('Foto gespeichert - es liegt dauerhaft im GitHub-Archiv.') });
    } catch { setFotoStand({ id: s.epicId, text: t('Keine Verbindung zum Server.') }); }
  }, [t]);

  const speichern = useCallback((s: Spieler) => {
    const a: Aenderung = {
      id: s.epicId, name: s.turniername,
      land: eLand.trim().toUpperCase(), x: eX.trim().replace(/^@/, ''),
      anzeige: eName.trim(),
    };
    const neu = { ...ausstehendRef.current, [s.epicId]: a };
    ausstehendRef.current = neu;
    merkeAusstehend(neu);
    setAusstehend(neu);
    setAlle((vorher) => vorher.map((x) => (x.epicId === s.epicId ? mitAenderung(x, a) : x)));
    setOffen(null);
    void senden();
  }, [eLand, eX, eName, senden]);

  if (istAdmin === false) {
    return (
      <main className="min-h-screen bg-zinc-950 px-4 py-16 text-center">
        <p className="text-sm text-slate-500">
          <T>Dieser Bereich ist dem Adminkonto vorbehalten.</T>
        </p>
      </main>
    );
  }

  /** Der Spieler, der gerade rechts bearbeitet wird. */
  const gewaehlt = offen ? alle.find((x) => x.epicId === offen) ?? null : null;
  const landTreffer = (() => {
    const lq = landSuche.trim().toLowerCase();
    return FLAGGEN_LISTE.filter((c) => !lq || c.includes(lq) || landName(c, sprache).toLowerCase().includes(lq));
  })();
  /** Speichern und gleich den Naechsten der Liste oeffnen - zum Durchgehen mit dem Filter "ohne Flagge". */
  const speichernUndWeiter = (s: Spieler) => {
    const i = gezeigt.findIndex((x) => x.epicId === s.epicId);
    const naechster = i >= 0 ? gezeigt[i + 1] : undefined;
    speichern(s);
    if (naechster) oeffnen(naechster);
  };

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-[1500px]">
        <SeitenKopf className="mb-6" marke={<T>Spieler pflegen</T>} titel={<T>Player Center</T>}
          text={<T>Flagge und @-Konto hängen an der Konto-ID, nicht am Namen — ein Namenswechsel ändert nichts.</T>} />

        {/* Was noch nicht beim Server ist - unuebersehbar, solange es das gibt. */}
        {wartend > 0 && (
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${sendeFehler
            ? 'border-red-500/60 bg-red-950/40 text-red-200'
            : 'border-amber-500/50 bg-amber-950/30 text-amber-200'}`}>
            <b>{wartend} <T>Änderungen noch nicht gespeichert.</T></b>{' '}
            {sendeFehler
              ? <><T>Der Server nimmt sie gerade nicht an:</T> {sendeFehler}{' '}
                <T>Sie bleiben in diesem Browser und werden alle 20 Sekunden erneut geschickt, auch nach einem Neuladen.</T></>
              : <T>Wird gespeichert …</T>}
          </div>
        )}

        {/* ------------------------------------------------------ Regionen */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {REGIONEN.map((r) => (
            <button key={r} onClick={() => waehle(setRegion)(r)}
              className={`rounded-full border px-4 py-1.5 text-xs font-bold
                          transition ${region === r
                ? 'border-sky-500 bg-sky-500 text-white'
                : 'border-zinc-700 bg-zinc-900 text-slate-400 hover:text-slate-200'}`}>
              <T>{r}</T>
              <span className="ml-1.5 font-normal tabular-nums opacity-70">
                {jeRegion[r] ?? '–'}
              </span>
            </button>
          ))}
        </div>

        {/* ------------------------------------------ Suche und Filter */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <input value={suche}
            onChange={(e) => waehle(setSuche)(e.target.value)}
            placeholder={t('Name, alter Name oder Konto-ID')}
            spellCheck={false}
            className="w-72 max-w-full rounded-full border border-zinc-700
                       bg-zinc-900 px-4 py-2 text-xs text-slate-100
                       outline-none placeholder:text-slate-600
                       focus:border-sky-500" />

          <span className="flex flex-wrap items-center gap-1">
            <button onClick={() => waehle(setFilter)(new Set<Filterart>())}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition
                          ${!filter.size
                ? 'border-sky-500 bg-sky-500 text-white'
                : 'border-zinc-700 bg-zinc-900 text-slate-400 hover:text-slate-200'}`}>
              <T>alle</T>
            </button>

            {FILTER.map((f) => (
              <button key={f.wert}
                title={t('Mit Umschalt anklicken, um mehrere zu verbinden')}
                onClick={(e) => {
                  /*
                   * Ein Klick waehlt genau diesen Filter. Mit gedrueckter
                   * Umschalttaste kommt er dazu oder faellt weg - so wie
                   * man es aus jeder Dateiliste kennt.
                   *
                   * Ein Gegenteil weicht dabei: "mit Foto" und "ohne Foto"
                   * zusammen faenden nie jemanden.
                   */
                  const naechster = new Set(e.shiftKey ? filter : []);
                  if (naechster.has(f.wert)) naechster.delete(f.wert);
                  else {
                    naechster.add(f.wert);
                    if (f.gegenteil) naechster.delete(f.gegenteil);
                  }
                  waehle(setFilter)(naechster);
                }}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition
                            ${filter.has(f.wert)
                  ? 'border-sky-500 bg-sky-500 text-white'
                  : 'border-zinc-700 bg-zinc-900 text-slate-400 hover:text-slate-200'}`}>
                <T>{f.titel}</T>
              </button>
            ))}

            {filter.size > 1 && (
              <span className="ml-1 text-[10px] text-slate-600">
                {filter.size} <T>verbunden</T>
              </span>
            )}
          </span>

          <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <T>ab</T>
            <input type="number" min={1} value={mindestens}
              onChange={(e) =>
                waehle(setMindestens)(Math.max(1, Number(e.target.value) || 1))}
              className="w-16 rounded border border-zinc-800 bg-zinc-900 px-2
                         py-1 text-center text-xs text-slate-100 outline-none
                         focus:border-sky-500" />
            <T>Matches</T>
          </label>

          <span className="ml-auto text-[11px] tabular-nums text-slate-600">
            {zahl(gezeigt.length)} <T>von</T> {zahl(alle.length)}
          </span>
        </div>

        {/*
          * Zwei Haelften (Betreiber, 20.10.2026: "das Player Center ist immer noch nicht angenehm"): links die Spieler als grosse Fotos mit Name darunter, wie sie
          * auch sonst in den Listen stehen; rechts, immer sichtbar, das Feld zum Bearbeiten - mit einer Flaggenauswahl, in der man das Land am Bild und an seinem
          * Namen erkennt, statt ein Kuerzel zu kennen. Statt einer Zeile, die sich aufklappt und die Tabelle verschiebt.
          */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <div>
            {laedt ? (
              <p className="py-10 text-center text-xs text-slate-600"><T>Wird geladen …</T></p>
            ) : !gezeigt.length ? (
              <p className="py-10 text-center text-xs text-slate-600"><T>Niemand passt dazu.</T></p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {gezeigt.slice(0, menge).map((s) => {
                    const auf = offen === s.epicId;
                    return (
                      <button key={s.epicId} type="button" onClick={() => oeffnen(s)}
                        className={`group rounded-2xl border bg-zinc-900 p-2 text-left transition ${auf
                          ? 'border-sky-500 ring-2 ring-sky-500/40' : 'border-zinc-800 hover:border-zinc-600'}`}>
                        <span className="relative block aspect-square overflow-hidden rounded-xl bg-zinc-800">
                          {s.foto ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={s.foto} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 p-2 text-center text-sm font-black uppercase leading-tight tracking-wide text-slate-400">
                              {s.name}
                            </span>
                          )}
                          <span className="absolute left-1.5 top-1.5 flex h-6 min-w-[2rem] items-center justify-center rounded bg-black/65 px-1">
                            {s.land ? <Flagge land={s.land} /> : <span className="text-[10px] font-bold text-amber-300">?</span>}
                          </span>
                        </span>
                        <span className="mt-2 block truncate text-[13px] font-bold text-slate-100">{s.name}</span>
                        <span className="block truncate text-[11px]">
                          {s.x ? <span className="text-sky-400">@{s.x}</span> : <span className="text-slate-600"><T>kein @-Konto</T></span>}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {gezeigt.length > menge && (
                  <button onClick={() => setMenge((m) => m + SCHRITT)}
                    className="mt-3 w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2
                               text-xs text-slate-400 transition
                               hover:border-sky-500/60 hover:text-sky-400">
                    <T>weitere anzeigen</T> ({zahl(gezeigt.length - menge)})
                  </button>
                )}
              </>
            )}
          </div>

          {/* ------------------------------------------------ Bearbeiten */}
          <aside className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-[0_10px_30px_rgba(15,23,42,.12)] lg:sticky lg:top-20">
            {!gewaehlt ? (
              <div className="py-10 text-center">
                <p className="text-sm font-bold text-slate-200"><T>Spieler wählen</T></p>
                <p className="mx-auto mt-2 max-w-[28ch] text-xs leading-relaxed text-slate-500">
                  <T>Links einen Spieler anklicken. Tipp: den Filter „ohne Flagge“ setzen und mit „Speichern und weiter“ der Reihe nach durchgehen.</T>
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <span className="block h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-zinc-800">
                    {gewaehlt.foto ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={gewaehlt.foto} alt="" className="h-full w-full object-cover object-top" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center p-1 text-center text-xs font-black uppercase leading-tight text-slate-500">{gewaehlt.name}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-black text-slate-50">{gewaehlt.name}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-500">{gewaehlt.turniername}</span>
                    <span className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-slate-400">
                      <span>{zahl(gewaehlt.matches)} <T>Matches</T></span>
                      <span>{zahl(gewaehlt.events)} <T>Spieltage</T></span>
                      <span>{zahl(gewaehlt.elims)} <T>Elims</T></span>
                    </span>
                    <label className="mt-2 inline-flex cursor-pointer items-center rounded-full border border-zinc-700 px-3 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-sky-500 hover:text-sky-400">
                      {gewaehlt.foto ? <T>Foto ersetzen</T> : <T>Foto hochladen</T>}
                      <input type="file" accept="image/*" className="sr-only"
                        onChange={(e) => { const d = e.target.files?.[0]; e.target.value = ''; if (d) void fotoHochladen(gewaehlt, d); }} />
                    </label>
                  </span>
                </div>
                {fotoStand && fotoStand.id === gewaehlt.epicId && <p className="text-[11px] leading-relaxed text-slate-400">{fotoStand.text}</p>}

                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500"><T>Anzeigename</T></span>
                  <input value={eName} onChange={(e) => setEName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') speichernUndWeiter(gewaehlt); }}
                    placeholder={gewaehlt.turniername} spellCheck={false}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500" />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500"><T>@-Konto</T></span>
                  <span className="flex items-center rounded-lg border border-zinc-700 bg-zinc-950 focus-within:border-sky-500">
                    <span className="pl-3 text-sm text-slate-500">@</span>
                    <input value={eX} onChange={(e) => setEX(e.target.value.replace(/^@/, ''))}
                      onKeyDown={(e) => { if (e.key === 'Enter') speichernUndWeiter(gewaehlt); }}
                      placeholder={t('ohne @')} spellCheck={false}
                      className="min-w-0 flex-1 bg-transparent px-1.5 py-2 text-sm text-slate-100 outline-none" />
                  </span>
                </label>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500"><T>Flagge</T></span>
                    <span className="flex items-center gap-2 text-xs text-slate-300">
                      {eLand && FLAGGEN_CODES.includes(eLand.toLowerCase()) ? (
                        <>
                          <Flagge land={eLand} />
                          <span className="font-semibold">{eLand.toUpperCase()} · {landName(eLand.toLowerCase(), sprache)}</span>
                          <button type="button" onClick={() => setELand('')} className="text-[11px] text-slate-500 underline hover:text-rose-400"><T>kein Land</T></button>
                        </>
                      ) : <span className="text-slate-600">—</span>}
                    </span>
                  </div>
                  <input value={landSuche} onChange={(e) => setLandSuche(e.target.value)} spellCheck={false}
                    placeholder={t('Land suchen …')}
                    className="mb-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
                  <div className="grid max-h-56 grid-cols-5 gap-1.5 overflow-y-auto pr-1">
                    {landTreffer.map((c) => (
                      <button key={c} type="button" onClick={() => setELand(c.toUpperCase())} title={`${c.toUpperCase()} · ${landName(c, sprache)}`}
                        className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 transition ${eLand.toLowerCase() === c
                          ? 'border-sky-500 bg-sky-500/15' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-600'}`}>
                        <Flagge land={c} />
                        <span className="text-[10px] font-bold uppercase text-slate-400">{c}</span>
                      </button>
                    ))}
                    {!landTreffer.length && <p className="col-span-5 py-3 text-center text-xs text-slate-600"><T>Niemand passt dazu.</T></p>}
                  </div>
                </div>

                {gewaehlt.namen.filter((n) => n !== gewaehlt.name && n !== gewaehlt.turniername).length > 0 && (
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    <T>Früher aufgetreten als</T>: {gewaehlt.namen.filter((n) => n !== gewaehlt.name && n !== gewaehlt.turniername).slice(0, 6).join(' · ')}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button type="button" onClick={() => speichernUndWeiter(gewaehlt)}
                    className="rounded-full bg-sky-500 px-5 py-2 text-xs font-bold text-white transition hover:bg-sky-400">
                    <T>Speichern und weiter</T>
                  </button>
                  <button type="button" onClick={() => speichern(gewaehlt)}
                    className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-sky-500 hover:text-sky-400">
                    <T>speichern</T>
                  </button>
                  <button type="button" onClick={() => setOffen(null)} className="text-[11px] text-slate-500 transition hover:text-slate-300">
                    <T>abbrechen</T>
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
