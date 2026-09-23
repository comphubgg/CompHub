'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import GlobalsGeruest from '../GlobalsGeruest';
import { GLOBALS_EVENT, GLOBALS_TAGE } from '@/lib/globalsCup';
import { useZugang } from '@/app/lib/zugang';
import { rahmen, spanneBei, type Spot } from '@/lib/prognoseKarte';
import { kernname } from '@/lib/homoglyph';

/*
 * Eine Form der Turnierkarte.
 *
 * Dieselbe Form wie in der Prognose, nur traegt sie dort die Teams in einer
 * eigenen Zuordnung und hier bei sich selbst.
 */
type KartenSpot = Spot & { teams?: string[] };

/*
 * Die Karte der Global Championship.
 *
 * Der Betreiber wollte sie unter /globals mitsehen koennen. Angelegt wird
 * sie weiterhin unter /maps - dort zieht er die Teams selbst auf die Formen,
 * und das ist seine Arbeit: hier wird nichts verteilt, nichts vorbelegt und
 * nichts veraendert.
 *
 * Deshalb steht hier auch kein Rahmen mit dem Karten-Werkzeug darin: jene
 * Seite schreibt ihren Stand zum Server zurueck, und schon ihr Aufruf kann
 * eine Einteilung veraendern. Diese Seite zeichnet die Karte selbst, aus den
 * gespeicherten Formen - gelesen wird, geschrieben nichts.
 */

interface KartenTeam { id: string; spieler?: string[]; ids?: string[]; farbe?: string }
interface Karte {
  id: string; titel: string; bildTitel?: string; bildId?: string;
  eventId?: string; windowId?: string;
  namenSichtbar?: boolean;
  geaendert?: number; oeffentlich?: boolean;
  teams?: KartenTeam[]; spots?: KartenSpot[];
}

/**
 * Der Name, wie er auf der Karte steht.
 *
 * Ohne Turniermarke, und in derselben Schreibweise wie im Karten-Werkzeug:
 * erster Buchstabe gross, der Rest klein - der Betreiber: "Mach immer die
 * Regel, erster Buchstabe gross, der Rest klein."
 */
function kurz(name: string): string {
  // Wie im Karten-Werkzeug: Turniermarke und Orgtag fallen weg ("GodL Chap"
  // wird "Chap"), dann die Schreibweise.
  const n = kernname(String(name ?? '')).slice(0, 16);
  return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : n;
}

/** Wie die Karte hier heisst - eine Karte fuer beide Tage. */
const KARTEN_NAME = 'Global Championship (2026)';

/**
 * Eine gespeicherte Karte zeichnen - dieselbe Darstellung wie in der
 * Prognose: das Kartenbild, die Formen darueber, und in jeder Form die
 * Teams, die dort stehen.
 */
function KartenBild({ karte }: { karte: Karte }) {
  const t = useT();
  const teams = new Map((karte.teams ?? []).map((x) => [x.id, x]));
  const spots = karte.spots ?? [];
  // So gross wie in der Prognose: bezogen auf die Breite der Karte.
  const schrift = 1.5;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[900px]
                    overflow-hidden rounded-xl border border-zinc-800"
      style={{ containerType: 'inline-size' }}>
      {/*
        * Das Kartenbild. Ohne eigenes Bild ist es die Fortnite-Karte des
        * Tages - dasselbe, was das Karten-Werkzeug zeigt. Hier stand vorher
        * nur ein Bild, wenn die Karte ein eigenes hatte, und die Globals-Karte
        * hat keins: die Formen lagen auf Schwarz.
        */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={t('Karte')} draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        src={karte.bildId
          ? `/api/karten-bild?datei=1&id=${encodeURIComponent(karte.bildId)}`
          : '/api/fortnite-map?bild=poi'} />

      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full">
        {spots.map((sp) => {
          const belegt = (sp.teams ?? []).length;
          return (
            <polygon key={sp.id}
              points={sp.punkte.map((q) => `${q.x},${q.y}`).join(' ')}
              fill={belegt >= 2 ? 'rgba(220,38,38,0.34)'
                : belegt === 1 ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0.14)'}
              stroke={belegt >= 2 ? 'rgb(248,60,60)'
                : belegt === 1 ? 'rgba(0,0,0,0.95)' : sp.farbe ?? 'rgba(0,0,0,0.75)'}
              strokeWidth={2} vectorEffect="non-scaling-stroke" />
          );
        })}
      </svg>

      {karte.namenSichtbar !== false && spots.map((sp) => {
        const drauf = sp.teams ?? [];
        if (!drauf.length) return null;
        const r = rahmen(sp.punkte);
        const anzahl = drauf.length;
        return drauf.map((key, i) => {
          const tm = teams.get(key);
          const texte = (tm?.spieler ?? []).map(kurz).filter(Boolean);
          if (!texte.length) return null;
          const bandMitte = r.oben + (r.hoehe / anzahl) * (i + 0.5);
          const hoch = texte.length * schrift * 1.15;
          const obenY = r.oben + hoch * 0.62;
          const untenY = r.oben + r.hoehe - hoch * 0.62;
          const platz = untenY - obenY;
          const y = (anzahl === 1 || platz <= 0)
            ? bandMitte : obenY + platz * (i / (anzahl - 1));
          const spanne = spanneBei(sp.punkte, y)
            ?? { mitte: r.links + r.breite / 2, breite: r.breite };
          return (
            <div key={`${sp.id}-${key}`}
              style={{ left: `${spanne.mitte}%`, top: `${y}%`,
                transform: 'translate(-50%, -50%)' }}
              className="pointer-events-none absolute z-10 text-center leading-none">
              {texte.map((tx, z) => (
                <p key={z} style={{ fontSize: `${schrift}cqw` }}
                  className="whitespace-nowrap font-semibold text-white
                             drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                  {tx}
                </p>
              ))}
            </div>
          );
        });
      })}
    </div>
  );
}

