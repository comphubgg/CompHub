import { useCallback, useEffect, useState } from 'react';
import { useWer } from '../../../teile/Anmeldung';

/*
 * Datenschicht fuer Shop, Cosmetics und die persoenlichen Listen (Spezifikation 26.11.2026, Punkte 6-14, 21, 22).
 *   - Quelle: fortnite-api.com (oeffentlich, erlaubt Abfragen aus dem Browser - Access-Control-Allow-Origin: *, geprueft 26.11.2026).
 *       /v2/shop                         heutiger Item-Shop
 *       /v2/cosmetics/br?responseFlags=6 alle BR-Kosmetik MIT Shop-Verlauf (4) und Spiel-Tags (2, Herkunft) - ~2,5 MB gepackt, einmal je Sitzung
 *       /v2/cosmetics/tracks | instruments | cars | lego/kits   die uebrigen Arten, erst beim Oeffnen des Reiters
 *       /v2/cosmetics/new                was mit dem letzten Patch in die Dateien kam ("New in the files")
 *       /v2/cosmetics/br/<id>?responseFlags=7   Einzelteil mit Spiel-Tags (Quelle: Battle Pass, Shop ...) fuer die Detailseite
 *   - Alles wird einmal geladen und im Modul gemerkt (Promise-Cache), damit Seitenwechsel sofort gehen.
 *   - Persoenliches (Wunschliste, Spind, Sammlungen, Reaktionen): angemeldet in /api/user-storage der Seite (pro Konto), sonst im Browser.
 *     Nicht angemeldet NIE /api/user-storage beschreiben - dort landet alles in der gemeinsamen Datei "guest".
 */

export const FAPI = 'https://fortnite-api.com';

export type Art = 'br' | 'track' | 'instrument' | 'car' | 'lego';
export interface Variante { channel: string; type?: string; options: Array<{ tag: string; name: string; image: string }> }
/** Ein Gegenstand, egal welcher Art - einheitlich fuer Raster, Filter und Detailseite. */
export interface Teil {
  id: string; art: Art; name: string; text: string; typ: string; typName: string; selten: string; seltenName: string;
  serie?: string; set?: string; kapitel?: string; saison?: string; saisonNr?: number; saisonText?: string;
  bild: string; bildGross: string; bildFeatured?: string; hinzu: string; shop: string[]; tags: string[];
  varianten?: Variante[]; video?: string; jahr?: number; bpm?: number; dauer?: number;
  /** Herkunft aus den Spiel-Tags (ohne "Cosmetics.Source."), z. B. "Season43.BattlePass.Free", "QuestReward", "ItemShop" */
  herkunft?: string[]; bildBreit?: string;
}

