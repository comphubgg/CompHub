'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import SeitenKopf from '@/app/components/SeitenKopf';
import TeamFlagge from '@/components/TeamFlagge';
import { useZugang } from '@/app/lib/zugang';
import { REGIONEN_REIHE } from '@/lib/regionFarbe';
import { landAusEingabe, landNach } from '@/lib/laender';
import { xNormal, twitchNormal } from '@/lib/profilEingabe';

/*
 * Flaggen & X-Konten (Betreiber, 16.11.2026: "jeder wichtige Spieler muss eine Flagge und ein X-Handle haben ... wie eine Tabelle").
 *
 * Die Liste: jeder wichtige Spieler (Regel in lib/flaggenWichtig.mjs), dem unter seiner Konto-Id die Flagge oder das X-Konto fehlt, nach Wichtigkeit.
 * Bedienung wie in einer Tabelle: Tab geht zur naechsten Zelle, Enter eine Zeile tiefer (Umschalt+Enter hoch), Esc nimmt die Eingabe zurueck. Verlaesst der
 * Fokus eine Zeile, wird sie gespeichert - nur die Felder, die sich geaendert haben; alles andere im Profil bleibt (lib/spielerProfil.ts).
 * Eine fertige Zeile bleibt bis zum Neuladen stehen (gefiltert wird nach dem Stand beim Laden), damit beim Tippen nichts unter dem Cursor wegspringt.
 *
 * Nur fuer den Admin: /api/admin/flaggen prueft das bei jeder Anfrage, und von oeffentlichen Seiten fuehrt kein Link hierher.
 */

interface Zeile {
  rang: number; id: string; name: string; namen: string[]; region: string;
  punkte: number; final: number; semi: number; heat: number; runde: number; cup: number; besteFinal: number | null; letzte: number | null; pr: number | null;
  land: string; x: string; twitch: string; auto: { land: string; quelle: string } | null; alterEintrag: string | null;
  fehlt: { land: boolean; x: boolean }; speicherName: string;
}
interface Antwort { ok: boolean; error?: string; stand: number; wichtig: number; zeilen: Zeile[]; ausgeschlossen: { geloescht: number; turnierkonto: number; vollstaendig: number; ohneName: number } }
type Feld = 'land' | 'x' | 'twitch';
type Werte = Record<Feld, string>;
type Zustand = { art: 'speichert' | 'ok' | 'fehler'; text?: string };

const FELDER: Feld[] = ['land', 'x', 'twitch'];
const JE_SEITE = 100;
type Filter = 'offen' | 'land' | 'x' | 'beide';

/** Was aus einer Eingabe gespeichert wuerde - oder ein Fehlertext. */
function pruefe(feld: Feld, roh: string): { wert: string; fehler: string } {
  const s = roh.trim();
  if (!s) return { wert: '', fehler: '' };
  if (feld === 'land') {
    const l = landAusEingabe(s);
    return l ? { wert: l.code, fehler: '' } : { wert: '', fehler: 'Unbekanntes Land' };
  }
  try { return { wert: feld === 'x' ? xNormal(s) : twitchNormal(s), fehler: '' }; } catch (e) { return { wert: '', fehler: (e as Error).message }; }
}

const jahr = (ms: number | null) => (ms ? new Date(ms).getFullYear() : '–');

