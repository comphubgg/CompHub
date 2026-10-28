import { liesJson, schreibJson } from '@/lib/ablage';
import { istKennungName } from '@/lib/kennungName';
import { GET as katalogAbruf } from '@/app/api/cup-catalog/route';
import { GET as bestenlisteAbruf } from '@/app/api/cup-leaderboard/route';
import { kernname, ohneZierrat } from '@/lib/homoglyph';
import { heuteDatum, type Tagesplan, type TagesPost } from '@/lib/tagesposts';
import { titelMit } from '@/lib/cupTitel';
import { zonenTage } from '@/lib/zonenBild';
import { kumulativeTage, tagNummer } from '@/lib/kumulativ';

/*
 * Der Post zu jedem gelaufenen Cup (Betreiber, 19.10.2026): "immer nach einem Cup automatisch die Top 10 mit Profilbildern, fuer Twitter direkt fertig - und die
 * Opens ebenso, nicht nur die Finals". Eine halbe Stunde nach dem Ende eines Spieltags legt dieser Lauf (alle zehn Minuten, siehe /api/cron/ergebnis-posts)
 * den Post an: der Text im Stil seiner eigenen Beitraege (Medaille, Flaggen, @-Konten, Punkte), dazu das Fotomosaik der Besten (/api/beitrag-bild).
 *
 * Was in den Post kommt, kommt aus der Bestenliste des Spieltags und aus den gepflegten Profilen (X-Konto, Land). Wer kein @-Konto hat, steht mit seinem
 * Namen da - nichts wird geraten. Jeder Spieltag bekommt nur einen Post (Schluessel "ergebnis:<windowId>" in posts-verlauf.json).
 */

const SEITE = 'https://www.thecomphub.com';
const VERLAUF = 'posts-verlauf.json';
const EU = 'EU';

export interface KatalogFenster { windowId: string; eventId: string; status?: string; end?: number; istFinale?: boolean }
export interface KatalogCup { id: string; titel: string; art: string; global?: boolean; regionen?: Record<string, KatalogFenster[]> }
interface Eintrag { rank: number; points: number; wins?: number; elims?: number; players?: Array<{ id?: string; name: string }> }

export interface Profil { x?: string; land?: string; anzeige?: string; name?: string; /** Wie die Stimme im TikTok-Video den Namen spricht (lib/aussprache), vom Betreiber eingetragen. */ aussprache?: string }

/** Das Fenster ist ein Finale, oder - bei Event/Runde - die hoechste Runde des Abends. */
export function finale(cup: KatalogCup, f: KatalogFenster, fenster: KatalogFenster[]): boolean {
  const m = /Event(\d+)Round(\d+)/i.exec(f.windowId);
  const hoechste = (e: string) => Math.max(0, ...fenster.map((x) => { const n = /Event(\d+)Round(\d+)/i.exec(x.windowId); return n && n[1] === e ? +n[2] : 0; }));
  return !!cup.global || !!f.istFinale || /final/i.test(f.windowId) || (!!m && +m[2] === hoechste(m[1]) && +m[2] > 1);
}

/** Wie der Spieltag heisst: Heat, Fast Track, LCQ, Event/Runde. */
export function fensterName(windowId: string, istFinale: boolean): string {
  let m = /Heat(\d+)/i.exec(windowId); if (m) return `Heat ${m[1]}`;
  if (/FastTrack/i.test(windowId)) return 'Fast Track';
  if (/LastChance|LCQ/i.test(windowId)) return 'Last Chance Qualifier';
  m = /Week(\d+)Final/i.exec(windowId); if (m) return `Week ${m[1]} Finals`;
  m = /Event(\d+)Round(\d+)/i.exec(windowId);
  if (m) return istFinale ? `Event ${m[1]} Finals` : `Event ${m[1]} Open`;
  m = /Day(\d+)/i.exec(windowId); if (m) return `Day ${m[1]}`;
  return istFinale ? 'Finals' : '';
}

