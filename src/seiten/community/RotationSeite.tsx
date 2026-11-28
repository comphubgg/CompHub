import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { Abschnitt, Bild, Flaeche, Laedt, Marke, MedienKarte, SeitenKopf, Segment, Zaehler, dauer, useJetzt } from '../../ds/Bausteine';
import { useHubDatei } from './Bausteine';
import { EpicFehler, kurz, letzter, metrikenZeitraum, summe, useEpicErreichbar, type Punkt } from './epic/daten';
import { BLITZ_KARTEN, RELOAD_KARTEN } from './epic/modi';

/*
 * Map Rotation (Design 3.0, neu komponiert 28.11.2026). Die EINE Frage: "Welche Karte laeuft gerade?" - deshalb ist die laufende Karte die Buehne.
 *
 * Zwei Wege, wie vorher:
 *   1. Mit Fahrplan /hub-daten/rotation.json ({ modes: { reload: { anchor, slotMinutes, maps: [{ name, image? }] }, blitz: {...} } }):
 *      laufende Karte mit Countdown, die naechste, und die folgenden Slots als Zeitleiste.
 *   2. Ohne Fahrplan: Epics Fortnite Data API (ueber /epic-daten) zeigt je Karten-Playlist die Spieler der letzten 24 Stunden. Die Karte mit
 *      Spielern in den letzten zwei Stunden laeuft; "live seit" = zusammenhaengende Stunden mit Spielern bis jetzt (Stundenraster).
 * Darunter: die 24-Stunden-Leiste aller Karten und alle Reload-Inseln mit Bild (/api/karten-bild, Bilder aus den Spieldateien der Seite).
 * Codenamen -> Kartennamen in NAMEN (nur bekannte; nichts geraten).
 */

const NAMEN: Record<string, string> = { BlastBerry: 'Venture' };
const anzeige = (k: string) => NAMEN[k] ?? (k.replace(/^ForbiddenFruit_?/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^Old$/, 'Classic') || 'Blitz Royale');
const codesReload = (k: string) => [`Playlist_${k}Squad`, `Playlist_${k}Duo`, `Playlist_${k}Solo`, `Playlist_${k}NoBuildSquad`, `Playlist_${k}NoBuildDuo`];
const codesBlitz = (k: string) => [`Playlist_${k}NoBuildBRSquad`, `Playlist_${k}NoBuildBRDuo`, `Playlist_${k}NoBuildBRSolo`, `Playlist_${k}BRSquad`, `Playlist_${k}BRSolo`];
const uhr = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const kartenBild = (id: string) => `/api/karten-bild?id=${encodeURIComponent(id)}&datei=1`;

interface Karte { k: string; name: string; reihe: Punkt[]; jetzt: number | null }
interface Rotation { modes: Record<string, { anchor: string; slotMinutes: number; maps: Array<{ name: string; image?: string }> }> }
type Modus = 'reload' | 'blitz';

function useKarten(modus: Modus) {
  const [z, setZ] = useState<{ karten: Karte[]; fertig: boolean; offline: boolean }>({ karten: [], fertig: false, offline: false });
  useEffect(() => {
    let weg = false; setZ({ karten: [], fertig: false, offline: false });
    const liste = modus === 'reload' ? RELOAD_KARTEN : BLITZ_KARTEN;
    const codes = modus === 'reload' ? codesReload : codesBlitz;
    Promise.all(liste.map(async (k) => {
      const r = await Promise.allSettled(codes(k).map((c) => metrikenZeitraum(c, '1D')));
      if (r.some((x) => x.status === 'rejected' && x.reason instanceof EpicFehler && x.reason.status === 0)) throw new EpicFehler(0, 'offline');
      const reihe = summe(r.flatMap((x) => (x.status === 'fulfilled' ? [x.value.peakCCU] : [])));
      const karte: Karte = { k, name: anzeige(k), reihe, jetzt: reihe.length && Date.now() - reihe.at(-1)!.t < 2 * 36e5 ? letzter(reihe) : null };
      if (!weg && reihe.length) setZ((v) => ({ ...v, karten: [...v.karten, karte] }));
    })).then(() => { if (!weg) setZ((v) => ({ ...v, fertig: true })); }).catch(() => { if (!weg) setZ((v) => ({ ...v, fertig: true, offline: true })); });
    return () => { weg = true; };
  }, [modus]);
  return z;
}

