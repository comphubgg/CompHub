'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import VipVorhang from '@/app/overlays/VipVorhang';
import { useZugang } from '@/app/lib/zugang';
import { useT } from '@/app/components/SprachProvider';
import { loadUserStorageCloud, loadUserStorageValue, saveUserStorageCloud, saveUserStorageValue } from '@/app/lib/userStorage';

/*
 * Der Match-ID-Finder (Betreiber, 27.10.2026): Spieler als Favoriten speichern und waehrend eines Cups sehen, in welchem Match sie gerade sind - die Match-ID
 * kopieren und im Spiel zuschauen. Nur fuer VIPs. Daten: /api/match-finder (lib/matchFinder). Die Favoriten liegen am Konto (user-storage), wie Ordner und
 * Tierlisten.
 */

interface Favorit { id: string; name: string }
/** Ein Suchtreffer: Pro-Name, aktueller In-Game-Name und Bild. */
interface Treffer extends Favorit { ingame?: string | null; bild?: string | null }
interface FMatch { matchId: string; ende: string | null; platz: number | null; elims: number | null; windowId: string; titel: string }
interface FLive { matchId: string; quelle: 'bestenliste' | 'sitzung' | 'freund' | 'rangliste'; windowId: string | null; titel: string | null; playlist: string | null }
interface FScrim { beendet?: boolean; session: string; server: string; platz: number | null; punkte: number | null; spiele: number; kills: number | null; letztesSpiel: { code: string; ende: string | null; platz: number | null } | null; nurAngemeldet: boolean; link: string }
interface FSpieler { live: FLive | null; matches: FMatch[]; rang: number | null; punkte: number | null; windowId: string | null; scrim?: FScrim | null; freund?: boolean }
interface FCup { windowId: string; titel: string; region: string; live: boolean }
/** Eine Sitzung im Verlauf (lib/matchVerlauf): zuerst und zuletzt gesehen, Cup oder Playlist. */
interface FVerlauf { matchId: string; von: string; bis: string; playlist: string | null; zeile?: string; windowId?: string | null; titel?: string | null }
interface Antwort { ok: boolean; error?: string; cups: FCup[]; spieler: Record<string, FSpieler>; roh?: unknown[]; verlauf?: Record<string, FVerlauf[]> }
interface FFreund { id: string; name: string; live: FLive | null; verlauf: FVerlauf[] }

const SPEICHER = 'match-finder-favoriten';
const karte = 'rounded-xl border border-zinc-800 bg-zinc-900/40 p-5';

/*
 * Abruf-Takt des Finders (Betreiber-Stellschraube): waehrend ein Cup laeuft (oder ein Scrim) haeufig - die Rangliste aktualisiert sich sekuendlich, die
 * Match-ID soll kurz nach dem ersten Kill da sein -, sonst sparsam, nur um den Start des naechsten Cups zu bemerken.
 *
 * Live auf 5 s (Betreiber, 23.11.2026): ohne Neuladen hinkte die Match-ID hinterher - nach einem Reload war sie sofort da, im offenen Tab erst beim
 * naechsten Takt (bis zu 20 s spaeter). Der Freund-Status liegt im Serverprozess schon in Echtzeit vor (XMPP), er wartet nur auf den naechsten Abruf;
 * die Bestenliste/Rangliste ist serverseitig 15 s gecacht (lib/matchFinder FINDER_CACHE_MS). 5 s belasten Epic nicht (der Server-Cache deckelt die
 * Epic-Abfragen), holen die neue ID aber binnen weniger Sekunden - so schnell wie ein frisches Laden.
 */
const TAKT_LIVE_MS = 5_000;
const TAKT_RUHE_MS = 60_000;

/** Wie die Match-ID gefunden wurde - fuer das kleine Herkunfts-Etikett im Live-Kasten. */
const QUELLE_TEXT: Record<FLive['quelle'], string> = {
  freund: 'Freund', bestenliste: 'Live-Liste', sitzung: 'Sitzungssuche', rangliste: 'Rangliste',
};

