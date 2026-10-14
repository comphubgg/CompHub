'use client';

/*
 * "Solo Stats" und "Team Stats" eines Cups wie bei Osirion: oben ein Konto-Auswahlfeld (das eigene, verifizierte Epic-Konto - oder die
 * Karte "Verify with Epic Games") und eine Spielersuche; darunter die Werte des gewaehlten Spielers. Bei einem Team-Cup stehen die
 * Mitspieler nebeneinander (Duo: zwei Spalten, Trio: drei), die eigene Spalte umrahmt, mit Pfeilen: wer bei einem Wert vorn liegt und wer
 * hinten. Bei einem Solo-Cup steht eine Spalte da, dazu rechts je Wert eine Kurve ueber die Matches.
 *
 * Der Betreiber (13.10.2026): "genau eins zu eins, nur mit meinen Farben ... bei Teams nebeneinander ... zu jedem einzelnen Stat eine
 * Zahl". Woher die Werte kommen (app/api/spieler-detail): Epics Bestenliste fuer jeden Cup (Platz, Punkte, je Match Platz, Eliminierungen,
 * Ueberlebenszeit - je Team), die Szene-Quelle fuer die Spieltage, die sie fuehrt, und die ausgewerteten Replays (je Spieler Eliminierungen,
 * Tode, Schaden, Treffer). Was eine Quelle nicht kennt, steht mit einem Strich da und einem Hinweis - es wird nichts erfunden.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import EpicMeldung from '@/app/components/EpicMeldung';
import TeamFlagge from '@/components/TeamFlagge';
import { useZugang } from '@/app/lib/zugang';

interface Match {
  placement?: number; elims?: number; timeAlive?: number; wins?: number;
  damage?: number; damageTaken?: number; headshots?: number; heilung?: number; schild?: number; strecke?: number;
  holzGefarmt?: number; steinGefarmt?: number; metallGefarmt?: number;
  punktePlatz?: number; punkteElim?: number;
}
interface Eintrag {
  players?: unknown[];
  rank: number; points: number; elims: number; games: number; wins: number; kd: number; timeAlive: number;
  damage: number; damageTaken: number; headshots: number; matsGefarmt: number; strecke: number;
  punktePlatz?: number; punkteElims?: number; matches: Match[];
}
interface Replay { kills: number | null; knocks: number | null; tode: number | null; spiele: number | null; damage?: number; damageTaken?: number; hits?: number; headshots?: number; sturmSek?: number }
interface Mitglied { id: string; name: string; land: string | null; ich: boolean; szene: Record<string, number> | null; replay: Replay | null }
interface Antwort {
  ok: boolean; error?: string; id: string; name: string; dabei: boolean;
  rank: number | null; gesamt: number; top: number | null; eintrag: Eintrag | null;
  mitglieder: Mitglied[]; aktualisiert: string | null; szeneStand: string | null; szeneMatches: number;
  eigeneAuswertung?: { gelesen: number; sitzungen: number; gerechnet: string; grund: string | null } | null;
}
interface Treffer { id: string; name: string; rank: number; points: number; team: string[] }

const num = (v: number) => Math.round(v).toLocaleString('en-US');
const pct = (v: number) => `${v.toFixed(2)}%`;
function dauer(s: number): string {
  const st = Math.floor(s / 3600); const mi = Math.floor((s % 3600) / 60);
  return st ? `${st}h ${mi}m` : `${mi}m ${Math.round(s % 60)}s`;
}
const km = (cm: number) => `${(cm / 100000).toFixed(1)}km`;

type Wert = number | null;
interface Ctx { e: Eintrag | null; solo: boolean }
interface Zeile {
  titel: string;
  wert: (m: Mitglied, c: Ctx) => Wert;
  zeige: (v: number) => string;
  /** Der Wert je Spiel fuer die Kurve - nur dort, wo Epic ihn je Spiel liefert (und nur bei Solo-Cups, sonst gilt er dem Team). */
  je?: (m: Match) => number | undefined;
  /** Rot statt blau: Schaden, den man genommen hat, Sturm. */
  rot?: boolean;
  /** Bei diesem Wert ist weniger besser (Pfeil und Farbe drehen sich). */
  weniger?: boolean;
}
const pos = (v: number | undefined | null) => (typeof v === 'number' && v > 0 ? v : null);
const sz = (m: Mitglied, k: string): Wert => (m.szene && typeof m.szene[k] === 'number' ? m.szene[k] : null);

