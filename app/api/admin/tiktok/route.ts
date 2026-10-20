import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { kontoAus, nachId } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach, rechteVon } from '@/lib/vipZugaenge';

/*
 * Die täglichen TikTok-Videos (Betreiber, 20.10.2026): der Ablauf "TikTok-Tagesvideo" (.github/workflows/tiktok-tag.yml) hängt jedes Video und seine Angaben ans Release "tiktok".
 * Diese Schnittstelle listet sie für die Seite /admin/tiktok - das Video selbst wird über die öffentliche Download-Adresse des Releases geholt.
 * Nur der Admin: die Videos sind Entwürfe, bis er sie hochlädt.
 *
 * Gebaut wird auf GitHub, nicht im Browser: Seite schließen, neu laden oder wechseln bricht nichts ab. Die Seite fragt deshalb bei jedem Öffnen den Stand des Laufs ab
 * ("lauf") und zeigt ihn, bis das Video da ist.
 *
 *   GET  -> { ok, videos: [{ datum, titel, region, dauer, mb, text, seite, video }], lauf }, neueste zuerst
 *           lauf = null | { status: 'queued'|'in_progress'|'completed', ergebnis, seit, adresse } - der jüngste Lauf des Ablaufs
 *   POST { aktion: 'neu' } -> startet den Ablauf von Hand (braucht ein GitHub-Token mit Recht auf Actions); läuft schon einer, wird kein zweiter gestartet
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
const TAG = 'tiktok';
const ABLAUF = 'tiktok-tag.yml';

async function istAdmin(): Promise<boolean> {
  const laden = await cookies();
  const id = kontoAus(laden.get('streamer_dashboard_konto')?.value);
  if (id) { const k = await nachId(id); if (k?.rolle === 'admin') return true; }
  const vipName = vipAus(laden.get('streamer_dashboard_auth')?.value);
  if (!vipName) return false;
  if (istBetreiber(laden.get('streamer_dashboard_auth')?.value)) return true;
  return rechteVon(await zugangNach(vipName)).rolle === 'admin';
}

/** Antwortet die Ablage nicht (z. B. gedrosselt), wirft die Prüfung - das ist ein Ausfall, kein "nicht erlaubt". */
async function pruefe(): Promise<NextResponse | null> {
  try {
    if (await istAdmin()) return null;
    return NextResponse.json({ ok: false, fehler: 'Dafür brauchst du Admin-Rechte.' }, { status: 403 });
  } catch {
    return NextResponse.json({ ok: false, fehler: 'Die Anmeldung lässt sich gerade nicht prüfen - die Ablage antwortet nicht. Gleich noch einmal versuchen.' }, { status: 503 });
  }
}

const kopf = () => ({
  'User-Agent': 'comphub-tiktok', Accept: 'application/vnd.github+json',
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
});

interface Lauf { status: string; ergebnis: string | null; seit: string; adresse: string }

/** Der jüngste Lauf des Ablaufs; null, wenn GitHub gerade nicht antwortet (dann zeigt die Seite einfach keinen Stand). */
async function juengsterLauf(): Promise<Lauf | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${ABLAUF}/runs?per_page=1`, { headers: kopf(), cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const j = await r.json() as { workflow_runs?: Array<{ status: string; conclusion: string | null; created_at: string; html_url: string }> };
    const l = j.workflow_runs?.[0];
    return l ? { status: l.status, ergebnis: l.conclusion, seit: l.created_at, adresse: l.html_url } : null;
  } catch { return null; }
}

const laeuft = (l: Lauf | null) => !!l && l.status !== 'completed';

export async function GET() {
  const nein = await pruefe();
  if (nein) return nein;
  try {
    const [r, lauf] = await Promise.all([
      fetch(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`, { headers: kopf(), cache: 'no-store', signal: AbortSignal.timeout(20_000) }),
      juengsterLauf(),
    ]);
    if (r.status === 404) return NextResponse.json({ ok: true, videos: [], lauf });
    if (!r.ok) return NextResponse.json({ ok: false, fehler: `GitHub antwortet mit ${r.status}` }, { status: 502 });
    const rel = await r.json() as { assets?: Array<{ name: string; size: number }> };
    const assets = rel.assets ?? [];
    const jsons = assets.filter((a) => a.name.endsWith('.json')).sort((a, b) => b.name.localeCompare(a.name)).slice(0, 30);
    const videos = (await Promise.all(jsons.map(async (a) => {
      try {
        const j = await (await fetch(`https://github.com/${REPO}/releases/download/${TAG}/${encodeURIComponent(a.name)}`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })).json();
        const mp4 = assets.find((x) => x.name === j.video);
        return mp4 ? {
          datum: j.datum, titel: j.titel, region: j.region, dauer: j.dauer, mb: Math.round(mp4.size / 1e5) / 10, text: j.text, seite: j.seite ?? null,
          marken: Array.isArray(j.marken) ? j.marken : [],
          video: `https://github.com/${REPO}/releases/download/${TAG}/${encodeURIComponent(mp4.name)}`, datei: mp4.name,
        } : null;
      } catch { return null; }
    }))).filter(Boolean);
    return NextResponse.json({ ok: true, videos, lauf }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ ok: false, fehler: 'GitHub antwortet gerade nicht.' }, { status: 503 }); }
}

export async function POST(request: Request) {
  const nein = await pruefe();
  if (nein) return nein;
  const k = await request.json().catch(() => ({})) as { aktion?: string };
  if (k.aktion !== 'neu') return NextResponse.json({ ok: false, fehler: 'Unbekannte Aktion.' }, { status: 400 });
  if (!process.env.GITHUB_TOKEN) return NextResponse.json({ ok: false, fehler: 'Auf dem Server fehlt GITHUB_TOKEN.' }, { status: 501 });
  try {
    // Läuft schon einer, wird kein zweiter gestartet - die Seite zeigt dessen Stand.
    const bisher = await juengsterLauf();
    if (laeuft(bisher)) return NextResponse.json({ ok: true, schon: true, lauf: bisher });
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${ABLAUF}/dispatches`, {
      method: 'POST', headers: { ...kopf(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main' }), signal: AbortSignal.timeout(20_000),
    });
    if (r.status !== 204) return NextResponse.json({ ok: false, fehler: `GitHub hat den Start abgelehnt (${r.status}).` }, { status: 502 });
    return NextResponse.json({ ok: true, schon: false });
  } catch { return NextResponse.json({ ok: false, fehler: 'GitHub antwortet gerade nicht.' }, { status: 503 }); }
}