/** Epics Playlist-Kennung lesbar: "Playlist_ShowdownAlt_Duos" -> "Tournament · Duos", "Playlist_PlaygroundV2" -> "Creative / custom lobby". */
function spielart(p: string | null): string | null {
  if (!p) return null;
  const k = p.replace(/^Playlist_/i, '');
  const groesse = /solo/i.test(k) ? 'Solo' : /duo/i.test(k) ? 'Duos' : /trio/i.test(k) ? 'Trios' : /squad/i.test(k) ? 'Squads' : '';
  const art = /habanero|ranked/i.test(k) ? 'Ranked'
    : /showdown|tournament|arena/i.test(k) ? 'Tournament'
    : /playground|creative|custom|private/i.test(k) ? 'Custom lobby / scrim'
      : /respawn|reload|blastberry|punchberry/i.test(k) ? 'Reload'
        : /nobuild|nobuildbr/i.test(k) ? 'Zero Build' : 'Match';
  return [art, groesse].filter(Boolean).join(' · ');
}

function uhrzeit(iso: string | null) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}

function datumZeit(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Wie lange die Sitzung gesehen wurde: "<1 min", "14 min", "1 h 05 min". */
function dauer(von: string, bis: string) {
  const min = Math.round(((Date.parse(bis) || 0) - (Date.parse(von) || 0)) / 60_000);
  if (min < 1) return '<1 min';
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

const verlaufStil = { fontFamily: 'Inter, var(--font-sans), system-ui, sans-serif' };

/*
 * Der Verlauf unter dem Live-Kasten (Betreiber, 17.11.2026): jede gesehene Sitzung bleibt stehen, auch nachdem der Spieler das Match verlassen hat -
 * Cup-Titel (sonst die Playlist), Datum und Uhrzeit, Match-ID zum Kopieren, wie lange gesehen. Neueste zuerst.
 */
function Verlauf({ eintraege, liveId, kopiert, kopieren }: { eintraege: FVerlauf[]; liveId: string | null; kopiert: string; kopieren: (t: string) => void }) {
  const t = useT();
  const [alle, setAlle] = useState(false);
  if (!eintraege.length) return null;
  const zeigen = alle ? eintraege : eintraege.slice(0, 5);
  return (
    <div data-verlauf className="mt-3 rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-slate-200 backdrop-blur" style={verlaufStil}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{t('Verlauf')}</p>
      <ul className="mt-1.5 divide-y divide-white/[0.06]">
        {zeigen.map((e) => (
          <li key={e.matchId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate font-medium text-slate-100" title={e.playlist ?? undefined}>
              {e.matchId === liveId && <span className="mr-1.5 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-red-500 align-middle" />}
              {e.titel || spielart(e.playlist) || e.zeile || t('Match')}
            </span>
            <span className="tabular-nums text-slate-400">{datumZeit(e.von)}</span>
            <span className="tabular-nums text-slate-500" title={t('Wie lange die Sitzung gesehen wurde')}>{dauer(e.von, e.bis)}</span>
            <code className="rounded bg-black/50 px-1.5 py-0.5 font-mono text-[11px] text-slate-300" title={e.matchId}>{e.matchId.slice(0, 8)}…</code>
            <button type="button" data-verlauf-kopieren={e.matchId} onClick={() => kopieren(e.matchId)}
              className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[11px] font-semibold text-slate-200 transition hover:border-sky-400 hover:text-sky-300">
              {kopiert === e.matchId ? t('Kopiert') : t('Kopieren')}
            </button>
          </li>
        ))}
      </ul>
      {eintraege.length > 5 && (
        <button type="button" onClick={() => setAlle(!alle)} className="mt-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200">
          {alle ? t('weniger') : `${t('alle anzeigen')} (${eintraege.length})`}
        </button>
      )}
    </div>
  );
}

/** Der Live-Kasten: LIVE, Cup oder Playlist, Match-ID, kopieren. */
function LiveKasten({ live, kopiert, kopieren }: { live: FLive; kopiert: string; kopieren: (t: string) => void }) {
  const t = useT();
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
      <span className="flex items-center gap-1.5 text-sm font-bold text-red-400"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />LIVE</span>
      <span className="text-xs text-slate-300">{live.titel ?? spielart(live.playlist) ?? t('Im Match')}</span>
      <code className="rounded bg-zinc-950 px-2 py-1 font-mono text-xs text-slate-200">{live.matchId}</code>
      <button type="button" onClick={() => kopieren(live.matchId)}
        className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-400">
        {kopiert === live.matchId ? t('Kopiert') : t('Match-ID kopieren')}
      </button>
      {/* Herkunft der Match-ID (Betreiber, 19.11.2026): "Freund" kommt schon vor dem ersten Kill, "Rangliste" greift ohne Freundschaft nach dem ersten Kill. */}
      <span className="ml-auto whitespace-nowrap text-[11px] text-slate-400"
        title={live.quelle === 'rangliste' ? t('Aus der Cup-Bestenliste - ohne Freundschaft, sobald der Spieler sein erstes gewertetes Ereignis hatte.')
          : live.quelle === 'freund' ? t('Aus dem Epic-Status eines Freundes der CompHub-Konten - schon in der Aufwärmphase.')
          : t('Aus Epics laufenden Sitzungen.')}>
        {t('gefunden über')}: <span className="font-semibold text-slate-300">{t(QUELLE_TEXT[live.quelle])}</span>
      </span>
    </div>
  );
}

/*
 * Freigaben fuer das Bot-Konto "comphub." (nur Admin, lib/matchIdFreigaben): wer hier steht und dem Bot SELBST eine Freundschaftsanfrage schickt, wird
 * angenommen - danach kommt seine Match-ID schon auf der Startinsel (Epic-Status eines Freundes). Der Bot schickt niemandem eine Anfrage.
 */
interface FFreigabe { id: string; name: string; seit: string; von: string }
function Freigaben() {
  const [liste, setListe] = useState<FFreigabe[] | null>(null);
  const [dienst, setDienst] = useState<string[] | null>(null);
  const [eingabe, setEingabe] = useState('');
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const nimm = (j: { ok?: boolean; error?: string; eintraege?: FFreigabe[]; dienst?: { ids: string[] } | null }) => {
    if (!j?.ok) { setFehler(j?.error ?? 'Fehler'); return; }
    setFehler(''); setListe(j.eintraege ?? []); setDienst(j.dienst?.ids ?? null);
  };
  useEffect(() => { fetch('/api/admin/matchid-freigaben', { cache: 'no-store' }).then((r) => r.json()).then(nimm).catch(() => setFehler('Nicht ladbar')); }, []);
  const dazu = async () => {
    const e = eingabe.trim();
    if (!e || laeuft) return;
    setLaeuft(true);
    try {
      const j = await fetch('/api/admin/matchid-freigaben', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eingabe: e }) }).then((r) => r.json());
      nimm(j); if (j?.ok) setEingabe('');
    } catch { setFehler('Nicht gespeichert'); } finally { setLaeuft(false); }
  };
  const weg = async (id: string) => {
    setLaeuft(true);
    try { nimm(await fetch(`/api/admin/matchid-freigaben?id=${id}`, { method: 'DELETE' }).then((r) => r.json())); } catch { setFehler('Nicht gespeichert'); } finally { setLaeuft(false); }
  };
  return (
    <section className={`${karte} mb-4`} data-teil="freigaben">
      <h2 className="text-base font-bold text-white"><T>Freigaben für das Bot-Konto "comphub."</T></h2>
      <p className="mt-1 text-xs text-slate-400">
        <T>Wer hier steht und dem Epic-Konto "comphub." selbst eine Freundschaftsanfrage schickt, wird automatisch angenommen (alle 2 Minuten). Danach kommt seine Match-ID schon auf der Startinsel. Der Bot schickt niemandem eine Anfrage.</T>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input value={eingabe} onChange={(e) => setEingabe(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void dazu(); }} maxLength={60}
          placeholder="Epic-Name oder Konto-Id" aria-label="Epic-Name oder Konto-Id"
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none" />
        <button type="button" onClick={() => void dazu()} disabled={laeuft || !eingabe.trim()}
          className="rounded-lg bg-sky-500 px-3.5 py-1.5 text-sm font-semibold text-white disabled:opacity-50"><T>Hinzufügen</T></button>
      </div>
      {fehler && <p className="mt-2 text-xs text-red-400">{fehler}</p>}
      {liste === null ? <p className="mt-3 text-xs text-slate-500"><T>Lädt …</T></p>
        : !liste.length ? <p className="mt-3 text-xs text-slate-500"><T>Noch niemand freigegeben.</T></p>
          : (
            <ul className="mt-3 divide-y divide-zinc-800 text-sm">
              {liste.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <span className="font-semibold text-white">{f.name || f.id.slice(0, 8)}</span>
                  <span className="font-mono text-[11px] text-slate-500">{f.id}</span>
                  {dienst && !dienst.includes(f.id) && <span className="text-[11px] text-amber-400"><T>noch nicht beim Dienst</T></span>}
                  <span className="ml-auto text-[11px] text-slate-500">{datumZeit(f.seit)}</span>
                  <button type="button" onClick={() => void weg(f.id)} disabled={laeuft} aria-label={`${f.name || f.id} entfernen`}
                    className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-slate-300 hover:border-red-500 hover:text-red-300 disabled:opacity-50"><T>Entfernen</T></button>
                </li>
              ))}
            </ul>
          )}
      {dienst === null && liste !== null && <p className="mt-2 text-[11px] text-amber-400"><T>XMPP-Dienst nicht erreichbar - die Liste geht beim nächsten Verbinden hinüber.</T></p>}
    </section>
  );
}

