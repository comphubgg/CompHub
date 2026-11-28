import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Glas } from '../../../teile/Glas';
import { saisonKarte } from '../port/lib/bildAdressen';
import { Laedt, WerkzeugKopf, feld } from '../teile';

/*
 * Loot-Routen der Pros im Hub (app/admin/loot-routen auf main, derselbe Ablauf und dieselben Schnittstellen): Grundlage sind die voll ausgelesenen
 * Server-Replays (/api/replay = Liste der Spieltage, /api/replay?match= = ein Game): Laufweg (orte, mit Hoehe), jedes Aufheben (loot) und die
 * geoeffneten Kisten (truhen). Cup-Spieltag suchen -> Game -> Spieler; "Alle Games" sucht denselben Epic-Konto-Spieler in den anderen Games des
 * Spieltags und legt die Routen uebereinander. 2D (SVG auf dem Kartenbild, auf die Routen gezoomt) und 3D (three.js, mit der Maus drehbar).
 * Nur lesende Abrufe.
 */

interface MatchKurz { id: string; nr: number; spieler?: number }
interface Tag { windowId: string; eventId?: string; titel: string; region: string; season: string; matches: MatchKurz[] }
interface Spieler { id: number; epic?: string; name?: string; bot?: boolean; team?: number; platz?: number; kills?: number; teamKills?: number }
interface MatchDaten {
  spieler: Spieler[]; busAb?: number; figuren?: Array<{ id: number; t: number }>;
  orte?: Record<string, number[][]>; loot?: number[][]; lootNamen?: string[]; truhen?: number[][];
  laender?: Record<string, string>;
}
interface Punkt { t: number; x: number; y: number; z: number | null; art: 'ort' | 'item' | 'truhe' | 'munition'; text?: string; nr?: number }
interface Route { matchId: string; nr: number; spieler: Spieler; start: number; punkte: Punkt[]; farbe: string }

const SPANNE = 135_000;
const zuKarte = (v: number) => ((v + SPANNE) / (2 * SPANNE)) * 1000;
const FARBEN = ['#38bdf8', '#f59e0b', '#a78bfa', '#34d399', '#f472b6', '#fb7185', '#facc15', '#60a5fa', '#4ade80', '#e879f9', '#fca5a5', '#93c5fd'];
const DAUERN = [60, 120, 180, 240, 300, 450, 600];
const uhr = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const ohneVorsatz = (n?: string) => String(n ?? '?').replace(/^\s*\[[^\]]*\]\s*/, '');

/** Lesbarer Name eines Gegenstands aus Epics Kennung (WID_Shotgun_Pump_FirePetal_Athena_R -> Shotgun Pump FirePetal). */
function itemName(roh: string): string {
  return roh.replace(/^(WID|AGID|Athena|ID)_/i, '').replace(/_(Athena|C|UC|R|VR|SR|L|M|SR_Ore_T\d+|Ore_T\d+|T\d+)(?=_|$)/gi, '').replace(/_/g, ' ').trim() || roh;
}
/** Seltenheit aus der Endung - die Farbe der Punkte. */
function seltenheit(roh: string): string {
  if (/_(L|SR)(_|$)/i.test(roh)) return '#f59e0b';
  if (/_VR(_|$)/i.test(roh)) return '#a855f7';
  if (/_R(_|$)/i.test(roh)) return '#3b82f6';
  if (/_UC(_|$)/i.test(roh)) return '#22c55e';
  if (/^WID_/i.test(roh)) return '#cbd5e1';
  if (/Ammo/i.test(roh)) return '#64748b';
  if (/WoodItem|StoneItem|MetalItem/i.test(roh)) return '#92400e';
  return '#e2e8f0';
}

