import { aendereJson, liesJson } from '@/lib/ablage';
import { liesCredits, sauberHandle, sauberLink, type CreditTafel, type FotoCredit } from '@/lib/fotoCredits';

/*
 * "Photos from" - von wem die Spielerfotos stammen, als eine Liste statt an jedem Foto (Betreiber, 17.11.2026).
 *
 * Die Liste rechnet sich selbst aus foto-credits.json (lib/fotoCredits.ts), gezaehlt werden nur Fotos, die gerade oeffentlich sind
 * (spielerbilder.json mit echtem, freiem Foto - liesJson laesst gesperrte schon weg). Neue Quellen erscheinen damit von selbst.
 *
 *   Organisationen   aus "quelle". Alles mit "Epic Games"/"Fortnite Competitive" heisst einheitlich "Fortnite Competitive / Epic Games"
 *                    (auch "Flickr ishootesport (BLAST/Epic Games)"); ein blosses "Flickr ..." ist nur der Ort, an dem die Fotografen
 *                    veroeffentlichen, keine Organisation; "unbekannt" zaehlt nie.
 *                    Das X-Konto eines Eintrags gehoert der Organisation nur, wenn kein Fotograf eingetragen ist.
 *   Fotografen       aus "fotograf" (mit X-Konto, wenn eingetragen).
 *
 * Interne Felder (lizenz, wahrscheinlich, notiz) gehen nie hinaus.
 *
 * Am einzelnen Foto (Betreiber, 17.11.2026, Nachtrag): grosse, wiederkehrende Quellen stehen NUR in der Liste. Ein kleiner Credit am Foto bleibt nur,
 * wenn jede Quelle dieses Fotos (Organisation und Fotograf) weniger als EINZELN_BIS oeffentliche Fotos hat - typisch das X-Konto einer Org mit einem
 * einzigen Foto (f1shyx -> @glore_gg) - oder wenn der Eintrag ausdruecklich "einzeln": true traegt.
 *
 * Von Hand ergaenzen: foto-quellen-extra.json in der Ablage (optional, /admin/fotos-credits):
 *   { "organisationen": [{ "name": "...", "handle"?: "...", "link"?: "..." }], "fotografen": [ ...gleich... ] }
 * Ein Eintrag mit demselben Namen oder X-Konto wie eine errechnete Quelle ergaenzt/ueberschreibt deren Anzeige; sonst kommt er ohne Zahl dazu.
 */

export const EXTRA_DATEI = 'foto-quellen-extra.json';
/** Ab so vielen oeffentlichen Fotos gilt eine Quelle als "gross" und steht nicht mehr am einzelnen Foto. */
export const EINZELN_BIS = 2;

export interface Quelle { name: string; handle?: string; link?: string; fotos: number }
export interface QuellenListe { organisationen: Quelle[]; fotografen: Quelle[] }
export interface ExtraEintrag { name: string; handle?: string; link?: string }
export interface Extra { organisationen: ExtraEintrag[]; fotografen: ExtraEintrag[] }
export interface EinzelCredit { text: string; link?: string; handle?: string; fotograf?: string }

const EPIC = 'Fortnite Competitive / Epic Games';
const klein = (s: string) => s.normalize('NFKC').trim().toLowerCase();

interface Teil { schluessel: string; name: string; handle?: string; link?: string }

/** Die Quellen eines Eintrags: Organisation und/oder Fotograf. Leer, wenn nichts Oeffentliches darin steht. */
export function quellenVon(c: FotoCredit | undefined): { org?: Teil; fotograf?: Teil } {
  if (!c) return {};
  const aus: { org?: Teil; fotograf?: Teil } = {};
  const fotograf = (c.fotograf ?? '').trim();
  const quelle = (c.quelle ?? '').trim();
  if (fotograf) {
    aus.fotograf = {
      schluessel: `f:${c.handle ? klein(c.handle) : klein(fotograf)}`, name: fotograf,
      ...(c.handle ? { handle: c.handle } : {}),
    };
  }
  const epic = /epic games|fortnite competitive/i.test(quelle);
  if (quelle && !/^(unbekannt|unknown|\?+)$/i.test(quelle) && (epic || !/^flickr\b/i.test(quelle))) {
    const name = epic ? EPIC : quelle;
    const handle = !fotograf && !epic ? c.handle : undefined;
    aus.org = { schluessel: `o:${epic ? 'epic' : handle ? klein(handle) : klein(name)}`, name, ...(handle ? { handle } : {}) };
  } else if (!fotograf && c.handle && !/^(unbekannt|unknown)$/i.test(quelle)) {
    // Nur ein X-Konto, ohne Namen.
    aus.org = { schluessel: `o:${klein(c.handle)}`, name: `@${c.handle}`, handle: c.handle };
  }
  return aus;
}

