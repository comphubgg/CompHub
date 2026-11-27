import { useCallback, useEffect, useState } from 'react';
import Link from '../port/next/link';
import T from '../port/app/components/T';
import { useT } from '../port/app/components/SprachProvider';

/*
 * Die Admin-Zentrale.
 *
 * Der Betreiber (1.10.2026): "alles optimieren fuer den Admin: simpler,
 * optisch besser sichtbar". Drei Dinge in dieser Reihenfolge, weil man sie so
 * braucht: Laeuft alles? Was wartet auf mich? Und dann die Werkzeuge - nach
 * Themen gruppiert statt auf Seiten verteilt.
 *
 * Gezeigt wird nur, was gemessen ist: die Laeufe kommen von GitHub Actions
 * (/api/admin/zentrale), die Replay-Zahlen aus der Uebersicht der Replays.
 * Laesst sich etwas nicht abrufen, steht das da - kein erfundener "alles gut".
 */


interface Lauf { status: string; conclusion: string | null; zeit: string; url: string }
interface Job {
  schluessel: string; name: string; was: string; aktiv: Lauf | null; letzter: Lauf | null;
  ampel: 'ok' | 'warnung' | 'fehler' | 'unbekannt'; hinweis: string;
}
interface Auftrag { id: number; titel: string; hinweis: string; seit: string }
interface LadeZeile { titel: string; jetzt: number; median: number; verlauf: number[] }
interface Antwort { jobs: Job[]; kontaktOffen: number | null; auftraege: Auftrag[] | null; ladezeiten: LadeZeile[] | null; stand: number }

