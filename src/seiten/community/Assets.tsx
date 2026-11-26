import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Glas } from '../../teile/Glas';
import { LinkKopieren, useHubDatei } from './Bausteine';
import { Laedt, TEAL, Ueberschrift } from './Teile';
import SPIEL_SYMBOLE from './spielSymbole.json';

/*
 * Asset Studio (Betreiber, 26.11.2026 - eigene Umsetzung der Idee): Galerie aller Waffen- und Gegenstandsbilder nach Kategorie, Detailansicht mit
 * Schachbrett-Vorschau und Reglern (Temperatur, Toenung, Saettigung, Farbton, Helligkeit, Kontrast, Lichter, Tiefen, Weiss, Schwarz) plus
 * Hintergrund (Farbe/Verlauf), gerechnet auf einem Canvas Pixel fuer Pixel - Download PNG, In die Zwischenablage, Zuruecksetzen, Link mit den
 * Einstellungen in der Adresse.
 *
 * Bilder: zuerst /hub-daten/assets.json aus dem Export der Spieldateien (volle Menge, PNG mit Alpha - Format: { assets: [{ id, name, class,
 * rarity?, season?, image }] }), sonst was die Seite schon hat: die Symbole unter /waffen (spielSymbole.json, gleiche Herkunft, 160 px) und das
 * Fortnite-Wiki (/api/waffen-bilder). Nie hochskaliert: das Bild wird in seiner eigenen Groesse gerechnet und exportiert.
 */

export interface Asset { id: string; name: string; klasse: string; bild: string; seltenheit?: string; saison?: string; fremd?: boolean }
const KATEGORIEN: Array<{ k: string; titel: string; gruppe: 'Weapons' | 'Other' }> = [
  { k: 'ar', titel: 'Assault Rifles', gruppe: 'Weapons' }, { k: 'shotgun', titel: 'Shotguns', gruppe: 'Weapons' }, { k: 'smg', titel: 'SMGs', gruppe: 'Weapons' },
  { k: 'pistol', titel: 'Pistols', gruppe: 'Weapons' }, { k: 'sniper', titel: 'Snipers', gruppe: 'Weapons' }, { k: 'bow', titel: 'Bows', gruppe: 'Weapons' },
  { k: 'marksman', titel: 'Marksman', gruppe: 'Weapons' }, { k: 'explosive', titel: 'Explosives', gruppe: 'Weapons' }, { k: 'melee', titel: 'Melee', gruppe: 'Weapons' },
  { k: 'consumable', titel: 'Consumables', gruppe: 'Other' }, { k: 'item', titel: 'Items', gruppe: 'Other' }, { k: 'trap', titel: 'Traps', gruppe: 'Other' },
  { k: 'medallion', titel: 'Medallions', gruppe: 'Other' }, { k: 'boon', titel: 'Boons', gruppe: 'Other' }, { k: 'currency', titel: 'Currency', gruppe: 'Other' },
  { k: 'material', titel: 'Materials', gruppe: 'Other' }, { k: 'vehicle', titel: 'Vehicles', gruppe: 'Other' }, { k: 'container', titel: 'Containers', gruppe: 'Other' },
  { k: 'object', titel: 'Objects', gruppe: 'Other' }, { k: 'creature', titel: 'Creatures', gruppe: 'Other' },
];
const WAFFEN_KLASSEN = new Set(KATEGORIEN.filter((k) => k.gruppe === 'Weapons').map((k) => k.k));

/** Kategorie aus Bauplan/Name - nur fuer die Bilder ohne Manifest. */
function klasseVon(schluessel: string, name: string): string {
  const s = `${schluessel} ${name}`.toLowerCase();
  if (/\bbow\b|_bow|bow_/.test(s)) return 'bow';
  if (/dmr|marksman/.test(s)) return 'marksman';
  if (/sniper|hunting_rifle|huntingrifle|heavy_rifle/.test(s)) return 'sniper';
  if (/shotgun/.test(s)) return 'shotgun';
  if (/smg|submachine|machine_pistol|pistol_machine|machinepistol|minigun/.test(s)) return 'smg';
  if (/pistol|revolver|handcannon|hand cannon|deagle|sidearm/.test(s)) return 'pistol';
  if (/launcher|rocket|grenade|rpg|c4|explosive|dynamite|bomb/.test(s)) return 'explosive';
  if (/sword|katana|pickaxe|melee|blade|scythe|saber|lightsaber/.test(s)) return 'melee';
  if (/assault|rifle|_ar\b|_ar_|blaster/.test(s)) return 'ar';
  if (/heal|med|shield|potion|slurp|bandage|splash|fish|food|fruit|consum/.test(s)) return 'consumable';
  if (/trap/.test(s)) return 'trap';
  if (/medallion/.test(s)) return 'medallion';
  return 'item';
}