/** Wie lange eine Karte schon laeuft: zusammenhaengende Stunden mit Spielern bis zur juengsten. */
function liveSeit(reihe: Punkt[]): number | null {
  if (!reihe.length) return null;
  let i = reihe.length - 1;
  while (i > 0 && reihe[i - 1].v > 0 && reihe[i].t - reihe[i - 1].t <= 1.5 * 36e5) i--;
  return reihe[i].t;
}

/** Kleine Verlaufslinie der letzten 24 Stunden. */
function Linie24({ reihe, stunden }: { reihe: Punkt[]; stunden: number[] }) {
  const werte = stunden.map((h) => reihe.find((p) => Math.abs(p.t - h) < 18e5)?.v ?? 0);
  const max = Math.max(1, ...werte);
  const pkt = werte.map((v, i) => `${(i / (werte.length - 1)) * 100},${30 - (v / max) * 28}`).join(' ');
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-12 w-full">
      <polygon points={`0,32 ${pkt} 100,32`} style={{ fill: 'rgb(var(--akz) / 0.15)' }} />
      <polyline points={pkt} fill="none" style={{ stroke: 'rgb(var(--akz))' }} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function RotationSeite() {
  const { daten, status } = useHubDatei<Rotation>('rotation.json');
  const [modus, setModus] = useState<Modus>('reload');
  // Bilder der Reload-Inseln aus den Spieldateien der Seite
  const [bilder, setBilder] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    fetch('/api/karten-bild').then((r) => r.json()).then((j) => setBilder(((j?.karten ?? []) as Array<{ id: string; titel: string }>)
      .filter((k) => k.id.startsWith('reload-') && !/-(png|nah)$/.test(k.id)).map((k) => ({ id: k.id, name: k.titel.replace(/^Reload - /, '') })))).catch(() => {});
  }, []);
  const plan = daten?.modes && Object.keys(daten.modes).length ? daten : null;
  const modiPlan = Object.keys(plan?.modes ?? {});
  const [planModus, setPlanModus] = useState<string | null>(null);

  if (status === 'laedt') return <Laedt />;
  const kopfRechts = plan
    ? <Segment id="rot-plan" wert={planModus ?? modiPlan[0]} wahl={modiPlan.map((k) => ({ k, titel: k === 'blitz' ? 'Blitz Royale' : k[0].toUpperCase() + k.slice(1) }))} onWahl={setPlanModus} />
    : <Segment id="rot-modus" wert={modus} wahl={[{ k: 'reload', titel: 'Reload' }, { k: 'blitz', titel: 'Blitz Royale' }]} onWahl={(k) => setModus(k as Modus)} />;
  return (
    <div className="space-y-7">
      <SeitenKopf klein ueber="Community · Island" titel="Map Rotation" text="Which map is live in Reload and Blitz right now – and what was played today. Times in your time zone." rechts={kopfRechts} />
      {plan ? <MitFahrplan plan={plan} modus={planModus ?? modiPlan[0]} bilder={bilder} /> : <Live modus={modus} bilder={bilder} />}
    </div>
  );
}

