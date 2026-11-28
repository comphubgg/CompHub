import { useEffect, useState } from 'react';
import type { DbWaffe, Klasse, Stufe } from './waffenDaten';

/*
 * ALLE Waffen, die es je gab (Betreiber 27.11.2026): aus dem Fortnite Wiki (fortnite.fandom.com, Texte CC BY-SA - auf den Seiten mit Link genannt).
 * Abgefragt wird die MediaWiki-API ueber den Vite-Proxy /fandom (vite.config.ts; Betreiber 28.11.2026: direkt aus dem Browser kamen auf seinem
 * PC keine alten Waffen an - der Abruf scheiterte). Antwortet der Proxy nicht, wird einmal direkt gefragt (origin=* = anonymes CORS):
 *   1. list=categorymembers  - Waffen-Kategorie und ihre Unterkategorien (Assault Rifles, Shotguns ...), ohne Save the World / LEGO / Creative
 *   2. prop=revisions        - Quelltext (Wikitext) von je 50 Seiten auf einmal, 3 Abfragen parallel
 *   3. lesen                 - Infobox-Parameter + Werte-Tabellen je Seltenheit, Saisons (eingefuehrt / vaulted / unvaulted), Klasse, Bild
 * Ergebnis: DbWaffe[] im selben Format wie waffen.json (waffenDaten.ts), gemerkt fuer 7 Tage (IndexedDB, sonst localStorage).
 * Werte aus den Spieldateien (waffen.json) gehen immer vor - siehe zusammenfuehren().
 */
export const WIKI = 'https://fortnite.fandom.com';
/** Erst ueber den eigenen Proxy (gleiche Herkunft), sonst direkt */
const APIS = ['/fandom/api.php', `${WIKI}/api.php`];
let apiNr = 0;
const WURZELN = ['Category:Battle Royale Weapons', 'Category:Weapons (Battle Royale)', 'Category:Weapons'];
const OHNE = /save the world|stw|lego|creative|festival|ammunition|traps?\b|consumables|healing|resources|items by|cosmetic|harvesting|pickaxe|unreleased|concept|cut content/i;
const MAX_SEITEN = 1600;
const SCHLUESSEL = 'hub-waffen-wiki-v2';
const ALTER = 7 * 864e5;

