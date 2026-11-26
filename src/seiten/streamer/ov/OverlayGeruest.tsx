import { OV } from './ort';
import { useCallback, useEffect, useState } from 'react';
import Link from './Link';
import T from './T';
import { useT } from './sprache';
import { useZugang } from './zugang';
import MeineOverlays from './MeineOverlays';
import { overlayLoeschen, useLoeschStand } from './Loeschen';
import Startansicht from './Startansicht';
import LadeSchirm from './LadeSchirm';
import VipVorhang from './VipVorhang';
import SeitenKopf from './SeitenKopf';

/*
 * Das gemeinsame Geruest der Overlay-Seiten.
 *
 * Der Betreiber wollte jede Art auf einer eigenen Seite: "das Leaderboard ist
 * eine eigene Page, die Overlays ist eine eigene Page". Was sie teilen, ist
 * die Leiste links und der Kasten rechts, in dem die eigenen Overlays stehen -
 * und der Weg, wie eine Einstellung gespeichert wird.
 *
 * Der Kern ist die Kennung: sie steht in der Adresse, die in OBS liegt, und
 * bleibt dieselbe. Alles andere wandert ueber /api/overlay-config und wird
 * vom Overlay im Takt nachgeholt. Wer hier etwas umstellt, sieht es im Stream,
 * ohne die Browserquelle anzufassen.
 */

export interface OverlayEintrag {
  id: string;
  typ: string;
  name: string;
  stand: number;
  geaendert: string;
  config: Record<string, unknown>;
  /*
   * Wer es angelegt und wer es zuletzt angefasst hat.
   *
   * Nur bei einem Manager-Zugang gefuellt, den sich mehrere teilen. Sonst
   * leer - dort ist ohnehin klar, wer es war.
   */
  angelegtVon?: string | null;
  geaendertVon?: string | null;
  /** Control key of a custom scoreboard (owner only). */
  steuer?: string | null;
}

