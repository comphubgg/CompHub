import { NextResponse } from 'next/server';
import { liesOrgs } from '@/lib/orgs';

/*
 * Der Teamverlauf eines Spielers - aus den Kadern der Organisationen.
 *
 * Der Betreiber (30.9.2026): "Teamverlauf fuer das Spielerprofil". Quelle
 * sind die Orgs der Seite: wo der Spieler heute steht (mit Konto), und wo
 * er laut Liquipedia frueher stand (scripts/org-kader-pruefen.mjs fuehrt die
 * Ehemaligen je Org). Verbunden wird ueber die Liquipedia-Spielerseite:
 * dieselbe Seite ist dieselbe Person - nie ueber einen Namen.
 *
 * Damit kennt der Verlauf nur Orgs, die auf der Seite gefuehrt werden, und
 * nur Spieler, die heute bei einer davon mit Konto stehen.
 *
 *   GET ?spieler=<epicId>  -> { eintraege: [{ org, name, logo, seit, bis, rolle, aktuell }] }
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const id = (new URL(request.url).searchParams.get('spieler') ?? '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) return NextResponse.json({ eintraege: [] });

  let orgs;
  try { orgs = await liesOrgs(); } catch {
    return NextResponse.json({ fehler: 'Storage is not answering right now.' }, { status: 503 });
  }

  type Eintrag = {
    org: string; name: string; logo: string | null; seit: string | null; bis: string | null;
    rolle: string | null; aktuell: boolean;
  };
  const eintraege: Eintrag[] = [];
  const seiten = new Set<string>();
  for (const o of orgs) {
    for (const s of o.spieler) {
      if (s.epicId !== id) continue;
      if (s.liquipedia) seiten.add(s.liquipedia.toLowerCase());
      eintraege.push({ org: o.id, name: o.name, logo: o.logo, seit: s.seit, bis: null, rolle: s.rolle, aktuell: true });
    }
  }
  if (seiten.size) {
    for (const o of orgs) {
      for (const e of o.ehemalige ?? []) {
        if (!e.liquipedia || !seiten.has(e.liquipedia.toLowerCase())) continue;
        // Steht er dort heute wieder, zaehlt der aktuelle Eintrag.
        if (eintraege.some((x) => x.org === o.id && x.aktuell && (x.seit ?? '') <= (e.seit ?? ''))) continue;
        eintraege.push({ org: o.id, name: o.name, logo: o.logo, seit: e.seit, bis: e.bis, rolle: null, aktuell: false });
      }
    }
  }
  // Das Juengste oben: erst die aktuellen, dann nach Austritt.
  eintraege.sort((a, b) => Number(b.aktuell) - Number(a.aktuell)
    || String(b.bis ?? '').localeCompare(String(a.bis ?? ''))
    || String(b.seit ?? '').localeCompare(String(a.seit ?? '')));
  return NextResponse.json({ eintraege }, { headers: { 'Cache-Control': 'no-store' } });
}