const dateiName = (d: string) => d.replace(/^spielerfotos\//, '');

/** Die Dateinamen der Fotos, die gerade oeffentlich sind. */
export async function oeffentlicheFotos(): Promise<Set<string>> {
  const bilder = await liesJson<Array<{ datei?: string; echtesFoto?: boolean }>>('spielerbilder.json', []);
  return new Set((Array.isArray(bilder) ? bilder : []).filter((b) => b?.echtesFoto && b.datei).map((b) => dateiName(String(b.datei))));
}

function sauberExtra(roh: unknown): Extra {
  const liste = (v: unknown): ExtraEintrag[] => (Array.isArray(v) ? v : []).flatMap((e) => {
    const x = (e ?? {}) as Record<string, unknown>;
    const name = String(x.name ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
    if (!name) return [];
    const handle = sauberHandle(x.handle);
    const link = sauberLink(x.link);
    return [{ name, ...(handle ? { handle } : {}), ...(link ? { link } : {}) }];
  }).slice(0, 100);
  const r = (roh ?? {}) as Record<string, unknown>;
  return { organisationen: liste(r.organisationen), fotografen: liste(r.fotografen) };
}

export async function liesExtra(): Promise<Extra> {
  return sauberExtra(await liesJson<unknown>(EXTRA_DATEI, {}));
}

export async function setzeExtra(e: unknown): Promise<Extra> {
  const neu = sauberExtra(e);
  await aendereJson<Extra>(EXTRA_DATEI, { organisationen: [], fotografen: [] }, () => neu);
  return neu;
}

const linkVon = (t: { handle?: string; link?: string }) => t.link || (t.handle ? `https://x.com/${t.handle}` : undefined);

/** Die oeffentliche Liste und die Credits, die am einzelnen Foto stehen bleiben - beides aus denselben Zahlen. */
export function berechne(credits: CreditTafel, oeffentlich: Set<string>, extra: Extra): QuellenListe & { einzeln: Record<string, EinzelCredit> } {
  const zahl = new Map<string, Quelle & { art: 'o' | 'f' }>();
  const proFoto: Array<[string, FotoCredit, Teil[]]> = [];
  for (const [datei, c] of Object.entries(credits)) {
    if (!oeffentlich.has(dateiName(datei))) continue;
    const { org, fotograf } = quellenVon(c);
    const teile = [org, fotograf].filter((x): x is Teil => Boolean(x));
    proFoto.push([datei, c, teile]);
    for (const t of teile) {
      const q = zahl.get(t.schluessel) ?? { art: t.schluessel[0] as 'o' | 'f', name: t.name, fotos: 0 };
      q.fotos += 1;
      if (t.handle && !q.handle) q.handle = t.handle;
      zahl.set(t.schluessel, q);
    }
  }

  // Credits am einzelnen Foto: nur kleine Quellen, oder ausdruecklich gewollt.
  const einzeln: Record<string, EinzelCredit> = {};
  for (const [datei, c, teile] of proFoto) {
    if (!teile.length) continue;
    const klein_ = teile.every((t) => (zahl.get(t.schluessel)?.fotos ?? 0) < EINZELN_BIS);
    if (!klein_ && c.einzeln !== true) continue;
    const haupt = teile.find((t) => t.schluessel.startsWith('f:')) ?? teile[0];
    const text = c.handle ? `@${c.handle}` : haupt.name;
    const link = c.link || (c.handle ? `https://x.com/${c.handle}` : '');
    einzeln[datei.replace(/\.(jpe?g|png|webp)$/i, '').toLowerCase()] = {
      text, ...(link ? { link } : {}), ...(c.handle ? { handle: c.handle } : {}), ...(c.fotograf ? { fotograf: c.fotograf } : {}),
    };
  }

  const liste = (art: 'o' | 'f', zusatz: ExtraEintrag[]): Quelle[] => {
    const aus = [...zahl.values()].filter((q) => q.art === art).map(({ name, handle, fotos }) => ({ name, ...(handle ? { handle } : {}), fotos }) as Quelle);
    for (const e of zusatz) {
      const treffer = aus.find((q) => klein(q.name) === klein(e.name) || (e.handle && q.handle && klein(q.handle) === klein(e.handle)));
      if (treffer) {
        treffer.name = e.name;
        if (e.handle) treffer.handle = e.handle;
        if (e.link) treffer.link = e.link;
      } else aus.push({ ...e, fotos: 0 });
    }
    return aus.map((q) => { const link = linkVon(q); return { ...q, ...(link ? { link } : {}) }; })
      .sort((a, b) => b.fotos - a.fotos || a.name.localeCompare(b.name));
  };
  return { organisationen: liste('o', extra.organisationen), fotografen: liste('f', extra.fotografen), einzeln };
}

export async function liesQuellen() {
  const [credits, oeffentlich, extra] = await Promise.all([liesCredits(), oeffentlicheFotos(), liesExtra().catch(() => ({ organisationen: [], fotografen: [] }))]);
  return berechne(credits, oeffentlich, extra);
}