function routeBauen(d: MatchDaten, sp: Spieler, matchId: string, nr: number, dauer: number, farbe: string): Route | null {
  const id = sp.id;
  const bus = d.busAb ?? 0;
  const absprung = (d.figuren ?? []).filter((f) => f.id === id && f.t >= bus).map((f) => f.t).sort((a, b) => a - b)[0]
    ?? (d.orte?.[id] ?? []).find((o) => o[0] >= bus)?.[0];
  if (absprung === undefined) return null;
  const ende = absprung + dauer;
  const punkte: Punkt[] = [];
  for (const o of d.orte?.[id] ?? []) if (o[0] >= absprung && o[0] <= ende) punkte.push({ t: o[0], x: o[1], y: o[2], z: o[3] ?? null, art: 'ort' });
  for (const l of d.loot ?? []) {
    if (l[1] !== id || l[5] !== 1 || l[0] < absprung || l[0] > ende) continue;
    punkte.push({ t: l[0], x: l[3], y: l[4], z: l[6] ?? null, art: 'item', text: d.lootNamen?.[l[2]] ?? '?' });
  }
  let n = 0;
  // Art 2 ist Boden-Loot - die Gegenstaende stehen schon als Punkte da.
  for (const k of (d.truhen ?? []).filter((k) => k[5] === id && k[4] !== 2 && k[0] >= absprung && k[0] <= ende).sort((a, b) => a[0] - b[0])) {
    punkte.push({ t: k[0], x: k[1], y: k[2], z: k[3] ?? null, art: k[4] === 1 ? 'munition' : 'truhe', nr: k[4] === 1 ? undefined : ++n });
  }
  punkte.sort((a, b) => a.t - b.t);
  return { matchId, nr, spieler: sp, start: absprung, punkte, farbe };
}

function kennzahlen(r: Route) {
  const truhen = r.punkte.filter((p) => p.art === 'truhe');
  const bis = (k: number) => (truhen[k - 1] ? truhen[k - 1].t - r.start : null);
  const letzte = r.punkte.length ? r.punkte[r.punkte.length - 1].t - r.start : 0;
  return {
    truhen: truhen.length, munition: r.punkte.filter((p) => p.art === 'munition').length, items: r.punkte.filter((p) => p.art === 'item').length,
    bis1: bis(1), bis3: bis(3), bis5: bis(5), jeMinute: letzte > 0 ? (truhen.length / letzte) * 60 : 0,
  };
}

