import { OV } from '../ort';
import { useEffect, useMemo, useRef, useState } from 'react';
import T from '../T';
import { useT } from '../sprache';
import { useOverlays, type OverlayEintrag } from '../OverlayGeruest';
import {
  Buehne, Farbe, FELD, Gruppe, KopierFeld, ObsSchritte, Schalter, Schieber, Segmente, Text,
} from '../Bausteine';
import { FC_CLIP, FC_GOLD, FC_KARTEN, FC_THUMB, FC_VARIANTEN, FcRahmen, fcOverlayUrl, fcVarianteFuer, type FcVariante } from './FcTeile';

/*
 * Finest Creative - box-fight / token scoreboards (PRIVATE, see FcTeile).
 *
 * The operator's approved design (final3): a thin map-promo header (the clip
 * across the full width, the thumbnail popping in and sliding left, map
 * title, "Search: FINEST" + island code) over a semi-transparent panel inside
 * a rotating gold/black border, in six variants. Saved to /api/overlay-config
 * as type "finest"; the overlay is /overlays/finest/live?id=..&k=.. (view key).
 * Pre-filled with the demo line-up; flags are the real ones from our data.
 */

export const FC_STANDARD = {
  variante: 'stapel' as FcVariante,
  karte: '1V1-4V4 REALISTICS', suche: 'FINEST', code: '9854-1829-8735', clip: FC_CLIP, bild: FC_THUMB, logoZeigen: false, kopfZeigen: true,
  kopfAnimation: 'loop' as 'loop' | 'static', kopfHalten: 3, kopfTempo: 1, kopfDunkel: 0.25, kopfMass: 1,
  rahmen: true, rahmenTempo: 4, rahmenBreite: 2.5,
  rahmenGrund: '#111111', rahmen1: '#7a5a12', rahmen2: '#f5b82e', rahmen3: '#ffe9a8',
  titel: '', titelZeigen: true,
  teams: 2,
  name1: '', name2: '', name3: '', name4: '',
  spieler1: ['Chap', 'Kaan', 'Fastroki'] as string[], spieler2: ['Nociff', 'Izzi', 'Akiira'] as string[],
  spieler3: ['Veno'] as string[], spieler4: ['Malibuca'] as string[],
  punkte1: 0, punkte2: 0, punkte3: 0, punkte4: 0,
  /** Real flags from our profile data next to the names (looked up by the overlay). */
  flaggen: true,
  ziel: 7, zielZeigen: true, runde: 0, serie1: 0, serie2: 0, serieZeigen: false,
  farbe: '#f5b82e', deckkraft: 0.7, blur: true,
  groesse: 1, vert: 'top' as 'top' | 'middle' | 'bottom', horiz: 'center' as 'left' | 'center' | 'right', rand: 30,
  animation: 'pop' as 'pop' | 'none',
};
export type FcConfig = typeof FC_STANDARD;
const TEAM_NR = [1, 2, 3, 4] as const;
type PunkteKey = 'punkte1' | 'punkte2' | 'punkte3' | 'punkte4';
type SpielerKey = 'spieler1' | 'spieler2' | 'spieler3' | 'spieler4';
type NameKey = 'name1' | 'name2' | 'name3' | 'name4';
function teamLabel(c: FcConfig, n: number): string {
  const name = c[`name${n}` as NameKey];
  const sp = c[`spieler${n}` as SpielerKey].filter(Boolean);
  return name || (sp.length > 2 ? sp.join(' · ') : sp.join(' & '));
}