/* ---------------------------------------------- Wikitext lesen */
/** Vorlagen ({{Name|a=b|c}}) mit Verschachtelung - jede mit benannten und Positions-Parametern. */
export function vorlagen(text: string): Array<{ name: string; params: Record<string, string>; pos: string[] }> {
  const out: Array<{ name: string; params: Record<string, string>; pos: string[] }> = [];
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] !== '{' || text[i + 1] !== '{') continue;
    let tiefe = 0; let j = i;
    for (; j < text.length - 1; j++) {
      if (text[j] === '{' && text[j + 1] === '{') { tiefe++; j++; } else if (text[j] === '}' && text[j + 1] === '}') { tiefe--; j++; if (!tiefe) break; }
    }
    const innen = text.slice(i + 2, j - 1);
    const teile: string[] = []; let d = 0; let start = 0;
    for (let k = 0; k < innen.length; k++) {
      const c = innen.slice(k, k + 2);
      if (c === '{{' || c === '[[') { d++; k++; continue; }
      if (c === '}}' || c === ']]') { d--; k++; continue; }
      if (innen[k] === '|' && d === 0) { teile.push(innen.slice(start, k)); start = k + 1; }
    }
    teile.push(innen.slice(start));
    const params: Record<string, string> = {}; const pos: string[] = [];
    for (const t of teile.slice(1)) { const g = t.indexOf('='); if (g > 0 && !/[{[]/.test(t.slice(0, g))) params[normal(t.slice(0, g))] = t.slice(g + 1).trim(); else pos.push(t.trim()); }
    out.push({ name: teile[0].trim(), params, pos });
    // verschachtelte Vorlagen ebenfalls lesen
    out.push(...vorlagen(innen));
    i = j;
  }
  return out;
}
const normal = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Wiki-Auszeichnung entfernen: Links, Vorlagen, Referenzen, HTML, Fett/Kursiv. */
export function klartext(v: string): string {
  return v.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[\s\S]*?<\/ref>/gi, '').replace(/<br\s*\/?>/gi, ', ').replace(/<[^>]+>/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1').replace(/\{\{\s*(?:rarity|r|color|colour|tooltip|nowrap)\s*\|(?:[^{}]*\|)?([^{}|]*)\}\}/gi, '$1').replace(/\{\{[^{}]*\}\}/g, '').replace(/'{2,}/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
const zahlAus = (v?: string) => { if (!v) return undefined; const m = /-?\d+(?:[.,]\d+)?/.exec(klartext(v).replace(/(\d),(\d{3})/g, '$1$2')); return m ? Number(m[0].replace(',', '.')) : undefined; };

const RARITAETEN: Array<[string, RegExp]> = [
  ['common', /^(common|c|grey|gray)$/], ['uncommon', /^(uncommon|uc|green)$/], ['rare', /^(rare|r|blue)$/], ['epic', /^(epic|vr|purple)$/],
  ['legendary', /^(legendary|sr|gold|orange)$/], ['mythic', /^(mythic|ur)$/], ['exotic', /^(exotic|x)$/],
];
const rar = (s: string) => { const n = normal(klartext(s)); return RARITAETEN.find(([, r]) => r.test(n))?.[0]; };
const RAR_WORT = /(common|uncommon|rare|epic|legendary|mythic|exotic)/;

/** Wert-Namen (normalisiert) -> Feld in Stufe. */
const FELDER: Array<[keyof Stufe, RegExp]> = [
  ['dps', /^(dps|damagepersecond)$/], ['fireRate', /^(firerate|rateoffire|rof|fireratepersecond)$/],
  ['magazine', /^(magazine|magazinesize|magsize|clipsize|clip|ammocapacity|capacity)$/], ['reloadTime', /^(reloadtime|reload|reloadspeed)$/],
  ['structureDamage', /^(structuredamage|environmentdamage|envdamage|structure|buildingdamage)$/], ['headshotMultiplier', /^(headshotmultiplier|headshot|critmultiplier|headshotdmg|headshotdamage)$/],
  ['pellets', /^(pellets|pelletcount)$/], ['damage', /^(damage|dmg|bodydamage|basedamage|bodyshot|bodyshotdamage)$/],
  ['equipTime', /^(equiptime|pullouttime|equip)$/],
];
const feldVon = (k: string) => FELDER.find(([, r]) => r.test(k))?.[0];
function setzen(s: Stufe, f: keyof Stufe, roh: string) {
  const n = zahlAus(roh); if (n === undefined) return;
  if (f === 'headshotMultiplier') { if (n > 5 && s.damage) (s as unknown as Record<string, number>).headshotMultiplier = Math.round((n / s.damage) * 100) / 100; else if (n <= 5) s.headshotMultiplier = n; return; }
  (s as unknown as Record<string, number>)[f] = n;
}

/** Werte je Seltenheit aus Infobox-Parametern: "damage_common", "commondamage", "damage1" (mit rarities=Common, Rare ...). */
function ausParametern(p: Record<string, string>): Map<string, Stufe> {
  const m = new Map<string, Stufe>();
  const stufe = (r: string) => { if (!m.has(r)) m.set(r, { rarity: r }); return m.get(r)!; };
  const reihenfolge = (p.rarities ?? p.rarity ?? p.availablerarities ?? '').split(/[,/;\n]|<br\s*\/?>/i).map(rar).filter(Boolean) as string[];
  for (const [k, v] of Object.entries(p)) {
    const w = RAR_WORT.exec(k);
    if (w) { const rest = k.replace(w[1], ''); const f = feldVon(rest); if (f) setzen(stufe(w[1]), f, v); continue; }
    const z = /^(.*?)(\d)$/.exec(k);
    if (z && reihenfolge.length) { const f = feldVon(z[1]); const r = reihenfolge[Number(z[2]) - 1]; if (f && r) setzen(stufe(r), f, v); }
  }
  // "damage=30 / 31 / 33" mit rarities=Common, Uncommon, Rare: der Reihe nach
  if (reihenfolge.length > 1) {
    for (const [k, v] of Object.entries(p)) {
      const f = feldVon(k); if (!f) continue;
      const zahlen = klartext(v).split(/\s*[/,|;]\s*|\s+-\s+/).map((x) => zahlAus(x)).filter((x): x is number => x !== undefined);
      if (zahlen.length === reihenfolge.length) zahlen.forEach((n, i) => { if ((stufe(reihenfolge[i]) as unknown as Record<string, unknown>)[f] === undefined) setzen(stufe(reihenfolge[i]), f, String(n)); });
      else if (zahlen.length === 1) reihenfolge.forEach((r) => { if ((stufe(r) as unknown as Record<string, unknown>)[f] === undefined) setzen(stufe(r), f, String(zahlen[0])); });
    }
  }
  // Nur eine Seltenheit (z. B. Mythic) und Werte ohne Zusatz: "damage=..." gilt fuer sie
  if (!m.size && reihenfolge.length === 1) { const s = stufe(reihenfolge[0]); for (const [k, v] of Object.entries(p)) { const f = feldVon(k); if (f) setzen(s, f, v); } if (Object.keys(s).length <= 1) m.clear(); }
  return m;
}
/** Wikitabellen: Zeilen = Seltenheiten (Spalten = Werte) oder umgekehrt. */
function ausTabellen(text: string): Map<string, Stufe> {
  const m = new Map<string, Stufe>();
  const stufe = (r: string) => { if (!m.has(r)) m.set(r, { rarity: r }); return m.get(r)!; };
  for (const block of text.match(/\{\|[\s\S]*?\n\|\}/g) ?? []) {
    const zeilen = block.split(/\n\|-[^\n]*/).map((z) => z.replace(/^\{\|[^\n]*\n?/, '').replace(/\n\|\}$/, ''));
    const zellen = zeilen.map((z) => z.split('\n').filter((l) => /^[|!]/.test(l) && !/^\|\+/.test(l)).flatMap((l) => l.replace(/^[|!]/, '').split(/!!|\|\|/))
      .map((c) => { const t = c.includes('|') && !c.includes('[[') ? c.slice(c.lastIndexOf('|') + 1) : c; return klartext(t); })).filter((z) => z.length);
    if (zellen.length < 2) continue;
    const kopf = zellen[0];
    const kopfFelder = kopf.map((h) => feldVon(normal(h)));
    if (kopfFelder.filter(Boolean).length >= 1 && zellen.slice(1).some((z) => rar(z[0]))) {
      for (const z of zellen.slice(1)) { const r = rar(z[0]); if (!r) continue; z.forEach((c, i) => { const f = kopfFelder[i]; if (f) setzen(stufe(r), f, c); }); }
      continue;
    }
    const kopfRar = kopf.map((h) => rar(h));
    if (kopfRar.filter(Boolean).length >= 1) {
      for (const z of zellen.slice(1)) { const f = feldVon(normal(z[0])); if (!f) continue; z.forEach((c, i) => { const r = kopfRar[i]; if (r) setzen(stufe(r), f, c); }); }
    }
  }
  return m;
}

const KLASSEN: Array<[Klasse, RegExp]> = [
  ['shotgun', /shotgun/i], ['smg', /submachine|smg/i], ['sniper', /sniper|marksman|dmr/i], ['ar', /assault rifle|\bar\b|rifle/i], ['pistol', /pistol|revolver|hand cannon|deagle/i],
  ['launcher', /launcher|rocket|explosive|bow|crossbow/i], ['throwable', /grenade|throwable|bomb|mine|c4/i], ['melee', /melee|sword|blade|hammer|katana/i],
];
const SAISON = /Chapter\s*(\d+)\s*[,:-]?\s*Season\s*(\d+|OG|X|Remix|Zero)|Season\s*(\d+|X)\b(?!\s*of)/gi;
function saisonen(text: string): string[] {
  const s = new Set<string>();
  for (const m of text.matchAll(SAISON)) s.add(m[1] ? `C${m[1]} S${m[2].toUpperCase()}` : `C1 S${m[3].toUpperCase()}`);
  const wert = (x: string) => { const [, c, t] = /C(\d+) S(\w+)/.exec(x) ?? []; return Number(c) * 100 + (Number(t) || (t === 'X' ? 10 : t === 'OG' ? 50 : 60)); };
  return [...s].sort((a, b) => wert(a) - wert(b));
}

/** Eine Wiki-Seite -> DbWaffe (oder null, wenn es keine BR-Waffe ist). */
export function seiteLesen(titel: string, text: string, kategorien: string[] = []): DbWaffe | null {
  if (!text || /^#redirect/i.test(text.trim())) return null;
  const alleKat = [...kategorien, ...[...text.matchAll(/\[\[Category:([^\]|]+)/gi)].map((m) => m[1])].join(' ');
  if (/save the world/i.test(alleKat) && !/battle royale/i.test(alleKat)) return null;
  const v = vorlagen(text);
  const box = v.filter((x) => /infobox|weapon/i.test(x.name) && !/navbox|nav\b/i.test(x.name));
  const p: Record<string, string> = Object.assign({}, ...box.map((b) => b.params));
  const stufen = new Map<string, Stufe>();
  for (const b of box) for (const [r, s] of ausParametern(b.params)) stufen.set(r, { ...stufen.get(r), ...s });
  for (const [r, s] of ausTabellen(text)) stufen.set(r, { ...s, ...stufen.get(r) });
  const name = klartext(p.name ?? p.title ?? titel).replace(/\s*\((Battle Royale|weapon|item)\)$/i, '') || titel;
  const typText = klartext(`${p.type ?? ''} ${p.weapontype ?? ''} ${p.class ?? ''} ${p.category ?? ''}`) || alleKat;
  const klasse = KLASSEN.find(([, r]) => r.test(typText))?.[0] ?? KLASSEN.find(([, r]) => r.test(`${name} ${alleKat}`))?.[0] ?? 'special';
  if (!stufen.size && !box.length) return null;
  const rarities = [...stufen.values()].filter((s) => Object.keys(s).length > 1);
  for (const s of rarities) if (s.dps === undefined && s.damage !== undefined && s.fireRate !== undefined) { s.dps = Math.round(s.damage * (s.pellets ?? 1) * s.fireRate * 10) / 10; s.dpsGerechnet = true; }
  const ordnung = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exotic'];
  rarities.sort((a, b) => ordnung.indexOf(a.rarity) - ordnung.indexOf(b.rarity));
  const verfuegbar = ['introduced', 'added', 'release', 'released', 'availability', 'available', 'seasons', 'vaulted', 'unvaulted', 'removed'].map((k) => p[k] ?? '').join(' ');
  // Saisons: Infobox-Felder + Fliesstext (ohne Vorlagen wie Navigationsleisten)
  const abschnitt = text.replace(/\{\{[\s\S]*?\}\}/g, ' ').replace(/\[\[Category:[^\]]*\]\]/g, ' ');
  const bildDatei = klartext(p.image ?? p.image1 ?? p.icon ?? '').replace(/^(File|Image):/i, '');
  return {
    id: `wiki_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`, name, class: klasse, blueprints: [], rarities,
    ammo: p.ammo || p.ammotype ? klartext(p.ammo ?? p.ammotype) : undefined, description: p.description ? klartext(p.description).slice(0, 400) : undefined,
    saisons: saisonen(`${verfuegbar} ${abschnitt}`), vaulted: (/vaulted/i.test(`${alleKat} ${p.status ?? ''}`) && !/unvaulted|current/i.test(p.status ?? '')) || (/\bvaulted\b/i.test(abschnitt) && !/\bunvaulted\b/i.test(abschnitt)),
    quelle: 'wiki', wiki: `${WIKI}/wiki/${encodeURIComponent(titel.replace(/ /g, '_'))}`,
    wikiBild: bildDatei && /\.(png|jpe?g|webp|gif)$/i.test(bildDatei) ? `${WIKI}/wiki/Special:FilePath/${encodeURIComponent(bildDatei)}?width=256` : undefined,
  };
}

/* ---------------------------------------------- Abfragen */
async function api(q: Record<string, string>) {
  const u = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...q });
  for (;;) {
    try {
      const r = await fetch(`${APIS[apiNr]}?${u}`);
      // Vite liefert ohne Proxy die Hub-Seite (HTML) - das zaehlt wie ein Fehler
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error(`wiki ${r.status}`);
      return await r.json();
    } catch (f) {
      if (apiNr >= APIS.length - 1) throw f;
      apiNr += 1; // naechster Weg (direkt) fuer diese und alle weiteren Abfragen
    }
  }
}
async function mitglieder(kat: string): Promise<Array<{ title: string; ns: number }>> {
  const out: Array<{ title: string; ns: number }> = []; let weiter: Record<string, string> = {};
  for (let n = 0; n < 10; n++) {
    const j = await api({ action: 'query', list: 'categorymembers', cmtitle: kat, cmlimit: '500', cmtype: 'page|subcat', ...weiter });
    out.push(...(j?.query?.categorymembers ?? []));
    if (!j?.continue) break; weiter = j.continue;
  }
  return out;
}
async function seitenListe(): Promise<string[]> {
  for (const w of WURZELN) {
    const seiten = new Set<string>(); const gesehen = new Set<string>([w]);
    let ebene = [w];
    for (let tiefe = 0; tiefe < 3 && ebene.length; tiefe++) {
      const naechste: string[] = [];
      for (const k of ebene) {
        for (const m of await mitglieder(k).catch(() => [])) {
          if (m.ns === 14) { if (!gesehen.has(m.title) && !OHNE.test(m.title)) { gesehen.add(m.title); naechste.push(m.title); } } else if (m.ns === 0 && !OHNE.test(m.title)) seiten.add(m.title);
        }
      }
      ebene = naechste;
    }
    if (seiten.size) return [...seiten].slice(0, MAX_SEITEN);
  }
  return [];
}
/* eslint-disable @typescript-eslint/no-explicit-any */
async function quelltexte(titel: string[]): Promise<Array<{ titel: string; text: string; kat: string[] }>> {
  const j = await api({ action: 'query', prop: 'revisions|categories', rvprop: 'content', rvslots: 'main', cllimit: 'max', titles: titel.join('|') });
  return (j?.query?.pages ?? []).map((p: any) => ({ titel: p.title, text: p.revisions?.[0]?.slots?.main?.content ?? p.revisions?.[0]?.content ?? p.revisions?.[0]?.['*'] ?? '', kat: (p.categories ?? []).map((c: any) => String(c.title).replace(/^Category:/, '')) }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ---------------------------------------------- Cache (IndexedDB, sonst localStorage) */
function idb(): Promise<IDBDatabase | null> {
  return new Promise((ok) => { try { const r = indexedDB.open('hub-wiki', 1); r.onupgradeneeded = () => r.result.createObjectStore('daten'); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); } catch { ok(null); } });
}
async function cacheLesen(): Promise<{ t: number; waffen: DbWaffe[] } | null> {
  const d = await idb();
  if (d) { const x = await new Promise<unknown>((ok) => { try { const g = d.transaction('daten').objectStore('daten').get(SCHLUESSEL); g.onsuccess = () => ok(g.result); g.onerror = () => ok(null); } catch { ok(null); } }); if (x) return x as { t: number; waffen: DbWaffe[] }; }
  try { const r = localStorage.getItem(SCHLUESSEL); return r ? JSON.parse(r) : null; } catch { return null; }
}
async function cacheSchreiben(waffen: DbWaffe[]) {
  const x = { t: Date.now(), waffen };
  const d = await idb();
  if (d) { try { d.transaction('daten', 'readwrite').objectStore('daten').put(x, SCHLUESSEL); return; } catch { /* weiter */ } }
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify(x)); } catch { /* voll */ }
}

