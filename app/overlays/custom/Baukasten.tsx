'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import OverlayGeruest, { ARTEN, overlayAdresse, useOverlays, type OverlayEintrag } from '../OverlayGeruest';
import { MeineListe } from '../Teile';
import {
  Buehne, Farbe, FELD, Gruppe, KopierFeld, ObsSchritte, Schalter, Schieber, Segmente, Text,
} from '../Bausteine';

/*
 * Custom / Tokens - the configurator.
 *
 * The operator wanted a team-vs-team broadcast bar for custom matches, token
 * events and showmatches (reference: names stacked left and right, a big
 * "0 : 0", event title, "LIVE NOW"), in our own look, with everything
 * adjustable and a way to change the score live without touching OBS.
 *
 * One page: controls on the left, the overlay at real 1920 x 1080 on the
 * right (scaled), and below it the URL for OBS and the control link.
 */

export const STANDARD = {
  titel: 'MASTER MONDAYS', titelZeigen: true,
  live: 'LIVE NOW', liveZeigen: true,
  name1: 'TEAM A', name2: 'TEAM B', tag1: '', tag2: '', teamZeigen: true,
  spieler1: ['CHAP', 'KAAN', 'FASTROKI'] as string[], spieler2: ['NOCIFF', 'IZZI', 'AKIIRA'] as string[],
  laender1: [] as string[], laender2: [] as string[],
  flagge1: '', flagge2: '', logo1: '', logo2: '',
  punkte1: 0, punkte2: 0,
  stil: 'bar' as 'bar' | 'compact' | 'vertical',
  anordnung: 'stapel' as 'stapel' | 'reihe',
  grund: '#0b1120', deckkraft: 0.9,
  akzent1: '#3b82f6', akzent2: '#ef4444', text: '#ffffff', liveFarbe: '#ef4444',
  schrift: 'oswald', groesse: 1, ecken: 6,
  vert: 'top' as 'top' | 'middle' | 'bottom',
  horiz: 'center' as 'left' | 'center' | 'right',
  rand: 48,
  animation: 'pop' as 'pop' | 'flip' | 'glow' | 'none',
};
export type CustomConfig = typeof STANDARD;

/** Colour presets - our own palettes, no borrowed branding. */
export const PRESETS: Array<{ name: string; setzt: Partial<CustomConfig> }> = [
  { name: 'Midnight', setzt: { grund: '#0b1120', deckkraft: 0.9, akzent1: '#3b82f6', akzent2: '#ef4444', text: '#ffffff', liveFarbe: '#ef4444' } },
  { name: 'Ice', setzt: { grund: '#0e1726', deckkraft: 0.86, akzent1: '#38bdf8', akzent2: '#a78bfa', text: '#f1f5f9', liveFarbe: '#38bdf8' } },
  { name: 'Ember', setzt: { grund: '#1a0f0f', deckkraft: 0.9, akzent1: '#f97316', akzent2: '#e11d48', text: '#fff7ed', liveFarbe: '#f43f5e' } },
  { name: 'Mono', setzt: { grund: '#111111', deckkraft: 0.92, akzent1: '#e5e7eb', akzent2: '#6b7280', text: '#ffffff', liveFarbe: '#ffffff' } },
  { name: 'Violet', setzt: { grund: '#140f24', deckkraft: 0.88, akzent1: '#8b5cf6', akzent2: '#ec4899', text: '#faf5ff', liveFarbe: '#ec4899' } },
  { name: 'Glass', setzt: { grund: '#000000', deckkraft: 0.45, akzent1: '#60a5fa', akzent2: '#f87171', text: '#ffffff', liveFarbe: '#f87171' } },
];

