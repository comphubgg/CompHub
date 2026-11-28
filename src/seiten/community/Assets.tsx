import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Flaeche, Laedt, SeitenKopf } from '../../ds/Bausteine';
import { LinkKopieren, useHubDatei } from './Bausteine';
import SPIEL_SYMBOLE from './spielSymbole.json';
import { wikiProxy } from './waffenWiki';

/*
 * Asset Studio (Betreiber, 26.11.2026 - eigene Umsetzung der Idee): Galerie aller Waffen- und Gegenstandsbilder nach Kategorie, Detailansicht mit
 * Schachbrett-Vorschau und Reglern (Temperatur, Toenung, Saettigung, Farbton, Helligkeit, Kontrast, Lichter, Tiefen, Weiss, Schwarz) plus
 * Hintergrund (Farbe/Verlauf), gerechnet auf einem Canvas Pixel fuer Pixel - Download PNG, In die Zwischenablage, Zuruecksetzen, Link mit den
 * Einstellungen in der Adresse.
 *
 * Bilder: zuerst /hub-daten/assets.json aus dem Export der Spieldateien (volle Menge, PNG mit Alpha - Format: { assets: [{ id, name, class,
 * rarity?, season?, image }] }), sonst was die Seite schon hat: die Symbole unter /waffen (spielSymbole.json, gleiche Herkunft, 160 px) und das
 * Fortnite-Wiki (/api/waffen-bilder, ueber den Proxy /wikia - so darf der Canvas auch die Wiki-Bilder bearbeiten und exportieren).
 * Nie hochskaliert: das Bild wird in seiner eigenen Groesse gerechnet und exportiert.
 *
 * Design 3.0 (neu komponiert 28.11.2026): Galerie mit Kategorien als Leiste links (Handy: Chips) und gleich grossen Kacheln; das Studio fuellt
 * den Bildschirm: links die Leinwand, rechts die Regler in zwei Gruppen (Licht, Farbe), Vorlagen, Hintergrund und Export; darunter die
 * Nachbarn derselben Kategorie zum Weiterklicken.
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

// Wiki-Bilderliste einmal je Sitzung laden (Galerie -> Detail baut die Seite neu auf).
let wikiLaden: Promise<Record<string, { name: string; bild: string }>> | null = null;
let wikiFertig: Record<string, { name: string; bild: string }> | null = null;

export function useAssets(): { liste: Asset[] | null; ausExport: boolean } {
  const { daten, status } = useHubDatei<{ assets: Array<{ id: string; name: string; class: string; rarity?: string; season?: string; image: string }> }>('assets.json');
  const [wiki, setWiki] = useState<Record<string, { name: string; bild: string }> | null>(wikiFertig);
  useEffect(() => {
    if (status !== 'fehlt' || wikiFertig) return;
    wikiLaden ??= fetch('/api/waffen-bilder').then((r) => r.json()).catch(() => ({})).then((j) => { wikiFertig = j; return j; });
    wikiLaden.then(setWiki);
  }, [status]);
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
      m.set(k.toLowerCase(), { id: k.toLowerCase(), name: v.name, klasse: klasseVon(k, v.name), bild: wikiProxy(v.bild.replace(/\/scale-to-width-down\/\d+/, '')) ?? v.bild, fremd: true });
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
  const [param] = useSearchParams();
  const [kat, setKat] = useState(param.get('q') ? 'alle' : 'weapons');
  const [suche, setSuche] = useState(param.get('q') ?? '');
  const [anzahl, setAnzahl] = useState(240);
  const kopf = (
    <SeitenKopf klein ueber="Community · Loot" titel="Asset Studio" text="Every weapon and item image – recolour it, put it on any background, download a transparent PNG or copy it straight into your thumbnail."
      rechts={<input value={suche} onChange={(e) => { setSuche(e.target.value); setAnzahl(240); }} placeholder="Search images…" className="eingabe w-full sm:w-72" />} />
  );
  if (!liste) return <div>{kopf}<Laedt text="Loading every weapon and item image" /></div>;
  const passt = (a: Asset, k: string) => (k === 'alle' ? true : k === 'weapons' ? WAFFEN_KLASSEN.has(a.klasse) : a.klasse === k);
  const gezeigt = liste.filter((a) => passt(a, kat) && a.name.toLowerCase().includes(suche.toLowerCase()));
  const gruppen: Array<{ titel: string; eintraege: Array<{ k: string; t: string }> }> = [
    { titel: 'Weapons', eintraege: [{ k: 'weapons', t: 'All weapons' }, ...KATEGORIEN.filter((k) => k.gruppe === 'Weapons').map((k) => ({ k: k.k, t: k.titel }))] },
    { titel: 'Other', eintraege: [{ k: 'alle', t: 'Everything' }, ...KATEGORIEN.filter((k) => k.gruppe === 'Other').map((k) => ({ k: k.k, t: k.titel }))] },
  ];
  const zahl = (k: string) => liste.filter((a) => passt(a, k)).length;
  return (
    <div>
      {kopf}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Kategorien: links als Leiste, auf dem Handy als Chips */}
        <nav className="min-w-0 lg:sticky lg:top-[120px] lg:self-start">
          <div className="ohne-leiste flex gap-1.5 overflow-x-auto lg:hidden">
            {gruppen.flatMap((g) => g.eintraege).filter((e) => zahl(e.k) || e.k === kat).map((e) => <button key={e.k} type="button" onClick={() => setKat(e.k)} className={`chip ${kat === e.k ? 'chip-an' : ''}`}>{e.t}<span className="zahl text-white/40">{zahl(e.k)}</span></button>)}
          </div>
          <Flaeche fest className="hidden space-y-4 p-3 lg:block">
            {gruppen.map((g) => (
              <div key={g.titel}>
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">{g.titel}</p>
                {g.eintraege.filter((e) => zahl(e.k) || e.k === kat).map((e) => (
                  <button key={e.k} type="button" onClick={() => setKat(e.k)} className={`relative flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition ${kat === e.k ? 'font-semibold text-white' : 'text-white/60 hover:bg-white/[0.04] hover:text-white'}`}>
                    {kat === e.k && <motion.span layoutId="asset-kat" className="absolute inset-0 rounded-lg border border-akz/40 bg-akz/15" />}
                    <span className="relative">{e.t}</span><span className="zahl relative text-xs text-white/40">{zahl(e.k)}</span>
                  </button>
                ))}
              </div>
            ))}
          </Flaeche>
        </nav>
        <div className="min-w-0 space-y-4">
          <p className="text-sm text-white/50"><b className="zahl text-white">{gezeigt.length.toLocaleString('en')}</b> images{!ausExport && <span className="text-white/35"> · the images the site already has – every weapon and item per rarity comes with the game-file export</span>}</p>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-9">
            {gezeigt.slice(0, anzahl).map((a, i) => (
              <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 30) * 0.01 }}>
                <Link to={`/community/assets/${encodeURIComponent(a.id)}`} className="fl-fest fl-klick group block overflow-hidden !rounded-2xl">
                  <div className="grid aspect-square place-items-center bg-black/30 p-3" style={SCHACH}>
                    <AssetBild a={a} className="max-h-full max-w-full transition duration-300 group-hover:scale-110" />
                  </div>
                  <p className="truncate px-2.5 py-2 text-xs font-semibold text-white/75 group-hover:text-white">{a.name}</p>
                </Link>
              </motion.div>
            ))}
          </div>
          {gezeigt.length > anzahl && <div className="flex justify-center"><button type="button" onClick={() => setAnzahl((n) => n + 480)} className="knopf">Show more ({(gezeigt.length - anzahl).toLocaleString('en')} left)</button></div>}
          {!gezeigt.length && <p className="text-sm text-white/45">No image matches.</p>}
        </div>
      </div>
    </div>
  );
}