/** Der Verlauf einer Seite als kleine Linie; der letzte Wert ist als Punkt hervorgehoben. */
function Linie({ werte, farbe }: { werte: number[]; farbe: string }) {
  if (werte.length < 2) return <svg viewBox="0 0 100 24" className="h-6 w-full" />;
  const max = Math.max(...werte, 1);
  const pkt = werte.map((w, i) => [(i / (werte.length - 1)) * 100, 22 - (w / max) * 20] as const);
  const [lx, ly] = pkt[pkt.length - 1];
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-full overflow-visible">
      <polyline points={pkt.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
        fill="none" stroke={farbe} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="1.8" fill={farbe} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
interface ReplayStand { gesamt: number; ausgewertet: number; offenInFrist: number; imFristGesamt: number }

const AMPEL: Record<Job['ampel'], { punkt: string; rand: string; text: string }> = {
  ok: { punkt: 'bg-emerald-400', rand: 'border-white/10', text: 'text-emerald-400' },
  warnung: { punkt: 'bg-amber-400', rand: 'border-amber-500/40', text: 'text-amber-400' },
  fehler: { punkt: 'bg-rose-500', rand: 'border-rose-500/50', text: 'text-rose-400' },
  unbekannt: { punkt: 'bg-white/30', rand: 'border-white/10', text: 'text-white/55' },
};

/** "vor 5 Min", "vor 3 Std", "vor 2 Tagen" - so, wie man es im Kopf rechnet. */
function vor(zeit: string | number, t: (s: string) => string): string {
  const min = Math.max(0, Math.round((Date.now() - (typeof zeit === 'number' ? zeit : Date.parse(zeit))) / 60_000));
  if (min < 1) return t('gerade eben');
  if (min < 60) return t('vor {n} Min').replace('{n}', String(min));
  if (min < 48 * 60) return t('vor {n} Std').replace('{n}', String(Math.round(min / 60)));
  return t('vor {n} Tagen').replace('{n}', String(Math.round(min / 1440)));
}

// Namen und Hinweise der Laeufe kommen deutsch von /api/admin/zentrale - die englischen Fassungen (aus sprache.ts auf main, Rest von Hand).
const LAEUFE: Record<string, string> = {
  Datenlauf: 'Data run', Replays: 'Replays', 'Solo Clutch': 'Solo Clutch', 'Org-Kader': 'Org rosters', 'Team-Verlauf': 'Team history', 'Seitenprüfung': 'Site check',
  Sicherung: 'Backup', 'Live-Replays': 'Live replays', 'Replays (voll)': 'Replays (full)', Spielerwerte: 'Player stats', Sofortspur: 'Fast lane',
  'Statistiken, Profile, Startseite': 'Statistics, profiles, start page', 'Rückstand abarbeiten': 'Work off the backlog', 'Punkte je Spieltag': 'Points per match day',
  'Abgleich mit Liquipedia': 'Sync with Liquipedia', 'Antworten alle Seiten?': 'Do all pages respond?', 'Tägliche Kopie der gepflegten Dateien': 'Daily copy of the maintained files',
  'Laufende Cups einsammeln': 'Collect running cups', 'Zonen, Kill-Feed, Spieler je Match': 'Zones, kill feed, players per match', 'Replay-Werte für die Event-Seiten': 'Replay stats for the event pages',
  'Volle Cup-Werte Minuten nach jedem Match': 'Full cup stats minutes after each match', 'noch kein Lauf': 'no run yet', 'der letzte Lauf ist gescheitert': 'the last run failed',
  'länger nichts gelaufen als üblich': 'nothing ran for longer than usual', unbekannt: 'unknown',
};

export default function AdminZentrale({ zeigeLaeufe = true, teil = 'status' }: { zeigeLaeufe?: boolean; teil?: 'alles' | 'werkzeuge' | 'status' }) {
  const t0 = useT();
  const t = (x: string) => LAEUFE[x] ?? t0(x);
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState(false);
  const [replays, setReplays] = useState<ReplayStand | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [kontaktOffen, setKontaktOffen] = useState<number | null>(null);

  // Wann zuletzt geholt wurde - damit der Knopf "Aktualisieren" sichtbar etwas tut.
  const [stand, setStand] = useState<string>('');
  /** Zustand von "Alles aktualisieren": nichts, laeuft, oder das Ergebnis. */
  const [alles, setAlles] = useState<null | 'laeuft' | { ok: boolean; text: string }>(null);
  const laden = useCallback((frisch: boolean = false) => {
    if (!zeigeLaeufe) return;
    // Die Werkzeuge brauchen nur die Zahl der offenen Meldungen - die kurze Antwort statt der ganzen Zentrale (GitHub, Discord, Ladezeiten).
    if (teil === 'werkzeuge') {
      fetch('/api/kontakt?zaehlen=1', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j: { offen?: number }) => setKontaktOffen(typeof j.offen === 'number' ? j.offen : null))
        .catch(() => setKontaktOffen(null));
      return;
    }
    setLaedt(true);
    fetch(`/api/admin/zentrale${frisch ? '?frisch=1' : ''}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { setDaten(j); setFehler(false); setStand(new Date().toLocaleTimeString()); })
      .catch(() => setFehler(true))
      .finally(() => setLaedt(false));
    fetch('/api/replays', { cache: 'no-store' }).then((r) => r.json())
      .then((j) => {
        const grenze = Date.now() - 31 * 864e5;
        let gesamt = 0; let ausgewertet = 0; let offenInFrist = 0; let imFristGesamt = 0;
        for (const f of (j?.fenster ?? []) as Array<{ datum?: number; zaehler?: Record<string, number> }>) {
          const z = f.zaehler ?? {};
          // Ein Spieltag, von dem kein einziges Replay da ist (die Arena-Modi haben keine Server-Replays),
          // wartet nicht auf uns - er kommt nie.
          const nieDa = !(z.PARSED > 0) && Object.keys(z).every((k) => k === 'NOT_AVAILABLE');
          for (const [stand, n] of Object.entries(z)) {
            gesamt += n;
            if (stand === 'PARSED') ausgewertet += n;
            if ((f.datum ?? 0) > grenze) imFristGesamt += n;
            // Offen zaehlt nur, was noch zu holen ist: Epic haelt ein Replay 31 Tage vor.
            if (stand !== 'PARSED' && stand !== 'ABGELAUFEN' && (f.datum ?? 0) > grenze && !nieDa) offenInFrist += n;
          }
        }
        setReplays({ gesamt, ausgewertet, offenInFrist, imFristGesamt });
      })
      .catch(() => setReplays(null));
  }, [zeigeLaeufe, teil]);
  useEffect(() => { laden(); }, [laden]);

  /*
   * "Alles aktualisieren": stoesst die Ablaeufe an, die alles neu holen (Datenlauf mit Power
   * Rankings, Org-Kader, Team-Verlauf). Der Betreiber (2.10.2026): "ein Knopf fuer alles."
   */
  const allesAktualisieren = async () => {
    if (!window.confirm(t('Alles neu holen? Das startet den Datenlauf (Statistiken, Power Rankings, Startseite), den Org-Kader und den Team-Verlauf. Es dauert gut eine Stunde.'))) return;
    setAlles('laeuft');
    try {
      const r = await fetch('/api/admin/alles-aktualisieren', { method: 'POST' });
      const j = await r.json() as { ok?: boolean; fehler?: string; laeufe?: Array<{ name: string; ok: boolean }> };
      if (j.laeufe) {
        const gut = j.laeufe.filter((l) => l.ok).length;
        setAlles({ ok: !!j.ok, text: `${gut} ${t('von')} ${j.laeufe.length} ${t('Läufen gestartet')}${j.ok ? '' : ` — ${j.laeufe.filter((l) => !l.ok).map((l) => l.name).join(', ')} ${t('ging nicht')}`}` });
      } else {
        setAlles({ ok: false, text: j.fehler ?? t('Das hat nicht geklappt.') });
      }
    } catch {
      setAlles({ ok: false, text: t('Das hat nicht geklappt.') });
    }
    window.setTimeout(() => laden(true), 4000);
  };
  // Alle fuenf Minuten von selbst - die Zentrale soll offen stehen koennen.
  useEffect(() => {
    if (!zeigeLaeufe) return undefined;
    const takt = window.setInterval(laden, 5 * 60_000);
    return () => window.clearInterval(takt);
  }, [zeigeLaeufe, laden]);

  const probleme = (daten?.jobs ?? []).filter((j) => j.ampel === 'fehler' || j.ampel === 'warnung').length;
  const offenPost = daten?.kontaktOffen ?? kontaktOffen ?? 0;
  const replayOffen = replays?.offenInFrist ?? 0;
  const allesRuhig = daten && probleme === 0 && offenPost === 0 && replayOffen <= Math.max(50, (replays?.imFristGesamt ?? 0) * 0.005);


  const Kennzahl = ({ wert, titel, href, ernst }: { wert: string; titel: string; href: string; ernst: boolean }) => (
    <Link href={href}
      className={`rounded-2xl border px-4 py-4 transition hover:-translate-y-0.5 hover:bg-white/[0.06] ${
        ernst ? 'border-amber-500/40 bg-amber-500/[0.06]' : 'border-white/10 bg-white/[0.03]'}`}>
      <span className={`schrift-anzeige block text-4xl font-extrabold tabular-nums ${ernst ? 'text-amber-300' : 'text-emerald-400'}`}>{wert}</span>
      <span className="mt-0.5 block text-xs text-white/55"><T>{titel}</T></span>
    </Link>
  );

  return (
    <section className={teil === 'status' ? '' : 'rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-6'}>
      <div className="flex flex-wrap items-baseline gap-2">
        {teil !== 'status' && <h2 className="text-xl font-extrabold text-white">{teil === 'werkzeuge' ? <T>Admin-Werkzeuge</T> : <T>Admin-Zentrale</T>}</h2>}
        {teil !== 'status' && <span className="text-xs text-white/40"><T>sichtbar nur für dich</T></span>}
        {zeigeLaeufe && teil !== 'werkzeuge' && (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {stand && <span className="text-[11px] text-white/30"><T>Stand</T> {stand}</span>}
            <button type="button" onClick={() => laden(true)} disabled={laedt}
              className="rounded-full border border-white/15 px-3.5 py-1.5 text-[11px] font-semibold text-white/70 transition
                         hover:border-sky-500 hover:text-sky-400 disabled:opacity-50">
              {laedt ? <T>Wird geladen …</T> : <T>Aktualisieren</T>}
            </button>
            <button type="button" onClick={() => void allesAktualisieren()} disabled={alles === 'laeuft'}
              className="rounded-full border border-sky-500/50 bg-sky-500/10 px-3.5 py-1.5 text-[11px] font-bold text-sky-300
                         transition hover:bg-sky-500/20 disabled:opacity-50">
              {alles === 'laeuft' ? <T>Wird gestartet …</T> : <T>Alles aktualisieren</T>}
            </button>
          </span>
        )}
      </div>
      {alles && alles !== 'laeuft' && (
        <p className={`mt-2 text-xs ${alles.ok ? 'text-emerald-400' : 'text-rose-300'}`}>{alles.text}</p>
      )}

      {zeigeLaeufe && teil !== 'werkzeuge' && (
        <>
          {/* 1. Laeuft alles? */}
          <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40"><T>Läuft alles?</T></h3>
          {fehler && (
            <p className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
              <T>Der Zustand der Läufe ließ sich gerade nicht abrufen.</T>
            </p>
          )}
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(daten?.jobs ?? Array.from({ length: 8 }, () => null)).map((j, i) => {
              if (!j) return <div key={i} className="h-[74px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />;
              const a = AMPEL[j.ampel];
              const l = j.aktiv ?? j.letzter;
              return (
                <a key={j.schluessel} href={l?.url ?? undefined} target="_blank" rel="noreferrer"
                  title={t(j.was)}
                  className={`rounded-2xl border bg-white/[0.03] px-4 py-3.5 transition hover:-translate-y-0.5 hover:bg-white/[0.06] ${a.rand}`}>
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${a.punkt} ${j.aktiv ? 'animate-pulse' : ''}`} />
                    <span className="text-sm font-semibold text-white">{t(j.name)}</span>
                  </span>
                  <span className={`mt-1.5 block text-[11px] ${j.aktiv ? 'text-sky-400' : a.text}`}>
                    {j.aktiv
                      ? `${(j.aktiv.status === 'queued' || j.aktiv.status === 'pending' ? 'waiting' : 'running')} · ${vor(j.aktiv.zeit, t)}`
                      : j.letzter
                        ? `${t(j.letzter.conclusion === 'success' ? 'OK' : 'Fehlgeschlagen')} · ${vor(j.letzter.zeit, t)}`
                        : t(j.hinweis || 'unbekannt')}
                  </span>
                  {j.hinweis && j.ampel !== 'ok' && j.letzter && (
                    <span className="mt-0.5 block text-[10px] leading-snug text-white/40">{t(j.hinweis)}</span>
                  )}
                </a>
              );
            })}
          </div>

          {/* 2. Was wartet auf mich? */}
          <h3 className="mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40"><T>Was wartet auf dich?</T></h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Kennzahl wert={daten ? String(offenPost) : '…'} titel="Meldungen im Posteingang" href="/admin/contact" ernst={offenPost > 0} />
            <Kennzahl wert={replays ? String(replayOffen) : '…'} titel="Replays in der Frist noch offen" href="/admin/replays" ernst={replayOffen > Math.max(50, (replays?.imFristGesamt ?? 0) * 0.005)} />
            <Kennzahl wert={daten ? String(probleme) : '…'} titel="Läufe mit Problem" href="#" ernst={probleme > 0} />
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
              <span className="schrift-anzeige block text-4xl font-extrabold tabular-nums text-sky-400">
                {replays && replays.gesamt ? `${(replays.ausgewertet / replays.gesamt * 100).toFixed(1)}%` : '…'}
              </span>
              <span className="mt-0.5 block text-xs text-white/55"><T>aller Replays ausgewertet</T></span>
            </div>
          </div>
          {allesRuhig && (
            <p className="mt-2 text-xs text-emerald-400"><T>Alles ruhig — nichts wartet auf dich.</T></p>
          )}

          {/* 3. Die offenen Auftraege - dieselbe Liste wie in #admin-aufgaben. */}
          {daten?.auftraege && daten.auftraege.length > 0 && (
            <>
              <h3 className="mt-6 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                <T>Offene Aufträge</T>
                <span className="font-normal normal-case tracking-normal text-white/30">{daten.auftraege.length}</span>
              </h3>
              <div className="mt-2 max-h-72 divide-y divide-white/5 overflow-y-auto rounded-lg border border-white/10 bg-white/[0.03]">
                {daten.auftraege.map((a) => (
                  <div key={a.id} className="px-3.5 py-2.5">
                    <p className="text-sm font-medium text-white/85">
                      <span className="mr-2 text-[11px] tabular-nums text-white/30">{a.id}</span>{a.titel}
                    </p>
                    {a.hinweis && <p className="mt-0.5 text-xs leading-snug text-white/40">{a.hinweis}</p>}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* 4. Wie schnell antworten die Seiten? Verlauf der letzten 24 Stunden aus der Seitenprüfung. */}
          <h3 className="mt-6 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
            <T>Ladezeiten der Seiten</T>
            <span className="font-normal normal-case tracking-normal text-white/30"><T>letzte 24 Stunden</T></span>
          </h3>
          {daten && !daten.ladezeiten?.length && (
            <p className="mt-2 text-xs text-white/40"><T>Der Verlauf beginnt mit der nächsten Seitenprüfung.</T></p>
          )}
          {!!daten?.ladezeiten?.length && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {daten.ladezeiten.map((z) => {
                const langsam = z.jetzt > Math.max(3000, 2.5 * z.median);
                const farbe = langsam ? '#fbbf24' : '#38bdf8';
                return (
                  <div key={z.titel} className={`rounded-2xl border bg-white/[0.03] px-4 py-3 ${langsam ? 'border-amber-500/40' : 'border-white/10'}`}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-white/85">{z.titel}</span>
                      <span className={`shrink-0 text-sm font-semibold tabular-nums ${langsam ? 'text-amber-300' : 'text-white'}`}>
                        {z.jetzt >= 1000 ? `${(z.jetzt / 1000).toFixed(1)} s` : `${z.jetzt} ms`}
                      </span>
                    </span>
                    <Linie werte={z.verlauf} farbe={farbe} />
                    <span className="block text-[10px] text-white/30">
                      <T>sonst etwa</T> {z.median >= 1000 ? `${(z.median / 1000).toFixed(1)} s` : `${z.median} ms`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

    </section>
  );
}