/** A thumbnail upload, shrunk in the browser (max 480 px, JPEG) so it travels with the settings. */
export async function verkleinern(datei: File): Promise<string | null> {
  try {
    const bild = await createImageBitmap(datei);
    const mass = Math.min(1, 480 / Math.max(bild.width, bild.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bild.width * mass); c.height = Math.round(bild.height * mass);
    c.getContext('2d')?.drawImage(bild, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } catch { return null; }
}

function SpielerListe({ werte, setzen }: { werte: string[]; setzen: (w: string[]) => void }) {
  const t = useT();
  return (
    <div className="space-y-1.5">
      {werte.map((w, i) => (
        <div key={i} className="flex gap-1.5">
          <input value={w} maxLength={24} onChange={(e) => { const n = [...werte]; n[i] = e.target.value; setzen(n); }}
            placeholder={t('Player name')} className={`${FELD} min-w-0 flex-1`} />
          {werte.length > 1 && (
            <button type="button" onClick={() => setzen(werte.filter((_, k) => k !== i))}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.08] text-white/45 hover:text-rose-300">×</button>
          )}
        </div>
      ))}
      {werte.length < 4 && (
        <button type="button" onClick={() => setzen([...werte, ''])}
          className="w-full rounded-lg border border-dashed border-white/[0.12] py-1.5 text-xs font-semibold text-white/55 hover:text-white">+ <T>Add player</T></button>
      )}
    </div>
  );
}

function Zaehler({ titel, wert, setzen }: { titel: string; wert: number; setzen: (n: number) => void }) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/45"><T>{titel}</T></span>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => setzen(Math.max(0, wert - 1))} className="h-9 w-9 rounded-lg border border-white/[0.1] text-white/70">−</button>
        <span className="w-10 text-center font-mono text-lg font-bold text-white">{wert}</span>
        <button type="button" onClick={() => setzen(Math.min(99, wert + 1))} className="h-9 w-9 rounded-lg border border-white/[0.1] text-white/70">+</button>
      </div>
    </div>
  );
}

export default function FinestBaukasten() {
  return <FcRahmen titel="Scoreboards" text="1v1 to 4v4, first to X, rounds and series, with your map in the header."><Baukasten /></FcRahmen>;
}