/*
 * Nur fuer den Admin (Betreiber, 17.11.2026): alle Epic-Freunde des Bot-Kontos "comphub.", ohne sie als Favoriten anzulegen - live zuerst, dann nach Namen.
 * Nicht die Freunde des persoenlichen Kontos des Betreibers (23.11.2026, bot-only). Ein Abruf je TAKT_LIVE_MS (5 s): der XMPP-Dienst hat den Stand in
 * Echtzeit, so stehen neue Match-IDs ohne Neuladen binnen Sekunden da (/api/match-finder?ansicht=freunde -> ein Abruf beim XMPP-Dienst, keine Epic-Last).
 */
function AlleFreunde({ kopiert, kopieren }: { kopiert: string; kopieren: (t: string) => void }) {
  const t = useT();
  const [freunde, setFreunde] = useState<FFreund[] | null>(null);
  const [fehler, setFehler] = useState('');
  const [filter, setFilter] = useState('');
  useEffect(() => {
    let weg = false;
    const laden = () => fetch('/api/match-finder?ansicht=freunde', { cache: 'no-store' }).then((r) => r.json())
      .then((j: { ok?: boolean; error?: string; freunde?: FFreund[] }) => {
        if (weg) return;
        if (j?.ok) { setFreunde(j.freunde ?? []); setFehler(''); } else setFehler(j?.error ? t(j.error) : t('Nicht ladbar'));
      })
      .catch(() => { if (!weg) setFehler(t('Nicht ladbar')); });
    laden();
    const id = window.setInterval(laden, TAKT_LIVE_MS);
    return () => { weg = true; window.clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const q = filter.trim().toLowerCase();
  const liste = (freunde ?? []).filter((f) => !q || f.name.toLowerCase().includes(q) || f.id.includes(q));
  const live = (freunde ?? []).filter((f) => f.live).length;
  return (
    <section data-alle-freunde className="space-y-3">
      <div className={`${karte} flex flex-wrap items-center gap-3`}>
        <p className="text-sm text-slate-300">
          {freunde ? <>{freunde.length} {t('Freunde')} · <span className="font-semibold text-red-400">{live} {t('live')}</span></> : t('Wird geladen …')}
        </p>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('Name filtern')}
          className="ml-auto w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500 sm:w-64" />
      </div>
      {fehler && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{fehler}</p>}
      {liste.map((f) => (
        <article key={f.id} data-freund={f.id} className={karte}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="truncate text-base font-bold text-slate-100">{f.name}</p>
            {f.live
              ? <span className="flex items-center gap-1.5 text-xs font-bold text-red-400"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />LIVE</span>
              : <span className="text-xs text-slate-500">{t('Nicht live')}</span>}
          </div>
          {f.live && <LiveKasten live={f.live} kopiert={kopiert} kopieren={kopieren} />}
          <Verlauf eintraege={f.verlauf} liveId={f.live?.matchId ?? null} kopiert={kopiert} kopieren={kopieren} />
        </article>
      ))}
    </section>
  );
}

export default function MatchFinder() {
  const t = useT();
  const zugang = useZugang();
  const [favoriten, setFavoriten] = useState<Favorit[]>([]);
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState('');
  const [suche, setSuche] = useState('');
  const [treffer, setTreffer] = useState<Treffer[] | null>(null);
  const [kopiert, setKopiert] = useState('');
  // Epic antwortete bei der Namenssuche nicht - etwas anderes als "niemand gefunden". `nochmal` zaehlt die Wiederholungen.
  const [epicFehler, setEpicFehler] = useState('');
  const [nochmal, setNochmal] = useState(0);
  const geladen = useRef(false);
  const darf = zugang.admin || (zugang.vip && zugang.rechte.includes('matchfinder'));
  // Der Admin hat einen zweiten Reiter: alle Epic-Freunde (/match-finder?ansicht=freunde, aus dem Dashboard verlinkt).
  // Erst nach dem Laden des Zugangs sichtbar (vorher LadeSchirm) - der Server zeichnet die Reiter nie, darum hier direkt aus der Adresse.
  const [ansicht, setAnsicht] = useState<'favoriten' | 'freunde'>(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ansicht') === 'freunde' ? 'freunde' : 'favoriten'));
  const wechsleAnsicht = (a: 'favoriten' | 'freunde') => {
    setAnsicht(a);
    const u = new URL(window.location.href);
    if (a === 'freunde') u.searchParams.set('ansicht', 'freunde'); else u.searchParams.delete('ansicht');
    window.history.replaceState(null, '', u.toString());
  };

  // Favoriten: sofort aus dem Browser, dann vom Konto (dort gilt der Stand, der zuletzt gespeichert wurde).
  useEffect(() => {
    if (!darf || geladen.current) return;
    geladen.current = true;
    const lokal = loadUserStorageValue<Favorit[]>(SPEICHER);
    if (Array.isArray(lokal)) setFavoriten(lokal);
    void loadUserStorageCloud<Favorit[]>(SPEICHER).then((wolke) => { if (Array.isArray(wolke)) { setFavoriten(wolke); saveUserStorageValue(SPEICHER, wolke); } });
  }, [darf]);
  const speichern = (liste: Favorit[]) => { setFavoriten(liste); saveUserStorageValue(SPEICHER, liste); void saveUserStorageCloud(SPEICHER, liste); };

  const ids = useMemo(() => favoriten.map((f) => f.id).join(','), [favoriten]);
  const namenParam = useMemo(() => favoriten.map((f) => encodeURIComponent(f.name.replace(/\|/g, ' '))).join('|'), [favoriten]);
  const laden = useCallback(() => {
    if (!ids) { setDaten(null); return; }
    fetch(`/api/match-finder?ids=${ids}&namen=${namenParam}`, { cache: 'no-store' }).then((r) => r.json())
      .then((j: Antwort) => { if (j?.ok) { setDaten(j); setFehler(''); } else setFehler(j?.error ? t(j.error) : t('Nicht ladbar')); })
      .catch(() => setFehler(t('Nicht ladbar')));
  }, [ids, namenParam]);
  // Waehrend eines Cups alle zwanzig Sekunden, sonst jede Minute.
  // Auch laufende Scrims zaehlen: dann ebenfalls alle zwanzig Sekunden.
  const liveCup = Boolean(daten?.cups.some((c) => c.live) || Object.values(daten?.spieler ?? {}).some((s) => s.scrim));
  useEffect(() => {
    if (!darf) return undefined;
    laden();
    const id = window.setInterval(laden, liveCup ? TAKT_LIVE_MS : TAKT_RUHE_MS);
    return () => window.clearInterval(id);
  }, [darf, laden, liveCup]);

  // Suche: Szene-Liste (Teilname) und dazu der genaue Epic-Name (auch fuer Spieler aus offenen Cups).
  useEffect(() => {
    const q = suche.trim();
    if (q.length < 2) { setTreffer(null); setEpicFehler(''); return undefined; }
    let weg = false;
    const uhr = window.setTimeout(async () => {
      const [szene, epic] = await Promise.all([
        fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => null) as Promise<{ spieler?: Array<{ epicId: string; name: string; anzeige?: string; aktuell?: string | null; bild?: string | null }> } | null>,
        q.length >= 3 ? fetch(`/api/match-finder?name=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => null) as Promise<{ ok?: boolean; error?: string; treffer?: Favorit | null } | null> : Promise.resolve(null),
      ]);
      if (weg) return;
      // Nur eine echte Antwort ohne Fehler zaehlt; Ausfall oder Zeitueberschreitung zeigt die Meldung mit "Nochmal versuchen".
      setEpicFehler(q.length >= 3 && (!epic || epic.ok === false) ? (epic?.error ? t(epic.error.replace(/\.$/, '')) : t('Epic antwortet gerade nicht')) : '');
      // Erst die bekannten Spieler (Pro-Name, Bild, aktueller In-Game-Name), dann - falls noch nicht dabei - das Konto zum genauen Epic-Namen.
      const liste: Treffer[] = [];
      for (const s of szene?.spieler ?? []) {
        if (!s.epicId || liste.some((x) => x.id === s.epicId)) continue;
        liste.push({ id: s.epicId, name: s.anzeige || s.name, ingame: s.aktuell ?? s.name, bild: s.bild ?? null });
      }
      if (epic?.treffer?.id && !liste.some((x) => x.id === epic.treffer!.id.toLowerCase())) {
        liste.unshift({ id: epic.treffer.id.toLowerCase(), name: epic.treffer.name, ingame: epic.treffer.name, bild: null });
      }
      setTreffer(liste.slice(0, 8));
    }, 350);
    return () => { weg = true; window.clearTimeout(uhr); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suche, nochmal]);

  const kopieren = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => { setKopiert(text); window.setTimeout(() => setKopiert(''), 2500); }).catch(() => undefined);
  };

  if (zugang.laedt) return <LadeSchirm />;
  if (!darf && zugang.vip) return <VipVorhang titel="Der Match-ID-Finder ist für dein Konto noch nicht freigeschaltet." text="CompHub schaltet es je VIP frei - schreib uns kurz auf Discord." />;
  if (!darf) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-center text-slate-100">
        <div className="max-w-md">
          <h1 className="text-xl font-bold"><T>Nur für VIPs</T></h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500"><T>Der Match-ID-Finder zeigt VIPs, in welchem Match ihre Lieblingsspieler gerade sind - zum Zuschauen im Spiel.</T></p>
          <Link href="/sign-in" className="mt-6 inline-block rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400"><T>Zur Anmeldung</T></Link>
        </div>
      </main>
    );
  }

  const liveCups = daten?.cups.filter((c) => c.live) ?? [];
  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1300px] px-4 py-6">
        <section className="relative mb-5 overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
          <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-sky-500/25 blur-3xl" />
          <div className="relative">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-500">VIP</p>
            <h1 className="mt-1 text-3xl font-extrabold text-white sm:text-4xl"><T>Match-ID-Finder</T></h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              <T>Speichere Spieler als Favoriten. Läuft ein Cup, siehst du hier, in welchem Match sie gerade sind - Match-ID kopieren und im Spiel zuschauen.</T>
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {liveCups.length
                ? <span className="flex items-center gap-1.5 font-semibold text-red-400"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />{liveCups.length} {liveCups.length === 1 ? <T>Cup läuft gerade</T> : <T>Cups laufen gerade</T>}</span>
                : <span className="text-slate-500"><T>Gerade läuft kein Cup - die Match-IDs erscheinen, sobald einer läuft.</T></span>}
            </p>
          </div>
        </section>

        {zugang.admin && (
          <div className="mb-4 flex gap-2" role="tablist">
            {(['favoriten', 'freunde'] as const).map((a) => (
              <button key={a} type="button" role="tab" aria-selected={ansicht === a} data-ansicht={a} onClick={() => wechsleAnsicht(a)}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${ansicht === a ? 'bg-sky-500 text-white' : 'border border-zinc-700 text-slate-300 hover:border-sky-500 hover:text-sky-300'}`}>
                {a === 'favoriten' ? t('Favoriten') : t('Alle Freunde (Admin)')}
              </button>
            ))}
          </div>
        )}

        {zugang.admin && ansicht === 'freunde' ? <><Freigaben /><AlleFreunde kopiert={kopiert} kopieren={kopieren} /></> : <>
        {fehler && <p className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-300">{fehler}</p>}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="space-y-3">
            {favoriten.length === 0 && (
              <p className={`${karte} text-center text-sm text-slate-500`}><T>Noch keine Favoriten. Such rechts einen Spieler und füge ihn hinzu.</T></p>
            )}
            {favoriten.map((f) => {
              const s = daten?.spieler[f.id];
              return (
                <article key={f.id} className={karte}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold text-slate-100">{f.name}</p>
                      {s?.rang ? <p className="text-xs text-slate-500">#{s.rang} · {s.punkte ?? 0} <T>Punkte</T></p> : null}
                    </div>
                    <button type="button" onClick={() => speichern(favoriten.filter((x) => x.id !== f.id))}
                      className="text-xs text-slate-500 transition hover:text-rose-400"><T>Entfernen</T></button>
                  </div>
                  {s?.live ? (
                    <LiveKasten live={s.live} kopiert={kopiert} kopieren={kopieren} />
                  ) : !s?.scrim ? (
                    /*
                     * Epic zeigt ein laufendes Match nur Freunden (Clix, 7.11.2026: spielte im Trios Cash Cup, die Liste laufender Matches ist leer, die Sitzungssuche
                     * liefert fuer fremde Konten nichts). Wer nicht mit dem CompHub-Konto befreundet ist, bekommt deshalb nicht "in keinem Match", sondern den Grund.
                     */
                    <p className="mt-3 text-xs text-slate-500">{!daten ? <T>Wird geladen …</T>
                      : s?.freund === false ? <T>Vor dem ersten Kill zeigt Epic die laufende Sitzung nur Freunden - dieser Spieler ist nicht mit dem CompHub-Epic-Konto befreundet. Sobald er sein erstes gewertetes Ereignis hat (erster Kill/erste Platzierung), erscheint die Match-ID hier aus der Cup-Bestenliste, auch ohne Freundschaft.</T>
                      : <T>Gerade in keinem Match.</T>}</p>
                  ) : null}
                  {/* Laufende Scrims (Noble/Yunite): Session, Platz, Punkte, Spiele und die volle Kennung des letzten Spiels. */}
                  {s?.scrim && (
                    <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-3 ${s.scrim.beendet ? 'border-zinc-700 bg-zinc-900/60' : 'border-amber-500/30 bg-amber-500/10'}`}>
                      {s.scrim.beendet
                        ? <span className="text-sm font-bold text-slate-400">{t('Scrim beendet')}</span>
                        : <span className="flex items-center gap-1.5 text-sm font-bold text-amber-300"><span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />{s.scrim.nurAngemeldet ? t('Angemeldet') : 'SCRIM LIVE'}</span>}
                      <span className="text-xs text-slate-200">{s.scrim.session} <span className="text-slate-500">· {s.scrim.server}</span></span>
                      {!s.scrim.nurAngemeldet && (
                        <span className="text-xs tabular-nums text-slate-300">#{s.scrim.platz} · {s.scrim.punkte} {t('Punkte')} · {s.scrim.spiele} {t('Spiele')}{s.scrim.kills != null ? ` · ${s.scrim.kills} elims` : ''}</span>
                      )}
                      {s.scrim.letztesSpiel && (
                        <span className="text-xs text-slate-400">{t('Letztes Spiel')} · <span title={t('Yunites Kurz-Code des Games - nicht die volle Match-ID. Die gibt Yunite nicht heraus.')}>{t('Yunite-Code')}</span> <code className="rounded bg-zinc-950 px-1.5 py-0.5 font-mono text-slate-200">{s.scrim.letztesSpiel.code}</code>{' '}<button type="button" onClick={() => kopieren(s.scrim!.letztesSpiel!.code)}
                            className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] font-semibold text-slate-300 transition hover:border-sky-500 hover:text-sky-400">{kopiert === s.scrim.letztesSpiel.code ? t('Kopiert') : t('Kopieren')}</button> {uhrzeit(s.scrim.letztesSpiel.ende)}{s.scrim.letztesSpiel.platz ? ` · #${s.scrim.letztesSpiel.platz}` : ''}</span>
                      )}
                      <a href={s.scrim.link} target="_blank" rel="noreferrer" className="ml-auto text-xs font-semibold text-amber-300 hover:text-amber-200">{t('Leaderboard bei Noble')} →</a>
                    </div>
                  )}
                  <Verlauf eintraege={daten?.verlauf?.[f.id] ?? []} liveId={s?.live?.matchId ?? null} kopiert={kopiert} kopieren={kopieren} />
                  {s && s.matches.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-xs">
                        <tbody>
                          {s.matches.map((m) => (
                            <tr key={m.matchId} className="border-t border-zinc-800/80">
                              <td className="py-1.5 pr-3 tabular-nums text-slate-500">{uhrzeit(m.ende)}</td>
                              <td className="py-1.5 pr-3 text-slate-400">{m.titel}</td>
                              <td className="py-1.5 pr-3 tabular-nums text-slate-300">{m.platz ? `#${m.platz}` : ''}</td>
                              <td className="py-1.5 pr-3 tabular-nums text-slate-300">{m.elims != null ? `${m.elims} elims` : ''}</td>
                              <td className="py-1.5 text-right">
                                <button type="button" onClick={() => kopieren(m.matchId)} title={m.matchId}
                                  className="rounded-md border border-zinc-700 px-2 py-1 font-mono text-[11px] text-slate-400 transition hover:border-sky-500 hover:text-sky-400">
                                  {kopiert === m.matchId ? t('Kopiert') : `${m.matchId.slice(0, 8)}…`}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              );
            })}
            {zugang.admin && daten?.roh && daten.roh.length > 0 && (
              <details className={karte}>
                <summary className="cursor-pointer text-xs text-slate-500">Admin: Epic liveSessions (roh)</summary>
                <pre className="mt-2 max-h-64 overflow-auto text-[10px] text-slate-500">{JSON.stringify(daten.roh, null, 1)}</pre>
              </details>
            )}
          </section>

          <aside className={`${karte} h-fit`}>
            <h2 className="text-sm font-semibold"><T>Spieler hinzufügen</T></h2>
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Name des Spielers')}
              className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
            {epicFehler && (
              <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2.5">
                <p className="text-xs text-rose-300">{epicFehler}</p>
                <button type="button" onClick={() => setNochmal((n) => n + 1)}
                  className="mt-2 rounded-md bg-sky-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-sky-400"><T>Nochmal versuchen</T></button>
              </div>
            )}
            {treffer && treffer.length === 0 && !epicFehler && <p className="mt-3 text-xs text-slate-500"><T>Niemand gefunden. Bei Spielern aus offenen Cups den genauen Epic-Namen eingeben.</T></p>}
            {treffer && treffer.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {treffer.map((x) => {
                  const da = favoriten.some((f) => f.id === x.id);
                  return (
                    <li key={x.id} className="flex items-center justify-between gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-2">
                      {x.bild
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={x.bild} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover object-top" />
                        : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-zinc-800 text-sm font-bold text-slate-400">{x.name.slice(0, 1).toUpperCase()}</span>}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-100">{x.name}</span>
                        {x.ingame && x.ingame !== x.name && <span className="block truncate text-[11px] text-slate-500">{x.ingame}</span>}
                      </span>
                      <button type="button" disabled={da || favoriten.length >= 12}
                        onClick={() => { speichern([...favoriten, { id: x.id, name: x.name }]); setSuche(''); setTreffer(null); }}
                        className="shrink-0 rounded-md bg-sky-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-sky-400 disabled:opacity-40">
                        {da ? t('Favorit') : t('Hinzufügen')}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
              <T>Höchstens 12 Favoriten. Die Match-ID eines laufenden Spiels kommt aus Epics Bestenliste und Sitzungsdaten; gespielte Matches stehen darunter mit ihrer ID.</T>
            </p>
          </aside>
        </div>
        </>}
      </div>
    </main>
  );
}