export default function GlobalsMap() {
  /*
   * Anlegen und bearbeiten darf nur der Admin. Der Betreiber: "ich hoffe,
   * das geht nur fuer den Admin, dass er sie erstellen kann." Das
   * Karten-Werkzeug laesst ohnehin nur ihn bauen - hier steht fuer alle
   * anderen deshalb auch kein Knopf dorthin.
   */
  const zugang = useZugang();
  const [karten, setKarten] = useState<Karte[] | null>(null);
  const [offen, setOffen] = useState(0);
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    let weg = false;
    fetch('/api/turnier-karten', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (weg) return;
        const alle: Karte[] = Array.isArray(j) ? j : (j?.karten ?? []);
        setKarten(alle.filter((k) => k.eventId === GLOBALS_EVENT));
      })
      .catch((e) => { if (!weg) { setFehler((e as Error).message); setKarten([]); } });
    return () => { weg = true; };
  }, []);

  const neuAdresse = `/maps?event=${encodeURIComponent(GLOBALS_EVENT)}`
    + `&window=${encodeURIComponent(GLOBALS_TAGE[0].windowId)}`;

  return (
    <GlobalsGeruest aktiv="/globals/map">
      {karten === null ? (
        <LadeSchirm />
      ) : fehler ? (
        <p className="rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-3
                      text-sm text-amber-300">{fehler}</p>
      ) : !karten.length ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-base font-semibold text-slate-100">
            <T>Noch keine Karte für die Globals</T>
          </h2>
          {zugang.admin ? (
            <>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
                <T>Die Karte entsteht im Karten-Werkzeug: Formen setzen, Teams
                darauf ziehen. Hier wird nichts von selbst verteilt — wer wo
                landet, entscheidest du.</T>
              </p>
              <Link href={neuAdresse}
                className="mt-4 inline-block rounded-lg border border-amber-500/40
                           bg-amber-400/10 px-4 py-2 text-sm font-semibold
                           text-amber-200 transition hover:bg-amber-400/20">
                <T>Karte anlegen</T>
              </Link>
            </>
          ) : (
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
              <T>Sobald die Karte steht, ist sie hier zu sehen.</T>
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {karten.map((k, i) => (
              <button key={k.id} type="button" onClick={() => setOffen(i)}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  i === offen
                    ? 'border-amber-400/60 bg-amber-400/15 font-semibold text-amber-200'
                    : 'border-zinc-800 text-slate-300 hover:border-zinc-700'}`}>
                {/*
                  * Kein "Battle Royale · Day 1": die Karte ist fuer beide
                  * Tage dieselbe. Der Betreiber wollte hier "Global
                  * Championship (2026)" stehen haben, ohne Tag. Nur wenn es
                  * mehrere Karten gibt, steht das Bild dahinter.
                  */}
                {KARTEN_NAME}
                {karten.length > 1 && (
                  <span className="ml-2 text-[11px] text-slate-500">
                    {k.bildTitel || k.titel}
                  </span>
                )}
              </button>
            ))}
{zugang.admin && (
            <Link href={`/maps?id=${encodeURIComponent((karten[offen] ?? karten[0]).id)}`}
              className="ml-auto rounded-lg border border-zinc-800 px-3 py-2
                         text-xs text-slate-400 transition
                         hover:border-amber-400/60 hover:text-amber-200">
              <T>Im Karten-Werkzeug öffnen</T>
            </Link>
            )}
          </div>

          <KartenBild karte={karten[offen] ?? karten[0]} />

          <p className="mt-3 text-center text-[11px] text-slate-600">
            <T>Nur zum Ansehen — verschoben wird im Karten-Werkzeug.</T>
          </p>
        </>
      )}
    </GlobalsGeruest>
  );
}
