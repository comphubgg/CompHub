import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Glas } from '../../../../teile/Glas';
import { useWer } from '../../../../teile/Anmeldung';
import KartenAnsicht, { kartenName, type KartenForm, type Punkt } from '../KartenAnsicht';
import { FehlerZeile, Laedt, SEITE, SeitenKopf, Suche, TeamFlagge, datumLang, useDaten } from '../teile';

/*
 * Die veroeffentlichten Turnierkarten (/maps der Seite, Ansicht fuer alle): ohne ?id die Liste (/api/turnier-karten?liste=1), mit ?id die Karte
 * (/api/turnier-karten?id=) samt Teamliste. Der Stand wandert mit (?nur=stand&seit= alle 20 s), wie auf der Seite. Bearbeitet wird im
 * Karten-Werkzeug auf thecomphub.com - der Admin bekommt dafuer einen Knopf, ebenso ein Pro, dessen Team auf der Karte steht.
 */

interface Spot { id: string; punkte: Punkt[]; teams: string[]; name?: string; farbe?: string | null }
interface Team { id: string; spieler: string[]; ids?: string[]; farbe?: string; laender?: Array<string | null> }
interface Karte { id: string; titel: string; cupTitel?: string; region?: string; windowId?: string; bildId?: string; bildTitel?: string; spots: Spot[]; teams: Team[]; geaendert: number; gesperrt?: boolean; spiele?: string; ersatz?: boolean }
interface ListenKarte { id: string; titel: string; cupTitel?: string; region: string | null; windowId: string | null; bildTitel?: string; teams: number; platziert: number; geaendert: number; datum: number | null; bild: string | null }