/* ---------------------------------------------- Laden mit Fortschritt (einmal je Sitzung, geteilt) */
interface Stand { waffen: DbWaffe[] | null; status: 'laedt' | 'da' | 'fehlt'; fertig: number; gesamt: number; stand?: number }
let stand: Stand = { waffen: null, status: 'laedt', fertig: 0, gesamt: 0 };
let gestartet = false;
const hoerer = new Set<() => void>();
const melden = (x: Partial<Stand>) => { stand = { ...stand, ...x }; hoerer.forEach((h) => h()); };
async function laden(neu = false) {
  apiNr = 0;
  if (!neu) {
    const c = await cacheLesen();
    if (c?.waffen?.length) { melden({ waffen: c.waffen, status: 'da', stand: c.t, fertig: 1, gesamt: 1 }); if (Date.now() - c.t < ALTER) return; }
  }
  try {
    const titel = await seitenListe();
    if (!titel.length) throw new Error('keine Seiten');
    melden({ gesamt: titel.length, fertig: 0 });
    const pakete: string[][] = []; for (let i = 0; i < titel.length; i += 50) pakete.push(titel.slice(i, i + 50));
    const waffen = new Map<string, DbWaffe>(); let fertig = 0;
    const arbeiter = async () => {
      for (let p = pakete.shift(); p; p = pakete.shift()) {
        const seiten = await quelltexte(p).catch(() => []);
        for (const s of seiten) { const w = seiteLesen(s.titel, s.text, s.kat); if (w && !waffen.has(w.id)) waffen.set(w.id, w); }
        fertig += p.length; melden({ fertig: Math.min(fertig, titel.length) });
      }
    };
    await Promise.all([arbeiter(), arbeiter(), arbeiter()]);
    const liste = [...waffen.values()].filter((w) => w.rarities.length || (w.saisons?.length ?? 0) > 0);
    if (!liste.length) throw new Error('nichts gelesen');
    melden({ waffen: liste, status: 'da', stand: Date.now() });
    cacheSchreiben(liste);
  } catch {
    if (!stand.waffen) melden({ status: 'fehlt' });
  }
}
export function useWikiWaffen(): Stand & { neu: () => void } {
  const [, neu] = useState(0);
  useEffect(() => {
    const h = () => neu((n) => n + 1); hoerer.add(h);
    if (!gestartet) { gestartet = true; laden(); }
    return () => { hoerer.delete(h); };
  }, []);
  return { ...stand, neu: () => { melden({ fertig: 0, status: stand.waffen ? stand.status : 'laedt' }); laden(true); } };
}