/** Die Karte mit allen Routen, auf die Routen gezoomt. */
function Karte2D({ routen, bild, zeit }: { routen: Route[]; bild: string; zeit: number }) {
  const alle = routen.flatMap((r) => r.punkte);
  if (!alle.length) return <div className="grid aspect-square place-items-center rounded-2xl border border-white/10 bg-black/30 text-sm text-white/45">No points in this time range.</div>;
  const xs = alle.map((p) => zuKarte(p.x)), ys = alle.map((p) => zuKarte(p.y));
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const seite = Math.max(x1 - x0, y1 - y0, 12) * 1.25, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const s = seite / 100; // Strichstaerken relativ zum Ausschnitt
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0b1a2a]">
      <svg viewBox={`${cx - seite / 2} ${cy - seite / 2} ${seite} ${seite}`} className="absolute inset-0 h-full w-full">
        <image href={bild} x={0} y={0} width={1000} height={1000} preserveAspectRatio="none" />
        <rect x={cx - seite / 2} y={cy - seite / 2} width={seite} height={seite} fill="#020617" fillOpacity={0.25} />
        {routen.map((r) => {
          const sicht = r.punkte.filter((p) => p.t - r.start <= zeit);
          const linie = sicht.map((p) => `${zuKarte(p.x)},${zuKarte(p.y)}`).join(' ');
          return (
            <g key={r.matchId + r.spieler.id}>
              <polyline points={linie} fill="none" stroke="#000" strokeOpacity={0.6} strokeWidth={s * 1.1} strokeLinejoin="round" strokeLinecap="round" />
              <polyline points={linie} fill="none" stroke={r.farbe} strokeWidth={s * 0.55} strokeLinejoin="round" strokeLinecap="round" />
              {sicht.filter((p) => p.art === 'item').map((p, i) => (
                <circle key={'i' + i} cx={zuKarte(p.x)} cy={zuKarte(p.y)} r={s * 0.55} fill={seltenheit(p.text ?? '')} stroke="#000" strokeWidth={s * 0.18}><title>{`${uhr(p.t - r.start)} ${itemName(p.text ?? '')}`}</title></circle>
              ))}
              {sicht.filter((p) => p.art === 'munition').map((p, i) => (
                <rect key={'m' + i} x={zuKarte(p.x) - s * 0.8} y={zuKarte(p.y) - s * 0.55} width={s * 1.6} height={s * 1.1} rx={s * 0.2} fill="#475569" stroke="#000" strokeWidth={s * 0.18}><title>{`${uhr(p.t - r.start)} Ammo box`}</title></rect>
              ))}
              {sicht.filter((p) => p.art === 'truhe').map((p) => (
                <g key={'t' + p.nr}>
                  <circle cx={zuKarte(p.x)} cy={zuKarte(p.y)} r={s * 1.5} fill="#facc15" stroke="#000" strokeWidth={s * 0.25} />
                  <text x={zuKarte(p.x)} y={zuKarte(p.y)} textAnchor="middle" dominantBaseline="central" fontSize={s * 1.7} fontWeight={800} fill="#000">{p.nr}</text>
                  <title>{`${uhr(p.t - r.start)} Chest ${p.nr}`}</title>
                </g>
              ))}
              {sicht[0] && <circle cx={zuKarte(sicht[0].x)} cy={zuKarte(sicht[0].y)} r={s * 1.1} fill="#fff" stroke={r.farbe} strokeWidth={s * 0.5}><title>Landing</title></circle>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Dieselben Routen in 3D: Kartenausschnitt als Boden, Route mit echter Hoehe, Truhen als goldene Kisten; mit der Maus drehbar. */
function Karte3D({ routen, bild, zeit }: { routen: Route[]; bild: string; zeit: number }) {
  const ort = useRef<HTMLDivElement>(null);
  const zeitRef = useRef(zeit); zeitRef.current = zeit;
  const [fehler, setFehler] = useState('');
  useEffect(() => {
    const el = ort.current; if (!el || !routen.length) return;
    let aus = false; let aufraeumen = () => {};
    (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      if (aus) return;
      const alle = routen.flatMap((r) => r.punkte);
      if (!alle.length) return;
      const xs = alle.map((p) => p.x), ys = alle.map((p) => p.y), zs = alle.map((p) => p.z).filter((z): z is number => z !== null);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const seite = Math.max(x1 - x0, y1 - y0, 2000) * 1.3, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const zBoden = zs.length ? Math.min(...zs) - 150 : 0;
      const M = 100; // Welt in Zentimetern -> Szene in Metern
      const B = el.clientWidth, H = el.clientHeight;
      let renderer: import('three').WebGLRenderer;
      try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch { setFehler('This browser cannot show 3D (WebGL is off).'); return; }
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(B, H);
      renderer.outputColorSpace = THREE.SRGBColorSpace; el.appendChild(renderer.domElement);
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05080e);
      const cam = new THREE.PerspectiveCamera(45, B / H, 1, 20000);
      cam.position.set(0, seite / M * 0.7, seite / M * 0.75);
      const ctl = new OrbitControls(cam, renderer.domElement); ctl.enableDamping = true; ctl.target.set(0, 0, 0);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 2.2));
      const sonne = new THREE.DirectionalLight(0xffffff, 1.5); sonne.position.set(50, 120, 60); scene.add(sonne);
      // Boden: der Ausschnitt des Kartenbilds
      const img = new Image(); img.crossOrigin = 'anonymous'; img.src = bild;
      await new Promise((ok) => { img.onload = ok; img.onerror = ok; });
      if (aus) { renderer.dispose(); renderer.domElement.remove(); return; }
      const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const g = c.getContext('2d');
      if (g && img.width) { const f = img.width / 1000; g.drawImage(img, zuKarte(cx - seite / 2) * f, zuKarte(cy - seite / 2) * f, (seite / (2 * SPANNE)) * 1000 * f, (seite / (2 * SPANNE)) * 1000 * f, 0, 0, 1024, 1024); }
      const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
      const boden = new THREE.Mesh(new THREE.PlaneGeometry(seite / M, seite / M), new THREE.MeshStandardMaterial({ map: tx, roughness: 1 }));
      boden.rotation.x = -Math.PI / 2; scene.add(boden);
      const P = (p: Punkt) => new THREE.Vector3((p.x - cx) / M, ((p.z ?? zBoden + 150) - zBoden) / M, (p.y - cy) / M);
      const gruppen = routen.map((r) => {
        const gr = new THREE.Group(); scene.add(gr);
        const farbe = new THREE.Color(r.farbe);
        const pfad = r.punkte.map(P);
        if (pfad.length >= 2) {
          const kurve = new THREE.CatmullRomCurve3(pfad, false, 'centripetal');
          gr.add(new THREE.Mesh(new THREE.TubeGeometry(kurve, Math.max(64, pfad.length * 8), 0.35, 8, false), new THREE.MeshStandardMaterial({ color: farbe, emissive: farbe, emissiveIntensity: 0.35 })));
        }
        const teile: Array<{ t: number; o: import('three').Object3D }> = [];
        for (const p of r.punkte) {
          if (p.art === 'ort') continue;
          const v = P(p);
          const stiel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, Math.max(0.01, v.y), 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
          stiel.position.set(v.x, v.y / 2, v.z); gr.add(stiel);
          const o = p.art === 'truhe'
            ? new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x7a5a00, emissiveIntensity: 0.4 }))
            : p.art === 'munition'
              ? new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), new THREE.MeshStandardMaterial({ color: 0x64748b }))
              : new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), new THREE.MeshStandardMaterial({ color: new THREE.Color(seltenheit(p.text ?? '')) }));
          o.position.copy(v).add(new THREE.Vector3(0, p.art === 'item' ? 0.5 : 0.7, 0)); gr.add(o); teile.push({ t: p.t - r.start, o });
        }
        return { teile };
      });
      let lauf = 0;
      const schleife = () => {
        if (aus) return;
        for (const g2 of gruppen) for (const t of g2.teile) t.o.visible = t.t <= zeitRef.current;
        ctl.update(); renderer.render(scene, cam); lauf = requestAnimationFrame(schleife);
      };
      schleife();
      const groesse = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
      window.addEventListener('resize', groesse);
      aufraeumen = () => { cancelAnimationFrame(lauf); window.removeEventListener('resize', groesse); ctl.dispose(); renderer.dispose(); renderer.domElement.remove(); };
    })();
    return () => { aus = true; aufraeumen(); };
  }, [routen, bild]);
  return (
    <div ref={ort} className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
      {fehler && <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-amber-200">{fehler}</p>}
      <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/60 backdrop-blur">Drag to rotate · scroll to zoom · right-drag to pan</span>
    </div>
  );
}

