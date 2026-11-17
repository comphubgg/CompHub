import { cookies } from 'next/headers';
import path from 'path';
import { timingSafeEqual } from 'crypto';
import fs from '@/lib/ablageFs';
import { DATEN_ORT } from '@/lib/datenOrt';
import { kontoAus, nachId, istVip } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach, rechteVon } from '@/lib/vipZugaenge';
import { wirksameRechte } from '@/lib/rechte';

/*
 * Who may use the Finest Creative overlays (lib/rechte VIP_BEREICHE "finest").
 *
 * PRIVATE (11/2026): a demo for a potential partner, shown by the operator in
 * a call. Nothing of it is public:
 *   - the pages /overlays/finest and /overlays/finest/control answer 404
 *     unless the signed-in person has the tick (server components),
 *   - the overlay itself (/overlays/finest/live) and its settings
 *     (/api/overlay-config) need the overlay's secret view key or the tick,
 *   - the partner's logo, clip and thumbnail live in the private data
 *     archive (partner/finest/...) and come only through /api/finest/datei,
 *     with the same check.
 * Checked live on every request, so taking the tick away in Admin -> Accounts
 * switches everything off at once (the OBS source goes blank on its next poll).
 * The operator and admin accounts have it without a tick.
 */

export const FINEST = 'finest';

/** Does the account behind an overlay owner id ("betreiber", "vip:<name>", account id) have access? */
export async function identDarfFinest(ident: string): Promise<boolean> {
  if (!ident) return false;
  if (ident === 'betreiber') return true;
  if (ident.startsWith('vip:')) {
    const r = rechteVon(await zugangNach(ident.slice(4)));
    return r.gueltig && (r.rolle === 'admin' || r.rechte.includes(FINEST));
  }
  const k = await nachId(ident);
  if (!k || (k as { gesperrt?: boolean }).gesperrt) return false;
  if (k.rolle === 'admin') return true;
  return wirksameRechte(k.rolle, k.rechte, istVip(k)).includes(FINEST);
}

/**
 * Does the person making this request have access - with their OWN rights?
 *
 * A manager acts on the overlays of his streamer, but whether he may touch
 * the Finest Creative ones depends on his own tick (or the operator's).
 * Returns the idents that qualified, so they can be remembered on the overlay.
 */
export async function ichDarfFinest(): Promise<string[]> {
  const laden = await cookies();
  const raus: string[] = [];
  const id = kontoAus(laden.get('streamer_dashboard_konto')?.value);
  if (id && await identDarfFinest(id)) raus.push(id);
  const vipWert = laden.get('streamer_dashboard_auth')?.value;
  if (vipWert) {
    if (istBetreiber(vipWert)) raus.push('betreiber');
    else {
      const name = vipAus(vipWert);
      if (name && await identDarfFinest(`vip:${name}`)) raus.push(`vip:${name}`);
    }
  }
  return raus;
}

/** The part of a saved overlay the checks need (app/api/overlay-config OverlayEintrag). */
export interface FinestEintrag {
  id: string;
  typ: string;
  besitzer: string;
  geloeschtAm?: number;
  /** Who with access saved it (a manager acting for his streamer). */
  finestVon?: string[];
  /** Secret view key: the OBS / browser URL carries it (?k=). */
  sicht?: string;
}

/**
 * May this Finest Creative overlay be drawn / controlled right now?
 *
 * Yes while its owner - or one of the people with access who saved it - still
 * has the tick. Other overlay types are not affected.
 */
export async function finestErlaubt(e: FinestEintrag): Promise<boolean> {
  if (e.typ !== 'finest') return true;
  if (await identDarfFinest(e.besitzer)) return true;
  for (const ident of e.finestVon ?? []) if (await identDarfFinest(ident)) return true;
  return false;
}

/** Constant-time comparison of the view key from the URL with the stored one. */
export function sichtPasst(e: FinestEintrag, k: string | null | undefined): boolean {
  if (!e.sicht || !k) return false;
  const a = Buffer.from(String(k));
  const b = Buffer.from(e.sicht);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A live Finest overlay by id + view key - or null (unknown, deleted, wrong key, access gone). */
export async function finestMitSchluessel(id: string | null, k: string | null): Promise<FinestEintrag | null> {
  if (!id || !k || id.length > 80 || k.length > 80) return null;
  let alles: Record<string, FinestEintrag> = {};
  try {
    alles = JSON.parse(await fs.readFile(path.join(DATEN_ORT, 'overlays.json'), 'utf8')) as Record<string, FinestEintrag>;
  } catch { return null; }
  const e = alles[id];
  if (!e || e.geloeschtAm || e.typ !== 'finest') return null;
  if (!sichtPasst(e, k)) return null;
  return (await finestErlaubt(e)) ? e : null;
}

/**
 * Either way in: signed in with the tick, or the overlay's id + view key
 * (OBS has no login). Used by the overlay page and the asset route.
 */
export async function finestAnfrageErlaubt(request: Request): Promise<boolean> {
  const p = new URL(request.url).searchParams;
  if (p.get('id') && p.get('k')) return Boolean(await finestMitSchluessel(p.get('id'), p.get('k')));
  return (await ichDarfFinest()).length > 0;
}

/**
 * The partner's files: kept in the PRIVATE data archive (comphub-daten,
 * partner/finest/...), never in public/. Served only by /api/finest/datei.
 */
export const FINEST_DATEIEN: Record<string, string> = {
  'logo.png': 'image/png',
  'bg.mp4': 'video/mp4',
  'thumb.jpg': 'image/jpeg',
};
export const FINEST_ORDNER = 'partner/finest';

/** Headers for every Finest answer: never stored by a CDN or indexed. */
export const FINEST_KOEPFE: Record<string, string> = {
  'Cache-Control': 'private, no-store',
  'CDN-Cache-Control': 'no-store',
  'Netlify-CDN-Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};