/* ---------------------------------------------- Ohne Fahrplan: live aus Epics Spielerzahlen */
function Live({ modus, bilder }: { modus: Modus; bilder: Array<{ id: string; name: string }> }) {
  const { karten, fertig, offline } = useKarten(modus);
  const erreichbar = useEpicErreichbar();
  const sortiert = useMemo(() => [...karten].sort((a, b) => (b.jetzt ?? 0) - (a.jetzt ?? 0) || a.name.localeCompare(b.name)), [karten]);
  const live = sortiert.filter((k) => (k.jetzt ?? 0) > 0);
  const stunden = useMemo(() => { const j = Math.floor(Date.now() / 36e5) * 36e5; return Array.from({ length: 24 }, (_, i) => j - (23 - i) * 36e5); }, []);
  const max = Math.max(1, ...karten.flatMap((k) => k.reihe.map((p) => p.v)));
  const bildVon = (name: string) => bilder.find((b) => b.name.toLowerCase() === name.toLowerCase());
  const [haupt, ...auch] = live.slice(0, 3);
  const liveNamen = new Set(live.slice(0, 3).map((k) => k.name.toLowerCase()));
  const ohneEpic = (offline || erreichbar === 'aus') && !karten.length;

  return (
    <>
      {ohneEpic && <p className="flex items-center gap-2 text-xs text-white/55"><span className="h-1.5 w-1.5 rounded-full bg-amber-300" />Epic's Fortnite Data API isn't answering – the live rotation fills in as soon as it does.</p>}

      {/* Buehne: laufende Karte | auch live */}
      {(haupt || !fertig) && !ohneEpic && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          {haupt ? (
            <Flaeche fest className="overflow-hidden">
              {/* Ohne Kartenbild keine Ersatzflaeche - dann steht die Karte als Text ueber die ganze Breite */}
              <div className={`grid ${bildVon(haupt.name) ? 'sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]' : ''}`}>
                {bildVon(haupt.name) && (
                  <div className="relative aspect-square overflow-hidden bg-black/40">
                    <Bild src={kartenBild(bildVon(haupt.name)!.id)} alt={haupt.name} className="absolute inset-0 h-full w-full" />
                    <span className="absolute left-4 top-4"><Marke ton="rot" puls>Live now</Marke></span>
                  </div>
                )}
                <div className="flex flex-col p-6 sm:p-8">
                  {!bildVon(haupt.name) && <span className="mb-4"><Marke ton="rot" puls>Live now</Marke></span>}
                  <p className="ueber">{modus === 'blitz' ? 'Blitz Royale' : 'Reload'} · current map</p>
                  <h2 className="titel mt-1 text-6xl lg:text-7xl">{haupt.name}</h2>
                  <p className="mt-1 font-mono text-xs text-white/35">{haupt.k}</p>
                  <div className="mt-6 grid grid-cols-2 gap-5">
                    <div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">Players · last hour</p><p className="titel mt-0.5 text-5xl text-akz"><Zaehler wert={haupt.jetzt ?? 0} /></p></div>
                    {liveSeit(haupt.reihe) && <div><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">Live since</p><p className="titel zahl mt-0.5 text-5xl">{uhr(liveSeit(haupt.reihe)!)}</p></div>}
                  </div>
                  <div className="mt-auto pt-8">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">Last 24 hours</p>
                    <Linie24 reihe={haupt.reihe} stunden={stunden} />
                  </div>
                </div>
              </div>
            </Flaeche>
          ) : <div className="fl-fest aspect-[2/1] animate-pulse" />}
          <div className="grid content-start gap-4">
            {auch.map((k, i) => (
              <Flaeche fest key={k.k} className="flex items-center gap-4 overflow-hidden p-3" verz={0.06 * (i + 1)}>
                {bildVon(k.name) && <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-2xl bg-black/40"><Bild src={kartenBild(bildVon(k.name)!.id)} alt={k.name} className="absolute inset-0 h-full w-full" /></div>}
                <div className="min-w-0 flex-1">
                  <Marke ton="rot">Also live</Marke>
                  <p className="titel mt-1.5 truncate text-3xl">{k.name}</p>
                  <p className="text-xs text-white/50"><b className="zahl text-akz">{kurz(k.jetzt)}</b> players in the last hour</p>
                </div>
              </Flaeche>
            ))}
            <Flaeche fest className="p-5" verz={0.15}>
              <p className="ueber">Today</p>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div><p className="titel zahl text-4xl">{karten.filter((k) => k.reihe.some((p) => p.v > 0)).length}</p><p className="text-[11px] text-white/45">maps played</p></div>
                <div><p className="titel zahl text-4xl">{live.length}</p><p className="text-[11px] text-white/45">live now</p></div>
                <div><p className="titel zahl text-4xl">{kurz(Math.max(0, ...karten.flatMap((k) => k.reihe.map((p) => p.v))))}</p><p className="text-[11px] text-white/45">peak on one map</p></div>
              </div>
            </Flaeche>
          </div>
        </div>
      )}
      {fertig && !live.length && !ohneEpic && <p className="text-sm text-white/50">No {modus === 'blitz' ? 'Blitz' : 'Reload'} map had players in the last two hours.</p>}

      {/* 24-Stunden-Leiste */}
      {!ohneEpic && (
        <Abschnitt ueber="Last 24 hours" titel="When each map was live" rechts={<span className="text-xs text-white/40">brighter = more players</span>}>
          <Flaeche fest className="overflow-x-auto p-4 sm:p-5">
            <div className="min-w-[680px]">
              <div className="mb-2 grid grid-cols-[180px_minmax(0,1fr)_64px] gap-3 text-[10px] text-white/35">
                <span />
                <div className="grid grid-cols-[repeat(24,minmax(0,1fr))]">{stunden.map((h, i) => <span key={h} className="zahl">{i % 3 === 0 ? uhr(h) : ''}</span>)}</div>
                <span className="text-right">now</span>
              </div>
              <div className="space-y-1.5">
                {sortiert.map((k, n) => {
                  const b = bildVon(k.name); const an = (k.jetzt ?? 0) > 0;
                  return (
                    <motion.div key={k.k} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(n, 12) * 0.03 }} className="grid grid-cols-[180px_minmax(0,1fr)_64px] items-center gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        {b ? <Bild src={kartenBild(b.id)} alt="" className="h-7 w-7 shrink-0 rounded-md" /> : <span className="h-7 w-7 shrink-0" />}
                        <span className={`truncate text-sm font-semibold ${an ? 'text-white' : 'text-white/65'}`}>{k.name}</span>
                        {an && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400 shadow-[0_0_8px_rgb(248,113,113)]" />}
                      </span>
                      <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-0.5">
                        {stunden.map((h) => { const v = k.reihe.find((p) => Math.abs(p.t - h) < 18e5)?.v ?? 0; return <span key={h} title={`${uhr(h)} · ${Math.round(v).toLocaleString('en')} players`} className="h-6 rounded-[3px]" style={{ background: v ? `rgb(var(--akz) / ${0.15 + 0.85 * (v / max)})` : 'rgba(255,255,255,0.04)' }} />; })}
                      </div>
                      <span className="zahl text-right text-xs font-bold text-white/60">{kurz(k.jetzt)}</span>
                    </motion.div>
                  );
                })}
              </div>
              {!sortiert.length && <div className="py-4">{fertig ? <p className="text-sm text-white/45">No map playlists answered.</p> : <Laedt text="Asking Epic which maps were played" />}</div>}
            </div>
          </Flaeche>
          <p className="mt-2 text-[11px] text-white/35">From Epic's Fortnite Data API (players per map playlist, hourly). Exact “up next” times need the rotation schedule, which Epic doesn't publish.</p>
        </Abschnitt>
      )}

      <Inseln bilder={bilder.filter((b) => !liveNamen.has(b.name.toLowerCase()))} titel={liveNamen.size ? 'Every other Reload island' : 'Every Reload island'} />
    </>
  );
}

