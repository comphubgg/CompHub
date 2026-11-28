/*
 * Editor der CompHub Awards 2026 (lib/awards, app/api/awards) - nur fuer den Admin.
 *
 * Kategorien anlegen, bearbeiten, umsortieren; Nominierte hinzufuegen: Spieler ueber dieselbe Suche wie oben auf der Startseite (KopfSuche:
 * /api/szene-stats?ansicht=suche und /api/spieler-verlauf) - Name, Flagge, Foto, X und Zahlenzeile kommen aus dem Treffer, das Team aus den
 * E-Sports-Teams (/api/orgs). Orgs, Creator, Agents, Manager und Coaches von Hand (Name, X, Bild-Adresse), Spielzuege als Clip mit Link.
 * Phasen mit Daten (UTC), Gewinner, Zwischenstand der Community-Stimmen (nur hier sichtbar). Gespeichert wird erst mit "Save".
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from '../port/next/link';
import LadeSchirm from '../port/app/components/LadeSchirm';
import SeitenKopf from '../port/app/components/SeitenKopf';
import { NurAdmins } from '../teile';
import type { AbstimmungsArt, Awards, Kategorie, Nominierter, NominiertenArt } from '../port/lib/awards';

interface Treffer {
  epicId: string; name: string; anzeige?: string; land?: string | null; bild?: string | null; x?: string | null;
  events?: number; matches?: number; elimsProMatch?: number; region?: string; heimat?: string; ausIndex?: boolean;
}
interface OrgEintrag { name: string; logo: string | null; spieler: Array<{ epicId: string | null }> }

const ART: Record<AbstimmungsArt, string> = { community: 'Community vote', panel: 'Community vote', beide: 'Community vote' };
const PHASE: Record<string, string> = { vorher: 'Before nominations', nominierung: 'Nominations', zwischen: 'Between nominations and voting', abstimmung: 'Voting open', auswertung: 'Voting closed, results pending', ergebnis: 'Results public' };

const kennung = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const eindeutig = (basis: string, vergeben: string[]) => { let id = kennung(basis) || 'n'; while (vergeben.includes(id)) id = `${id}-2`; return id; };

/** ISO (UTC) <-> datetime-local, ebenfalls als UTC gelesen. */
const zuFeld = (iso: string | null) => (iso ? iso.slice(0, 16) : '');
const ausFeld = (v: string) => (v ? `${v}:00.000Z` : null);

function zahlenZeile(t: Treffer): string | null {
  const teile: string[] = [];
  if (t.events) teile.push(`${t.events} events`);
  if (t.elimsProMatch) teile.push(`${t.elimsProMatch.toFixed(2)} elims/match`);
  return teile.join(' · ') || null;
}

const feld = 'w-full rounded-lg border border-white/15 bg-white/[0.035] backdrop-blur-xl px-3 py-2 text-sm text-white focus:border-akz focus:outline-none';
const knopf = 'rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:border-akz hover:text-akz disabled:opacity-40';

function verschieben<T>(liste: T[], i: number, um: number): T[] {
  const j = i + um;
  if (j < 0 || j >= liste.length) return liste;
  const neu = [...liste];
  [neu[i], neu[j]] = [neu[j], neu[i]];
  return neu;
}