/** Bild einer Kachel - laedt es nicht, bleibt die Kachel leer (kein kaputtes Symbol, kein Buchstabe). */
function AssetBild({ a, className }: { a: Asset; className: string }) {
  const [weg, setWeg] = useState(false);
  if (weg) return <span aria-hidden />;
  return <img src={a.bild} alt={a.name} loading="lazy" referrerPolicy="no-referrer" onError={() => setWeg(true)} className={`object-contain ${className}`} />;
}

/* ---------------------------------------------- Studio */
const REGLER = [
  { k: 'temp', t: 'Temperature' }, { k: 'tint', t: 'Tint' }, { k: 'sat', t: 'Saturation' }, { k: 'hue', t: 'Hue', min: -180, max: 180 },
  { k: 'hell', t: 'Brightness' }, { k: 'kontrast', t: 'Contrast' }, { k: 'lichter', t: 'Highlights' }, { k: 'tiefen', t: 'Shadows' },
  { k: 'weiss', t: 'Whites' }, { k: 'schwarz', t: 'Blacks' },
] as const;
type ReglerK = (typeof REGLER)[number]['k'];
type Werte = Record<ReglerK, number> & { bg: 'none' | 'farbe' | 'verlauf'; f1: string; f2: string; winkel: number; rand: number };
/** Schnelle Vorlagen fuer Thumbnails - setzen nur die Regler, Hintergrund und Rand bleiben. */
const VORLAGEN: Array<{ t: string; w: Partial<Werte> }> = [
  { t: 'Original', w: {} }, { t: 'Pop', w: { sat: 35, kontrast: 20, lichter: 15 } }, { t: 'Warm', w: { temp: 35, sat: 10 } }, { t: 'Cool', w: { temp: -35, tint: -10 } },
  { t: 'Mono', w: { sat: -100, kontrast: 15 } }, { t: 'Glow', w: { hell: 15, lichter: 40, weiss: 20 } }, { t: 'Night', w: { hell: -25, tiefen: -30, temp: -20 } },
];
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
  if (!liste) return <Laedt />;
  if (!a) return <Flaeche fest className="p-6 text-sm text-white/60">This image doesn't exist. <Link to="/community/assets" className="font-semibold text-akz">Back to the gallery</Link></Flaeche>;
  const nr = liste.indexOf(a);
  const kategorie = KATEGORIEN.find((k) => k.k === a.klasse)?.titel ?? 'Item';
  const nachbarn = (() => { const l = liste.filter((x) => x.klasse === a.klasse); const i = l.indexOf(a); return [...l.slice(Math.max(0, i - 8), i), ...l.slice(i + 1, i + 9)].slice(0, 16); })();
  const regler = (k: ReglerK, t: string, min = -100, max = 100) => (
    <label key={k} className="block">
      <div className="flex justify-between text-xs"><span className="text-white/60">{t}</span><span className={`zahl ${w[k] ? 'font-bold text-akz' : 'text-white/35'}`}>{w[k] > 0 ? `+${w[k]}` : w[k]}</span></div>
      <input type="range" min={min} max={max} value={w[k]} disabled={gesperrt} onChange={(e) => setW((v) => ({ ...v, [k]: Number(e.target.value) }))} onDoubleClick={() => setW((v) => ({ ...v, [k]: START[k] }))} className="mt-1 w-full accent-akz disabled:opacity-30" />
    </label>
  );
  const gruppe = (titel: string, ks: ReglerK[]) => (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">{titel}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">{REGLER.filter((r) => ks.includes(r.k)).map((r) => regler(r.k, r.t, 'min' in r ? r.min : -100, 'max' in r ? r.max : 100))}</div>
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/community/assets" className="knopf">← Gallery</Link>
        <button type="button" disabled={nr <= 0} onClick={() => nav(`/community/assets/${encodeURIComponent(liste[nr - 1].id)}`)} className="knopf" aria-label="Previous">‹</button>
        <button type="button" disabled={nr >= liste.length - 1} onClick={() => nav(`/community/assets/${encodeURIComponent(liste[nr + 1].id)}`)} className="knopf" aria-label="Next">›</button>
        <div className="ml-1 min-w-0"><p className="ueber">Asset Studio · {kategorie}</p><h1 className="titel truncate text-4xl sm:text-5xl">{a.name}</h1></div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Leinwand */}
        <Flaeche fest className="relative grid min-h-[360px] place-items-center overflow-hidden p-6 sm:p-10 xl:min-h-[560px]">
          <div className="absolute inset-0 bg-black/40" style={SCHACH} />
          {!bild && <Laedt />}
          <canvas ref={leinwand} className="relative max-h-[68vh] max-w-full drop-shadow-[0_24px_40px_rgba(0,0,0,0.5)]" />
          {bild && <p className="zahl absolute bottom-3 left-4 text-[11px] text-white/40">{bild.naturalWidth} × {bild.naturalHeight} px · exported at native size, never upscaled</p>}
          {meldung && <motion.p initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="absolute right-4 top-4 rounded-lg bg-akz px-3 py-1.5 text-xs font-bold text-[#04050a]">{meldung}</motion.p>}
        </Flaeche>
        {/* Regler */}
        <Flaeche fest className="space-y-5 p-5 xl:sticky xl:top-[120px] xl:self-start" verz={0.08}>
          {gesperrt && <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-xs text-amber-100">This image comes from an outside source that doesn't allow editing or exporting in the browser. Images from the game-file export work fully.</p>}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">Presets</p>
            <div className="flex flex-wrap gap-1.5">
              {VORLAGEN.map((v) => <button key={v.t} type="button" disabled={gesperrt} onClick={() => setW((x) => ({ ...x, ...START, bg: x.bg, f1: x.f1, f2: x.f2, winkel: x.winkel, rand: x.rand, ...v.w }))} className="chip disabled:opacity-30">{v.t}</button>)}
            </div>
          </div>
          {gruppe('Light', ['hell', 'kontrast', 'lichter', 'tiefen', 'weiss', 'schwarz'])}
          {gruppe('Colour', ['temp', 'tint', 'sat', 'hue'])}
          <div className="h-px bg-white/[0.06]" />
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">Background</p>
            <div className="inline-flex rounded-xl border border-white/10 bg-black/40 p-0.5 text-xs font-bold">
              {([['none', 'Transparent'], ['farbe', 'Colour'], ['verlauf', 'Gradient']] as const).map(([k, t]) => <button key={k} type="button" onClick={() => setW((v) => ({ ...v, bg: k }))} className={`rounded-lg px-3 py-1 ${w.bg === k ? 'bg-akz text-[#04050a]' : 'text-white/50 hover:text-white'}`}>{t}</button>)}
            </div>
            {w.bg !== 'none' && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input type="color" value={w.f1} onChange={(e) => setW((v) => ({ ...v, f1: e.target.value }))} className="h-9 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent" aria-label="Colour" />
                {w.bg === 'verlauf' && <>
                  <input type="color" value={w.f2} onChange={(e) => setW((v) => ({ ...v, f2: e.target.value }))} className="h-9 w-12 cursor-pointer rounded-lg border border-white/10 bg-transparent" aria-label="Second colour" />
                  <label className="flex-1 text-xs text-white/50">Angle <span className="zahl">{w.winkel}°</span><input type="range" min={0} max={360} value={w.winkel} onChange={(e) => setW((v) => ({ ...v, winkel: Number(e.target.value) }))} className="w-full accent-akz" /></label>
                </>}
              </div>
            )}
            <label className="mt-3 block text-xs text-white/50">Padding <span className="zahl">{w.rand} %</span><input type="range" min={0} max={50} value={w.rand} onChange={(e) => setW((v) => ({ ...v, rand: Number(e.target.value) }))} className="w-full accent-akz" /></label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={gesperrt} onClick={laden} className="knopf-prim col-span-2">Download PNG</button>
            <button type="button" disabled={gesperrt} onClick={kopieren} className="knopf">Copy image</button>
            <button type="button" onClick={() => setW(START)} className="knopf">Reset</button>
          </div>
          <div className="flex items-center justify-between gap-2"><p className="text-[11px] text-white/35">Double-click a slider to reset it. The share link keeps every setting.</p><LinkKopieren text="Share" /></div>
        </Flaeche>
      </div>
      {nachbarn.length > 0 && (
        <div>
          <p className="ueber mb-2">More {kategorie.toLowerCase()}</p>
          <div className="ohne-leiste -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 lg:-mx-8 lg:px-8">
            {nachbarn.map((x) => (
              <Link key={x.id} to={`/community/assets/${encodeURIComponent(x.id)}`} className="fl-fest fl-klick group w-28 shrink-0 overflow-hidden !rounded-2xl">
                <div className="grid aspect-square place-items-center bg-black/30 p-2.5" style={SCHACH}><AssetBild a={x} className="max-h-full max-w-full transition duration-300 group-hover:scale-110" /></div>
                <p className="truncate px-2 py-1.5 text-[11px] font-semibold text-white/70 group-hover:text-white">{x.name}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