export default function FlaggenPflege() {
  const zugang = useZugang();
  const [d, setD] = useState<Antwort | null>(null);
  const [ladeFehler, setLadeFehler] = useState('');
  const [entwurf, setEntwurf] = useState<Record<string, Werte>>({});
  const [gespeichert, setGespeichert] = useState<Record<string, Werte>>({});
  const [zustand, setZustand] = useState<Record<string, Zustand>>({});
  /** Zeilen, die in dieser Sitzung unter ihrer Konto-Id gespeichert wurden (ein Alteintrag unter dem Namen ist danach umgezogen). */
  const [unterId, setUnterId] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState<Filter>('offen');
  const [region, setRegion] = useState('');
  const [suche, setSuche] = useState('');
  const [seite, setSeite] = useState(0);
  const [twitchZeigen, setTwitchZeigen] = useState(true);
  const fokusNach = useRef<{ zeile: number; feld: Feld } | null>(null);
  const entwurfRef = useRef(entwurf);
  entwurfRef.current = entwurf;
  const gespeichertRef = useRef(gespeichert);
  gespeichertRef.current = gespeichert;

  useEffect(() => {
    let weg = false;
    fetch('/api/admin/flaggen', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => null) as Antwort | null;
        if (weg) return;
        if (!r.ok || !j?.ok) { setLadeFehler(j?.error ?? `HTTP ${r.status}`); return; }
        const werte: Record<string, Werte> = {};
        for (const z of j.zeilen) werte[z.id] = { land: z.land, x: z.x, twitch: z.twitch };
        setGespeichert(werte);
        setEntwurf(werte);
        setD(j);
      })
      .catch(() => { if (!weg) setLadeFehler('Liste nicht erreichbar'); });
    return () => { weg = true; };
  }, []);

  const liste = useMemo(() => {
    if (!d) return [];
    const q = suche.trim().toLowerCase();
    return d.zeilen.filter((z) => {
      if (filter === 'land' && !z.fehlt.land) return false;
      if (filter === 'x' && !z.fehlt.x) return false;
      if (filter === 'beide' && !(z.fehlt.land && z.fehlt.x)) return false;
      if (region && z.region !== region) return false;
      if (q && ![z.name, ...z.namen, z.id].some((n) => n.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [d, filter, region, suche]);
  const seiten = Math.max(1, Math.ceil(liste.length / JE_SEITE));
  const aufSeite = liste.slice(seite * JE_SEITE, (seite + 1) * JE_SEITE);
  useEffect(() => { setSeite(0); }, [filter, region, suche]);

  // Was jetzt (nach dem Gespeicherten) noch fehlt.
  const offen = useMemo(() => {
    const z = { land: 0, x: 0, beide: 0, start: { land: 0, x: 0, beide: 0 } };
    for (const r of d?.zeilen ?? []) {
      const g = gespeichert[r.id];
      const nurAlt = !!r.alterEintrag && !unterId.has(r.id);
      const fl = !g?.land || (r.fehlt.land && nurAlt);
      const fx = !g?.x || (r.fehlt.x && nurAlt);
      if (fl) z.land += 1; if (fx) z.x += 1; if (fl && fx) z.beide += 1;
      if (r.fehlt.land) z.start.land += 1; if (r.fehlt.x) z.start.x += 1; if (r.fehlt.land && r.fehlt.x) z.start.beide += 1;
    }
    return z;
  }, [d, gespeichert, unterId]);

  const speichern = useCallback(async (z: Zeile, erzwingen = false) => {
    const e = entwurfRef.current[z.id];
    const g = gespeichertRef.current[z.id];
    if (!e || !g) return;
    const geprueft = Object.fromEntries(FELDER.map((f) => [f, pruefe(f, e[f])])) as Record<Feld, { wert: string; fehler: string }>;
    const fehler = FELDER.map((f) => geprueft[f].fehler).filter(Boolean);
    if (fehler.length) { setZustand((s) => ({ ...s, [z.id]: { art: 'fehler', text: fehler.join(' · ') } })); return; }
    // Nur, was sich geaendert hat - die anderen Felder schickt die Zeile gar nicht, damit sie im Profil bleiben, wie sie sind.
    const aenderung: Partial<Werte> = {};
    for (const f of FELDER) if (geprueft[f].wert !== g[f] || (erzwingen && geprueft[f].wert)) aenderung[f] = geprueft[f].wert;
    if (!Object.keys(aenderung).length) {
      setEntwurf((s) => ({ ...s, [z.id]: { ...g } }));
      // Zurueckgenommen (Esc) oder nichts geaendert: ein alter Fehler dieser Zeile gilt nicht mehr.
      setZustand((s) => (s[z.id]?.art === 'fehler' ? Object.fromEntries(Object.entries(s).filter(([k]) => k !== z.id)) : s));
      return;
    }
    setZustand((s) => ({ ...s, [z.id]: { art: 'speichert' } }));
    try {
      const r = await fetch('/api/admin/flaggen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: z.id, name: z.speicherName, ...aenderung }),
      });
      const j = await r.json().catch(() => null) as { ok?: boolean; error?: string; profil?: Partial<Werte> | null } | null;
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      const neu: Werte = { land: j.profil?.land ?? '', x: j.profil?.x ?? '', twitch: j.profil?.twitch ?? '' };
      setGespeichert((s) => ({ ...s, [z.id]: neu }));
      setUnterId((s) => new Set(s).add(z.id));
      // Steht im Feld noch dasselbe wie beim Absenden, zeigt es jetzt die gespeicherte Form ("@abc" -> "abc", "Polen" -> "PL").
      setEntwurf((s) => {
        const jetzt = s[z.id];
        const zeigen = { ...jetzt };
        for (const f of FELDER) if (jetzt[f] === e[f]) zeigen[f] = neu[f];
        return { ...s, [z.id]: zeigen };
      });
      setZustand((s) => ({ ...s, [z.id]: { art: 'ok' } }));
    } catch (f) {
      setZustand((s) => ({ ...s, [z.id]: { art: 'fehler', text: (f as Error).message } }));
    }
  }, []);

  // Den Fokus nach einem Seitenwechsel setzen (Enter in der letzten Zeile).
  useEffect(() => {
    const ziel = fokusNach.current;
    if (!ziel) return;
    fokusNach.current = null;
    document.querySelector<HTMLInputElement>(`[data-zeile="${ziel.zeile}"][data-feld="${ziel.feld}"]`)?.focus();
  }, [seite, aufSeite]);

  const taste = (e: KeyboardEvent<HTMLInputElement>, z: Zeile, i: number, feld: Feld) => {
    if (e.key === 'Escape') {
      setEntwurf((s) => ({ ...s, [z.id]: { ...s[z.id], [feld]: gespeichertRef.current[z.id]?.[feld] ?? '' } }));
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const ziel = i + (e.shiftKey ? -1 : 1);
    if (ziel >= 0 && ziel < aufSeite.length) {
      document.querySelector<HTMLInputElement>(`[data-zeile="${ziel}"][data-feld="${feld}"]`)?.focus();
    } else if (ziel >= aufSeite.length && seite + 1 < seiten) {
      (e.target as HTMLInputElement).blur();
      fokusNach.current = { zeile: 0, feld };
      setSeite(seite + 1);
    } else if (ziel < 0 && seite > 0) {
      (e.target as HTMLInputElement).blur();
      fokusNach.current = { zeile: JE_SEITE - 1, feld };
      setSeite(seite - 1);
    }
  };

  // Verlaesst der Fokus die Zeile, wird sie gespeichert.
  const zeileVerlassen = (e: FocusEvent<HTMLTableRowElement>, z: Zeile) => {
    const nach = e.relatedTarget as Node | null;
    if (nach && e.currentTarget.contains(nach)) return;
    void speichern(z);
  };

  // Nicht mit ungespeicherten Zeilen davon.
  useEffect(() => {
    const warnen = (e: BeforeUnloadEvent) => {
      const ungespeichert = Object.entries(entwurfRef.current).some(([id, w]) => FELDER.some((f) => w[f] !== (gespeichertRef.current[id]?.[f] ?? '')));
      if (ungespeichert || Object.values(zustand).some((s) => s.art === 'speichert')) e.preventDefault();
    };
    window.addEventListener('beforeunload', warnen);
    return () => window.removeEventListener('beforeunload', warnen);
  }, [zustand]);

  if (!zugang.laedt && !zugang.admin) {
    return <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-center text-slate-400"><p className="text-sm"><T>Nur für Admins.</T></p></main>;
  }

  const chip = (an: boolean) => `rounded-full px-3 py-1 text-xs font-bold transition ${an ? 'bg-sky-500 text-white' : 'border border-zinc-800 bg-zinc-900 text-slate-400 hover:text-slate-100'}`;
  const zelle = 'w-full rounded-md border bg-zinc-950 px-2 py-1 text-sm text-slate-100 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40';
  const blaettern = (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <button type="button" className="rounded-md border border-zinc-800 px-2 py-1 disabled:opacity-40" disabled={seite === 0} onClick={() => setSeite(seite - 1)}>←</button>
      <span className="tabular-nums">{seite + 1} / {seiten}</span>
      <button type="button" className="rounded-md border border-zinc-800 px-2 py-1 disabled:opacity-40" disabled={seite + 1 >= seiten} onClick={() => setSeite(seite + 1)}>→</button>
    </div>
  );

  return (
    <main className="flex-1 bg-zinc-950 px-4 py-6 text-slate-200">
      <div className="mx-auto max-w-[1400px]">
        <SeitenKopf className="mb-5" marke={<T>Spieler & Teams</T>} titel={<T>Flaggen & X-Konten</T>}
          text={<T>Wichtige Spieler ohne Flagge oder X-Konto, nach Wichtigkeit. Tab: nächste Zelle · Enter: Zeile tiefer · Esc: zurücknehmen · gespeichert wird beim Verlassen der Zeile.</T>}
          rechts={<Link href="/admin/players" className="rounded-lg border border-sky-500/50 px-3 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-500/10">Player Center</Link>} />

        {ladeFehler && <p className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{ladeFehler}</p>}

        {d && (
          <section className="mb-4 grid gap-3 sm:grid-cols-4">
            {([['Ohne Flagge', offen.land, offen.start.land], ['Ohne X-Konto', offen.x, offen.start.x], ['Ohne beides', offen.beide, offen.start.beide]] as const).map(([titel, jetzt, start]) => (
              <div key={titel} className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"><T>{titel}</T></p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-100">{jetzt}<span className="ml-2 text-xs font-semibold text-slate-500">/ {start} <T>beim Laden</T></span></p>
              </div>
            ))}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
              {d.wichtig} <T>wichtige Spieler</T> · <T>Stand</T> {new Date(d.stand).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}<br />
              <T>schon vollständig</T>: {d.ausgeschlossen.vollstaendig} · <T>ausgeschlossen</T>: {d.ausgeschlossen.geloescht + d.ausgeschlossen.turnierkonto} (<T>gelöscht</T> {d.ausgeschlossen.geloescht}, <T>Turnierkonten</T> {d.ausgeschlossen.turnierkonto}) · <T>ohne bekannten Namen</T>: {d.ausgeschlossen.ohneName}
            </div>
          </section>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {([['offen', 'Alle offenen'], ['land', 'Ohne Flagge'], ['x', 'Ohne X'], ['beide', 'Ohne beides']] as const).map(([k, titel]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={chip(filter === k)}><T>{titel}</T></button>
          ))}
          <span className="mx-1 h-5 w-px bg-zinc-800" />
          <button type="button" onClick={() => setRegion('')} className={chip(!region)}><T>Alle Regionen</T></button>
          {REGIONEN_REIHE.map((r) => <button key={r} type="button" onClick={() => setRegion(r)} className={chip(region === r)}>{r}</button>)}
          <label className="ml-2 flex items-center gap-1.5 text-xs text-slate-400"><input type="checkbox" checked={twitchZeigen} onChange={(e) => setTwitchZeigen(e.target.checked)} /> Twitch</label>
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Name oder Epic-Id …" aria-label="Suche"
            className="ml-auto w-full max-w-[240px] rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500" />
        </div>

        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span>{liste.length} <T>Zeilen</T></span>
          {blaettern}
        </div>

        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900">
          <table className="w-full min-w-[1100px] text-sm" data-flaggen-tabelle>
            <thead className="sticky top-0 z-10 bg-zinc-900">
              <tr className="border-b border-zinc-800 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                <th className="px-3 py-2" title="Rang nach Wichtigkeit (Punkte)">#</th>
                <th className="px-3 py-2"><T>Spieler</T></th>
                <th className="px-2 py-2">Region</th>
                <th className="px-2 py-2 text-right" title="Finals · Heats/Halbfinals · späte FNCS-Runden · Cups (Finale oder Spitze)">F · H · R · C</th>
                <th className="px-2 py-2 text-right"><T>Bestes Finale</T></th>
                <th className="px-2 py-2 text-right">PR</th>
                <th className="w-[260px] px-2 py-2"><T>Flagge</T></th>
                <th className="w-[220px] px-2 py-2">X</th>
                {twitchZeigen && <th className="w-[170px] px-2 py-2">Twitch</th>}
                <th className="w-[130px] px-2 py-2"><T>Status</T></th>
              </tr>
            </thead>
            <tbody>
              {!d && !ladeFehler && <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-500"><T>Wird geladen …</T></td></tr>}
              {d && !aufSeite.length && <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-500"><T>Nichts offen.</T></td></tr>}
              {aufSeite.map((z, i) => {
                const e = entwurf[z.id] ?? { land: '', x: '', twitch: '' };
                const g = gespeichert[z.id] ?? { land: '', x: '', twitch: '' };
                const pl = pruefe('land', e.land);
                const px = pruefe('x', e.x);
                const pt = pruefe('twitch', e.twitch);
                const land = landNach(pl.wert);
                const s = zustand[z.id];
                const geaendert = FELDER.some((f) => e[f] !== g[f]);
                const fertig = !!g.land && !!g.x && (!z.alterEintrag || unterId.has(z.id));
                return (
                  <tr key={z.id} onBlur={(ev) => zeileVerlassen(ev, z)} data-id={z.id}
                    className={`border-b border-zinc-800/60 align-top ${fertig ? 'bg-sky-500/[0.06]' : ''}`}>
                    <td className="px-3 py-2 text-xs font-bold tabular-nums text-slate-500" title={`${z.punkte} Punkte`}>{z.rang}</td>
                    <td className="max-w-[230px] px-3 py-2">
                      <a href={`/statistics?spieler=${z.id}`} target="_blank" rel="noreferrer" tabIndex={-1} className={`block truncate font-semibold hover:text-sky-300 ${z.name ? 'text-slate-100' : 'font-mono text-xs text-slate-400'}`}>{z.name || `${z.id.slice(0, 12)}… (Name unbekannt)`}</a>
                      {z.namen.length > 0 && <p className="truncate text-[11px] text-slate-500" title={z.namen.join(', ')}>{z.namen.join(' · ')}</p>}
                      {z.alterEintrag && <p className="text-[11px] text-violet-300" title="Liegt nur unter dem Namen, ohne Konto-Id - die Statistik sieht es nicht. Speichern legt es unter die Id.">Alteintrag „{z.alterEintrag}“</p>}
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-400">{z.region || '–'}<span className="block text-[10px] text-slate-600">{jahr(z.letzte)}</span></td>
                    <td className="px-2 py-2 text-right text-xs tabular-nums text-slate-300">{z.final} · {z.semi + z.heat} · {z.runde} · {z.cup}</td>
                    <td className="px-2 py-2 text-right text-xs tabular-nums text-slate-400">{z.besteFinal ? `#${z.besteFinal}` : '–'}</td>
                    <td className="px-2 py-2 text-right text-xs tabular-nums text-slate-400">{z.pr ? `#${z.pr}` : '–'}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <input data-zeile={i} data-feld="land" value={e.land} placeholder={z.auto ? `${z.auto.land}?` : 'Land / DE / DEU'} aria-label={`Flagge ${z.name}`}
                          onChange={(ev) => setEntwurf((x) => ({ ...x, [z.id]: { ...e, land: ev.target.value } }))} onKeyDown={(ev) => taste(ev, z, i, 'land')}
                          className={`${zelle} max-w-[130px] ${pl.fehler ? 'border-rose-500' : 'border-zinc-700'}`} />
                        {land ? (
                          <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-300" data-vorschau="land"><TeamFlagge groesse={16} laender={[land.code]} /><span className="truncate">{land.code} · {land.en}</span></span>
                        ) : pl.fehler ? <span className="text-xs text-rose-300">{pl.fehler}</span> : z.auto ? (
                          <button type="button" tabIndex={-1} onClick={() => setEntwurf((x) => ({ ...x, [z.id]: { ...e, land: z.auto!.land } }))}
                            title={`Nur automatisch (${z.auto.quelle}) - nicht geprüft`} className="flex items-center gap-1 rounded border border-dashed border-zinc-700 px-1.5 py-0.5 text-[11px] text-slate-400 hover:border-sky-500 hover:text-sky-300">
                            <TeamFlagge groesse={12} laender={[z.auto.land]} />{z.auto.land} <span className="text-slate-600">({z.auto.quelle})</span>
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <input data-zeile={i} data-feld="x" value={e.x} placeholder="@handle oder x.com/…" aria-label={`X ${z.name}`}
                        onChange={(ev) => setEntwurf((x) => ({ ...x, [z.id]: { ...e, x: ev.target.value } }))} onKeyDown={(ev) => taste(ev, z, i, 'x')}
                        className={`${zelle} ${px.fehler ? 'border-rose-500' : 'border-zinc-700'}`} />
                      {px.fehler ? <p className="mt-0.5 text-[11px] text-rose-300">{px.fehler}</p>
                        : px.wert && px.wert !== e.x.trim() ? <p className="mt-0.5 text-[11px] text-slate-500" data-vorschau="x">→ @{px.wert}</p> : null}
                    </td>
                    {twitchZeigen && (
                      <td className="px-2 py-2">
                        <input data-zeile={i} data-feld="twitch" value={e.twitch} placeholder="Kanal" aria-label={`Twitch ${z.name}`}
                          onChange={(ev) => setEntwurf((x) => ({ ...x, [z.id]: { ...e, twitch: ev.target.value } }))} onKeyDown={(ev) => taste(ev, z, i, 'twitch')}
                          className={`${zelle} ${pt.fehler ? 'border-rose-500' : 'border-zinc-700'}`} />
                        {pt.fehler && <p className="mt-0.5 text-[11px] text-rose-300">{pt.fehler}</p>}
                      </td>
                    )}
                    <td className="px-2 py-2 text-xs" data-status={s?.art ?? (geaendert ? 'geaendert' : '')}>
                      {s?.art === 'speichert' ? <span className="text-slate-400">speichert …</span>
                        : s?.art === 'fehler' ? <span className="text-rose-300" title={s.text}>✕ {s.text}</span>
                          : geaendert ? <span className="text-slate-400">nicht gespeichert</span>
                            : s?.art === 'ok' ? <span className="font-semibold text-sky-300">✓ gespeichert{fertig ? ' · fertig' : ''}</span>
                              : z.alterEintrag ? <button type="button" tabIndex={-1} onClick={() => void speichern(z, true)} className="rounded border border-violet-500/50 px-1.5 py-0.5 text-[11px] text-violet-300 hover:bg-violet-500/10">unter Id übernehmen</button>
                                : <span className="text-slate-600">{[z.fehlt.land && 'Flagge', z.fehlt.x && 'X'].filter(Boolean).join(' + ')} fehlt</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex justify-end">{blaettern}</div>
      </div>
    </main>
  );
}
