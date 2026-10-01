import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { offen as offeneMeldungen } from '@/lib/kontakt';

/*
 * Die Admin-Zentrale: was laeuft, was ist offen - auf einen Blick.
 *
 * Der Betreiber (1.10.2026): "alles optimieren fuer den Admin: simpler,
 * optisch besser sichtbar". Bisher musste er in Discord oder auf GitHub
 * nachsehen, ob der Datenlauf noch laeuft, ob ein Ablauf gescheitert ist und
 * ob im Posteingang etwas wartet. Diese Antwort sammelt das an einer Stelle.
 *
 *   GET -> { jobs: [...], kontaktOffen: n, stand }
 *
 * Die Laeufe stehen bei GitHub Actions. Die Auskunft dort ist oeffentlich
 * (das Projekt ist es), braucht also keinen Schluessel; ist GITHUB_TOKEN
 * gesetzt, wird er benutzt - das hebt die Grenze von 60 auf 5000 Abfragen je
 * Stunde. Ohne Schluessel gilt die Grenze je Adresse, und auf einem geteilten
 * Server kann sie von anderen aufgebraucht sein: dann steht bei den Laeufen
 * "nicht abrufbar", nie ein erfundener Zustand.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const REPO = 'comphubgg/CompHub';

/** Die Ablaeufe, die der Betreiber im Blick haben will. */
const ABLAEUFE: Array<{ schluessel: string; datei: string; name: string; was: string; ruhigBisMin: number }> = [
  { schluessel: 'daten', datei: 'daten-erneuern.yml', name: 'Datenlauf', was: 'Statistiken, Profile, Startseite', ruhigBisMin: 240 },
  { schluessel: 'replays', datei: 'replays-nacharbeiten.yml', name: 'Replays', was: 'Rückstand abarbeiten', ruhigBisMin: 300 },
  { schluessel: 'clutch', datei: 'clutch-rechnen.yml', name: 'Solo Clutch', was: 'Punkte je Spieltag', ruhigBisMin: 24 * 60 },
  { schluessel: 'kader', datei: 'org-kader.yml', name: 'Org-Kader', was: 'Abgleich mit Liquipedia', ruhigBisMin: 36 * 60 },
  { schluessel: 'verlauf', datei: 'team-verlauf.yml', name: 'Team-Verlauf', was: 'Spielerhistorie', ruhigBisMin: 36 * 60 },
];

interface Lauf {
  status: string; conclusion: string | null; zeit: string; url: string;
}
interface JobAntwort {
  schluessel: string; name: string; was: string;
  /** Laeuft gerade, oder wartet. */
  aktiv: Lauf | null;
  /** Der letzte abgeschlossene Lauf. */
  letzter: Lauf | null;
  /** ok | warnung | fehler | unbekannt */
  ampel: 'ok' | 'warnung' | 'fehler' | 'unbekannt';
  hinweis: string;
}

const merker = new Map<string, { bis: number; wert: JobAntwort }>();
const MERK_MS = 10 * 60_000;

async function holeLauf(a: typeof ABLAEUFE[number]): Promise<JobAntwort> {
  const m = merker.get(a.schluessel);
  if (m && Date.now() < m.bis) return m.wert;

  const kopf: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'comphub-zentrale' };
  if (process.env.GITHUB_TOKEN) kopf.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const basis: Omit<JobAntwort, 'ampel' | 'hinweis' | 'aktiv' | 'letzter'> = { schluessel: a.schluessel, name: a.name, was: a.was };
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${a.datei}/runs?per_page=8`,
      { headers: kopf, signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json() as { workflow_runs?: Array<{ status: string; conclusion: string | null; created_at: string; updated_at: string; html_url: string }> };
    const laeufe = (j.workflow_runs ?? []).map((x) => ({
      status: x.status, conclusion: x.conclusion, zeit: x.status === 'completed' ? x.updated_at : x.created_at, url: x.html_url,
    }));
    const aktiv = laeufe.find((l) => l.status !== 'completed') ?? null;
    // Abgebrochene Laeufe zaehlen nicht: sie wurden von einem neueren abgeloest, nicht von einem Fehler.
    const letzter = laeufe.find((l) => l.status === 'completed' && l.conclusion !== 'cancelled') ?? null;
    const alterMin = letzter ? (Date.now() - Date.parse(letzter.zeit)) / 60_000 : Infinity;
    let ampel: JobAntwort['ampel'] = 'ok';
    let hinweis = '';
    if (!letzter) { ampel = 'unbekannt'; hinweis = 'noch kein Lauf'; }
    else if (letzter.conclusion !== 'success') { ampel = 'fehler'; hinweis = 'der letzte Lauf ist gescheitert'; }
    else if (alterMin > a.ruhigBisMin && !aktiv) { ampel = 'warnung'; hinweis = 'länger nichts gelaufen als üblich'; }
    const wert: JobAntwort = { ...basis, aktiv, letzter, ampel, hinweis };
    merker.set(a.schluessel, { bis: Date.now() + MERK_MS, wert });
    return wert;
  } catch (e) {
    return { ...basis, aktiv: null, letzter: null, ampel: 'unbekannt', hinweis: `nicht abrufbar (${(e as Error).message})` };
  }
}

export async function GET(request: Request) {
  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ fehler: 'Nicht erlaubt.' }, { status: 403 });
  }
  const [jobs, kontaktOffen] = await Promise.all([
    Promise.all(ABLAEUFE.map(holeLauf)),
    offeneMeldungen().catch(() => null),
  ]);
  return NextResponse.json({ jobs, kontaktOffen, stand: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
}
