import { NextResponse } from 'next/server';
import { liesJson } from '@/lib/ablage';
import { liesOrgs } from '@/lib/orgs';

/*
 * Der Teamverlauf eines Spielers.
 *
 * Der Betreiber (30.9. und 1.10.2026): Teamverlauf im Spielerprofil - und
 * dort stand nur die heutige Organisation, "nicht die veralteten". Der erste
 * Entwurf kannte nur die Orgs, die CompHub fuehrt.
 *
 * Jetzt: die ganze Reihe aus der Liquipedia-Spielerseite (Infokasten
 * "History", gelesen von scripts/team-verlauf-holen.mjs, abgelegt am Release
 * "daten-teams"). Verbunden wird ueber die Liquipedia-Seite, die der
 * Kader-Abgleich bei den Spielern der Orgs vermerkt hat - dieselbe Seite ist
 * dieselbe Person, nie ein Name.
 *
 * Mit dem, was CompHub selbst weiss, ergaenzt:
 *   - Steht der Spieler heute bei einer Org der Seite, gilt die Zeile dieser
 *     Org als "aktuell" - auch wenn Liquipedia ein Enddatum fuehrt.
 *   - Orgs der Seite bekommen ihr Logo.
 *   - Fehlt die Historie noch (der Abruf liest taeglich rund hundert Seiten),
 *     bleibt es bei den Orgs der Seite.
 *
 *   GET ?spieler=<epicId>
 *     -> { eintraege: [{ team, org, logo, seit, bis, aktuell, hinweis, rolle }], quelle }
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Zeile { team: string; seite: string | null; seit: string | null; bis: string | null; hinweis: string | null }
interface SeitenStand { eintraege?: Zeile[] }

const rein = (t: unknown) => String(t ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export async function GET(request: Request) {
  const id = (new URL(request.url).searchParams.get('spieler') ?? '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) return NextResponse.json({ eintraege: [] });

  let orgs;
  try { orgs = await liesOrgs(); } catch {
    return NextResponse.json({ fehler: 'Storage is not answering right now.' }, { status: 503 });
  }

  // Die Liquipedia-Seiten dieses Spielers - heutige und ehemalige Eintraege mit seinem Konto.
  const seiten = new Set<string>();
  const heute: Array<{ org: (typeof orgs)[number]; seit: string | null; rolle: string | null }> = [];
  for (const o of orgs) {
    for (const s of o.spieler) {
      if (s.epicId !== id) continue;
      if (s.liquipedia) seiten.add(s.liquipedia.toLowerCase());
      heute.push({ org: o, seit: s.seit, rolle: s.rolle });
    }
    for (const e of o.ehemalige ?? []) {
      if (e.epicId === id && e.liquipedia) seiten.add(e.liquipedia.toLowerCase());
    }
  }

  // Die Reihe aus Liquipedia.
  let zeilen: Zeile[] = [];
  try {
    const datei = await liesJson<{ seiten?: Record<string, SeitenStand> }>('team-verlauf.json', {});
    const gesehen = new Set<string>();
    for (const s of seiten) {
      for (const z of datei.seiten?.[s]?.eintraege ?? []) {
        const k = `${rein(z.team)}|${z.seit}|${z.bis}`;
        if (gesehen.has(k)) continue;
        gesehen.add(k);
        zeilen.push(z);
      }
    }
  } catch { zeilen = []; }

  // Statuszeilen ("2026-09-27 BIG (Inactive)") gehoeren zur Zeile davor, nicht in die Liste.
  const hinweise = new Map<number, string>();
  const echte: Zeile[] = [];
  for (const z of zeilen) {
    if (!z.bis && z.hinweis) {
      const vor = echte.findIndex((x) => rein(x.team) === rein(z.team) && x.bis === z.seit);
      if (vor >= 0) { hinweise.set(vor, z.hinweis); continue; }
    }
    echte.push(z);
  }

  const orgZu = (z: { team: string; seite: string | null }) => orgs.find((o) =>
    (z.seite && o.liquipedia && rein(o.liquipedia) === rein(z.seite)) || rein(o.name) === rein(z.team));

  type Eintrag = {
    team: string; org: string | null; logo: string | null; seit: string | null; bis: string | null;
    aktuell: boolean; hinweis: string | null; rolle: string | null;
  };
  const eintraege: Eintrag[] = echte.map((z, i) => {
    const o = orgZu(z);
    const imMoment = o ? heute.find((h) => h.org.id === o.id) : undefined;
    // Steht er heute bei dieser Org, gilt sie als aktuell, was Liquipedia auch fuehrt.
    const aktuell = !!imMoment && (!z.bis || z.bis >= (heute.find((h) => h.org.id === o!.id)?.seit ?? '') );
    return {
      team: o?.name ?? z.team, org: o?.id ?? null, logo: o?.logo ?? null,
      seit: z.seit, bis: aktuell ? null : (z.bis ?? null),
      aktuell: aktuell || (!z.bis && !z.hinweis && !imMoment && i === echte.length - 1 && !heute.length),
      hinweis: hinweise.get(i) ?? z.hinweis ?? null, rolle: imMoment?.rolle ?? null,
    };
  });

  // Mehrere Zeilen derselben Org, die als aktuell gelten: nur die juengste.
  const aktuellVon = new Set<string>();
  for (const e of [...eintraege].sort((a, b) => String(b.seit ?? '').localeCompare(String(a.seit ?? '')))) {
    if (!e.aktuell || !e.org) continue;
    if (aktuellVon.has(e.org)) { e.aktuell = false; if (!e.bis) e.bis = null; continue; }
    aktuellVon.add(e.org);
  }

  // Orgs der Seite, in denen er heute steht, die Liquipedia aber nicht fuehrt.
  for (const h of heute) {
    if (eintraege.some((e) => e.org === h.org.id)) continue;
    eintraege.push({ team: h.org.name, org: h.org.id, logo: h.org.logo, seit: h.seit, bis: null, aktuell: true, hinweis: null, rolle: h.rolle });
  }

  // Das Juengste oben: erst die aktuellen, dann nach Beginn.
  eintraege.sort((a, b) => Number(b.aktuell) - Number(a.aktuell)
    || String(b.seit ?? '').localeCompare(String(a.seit ?? '')));
  return NextResponse.json({ eintraege, quelle: echte.length ? 'liquipedia' : 'orgs' }, { headers: { 'Cache-Control': 'no-store' } });
}
