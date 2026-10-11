import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';

/*
 * "Alles aktualisieren": ein Knopf im Admin-Bereich, der alle Laeufe anstoesst.
 *
 * Der Betreiber (2.10.2026): "ich will als Admin die Power-Ranking-Seite selbst
 * aktualisieren koennen ... mach im Admin-Dashboard, dass wenn ich refreshe,
 * ALLES refresht - Orgs, Power Ranking, alle Dinge -, kein einzelner Knopf fuer
 * Power Ranking, nur im Admin-Dashboard ein Knopf fuer alles."
 *
 * Aktualisiert wird nicht auf dem Seitenserver, sondern dort, wo die Daten
 * entstehen: bei den GitHub-Ablaeufen. Dieser Weg stoesst sie an (workflow_dispatch):
 *
 *   Datenlauf    Statistiken, Profile, Startseite, Power Rankings, Preisgelder
 *   Org-Kader    Abgleich der Organisationen mit Liquipedia
 *   Team-Verlauf Spielerhistorie
 *
 *   POST -> { ok, laeufe: [{ name, ok, status }] }     nur Admin
 *
 * Das Anstossen braucht auf dem Seitenserver ein GITHUB_TOKEN mit dem Recht
 * "Actions: schreiben". Fehlt es, sagt die Antwort das klar, statt still nichts
 * zu tun. Der Datenlauf dauert gut eine Stunde; er laeuft hinter einem schon
 * laufenden her (concurrency), startet also nie doppelt.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const REPO = 'comphubgg/CompHub';
const LAEUFE = [
  { datei: 'daten-erneuern.yml', name: 'Datenlauf (Statistiken, Power Rankings, Startseite)' },
  { datei: 'org-kader.yml', name: 'Org-Kader' },
  { datei: 'team-verlauf.yml', name: 'Team-Verlauf' },
];

export async function POST(request: Request) {
  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ ok: false, fehler: 'Nicht erlaubt.' }, { status: 403 });
  }
  const token = (process.env.GITHUB_TOKEN ?? '').trim();
  if (!token) {
    return NextResponse.json({
      ok: false,
      fehler: 'Auf dem Server fehlt GITHUB_TOKEN (Render-Umgebung). Ohne ihn darf die Seite keine Läufe starten.',
    }, { status: 500 });
  }
  const laeufe = await Promise.all(LAEUFE.map(async (l) => {
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${l.datei}/dispatches`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
          'User-Agent': 'comphub-admin', 'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
        signal: AbortSignal.timeout(15_000),
      });
      return { name: l.name, ok: r.status === 204, status: r.status };
    } catch {
      return { name: l.name, ok: false, status: 0 };
    }
  }));
  return NextResponse.json({ ok: laeufe.every((l) => l.ok), laeufe }, { headers: { 'Cache-Control': 'no-store' } });
}