const SCHRIFTEN = [
  { wert: 'oswald', titel: 'Oswald' }, { wert: 'barlow', titel: 'Barlow' }, { wert: 'bebas', titel: 'Bebas' },
  { wert: 'rajdhani', titel: 'Rajdhani' }, { wert: 'chakra', titel: 'Chakra' }, { wert: 'inter', titel: 'Inter' },
  { wert: 'anton', titel: 'Anton' },
];
const AKZENTE = ['#3b82f6', '#38bdf8', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#e5e7eb'];

/** The URL that carries every setting itself - for use without saving. */
export function customParamUrl(c: CustomConfig, basis: string): string {
  const p = new URLSearchParams();
  const ohneRaute = (v: string) => v.replace(/^#/, '');
  p.set('title', c.titel);
  p.set('t1', c.name1); p.set('t2', c.name2);
  if (c.tag1) p.set('tag1', c.tag1);
  if (c.tag2) p.set('tag2', c.tag2);
  p.set('p1', c.spieler1.filter(Boolean).join(','));
  p.set('p2', c.spieler2.filter(Boolean).join(','));
  if (c.laender1.some(Boolean)) p.set('fl1', c.laender1.join(','));
  if (c.laender2.some(Boolean)) p.set('fl2', c.laender2.join(','));
  if (c.flagge1) p.set('f1', c.flagge1);
  if (c.flagge2) p.set('f2', c.flagge2);
  if (c.logo1) p.set('logo1', c.logo1);
  if (c.logo2) p.set('logo2', c.logo2);
  p.set('s1', String(c.punkte1)); p.set('s2', String(c.punkte2));
  p.set('style', c.stil);
  p.set('layout', c.anordnung === 'reihe' ? 'inline' : 'stacked');
  p.set('c1', ohneRaute(c.akzent1)); p.set('c2', ohneRaute(c.akzent2));
  p.set('bg', ohneRaute(c.grund)); p.set('op', String(Math.round(c.deckkraft * 100)));
  p.set('text', ohneRaute(c.text)); p.set('livecolor', ohneRaute(c.liveFarbe));
  p.set('font', c.schrift); p.set('scale', String(c.groesse)); p.set('radius', String(c.ecken));
  p.set('v', c.vert); p.set('h', c.horiz); p.set('margin', String(c.rand));
  p.set('anim', c.animation);
  p.set('live', c.live);
  if (!c.titelZeigen) p.set('hideTitle', '1');
  if (!c.liveZeigen) p.set('hideLive', '1');
  if (!c.teamZeigen) p.set('hideTeams', '1');
  return `${basis}/overlay/custom.html?${p.toString()}`;
}

interface Fund { epicId: string; anzeige: string; land: string | null }

/** One player slot with a search in our player directory (name + flag). */
function SpielerZeile({ name, land, setzen, entfernen }: {
  name: string; land: string; setzen: (name: string, land: string) => void; entfernen?: () => void;
}) {
  const t = useT();
  const [offen, setOffen] = useState(false);
  const [funde, setFunde] = useState<Fund[]>([]);
  useEffect(() => {
    const q = name.trim();
    if (!offen || q.length < 2) { setFunde([]); return undefined; }
    const uhr = window.setTimeout(() => {
      fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((j) => setFunde((Array.isArray(j?.spieler) ? j.spieler : []).slice(0, 6)))
        .catch(() => setFunde([]));
    }, 350);
    return () => window.clearTimeout(uhr);
  }, [name, offen]);
  return (
    <div className="relative flex items-center gap-1.5">
      <input value={land} maxLength={2} onChange={(e) => setzen(name, e.target.value.toLowerCase().replace(/[^a-z]/g, ''))}
        placeholder="cc" title={t('Flag (country code, e.g. de)')}
        className={`${FELD} w-12 shrink-0 px-2 text-center font-mono text-xs uppercase`} />
      {/^[a-z]{2}$/.test(land) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/flags/${land}.png`} alt="" className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover" />
      )}
      <input value={name} maxLength={24} onChange={(e) => setzen(e.target.value, land)}
        onFocus={() => setOffen(true)} onBlur={() => window.setTimeout(() => setOffen(false), 150)}
        placeholder={t('Player name')} className={`${FELD} min-w-0 flex-1 uppercase`} />
      {entfernen && (
        <button type="button" onClick={entfernen} title={t('Remove')}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.08] text-slate-500 transition hover:border-rose-400/60 hover:text-rose-300">×</button>
      )}
      {offen && funde.length > 0 && (
        <div className="absolute left-14 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-white/10 bg-[#0d1119] shadow-2xl">
          {funde.map((f) => (
            <button key={f.epicId} type="button" onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setzen(f.anzeige.toUpperCase(), (f.land ?? '').toLowerCase()); setOffen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-white/[0.05]">
              {f.land
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/flags/${f.land.toLowerCase()}.png`} alt="" className="h-3 w-[18px] rounded-[2px] object-cover" />
                : <span className="h-3 w-[18px]" />}
              <span className="truncate">{f.anzeige}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamKarte({ n, cfg, setz }: {
  n: 1 | 2; cfg: CustomConfig;
  setz: <K extends keyof CustomConfig>(k: K, v: CustomConfig[K]) => void;
}) {
  const sk = (n === 1 ? 'spieler1' : 'spieler2') as 'spieler1';
  const lk = (n === 1 ? 'laender1' : 'laender2') as 'laender1';
  const spieler = cfg[sk];
  const laender = cfg[lk];
  const akzent = n === 1 ? cfg.akzent1 : cfg.akzent2;
  const setzeSpieler = (i: number, name: string, land: string) => {
    const s = [...spieler]; const l = [...laender];
    s[i] = name; while (l.length < s.length) l.push(''); l[i] = land;
    setz(sk, s); setz(lk, l);
  };
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3" style={{ boxShadow: `inset 3px 0 0 ${akzent}` }}>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: akzent }}>
        <T>{n === 1 ? 'Left team' : 'Right team'}</T>
      </p>
      <div className="grid grid-cols-[1fr_88px] gap-2">
        <Text titel="Team name" wert={n === 1 ? cfg.name1 : cfg.name2} setzen={(v) => setz(n === 1 ? 'name1' : 'name2', v)} max={28} />
        <Text titel="Short tag" wert={n === 1 ? cfg.tag1 : cfg.tag2} setzen={(v) => setz(n === 1 ? 'tag1' : 'tag2', v.toUpperCase())} max={5} />
      </div>
      <p className="mb-1 mt-3 text-[11px] font-medium uppercase tracking-wider text-slate-500"><T>Players</T> ({spieler.length}/4)</p>
      <div className="space-y-1.5">
        {spieler.map((s, i) => (
          <SpielerZeile key={i} name={s} land={laender[i] ?? ''} setzen={(a, b) => setzeSpieler(i, a, b)}
            entfernen={spieler.length > 1 ? () => { setz(sk, spieler.filter((_, k) => k !== i)); setz(lk, laender.filter((_, k) => k !== i)); } : undefined} />
        ))}
      </div>
      {spieler.length < 4 && (
        <button type="button" onClick={() => setz(sk, [...spieler, ''])}
          className="mt-2 w-full rounded-lg border border-dashed border-white/[0.12] py-1.5 text-xs font-semibold text-slate-400 transition hover:border-sky-400/60 hover:text-sky-300">
          + <T>Add player</T>
        </button>
      )}
      <div className="mt-3 grid grid-cols-[88px_1fr] gap-2">
        <Text titel="Team flag" wert={n === 1 ? cfg.flagge1 : cfg.flagge2} platzhalter="de"
          setzen={(v) => setz(n === 1 ? 'flagge1' : 'flagge2', v.toLowerCase().replace(/[^a-z]/g, '').slice(0, 2))} max={2} />
        <Text titel="Logo URL (optional)" wert={n === 1 ? cfg.logo1 : cfg.logo2} platzhalter="https://…/logo.png"
          setzen={(v) => setz(n === 1 ? 'logo1' : 'logo2', v.trim())} max={400} />
      </div>
    </div>
  );
}

export default function CustomBaukasten() {
  const t = useT();
  const art = ARTEN.find((a) => a.schluessel === 'custom')!;
  const { liste, fehler, speichern, entfernen } = useOverlays('custom');
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState('Custom scoreboard');
  const [cfg, setCfg] = useState<CustomConfig>(STANDARD);
  const [schmutzig, setSchmutzig] = useState(false);
  const [status, setStatus] = useState('');
  const [basis, setBasis] = useState('');
  useEffect(() => { setBasis(window.location.origin); }, []);

  const setz = <K extends keyof CustomConfig>(k: K, v: CustomConfig[K]) => {
    setCfg((a) => ({ ...a, [k]: v }));
    setSchmutzig(true);
  };

  /*
   * The preview frame loads once per "look"; score and text changes are
   * pushed in with postMessage so the score animation can be seen.
   */
  const rahmen = useRef<HTMLIFrameElement | null>(null);
  const [erstSrc] = useState(() => `/overlay/custom.html?vorschau=${encodeURIComponent(JSON.stringify(STANDARD))}`);
  useEffect(() => {
    rahmen.current?.contentWindow?.postMessage({ comphub: 'custom-cfg', cfg }, window.location.origin);
  }, [cfg]);

  function waehlen(o: OverlayEintrag) {
    setId(o.id);
    setName(o.name);
    setCfg({ ...STANDARD, ...(o.config as Partial<CustomConfig>) });
    setSchmutzig(false);
  }
  function neu() { setId(null); setName('Custom scoreboard'); setCfg(STANDARD); setSchmutzig(false); }

  const [ausAdresse, setAusAdresse] = useState(false);
  useEffect(() => {
    if (ausAdresse || !liste) return;
    const w = new URLSearchParams(window.location.search).get('id');
    const o = w ? liste.find((x) => x.id === w) : undefined;
    if (o) waehlen(o);
    setAusAdresse(true);
  }, [liste, ausAdresse]);

  async function sichern() {
    const neuId = await speichern({ id: id ?? undefined, name, config: cfg });
    if (!neuId) return;
    setId(neuId);
    setSchmutzig(false);
    setStatus(t('Saved — live in OBS within seconds'));
    window.setTimeout(() => setStatus(''), 2200);
  }

  /** Score: straight to the server when saved, so OBS follows at once. */
  async function zaehle(seite: 1 | 2 | 0, um: number) {
    const k = seite === 1 ? 'punkte1' : 'punkte2';
    const naechst = seite === 0 ? { ...cfg, punkte1: 0, punkte2: 0 }
      : { ...cfg, [k]: Math.max(0, Math.min(999, cfg[k] + um)) };
    setCfg(naechst);
    if (!id) { setSchmutzig(true); return; }
    try {
      await fetch('/api/overlay-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, punkte: { p1: naechst.punkte1, p2: naechst.punkte2 } }),
      });
    } catch { /* next click */ }
  }

  const eintrag = id ? liste?.find((o) => o.id === id) : undefined;
  const obsUrl = id ? overlayAdresse('custom', id) : '';
  const steuerUrl = id && eintrag?.steuer ? `${basis}/overlays/custom/control?id=${id}&key=${eintrag.steuer}` : '';
  const paramUrl = useMemo(() => (basis ? customParamUrl(cfg, basis) : ''), [cfg, basis]);

  return (
    <OverlayGeruest aktiv="custom" immerBaukasten>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
        {/* ------------------------------------------------ controls */}
        <div className="order-2 space-y-4 xl:order-1">
          <Gruppe titel="Score" text={id ? 'Saved: every click is live in OBS within ~2 seconds.' : 'Save once — then every click goes straight to OBS.'}>
            <div className="grid grid-cols-2 gap-3">
              {([1, 2] as const).map((s) => (
                <div key={s} className="rounded-xl border border-white/[0.07] bg-black/30 p-3 text-center">
                  <p className="truncate text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: s === 1 ? cfg.akzent1 : cfg.akzent2 }}>
                    {(s === 1 ? cfg.tag1 || cfg.name1 : cfg.tag2 || cfg.name2) || '—'}
                  </p>
                  <p className="my-1 font-mono text-4xl font-black tabular-nums text-white">{s === 1 ? cfg.punkte1 : cfg.punkte2}</p>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => void zaehle(s, -1)} className="h-10 flex-1 rounded-lg border border-white/[0.1] text-lg font-bold text-slate-300 transition hover:border-white/30">−</button>
                    <button type="button" onClick={() => void zaehle(s, 1)} className="h-10 flex-[2] rounded-lg bg-sky-500 text-lg font-bold text-white transition hover:bg-sky-400">+</button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => void zaehle(0, 0)}
              className="w-full rounded-lg border border-white/[0.08] py-1.5 text-xs font-semibold text-slate-400 transition hover:text-slate-200">
              <T>Reset to 0 : 0</T>
            </button>
          </Gruppe>

          <Gruppe titel="Event">
            <Text titel="Title" wert={cfg.titel} setzen={(v) => setz('titel', v)} platzhalter="MASTER MONDAYS" />
            <div className="grid grid-cols-2 gap-2">
              <Schalter titel="Show title" an={cfg.titelZeigen} setzen={(b) => setz('titelZeigen', b)} />
              <Schalter titel="Show live tag" an={cfg.liveZeigen} setzen={(b) => setz('liveZeigen', b)} />
            </div>
            {cfg.liveZeigen && <Text titel="Live tag text" wert={cfg.live} setzen={(v) => setz('live', v)} max={20} />}
          </Gruppe>

          <Gruppe titel="Teams and players" text="1–4 players per side. Type to search our player directory — it fills in the name and flag.">
            <TeamKarte n={1} cfg={cfg} setz={setz} />
            <TeamKarte n={2} cfg={cfg} setz={setz} />
            <Schalter titel="Show team names above the players" an={cfg.teamZeigen} setzen={(b) => setz('teamZeigen', b)} />
            <button type="button" onClick={() => setCfg((a) => ({
              ...a, name1: a.name2, name2: a.name1, tag1: a.tag2, tag2: a.tag1, spieler1: a.spieler2, spieler2: a.spieler1,
              laender1: a.laender2, laender2: a.laender1, flagge1: a.flagge2, flagge2: a.flagge1, logo1: a.logo2, logo2: a.logo1,
              punkte1: a.punkte2, punkte2: a.punkte1,
            }))}
              className="w-full rounded-lg border border-white/[0.08] py-1.5 text-xs font-semibold text-slate-400 transition hover:text-slate-200">
              ⇄ <T>Swap sides</T>
            </button>
          </Gruppe>

          <Gruppe titel="Layout">
            <Segmente titel="Style" wert={cfg.stil} setzen={(v) => setz('stil', v)}
              optionen={[{ wert: 'bar', titel: 'Broadcast bar' }, { wert: 'compact', titel: 'Compact' }, { wert: 'vertical', titel: 'Sidebar' }]} />
            {cfg.stil !== 'compact' && (
              <Segmente titel="Player names" wert={cfg.anordnung} setzen={(v) => setz('anordnung', v)}
                optionen={[{ wert: 'stapel', titel: 'Stacked' }, { wert: 'reihe', titel: 'Inline' }]} />
            )}
            <Segmente titel="Score animation" wert={cfg.animation} setzen={(v) => setz('animation', v)}
              optionen={[{ wert: 'pop', titel: 'Pop' }, { wert: 'flip', titel: 'Flip' }, { wert: 'glow', titel: 'Glow' }, { wert: 'none', titel: 'None' }]} />
          </Gruppe>

          <Gruppe titel="Colours and font">
            <div>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500"><T>Presets</T></span>
              <div className="grid grid-cols-3 gap-1.5">
                {PRESETS.map((p) => (
                  <button key={p.name} type="button" onClick={() => { setCfg((a) => ({ ...a, ...p.setzt })); setSchmutzig(true); }}
                    className="flex items-center gap-2 rounded-lg border border-white/[0.08] px-2 py-1.5 text-left text-xs font-semibold text-slate-300 transition hover:border-sky-400/60">
                    <span className="flex h-4 w-7 overflow-hidden rounded" style={{ background: p.setzt.grund }}>
                      <span className="w-1/2" style={{ background: p.setzt.akzent1 }} /><span className="w-1/2" style={{ background: p.setzt.akzent2 }} />
                    </span>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Farbe titel="Left accent" wert={cfg.akzent1} setzen={(v) => setz('akzent1', v)} vorschlaege={AKZENTE.slice(0, 4)} />
              <Farbe titel="Right accent" wert={cfg.akzent2} setzen={(v) => setz('akzent2', v)} vorschlaege={AKZENTE.slice(3)} />
              <Farbe titel="Background" wert={cfg.grund} setzen={(v) => setz('grund', v)} vorschlaege={['#0b1120', '#111111', '#140f24']} />
              <Farbe titel="Text" wert={cfg.text} setzen={(v) => setz('text', v)} vorschlaege={['#ffffff', '#e2e8f0']} />
              <Farbe titel="Live tag" wert={cfg.liveFarbe} setzen={(v) => setz('liveFarbe', v)} vorschlaege={['#ef4444', '#38bdf8']} />
            </div>
            <Schieber titel="Background opacity" wert={Math.round(cfg.deckkraft * 100)} von={0} bis={100} einheit=" %"
              setzen={(n) => setz('deckkraft', n / 100)} />
            <div>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500"><T>Font</T></span>
              <select value={cfg.schrift} onChange={(e) => setz('schrift', e.target.value)} className={`${FELD} w-full`}>
                {SCHRIFTEN.map((s) => <option key={s.wert} value={s.wert}>{s.titel}</option>)}
              </select>
            </div>
          </Gruppe>

          <Gruppe titel="Position and size" text="The board places itself on the 1920 × 1080 source — no need to move it in OBS.">
            <Segmente titel="Vertical" wert={cfg.vert} setzen={(v) => setz('vert', v)}
              optionen={[{ wert: 'top', titel: 'Top' }, { wert: 'middle', titel: 'Middle' }, { wert: 'bottom', titel: 'Bottom' }]} />
            <Segmente titel="Horizontal" wert={cfg.horiz} setzen={(v) => setz('horiz', v)}
              optionen={[{ wert: 'left', titel: 'Left' }, { wert: 'center', titel: 'Centre' }, { wert: 'right', titel: 'Right' }]} />
            <Schieber titel="Size" wert={cfg.groesse} von={0.5} bis={2} schritt={0.05} setzen={(n) => setz('groesse', n)} anzeige={(n) => `${Math.round(n * 100)} %`} />
            <Schieber titel="Distance from the edge" wert={cfg.rand} von={0} bis={200} schritt={4} einheit=" px" setzen={(n) => setz('rand', n)} />
            <Schieber titel="Corner radius" wert={cfg.ecken} von={0} bis={24} einheit=" px" setzen={(n) => setz('ecken', n)} />
          </Gruppe>
        </div>

        {/* ------------------------------------------------ preview + output */}
        <div className="order-1 space-y-4 xl:order-2">
          <div className="xl:sticky xl:top-20 space-y-4">
            <Buehne src={erstSrc} titel={t('Preview')} szene onFrame={(f) => {
              rahmen.current = f;
              f?.addEventListener('load', () => f.contentWindow?.postMessage({ comphub: 'custom-cfg', cfg }, window.location.origin), { once: true });
            }}
              kopf={<>
                <span className="font-mono uppercase tracking-[0.18em]">1920 × 1080 · <T>live preview</T></span>
                <span className="text-slate-500"><T>Transparent in OBS</T></span>
              </>} />

            <section className="rounded-2xl border border-white/[0.07] bg-[#10141c] p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Name')}
                  className={`${FELD} min-w-0 flex-1 sm:max-w-xs`} />
                <button type="button" onClick={() => void sichern()}
                  className="rounded-lg bg-sky-500 px-5 py-2 text-sm font-bold text-white transition hover:bg-sky-400">
                  {id ? t('Save changes') : t('Save and get OBS URL')}
                </button>
                {id && (
                  <button type="button" onClick={neu} className="rounded-lg border border-white/[0.1] px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200">
                    <T>New</T>
                  </button>
                )}
                {status && <span className="text-xs text-sky-300">{status}</span>}
              </div>
              {fehler && <p className="mt-2 text-xs text-rose-400">{fehler}</p>}
              {id && schmutzig && <p className="mt-2 text-xs text-orange-300"><T>Unsaved changes — OBS still shows the last saved version.</T></p>}

              {id ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-300"><T>OBS URL</T></p>
                    <KopierFeld wert={obsUrl} />
                  </div>
                  {steuerUrl && (
                    <div>
                      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-300"><T>Score control link</T></p>
                      <KopierFeld wert={steuerUrl} knopf="Copy link" />
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        <T>Your mods can run the scoreboard for you: send them this link (no account needed — big + and − buttons, works on a phone). Anyone with the link can change the score and nothing else. Managers on your VIP access can also open it without the link.</T>
                        {' '}<a href={steuerUrl} target="_blank" rel="noreferrer" className="text-sky-300 underline-offset-2 hover:underline"><T>Open control</T> ↗</a>
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  <p className="text-xs text-slate-400"><T>Save to get a fixed OBS URL whose score you can change live. Or use the link below — it carries all settings, but its score only changes if you copy a new link.</T></p>
                  <KopierFeld wert={paramUrl} knopf="Copy static URL" klein />
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/[0.07] bg-[#10141c] p-4 sm:p-5">
              <h3 className="mb-3 text-sm font-bold text-slate-100"><T>How to add it in OBS</T></h3>
              <ObsSchritte breite={art.obs.b} hoehe={art.obs.h} />
            </section>

            <section className="rounded-2xl border border-white/[0.07] bg-[#10141c] p-4 sm:p-5">
              <h3 className="mb-3 text-sm font-bold text-slate-100"><T>Your scoreboards</T></h3>
              <MeineListe liste={liste} typ="custom" offen={id} waehlen={waehlen}
                entfernen={(x) => { void entfernen(x); if (x === id) neu(); }} />
            </section>
          </div>
        </div>
      </div>
    </OverlayGeruest>
  );
}