const reiter = (an: boolean) => `relative rounded-full px-3.5 py-1 text-xs font-bold transition ${an ? 'text-[#06080f]' : 'text-white/60 hover:text-white'}`;

export default function LootRouten({ klassisch }: { klassisch?: () => void }) {
  const [tage, setTage] = useState<Tag[] | null>(null);
  const [tageFehler, setTageFehler] = useState(false);
  const [suche, setSuche] = useState('');
  const [tag, setTag] = useState<Tag | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [daten, setDaten] = useState<Record<string, MatchDaten>>({});
  const [spielerId, setSpielerId] = useState<number | null>(null);
  const [spielerSuche, setSpielerSuche] = useState('');
  const [alleGames, setAlleGames] = useState(false);
  const [dauer, setDauer] = useState(180);
  const [zeit, setZeit] = useState(180);
  const [ansicht, setAnsicht] = useState<'2d' | '3d'>('2d');
  const [lade, setLade] = useState('');

  useEffect(() => {
    fetch('/api/replay').then((r) => r.json()).then((j) => setTage(Array.isArray(j) ? j : j?.tage ?? [])).catch(() => { setTage([]); setTageFehler(true); });
  }, []);
  useEffect(() => { setZeit(dauer); }, [dauer]);

  const holeMatch = async (id: string) => {
    if (daten[id]) return daten[id];
    const j = await (await fetch(`/api/replay?match=${id}`)).json() as MatchDaten;
    setDaten((d) => ({ ...d, [id]: j }));
    return j;
  };
  useEffect(() => { if (matchId) { setLade('Loading game …'); holeMatch(matchId).catch(() => setLade('This game could not be loaded.')).then(() => setLade('')); } }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const aktuell = matchId ? daten[matchId] : null;
  const gewaehlt = aktuell?.spieler.find((s) => s.id === spielerId) ?? null;

  // Alle Games: denselben Spieler (Epic-Konto) in den anderen Games des Spieltags suchen.
  useEffect(() => {
    if (!alleGames || !tag || !gewaehlt?.epic) return;
    let aus = false;
    (async () => {
      const offen = tag.matches.filter((m) => !daten[m.id]);
      for (let i = 0; i < offen.length && !aus; i += 4) {
        setLade(`Searching the games … ${Math.min(i + 4, offen.length)} / ${offen.length}`);
        await Promise.all(offen.slice(i, i + 4).map((m) => holeMatch(m.id).catch(() => null)));
      }
      if (!aus) setLade('');
    })();
    return () => { aus = true; };
  }, [alleGames, tag, gewaehlt?.epic]); // eslint-disable-line react-hooks/exhaustive-deps

  const routen = useMemo(() => {
    if (!tag || !gewaehlt) return [];
    const liste: Route[] = [];
    const games = alleGames ? tag.matches : tag.matches.filter((m) => m.id === matchId);
    games.forEach((m) => {
      const d = daten[m.id]; if (!d) return;
      const sp = gewaehlt.epic ? d.spieler.find((s) => s.epic === gewaehlt.epic) : d.spieler.find((s) => s.id === gewaehlt.id);
      if (!sp) return;
      const r = routeBauen(d, sp, m.id, m.nr, dauer, FARBEN[liste.length % FARBEN.length]);
      if (r) liste.push(r);
    });
    return liste;
  }, [tag, gewaehlt, alleGames, matchId, daten, dauer]);

  const bild = saisonKarte(tag?.windowId);
  const gefiltert = (tage ?? []).filter((t) => !suche || `${t.titel} ${t.windowId} ${t.region}`.toLowerCase().includes(suche.toLowerCase())).slice(0, 40);
  const ohneTruhenDaten = routen.length > 0 && routen.every((r) => !(daten[r.matchId]?.truhen));
  const spielerListe = (aktuell?.spieler ?? []).filter((s) => !s.bot && (!spielerSuche || ohneVorsatz(s.name).toLowerCase().includes(spielerSuche.toLowerCase())))
    .sort((a, b) => (a.platz ?? 999) - (b.platz ?? 999));
  const land = (s: Spieler) => (s.epic ? aktuell?.laender?.[s.epic] : undefined);

  return (
    <>
      <WerkzeugKopf ueber="Content" titel="Loot routes" klassisch={klassisch}
        text="Path from the bus jump, opened chests (numbered) and ammo boxes, picked-up items in their rarity colour – from the server replays. Chests are recognised by picking up chest loot (a weapon plus more pieces = chest, only ammo = ammo box); Epic does not store the location of a chest itself." />

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Glas className="p-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-akz">1 · Cup match day</p>
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search cup …" className={`${feld} w-full`} />
            <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
              {tage === null && <p className="p-2 text-xs text-white/45">Loading cups …</p>}
              {tageFehler && <p className="p-2 text-xs text-amber-200">The replay list could not be loaded.</p>}
              {tage && !tageFehler && !gefiltert.length && <p className="p-2 text-xs text-white/45">No cup matches.</p>}
              {gefiltert.map((t, i) => (
                <motion.button key={t.windowId} type="button" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 15) * 0.02 }}
                  onClick={() => { setTag(t); setMatchId(null); setSpielerId(null); setAlleGames(false); }}
                  className={`block w-full rounded-xl border px-3 py-2 text-left text-xs transition ${tag?.windowId === t.windowId ? 'border-akz/50 bg-akz/10 text-white' : 'border-transparent text-white/70 hover:border-white/10 hover:bg-white/[0.04]'}`}>
                  <span className="font-bold">{t.titel}</span>
                  <span className="mt-0.5 block text-[11px] text-white/40">{t.region} · {t.matches.length} games · <span className="font-mono">{t.windowId}</span></span>
                </motion.button>
              ))}
            </div>
          </Glas>

          <AnimatePresence>
            {tag && (
              <Glas key="game" className="p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-akz">2 · Game</p>
                <div className="flex flex-wrap gap-1.5">
                  {tag.matches.map((m) => (
                    <button key={m.id} type="button" onClick={() => setMatchId(m.id)} title={m.spieler ? `${m.spieler} players` : undefined}
                      className={`h-8 min-w-[2.25rem] rounded-lg px-2.5 text-xs font-bold tabular-nums transition ${matchId === m.id ? 'bg-akz text-[#06080f]' : 'border border-white/10 bg-white/[0.04] text-white/75 hover:border-akz/50 hover:text-white'}`}>{m.nr}</button>
                  ))}
                </div>
              </Glas>
            )}
            {aktuell && (
              <Glas key="spieler" className="p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-akz">3 · Player</p>
                <input value={spielerSuche} onChange={(e) => setSpielerSuche(e.target.value)} placeholder="Filter players …" className={`${feld} mb-2 w-full py-1.5 text-xs`} />
                <div className="max-h-80 space-y-0.5 overflow-y-auto pr-1">
                  {spielerListe.map((s) => (
                    <button key={s.id} type="button" onClick={() => setSpielerId(s.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${spielerId === s.id ? 'bg-akz/15 text-white ring-1 ring-akz/40' : 'text-white/70 hover:bg-white/[0.05] hover:text-white'}`}>
                      <span className="w-8 shrink-0 tabular-nums text-white/35">#{s.platz ?? '–'}</span>
                      {land(s) && <img src={`/flags/${land(s)!.toLowerCase()}.png`} alt="" className="h-3 w-4 shrink-0 rounded-[2px] object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                      <span className="min-w-0 flex-1 truncate font-medium">{ohneVorsatz(s.name)}</span>
                      {!!s.kills && <span className="shrink-0 text-[10px] text-white/35">{s.kills} {s.kills === 1 ? "elim" : "elims"}</span>}
                    </button>
                  ))}
                </div>
                <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/75">
                  <input type="checkbox" checked={alleGames} onChange={(e) => setAlleGames(e.target.checked)} className="accent-akz" />
                  All games of this player on the match day
                </label>
              </Glas>
            )}
          </AnimatePresence>
        </aside>

        <section className="min-w-0">
          <Glas className="mb-4 flex flex-wrap items-center gap-4 px-4 py-3">
            <div className="flex rounded-full border border-white/10 bg-black/30 p-1">
              {(['2d', '3d'] as const).map((a) => (
                <button key={a} type="button" onClick={() => setAnsicht(a)} className={reiter(ansicht === a)}>
                  {ansicht === a && <motion.span layoutId="loot-ansicht" className="absolute inset-0 rounded-full bg-akz" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                  <span className="relative">{a.toUpperCase()}</span>
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-white/55">Duration from the jump
              <select value={dauer} onChange={(e) => setDauer(Number(e.target.value))} className={`${feld} py-1 text-xs`}>
                {DAUERN.map((s) => <option key={s} value={s}>{uhr(s)}</option>)}
              </select>
            </label>
            <label className="flex min-w-[220px] flex-1 items-center gap-3 text-xs text-white/55">Time
              <input type="range" min={0} max={dauer} value={zeit} onChange={(e) => setZeit(Number(e.target.value))} className="flex-1 accent-akz" />
              <span className="w-10 font-bold tabular-nums text-white">{uhr(zeit)}</span>
            </label>
            {lade && <span className="flex items-center gap-2 text-xs text-akz"><span className="h-3 w-3 animate-spin rounded-full border-2 border-white/10 border-t-akz" />{lade}</span>}
          </Glas>

          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="min-w-0">
              {!gewaehlt && (lade && matchId ? <Glas className="aspect-square"><Laedt text={lade} /></Glas> : (
                <div className="grid aspect-square place-items-center rounded-3xl border border-dashed border-white/15 bg-white/[0.02] text-center text-sm text-white/45">
                  <div><p className="text-3xl">🗺️</p><p className="mt-2">Pick a cup, a game and a player.</p></div>
                </div>
              ))}
              {gewaehlt && (ansicht === '2d' ? <Karte2D routen={routen} bild={bild} zeit={zeit} /> : <Karte3D routen={routen} bild={bild} zeit={zeit} />)}
              {ohneTruhenDaten && <p className="mt-2 text-xs text-amber-200">This game was read before 10 Nov 2026 – chests and heights come once it is read again. Path and items are already there.</p>}
              <Legende />
            </div>

            <div className="min-w-0 space-y-4">
              {routen.length > 0 && (
                <Glas className="overflow-x-auto p-1">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[10px] uppercase tracking-wider text-white/40">
                      <tr><th className="px-3 py-2">Game</th><th>Chests</th><th>Ammo</th><th>Items</th><th>1st</th><th>3rd</th><th>5th</th><th className="pr-3">/min</th></tr>
                    </thead>
                    <tbody>
                      {routen.map((r) => { const k = kennzahlen(r); return (
                        <tr key={r.matchId} className="border-t border-white/5 text-white/80">
                          <td className="px-3 py-2 font-bold"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.farbe }} />{r.nr}</td>
                          <td className="font-extrabold text-yellow-300">{k.truhen}</td><td>{k.munition}</td><td>{k.items}</td>
                          <td className="tabular-nums">{k.bis1 === null ? '–' : uhr(k.bis1)}</td><td className="tabular-nums">{k.bis3 === null ? '–' : uhr(k.bis3)}</td>
                          <td className="tabular-nums">{k.bis5 === null ? '–' : uhr(k.bis5)}</td><td className="pr-3 tabular-nums">{k.jeMinute.toFixed(1)}</td>
                        </tr>); })}
                    </tbody>
                  </table>
                  <p className="px-3 pb-2 pt-1 text-[10px] text-white/35">{ohneVorsatz(routen[0].spieler.name)} · 1st / 3rd / 5th = time from the jump to that chest</p>
                </Glas>
              )}
              {routen.length === 1 && (
                <Glas className="p-4">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Timeline</p>
                  <ol className="max-h-[640px] space-y-1 overflow-y-auto pr-1 text-xs">
                    {routen[0].punkte.filter((p) => p.art !== 'ort').map((p, i) => {
                      const sichtbar = p.t - routen[0].start <= zeit;
                      return (
                        <li key={i} className={`flex items-center gap-2 rounded-lg px-2 py-1 transition ${sichtbar ? '' : 'opacity-35'}`}>
                          <span className="w-10 shrink-0 tabular-nums text-white/40">{uhr(p.t - routen[0].start)}</span>
                          {p.art === 'truhe' ? <span className="font-bold text-yellow-300">Chest {p.nr}</span>
                            : p.art === 'munition' ? <span className="text-white/50">Ammo box</span>
                              : <span className="flex items-center gap-1.5" style={{ color: seltenheit(p.text ?? '') }}><span className="h-2 w-2 rounded-full" style={{ background: seltenheit(p.text ?? '') }} />{itemName(p.text ?? '')}</span>}
                        </li>
                      );
                    })}
                  </ol>
                </Glas>
              )}
              {gewaehlt && !routen.length && !lade && <Glas className="p-5 text-sm text-white/50">No jump from the bus found for this player.</Glas>}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function Legende() {
  const reihe: Array<[string, string, 'kreis' | 'kiste' | 'truhe']> = [
    ['Chest (numbered)', '#facc15', 'truhe'], ['Ammo box', '#475569', 'kiste'], ['Legendary', '#f59e0b', 'kreis'], ['Epic', '#a855f7', 'kreis'],
    ['Rare', '#3b82f6', 'kreis'], ['Uncommon', '#22c55e', 'kreis'], ['Common weapon', '#cbd5e1', 'kreis'], ['Materials', '#92400e', 'kreis'],
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-white/50">
      {reihe.map(([t, f, a]) => (
        <span key={t} className="flex items-center gap-1.5">
          <span className={a === 'kiste' ? 'h-2 w-3 rounded-[2px]' : a === 'truhe' ? 'h-3 w-3 rounded-full ring-1 ring-black' : 'h-2 w-2 rounded-full'} style={{ background: f }} />{t}
        </span>
      ))}
    </div>
  );
}