/* ---------------------------------------------- Mit Fahrplan (rotation.json) */
function MitFahrplan({ plan, modus, bilder }: { plan: Rotation; modus: string; bilder: Array<{ id: string; name: string }> }) {
  const jetzt = useJetzt();
  const slots = useMemo(() => {
    const r = plan.modes[modus];
    if (!r?.maps?.length) return [];
    const slot = (r.slotMinutes || 20) * 60_000; const anker = Date.parse(r.anchor);
    const k = Math.floor((jetzt - anker) / slot);
    return Array.from({ length: Math.min(r.maps.length, 8) }, (_, i) => {
      const n = k + i; const karte = r.maps[((n % r.maps.length) + r.maps.length) % r.maps.length];
      return { karte, start: anker + n * slot, ende: anker + (n + 1) * slot };
    });
  }, [plan, modus, jetzt]);
  const bildVon = (k: { name: string; image?: string }) => k.image ?? (bilder.find((b) => b.name.toLowerCase() === k.name.toLowerCase()) ? kartenBild(bilder.find((b) => b.name.toLowerCase() === k.name.toLowerCase())!.id) : null);
  if (!slots.length) return <p className="text-sm text-white/50">No maps in the schedule for this mode.</p>;
  const [jetztSlot, naechster] = slots;
  const anteil = ((jetzt - jetztSlot.start) / (jetztSlot.ende - jetztSlot.start)) * 100;
  const gezeigt = new Set([jetztSlot.karte.name.toLowerCase(), naechster?.karte.name.toLowerCase()]);
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Flaeche fest className="overflow-hidden">
          <div className="grid sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
            <div className="relative aspect-square overflow-hidden bg-black/40">
              {bildVon(jetztSlot.karte) && <Bild src={bildVon(jetztSlot.karte)} alt={jetztSlot.karte.name} className="absolute inset-0 h-full w-full" />}
              <span className="absolute left-4 top-4"><Marke ton="rot" puls>Live now</Marke></span>
            </div>
            <div className="flex flex-col p-6 sm:p-8">
              <p className="ueber">Current rotation · {uhr(jetztSlot.start)} – {uhr(jetztSlot.ende)}</p>
              <h2 className="titel mt-1 text-6xl lg:text-7xl">{jetztSlot.karte.name}</h2>
              <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">Rotates in</p>
              <p className="titel zahl text-6xl text-akz">{dauer(jetztSlot.ende - jetzt)}</p>
              <div className="mt-auto pt-6"><div className="h-2 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-akz" style={{ width: `${anteil}%` }} /></div></div>
            </div>
          </div>
        </Flaeche>
        {naechster && (
          <MedienKarte format="aspect-square" bild={bildVon(naechster.karte)} titel={naechster.karte.name} marke={<Marke ton="akz">Up next</Marke>} ecke={<Marke>{dauer(naechster.start - jetzt)}</Marke>} unter={`${uhr(naechster.start)} – ${uhr(naechster.ende)}`} />
        )}
      </div>
      <Abschnitt ueber="Schedule" titel="After that">
        <Flaeche fest className="divide-y divide-white/[0.05]">
          {slots.slice(2).map((p, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              {bildVon(p.karte) ? <Bild src={bildVon(p.karte)} alt="" className="h-10 w-10 shrink-0 rounded-lg" /> : <span className="h-10 w-10 shrink-0" />}
              <span className="min-w-0 flex-1 truncate font-semibold text-white">{p.karte.name}</span>
              <span className="hidden text-sm text-white/50 sm:inline">in {dauer(p.start - jetzt)}</span>
              <span className="zahl w-28 text-right text-sm text-white/45">{uhr(p.start)} – {uhr(p.ende)}</span>
            </div>
          ))}
        </Flaeche>
      </Abschnitt>
      <Inseln bilder={bilder.filter((b) => !gezeigt.has(b.name.toLowerCase()))} titel="Every other Reload island" />
    </>
  );
}

function Inseln({ bilder, titel }: { bilder: Array<{ id: string; name: string }>; titel: string }) {
  if (!bilder.length) return null;
  return (
    <Abschnitt ueber="From the game files" titel={titel}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {bilder.map((b, i) => <MedienKarte key={b.id} format="aspect-square" bild={kartenBild(b.id)} titel={b.name} unter="Reload" verz={Math.min(i, 12) * 0.03} />)}
      </div>
    </Abschnitt>
  );
}
