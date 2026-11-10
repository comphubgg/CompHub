'use client';

/*
 * Loot-Routen der Pros (Betreiber, 10.11.2026: "einfach mir pros loot Routen von cups ... erstmal als Admin ... alles 11 games oder einzeln ... wenn moeglich auch
 * wirklich 3D"). Grundlage sind die voll ausgelesenen Server-Replays (/api/replay?match=...): Laufweg (orte, mit Hoehe seit 10.11.2026), jedes Aufheben (loot)
 * und die geoeffneten Kisten (truhen - Ort aus dem herausgeworfenen Loot, Oeffner = wer daneben als Erster aufhob).
 *
 * Ablauf: Cup-Spieltag suchen -> Game waehlen -> Spieler waehlen. "Alle Games" sucht denselben Spieler (Epic-Konto) in den anderen Games des Spieltags und
 * legt die Routen uebereinander. Die Route laeuft vom Absprung aus dem Bus bis X Sekunden danach.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { saisonKarte } from '@/lib/bildAdressen';

interface MatchKurz { id: string; nr: number; spieler?: number }
interface Tag { windowId: string; eventId?: string; titel: string; region: string; season: string; matches: MatchKurz[] }
interface Spieler { id: number; epic?: string; name?: string; bot?: boolean; team?: number; platz?: number; kills?: number }
interface MatchDaten {
  spieler: Spieler[]; busAb?: number; figuren?: Array<{ id: number; t: number }>;
  orte?: Record<string, number[][]>; loot?: number[][]; lootNamen?: string[]; truhen?: number[][];
  info?: { windowId?: string };
}
interface Punkt { t: number; x: number; y: number; z: number | null; art: 'ort' | 'item' | 'truhe' | 'munition'; text?: string; nr?: number }
interface Route { matchId: string; nr: number; spieler: Spieler; start: number; punkte: Punkt[]; farbe: string }

const SPANNE = 135_000;
const zuKarte = (v: number) => ((v + SPANNE) / (2 * SPANNE)) * 1000;
const FARBEN = ['#38bdf8', '#f59e0b', '#a78bfa', '#34d399', '#f472b6', '#fb7185', '#facc15', '#60a5fa', '#4ade80', '#e879f9', '#fca5a5', '#93c5fd'];
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
    const name = d.lootNamen?.[l[2]] ?? '?';
    punkte.push({ t: l[0], x: l[3], y: l[4], z: l[6] ?? null, art: 'item', text: name });
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
  const munition = r.punkte.filter((p) => p.art === 'munition').length;
  const items = r.punkte.filter((p) => p.art === 'item').length;
  const bis = (k: number) => (truhen[k - 1] ? truhen[k - 1].t - r.start : null);
  const letzte = r.punkte.length ? r.punkte[r.punkte.length - 1].t - r.start : 0;
  return { truhen: truhen.length, munition, items, bis1: bis(1), bis3: bis(3), bis5: bis(5), jeMinute: letzte > 0 ? (truhen.length / letzte) * 60 : 0 };
}

/** Die Karte mit allen Routen, auf die Routen gezoomt. */
function Karte2D({ routen, bild, zeit }: { routen: Route[]; bild: string; zeit: number }) {
  const alle = routen.flatMap((r) => r.punkte);
  if (!alle.length) return <div className="flex aspect-square items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950 text-sm text-zinc-500">Keine Punkte in diesem Zeitraum.</div>;
  const xs = alle.map((p) => zuKarte(p.x)), ys = alle.map((p) => zuKarte(p.y));
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const seite = Math.max(x1 - x0, y1 - y0, 12) * 1.25, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const vb = `${cx - seite / 2} ${cy - seite / 2} ${seite} ${seite}`;
  const s = seite / 100; // Strichstaerken relativ zum Ausschnitt
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-zinc-800 bg-sky-950">
      <svg viewBox={vb} className="absolute inset-0 h-full w-full">
        <image href={bild} x={0} y={0} width={1000} height={1000} preserveAspectRatio="none" />
        <rect x={cx - seite / 2} y={cy - seite / 2} width={seite} height={seite} fill="#020617" fillOpacity={0.25} />
        {routen.map((r) => {
          const sicht = r.punkte.filter((p) => p.t - r.start <= zeit);
          return (
            <g key={r.matchId + r.spieler.id}>
              <polyline points={sicht.map((p) => `${zuKarte(p.x)},${zuKarte(p.y)}`).join(' ')} fill="none" stroke="#000" strokeOpacity={0.6} strokeWidth={s * 1.1} strokeLinejoin="round" strokeLinecap="round" />
              <polyline points={sicht.map((p) => `${zuKarte(p.x)},${zuKarte(p.y)}`).join(' ')} fill="none" stroke={r.farbe} strokeWidth={s * 0.55} strokeLinejoin="round" strokeLinecap="round" />
              {sicht.filter((p) => p.art === 'item').map((p, i) => (
                <circle key={'i' + i} cx={zuKarte(p.x)} cy={zuKarte(p.y)} r={s * 0.55} fill={seltenheit(p.text ?? '')} stroke="#000" strokeWidth={s * 0.18}><title>{`${uhr(p.t - r.start)} ${itemName(p.text ?? '')}`}</title></circle>
              ))}
              {sicht.filter((p) => p.art === 'munition').map((p, i) => (
                <rect key={'m' + i} x={zuKarte(p.x) - s * 0.8} y={zuKarte(p.y) - s * 0.55} width={s * 1.6} height={s * 1.1} rx={s * 0.2} fill="#475569" stroke="#000" strokeWidth={s * 0.18}><title>{`${uhr(p.t - r.start)} Munitionskiste`}</title></rect>
              ))}
              {sicht.filter((p) => p.art === 'truhe').map((p) => (
                <g key={'t' + p.nr}>
                  <circle cx={zuKarte(p.x)} cy={zuKarte(p.y)} r={s * 1.5} fill="#facc15" stroke="#000" strokeWidth={s * 0.25} />
                  <text x={zuKarte(p.x)} y={zuKarte(p.y)} textAnchor="middle" dominantBaseline="central" fontSize={s * 1.7} fontWeight={800} fill="#000">{p.nr}</text>
                  <title>{`${uhr(p.t - r.start)} Truhe ${p.nr}`}</title>
                </g>
              ))}
              {sicht[0] && <circle cx={zuKarte(sicht[0].x)} cy={zuKarte(sicht[0].y)} r={s * 1.1} fill="#fff" stroke={r.farbe} strokeWidth={s * 0.5}><title>Landung</title></circle>}
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
      const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(B, H);
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
      const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const g = c.getContext('2d');
      if (g && img.width) { const f = img.width / 1000; g.drawImage(img, (zuKarte(cx - seite / 2)) * f, (zuKarte(cy - seite / 2)) * f, (seite / (2 * SPANNE)) * 1000 * f, (seite / (2 * SPANNE)) * 1000 * f, 0, 0, 1024, 1024); }
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
          const rohr = new THREE.Mesh(new THREE.TubeGeometry(kurve, Math.max(64, pfad.length * 8), 0.35, 8, false), new THREE.MeshStandardMaterial({ color: farbe, emissive: farbe, emissiveIntensity: 0.35 }));
          gr.add(rohr);
        }
        const teile: Array<{ t: number; o: import('three').Object3D }> = [];
        for (const p of r.punkte) {
          const v = P(p);
          if (p.art === 'ort') continue;
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
  return <div ref={ort} className="relative aspect-square w-full overflow-hidden rounded-2xl border border-zinc-800 bg-black" />;
}

export default function LootRouten() {
  const [erlaubt, setErlaubt] = useState<boolean | null>(null);
  const [tage, setTage] = useState<Tag[] | null>(null);
  const [suche, setSuche] = useState('');
  const [tag, setTag] = useState<Tag | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [daten, setDaten] = useState<Record<string, MatchDaten>>({});
  const [spielerId, setSpielerId] = useState<number | null>(null);
  const [alleGames, setAlleGames] = useState(false);
  const [dauer, setDauer] = useState(180);
  const [zeit, setZeit] = useState(180);
  const [ansicht, setAnsicht] = useState<'2d' | '3d'>('2d');
  const [lade, setLade] = useState('');

  useEffect(() => { fetch('/api/auth/check-admin').then((r) => r.json()).then((j) => setErlaubt(j?.isAdmin === true)).catch(() => setErlaubt(false)); }, []);
  useEffect(() => { if (erlaubt) fetch('/api/replay').then((r) => r.json()).then((j) => setTage(Array.isArray(j) ? j : j?.tage ?? [])).catch(() => setTage([])); }, [erlaubt]);
  useEffect(() => { setZeit(dauer); }, [dauer]);

  const holeMatch = async (id: string) => {
    if (daten[id]) return daten[id];
    const j = await (await fetch(`/api/replay?match=${id}`)).json() as MatchDaten;
    setDaten((d) => ({ ...d, [id]: j }));
    return j;
  };
  useEffect(() => { if (matchId) { setLade('Lade Game ...'); holeMatch(matchId).finally(() => setLade('')); } }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const aktuell = matchId ? daten[matchId] : null;
  const gewaehlt = aktuell?.spieler.find((s) => s.id === spielerId) ?? null;

  // Alle Games: denselben Spieler (Epic-Konto) in den anderen Games des Spieltags suchen.
  useEffect(() => {
    if (!alleGames || !tag || !gewaehlt?.epic) return;
    let aus = false;
    (async () => {
      const offen = tag.matches.filter((m) => !daten[m.id]);
      for (let i = 0; i < offen.length && !aus; i += 4) {
        setLade(`Suche in den Games ... ${Math.min(i + 4, offen.length)} / ${offen.length}`);
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

  if (erlaubt === false) return <main className="p-8 text-zinc-400">Nur fuer Admins.</main>;
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 text-zinc-100">
      <h1 className="text-2xl font-extrabold">Loot-Routen</h1>
      <p className="mt-1 text-sm text-zinc-400">Laufweg ab dem Absprung, geoeffnete Truhen (nummeriert) und Munitionskisten, aufgehobene Items in Seltenheitsfarbe - aus den Server-Replays. Truhen erkennt der Leser am Aufheben von Kisten-Loot (Waffe plus weitere Stuecke = Truhe, nur Munition = Munitionskiste); Epic speichert den Ort einer Truhe selbst nicht.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Cup suchen ..." className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm outline-none" />
            <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
              {tage === null && <p className="p-2 text-xs text-zinc-500">Lade Cups ...</p>}
              {gefiltert.map((t) => (
                <button key={t.windowId} onClick={() => { setTag(t); setMatchId(null); setSpielerId(null); }}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-xs ${tag?.windowId === t.windowId ? 'bg-sky-600/30 text-white' : 'hover:bg-zinc-900 text-zinc-300'}`}>
                  <span className="font-bold">{t.titel}</span><br /><span className="text-zinc-500">{t.region} · {t.matches.length} Games · {t.windowId}</span>
                </button>
              ))}
            </div>
          </div>
          {tag && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Game</p>
              <div className="flex flex-wrap gap-1.5">
                {tag.matches.map((m) => (
                  <button key={m.id} onClick={() => setMatchId(m.id)} className={`rounded-md px-2.5 py-1 text-xs font-bold ${matchId === m.id ? 'bg-sky-500 text-black' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'}`}>{m.nr}</button>
                ))}
              </div>
            </div>
          )}
          {aktuell && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Spieler</p>
              <div className="max-h-72 space-y-0.5 overflow-y-auto">
                {aktuell.spieler.filter((s) => !s.bot).sort((a, b) => (a.platz ?? 999) - (b.platz ?? 999)).map((s) => (
                  <button key={s.id} onClick={() => setSpielerId(s.id)} className={`flex w-full justify-between rounded-md px-2 py-1 text-left text-xs ${spielerId === s.id ? 'bg-sky-600/30 text-white' : 'text-zinc-300 hover:bg-zinc-900'}`}>
                    <span className="truncate">{ohneVorsatz(s.name)}</span><span className="text-zinc-500">#{s.platz ?? '-'}</span>
                  </button>
                ))}
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={alleGames} onChange={(e) => setAlleGames(e.target.checked)} /> Alle Games dieses Spielers am Spieltag</label>
            </div>
          )}
        </aside>

        <section>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg bg-zinc-900 p-1 text-xs font-bold">
              {(['2d', '3d'] as const).map((a) => <button key={a} onClick={() => setAnsicht(a)} className={`rounded-md px-3 py-1 ${ansicht === a ? 'bg-sky-500 text-black' : 'text-zinc-300'}`}>{a.toUpperCase()}</button>)}
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-400">Dauer ab Absprung
              <select value={dauer} onChange={(e) => setDauer(Number(e.target.value))} className="rounded bg-zinc-900 px-2 py-1 text-zinc-100">
                {[60, 120, 180, 240, 300, 450, 600].map((s) => <option key={s} value={s}>{uhr(s)}</option>)}
              </select>
            </label>
            <label className="flex flex-1 items-center gap-2 text-xs text-zinc-400">Zeit <input type="range" min={0} max={dauer} value={zeit} onChange={(e) => setZeit(Number(e.target.value))} className="flex-1" /> <span className="w-10 text-zinc-100">{uhr(zeit)}</span></label>
            {lade && <span className="text-xs text-sky-300">{lade}</span>}
          </div>
          {!gewaehlt && <div className="flex aspect-square items-center justify-center rounded-2xl border border-dashed border-zinc-800 text-sm text-zinc-500">Cup, Game und Spieler waehlen.</div>}
          {gewaehlt && (ansicht === '2d' ? <Karte2D routen={routen} bild={bild} zeit={zeit} /> : <Karte3D routen={routen} bild={bild} zeit={zeit} />)}
          {ohneTruhenDaten && <p className="mt-2 text-xs text-amber-300">Dieses Game wurde vor dem 10.11.2026 gelesen - Truhen und Hoehen kommen, sobald es neu gelesen ist. Laufweg und Items sind schon da.</p>}
          {routen.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-900 text-zinc-400"><tr><th className="px-3 py-2">Game</th><th>Spieler</th><th>Truhen</th><th>Munition</th><th>Items</th><th>1. Truhe</th><th>3. Truhe</th><th>5. Truhe</th><th>Truhen/Min</th></tr></thead>
                <tbody>
                  {routen.map((r) => { const k = kennzahlen(r); return (
                    <tr key={r.matchId} className="border-t border-zinc-800">
                      <td className="px-3 py-2"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.farbe }} />{r.nr}</td>
                      <td>{ohneVorsatz(r.spieler.name)}</td><td className="font-bold text-yellow-300">{k.truhen}</td><td>{k.munition}</td><td>{k.items}</td>
                      <td>{k.bis1 === null ? '-' : uhr(k.bis1)}</td><td>{k.bis3 === null ? '-' : uhr(k.bis3)}</td><td>{k.bis5 === null ? '-' : uhr(k.bis5)}</td><td>{k.jeMinute.toFixed(1)}</td>
                    </tr>); })}
                </tbody>
              </table>
            </div>
          )}
          {routen.length === 1 && (
            <ol className="mt-4 grid gap-1 text-xs text-zinc-300 sm:grid-cols-2">
              {routen[0].punkte.filter((p) => p.art !== 'ort').map((p, i) => (
                <li key={i} className="flex gap-2"><span className="w-10 text-zinc-500">{uhr(p.t - routen[0].start)}</span>
                  {p.art === 'truhe' ? <span className="font-bold text-yellow-300">Truhe {p.nr}</span> : p.art === 'munition' ? <span className="text-zinc-400">Munitionskiste</span> : <span style={{ color: seltenheit(p.text ?? '') }}>{itemName(p.text ?? '')}</span>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