const kills = (m: Mitglied, c: Ctx): Wert => sz(m, 'eliminations') ?? (m.replay?.kills ?? null) ?? (c.solo && c.e ? c.e.elims : null);
const dmg = (m: Mitglied, c: Ctx): Wert => sz(m, 'damageDealt') ?? (m.replay?.damage ?? null) ?? (c.solo ? pos(c.e?.damage) : null);
const dmgT = (m: Mitglied, c: Ctx): Wert => sz(m, 'damageTakenFromPlayers') ?? (m.replay?.damageTaken ?? null) ?? (c.solo ? pos(c.e?.damageTaken) : null);
const treffer = (m: Mitglied): Wert => sz(m, 'hitsToPlayers') ?? (m.replay?.hits ?? null);
const kopf = (m: Mitglied, c: Ctx): Wert => sz(m, 'headshots') ?? (m.replay?.headshots ?? null) ?? (c.solo ? pos(c.e?.headshots) : null);

const ZEILEN: Zeile[] = [
  { titel: 'Eliminations', wert: kills, zeige: num, je: (m) => m.elims },
  { titel: 'Damage To Players', wert: dmg, zeige: num, je: (m) => m.damage },
  { titel: 'Damage From Players', wert: dmgT, zeige: num, je: (m) => m.damageTaken, rot: true, weniger: true },
  { titel: 'Damage Ratio', wert: (m, c) => { const a = dmg(m, c); const b = dmgT(m, c); return a !== null && b ? a / b : null; }, zeige: (v) => v.toFixed(2) },
  { titel: 'K/D Ratio', wert: (m, c) => {
    if (m.replay && m.replay.tode !== null) return kills(m, c) !== null ? (kills(m, c) as number) / Math.max(1, m.replay.tode) : null;
    if (c.solo) return c.e && c.e.games ? c.e.kd : null;
    const k = kills(m, c);
    return k !== null && c.e ? k / Math.max(1, c.e.games - c.e.wins) : null;
  }, zeige: (v) => v.toFixed(2) },
  { titel: 'Health Healed', wert: (m) => sz(m, 'healthHealed'), zeige: num },
  { titel: 'Shield Healed', wert: (m) => sz(m, 'shieldHealed'), zeige: num },
  { titel: 'Player Accuracy', wert: (m) => { const s = sz(m, 'shots'); const h = sz(m, 'hitsToPlayers'); return s && h !== null ? (h / s) * 100 : null; }, zeige: pct },
  { titel: 'Headshots', wert: kopf, zeige: num, je: (m) => m.headshots },
  { titel: 'Edit Accuracy', wert: () => null, zeige: pct },
  { titel: 'Avg Edit Time', wert: () => null, zeige: (v) => `${Math.round(v)}ms` },
  { titel: 'Mats Farmed', wert: (m, c) => { const w = sz(m, 'woodFarmed'); const s = sz(m, 'stoneFarmed'); const me = sz(m, 'metalFarmed'); return w !== null && s !== null && me !== null ? w + s + me : (c.solo ? pos(c.e?.matsGefarmt) : null); }, zeige: num, je: (m) => (m.holzGefarmt ?? 0) + (m.steinGefarmt ?? 0) + (m.metallGefarmt ?? 0) || undefined },
  // Im Team-Cup zaehlt Epic die Zeit je Team: jedes Mitglied hat sie (wo die Szene-Quelle eine eigene Zeit fuehrt, gilt die).
  { titel: 'Time Alive', wert: (m, c) => (c.solo && c.e && c.e.timeAlive ? c.e.timeAlive : (sz(m, 'timeAlive') ?? (c.e && c.e.timeAlive ? c.e.timeAlive : null))), zeige: dauer, je: (m) => m.timeAlive },
  { titel: 'Assists', wert: (m) => sz(m, 'assists'), zeige: num },
  { titel: 'Overshield Healed', wert: () => null, zeige: num },
  { titel: 'Hits To Players', wert: (m) => treffer(m), zeige: num },
  { titel: 'Shots', wert: (m) => sz(m, 'shots'), zeige: num },
  { titel: 'Overall Accuracy', wert: (m) => { const s = sz(m, 'shots'); const h = sz(m, 'hitsToPlayers'); return s && h !== null ? (h / s) * 100 : null; }, zeige: pct },
  { titel: 'Weakpoint Accuracy', wert: (m, c) => { const h = treffer(m); const k = kopf(m, c); return h && k !== null ? (k / h) * 100 : null; }, zeige: pct },
  { titel: 'Players Revived', wert: () => null, zeige: num },
  { titel: 'Got Revived', wert: () => null, zeige: num },
  { titel: 'Players Rebooted', wert: () => null, zeige: num },
  { titel: 'Got Rebooted', wert: () => null, zeige: num },
  { titel: 'Wood Farmed', wert: (m, c) => sz(m, 'woodFarmed') ?? (c.solo ? pos(c.e?.matches.reduce((a, x) => a + (x.holzGefarmt ?? 0), 0)) : null), zeige: num, je: (m) => m.holzGefarmt },
  { titel: 'Stone Farmed', wert: (m, c) => sz(m, 'stoneFarmed') ?? (c.solo ? pos(c.e?.matches.reduce((a, x) => a + (x.steinGefarmt ?? 0), 0)) : null), zeige: num, je: (m) => m.steinGefarmt },
  { titel: 'Metal Farmed', wert: (m, c) => sz(m, 'metalFarmed') ?? (c.solo ? pos(c.e?.matches.reduce((a, x) => a + (x.metallGefarmt ?? 0), 0)) : null), zeige: num, je: (m) => m.metallGefarmt },
  { titel: 'Mats Collected', wert: () => null, zeige: num },
  { titel: 'Wood Collected', wert: () => null, zeige: num },
  { titel: 'Stone Collected', wert: () => null, zeige: num },
  { titel: 'Metal Collected', wert: () => null, zeige: num },
  { titel: 'Time in Storm', wert: (m) => sz(m, 'timeInStorm') ?? (m.replay?.sturmSek ?? null), zeige: dauer, rot: true, weniger: true },
  { titel: 'Storm Damage Taken', wert: (m) => sz(m, 'stormDamage'), zeige: num, rot: true, weniger: true },
  { titel: 'Surge Hits', wert: () => null, zeige: num },
  { titel: 'Distance Traveled', wert: (m, c) => { const a = sz(m, 'distanceOnFoot'); const b = sz(m, 'distanceSkydiving'); return a !== null && b !== null ? a + b : (c.solo ? pos(c.e?.strecke) : null); }, zeige: km, je: (m) => m.strecke },
];