/** Die Arten, die es gibt - dieselbe Reihenfolge wie in der Leiste. */
export const ARTEN: Array<{
  schluessel: string; pfad: string; titel: string; datei: string; was: string;
  /** Subtitle under the name. */
  kurz: string;
  /** Plain-English: what it shows. */
  zeigt: string;
  /** Plain-English: when to use it. */
  wann: string;
  /** Recommended OBS browser-source size. */
  obs: { b: number; h: number };
  /** Where the numbers come from. */
  quelle: string;
  /**
   * Braucht diese Art keinen Cup?
   *
   * Dann fuehrt "Neues Overlay" direkt in den Baukasten. Der Betreiber zum
   * Offspawn: "muss man kein Cup auswaehlen" - und fuer den eigenen Text
   * gibt es erst recht keinen.
   */
  ohneCup?: boolean;
  /**
   * Nicht in der Auswahl und nicht in der Leiste.
   *
   * Der Betreiber (1.10.2026) wollte nur drei Arten sehen: Team Banner,
   * Leaderboard, Custom. Am 19.10.2026 holte er Cup timer und Qual line
   * zurueck ("Custom Overlays sind gut, aber mir fehlt ein Timer Overlay und
   * eine Qual line") - versteckt ist seither nur noch der eigene Text.
   * Was jemand von einer versteckten Art angelegt hat, laeuft weiter: die
   * Adresse in OBS und die Seite dazu bleiben.
   */
  versteckt?: boolean;
}> = [
  {
    schluessel: 'teamkarte', pfad: '/streamer/overlays/teamkarte', titel: 'Team Banner',
    datei: 'banner.html',
    was: 'Zwei Spieler nebeneinander, mit Foto und Werten',
    kurz: 'Your team, live stats',
    zeigt: 'You (solo), your duo or trio with photos and the live numbers of the cup day: place, points, games, eliminations. Can rotate through several teams.',
    wann: 'Keep it on screen while you play a cup, so viewers always see where you stand.',
    obs: { b: 1920, h: 1080 },
    quelle: 'Epic leaderboard of the chosen cup day, refreshed every 30 s',
  },
  {
    schluessel: 'standings', pfad: '/streamer/overlays/standings', titel: 'Leaderboard',
    datei: 'standings.html',
    was: 'Die vordersten Plätze des laufenden Spieltags',
    kurz: 'Top places, live',
    zeigt: 'The top places of a running cup day with points, optional photos and pages that flip through more places.',
    wann: 'For casters and watch parties, or between games to show the race at the top.',
    obs: { b: 1920, h: 1080 },
    quelle: 'Epic leaderboard of the chosen cup day, refreshed every 15 s or slower',
  },
  /*
   * Der Countdown - der Betreiber wollte ihn in der Leiste sehen: "links
   * daneben fehlt zum Beispiel ein Timer von einem Cup."
   */
  {
    schluessel: 'timer', pfad: '/streamer/overlays/timer', titel: 'Cup timer',
    datei: 'timer.html',
    was: 'Countdown bis zum Start des Spieltags',
    kurz: 'Countdown to the cup',
    zeigt: 'A countdown to the start of a cup day with the cup name. It hides itself the moment the cup starts.',
    wann: 'On your starting-soon screen before a cup.',
    obs: { b: 1920, h: 1080 },
    quelle: 'Cup schedule (start time of the chosen cup day)',
  },
  /*
   * Custom / Tokens (11/2026): a broadcast scoreboard for custom matches,
   * token events and showmatches - team vs team, stacked player names, a
   * big score that a control page updates live.
   */
  {
    schluessel: 'custom', pfad: '/streamer/overlays/custom', titel: 'Custom',
    datei: 'custom.html',
    was: 'Team gegen Team mit Stand - für Customs, Tokens und Showmatches',
    kurz: 'Tokens / showmatches',
    zeigt: 'A broadcast scoreboard: both teams with their players stacked, a big score in the middle, the event title and a LIVE tag. Colours, fonts, flags, logos and position are yours.',
    wann: 'For custom matches, token events and showmatches. Update the score live from a control page — on your PC or your phone.',
    obs: { b: 1920, h: 1080 },
    quelle: 'You — the score comes from the control page',
    ohneCup: true,
  },
  /*
   * Der Offspawn-Stand. Er holt als einziger nichts von Epic - was dort
   * steht, gibt der Betreiber selbst ein.
   */
  {
    schluessel: 'offspawn', pfad: '/streamer/overlays/offspawn', titel: 'Offspawn',
    datei: 'offspawn.html',
    was: 'Zwei Teams und ein Stand, von Hand gepflegt',
    kurz: '1v1 · 2v2 score with photos',
    zeigt: 'Two sides with photos and a score you count by hand — a compact box for offspawn fights, 1v1s and 2v2s.',
    wann: 'When you fight another team for a drop spot or play a quick 1v1 series.',
    obs: { b: 1920, h: 1080 },
    quelle: 'You — score and names are typed in by hand',
    ohneCup: true,
  },
  /*
   * Der eigene Text. Er war ein Balken unter dem Offspawn-Stand; der
   * Betreiber wollte ihn fuer sich: "das gibt's dann einfach als Overlay,
   * einfach selber."
   */
  {
    schluessel: 'text', pfad: '/streamer/overlays/text', titel: 'Custom text',
    datei: 'text.html',
    was: 'Eine Zeile Text, frei geschrieben, mit Balken oder ohne',
    kurz: 'One free line',
    zeigt: 'One line of your own text, with or without a bar.',
    wann: 'For notes like “GAME 4/6” or “BO3”.',
    obs: { b: 1920, h: 1080 },
    quelle: 'You',
    ohneCup: true,
    versteckt: true,
  },
  {
    schluessel: 'qual', pfad: '/streamer/overlays/qual', titel: 'Qual line',
    datei: 'qual.html',
    was: 'Wie viele Punkte es zum Weiterkommen braucht',
    kurz: 'Points needed to qualify',
    zeigt: 'How many points it takes to qualify: an estimate from earlier editions of the same cup, next to the live points at the qualifying place right now.',
    wann: 'During qualifiers and cash cups, so viewers know what you are aiming for.',
    obs: { b: 1920, h: 1080 },
    quelle: 'Earlier editions of the cup + live leaderboard',
  },
];

/*
 * Kostenlos oder VIP (Hub, Betreiber 26.11.2026: "kostenlose Konten bekommen die Standard-Werkzeuge fuer kleine Streamer").
 * Die Schnittstelle (/api/overlay-config) speichert fuer jedes angemeldete Konto; die Seite auf main zeigt alles nur VIPs. Im Hub sind die
 * Overlays ohne Cup-Daten frei (Timer zaehlt nur auf eine Startzeit, Offspawn und Text tippt man selbst) - alles mit Live-Cupdaten bleibt VIP.
 */