function Baukasten() {
  const t = useT();
  const { liste, fehler, speichern, entfernen } = useOverlays('finest');
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState('Demo 3v3');
  const [cfg, setCfg] = useState<FcConfig>(FC_STANDARD);
  const [schmutzig, setSchmutzig] = useState(false);
  const [status, setStatus] = useState('');
  const [basis, setBasis] = useState('');
  useEffect(() => { setBasis(OV); }, []);
  const setz = <K extends keyof FcConfig>(k: K, v: FcConfig[K]) => { setCfg((a) => ({ ...a, [k]: v })); setSchmutzig(true); };

  const rahmen = useRef<HTMLIFrameElement | null>(null);
  const [erstSrc, setErstSrc] = useState(() => `${OV}/overlays/finest/live?vorschau=${encodeURIComponent(JSON.stringify(FC_STANDARD))}`);
  // Hub: die Seite liegt auf thecomphub.com und nimmt keine Nachrichten von localhost an - die Vorschau laedt mit den neuen Einstellungen neu.
  useEffect(() => {
    const z = window.setTimeout(() => setErstSrc(`${OV}/overlays/finest/live?vorschau=${encodeURIComponent(JSON.stringify(cfg))}`), 450);
    return () => window.clearTimeout(z);
  }, [cfg]);
  useEffect(() => { rahmen.current?.contentWindow?.postMessage({ comphub: 'fc-cfg', cfg }, OV); }, [cfg]);

  function waehlen(o: OverlayEintrag) { setId(o.id); setName(o.name); setCfg({ ...FC_STANDARD, ...(o.config as Partial<FcConfig>) }); setSchmutzig(false); }
  function neu() { setId(null); setName('Demo 3v3'); setCfg(FC_STANDARD); setSchmutzig(false); }

  const [ausAdresse, setAusAdresse] = useState(false);
  useEffect(() => {
    if (ausAdresse || !liste) return;
    // ?id= from the address, else the newest saved one - the demo is ready to show.
    const w = new URLSearchParams(window.location.search).get('id');
    const o = w ? liste.find((x) => x.id === w) : liste[0];
    if (o) waehlen(o);
    setAusAdresse(true);
  }, [liste, ausAdresse]);

  async function sichern() {
    const n = await speichern({ id: id ?? undefined, name, config: cfg });
    if (!n) return;
    setId(n); setSchmutzig(false);
    setStatus(t('Saved — live in OBS within seconds'));
    window.setTimeout(() => setStatus(''), 2200);
  }

  /** Score, round and series go straight to OBS once saved. */
  async function live(teil: Partial<FcConfig>) {
    const n = { ...cfg, ...teil };
    setCfg(n);
    if (!id) { setSchmutzig(true); return; }
    try {
      await fetch('/api/overlay-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, punkte: { p1: n.punkte1, p2: n.punkte2, p3: n.punkte3, p4: n.punkte4, runde: n.runde, serie1: n.serie1, serie2: n.serie2, serieZeigen: n.serieZeigen } }),
      });
    } catch { /* next click */ }
  }

  const eintrag = id ? liste?.find((o) => o.id === id) : undefined;
  const sicht = (eintrag as (OverlayEintrag & { sicht?: string | null }) | undefined)?.sicht ?? '';
  const obsUrl = id && sicht && basis ? fcOverlayUrl(basis, id, sicht) : '';
  const steuerUrl = id && eintrag?.steuer && basis ? `${basis}/overlays/finest/control?id=${id}&key=${eintrag.steuer}` : '';
  const variantenText = useMemo(() => FC_VARIANTEN.find((v) => v.wert === cfg.variante)?.text ?? '', [cfg.variante]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
      <div className="order-2 space-y-4 xl:order-1">
        <Gruppe titel="Score" text={id ? 'Saved: every click is on stream within about a second.' : 'Save once — then every click goes straight to OBS.'}>
          <div className="grid grid-cols-2 gap-3">
            {TEAM_NR.slice(0, cfg.teams).map((s) => {
              const pk = `punkte${s}` as PunkteKey;
              return (
                <div key={s} className="rounded-xl border border-white/[0.07] bg-black/30 p-3 text-center">
                  <p className="truncate text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">{teamLabel(cfg, s) || '—'}</p>
                  <p className="my-1 font-mono text-4xl font-black text-white">{cfg[pk]}</p>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => void live({ [pk]: Math.max(0, cfg[pk] - 1) } as Partial<FcConfig>)}
                      className="h-10 flex-1 rounded-lg border border-white/[0.1] text-lg font-bold text-white/70">−</button>
                    <button type="button" onClick={() => void live({ [pk]: cfg[pk] + 1 } as Partial<FcConfig>)}
                      className="h-10 flex-[2] rounded-lg text-lg font-bold text-black" style={{ background: FC_GOLD }}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <Zaehler titel="Round" wert={cfg.runde} setzen={(n) => void live({ runde: n })} />
            <Zaehler titel="Series team 1" wert={cfg.serie1} setzen={(n) => void live({ serie1: n, serieZeigen: true })} />
            <Zaehler titel="Series team 2" wert={cfg.serie2} setzen={(n) => void live({ serie2: n, serieZeigen: true })} />
          </div>
          <button type="button" onClick={() => void live({ punkte1: 0, punkte2: 0, punkte3: 0, punkte4: 0, runde: cfg.runde ? 1 : 0 })}
            className="w-full rounded-lg border border-white/[0.08] py-1.5 text-xs font-semibold text-white/55 hover:text-white"><T>New game: score to 0 : 0</T></button>
        </Gruppe>

        <Gruppe titel="Teams" text="2 to 4 teams with 1 to 4 players each. With 3 or 4 teams the scoreboard becomes a list or columns.">
          <Segmente titel="Number of teams" wert={cfg.teams} setzen={(v) => setz('teams', v)}
            optionen={[{ wert: 2, titel: '2' }, { wert: 3, titel: '3' }, { wert: 4, titel: '4' }]} />
        </Gruppe>

        <Gruppe titel="Variant">
          <div className="grid grid-cols-2 gap-2">
            {FC_VARIANTEN.map((v) => (
              <button key={v.wert} type="button" onClick={() => setz('variante', v.wert)} aria-pressed={cfg.variante === v.wert}
                className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${cfg.variante === v.wert ? 'text-black' : 'border-white/[0.08] text-white/70 hover:border-white/25'}`}
                style={cfg.variante === v.wert ? { background: FC_GOLD, borderColor: FC_GOLD } : undefined}>
                <T>{v.titel}</T>
              </button>
            ))}
          </div>
          <p className="text-xs text-white/45"><T>{variantenText}</T></p>
          {fcVarianteFuer(cfg.variante, cfg.teams) !== cfg.variante && (
            <p className="text-xs text-amber-200/80"><T>With more than two teams this shows as</T> „<T>{FC_VARIANTEN.find((v) => v.wert === fcVarianteFuer(cfg.variante, cfg.teams))?.titel ?? ''}</T>“.</p>
          )}
        </Gruppe>

        <Gruppe titel="Map header" text="Like a map promo: background clip, thumbnail, map title, search term and island code. Text never wraps — if space is tight the code is dropped first.">
          <div>
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-white/45"><T>Map preset</T></span>
            <div className="flex flex-wrap gap-1.5">
              {FC_KARTEN.map((k) => (
                <button key={k.karte} type="button" onClick={() => { setCfg((x) => ({ ...x, karte: k.karte, suche: k.suche, code: k.code })); setSchmutzig(true); }}
                  className="rounded-full border border-white/[0.1] px-3 py-1 text-[11px] font-bold text-white/70 hover:border-[#f5b82e]/60 hover:text-white">{k.karte}</button>
              ))}
            </div>
          </div>
          <Text titel="Map title" wert={cfg.karte} setzen={(v) => setz('karte', v)} max={40} />
          <div className="grid grid-cols-2 gap-2">
            <Text titel="Search term" wert={cfg.suche} setzen={(v) => setz('suche', v)} max={24} />
            <Text titel="Island code" wert={cfg.code} setzen={(v) => setz('code', v)} platzhalter="1234-5678-9012" max={20} />
          </div>
          <Text titel="Background clip URL (MP4 / WebM, muted loop)" wert={cfg.clip} setzen={(v) => setz('clip', v.trim())} platzhalter="https://…/clip.mp4" max={500} />
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Text titel="Map thumbnail (image URL)" wert={cfg.bild.startsWith('data:') ? t('(uploaded image)') : cfg.bild} setzen={(v) => setz('bild', v.trim())} platzhalter="https://…/thumbnail.jpg" max={500} />
            </div>
            <label className="shrink-0 cursor-pointer rounded-lg border border-white/[0.1] px-3 py-2 text-xs font-semibold text-white/70 hover:text-white">
              <T>Upload</T>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void verkleinern(f).then((d) => { if (d) setz('bild', d); });
                e.target.value = '';
              }} />
            </label>
          </div>
          <p className="text-[11px] leading-relaxed text-white/45"><T>Use a direct link to a short, small clip (a few MB). It is played straight from that link, not through our server.</T></p>
          <div className="grid grid-cols-2 gap-2">
            <Schalter titel="Show header" an={cfg.kopfZeigen} setzen={(b) => setz('kopfZeigen', b)} />
            <Schalter titel="Logo before the title" an={cfg.logoZeigen} setzen={(b) => setz('logoZeigen', b)} />
          </div>
          <Segmente titel="Header animation" wert={cfg.kopfAnimation} setzen={(v) => setz('kopfAnimation', v)}
            optionen={[{ wert: 'loop', titel: 'Loop' }, { wert: 'static', titel: 'Static' }]} />
          {cfg.kopfAnimation === 'loop' && (
            <div className="grid grid-cols-2 gap-3">
              <Schieber titel="Hold" wert={cfg.kopfHalten} von={2} bis={60} einheit=" s" setzen={(n) => setz('kopfHalten', n)} />
              <Schieber titel="Animation speed" wert={cfg.kopfTempo} von={0.5} bis={2} schritt={0.1} setzen={(n) => setz('kopfTempo', n)} anzeige={(n) => `${n.toFixed(1)}×`} />
            </div>
          )}
          <Schieber titel="Header height" wert={cfg.kopfMass} von={0.7} bis={1.8} schritt={0.05} setzen={(n) => setz('kopfMass', n)} anzeige={(n) => `${Math.round(n * 100)} %`} />
          <Schieber titel="Darken the clip" wert={Math.round(cfg.kopfDunkel * 100)} von={0} bis={90} einheit=" %" setzen={(n) => setz('kopfDunkel', n / 100)} />
        </Gruppe>

        <Gruppe titel="Players">
          {TEAM_NR.slice(0, cfg.teams).map((n) => (
            <div key={n} className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/55"><T>Team</T> {n}</p>
              <SpielerListe werte={cfg[`spieler${n}` as SpielerKey]} setzen={(w) => setz(`spieler${n}` as SpielerKey, w)} />
              <div className="mt-3"><Text titel="Team name (optional — leave empty to show the players)" wert={cfg[`name${n}` as NameKey]} setzen={(v) => setz(`name${n}` as NameKey, v)} max={28} /></div>
            </div>
          ))}
          <p className="text-[11px] text-white/45"><T>The scoreboard shows the player names (“Chap & Kaan”). A team name replaces them only where you set one.</T></p>
          <Schalter titel="Flags next to the names" an={cfg.flaggen} setzen={(b) => setz('flaggen', b)} />
          <p className="text-[11px] text-white/45"><T>The real flag of each player from our profile data — nothing to type in.</T></p>
        </Gruppe>

        <Gruppe titel="Match">
          <Text titel="Extra text in the status line (optional)" wert={cfg.titel} setzen={(v) => setz('titel', v)} max={30} />
          <p className="text-[11px] text-white/45"><T>The status line fills itself: “1v1 · First to 5”, plus round and series when used.</T></p>
          <Schieber titel="First to" wert={cfg.ziel} von={0} bis={15} setzen={(n) => setz('ziel', n)} anzeige={(n) => (n ? String(n) : 'off')} />
          <div className="grid grid-cols-2 gap-2">
            <Schalter titel="Show extra text" an={cfg.titelZeigen} setzen={(b) => setz('titelZeigen', b)} />
            <Schalter titel="Show first to" an={cfg.zielZeigen} setzen={(b) => setz('zielZeigen', b)} />
            <Schalter titel="Show series" an={cfg.serieZeigen} setzen={(b) => setz('serieZeigen', b)} />
            <Schalter titel="Score animation" an={cfg.animation === 'pop'} setzen={(b) => setz('animation', b ? 'pop' : 'none')} />
          </div>
        </Gruppe>

        <Gruppe titel="Animated border" text="A thin gold highlight that circles around the whole scoreboard. Border only — the panel stays see-through.">
          <Schalter titel="Show the animated border" an={cfg.rahmen} setzen={(b) => setz('rahmen', b)} />
          {cfg.rahmen && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Schieber titel="One round takes" wert={cfg.rahmenTempo} von={1} bis={15} schritt={0.5} einheit=" s" setzen={(n) => setz('rahmenTempo', n)} />
                <Schieber titel="Width" wert={cfg.rahmenBreite} von={1} bis={6} schritt={0.5} einheit=" px" setzen={(n) => setz('rahmenBreite', n)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Farbe titel="Base" wert={cfg.rahmenGrund} setzen={(v) => setz('rahmenGrund', v)} vorschlaege={['#111111', '#000000']} />
                <Farbe titel="Glow start" wert={cfg.rahmen1} setzen={(v) => setz('rahmen1', v)} vorschlaege={['#7a5a12']} />
                <Farbe titel="Glow" wert={cfg.rahmen2} setzen={(v) => setz('rahmen2', v)} vorschlaege={['#f5b82e', '#ffffff']} />
                <Farbe titel="Glow peak" wert={cfg.rahmen3} setzen={(v) => setz('rahmen3', v)} vorschlaege={['#ffe9a8', '#ffffff']} />
              </div>
            </>
          )}
        </Gruppe>

        <Gruppe titel="Look and position">
          <Farbe titel="Accent" wert={cfg.farbe} setzen={(v) => setz('farbe', v)} vorschlaege={['#f5b82e', '#ffffff']} />
          <Schieber titel="Panel opacity" wert={Math.round(cfg.deckkraft * 100)} von={20} bis={100} einheit=" %" setzen={(n) => setz('deckkraft', n / 100)} />
          <Schalter titel="Blur the game behind the panel" an={cfg.blur} setzen={(b) => setz('blur', b)} />
          <Segmente titel="Vertical" wert={cfg.vert} setzen={(v) => setz('vert', v)}
            optionen={[{ wert: 'top', titel: 'Top' }, { wert: 'middle', titel: 'Middle' }, { wert: 'bottom', titel: 'Bottom' }]} />
          <Segmente titel="Horizontal" wert={cfg.horiz} setzen={(v) => setz('horiz', v)}
            optionen={[{ wert: 'left', titel: 'Left' }, { wert: 'center', titel: 'Centre' }, { wert: 'right', titel: 'Right' }]} />
          <Schieber titel="Size" wert={cfg.groesse} von={0.5} bis={2} schritt={0.05} setzen={(n) => setz('groesse', n)} anzeige={(n) => `${Math.round(n * 100)} %`} />
          <Schieber titel="Distance from the edge" wert={cfg.rand} von={0} bis={200} schritt={2} einheit=" px" setzen={(n) => setz('rand', n)} />
        </Gruppe>
      </div>

      <div className="order-1 xl:order-2">
        <div className="space-y-4 xl:sticky xl:top-[124px]">
          <Buehne src={erstSrc} titel={t('Preview')} szene onFrame={(f) => {
            rahmen.current = f;
            f?.addEventListener('load', () => f.contentWindow?.postMessage({ comphub: 'fc-cfg', cfg }, OV), { once: true });
          }} kopf={<><span className="font-mono uppercase tracking-[0.18em]">1920 × 1080 · <T>live preview</T></span><span className="text-white/45"><T>Transparent in OBS</T></span></>} />

          <section className="rounded-2xl border border-white/[0.07] bg-fl p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} className={`${FELD} min-w-0 flex-1 sm:max-w-xs`} />
              <button type="button" onClick={() => void sichern()} className="rounded-lg px-5 py-2 text-sm font-bold text-black" style={{ background: FC_GOLD }}>
                {id ? t('Save changes') : t('Save and get OBS URL')}
              </button>
              {id && <button type="button" onClick={neu} className="rounded-lg border border-white/[0.1] px-3 py-2 text-xs font-semibold text-white/55 hover:text-white"><T>New</T></button>}
              {status && <span className="text-xs text-amber-200">{status}</span>}
            </div>
            {fehler && <p className="mt-2 text-xs text-rose-400">{fehler}</p>}
            {id && schmutzig && <p className="mt-2 text-xs text-orange-300"><T>Unsaved changes — OBS still shows the last saved version.</T></p>}
            {id ? (
              <div className="mt-4 space-y-3">
                <div>
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: FC_GOLD }}><T>OBS URL</T></p>
                  <KopierFeld wert={obsUrl} />
                  <p className="mt-1 text-[11px] text-white/45">
                    <T>Private: it carries a secret key and only draws while your account has access. Open it in a browser tab (F11 for full screen) or add it to OBS.</T>
                    {obsUrl && <>{' '}<a href={obsUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline" style={{ color: FC_GOLD }}><T>Open overlay</T> ↗</a></>}
                  </p>
                </div>
                {steuerUrl && (
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70"><T>Your mods can run the scoreboard for you</T></p>
                    <KopierFeld wert={steuerUrl} knopf="Copy link" />
                    <p className="mt-1 text-[11px] leading-relaxed text-white/45">
                      <T>Send this control link to a mod: score, rounds, series and the map header, on a phone too. The mod must be signed in with an account that has Finest Creative access — the link alone is not enough. Managers on your VIP access can open it as well.</T>
                      {' '}<a href={steuerUrl} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline" style={{ color: FC_GOLD }}><T>Open control</T> ↗</a>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="mt-3 text-xs text-white/55"><T>Save to get your OBS URL and the control link for your mods.</T></p>
            )}
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-fl p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-bold text-white"><T>How to add it in OBS</T></h3>
            <ObsSchritte breite={1920} hoehe={1080} />
          </section>

          <section className="rounded-2xl border border-white/[0.07] bg-fl p-4 sm:p-5">
            <h3 className="mb-3 text-sm font-bold text-white"><T>Your scoreboards</T></h3>
            <FcListe liste={liste} offen={id} waehlen={waehlen} entfernen={(x) => { void entfernen(x); if (x === id) neu(); }} />
          </section>
        </div>
      </div>
    </div>
  );
}

/** The saved scoreboards - a plain list (the shared one would copy a public overlay URL). */
function FcListe({ liste, offen, waehlen, entfernen }: {
  liste: OverlayEintrag[] | null; offen: string | null;
  waehlen: (o: OverlayEintrag) => void; entfernen: (id: string) => void;
}) {
  const t = useT();
  if (!liste) return <div className="h-16 animate-pulse rounded-xl bg-white/[0.03]" />;
  if (!liste.length) return <p className="text-xs text-white/45"><T>None saved yet.</T></p>;
  return (
    <ul className="space-y-1.5">
      {liste.map((o) => (
        <li key={o.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${o.id === offen ? 'border-[#f5b82e]/50' : 'border-white/[0.07]'}`}>
          <button type="button" onClick={() => waehlen(o)} className="min-w-0 flex-1 truncate text-left font-semibold text-white/85 hover:text-white">{o.name}</button>
          <button type="button" onClick={() => { if (window.confirm(t('Delete this scoreboard?'))) entfernen(o.id); }}
            className="shrink-0 text-xs text-white/45 hover:text-rose-300"><T>Delete</T></button>
        </li>
      ))}
    </ul>
  );
}