/** Wie viele Zeilen zuerst zu sehen sind - der Rest steht hinter "More" (wie bei Osirion). */
const ZUERST = 13;

/** Eine Kurve ueber die Spiele - gefuellte Flaeche wie bei Osirion; ohne Werte nur die Grundlinie. */
function Welle({ werte, rot, kumuliert }: { werte: number[]; rot?: boolean; kumuliert: boolean }) {
  const farbe = rot ? '#f87171' : '#38bdf8';
  if (werte.length < 2 || werte.every((v) => !v)) return <svg viewBox="0 0 300 26" preserveAspectRatio="none" className="h-[26px] w-full"><line x1="0" x2="300" y1="25" y2="25" stroke="#3f3f46" strokeWidth="1" /></svg>;
  let reihe = werte;
  if (kumuliert) { let a = 0; reihe = werte.map((v) => (a += v)); }
  const max = Math.max(...reihe, 1); const min = kumuliert ? 0 : Math.min(...reihe, 0);
  const x = (i: number) => (i / (reihe.length - 1)) * 300;
  const y = (v: number) => 24 - ((v - min) / Math.max(1e-9, max - min)) * 22;
  let d = `M${x(0)},${y(reihe[0])}`;
  for (let i = 1; i < reihe.length; i += 1) { const cx = (x(i - 1) + x(i)) / 2; d += ` C${cx},${y(reihe[i - 1])} ${cx},${y(reihe[i])} ${x(i)},${y(reihe[i])}`; }
  return (
    <svg viewBox="0 0 300 26" preserveAspectRatio="none" className="h-[26px] w-full">
      <path d={`${d} L300,25 L0,25 Z`} fill={farbe} fillOpacity={0.22} />
      <path d={d} fill="none" stroke={farbe} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      <line x1="0" x2="300" y1="25" y2="25" stroke="#3f3f46" strokeWidth="1" />
    </svg>
  );
}

