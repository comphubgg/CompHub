'use client';
// Die Prognoseseite - fuer alle sichtbar.
//
// Der Betreiber hat sie nach einem Vorbild beschrieben: links eine schmale
// Leiste mit Duos, Map, Leaderboard, Regions, Nationalities, Prize Pool;
// rechts der jeweilige Abschnitt. Vorher waehlt man den Cup, aus dem die
// Zahlen kommen. Es gibt keine Admin-Funktionen ausser einer: unter Duos
// kann der Betreiber ein Duo von Hand hinzufuegen, etwa bei einem Cup, der
// noch nicht gespielt ist und zu dem Epic noch keine Bestenliste hat.
//
// Gebaut wird die Prognose selbst weiterhin im Admin-Werkzeug (Reihenfolge,
// Formen, wer wo landet). Diese Seite zeigt sie nur - und zeigt nur, was
// aus Epics Daten und den gepflegten Profilen belegt ist. Erfunden wird
// nichts: ohne Bestenliste bleibt das Feld leer, ohne Tabelle das Preisgeld.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { namensSchluessel } from '@/lib/homoglyph';
import TeamFlagge, { flaggenPfad } from '@/components/TeamFlagge';
import T from '@/app/components/T';
import { useT, useSprache } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import {
  einheitsGroesse, rahmen, spanneBei, type Punkt, type Spot,
} from '@/lib/prognoseKarte';
import {
  kartenSchrift, kartenName, formFarbe, hebeFormHervor, useEchteNamen,
} from '@/app/lib/kartenStil';

/* ------------------------------------------------------------ Daten */

interface Quelle {
  eventId: string; windowId: string; region: string; titel: string;
  topN: number | null;
}
interface Karte {
  id: string; bildId: string; titel: string;
  spots: Spot[]; aufSpot: Record<string, string[]>;
}
interface Prognose {
  id: string; titel: string; cupId: string; cupTitel: string;
  gruppe?: string; quellen: Quelle[]; plaetze: Array<string | null>;
  /** Das Feld beim Speichern - seit dem 22.9.2026 dabei, siehe app/api/prognosen. */
  feld?: Team[];
  karten?: Karte[];
  bildId?: string; kartenTitel?: string; spots?: Spot[]; aufSpot?: Record<string, string[]>;
  /** Von Hand hinzugefuegte Teams - siehe "Add a Duo". */
  manuell?: Team[];
  geaendert: number; oeffentlich: boolean;
}
interface Team {
  key: string; namen: string[]; ids: string[];
  herkunft: string[]; besterPlatz: number; region: string;
}
interface Profil {
  id?: string; land?: string; anzeige?: string; namen?: string[]; name?: string; region?: string;
}
interface Preisstufe { art: string; schwelle: number; betrag: number; von?: number; plaetze?: number }

type Abschnitt = 'duos' | 'karte' | 'leaderboard' | 'regionen' | 'nationen' | 'preise';