export const FREIE_ARTEN = ['timer', 'offspawn', 'text'];
export function darfArt(z: { vip: boolean; nutzer: boolean }, art: string): boolean {
  return z.vip || (z.nutzer && FREIE_ARTEN.includes(art));
}

/** Die Adresse, die in OBS gehoert. */
export function overlayAdresse(typ: string, id: string): string {
  const datei = ARTEN.find((a) => a.schluessel === typ)?.datei ?? 'standings.html';
  const basis = typeof window === 'undefined' ? '' : OV;
  return `${basis}/overlay/${datei}?id=${id}`;
}

/**
 * Die eigenen Overlays laden, anlegen, aendern und entfernen.
 *
 * Alles ueber dieselbe Schnittstelle - die Seiten unterscheiden sich nur in
 * dem, was sie einstellen lassen.
 */
export function useOverlays(typ: string) {
  const [liste, setListe] = useState<OverlayEintrag[] | null>(null);
  const [fehler, setFehler] = useState('');

  const laden = useCallback(async () => {
    try {
      // The type goes along: some types are only listed when asked for (app/api/overlay-config).
      const j = await (await fetch(`/api/overlay-config?meine=1&typ=${encodeURIComponent(typ)}`,
        { cache: 'no-store' })).json();
      setListe((j.overlays ?? []).filter((o: OverlayEintrag) => o.typ === typ));
    } catch {
      setListe([]);
    }
  }, [typ]);

  const { version: loeschVersion } = useLoeschStand();
  useEffect(() => { void laden(); }, [laden, loeschVersion]);

  const speichern = useCallback(async (
    eintrag: { id?: string; name: string; config: Record<string, unknown> },
  ) => {
    setFehler('');
    try {
      const r = await fetch('/api/overlay-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...eintrag, typ }),
      });
      const j = await r.json();
      if (!r.ok) { setFehler(j?.error ?? 'Could not save'); return null; }
      await laden();
      /*
       * Im Studio steckt diese Seite in einem Rahmen. Dort wartet die Buehne
       * darauf, welches Overlay gerade gespeichert wurde - damit das Element
       * auf dem Stream-Bild sofort dieses Overlay zeigt.
       */
      if (typeof window !== 'undefined' && window.parent !== window) {
        window.parent.postMessage({ comphub: 'overlay-gespeichert', typ, id: j.id, name: eintrag.name }, window.location.origin);
      }
      return j.id as string;
    } catch (e) {
      setFehler((e as Error).message);
      return null;
    }
  }, [typ, laden]);

  const entfernen = useCallback(async (id: string) => {
    const o = liste?.find((x) => x.id === id);
    await overlayLoeschen({ id, typ, name: o?.name ?? '' });
    await laden();
  }, [laden, liste, typ]);

  return { liste, fehler, speichern, entfernen, laden };
}