/* ---------------------------------------------- Zusammenfuehren: Spieldateien vor Wiki */
const ORDNUNG = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exotic'];
const nameSchluessel = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
export function zusammenfuehren<T extends { weapons: DbWaffe[] }>(spiel: T | null, wiki: DbWaffe[] | null): T | null {
  if (!wiki?.length) return spiel;
  const basis = spiel ?? ({ weapons: [], changes: [] } as unknown as T);
  const nachName = new Map(wiki.map((w) => [nameSchluessel(w.name), w]));
  const weapons = basis.weapons.map((w) => {
    const x = nachName.get(nameSchluessel(w.name)); if (!x) return { ...w, quelle: 'spiel' as const };
    nachName.delete(nameSchluessel(w.name));
    // Werte der Spieldateien gewinnen; das Wiki ergaenzt nur, was fehlt (Saisons, Beschreibung, Werte fuer fehlende Seltenheiten)
    const rar = new Set(w.rarities.map((r) => r.rarity));
    return { ...w, quelle: 'spiel' as const, saisons: w.saisons ?? x.saisons, description: w.description ?? x.description, wiki: x.wiki, wikiBild: x.wikiBild, vaulted: false,
      rarities: [...w.rarities, ...x.rarities.filter((r) => !rar.has(r.rarity)).map((r) => ({ ...r, ausWiki: true }))].sort((a, b) => ORDNUNG.indexOf(a.rarity) - ORDNUNG.indexOf(b.rarity)) };
  });
  // Gibt es den Export der Spieldateien, ist alles, was dort fehlt, nicht im aktuellen Pool
  return { ...basis, weapons: [...weapons, ...[...nachName.values()].map((w) => (spiel ? { ...w, vaulted: true } : w))] };
}