export function useAssets(): { liste: Asset[] | null; ausExport: boolean } {
  const { daten, status } = useHubDatei<{ assets: Array<{ id: string; name: string; class: string; rarity?: string; season?: string; image: string }> }>('assets.json');
  const [wiki, setWiki] = useState<Record<string, { name: string; bild: string }> | null>(null);
  useEffect(() => { if (status === 'fehlt') fetch('/api/waffen-bilder').then((r) => r.json()).then(setWiki).catch(() => setWiki({})); }, [status]);
  const liste = useMemo(() => {
    if (daten?.assets?.length) return daten.assets.map((a) => ({ id: a.id, name: a.name, klasse: a.class, bild: a.image, seltenheit: a.rarity, saison: a.season }));
    if (status !== 'fehlt' || !wiki) return null;
    const m = new Map<string, Asset>(); const namen = new Set<string>();
    for (const [k, [name, datei]] of Object.entries(SPIEL_SYMBOLE as unknown as Record<string, [string, string]>)) {
      if (namen.has(name)) continue; namen.add(name);
      m.set(k, { id: k, name, klasse: klasseVon(k, name), bild: `/waffen/${datei}.webp` });
    }
    for (const [k, v] of Object.entries(wiki)) {
      if (namen.has(v.name)) continue; namen.add(v.name);
      m.set(k.toLowerCase(), { id: k.toLowerCase(), name: v.name, klasse: klasseVon(k, v.name), bild: v.bild.replace(/\/scale-to-width-down\/\d+/, ''), fremd: true });
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [daten, status, wiki]);
  return { liste, ausExport: !!daten?.assets?.length };
}

export default function Assets() {
  const { liste, ausExport } = useAssets();
  return (
    <Routes>
      <Route index element={<Galerie liste={liste} ausExport={ausExport} />} />
      <Route path=":id" element={<Studio liste={liste} />} />
    </Routes>
  );
}

const SCHACH = { backgroundImage: 'repeating-conic-gradient(rgba(255,255,255,0.08) 0 25%, transparent 0 50%)', backgroundSize: '18px 18px' };

function Galerie({ liste, ausExport }: { liste: Asset[] | null; ausExport: boolean }) {
  const [kat, setKat] = useState('weapons');
  const [suche, setSuche] = useState('');
  if (!liste) return <Laedt farbe={TEAL} text="Loading every weapon and item image …" />;
  const passt = (a: Asset, k: string) => (k === 'alle' ? true : k === 'weapons' ? WAFFEN_KLASSEN.has(a.klasse) : a.klasse === k);
  const gezeigt = liste.filter((a) => passt(a, kat) && a.name.toLowerCase().includes(suche.toLowerCase()));
  const chip = (k: string, t: string) => {
    const n = liste.filter((a) => passt(a, k)).length; if (!n && k !== kat) return null;
    return <button key={k} type="button" onClick={() => setKat(k)} className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${kat === k ? 'border-teal-300/50 bg-teal-300/15 text-white' : 'border-white/10 text-white/55 hover:text-white'}`}>{t}<span className="ml-1 text-white/35">{n}</span></button>;
  };
  return (
    <div className="space-y-6">
      <Ueberschrift ueber="Community · Loot" titel="Asset studio" farbe={TEAL} text="Every weapon and item image – recolour it, put it on any background, download a PNG or copy it straight into your thumbnail." />
      <Glas className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Weapons</span>
          {chip('weapons', 'All weapons')}{KATEGORIEN.filter((k) => k.gruppe === 'Weapons').map((k) => chip(k.k, k.titel))}
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Search…" className="ml-auto w-56 rounded-xl border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-teal-300/60 focus:outline-none" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">Other</span>
          {chip('alle', 'Everything')}{KATEGORIEN.filter((k) => k.gruppe === 'Other').map((k) => chip(k.k, k.titel))}
        </div>
      </Glas>
      {!ausExport && <p className="text-xs text-white/40">Showing the images the site already has ({liste.length}). The full set – every weapon and item, per rarity, as transparent PNG – comes with the game-file export.</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
        {gezeigt.slice(0, 400).map((a, i) => (
          <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.01, 0.4) }} whileHover={{ y: -4 }}>
            <Link to={`/community/assets/${encodeURIComponent(a.id)}`} className="group block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-teal-300/40">
              <div className="grid aspect-square place-items-center bg-[#0b111c] p-3" style={SCHACH}>
                <img src={a.bild} alt={a.name} loading="lazy" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain transition duration-300 group-hover:scale-105" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.15'; }} />
              </div>
              <p className="truncate px-2.5 py-2 text-xs font-semibold text-white/80">{a.name}</p>
            </Link>
          </motion.div>
        ))}
      </div>
      {gezeigt.length > 400 && <p className="text-xs text-white/40">Showing 400 of {gezeigt.length} – search to narrow it down.</p>}
    </div>
  );
}

/* ---------------------------------------------- Studio */
const REGLER = [
  { k: 'temp', t: 'Temperature' }, { k: 'tint', t: 'Tint' }, { k: 'sat', t: 'Saturation' }, { k: 'hue', t: 'Hue', min: -180, max: 180 },
  { k: 'hell', t: 'Brightness' }, { k: 'kontrast', t: 'Contrast' }, { k: 'lichter', t: 'Highlights' }, { k: 'tiefen', t: 'Shadows' },
  { k: 'weiss', t: 'Whites' }, { k: 'schwarz', t: 'Blacks' },
] as const;
type ReglerK = (typeof REGLER)[number]['k'];
type Werte = Record<ReglerK, number> & { bg: 'none' | 'farbe' | 'verlauf'; f1: string; f2: string; winkel: number; rand: number };
const START: Werte = { temp: 0, tint: 0, sat: 0, hue: 0, hell: 0, kontrast: 0, lichter: 0, tiefen: 0, weiss: 0, schwarz: 0, bg: 'none', f1: '#0f766e', f2: '#4c1d95', winkel: 135, rand: 12 };

/** Pixel fuer Pixel: Weissabgleich, Farbton, Saettigung, Helligkeit/Kontrast, Lichter/Tiefen, Weiss-/Schwarzpunkt. */
function bearbeiten(d: Uint8ClampedArray, w: Werte) {
  const h = (w.hue * Math.PI) / 180; const c = Math.cos(h); const s = Math.sin(h);
  // Farbton-Drehung um die Grauachse (bekannte Matrix)
  const m = [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072];
  const kv = w.kontrast * 2.55; const kf = (259 * (kv + 255)) / (255 * (259 - kv));
  const sw = w.schwarz * 0.6; const ws = 255 - w.weiss * 0.6;
  const glatt = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let r = d[i]; let g = d[i + 1]; let b = d[i + 2];
    r += w.temp * 0.6; b -= w.temp * 0.6; g -= w.tint * 0.5; r += w.tint * 0.15; b += w.tint * 0.15;
    if (w.hue) { const nr = m[0] * r + m[1] * g + m[2] * b; const ng = m[3] * r + m[4] * g + m[5] * b; const nb = m[6] * r + m[7] * g + m[8] * b; r = nr; g = ng; b = nb; }
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sf = 1 + w.sat / 100; r = l + (r - l) * sf; g = l + (g - l) * sf; b = l + (b - l) * sf;
    const hv = w.hell * 1.6; r += hv; g += hv; b += hv;
    r = kf * (r - 128) + 128; g = kf * (g - 128) + 128; b = kf * (b - 128) + 128;
    const ln = Math.min(1, Math.max(0, (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255));
    const plus = w.lichter * 1.2 * glatt(0.45, 1, ln) + w.tiefen * 1.2 * (1 - glatt(0, 0.55, ln));
    r += plus; g += plus; b += plus;
    r = ((r - sw) / (ws - sw)) * 255; g = ((g - sw) / (ws - sw)) * 255; b = ((b - sw) / (ws - sw)) * 255;
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
}

function Studio({ liste }: { liste: Asset[] | null }) {
  const { id } = useParams(); const nav = useNavigate();
  const [suche, setSuche] = useSearchParams();
  const a = liste?.find((x) => x.id === decodeURIComponent(id ?? ''));
  const [w, setW] = useState<Werte>(() => { try { return { ...START, ...JSON.parse(atob(suche.get('s') ?? '') || '{}') }; } catch { return START; } });
  const [bild, setBild] = useState<HTMLImageElement | null>(null);
  const [gesperrt, setGesperrt] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const leinwand = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!a) return;
    setBild(null); setGesperrt(false);
    // Erst mit CORS laden (dann darf der Canvas exportieren); geht das nicht, das Bild trotzdem zeigen, aber Bearbeiten/Export sperren.
    const img = new Image(); img.crossOrigin = 'anonymous'; img.referrerPolicy = 'no-referrer';
    img.onload = () => setBild(img);
    img.onerror = () => { const roh = new Image(); roh.referrerPolicy = 'no-referrer'; roh.onload = () => { setBild(roh); setGesperrt(true); }; roh.src = a.bild; };
    img.src = a.bild;
  }, [a]);

  useEffect(() => {
    const cv = leinwand.current; if (!cv || !bild) return;
    const bw = bild.naturalWidth; const bh = bild.naturalHeight; const r = Math.round((Math.max(bw, bh) * w.rand) / 100);
    cv.width = bw + 2 * r; cv.height = bh + 2 * r;
    const ctx = cv.getContext('2d')!; ctx.clearRect(0, 0, cv.width, cv.height);
    if (w.bg !== 'none') {
      if (w.bg === 'farbe') ctx.fillStyle = w.f1;
      else {
        const rad = (w.winkel * Math.PI) / 180; const cx = cv.width / 2; const cy = cv.height / 2; const l = Math.max(cv.width, cv.height) / 2;
        const gr = ctx.createLinearGradient(cx - Math.cos(rad) * l, cy - Math.sin(rad) * l, cx + Math.cos(rad) * l, cy + Math.sin(rad) * l); gr.addColorStop(0, w.f1); gr.addColorStop(1, w.f2); ctx.fillStyle = gr;
      }
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
    // Erst das Bild allein bearbeiten (eigene Leinwand), dann auf den Hintergrund legen - so bleibt der Hintergrund unberuehrt.
    const tmp = document.createElement('canvas'); tmp.width = bw; tmp.height = bh; const t = tmp.getContext('2d')!; t.drawImage(bild, 0, 0);
    if (!gesperrt) { try { const daten = t.getImageData(0, 0, bw, bh); bearbeiten(daten.data, w); t.putImageData(daten, 0, 0); } catch { setGesperrt(true); } }
    ctx.drawImage(tmp, r, r);
  }, [bild, w, gesperrt]);

  useEffect(() => {
    const s = JSON.stringify(Object.fromEntries(Object.entries(w).filter(([k, v]) => START[k as keyof Werte] !== v)));
    setSuche(s === '{}' ? {} : { s: btoa(s) }, { replace: true });
  }, [w, setSuche]);

  const kurz = (t: string) => { setMeldung(t); setTimeout(() => setMeldung(null), 1800); };
  function laden() { leinwand.current?.toBlob((b) => { if (!b) return; const x = document.createElement('a'); x.href = URL.createObjectURL(b); x.download = `${a?.id ?? 'asset'}.png`; x.click(); }, 'image/png'); }
  function kopieren() {
    leinwand.current?.toBlob(async (b) => {
      try { if (!b) throw new Error('leer'); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); kurz('Copied to clipboard ✓'); } catch { kurz('Your browser blocked the clipboard'); }
    }, 'image/png');
  }
  if (!liste) return <Laedt farbe={TEAL} />;
  if (!a) return <Glas className="p-6 text-sm text-white/60">This asset doesn't exist. <Link to="/community/assets" className="text-teal-300">Back to the gallery</Link></Glas>;
  const nr = liste.indexOf(a);
  const regler = (k: ReglerK, t: string, min = -100, max = 100) => (
    <label key={k} className="block">
      <div className="flex justify-between text-xs"><span className="text-white/60">{t}</span><span className="tabular-nums text-white/40">{w[k]}</span></div>
      <input type="range" min={min} max={max} value={w[k]} disabled={gesperrt} onChange={(e) => setW((v) => ({ ...v, [k]: Number(e.target.value) }))} onDoubleClick={() => setW((v) => ({ ...v, [k]: START[k] }))} className="mt-1 w-full accent-teal-300 disabled:opacity-30" />
    </label>
  );
  const knopf = 'rounded-xl border border-white/10 px-3 py-1.5 text-sm text-white/60 hover:text-white disabled:opacity-30';
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/community/assets" className={knopf}>← Gallery</Link>
        <button type="button" disabled={nr <= 0} onClick={() => nav(`/community/assets/${encodeURIComponent(liste[nr - 1].id)}`)} className={knopf}>‹ Prev</button>
        <button type="button" disabled={nr >= liste.length - 1} onClick={() => nav(`/community/assets/${encodeURIComponent(liste[nr + 1].id)}`)} className={knopf}>Next ›</button>
      </div>
      <Ueberschrift ueber={`Asset studio · ${KATEGORIEN.find((k) => k.k === a.klasse)?.titel ?? 'Item'}`} titel={a.name} farbe={TEAL} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Glas className="relative grid min-h-[520px] place-items-center overflow-hidden p-8" verzoegerung={0.05}>
          <div className="absolute inset-0 bg-[#0b111c]" style={SCHACH} />
          {!bild && <Laedt farbe={TEAL} />}
          <canvas ref={leinwand} className="relative max-h-[70vh] max-w-full drop-shadow-[0_20px_40px_rgba(0,0,0,0.45)]" />
          {bild && <p className="absolute bottom-3 left-4 text-[11px] text-white/35">{bild.naturalWidth} × {bild.naturalHeight} px · exported at native size, never upscaled</p>}
          {meldung && <p className="absolute right-4 top-4 rounded-lg bg-teal-300 px-3 py-1.5 text-xs font-bold text-[#06080f]">{meldung}</p>}
        </Glas>
        <Glas className="space-y-5 p-5" verzoegerung={0.1}>
          {gesperrt && <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-xs text-amber-100">This image comes from an outside source that doesn't allow editing or exporting in the browser. Images from the game-file export work fully.</p>}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">{REGLER.map((r) => regler(r.k, r.t, 'min' in r ? r.min : -100, 'max' in r ? r.max : 100))}</div>
          <div className="h-px bg-white/5" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">Background</p>
            <div className="mt-2 inline-flex rounded-xl border border-white/10 bg-black/30 p-0.5 text-xs font-bold">
              {([['none', 'Transparent'], ['farbe', 'Colour'], ['verlauf', 'Gradient']] as const).map(([k, t]) => <button key={k} type="button" onClick={() => setW((v) => ({ ...v, bg: k }))} className={`rounded-lg px-3 py-1 ${w.bg === k ? 'bg-white/15 text-white' : 'text-white/45'}`}>{t}</button>)}
            </div>
            {w.bg !== 'none' && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input type="color" value={w.f1} onChange={(e) => setW((v) => ({ ...v, f1: e.target.value }))} className="h-9 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent" />
                {w.bg === 'verlauf' && <>
                  <input type="color" value={w.f2} onChange={(e) => setW((v) => ({ ...v, f2: e.target.value }))} className="h-9 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent" />
                  <label className="flex-1 text-xs text-white/50">Angle {w.winkel}°<input type="range" min={0} max={360} value={w.winkel} onChange={(e) => setW((v) => ({ ...v, winkel: Number(e.target.value) }))} className="w-full accent-teal-300" /></label>
                </>}
              </div>
            )}
            <label className="mt-3 block text-xs text-white/50">Padding {w.rand} %<input type="range" min={0} max={50} value={w.rand} onChange={(e) => setW((v) => ({ ...v, rand: Number(e.target.value) }))} className="w-full accent-teal-300" /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={gesperrt} onClick={laden} className="rounded-xl bg-teal-300 px-4 py-2 text-sm font-bold text-[#06080f] hover:bg-teal-200 disabled:opacity-40">Download PNG</button>
            <button type="button" disabled={gesperrt} onClick={kopieren} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 hover:text-white disabled:opacity-40">Copy image</button>
            <button type="button" onClick={() => setW(START)} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white/60 hover:text-white">Reset</button>
            <LinkKopieren text="Share" />
          </div>
          <p className="text-[11px] text-white/35">Double-click a slider to reset it. The share link keeps all settings.</p>
        </Glas>
      </div>
    </div>
  );
}