/* ---------------------------------------------- Laden mit Cache */
const cache = new Map<string, Promise<unknown>>();
export function holen<T>(pfad: string): Promise<T> {
  if (!cache.has(pfad)) {
    const p = fetch(`${FAPI}${pfad}`).then((r) => { if (!r.ok) throw new Error(`fortnite-api ${r.status}`); return r.json(); }).then((j) => j.data as T);
    p.catch(() => cache.delete(pfad));
    cache.set(pfad, p);
  }
  return cache.get(pfad) as Promise<T>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function ausBr(x: any): Teil {
  return {
    id: x.id, art: 'br', name: x.name ?? x.id, text: x.description ?? '', typ: x.type?.value ?? 'other', typName: x.type?.displayValue ?? 'Other',
    selten: x.series ? serienSchluessel(x.series.value) : x.rarity?.value ?? 'common', seltenName: x.series?.value ? titelFall(x.series.value) : x.rarity?.displayValue ?? 'Common',
    serie: x.series?.value, set: x.set?.value || undefined, kapitel: x.introduction?.chapter, saison: x.introduction?.season, saisonNr: x.introduction?.backendValue,
    saisonText: x.introduction?.text, bild: x.images?.icon ?? x.images?.smallIcon ?? '', bildGross: x.images?.featured ?? x.images?.icon ?? '', bildFeatured: x.images?.featured,
    hinzu: x.added, shop: x.shopHistory ?? [], tags: x.searchTags ?? [], varianten: x.variants, video: x.showcaseVideo,
    herkunft: (x.gameplayTags ?? []).filter((g: string) => g.startsWith('Cosmetics.Source.')).map((g: string) => g.slice(17)), bildBreit: x.images?.other?.background,
  };
}
function ausTrack(x: any): Teil {
  return {
    id: x.id, art: 'track', name: (x.title ?? x.devName ?? '').trim(), text: x.artist ?? '', typ: 'track', typName: 'Jam Track', selten: 'common', seltenName: x.artist ?? '',
    bild: x.albumArt ?? '', bildGross: x.albumArt ?? '', hinzu: x.added, shop: x.shopHistory ?? [], tags: x.genres ?? [], jahr: x.releaseYear, bpm: x.bpm, dauer: x.duration,
  };
}
function ausAnderem(x: any, art: Art): Teil {
  return {
    id: x.id, art, name: x.name ?? x.id, text: x.description ?? '', typ: `${art}:${x.type?.value ?? 'item'}`, typName: x.type?.displayValue ?? art,
    selten: x.series ? serienSchluessel(x.series.value) : x.rarity?.value ?? 'common', seltenName: x.series?.value ? titelFall(x.series.value) : x.rarity?.displayValue ?? '',
    serie: x.series?.value, bild: x.images?.large ?? x.images?.small ?? x.images?.wide ?? '', bildGross: x.images?.large ?? x.images?.wide ?? '', hinzu: x.added,
    shop: x.shopHistory ?? [], tags: [],
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
const serienSchluessel = (s: string) => s.toLowerCase().replace(/ series$/, '').replace(/\s+/g, '');
const titelFall = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace('Dc', 'DC');

/** Die Arten, die geladen werden koennen - BR sofort, der Rest beim ersten Bedarf. */
export const QUELLEN: Record<Art, { pfad: string; umbau: (x: unknown) => Teil }> = {
  br: { pfad: '/v2/cosmetics/br?responseFlags=6', umbau: ausBr }, // 4 = Shop-Verlauf, 2 = Spiel-Tags (Herkunft: Battle Pass frei/bezahlt, Quest, Event ...)
  track: { pfad: '/v2/cosmetics/tracks', umbau: ausTrack },
  instrument: { pfad: '/v2/cosmetics/instruments', umbau: (x) => ausAnderem(x, 'instrument') },
  car: { pfad: '/v2/cosmetics/cars', umbau: (x) => ausAnderem(x, 'car') },
  lego: { pfad: '/v2/cosmetics/lego/kits', umbau: (x) => ausAnderem(x, 'lego') },
};
const umgebaut = new Map<Art, Promise<Teil[]>>();
export function teileLaden(art: Art): Promise<Teil[]> {
  if (!umgebaut.has(art)) {
    const q = QUELLEN[art];
    const p = holen<unknown[]>(q.pfad).then((l) => l.map(q.umbau).filter((t) => t.name));
    p.catch(() => umgebaut.delete(art));
    umgebaut.set(art, p);
  }
  return umgebaut.get(art)!;
}
export function useTeile(arten: Art[]): { teile: Teil[]; laedt: boolean; fehler: string | null } {
  const schluessel = arten.join(',');
  const [z, setZ] = useState<{ teile: Teil[]; laedt: boolean; fehler: string | null }>({ teile: [], laedt: true, fehler: null });
  useEffect(() => {
    let weg = false;
    setZ((v) => ({ ...v, laedt: true }));
    Promise.all(schluessel.split(',').filter(Boolean).map((a) => teileLaden(a as Art))).then((l) => { if (!weg) setZ({ teile: l.flat(), laedt: false, fehler: null }); })
      .catch((e) => { if (!weg) setZ({ teile: [], laedt: false, fehler: (e as Error).message }); });
    return () => { weg = true; };
  }, [schluessel]);
  return z;
}

/** Schneller Nachschlag nach ID ueber alle schon geladenen Arten. */
export function useNachschlag(arten: Art[] = ['br']) {
  const { teile, laedt } = useTeile(arten);
  const [karte, setKarte] = useState<Map<string, Teil>>(new Map());
  useEffect(() => { setKarte(new Map(teile.map((t) => [t.id.toLowerCase(), t]))); }, [teile]);
  return { karte, laedt };
}

/* ---------------------------------------------- Shop */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Angebot {
  id: string; name: string; preis: number; regulaer: number; ab: string; bis: string; abschnitt: string; abschnittRang: number; groesse: string;
  bild: string; banner?: string; bundle: boolean; teile: Teil[]; farben?: string[]; art: Art;
}
export function shopUmbau(d: any): { datum: string; angebote: Angebot[] } {
  const angebote: Angebot[] = (d?.entries ?? []).map((e: any): Angebot => {
    const teile: Teil[] = [...(e.brItems ?? []).map(ausBr), ...(e.tracks ?? []).map(ausTrack), ...(e.instruments ?? []).map((x: any) => ausAnderem(x, 'instrument')),
      ...(e.cars ?? []).map((x: any) => ausAnderem(x, 'car')), ...(e.legoKits ?? []).map((x: any) => ausAnderem(x, 'lego'))];
    const render = e.newDisplayAsset?.renderImages?.find((r: any) => r.productTag === 'Product.BR')?.image ?? e.newDisplayAsset?.renderImages?.[0]?.image;
    const erstes = teile[0];
    return {
      id: e.offerId, name: e.bundle?.name ?? erstes?.name ?? e.devName, preis: e.finalPrice, regulaer: e.regularPrice, ab: e.inDate, bis: e.outDate,
      abschnitt: (e.layout?.name ?? (erstes?.art === 'track' ? 'Jam Tracks' : 'Other')).trim(), abschnittRang: e.layout?.index ?? 999, groesse: e.tileSize ?? 'Size_1_x_1',
      bild: e.bundle?.image ?? render ?? erstes?.bildFeatured ?? erstes?.bild ?? '', banner: e.banner?.value, bundle: !!e.bundle, teile,
      farben: e.colors ? [e.colors.color1, e.colors.color2, e.colors.color3].filter(Boolean).map((c: string) => `#${c.slice(0, 6)}`) : undefined, art: erstes?.art ?? 'br',
    };
  });
  return { datum: d?.date, angebote };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
export function useShop() {
  const [z, setZ] = useState<{ datum: string | null; angebote: Angebot[]; laedt: boolean; fehler: string | null }>({ datum: null, angebote: [], laedt: true, fehler: null });
  useEffect(() => {
    let weg = false;
    holen<unknown>('/v2/shop').then((d) => { if (!weg) { const s = shopUmbau(d); setZ({ datum: s.datum, angebote: s.angebote, laedt: false, fehler: null }); } })
      .catch((e) => { if (!weg) setZ({ datum: null, angebote: [], laedt: false, fehler: (e as Error).message }); });
    return () => { weg = true; };
  }, []);
  return z;
}

/* ---------------------------------------------- Aussehen: Seltenheiten (eigene Farben) */
export const SELTEN: Record<string, { name: string; a: string; b: string }> = {
  common: { name: 'Common', a: '#9ca3af', b: '#374151' }, uncommon: { name: 'Uncommon', a: '#4ade80', b: '#14532d' }, rare: { name: 'Rare', a: '#38bdf8', b: '#0c4a6e' },
  epic: { name: 'Epic', a: '#c084fc', b: '#4c1d95' }, legendary: { name: 'Legendary', a: '#fb923c', b: '#7c2d12' }, mythic: { name: 'Mythic', a: '#facc15', b: '#713f12' },
  exotic: { name: 'Exotic', a: '#67e8f9', b: '#155e75' }, icon: { name: 'Icon Series', a: '#2dd4bf', b: '#134e4a' }, marvel: { name: 'Marvel Series', a: '#f87171', b: '#7f1d1d' },
  dc: { name: 'DC Series', a: '#60a5fa', b: '#1e3a8a' }, starwars: { name: 'Star Wars Series', a: '#e5e7eb', b: '#111827' }, gaminglegends: { name: 'Gaming Legends', a: '#a5b4fc', b: '#312e81' },
  crew: { name: 'Crew Series', a: '#5eead4', b: '#0f3d3a' }, slurp: { name: 'Slurp Series', a: '#22d3ee', b: '#164e63' }, frozen: { name: 'Frozen Series', a: '#bae6fd', b: '#1e3a5f' },
  lava: { name: 'Lava Series', a: '#fdba74', b: '#7c2d12' }, dark: { name: 'Dark Series', a: '#e879f9', b: '#3b0764' }, shadow: { name: 'Shadow Series', a: '#a1a1aa', b: '#18181b' },
  golden: { name: 'Golden Series', a: '#fde047', b: '#713f12' },
};
export const seltenVon = (s: string) => SELTEN[s] ?? SELTEN.common;

/** Die Reiter der Datenbank - Wert = type.value von fortnite-api (bei Nicht-BR "<art>:<typ>" bzw. die ganze Art). */
export const REITER: Array<{ k: string; titel: string; art: Art; typen?: string[] }> = [
  { k: 'outfit', titel: 'Outfits', art: 'br', typen: ['outfit'] }, { k: 'backpack', titel: 'Back Blings', art: 'br', typen: ['backpack', 'petcarrier', 'pet'] },
  { k: 'pickaxe', titel: 'Pickaxes', art: 'br', typen: ['pickaxe'] }, { k: 'emote', titel: 'Emotes', art: 'br', typen: ['emote', 'toy'] },
  { k: 'glider', titel: 'Gliders', art: 'br', typen: ['glider'] }, { k: 'sidekick', titel: 'Sidekicks', art: 'br', typen: ['sidekick'] },
  { k: 'shoe', titel: 'Kicks', art: 'br', typen: ['shoe'] }, { k: 'wrap', titel: 'Wraps', art: 'br', typen: ['wrap'] },
  { k: 'loadingscreen', titel: 'Loadings', art: 'br', typen: ['loadingscreen'] }, { k: 'music', titel: 'Music', art: 'br', typen: ['music'] },
  { k: 'contrail', titel: 'Contrails', art: 'br', typen: ['contrail'] }, { k: 'spray', titel: 'Sprays', art: 'br', typen: ['spray'] },
  { k: 'emoji', titel: 'Emojis', art: 'br', typen: ['emoji'] }, { k: 'banner', titel: 'Banners', art: 'br', typen: ['banner'] },
  { k: 'aura', titel: 'Auras', art: 'br', typen: ['aura'] },
  { k: 'track', titel: 'Jam Tracks', art: 'track' }, { k: 'instrument', titel: 'Instruments', art: 'instrument' },
  { k: 'car', titel: 'Cars', art: 'car' }, { k: 'lego', titel: 'LEGO kits', art: 'lego' },
];

/* ---------------------------------------------- Zeit */
export const tageSeit = (iso?: string | null, bis = Date.now()) => (iso ? Math.floor((bis - Date.parse(iso)) / 864e5) : null);
export const datumKurz = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
/**
 * Wann war das Teil VOR dem laufenden Auftritt zuletzt im Shop? Die Tage direkt vor heute, an denen es durchgehend da war, zaehlen zum
 * heutigen Auftritt (sonst stuende bei allem, was gestern schon da war, "vor 1 Tag gesehen").
 */
export function zuvor(t: Teil, heute: string | null): string | null {
  const tag = (heute ?? new Date().toISOString()).slice(0, 10);
  const l = [...new Set(t.shop.map((d) => d.slice(0, 10)))].filter((d) => d <= tag).sort();
  let grenze = Date.parse(tag);
  while (l.length && Date.parse(l[l.length - 1]) >= grenze - 864e5 - 1000) { grenze = Date.parse(l.pop()!); }
  return l.at(-1) ?? null;
}
/** Wie viele Tage laeuft der heutige Auftritt schon (heute mitgezaehlt)? */
export function seitTagen(t: Teil, heute: string | null): number {
  const tag = (heute ?? new Date().toISOString()).slice(0, 10);
  const set = new Set(t.shop.map((d) => d.slice(0, 10)));
  let n = 1; let d = Date.parse(tag) - 864e5;
  while (set.has(new Date(d).toISOString().slice(0, 10))) { n += 1; d -= 864e5; }
  return n;
}
/** Shop-Tage zu zusammenhaengenden Auftritten buendeln (ein Auftritt = aufeinanderfolgende Tage). */
export function auftritte(shop: string[]): Array<{ ab: string; bis: string; tage: number }> {
  const out: Array<{ ab: string; bis: string; tage: number }> = [];
  for (const d of [...shop].sort()) {
    const letzt = out.at(-1);
    if (letzt && Date.parse(d) - Date.parse(letzt.bis) <= 864e5 + 1000) { letzt.bis = d; letzt.tage += 1; } else out.push({ ab: d, bis: d, tage: 1 });
  }
  return out;
}

/* ---------------------------------------------- Persoenliche Ablage */
/**
 * Wert, der pro Konto gespeichert wird (angemeldet: /api/user-storage, Schluessel "hub-<name>") und sonst im Browser (localStorage).
 * Ein gemeinsamer Speicher je Name im Modul: hundert Kacheln mit Herz und Haken teilen sich EINE Abfrage und bleiben gleich.
 * Beim Anmelden wird ein lokal angelegter Stand ins Konto uebernommen, wenn das Konto noch leer ist.
 */
interface Fach { wert: unknown; fuer: string | null; laedt: boolean; hoerer: Set<() => void>; warte?: ReturnType<typeof setTimeout> }
const faecher = new Map<string, Fach>();
const lokalLesen = (k: string, start: unknown) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : start; } catch { return start; } };
function fach(name: string, start: unknown): Fach {
  let f = faecher.get(name);
  if (!f) { f = { wert: lokalLesen(`hub-${name}`, start), fuer: null, laedt: false, hoerer: new Set() }; faecher.set(name, f); }
  return f;
}
const melden = (f: Fach) => f.hoerer.forEach((h) => h());
export function useAblage<T>(name: string, start: T): { wert: T; setzen: (f: T | ((v: T) => T)) => void; ort: 'konto' | 'browser'; bereit: boolean } {
  const { wer } = useWer();
  const konto = wer?.userName ? `konto:${wer.userName}` : 'browser';
  const schluessel = `hub-${name}`;
  const f = fach(name, start);
  const [, neuZeichnen] = useState(0);
  useEffect(() => { const h = () => neuZeichnen((n) => n + 1); f.hoerer.add(h); return () => { f.hoerer.delete(h); }; }, [f]);
  useEffect(() => {
    if (f.fuer === konto || f.laedt) return;
    if (konto === 'browser') { f.wert = lokalLesen(schluessel, start); f.fuer = konto; melden(f); return; }
    f.laedt = true; melden(f);
    fetch(`/api/user-storage?key=${encodeURIComponent(schluessel)}`, { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      if (j?.value != null) f.wert = j.value;
      else { const l = lokalLesen(schluessel, start); f.wert = l; if (JSON.stringify(l) !== JSON.stringify(start)) kontoSchreiben(schluessel, l); }
    }).catch(() => { f.wert = lokalLesen(schluessel, start); }).finally(() => { f.fuer = konto; f.laedt = false; melden(f); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [konto, f, schluessel]);
  const setzen = useCallback((g: T | ((v: T) => T)) => {
    const neu = typeof g === 'function' ? (g as (v: T) => T)(f.wert as T) : g;
    f.wert = neu;
    try { localStorage.setItem(schluessel, JSON.stringify(neu)); } catch { /* voll oder gesperrt */ }
    if (konto !== 'browser') { if (f.warte) clearTimeout(f.warte); f.warte = setTimeout(() => kontoSchreiben(schluessel, neu), 600); }
    melden(f);
  }, [f, konto, schluessel]);
  return { wert: f.wert as T, setzen, ort: konto === 'browser' ? 'browser' : 'konto', bereit: f.fuer === konto && !f.laedt };
}
function kontoSchreiben(key: string, value: unknown) {
  fetch('/api/user-storage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) }).catch(() => {});
}

/** Die gemeinsamen persoenlichen Listen - Wunschliste und Spind als geordnete ID-Listen, Reaktionen als ID -> Reaktion. */
export const useWunschliste = () => useAblage<string[]>('wunschliste', []);
export const useSpind = () => useAblage<string[]>('spind', []);
export const useReaktionen = () => useAblage<Record<string, string>>('reaktionen', {});