export default function AwardsEditor() {
  const [awards, setAwards] = useState<Awards | null>(null);
  const [phase, setPhase] = useState('');
  const [zaehlung, setZaehlung] = useState<Record<string, Record<string, number>>>({});
  const [waehler, setWaehler] = useState(0);
  const [fehler, setFehler] = useState('');
  const [geaendert, setGeaendert] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [meldung, setMeldung] = useState('');
  const [offen, setOffen] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgEintrag[] | null>(null);

  const laden = useCallback(() => fetch('/api/awards', { cache: 'no-store' }).then(async (r) => ({ r, j: await r.json().catch(() => null) })).then(({ r, j }) => {
    // Im Hub: ohne Admin-Anmeldung antwortet die Seite mit 401/403/404 - dann die Anmeldekarte statt eines nackten Fehlers.
    if ([401, 403, 404].includes(r.status)) { setFehler('__admin'); return; }
    if (!j?.ok) { setFehler(j?.error || 'Could not load the awards.'); return; }
    setAwards(j.awards); setPhase(j.phase); setZaehlung(j.zaehlung ?? {}); setWaehler(j.waehler ?? 0); setGeaendert(false); setFehler('');
  }).catch(() => setFehler('Could not load the awards.')), []);
  useEffect(() => { void laden(); }, [laden]);
  useEffect(() => {
    fetch('/api/orgs').then((r) => r.json()).then((j) => setOrgs(Array.isArray(j?.orgs) ? j.orgs : [])).catch(() => setOrgs([]));
  }, []);

  // Vor dem Verlassen mit ungespeicherten Aenderungen warnen.
  useEffect(() => {
    if (!geaendert) return;
    const w = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', w);
    return () => window.removeEventListener('beforeunload', w);
  }, [geaendert]);

  const aendern = (f: (a: Awards) => Awards) => { setAwards((a) => (a ? f(a) : a)); setGeaendert(true); setMeldung(''); };
  const katAendern = (id: string, f: (k: Kategorie) => Kategorie) => aendern((a) => ({ ...a, kategorien: a.kategorien.map((k) => (k.id === id ? f(k) : k)) }));

  const speichern = async () => {
    if (!awards) return;
    setSpeichert(true); setMeldung('');
    try {
      const r = await fetch('/api/awards', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ awards }) });
      const j = await r.json().catch(() => null);
      if (!j?.ok) { setMeldung(`Not saved: ${j?.error || `HTTP ${r.status}`}`); return; }
      setAwards(j.awards); setPhase(j.phase); setGeaendert(false); setMeldung('Saved.');
    } catch { setMeldung('Not saved: no connection.'); } finally { setSpeichert(false); }
  };

  const teamVon = useMemo(() => {
    const m = new Map<string, { team: string; logo: string | null }>();
    for (const o of orgs ?? []) for (const s of o.spieler ?? []) if (s.epicId) m.set(s.epicId.toLowerCase(), { team: o.name, logo: o.logo });
    return m;
  }, [orgs]);

  if (fehler) return <main><SeitenKopf marke="Admin only · not public" titel="CompHub Awards 2026" />{fehler === '__admin' ? <NurAdmins /> : <p className="text-rose-300">{fehler}</p>}</main>;
  if (!awards) return <LadeSchirm />;

  const neueKategorie = () => {
    const id = eindeutig('new-category', awards.kategorien.map((k) => k.id));
    aendern((a) => ({ ...a, kategorien: [...a.kategorien, { id, name: 'New category', beschreibung: '', art: 'community', sonderpreis: false, nominierte: [], sieger: null }] }));
    setOffen(id);
  };

  return (
    <main className="pb-32">
      <SeitenKopf marke="Admin only · not public" titel="CompHub Awards 2026"
        text={<>Current phase: <b className="text-akz">{PHASE[phase] ?? phase}</b> · {waehler} voter{waehler === 1 ? '' : 's'} so far</>}
        rechts={<>
          <Link href="/awards" target="_blank" className={knopf}>Preview /awards ↗</Link>
          <button type="button" onClick={() => void laden()} disabled={speichert} className={knopf}>Reload</button>
        </>} />

      <section className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-5">
        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-white/70">Phases (UTC)</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {([
            ['Nominations open', awards.phasen.nominierung.start, (v: string | null) => aendern((a) => ({ ...a, phasen: { ...a.phasen, nominierung: { ...a.phasen.nominierung, start: v } } }))],
            ['Nominations close', awards.phasen.nominierung.ende, (v: string | null) => aendern((a) => ({ ...a, phasen: { ...a.phasen, nominierung: { ...a.phasen.nominierung, ende: v } } }))],
            ['Voting opens', awards.phasen.abstimmung.start, (v: string | null) => aendern((a) => ({ ...a, phasen: { ...a.phasen, abstimmung: { ...a.phasen.abstimmung, start: v } } }))],
            ['Voting closes', awards.phasen.abstimmung.ende, (v: string | null) => aendern((a) => ({ ...a, phasen: { ...a.phasen, abstimmung: { ...a.phasen.abstimmung, ende: v } } }))],
            ['Winners revealed', awards.phasen.ergebnis.datum, (v: string | null) => aendern((a) => ({ ...a, phasen: { ...a.phasen, ergebnis: { datum: v } } }))],
          ] as Array<[string, string | null, (v: string | null) => void]>).map(([titel, wert, setzen]) => (
            <label key={titel} className="block text-xs font-semibold text-white/55">
              {titel}
              <input type="datetime-local" value={zuFeld(wert)} onChange={(e) => setzen(ausFeld(e.target.value))} className={`${feld} mt-1`} />
            </label>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 px-5 py-3">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-white/70">Categories ({awards.kategorien.length})</h2>
          <button type="button" onClick={neueKategorie} className={knopf}>+ Category</button>
        </div>
        <ol className="mt-4 space-y-3">
          {awards.kategorien.map((k, i) => (
            <KategorieZeile
              key={k.id}
              k={k}
              andereIds={awards.kategorien.filter((x) => x.id !== k.id).map((x) => x.id)}
              offen={offen === k.id}
              umschalten={() => setOffen(offen === k.id ? null : k.id)}
              idGeaendert={setOffen}
              hoch={i > 0 ? () => aendern((a) => ({ ...a, kategorien: verschieben(a.kategorien, i, -1) })) : undefined}
              runter={i < awards.kategorien.length - 1 ? () => aendern((a) => ({ ...a, kategorien: verschieben(a.kategorien, i, 1) })) : undefined}
              loeschen={() => { if (window.confirm(`Delete "${k.name}" with ${k.nominierte.length} nominee(s)?`)) aendern((a) => ({ ...a, kategorien: a.kategorien.filter((x) => x.id !== k.id) })); }}
              aendern={(f) => katAendern(k.id, f)}
              stimmen={zaehlung[k.id] ?? {}}
              teamVon={teamVon}
            />
          ))}
        </ol>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#070a12]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <span className={`text-sm ${geaendert ? 'text-amber-300' : meldung.startsWith('Not') ? 'text-rose-300' : 'text-white/55'}`}>
            {geaendert ? 'Unsaved changes' : meldung || 'Everything saved'}
          </span>
          <button type="button" onClick={() => void speichern()} disabled={!geaendert || speichert} className="rounded-xl bg-akz px-6 py-2.5 text-sm font-bold text-[#04050a] transition hover:brightness-110 disabled:opacity-40">
            {speichert ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </main>
  );
}

function KategorieZeile({ k, andereIds, offen, umschalten, idGeaendert, hoch, runter, loeschen, aendern, stimmen, teamVon }: {
  k: Kategorie; andereIds: string[]; offen: boolean; umschalten: () => void; idGeaendert: (id: string) => void; hoch?: () => void; runter?: () => void; loeschen: () => void;
  aendern: (f: (k: Kategorie) => Kategorie) => void; stimmen: Record<string, number>; teamVon: Map<string, { team: string; logo: string | null }>;
}) {
  const gesamt = Object.values(stimmen).reduce((a, b) => a + b, 0);
  const nominierteAendern = (f: (n: Nominierter[]) => Nominierter[]) => aendern((x) => ({ ...x, nominierte: f(x.nominierte) }));
  const hinzu = (n: Omit<Nominierter, 'id'>) => nominierteAendern((liste) => [...liste, { ...n, id: eindeutig(n.name, liste.map((x) => x.id)) }]);

  return (
    <li className="rounded-2xl border border-white/10 bg-black/30">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <button type="button" onClick={umschalten} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="text-white/40">{offen ? '▾' : '▸'}</span>
          <span className="truncate font-semibold text-white">{k.name}</span>
          <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-white/55">{ART[k.art]}</span>
          {k.sonderpreis && <span className="rounded-full border border-amber-400/40 px-2 py-0.5 text-[11px] text-amber-300">Special prize</span>}
          <span className="text-xs text-white/40">{k.nominierte.length} nominee{k.nominierte.length === 1 ? '' : 's'}{gesamt ? ` · ${gesamt} vote${gesamt === 1 ? '' : 's'}` : ''}</span>
        </button>
        <div className="flex gap-1.5">
          <button type="button" onClick={hoch} disabled={!hoch} className={knopf} aria-label="Move up">↑</button>
          <button type="button" onClick={runter} disabled={!runter} className={knopf} aria-label="Move down">↓</button>
          <Link href={`/awards/${k.id}`} target="_blank" className={knopf}>Preview ↗</Link>
          <button type="button" onClick={loeschen} className={`${knopf} hover:border-rose-500 hover:text-rose-300`}>Delete</button>
        </div>
      </div>

      {offen && (
        <div className="space-y-5 border-t border-white/10 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-white/55">Name
              <input value={k.name} onChange={(e) => aendern((x) => ({ ...x, name: e.target.value }))} className={`${feld} mt-1`} />
            </label>
            <label className="block text-xs font-semibold text-white/55">Address (/awards/…) - changing it breaks links and detaches votes
              <input defaultValue={k.id} onBlur={(e) => { const neu = kennung(e.target.value); if (neu && neu !== k.id && !andereIds.includes(neu)) { aendern((x) => ({ ...x, id: neu })); idGeaendert(neu); } else e.target.value = k.id; }} className={`${feld} mt-1 font-mono`} />
            </label>
            <label className="block text-xs font-semibold text-white/55 sm:col-span-2">Description
              <textarea value={k.beschreibung} onChange={(e) => aendern((x) => ({ ...x, beschreibung: e.target.value }))} rows={2} className={`${feld} mt-1`} />
            </label>
            <div className="block text-xs font-semibold text-white/55">Decided by
              <p className={`${feld} mt-1`}>Community vote (fan vote, one vote per Epic account)</p>
            </div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2 pb-2 text-sm text-white/70">
                <input type="checkbox" checked={k.sonderpreis} onChange={(e) => aendern((x) => ({ ...x, sonderpreis: e.target.checked }))} /> Special prize
              </label>
              <label className="block flex-1 text-xs font-semibold text-white/55">Winner (shown once results are public)
                <select value={k.sieger ?? ''} onChange={(e) => aendern((x) => ({ ...x, sieger: e.target.value || null }))} className={`${feld} mt-1`}>
                  <option value="">- not decided -</option>
                  {k.nominierte.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">Nominees</h3>
            {k.nominierte.length === 0 && <p className="mt-2 text-sm text-white/40">No nominees yet.</p>}
            <ul className="mt-3 space-y-2">
              {k.nominierte.map((n, i) => (
                <NominierterZeile
                  key={n.id}
                  n={n}
                  stimmen={stimmen[n.id] ?? 0}
                  gesamt={gesamt}
                  aendern={(f) => nominierteAendern((l) => l.map((x) => (x.id === n.id ? f(x) : x)))}
                  hoch={i > 0 ? () => nominierteAendern((l) => verschieben(l, i, -1)) : undefined}
                  runter={i < k.nominierte.length - 1 ? () => nominierteAendern((l) => verschieben(l, i, 1)) : undefined}
                  entfernen={() => { if (window.confirm(`Remove ${n.name}?`)) nominierteAendern((l) => l.filter((x) => x.id !== n.id)); }}
                />
              ))}
            </ul>
            <div className="mt-4 grid gap-3 lg:grid-cols-[2fr_1fr]">
              <SpielerSuche waehlen={(t) => {
                const team = teamVon.get(t.epicId.toLowerCase());
                hinzu({
                  art: 'spieler', name: t.anzeige || t.name, epicId: t.epicId, land: t.land ?? null, bild: t.bild ?? null, x: t.x ?? null,
                  statZeile: zahlenZeile(t), team: team?.team ?? null, teamLogo: team?.logo ?? null, link: null,
                });
              }} />
              <div className="flex flex-wrap items-start gap-2">
                {([['person', '+ Person / org (by hand)'], ['clip', '+ Play / clip']] as Array<[NominiertenArt, string]>).map(([art, text]) => (
                  <button key={art} type="button" className={knopf} onClick={() => hinzu({ art, name: art === 'clip' ? 'New play' : 'New nominee', epicId: null, team: null, teamLogo: null, land: null, bild: null, statZeile: null, x: null, link: null })}>{text}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function NominierterZeile({ n, stimmen, gesamt, aendern, hoch, runter, entfernen }: {
  n: Nominierter; stimmen: number; gesamt: number; aendern: (f: (n: Nominierter) => Nominierter) => void; hoch?: () => void; runter?: () => void; entfernen: () => void;
}) {
  const [offen, setOffen] = useState(false);
  const setze = (f: keyof Nominierter) => (e: { target: { value: string } }) => aendern((x) => ({ ...x, [f]: e.target.value || null }));
  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.03]">
      <div className="flex items-center gap-3 p-2.5">
        {n.bild
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={n.bild} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
          : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/[0.07] text-xs text-white/40">{n.art === 'clip' ? '▶' : '?'}</span>}
        <button type="button" onClick={() => setOffen(!offen)} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-semibold text-white">{n.name} {n.land && <span className="text-xs text-white/40">{n.land}</span>}</span>
          <span className="block truncate text-xs text-white/40">{[n.art === 'spieler' ? 'Player' : n.art === 'clip' ? 'Play' : 'Person', n.team, n.statZeile].filter(Boolean).join(' · ')}</span>
        </button>
        {gesamt > 0 && <span className="text-xs font-semibold text-akz">{stimmen} ({Math.round((stimmen / gesamt) * 100)}%)</span>}
        <div className="flex gap-1">
          <button type="button" onClick={hoch} disabled={!hoch} className={knopf} aria-label="Move up">↑</button>
          <button type="button" onClick={runter} disabled={!runter} className={knopf} aria-label="Move down">↓</button>
          <button type="button" onClick={() => setOffen(!offen)} className={knopf}>{offen ? 'Done' : 'Edit'}</button>
          <button type="button" onClick={entfernen} className={`${knopf} hover:border-rose-500 hover:text-rose-300`}>✕</button>
        </div>
      </div>
      {offen && (
        <div className="grid gap-2 border-t border-white/10 p-3 sm:grid-cols-2">
          <label className="block text-xs text-white/55">Name<input value={n.name} onChange={(e) => aendern((x) => ({ ...x, name: e.target.value }))} className={`${feld} mt-1`} /></label>
          <label className="block text-xs text-white/55">Team / org<input value={n.team ?? ''} onChange={setze('team')} className={`${feld} mt-1`} /></label>
          <label className="block text-xs text-white/55">Country (2 letters)<input value={n.land ?? ''} maxLength={2} onChange={(e) => aendern((x) => ({ ...x, land: e.target.value.toUpperCase() || null }))} className={`${feld} mt-1`} /></label>
          <label className="block text-xs text-white/55">X handle (without @)<input value={n.x ?? ''} onChange={setze('x')} className={`${feld} mt-1`} /></label>
          <label className="block text-xs text-white/55 sm:col-span-2">Image URL {n.epicId ? '(players: our photo pool is used automatically when it has one)' : '(https://… or /…)'}<input value={n.bild ?? ''} onChange={setze('bild')} className={`${feld} mt-1`} /></label>
          <label className="block text-xs text-white/55 sm:col-span-2">Stat line<input value={n.statZeile ?? ''} onChange={setze('statZeile')} placeholder="e.g. FNCS Grand Finals winner · 44 events" className={`${feld} mt-1`} /></label>
          <label className="block text-xs text-white/55 sm:col-span-2">{n.art === 'clip' ? 'Clip link' : 'Link (optional)'}<input value={n.link ?? ''} onChange={setze('link')} placeholder="https://" className={`${feld} mt-1`} /></label>
          <label className="block text-xs text-white/55">Team logo URL<input value={n.teamLogo ?? ''} onChange={setze('teamLogo')} className={`${feld} mt-1`} /></label>
          <p className="self-end text-xs text-white/40">{n.epicId ? <>Epic account <span className="font-mono">{n.epicId}</span></> : 'No Epic account linked'}</p>
        </div>
      )}
    </li>
  );
}

/** Dieselbe Suche wie KopfSuche (Startseite): erst die gepflegten Profile, dann jeder aus unseren Bestenlisten. */
function SpielerSuche({ waehlen }: { waehlen: (t: Treffer) => void }) {
  const [frage, setFrage] = useState('');
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [stand, setStand] = useState<'leer' | 'laedt' | 'fertig' | 'fehler'>('leer');

  useEffect(() => {
    const q = frage.trim();
    if (q.length < 2) return;
    const abbruch = new AbortController();
    const zeiger = setTimeout(async () => {
      try {
        const index = q.length >= 3
          ? fetch(`/api/spieler-verlauf?q=${encodeURIComponent(q)}`, { signal: abbruch.signal }).then((x) => x.json()).catch(() => null)
          : Promise.resolve(null);
        const r = await fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`, { signal: abbruch.signal });
        const j = await r.json();
        if (!j || j.success === false || !Array.isArray(j.spieler)) throw new Error('Reply');
        const profile = (j.spieler as Treffer[]).slice(0, 8);
        const da = new Set(profile.map((x) => x.epicId));
        const aus = (((await index)?.treffer ?? []) as Treffer[]).filter((x) => !da.has(x.epicId)).map((x) => ({ ...x, ausIndex: true }));
        setTreffer([...profile, ...aus].slice(0, 10));
        setStand('fertig');
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setTreffer([]); setStand('fehler');
      }
    }, 250);
    return () => { clearTimeout(zeiger); abbruch.abort(); };
  }, [frage]);

  return (
    <div className="relative">
      <input value={frage} onChange={(e) => { setFrage(e.target.value); setStand(e.target.value.trim().length >= 2 ? 'laedt' : 'leer'); }} placeholder="+ Player: search by name…" className={feld} />
      {frage.trim().length >= 2 && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-xl border border-white/15 bg-black/40 shadow-xl">
          {stand === 'laedt' && <p className="px-3 py-2 text-xs text-white/40">Searching…</p>}
          {stand === 'fehler' && <p className="px-3 py-2 text-xs text-rose-300">Search not reachable right now.</p>}
          {stand === 'fertig' && treffer.length === 0 && <p className="px-3 py-2 text-xs text-white/40">No player found.</p>}
          {treffer.map((t) => (
            <button key={t.epicId} type="button" onClick={() => { waehlen(t); setFrage(''); }} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.08]">
              {t.bild
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={t.bild} alt="" className="h-8 w-8 rounded-md object-cover" />
                : <span className="h-8 w-8 rounded-md bg-white/[0.07]" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{t.anzeige || t.name}{t.land ? <span className="ml-1.5 text-xs text-white/40">{t.land}</span> : null}</span>
                <span className="block truncate text-xs text-white/40">{[t.heimat || t.region, t.events ? `${t.events} events` : null, t.ausIndex ? 'from leaderboards' : null].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