function vorMinuten(iso: string | null, jetzt: number): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso); if (!Number.isFinite(ms)) return null;
  const m = Math.max(0, Math.round((jetzt - ms) / 60000));
  return m < 1 ? 'just now' : m === 1 ? '1 minute ago' : m < 90 ? `${m} minutes ago` : `${Math.round(m / 60)} hours ago`;
}

const TAKT_MS = 5 * 60_000;

export default function SpielerDetail({ eventId, windowId, rueckPfad, solo }: { eventId: string; windowId: string; rueckPfad: string; solo: boolean }) {
  const t = useT();
  const zugang = useZugang();
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState('');
  const [treffer, setTreffer] = useState<Treffer[] | null>(null);
  const [sucht, setSucht] = useState(false);
  const [wahl, setWahl] = useState<{ id: string; name: string } | null>(null);
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState('');
  const [kumuliert, setKumuliert] = useState(false);
  const [mehr, setMehr] = useState(false);
  const [jetzt, setJetzt] = useState(() => Date.now());
  const [geholt, setGeholt] = useState(0);
  const [eigenerName, setEigenerName] = useState('');
  const rahmen = useRef<HTMLDivElement | null>(null);
  const [trennFehler, setTrennFehler] = useState('');
  /** Die Auswertung der eigenen Lobbys (lib/eigeneAuswertung): bestellt, fertig oder abgewiesen. */
  const [auswertung, setAuswertung] = useState<{ stand: 'angefragt' | 'fertig' | 'fehler'; fehler?: string } | null>(null);
  const bestellt = useRef(new Set<string>());

  // Draussen klicken schliesst die Liste.
  useEffect(() => {
    const zu = (e: MouseEvent) => { if (rahmen.current && !rahmen.current.contains(e.target as Node)) setOffen(false); };
    document.addEventListener('mousedown', zu);
    return () => document.removeEventListener('mousedown', zu);
  }, []);

  // Der Name des eigenen, verifizierten Kontos - fuer den Eintrag in der Liste.
  useEffect(() => {
    if (!zugang.epicId || !eventId || !windowId) return undefined;
    let weg = false;
    fetch(`/api/spieler-detail?event=${encodeURIComponent(eventId)}&window=${encodeURIComponent(windowId)}&id=${zugang.epicId}`)
      .then((r) => r.json()).then((j: Antwort) => { if (!weg && j?.ok && j.name) setEigenerName(j.name); }).catch(() => { /* ohne Namen bleibt die Kurzform */ });
    return () => { weg = true; };
  }, [zugang.epicId, eventId, windowId]);

  // Die Suche - erst nach einer kurzen Tipppause.
  useEffect(() => {
    const q = suche.trim();
    if (q.length < 2) { setTreffer(null); return undefined; }
    let weg = false; setSucht(true);
    const uhr = setTimeout(() => {
      fetch(`/api/spieler-detail?event=${encodeURIComponent(eventId)}&window=${encodeURIComponent(windowId)}&q=${encodeURIComponent(q)}`)
        .then((r) => r.json()).then((j) => { if (!weg) setTreffer(j?.ok ? j.treffer : []); })
        .catch(() => { if (!weg) setTreffer([]); })
        .finally(() => { if (!weg) setSucht(false); });
    }, 350);
    return () => { weg = true; clearTimeout(uhr); setSucht(false); };
  }, [suche, eventId, windowId]);

  const laden = useCallback((id: string, still = false) => {
    if (!still) { setLaedt(true); setDaten(null); }
    setFehler('');
    return fetch(`/api/spieler-detail?event=${encodeURIComponent(eventId)}&window=${encodeURIComponent(windowId)}&id=${id}`)
      .then((r) => r.json())
      .then((j: Antwort) => { if (j?.ok) { setDaten(j); setGeholt(Date.now()); } else setFehler(j?.error ?? 'Epic liefert gerade nichts.'); })
      .catch(() => setFehler('Epic liefert gerade nichts.'))
      .finally(() => setLaedt(false));
  }, [eventId, windowId]);

  useEffect(() => { if (wahl) void laden(wahl.id); }, [wahl, laden]);

  /*
   * Wer seine eigenen Werte ansieht und in diesem Cup weder Schaden noch Treffer hat, bestellt damit die Auswertung seiner Lobbys (einmal je Cup):
   * ein paar Replays statt der tausenden des ganzen Cups. Der Ablauf braucht meist 10 bis 30 Minuten; solange fragt die Seite jede Minute nach.
   */
  useEffect(() => {
    if (!daten || !daten.dabei || !zugang.epicId) return;
    const ich = daten.mitglieder.find((m) => m.id === zugang.epicId);
    if (!ich) return;
    if (ich.replay?.damage != null || ich.szene?.damageDealt != null || daten.eigeneAuswertung) { setAuswertung(daten.eigeneAuswertung ? { stand: 'fertig' } : null); return; }
    const key = `${eventId}|${windowId}|${zugang.epicId}`;
    if (bestellt.current.has(key)) return;
    bestellt.current.add(key);
    fetch('/api/eigene-auswertung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId, windowId }) })
      .then((r) => r.json())
      .then((j) => setAuswertung(j?.ok ? { stand: j.stand === 'fertig' ? 'fertig' : 'angefragt' } : { stand: 'fehler', fehler: j?.error }))
      .catch(() => setAuswertung({ stand: 'fehler', fehler: 'Die Bestellung ließ sich gerade nicht senden.' }));
  }, [daten, zugang.epicId, eventId, windowId]);
  useEffect(() => {
    if (!wahl || auswertung?.stand !== 'angefragt') return undefined;
    const uhr = setInterval(() => { void laden(wahl.id, true); }, 60_000);
    return () => clearInterval(uhr);
  }, [wahl, auswertung, laden]);
  // Erneuern im Takt, solange der Spieler offen ist - Epic zaehlt waehrend eines Cups weiter.
  useEffect(() => {
    if (!wahl) return undefined;
    const uhr = setInterval(() => { void laden(wahl.id, true); }, TAKT_MS);
    return () => clearInterval(uhr);
  }, [wahl, laden]);
  useEffect(() => { const u = setInterval(() => setJetzt(Date.now()), 15_000); return () => clearInterval(u); }, []);
  // Anderer Cup oder Spieltag: die Auswahl faellt weg.
  useEffect(() => { setWahl(null); setDaten(null); setTreffer(null); setSuche(''); setMehr(false); setAuswertung(null); }, [eventId, windowId]);

  const e = daten?.eintrag ?? null;
  const spiele = e?.matches ?? [];
  const nr = useMemo(() => spiele.map((_m, i) => i + 1), [spiele]);
  const mitglieder = daten?.mitglieder ?? [];
  const team = !solo && mitglieder.length > 1;
  const ctx: Ctx = { e, solo: !team };
  const verifizieren = `/api/auth/epic/authorize?zurueck=${encodeURIComponent(rueckPfad)}`;
  const trennen = async () => {
    setTrennFehler('');
    try {
      const r = await fetch('/api/auth/epic/trennen', { method: 'POST' });
      const j = await r.json().catch(() => ({} as { fehler?: string }));
      if (r.ok) { window.location.reload(); return; }
      setTrennFehler(j?.fehler || t('Das Trennen hat nicht geklappt.'));
    } catch { setTrennFehler(t('Das Trennen hat nicht geklappt.')); }
  };
  const naechste = geholt ? Math.max(0, Math.ceil((geholt + TAKT_MS - jetzt) / 60000)) : null;
  const letzte = vorMinuten(daten?.aktualisiert ?? null, jetzt);
  const zeilen = mehr ? ZEILEN : ZEILEN.slice(0, ZUERST);

  const kumPlatz = useMemo(() => { let a = 0; return spiele.map((m) => (a += m.punktePlatz ?? 0)); }, [spiele]);
  const kumElim = useMemo(() => { let a = 0; return spiele.map((m) => (a += m.punkteElim ?? 0)); }, [spiele]);
  const kopfMax = Math.max(1, ...kumPlatz, ...kumElim);
  const kx = (i: number) => (spiele.length > 1 ? (i / (spiele.length - 1)) * 300 : 0);
  const ky = (v: number) => 58 - (v / kopfMax) * 52;
  const linie = (w: number[]) => w.map((v, i) => `${kx(i)},${ky(v)}`).join(' ');

  /** Der Pfeil eines Werts im Vergleich zu den Mitspielern: vorn gruen nach oben, hinten rot nach unten (bei "weniger ist besser" andersherum). */
  const pfeil = (z: Zeile, werte: Wert[], i: number) => {
    const v = werte[i];
    const alle = werte.filter((x): x is number => x !== null);
    if (v === null || alle.length < 2) return null;
    const hoch = Math.max(...alle); const tief = Math.min(...alle);
    if (hoch === tief) return null;
    const vorn = z.weniger ? v === tief : v === hoch;
    const hinten = z.weniger ? v === hoch : v === tief;
    if (!vorn && !hinten) return null;
    return <span className={`ml-1.5 text-[10px] ${vorn ? 'text-emerald-400' : 'text-rose-400'}`}>{v === hoch ? '▲' : '▼'}</span>;
  };

  const kasten = 'rounded-xl border bg-zinc-950/40';
  const spaltenWerte = (z: Zeile) => mitglieder.map((m) => z.wert(m, ctx));

  return (
    <div className="mb-6">
      <EpicMeldung />

      {/* ------------------------------------------------ Auswahl und Suche */}
      <div className="flex flex-wrap items-start gap-3" ref={rahmen}>
        <div className="relative w-64">
          <button type="button" onClick={() => setOffen((o) => !o)}
            className={`flex w-full items-center justify-between rounded-lg border bg-zinc-900/80 px-3 py-2 text-left text-sm font-semibold text-slate-100 transition ${offen ? 'border-sky-400' : 'border-zinc-700 hover:border-sky-500/60'}`}>
            <span className="truncate">{wahl ? wahl.name : t('Konto auswählen')}</span>
            <span className="ml-2 text-slate-500">▾</span>
          </button>
          {offen && (
            <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
              <p className="bg-sky-600 px-3 py-2 text-sm font-semibold text-white">{t('Konto auswählen')}</p>
              {zugang.epicId ? (
                <>
                  <button type="button" onClick={() => { setWahl({ id: zugang.epicId, name: eigenerName || zugang.name || zugang.epicId.slice(0, 8) }); setOffen(false); }}
                    className="block w-full px-3 py-2.5 text-left text-sm text-slate-100 transition hover:bg-sky-500/10">
                    {eigenerName || zugang.name || zugang.epicId.slice(0, 8)}
                  </button>
                  {/* Die Verifizierung bleibt fuer immer - bis jemand sie hier oder im Dashboard selbst trennt. */}
                  <button type="button" onClick={() => void trennen()}
                    className="block w-full border-t border-zinc-800 px-3 py-2 text-left text-xs text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300">
                    <T>Verbindung mit Epic trennen</T>
                  </button>
                  {trennFehler && <p className="px-3 pb-2 text-[11px] text-rose-300">{trennFehler}</p>}
                </>
              ) : (
                <a href={verifizieren} className="flex items-center gap-3 px-3 py-3 transition hover:bg-sky-500/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/icons/epic.svg" alt="" className="h-7 w-7 shrink-0" />
                  <span>
                    <span className="block text-sm font-bold text-slate-100"><T>Epic-Games-Konto verifizieren</T></span>
                    <span className="block text-[11px] text-slate-400"><T>Melde dich mit Epic Games an, um hier deine eigenen Stats zu sehen.</T></span>
                  </span>
                </a>
              )}
            </div>
          )}
        </div>

        <div className="relative w-64">
          <input value={suche} onChange={(ev) => setSuche(ev.target.value)} placeholder={t('Spieler suchen …')}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400" />
          {suche.trim().length >= 2 && (
            <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
              {sucht && <p className="px-3 py-2 text-xs text-slate-400"><T>Wird durchsucht …</T></p>}
              {!sucht && treffer && treffer.length === 0 && <p className="px-3 py-2 text-xs text-slate-400"><T>Kein Spieler gefunden.</T></p>}
              {(treffer ?? []).map((x) => (
                <button key={`${x.id}-${x.rank}`} type="button" onClick={() => { setWahl({ id: x.id, name: x.name }); setSuche(''); setTreffer(null); }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-sky-500/10">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-100">{x.name}</span>
                    {x.team.length > 0 && <span className="block truncate text-[11px] text-slate-500">+ {x.team.join(' · ')}</span>}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-slate-500">#{x.rank} · {x.points} {t('Punkte')}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ Der Spieler und sein Team */}
      {!wahl && <p className="mt-4 text-sm text-slate-500"><T>Wähle ein Konto oder suche einen Spieler, um seine Werte in diesem Cup zu sehen.</T></p>}
      {wahl && laedt && <div className="mt-4"><LadeSchirm /></div>}
      {wahl && fehler && !laedt && <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300"><T>{fehler}</T></p>}
      {wahl && daten && !laedt && !daten.dabei && (
        <p className="mt-4 rounded-xl border border-white/[0.08] bg-zinc-900/50 px-4 py-3 text-sm text-slate-300">
          <b className="text-slate-100">{daten.name || wahl.name}</b> <T>war in diesem Cup nicht dabei.</T>
        </p>
      )}

      {wahl && daten && !laedt && daten.dabei && e && (
        <div className="mt-4 rounded-2xl border border-white/[0.08] bg-zinc-950/70 p-4">
          {/* Kopf: die Spieler des Teams nebeneinander, darunter Rang, Punkte, Aufteilung */}
          <div className={`grid items-center gap-x-4 border-b border-white/[0.06] pb-3 ${team ? (mitglieder.length >= 3 ? 'grid-cols-3' : 'grid-cols-2') : 'grid-cols-1'}`}>
            {mitglieder.map((m) => (
              <p key={m.id} className="flex items-center justify-center gap-2 text-center text-[15px] font-black tracking-tight text-slate-50">
                <span className="truncate">{m.name}</span>
                <TeamFlagge groesse={16} laender={[m.land ?? undefined]} />
              </p>
            ))}
          </div>
          <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <p className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-50">Rank #{daten.rank}</span>
                {daten.top !== null && <span className="text-[12px] font-semibold text-slate-500">Top {daten.top} %</span>}
              </p>
              <div className="mt-2 space-y-1 text-[12px]">
                {e.punktePlatz !== undefined && <p className="flex"><span className="font-semibold text-slate-400">Placement</span></p>}
                {e.punkteElims !== undefined && <p className="flex"><span className="font-bold text-sky-300">Elimination</span></p>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black tabular-nums text-slate-50">{num(e.points)} points</p>
              <div className="mt-2 space-y-1 text-[12px] tabular-nums text-slate-300">
                {e.punktePlatz !== undefined && <p>{num(e.punktePlatz)} points</p>}
                {e.punkteElims !== undefined && <p>{num(e.punkteElims)} points</p>}
              </div>
            </div>
          </div>
          <p className="mt-3 flex justify-between text-[11px] text-slate-500">
            <span>Last update <b className="text-slate-300">{letzte ?? '–'}</b></span>
            <span>Next update <b className="text-slate-300">in {naechste ?? '–'} {naechste === 1 ? 'minute' : 'minutes'}</b></span>
          </p>

          {/* Verlauf der Punkte ueber die Matches */}
          {spiele.length > 1 && (e.punktePlatz !== undefined || e.punkteElims !== undefined) && (
            <div className="mt-3 rounded-xl border border-white/[0.06] bg-zinc-900/40 px-3 py-2">
              <svg viewBox="0 0 300 62" preserveAspectRatio="none" className="h-20 w-full">
                <polyline points={linie(kumPlatz)} fill="none" stroke="#a1a1aa" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
                <polyline points={linie(kumElim)} fill="none" stroke="#38bdf8" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              </svg>
              <p className="flex justify-between text-[10px] tabular-nums text-slate-600">{nr.map((n) => <span key={n}>{n}</span>)}</p>
              <p className="mt-0.5 flex items-center justify-center gap-4 text-[10px] text-slate-500">
                <span><i className="mr-1 inline-block h-[3px] w-4 bg-zinc-400 align-middle" />Placement</span>
                <span><i className="mr-1 inline-block h-[3px] w-4 bg-sky-400 align-middle" />Elimination</span>
                <span>Match number</span>
              </p>
            </div>
          )}

          {/* Die Auswertung der eigenen Lobbys: laeuft, fertig oder nicht moeglich. */}
          {zugang.epicId && mitglieder.some((m) => m.id === zugang.epicId) && auswertung?.stand === 'angefragt' && (
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-sky-500/30 bg-sky-500/[0.06] px-3 py-2.5 text-[12px] text-sky-100">
              <span className="mt-1 h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-400" />
              <span><T>Wir werten gerade die Replays deiner Spiele in diesem Cup aus - Schaden, Treffer und Kopftreffer kommen dazu. Das dauert meist 10 bis 30 Minuten; diese Seite aktualisiert sich selbst.</T></span>
            </p>
          )}
          {auswertung?.stand === 'fehler' && auswertung.fehler && (
            <p className="mt-4 rounded-xl border border-white/[0.08] bg-zinc-900/50 px-3 py-2.5 text-[12px] text-slate-400"><T>{auswertung.fehler}</T></p>
          )}
          {daten.eigeneAuswertung && daten.eigeneAuswertung.gelesen < daten.eigeneAuswertung.sitzungen && (
            <p className="mt-4 rounded-xl border border-white/[0.08] bg-zinc-900/50 px-3 py-2.5 text-[12px] text-slate-400">
              {daten.eigeneAuswertung.gelesen} / {daten.eigeneAuswertung.sitzungen} <T>Spiele ließen sich auswerten - bei Epic liegen nicht mehr alle Replays. Schaden und Treffer zählen nur diese Spiele.</T>
            </p>
          )}

          {/* ------------------------------------------------ Tabelle: je Spieler eine Spalte */}
          <div className="mt-4 flex gap-3 overflow-x-auto">
            <div className="w-[170px] shrink-0">
              <p className="flex h-[40px] items-center px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Stat</p>
              {zeilen.map((z) => (
                <p key={z.titel} className="flex h-[34px] items-center px-2 text-[12px] font-semibold text-slate-300">{z.titel}</p>
              ))}
            </div>
            {mitglieder.map((m, i) => (
              <div key={m.id} className={`min-w-[150px] flex-1 ${kasten} ${m.ich || !team ? 'border-sky-500/70' : 'border-white/[0.06]'}`}>
                <p className={`flex h-[40px] items-center justify-center border-b border-white/[0.06] px-2 text-center text-[12px] font-bold ${m.ich || !team ? 'text-slate-50' : 'text-slate-400'}`}>
                  <span className="truncate">{m.name}</span>
                </p>
                {zeilen.map((z) => {
                  const werte = spaltenWerte(z);
                  const w = werte[i];
                  return (
                    <p key={z.titel} className="flex h-[34px] items-center justify-center border-b border-white/[0.03] px-2 text-[12px] last:border-b-0">
                      {w === null
                        ? <span className="text-slate-600" title={t('Zu diesem Wert liefert keine Quelle Zahlen für diesen Cup.')}>–</span>
                        : <><span className={`font-bold tabular-nums ${m.ich || !team ? (z.rot ? 'text-rose-300' : 'text-slate-50') : 'text-slate-400'}`}>{z.zeige(w)}</span>{team ? pfeil(z, werte, i) : null}</>}
                    </p>
                  );
                })}
              </div>
            ))}
            {!team && spiele.length > 1 && (
              <div className="min-w-[260px] flex-[2]">
                <div className="flex h-[40px] items-center justify-between text-[10px] tabular-nums text-slate-600">
                  <span>Match number</span>
                  <label className="flex cursor-pointer items-center gap-1.5 text-slate-400"><input type="checkbox" checked={kumuliert} onChange={(ev) => setKumuliert(ev.target.checked)} className="accent-sky-400" /> Cumulative</label>
                </div>
                {zeilen.map((z) => (
                  <div key={z.titel} className="flex h-[34px] items-end border-b border-white/[0.03]">
                    <Welle werte={z.je ? spiele.map((m) => z.je?.(m) ?? 0) : []} rot={z.rot} kumuliert={kumuliert} />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-2 text-center">
            <button type="button" onClick={() => setMehr((v) => !v)} className="text-[12px] font-semibold text-slate-400 transition hover:text-slate-100">{mehr ? 'Less ▴' : 'More ▾'}</button>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
            {mitglieder.some((m) => m.szene)
              ? <><T>Schaden, Treffer, Material, Sturm und Strecke stammen aus der Szene-Quelle und gelten je Spieltag zusammen, nicht je Match.</T> </>
              : daten.eigeneAuswertung
                ? <><T>Schaden, Treffer und Kopftreffer sind aus den Replays deiner Lobbys gezählt; Eliminierungen, Zeit und Punkte kommen von Epic.</T> </>
              : mitglieder.some((m) => m.replay)
                ? <><T>Eliminierungen, Tode, Schaden und Treffer sind aus den ausgewerteten Replays dieses Spieltags gezählt.</T> </>
                : <><T>Für diesen Cup liefert Epic Platz, Punkte, Eliminierungen und Überlebenszeit je Match; die übrigen Werte gibt es hier nur, wenn eine Quelle sie für diesen Spieltag führt.</T> </>}
            {team && <T>Epic zählt Punkte, Eliminierungen und Zeit je Team.</T>}
          </p>
        </div>
      )}
    </div>
  );
}