const heuteDatumKurz = (ms?: number) => { const d = new Date(ms ?? Date.now()); return `${d.getUTCDate()} ${['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

const flagge = (land?: string | null) => (land && /^[A-Za-z]{2}$/.test(land)
  ? [...land.toUpperCase()].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join('') : '');

const PLATZ = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

export async function profilKarte(): Promise<{ profile: Map<string, Profil>; szene: Map<string, { name: string; land: string }> }> {
  const profile = new Map<string, Profil>();
  try {
    const roh = await liesJson<Record<string, Profil & { id?: string; epicId?: string }> | Array<Profil & { id?: string; epicId?: string }>>('spieler-profile.json', {});
    const liste = Array.isArray(roh) ? roh : Object.entries(roh).map(([k, v]) => ({ ...v, id: v.id || v.epicId || k }));
    for (const p of liste) { const id = (p.id || p.epicId || '').toLowerCase(); if (/^[0-9a-f]{32}$/.test(id)) profile.set(id, p); }
  } catch { /* ohne Profile steht der Name da */ }
  const szene = new Map<string, { name: string; land: string }>();
  try {
    const roh = await liesJson<Array<{ ID?: string; NAME?: string; COUNTRY?: string }>>('szene-quelle/spielerliste.json', []);
    for (const p of roh) if (p.ID && p.NAME && !istKennungName(p.NAME, p.ID)) szene.set(p.ID.toLowerCase(), { name: p.NAME, land: p.COUNTRY ?? '' });
  } catch { /* keine Kopie */ }
  return { profile, szene };
}

/** Die zehn ersten Teams eines Spieltags als fertiger Post - oder null, wenn die Bestenliste noch nicht steht. */
async function postZu(cup: KatalogCup, region: string, f: KatalogFenster, istFinale: boolean, karte: Awaited<ReturnType<typeof profilKarte>>): Promise<TagesPost | null> {
  let eintraege: Eintrag[] = [];
  try {
    const r = await bestenlisteAbruf(new Request(`${SEITE}/api/cup-leaderboard?event=${encodeURIComponent(f.eventId)}&window=${encodeURIComponent(f.windowId)}`));
    const j = await r.json() as { entries?: Eintrag[] };
    eintraege = (j.entries ?? []).slice(0, 10);
  } catch { return null; }
  if (eintraege.length < 3) return null;

  const spielerZeile = (p: { id?: string; name: string }) => {
    const id = (p.id ?? '').toLowerCase();
    const pr = karte.profile.get(id); const sz = karte.szene.get(id);
    const land = pr?.land || sz?.land || '';
    const name = ohneZierrat(kernname(pr?.anzeige || pr?.name || sz?.name || p.name)).trim() || p.name;
    return `${flagge(land)} ${pr?.x ? `@${pr.x.replace(/^@/, '')}` : name.toUpperCase()}`.trim();
  };
  const zeilen = eintraege.map((e, i) => `${PLATZ[i]} ${(e.players ?? []).map(spielerZeile).join(' + ')} ${e.points} pts`);

  const basis = titelMit(cup.titel, f.windowId);
  const name = /heat \d|last chance/i.test(basis) ? '' : fensterName(f.windowId, istFinale);
  const titel = `${basis}${name && !basis.toLowerCase().includes(name.toLowerCase()) ? ` ${name}` : ''}${region !== EU ? ` (${region})` : ''}`;
  // Je Team der Besten eine Gruppe ("a|b"): das Mosaik nimmt aus jedem Team einen Spieler mit Foto - fuenf Streifen, wenn es so viele gibt (Betreiber, 20.10.2026: "nimm fuenf Bilder
  // wie im Beispiel", nicht nur zwei). Die Liste reicht bis Platz 12, weil nicht von jedem ein Foto vorliegt.
  const ids = eintraege.slice(0, 12)
    .map((e) => [...new Set((e.players ?? []).map((p) => (p.id ?? '').toLowerCase()).filter((x) => /^[0-9a-f]{32}$/.test(x)))].join('|'))
    .filter((g, i, a) => g && a.indexOf(g) === i);
  return {
    nr: 0, art: 'ergebnis', schluessel: `ergebnis:${f.windowId}:${region}`,
    titel: `Ergebnis: ${titel}`,
    text: `${titel} Standings 👀\n\n${zeilen.join('\n')}\n\nFull leaderboard: ${SEITE}/events/${encodeURIComponent(cup.id)}`,
    // Dazu alles, was das Standings-Plakat braucht (app/api/plakat) - das Bild des Posts sind die Top 10 mit Profilbildern und Flaggen, nicht mehr das Fotomosaik.
    bild: { art: 'ergebnis', ids, event: f.eventId, window: f.windowId, region, titel: basis, stufe: [name].filter(Boolean).join(' '), datum: heuteDatumKurz(f.end) },
  };
}

/**
 * Zonen-Posts (Aufgabe 128, Betreiber 19.10.2026: "Zonenbilder fuer Finals" automatisch): nach jedem EU-Finale - bei mehreren Tagen nach dem letzten - ein Post mit
 * dem Zonen-Bild aller Games (lib/zonenBild), sobald jedes Game ausgewertet ist: so viele Games mit Zone, wie die Besten der Bestenliste gespielt haben. Bis dahin
 * wartet der Post; nach 48 Stunden nicht mehr.
 */
export async function zonenPostsFinden(max = 2): Promise<TagesPost[]> {
  const jetzt = Date.now();
  let katalog: { cups?: KatalogCup[] } = {};
  try { katalog = await (await katalogAbruf(new Request(`${SEITE}/api/cup-catalog?modus=standard`))).json(); } catch { return []; }
  const verlauf = await liesJson<string[]>(VERLAUF, []);
  const benutzt = new Set(verlauf);
  const neu: TagesPost[] = [];
  for (const cup of katalog.cups ?? []) {
    if (neu.length >= max) break;
    if (cup.art !== 'championship' && cup.art !== 'division') continue;
    const fenster = cup.regionen?.[EU] ?? [];
    const gruppe = kumulativeTage(fenster.map((x) => ({ ...x, istFinale: x.istFinale ?? /final/i.test(x.windowId) })));
    for (const f of fenster) {
      if (f.status !== 'vorbei' || !f.end || String(f.eventId).startsWith('manuell_') || !finale(cup, f, fenster)) continue;
      if (f.end > jetzt - 45 * 60_000 || f.end < jetzt - 48 * 3_600_000) continue;
      // Bei mehrtaegigen Finals nur nach dem letzten Tag, mit allen Tagen im Bild.
      if (gruppe.length > 1 && gruppe.some((x) => x.windowId === f.windowId)
        && (tagNummer(f.windowId) !== Math.max(...gruppe.map((x) => tagNummer(x.windowId))) || gruppe.some((x) => x.status !== 'vorbei'))) continue;
      // "zonen-bild:" - der erste Stand (28.10. nachts) vermerkte den Post schon vor dem Bild; so kommt das Finale noch einmal dran.
      const schluessel = `zonen-bild:${f.windowId}`;
      if (neu.some((p) => p.schluessel === schluessel)) continue;
      if (benutzt.has(schluessel)) continue;
      const tage = await zonenTage(f.windowId).catch(() => []);
      if (!tage.length) continue;
      // Vollstaendig? Je Tag so viele ausgewertete Games, wie der Erste der Bestenliste gespielt hat.
      let vollstaendig = true;
      for (const t of tage) {
        try {
          const r = await bestenlisteAbruf(new Request(`${SEITE}/api/cup-leaderboard?event=${encodeURIComponent(f.eventId)}&window=${encodeURIComponent(t.windowId)}`));
          const j = await r.json() as { entries?: Array<{ matches?: unknown[] }> };
          const soll = Math.max(0, ...(j.entries ?? []).slice(0, 10).map((e) => (e.matches ?? []).length));
          if (!soll || t.matches.length < soll) vollstaendig = false;
        } catch { vollstaendig = false; }
      }
      if (!vollstaendig) continue;
      const basis = titelMit(cup.titel, f.windowId).replace(/\s*Day\s*\d+\s*$/i, '');
      neu.push({
        nr: 0, art: 'zonen', schluessel, titel: `Zonen: ${basis}`,
        text: `${basis} - zones of every game 🗺️\n\n${tage.length > 1 ? `${tage.map((t, i) => `Day ${tagNummer(t.windowId) || i + 1} ${['⚫', '🔴', '🟣'][i] ?? ''}`).join(' · ')}\n` : ''}🟡 = where the zone moved next\n\nFull results: ${SEITE}/events/${encodeURIComponent(cup.id)}`,
        bild: { art: 'zonen', window: f.windowId, tage: tage.map((t) => t.windowId) },
      });
    }
  }
  return neu;
}

/** Einen Zonen-Post in den Plan des Tages haengen und als erledigt vermerken - erst, wenn sein Bild verschickt ist (sonst kaeme er nie wieder). */
export async function zonenPostVermerken(p: TagesPost): Promise<void> {
  const datum = heuteDatum();
  const name = `posts-${datum}.json`;
  const plan = await liesJson<Tagesplan | null>(name, null) ?? { datum, erstellt: Date.now(), posts: [] };
  plan.posts.push({ ...p, nr: plan.posts.length });
  await schreibJson(name, plan);
  const verlauf = await liesJson<string[]>(VERLAUF, []);
  await schreibJson(VERLAUF, [...verlauf, p.schluessel].slice(-600));
}

/**
 * Neue Ergebnis-Posts anlegen: fuer jeden Spieltag der letzten zwoelf Stunden, der seit mindestens zwanzig Minuten vorbei ist und noch keinen hat.
 * Immer die EU-Fenster (auch Opens), aus den uebrigen Regionen nur Finals. Hoechstens sechs je Lauf.
 */
export async function ergebnisPostsAnlegen(max = 6, stunden = 12): Promise<TagesPost[]> {
  const jetzt = Date.now();
  let katalog: { cups?: KatalogCup[] } = {};
  try { katalog = await (await katalogAbruf(new Request(`${SEITE}/api/cup-catalog?modus=standard`))).json(); } catch { return []; }
  const verlauf = await liesJson<string[]>(VERLAUF, []);
  const benutzt = new Set(verlauf);
  const kandidaten: Array<{ cup: KatalogCup; region: string; f: KatalogFenster; istFinale: boolean }> = [];
  for (const cup of katalog.cups ?? []) {
    if (cup.art !== 'championship' && cup.art !== 'division') continue;
    for (const [region, fenster] of Object.entries(cup.regionen ?? {})) {
      for (const f of fenster) {
        if (f.status !== 'vorbei' || !f.end || String(f.eventId).startsWith('manuell_')) continue;
        if (f.end > jetzt - 20 * 60_000 || f.end < jetzt - stunden * 3_600_000) continue;
        const istFinale = finale(cup, f, fenster);
        if (region !== EU && !istFinale) continue;
        if (benutzt.has(`ergebnis:${f.windowId}:${region}`)) continue;
        kandidaten.push({ cup, region, f, istFinale });
      }
    }
  }
  if (!kandidaten.length) return [];
  // Die Finals zuerst, dann die juengsten.
  kandidaten.sort((a, b) => Number(b.istFinale) - Number(a.istFinale) || (b.f.end ?? 0) - (a.f.end ?? 0));
  const karte = await profilKarte();
  const neu: TagesPost[] = [];
  for (const k of kandidaten.slice(0, max)) {
    const p = await postZu(k.cup, k.region, k.f, k.istFinale, karte);
    if (p) neu.push(p);
  }
  if (!neu.length) return [];

  // An den Plan von heute haengen (er wird angelegt, wenn es ihn noch nicht gibt) und als gebraucht vermerken.
  const datum = heuteDatum();
  const name = `posts-${datum}.json`;
  const plan = await liesJson<Tagesplan | null>(name, null) ?? { datum, erstellt: Date.now(), posts: [] };
  for (const p of neu) plan.posts.push({ ...p, nr: plan.posts.length });
  await schreibJson(name, plan);
  await schreibJson(VERLAUF, [...verlauf, ...neu.map((p) => p.schluessel)].slice(-600));
  return plan.posts.slice(-neu.length);
}