const ABSCHNITTE: Array<[Abschnitt, string, string]> = [
  ['duos', 'Duos', 'M4 6h16M4 12h16M4 18h7'],
  ['karte', 'Karte', 'M9 20l-5.5-2.5V4L9 6.5m0 13.5l6-2.5m-6 2.5V6.5m6 11l5.5 2.5V6.5L15 4m0 13.5V4M9 6.5L15 4'],
  ['leaderboard', 'Bestenliste', 'M4 20V10m6 10V4m6 16v-7m4 7H2'],
  ['regionen', 'Regionen', 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 0c3 3 3 17 0 20m0-20C9 5 9 19 12 22M2 12h20'],
  ['nationen', 'Nationalitäten', 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m20 0v-2a4 4 0 00-3-3.9M13 3.1a4 4 0 010 7.8M11 7a4 4 0 11-8 0 4 4 0 018 0z'],
  ['preise', 'Preisgeld', 'M12 2v20m5-17H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6'],
];

const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];

/*
 * "[EWC2026] AURA shxrk 7" wird zu "SHXRK" - komplett gross, wie auf jeder
 * Karte (siehe app/lib/kartenStil).
 */
function kurz(name: string) {
  return kartenName(name);
}

/** Liegt der Punkt in der Flaeche? Strahlenverfahren. */
function imPolygon(q: Punkt, ecken: Punkt[]) {
  let drin = false;
  for (let i = 0, j = ecken.length - 1; i < ecken.length; j = i++) {
    const a = ecken[i], b = ecken[j];
    if ((a.y > q.y) !== (b.y > q.y)
      && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) drin = !drin;
  }
  return drin;
}

function landName(kuerzel: string, sprache: string) {
  try {
    return new Intl.DisplayNames([sprache === 'de' ? 'de' : 'en'], { type: 'region' }).of(kuerzel.toUpperCase()) ?? kuerzel;
  } catch { return kuerzel; }
}

function platzWort(n: number, sprache: string) {
  if (sprache === 'de') return `${n}.`;
  const r = n % 100;
  if (r >= 11 && r <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/* ------------------------------------------------------------ Seite */

export default function Prognosen() {
  const t = useT();
  const { sprache } = useSprache();
  const parameter = useSearchParams();

  const [prognosen, setPrognosen] = useState<Prognose[]>([]);
  const [gewaehlt, setGewaehlt] = useState<string>('');
  const [abschnitt, setAbschnitt] = useState<Abschnitt>('duos');
  const [leisteOffen, setLeisteOffen] = useState(true);
  const [istAdmin, setIstAdmin] = useState(false);
  const [profile, setProfile] = useState<Record<string, Profil>>({});
  /** Land und Heimatregion je Konto aus dem Archiv - fuer alle ohne gepflegtes Profil. */
  const [herkunft, setHerkunft] = useState<{ laender: Record<string, string>; heimat: Record<string, string> }>({ laender: {}, heimat: {} });
  const [feld, setFeld] = useState<Team[]>([]);
  const [feldLaedt, setFeldLaedt] = useState(false);
  const [feldHinweis, setFeldHinweis] = useState('');
  const [preise, setPreise] = useState<{ geld: Preisstufe[]; proPerson: boolean; hinweis?: string } | null>(null);
  const [kartenNr, setKartenNr] = useState(0);
  const [geladen, setGeladen] = useState(false);

  useEffect(() => {
    void Promise.all([
      fetch('/api/prognosen').then((r) => r.json()).then((d) => d.prognosen ?? []).catch(() => []),
      fetch('/api/spieler-profile').then((r) => r.json()).then((j) => j.profile ?? {}).catch(() => ({})),
      fetch('/api/auth/check-admin').then((r) => r.json()).then((j) => j.isAdmin === true).catch(() => false),
    ]).then(([liste, prof, admin]: [Prognose[], Record<string, Profil>, boolean]) => {
      setIstAdmin(admin);
      setProfile(prof);
      const sichtbar = liste.filter((p) => p.oeffentlich || admin);
      setPrognosen(sichtbar);
      const gewuenscht = parameter?.get('id');
      setGewaehlt(gewuenscht && sichtbar.some((p) => p.id === gewuenscht)
        ? gewuenscht : (sichtbar[0]?.id ?? ''));
      setGeladen(true);
    });
    fetch('/api/spieler-laender', { signal: AbortSignal.timeout(20_000) }).then((r) => r.json())
      .then((j) => setHerkunft({ laender: j.laender ?? {}, heimat: j.heimat ?? {} })).catch(() => {});
  }, [parameter]);

  const prognose = useMemo(() => prognosen.find((p) => p.id === gewaehlt) ?? null, [prognosen, gewaehlt]);

  const findeProfil = useCallback((name: string, id?: string): Profil | undefined => {
    let p: Profil | undefined;
    // Auf einem LAN spielen die Pros mit Turnierkonten - die Id in Epics
    // Bestenliste ist dann nicht ihr eigenes Konto. Gefunden wird das
    // Profil ueber den Namen, und dessen Konto-Id fuehrt zum Archiv.
    let kontoId = id;
    if (id && profile[id]) p = profile[id];
    else {
      const schluessel = namensSchluessel(name);
      const paar = Object.entries(profile).find(([, x]) => (x.namen ?? [x.name ?? '']).some((n) => namensSchluessel(n) === schluessel));
      if (paar) { kontoId = paar[1].id || (/^[0-9a-f]{32}$/i.test(paar[0]) ? paar[0] : id); p = paar[1]; }
    }
    // Was das Profil nicht sagt, sagt das Archiv: Land und Heimatregion je Konto.
    const land = p?.land || (kontoId ? herkunft.laender[kontoId] : undefined);
    const region = p?.region || (kontoId ? herkunft.heimat[kontoId] : undefined);
    if (!p && !land && !region) return undefined;
    return { ...p, land: land || undefined, region: region || undefined };
  }, [profile, herkunft]);

  /*
   * Das Feld: aus Epics Bestenlisten der angegebenen Spieltage, dazu die
   * von Hand ergaenzten Duos. Ein Team, das an mehreren Tagen dabei war,
   * erscheint einmal - erkannt ueber die Konto-Ids.
   */
  useEffect(() => {
    if (!prognose) { setFeld([]); return; }
    let weg = false;
    setFeldLaedt(true); setFeldHinweis('');
    (async () => {
      const gefunden = new Map<string, Team>();
      // Das gespeicherte Feld zuerst - es ist der Stand, fuer den die
      // Reihenfolge gemacht wurde. Aeltere Prognosen ohne Feld holen es
      // wie bisher aus ihren Quellen.
      for (const t of prognose.feld ?? []) gefunden.set(t.key, t);
      for (const q of gefunden.size ? [] : prognose.quellen) {
        try {
          const r = await fetch(`/api/cup-leaderboard?event=${encodeURIComponent(q.eventId)}`
            + `&window=${encodeURIComponent(q.windowId)}&limit=${q.topN ?? 200}`,
            { signal: AbortSignal.timeout(30_000) });
          const d = await r.json();
          if (!r.ok) continue;
          const eintraege = (d.entries ?? []).slice(0, q.topN ?? undefined) as Array<{
            rank: number; players: Array<{ name: string; id?: string }>;
          }>;
          for (const e of eintraege) {
            const ids = e.players.map((pl) => pl.id ?? '');
            const namen = e.players.map((pl) => pl.name);
            const echte = ids.filter(Boolean).slice().sort();
            const key = echte.length ? echte.join('|') : namen.map(namensSchluessel).sort().join('|');
            const herkunft = `${q.titel} · #${e.rank}`;
            const da = gefunden.get(key);
            if (da) { da.herkunft.push(herkunft); da.besterPlatz = Math.min(da.besterPlatz, e.rank); }
            else gefunden.set(key, { key, namen, ids, herkunft: [herkunft], besterPlatz: e.rank, region: q.region });
          }
        } catch { /* dieser Spieltag fehlt dann */ }
      }
      for (const m of prognose.manuell ?? []) if (!gefunden.has(m.key)) gefunden.set(m.key, m);
      if (weg) return;
      const liste = [...gefunden.values()].sort((a, b) => a.besterPlatz - b.besterPlatz);
      setFeld(liste);
      if (!liste.length) {
        setFeldHinweis(prognose.quellen.length
          ? t('Zu diesem Cup liefert Epic noch keine Bestenliste.')
          : t('Zu diesem Cup ist noch kein Spieltag hinterlegt.'));
      }
      setFeldLaedt(false);
    })();
    return () => { weg = true; };
  }, [prognose, t]);

  // Preisgeld des Finalfensters - Epics Tabelle, sonst nichts.
  useEffect(() => {
    if (!prognose?.quellen.length) { setPreise(null); return; }
    const q = prognose.quellen[prognose.quellen.length - 1];
    fetch(`/api/cup-preise?window=${encodeURIComponent(q.windowId)}&region=${encodeURIComponent(q.region)}`
      + `&event=${encodeURIComponent(q.eventId)}&finale=1`, { signal: AbortSignal.timeout(20_000) })
      .then((r) => r.json())
      .then((j) => setPreise({ geld: j.geld ?? [], proPerson: !!j.proPerson, hinweis: j.hinweis }))
      .catch(() => setPreise(null));
  }, [prognose]);

  const teamVon = useCallback((key: string | null) => (key ? feld.find((x) => x.key === key) ?? null : null), [feld]);
  /*
   * Der echte Name ueber die Konto-Id (siehe /api/echte-namen) - nicht der,
   * den Epic gerade fuehrt ("Idropy281").
   */
  const feldKonten = useMemo(() => feld.flatMap((x) => x.ids), [feld]);
  const echteNamen = useEchteNamen(feldKonten,
    prognose?.quellen[prognose.quellen.length - 1]?.eventId ?? null);
  const anzeigeName = useCallback((name: string, id?: string) =>
    kurz(echteNamen[id ?? ''] || findeProfil(name, id)?.anzeige || name), [echteNamen, findeProfil]);
  /** Die Form unter dem Zeiger - hervorgehoben wie beim Vorbild. */
  const kartenFlaeche = useRef<HTMLDivElement | null>(null);
  const hoverRef = useRef<string | null>(null);
  const teamRegion = useCallback((team: Team) => {
    if (REGIONEN.includes(team.region)) return team.region;
    // LAN: die Heimatregion des Teams, aus den gepflegten Profilen.
    const r = team.namen.map((n, k) => findeProfil(n, team.ids[k])?.region).find(Boolean);
    return r ?? '';
  }, [findeProfil]);

  const karten = useMemo<Karte[]>(() => {
    if (!prognose) return [];
    if (prognose.karten?.length) return prognose.karten;
    if (prognose.bildId) {
      return [{ id: 'eine', bildId: prognose.bildId, titel: prognose.kartenTitel ?? prognose.titel,
        spots: prognose.spots ?? [], aufSpot: prognose.aufSpot ?? {} }];
    }
    return [];
  }, [prognose]);
  const karte = karten[Math.min(kartenNr, Math.max(0, karten.length - 1))] ?? null;

  /* ------------------------------------------------------ Add a Duo */

  const [neuOffen, setNeuOffen] = useState(false);
  const [neuNamen, setNeuNamen] = useState<[string, string]>(['', '']);
  const [neuRegion, setNeuRegion] = useState('EU');
  const [treffer, setTreffer] = useState<Array<Array<{ epicId: string; anzeige: string; name: string }>>>([[], []]);
  const [neuGewaehlt, setNeuGewaehlt] = useState<Array<{ epicId: string; name: string } | null>>([null, null]);
  const [speichert, setSpeichert] = useState(false);

  const suche = useCallback((nr: 0 | 1, wert: string) => {
    setNeuNamen((alt) => (nr === 0 ? [wert, alt[1]] : [alt[0], wert]));
    setNeuGewaehlt((alt) => (nr === 0 ? [null, alt[1]] : [alt[0], null]));
    if (wert.trim().length < 2) { setTreffer((alt) => (nr === 0 ? [[], alt[1]] : [alt[0], []])); return; }
    fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(wert.trim())}`)
      .then((r) => r.json())
      .then((j) => setTreffer((alt) => (nr === 0 ? [j.spieler ?? [], alt[1]] : [alt[0], j.spieler ?? []])))
      .catch(() => {});
  }, []);

  async function duoSpeichern() {
    if (!prognose || !neuGewaehlt[0] || !neuGewaehlt[1]) return;
    const ids = [neuGewaehlt[0].epicId, neuGewaehlt[1].epicId];
    const team: Team = {
      key: ids.slice().sort().join('|'),
      namen: [neuGewaehlt[0].name, neuGewaehlt[1].name], ids,
      herkunft: [t('von Hand')], besterPlatz: 999, region: neuRegion,
    };
    setSpeichert(true);
    try {
      const r = await fetch('/api/prognosen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...prognose, manuell: [...(prognose.manuell ?? []).filter((m) => m.key !== team.key), team] }),
      });
      const j = await r.json();
      if (r.ok && j.prognose) {
        setPrognosen((alt) => alt.map((p) => (p.id === j.prognose.id ? j.prognose : p)));
        setNeuOffen(false); setNeuNamen(['', '']); setNeuGewaehlt([null, null]); setTreffer([[], []]);
      }
    } finally { setSpeichert(false); }
  }

  async function duoEntfernen(key: string) {
    if (!prognose) return;
    const r = await fetch('/api/prognosen', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...prognose, manuell: (prognose.manuell ?? []).filter((m) => m.key !== key) }),
    });
    const j = await r.json();
    if (r.ok && j.prognose) setPrognosen((alt) => alt.map((p) => (p.id === j.prognose.id ? j.prognose : p)));
  }

  /* ------------------------------------------------------ Abgeleitetes */

  const gruppen = useMemo(() => {
    // Duos nach Herkunft: der erste Spieltag, aus dem ein Team kommt.
    const karteG = new Map<string, Team[]>();
    for (const team of feld) {
      const titel = team.herkunft[0]?.split(' · ')[0] ?? '';
      (karteG.get(titel) ?? karteG.set(titel, []).get(titel)!).push(team);
    }
    return [...karteG.entries()];
  }, [feld]);

  const regionen = useMemo(() => {
    const z = new Map<string, Team[]>();
    for (const team of feld) {
      const r = teamRegion(team) || t('unbekannt');
      (z.get(r) ?? z.set(r, []).get(r)!).push(team);
    }
    return [...z.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [feld, teamRegion, t]);

  const nationen = useMemo(() => {
    const z = new Map<string, string[]>();
    let ohne = 0;
    for (const team of feld) {
      team.namen.forEach((n, k) => {
        const land = findeProfil(n, team.ids[k])?.land;
        if (!land) { ohne += 1; return; }
        (z.get(land.toUpperCase()) ?? z.set(land.toUpperCase(), []).get(land.toUpperCase())!).push(anzeigeName(n, team.ids[k]));
      });
    }
    return { liste: [...z.entries()].sort((a, b) => b[1].length - a[1].length), ohne };
  }, [feld, findeProfil, anzeigeName]);

  const zeilenFuer = useCallback((key: string, alleine: boolean): string[] => {
    const team = teamVon(key);
    if (!team) return [];
    const namen = team.namen.map((n, k) => anzeigeName(n, team.ids[k]));
    return alleine && namen.length > 1 ? namen : [namen.join(' ')];
  }, [teamVon, anzeigeName]);

  const schrift = useMemo(
    () => (karte ? einheitsGroesse(karte.spots, karte.aufSpot, zeilenFuer) : 1.2), [karte, zeilenFuer]);

  /* ------------------------------------------------------ Anzeige */

  if (!geladen) return <LadeSchirm />;

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500"><T>Prognosen</T></p>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
            {prognose ? prognose.titel : <T>Prognosen</T>}
          </h1>
        </div>
        {prognosen.length > 0 && (
          <select value={gewaehlt} onChange={(e) => { setGewaehlt(e.target.value); setKartenNr(0); }}
            className="ml-auto rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm text-slate-200">
            {prognosen.map((p) => (
              <option key={p.id} value={p.id}>{p.cupTitel} · {p.gruppe || p.titel}</option>
            ))}
          </select>
        )}
      </div>

      {!prognosen.length ? (
        <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-8 text-center text-sm text-slate-500">
          <T>Es ist noch keine Prognose veröffentlicht.</T>
        </p>
      ) : (
        <div className="flex gap-4">
          {/* Die Leiste links - schmal, einklappbar. */}
          <aside className={`shrink-0 self-start rounded-xl border border-zinc-800 bg-zinc-950/60 p-2 ${leisteOffen ? 'w-48' : 'w-14'}`}>
            {ABSCHNITTE.map(([wert, titel, pfad]) => (
              <button key={wert} onClick={() => setAbschnitt(wert)} title={t(titel)}
                className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  abschnitt === wert ? 'bg-sky-500/10 text-sky-400' : 'text-slate-400 hover:bg-zinc-900 hover:text-slate-200'}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
                  <path d={pfad} />
                </svg>
                {leisteOffen && <span className="font-semibold"><T>{titel}</T></span>}
              </button>
            ))}
            <button onClick={() => setLeisteOffen((o) => !o)}
              className="mt-2 flex w-full items-center justify-center rounded-lg py-1.5 text-slate-600 hover:text-slate-300"
              title={leisteOffen ? t('Leiste einklappen') : t('Leiste ausklappen')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden
                className={leisteOffen ? '' : 'rotate-180'}>
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          </aside>

          <section className="min-w-0 flex-1">
            {feldLaedt && !feld.length ? (
              <div className="h-64" />
            ) : abschnitt === 'duos' ? (
              <div className="space-y-4">
                {istAdmin && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setNeuOffen((o) => !o)}
                      className="rounded-lg border border-sky-500/60 px-3 py-1.5 text-xs font-semibold text-sky-400 hover:bg-sky-500/10">
                      + <T>Duo hinzufügen</T>
                    </button>
                    <span className="text-[11px] text-slate-600"><T>Nur du siehst diesen Knopf.</T></span>
                  </div>
                )}
                {istAdmin && neuOffen && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {([0, 1] as const).map((nr) => (
                        <div key={nr} className="relative">
                          <input value={neuNamen[nr]} onChange={(e) => suche(nr, e.target.value)}
                            placeholder={t('Spieler suchen …')}
                            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm" />
                          {neuGewaehlt[nr] && (
                            <p className="mt-1 text-[11px] text-emerald-400">{neuGewaehlt[nr]!.name}</p>
                          )}
                          {!neuGewaehlt[nr] && treffer[nr].length > 0 && (
                            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl">
                              {treffer[nr].map((s) => (
                                <button key={s.epicId} onClick={() => {
                                  setNeuGewaehlt((alt) => (nr === 0 ? [{ epicId: s.epicId, name: s.name }, alt[1]] : [alt[0], { epicId: s.epicId, name: s.name }]));
                                  setNeuNamen((alt) => (nr === 0 ? [s.anzeige, alt[1]] : [alt[0], s.anzeige]));
                                }} className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-900">
                                  {s.anzeige} <span className="text-slate-500">{s.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <select value={neuRegion} onChange={(e) => setNeuRegion(e.target.value)}
                        className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 py-1.5 text-xs">
                        {REGIONEN.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <button disabled={!neuGewaehlt[0] || !neuGewaehlt[1] || speichert} onClick={duoSpeichern}
                        className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
                        <T>Übernehmen</T>
                      </button>
                      <button onClick={() => setNeuOffen(false)} className="text-xs text-slate-500 hover:text-slate-300"><T>Abbrechen</T></button>
                    </div>
                  </div>
                )}

                {!feld.length && (
                  <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-8 text-center text-sm text-slate-500">
                    {feldHinweis || t('Kein Team im Feld.')}
                  </p>
                )}
                {gruppen.map(([titel, teams]) => (
                  <div key={titel} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60">
                    <p className="border-b border-zinc-800 px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      {titel}
                    </p>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4">
                      {teams.map((team) => {
                        const region = teamRegion(team);
                        const vonHand = team.herkunft[0] === t('von Hand') || team.besterPlatz === 999;
                        return (
                          <div key={team.key}
                            className="flex items-center gap-3 border-b border-r border-zinc-900 px-4 py-3">
                            <span className="flex flex-col gap-1">
                              {team.namen.map((n, k) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={k} src={flaggenPfad(findeProfil(n, team.ids[k])?.land)} alt=""
                                  className="h-5 w-5 rounded-full object-cover" />
                              ))}
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col leading-tight">
                              {team.namen.map((n, k) => (
                                <span key={k} className="truncate text-sm font-bold uppercase text-slate-100">
                                  {anzeigeName(n, team.ids[k])}
                                </span>
                              ))}
                            </span>
                            {region && (
                              <span className="shrink-0 rounded bg-zinc-800/80 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-slate-400">
                                {region}
                              </span>
                            )}
                            {istAdmin && vonHand && (
                              <button onClick={() => duoEntfernen(team.key)} title={t('entfernen')}
                                className="text-slate-600 hover:text-rose-400">×</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : abschnitt === 'karte' ? (
              <div className="space-y-3">
                {karten.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {karten.map((k, i) => (
                      <button key={k.id} onClick={() => setKartenNr(i)}
                        className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                          i === kartenNr ? 'border-sky-500 bg-sky-500/10 text-sky-400' : 'border-zinc-800 text-slate-400'}`}>
                        {k.titel}
                      </button>
                    ))}
                  </div>
                )}
                {!karte ? (
                  <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-8 text-center text-sm text-slate-500">
                    <T>Zu dieser Prognose ist noch keine Karte hinterlegt.</T>
                  </p>
                ) : (
                  <div ref={kartenFlaeche}
                    className={`${kartenSchrift.variable} relative mx-auto aspect-square w-full max-w-[860px] overflow-hidden rounded-xl border border-white/[0.06]`}
                    style={{ containerType: 'inline-size' }}
                    onMouseMove={(e) => {
                      const kasten = e.currentTarget.getBoundingClientRect();
                      const q = {
                        x: ((e.clientX - kasten.left) / kasten.width) * 100,
                        y: ((e.clientY - kasten.top) / kasten.height) * 100,
                      };
                      const drunter = [...karte.spots].reverse()
                        .find((sp) => imPolygon(q, sp.punkte))?.id ?? null;
                      hebeFormHervor(kartenFlaeche.current, hoverRef.current, drunter);
                      hoverRef.current = drunter;
                    }}
                    onMouseLeave={() => {
                      hebeFormHervor(kartenFlaeche.current, hoverRef.current, null);
                      hoverRef.current = null;
                    }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={t('Karte')} draggable={false} className="absolute inset-0 h-full w-full object-cover"
                      src={`/api/karten-bild?datei=1&id=${encodeURIComponent(karte.bildId)}`} />
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                      {karte.spots.map((sp) => {
                        const belegt = (karte.aufSpot[sp.id] ?? []).length;
                        // Farben wie beim Vorbild, Rand und Hover aus globals.css.
                        const f = formFarbe(belegt, belegt ? null : sp.farbe);
                        return (
                          <polygon key={sp.id} data-form={sp.id}
                            className={`karten-form${f.rot ? ' ist-rot' : ''}`}
                            points={sp.punkte.map((q) => `${q.x},${q.y}`).join(' ')}
                            fill={f.fuellung} stroke={f.rand} vectorEffect="non-scaling-stroke" />
                        );
                      })}
                    </svg>
                    {karte.spots.map((sp) => {
                      const keys = karte.aufSpot[sp.id] ?? [];
                      if (!keys.length) return null;
                      const r = rahmen(sp.punkte);
                      const anzahl = keys.length;
                      const mitteX = r.links + r.breite / 2;
                      // Ein Kasten in der Groesse der Form, darin die Teams mittig
                      // oder von Rand zu Rand - wie im Karten-Werkzeug.
                      return (
                        <div key={sp.id} data-form={sp.id}
                          className="karten-beschriftung pointer-events-none absolute z-10 flex flex-col items-center text-center"
                          style={{
                            left: `${r.links}%`, top: `${r.oben}%`, width: `${r.breite}%`, height: `${r.hoehe}%`,
                            justifyContent: anzahl === 1 ? 'center' : 'space-between',
                            paddingBlock: '0.45cqw',
                          }}>
                          {keys.map((k, i) => {
                            const texte = zeilenFuer(k, anzahl === 1);
                            if (!texte.length) return null;
                            const yProz = anzahl === 1
                              ? r.oben + r.hoehe / 2
                              : r.oben + r.hoehe * (0.1 + 0.8 * (i / (anzahl - 1)));
                            const spanne = sp.form === 'rechteck' ? null : spanneBei(sp.punkte, yProz);
                            const versatz = spanne && r.breite > 0 ? ((spanne.mitte - mitteX) / r.breite) * 100 : 0;
                            return (
                              <div key={k} className="relative" style={versatz ? { left: `${versatz}%` } : undefined}>
                                {texte.map((tx, z) => (
                                  <p key={z} className="karten-name" style={{ fontSize: `${schrift}cqw` }}>
                                    {tx}
                                  </p>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : abschnitt === 'leaderboard' ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                {!prognose?.plaetze.some(Boolean) ? (
                  <p className="py-6 text-center text-sm text-slate-500"><T>Die Reihenfolge ist noch nicht gesetzt.</T></p>
                ) : (
                  <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {/* Spaltenweise wie im Vorbild: 1 bis 17 links, dann weiter. */}
                    {(() => {
                      const n = prognose.plaetze.length;
                      const spalten = 3;
                      const jeSpalte = Math.ceil(n / spalten);
                      return Array.from({ length: spalten }, (_, sp) => (
                        <div key={sp} className="space-y-1.5">
                          {prognose.plaetze.slice(sp * jeSpalte, (sp + 1) * jeSpalte).map((key, j) => {
                            const i = sp * jeSpalte + j;
                            const team = teamVon(key);
                            return (
                        <div key={i} className="flex items-center gap-2">
                          <span className={`w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums ${
                            i === 0 ? 'text-amber-400' : i < 3 ? 'text-sky-400' : 'text-slate-500'}`}>
                            {platzWort(i + 1, sprache)}
                          </span>
                          <span className={`flex min-h-[38px] flex-1 items-center gap-2 rounded-lg border px-3 ${
                            i === 0 ? 'border-amber-400/60 bg-amber-400/5' : 'border-zinc-800 bg-zinc-900/40'}`}>
                            {team ? (
                              <>
                                <TeamFlagge groesse={18} laender={team.namen.map((n, k) => findeProfil(n, team.ids[k])?.land)} />
                                <span className="truncate text-xs font-bold uppercase text-slate-100">
                                  {team.namen.map((n, k) => anzeigeName(n, team.ids[k])).join(' · ')}
                                </span>
                              </>
                            ) : <span className="text-xs text-slate-700">&nbsp;</span>}
                          </span>
                        </div>
                      );
                          })}
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            ) : abschnitt === 'regionen' ? (
              <div className="flex flex-wrap items-start gap-3">
                {regionen.map(([region, teams]) => (
                  <div key={region} className="min-w-[180px] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60">
                    <p className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2 text-[11px]">
                      <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 font-semibold tracking-wider text-slate-300">{region}</span>
                      <span className="text-slate-500">{teams.length} ({Math.round((teams.length / Math.max(1, feld.length)) * 100)}%)</span>
                    </p>
                    {teams.map((team) => (
                      <div key={team.key} className="flex items-center gap-3 border-b border-zinc-900 px-4 py-2.5">
                        <TeamFlagge groesse={18} laender={team.namen.map((n, k) => findeProfil(n, team.ids[k])?.land)} />
                        <span className="flex flex-col leading-tight">
                          {team.namen.map((n, k) => (
                            <span key={k} className="text-xs font-bold uppercase text-slate-100">{anzeigeName(n, team.ids[k])}</span>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
                {!regionen.length && (
                  <p className="w-full rounded-xl border border-zinc-800 bg-zinc-950/60 p-8 text-center text-sm text-slate-500">{feldHinweis || t('Kein Team im Feld.')}</p>
                )}
              </div>
            ) : abschnitt === 'nationen' ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-start gap-3">
                  {nationen.liste.map(([land, spieler]) => (
                    <div key={land} className="min-w-[150px] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60">
                      <p className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2 text-[11px] font-semibold text-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={flaggenPfad(land)} alt="" className="h-4 w-4 rounded-full object-cover" />
                        {landName(land, sprache)}
                        <span className="ml-auto text-slate-500">{spieler.length}p</span>
                      </p>
                      {spieler.map((s, i) => (
                        <p key={i} className="px-4 py-1 text-center text-xs font-semibold uppercase text-slate-300">{s}</p>
                      ))}
                    </div>
                  ))}
                </div>
                {nationen.ohne > 0 && (
                  <p className="text-[11px] text-slate-600">
                    {nationen.ohne} <T>Spieler ohne hinterlegtes Land</T>
                  </p>
                )}
              </div>
            ) : (
              <div>
                {!preise ? (
                  <div className="h-40" />
                ) : !preise.geld.length ? (
                  <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-8 text-center text-sm text-slate-500">
                    <T>Zu diesem Spieltag veröffentlicht Epic keine Auszahlungstabelle.</T>
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    {preise.geld.filter((s) => s.art !== 'value').flatMap((s) => {
                      const von = s.von ?? s.schwelle;
                      const bis = s.schwelle;
                      return Array.from({ length: Math.max(1, bis - von + 1) }, (_, i) => von + i)
                        .map((platz) => ({ platz, betrag: s.betrag }));
                    }).map(({ platz, betrag }) => (
                      <div key={platz} className={`rounded-xl border px-3 py-4 text-center ${
                        platz === 1 ? 'border-amber-400/60 bg-amber-400/5' : 'border-zinc-800 bg-zinc-950/60'}`}>
                        <p className={`text-lg font-black ${platz === 1 ? 'text-amber-400' : 'text-slate-100'}`}>
                          {platz === 1 ? t('Sieger') : platzWort(platz, sprache)}
                        </p>
                        <p className="mt-1 text-sm font-semibold tabular-nums text-slate-400">
                          ${betrag.toLocaleString(sprache === 'de' ? 'de-DE' : 'en-US')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {preise && preise.geld.some((s) => s.art === 'value') && (
                  <p className="mt-3 text-[11px] text-slate-600"><T>Dieser Cup zahlt nach Punkten, nicht nach Platz.</T></p>
                )}
                {preise?.proPerson && <p className="mt-3 text-[11px] text-slate-600"><T>Beträge je Spieler.</T></p>}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