function Liste() {
  const [s] = useDaten<{ karten: ListenKarte[] }>('/api/turnier-karten?liste=1');
  const [q, setQ] = useState('');
  if (s.art === 'laedt') return <Laedt />;
  if (s.art !== 'ok') return <FehlerZeile text="The tournament maps could not be loaded." />;
  const karten = s.d.karten.filter((k) => !q || `${k.titel} ${k.cupTitel ?? ''} ${k.region ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-6">
      <SeitenKopf ueber="Maps" titel="Tournament maps" text="Every published drop map — live, as the admins place the teams." rechts={<Suche wert={q} setze={setQ} platz="Search a map …" />} />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {karten.map((k, i) => (
          <motion.div key={k.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 14) * 0.035 }} whileHover={{ y: -5 }}>
            <Link to={`/competitive/maps/view?id=${encodeURIComponent(k.id)}`} className="group block overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-xl transition hover:border-sky-400/40">
              <div className="relative aspect-video overflow-hidden bg-[#0a0e18]">
                {k.bild ? <img src={k.bild} alt="" loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                  : <div className="grid h-full place-items-center text-3xl font-black tracking-widest text-sky-400/30">MAP</div>}
                <div className="absolute inset-0 bg-gradient-to-t from-[#06080f] via-transparent to-transparent" />
                {k.region && <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white ring-1 ring-white/15">{k.region}</span>}
                <p className="absolute inset-x-4 bottom-3 line-clamp-2 text-lg font-extrabold leading-tight text-white">{k.titel.replace(/\s*·\s*/g, ' – ')}</p>
              </div>
              <div className="flex items-center gap-2 px-4 py-3 text-[11px] text-white/45">
                <span className="tabular-nums">{k.platziert}/{k.teams} placed</span>
                {k.bildTitel && <span className="truncate">· {k.bildTitel}</span>}
                <span className="ml-auto tabular-nums">{k.datum ? datumLang(k.datum) : ''}</span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default function TurnierKarte() {
  const [adresse] = useSearchParams();
  const id = adresse.get('id');
  const { wer } = useWer();
  const [k, setK] = useState<Karte | null>(null);
  const [fehler, setFehler] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!id) return undefined;
    let weg = false; let seit = 0;
    setK(null); setFehler('');
    fetch(`/api/turnier-karten?id=${encodeURIComponent(id)}`, { cache: 'no-store' }).then(async (r) => {
      const j = await r.json().catch(() => null);
      if (weg) return;
      if (!r.ok || !j?.spots) { setFehler(j?.error || 'Unknown map.'); return; }
      seit = j.geaendert ?? 0; setK(j);
    }).catch(() => { if (!weg) setFehler('The map could not be loaded.'); });
    // Der Stand wandert mit: nur, wenn sich etwas geaendert hat, kommt die ganze Belegung.
    const i = setInterval(() => {
      if (document.visibilityState !== 'visible' || !seit) return;
      fetch(`/api/turnier-karten?id=${encodeURIComponent(id)}&nur=stand&seit=${seit}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => {
        if (weg || !j || j.unveraendert || !j.spots) return;
        seit = j.geaendert ?? seit;
        setK((alt) => (alt ? { ...alt, ...j } : alt));
      }).catch(() => { /* naechster Takt */ });
    }, 20_000);
    return () => { weg = true; clearInterval(i); };
  }, [id]);

  const teamNach = useMemo(() => new Map((k?.teams ?? []).map((t) => [t.id, t])), [k]);
  const formen = useMemo<KartenForm[]>(() => (k?.spots ?? []).map((sp) => {
    const ts = sp.teams.map((t) => teamNach.get(t)).filter((t): t is Team => Boolean(t));
    const zeilen = ts.length > 1 ? ts.map((t) => t.spieler.join(' ')) : ts.flatMap((t) => t.spieler);
    return { punkte: sp.punkte, zeilen, teams: ts.length, farbe: sp.farbe, alle: ts.flatMap((t) => t.spieler), name: sp.name };
  }), [k, teamNach]);
  const spotVon = useMemo(() => {
    const m = new Map<string, string>();
    for (const sp of k?.spots ?? []) for (const t of sp.teams) m.set(t, sp.name?.trim() || '');
    return m;
  }, [k]);
  const solo = (k?.teams ?? []).every((t) => t.spieler.length <= 1);
  const meinTeam = wer?.epicId ? (k?.teams ?? []).find((t) => (t.ids ?? []).includes(wer.epicId!)) : undefined;

  if (!id) return <Liste />;
  if (fehler) return <FehlerZeile text={fehler} />;
  if (!k) return <Laedt text="Loading the map …" />;
  const teams = (k.teams ?? []).filter((t) => !q || t.spieler.some((s) => s.toLowerCase().includes(q.toLowerCase())));
  const bild = k.bildId ? `/bilder/karten/${encodeURIComponent(k.bildId)}.png` : null;

  return (
    <div className="space-y-6">
      <Link to="/competitive/maps/view" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 py-1.5 text-xs font-semibold text-white/70 transition hover:border-sky-400/50 hover:text-white">← Tournament maps</Link>
      <SeitenKopf ueber={k.cupTitel || 'Tournament map'} titel={k.titel.replace(/\s*·\s*/g, ' – ')}
        text={<span className="flex flex-wrap items-center gap-2 text-sm">
          {k.region && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-white/80">{k.region}</span>}
          {k.bildTitel && <span>{k.bildTitel}</span>}
          {k.spiele && <span>· Games {k.spiele}</span>}
          <span>· {k.spots.filter((s) => s.teams.length).length} spots, {k.teams.length} {solo ? 'players' : 'teams'}</span>
          {k.gesperrt && <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-bold text-amber-300">Locked</span>}
        </span>}
        rechts={<>
          {(wer?.isAdmin || (meinTeam && (wer?.rolle === 'pro' || wer?.rolle === 'manager'))) && (
            <a href={`${SEITE}/maps?id=${encodeURIComponent(k.id)}`} target="_blank" rel="noreferrer" className="rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-bold text-[#06080f] transition hover:bg-amber-300">
              {wer?.isAdmin ? 'Edit in the map tool ↗' : 'Move my team ↗'}
            </a>
          )}
        </>} />
      {k.ersatz && <FehlerZeile text="This is the last saved copy — the live store is not answering right now." />}
      <div className="grid gap-5 lg:grid-cols-[minmax(280px,1fr)_minmax(0,1.7fr)] lg:items-start">
        <Glas className="overflow-hidden lg:sticky lg:top-32">
          <div className="flex items-center gap-3 border-b border-white/5 p-3">
            <h2 className="font-bold text-white">{solo ? 'Players' : 'Teams'}</h2>
            <Suche wert={q} setze={setQ} platz="Search …" className="ml-auto sm:w-44" />
          </div>
          <ul className="max-h-[72vh] divide-y divide-white/[0.04] overflow-y-auto">
            {teams.map((t) => (
              <li key={t.id} className={`flex items-center gap-3 px-3 py-2 ${t === meinTeam ? 'bg-sky-400/10' : ''}`}>
                <TeamFlagge groesse={t.spieler.length > 1 ? 26 : 20} laender={t.laender ?? t.spieler.map(() => null)} />
                <span className="flex min-w-0 flex-1 flex-col text-[11px] font-bold uppercase leading-[1.3] text-white">{t.spieler.map((s, i) => <span key={i} className="truncate">{kartenName(s)}</span>)}</span>
                <span className="max-w-[40%] truncate text-right text-[11px] text-white/45">{spotVon.has(t.id) ? (spotVon.get(t.id) || 'placed') : <span className="text-white/25">not placed</span>}</span>
              </li>
            ))}
          </ul>
        </Glas>
        <KartenAnsicht formen={formen} bild={bild} rotAb={2} titel={k.titel} />
      </div>
    </div>
  );
}