export default function OverlayGeruest({ aktiv, children, immerBaukasten = false }: {
  aktiv: string; children: React.ReactNode;
  /** Skip the start view: the page is a single configurator (Custom). */
  immerBaukasten?: boolean;
}) {
  const t = useT();
  const zugang = useZugang();
  /*
   * Baukasten oder Startseite?
   *
   * Wer die Seite blank aufruft, soll zuerst sehen, was er schon hat - so
   * wollte es der Betreiber: "wenn man draufkommt, sieht man alle seine
   * gespeicherten." In den Baukasten fuehrt der Knopf "Neues Overlay", der
   * einen Cup mitgibt, oder eine Adresse, die schon einen traegt.
   *
   * Entschieden wird an der Adresse und nicht an einem Zustand: ein neu
   * geladenes Fenster landet dann dort, wo es vorher stand.
   */
  const [imBaukasten, setImBaukasten] = useState(false);
  /*
   * Eingebettet im Studio: dieselbe Seite, nur ohne die Leiste links und
   * ohne "zurueck" - drumherum ist dann die Buehne, nicht die Overlay-Seite.
   */
  const [eingebettet, setEingebettet] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setImBaukasten(immerBaukasten || Boolean(p.get('bauen') || p.get('fenster') || p.get('id')));
    const drin = Boolean(p.get('eingebettet'));
    setEingebettet(drin);
    // Kopfzeile und schwebende Knoepfe ausblenden - siehe globals.css.
    document.documentElement.classList.toggle('eingebettet', drin);
  }, [immerBaukasten]);

  if (zugang.laedt) return <LadeSchirm />;

  // Ohne VIP (bei den VIP-Arten): der Vorhang mit dem Weg zum Zugang (siehe VipVorhang).
  if (!darfArt(zugang, aktiv)) return <VipVorhang />;

  return (
    <div className="text-white/85">
      <div className="flex flex-col gap-5">

        {/*
          * Neu angeordnet (Betreiber, 19.10.2026: "wenn ich das naechste Mal reingehe, soll es komplett anders aussehen"): oben der Kopf mit der Erklaerung,
          * darunter die Arten als Kapseln statt einer Leiste links, die eigenen Overlays als eingeklapptes Feld - und darunter erst der Baukasten.
          */}
        {!eingebettet && (
          <>
            <Link href="/streamer/overlays" className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-white/45 transition hover:text-violet-300">← <T>All overlays</T></Link>
            <SeitenKopf marke={<T>Für deinen Stream</T>}
              titel={<>{ARTEN.find((a) => a.schluessel === aktiv)?.titel ?? t('Overlays')}</>}
              text={<T>Die Adresse in OBS bleibt immer dieselbe. Was du hier umstellst, ist im Stream nach wenigen Sekunden zu sehen — ohne die Browserquelle anzufassen.</T>}
              rechts={
                <Link href="/streamer/vip#archiv"
                  className="rounded-full border border-white/15 px-4 py-2 text-xs font-bold text-white/70 transition hover:border-violet-400 hover:text-violet-200">
                  All saved overlays → My archive
                </Link>
              } />
            <nav className="flex flex-wrap gap-1 self-start rounded-full border border-white/10 bg-white/[0.035] p-1 shadow-sm">
              <Link href="/streamer/overlays"
                className="rounded-full px-5 py-2 text-sm font-bold text-white/55 transition hover:text-white">
                <T>Overview</T>
              </Link>
              {ARTEN.filter((a) => !a.versteckt || a.schluessel === aktiv).map((a) => (
                <Link key={a.schluessel} href={a.pfad} title={t(a.was)}
                  className={`rounded-full px-5 py-2 text-sm font-bold transition ${
                    aktiv === a.schluessel ? 'bg-violet-400 text-[#06080f] shadow' : 'text-white/55 hover:text-white'}`}>
                  {a.titel}{!FREIE_ARTEN.includes(a.schluessel) && !zugang.vip && <span className="ml-1.5 text-[9px] opacity-70">🔒</span>}
                </Link>
              ))}
            </nav>
            {imBaukasten && (
              <details className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-2.5">
                <summary className="cursor-pointer select-none text-xs font-semibold text-white/55 transition hover:text-white/85"><T>Deine Overlays</T></summary>
                <div className="mt-3 max-w-xl"><MeineOverlays nurArt={aktiv} /></div>
              </details>
            )}
          </>
        )}

        <div className="min-w-0 flex-1">
          {imBaukasten ? (
            <>
              {!eingebettet && !immerBaukasten && (
                <button onClick={() => { window.location.href = window.location.pathname; }}
                  className="mb-4 text-[11px] text-white/45 transition
                             hover:text-violet-400">
                  ← <T>zurück zu deinen Overlays</T>
                </button>
              )}
              {children}
            </>
          ) : (
            <Startansicht art={aktiv} onWeiter={(e, w) => {
              /*
               * In den Baukasten, ohne die Seite zu wechseln.
               *
               * Ein router.push auf dieselbe Adresse zeichnet nichts neu -
               * der Betreiber drueckte auf die Art und es passierte nichts.
               * Deshalb wandert der Cup von Hand in die Adresse (damit ein
               * Neuladen dort landet) und der Baukasten wird direkt
               * aufgeschlagen.
               */
              // Ohne Cup bleiben event und fenster weg - die Adresse traegt
              // dann nur "bauen".
              const p = new URLSearchParams({ bauen: '1' });
              if (e) p.set('event', e);
              if (w) p.set('fenster', w);
              if (eingebettet) p.set('eingebettet', '1');
              window.history.replaceState(
                null, '', `${window.location.pathname}?${p.toString()}`);
              setImBaukasten(true);
            }} />
          )}
        </div>
      </div>
    </div>
  );
}
