import { NextResponse } from 'next/server';
import { t } from "@/app/lib/i18n";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url, 'http://localhost');
  const epic = searchParams.get('epic');
  const apiKey = process.env.TRACKER_API_KEY;

  if (!apiKey) {
    console.error(t('missing_trackerapikey', 'Missing TRACKER_API_KEY'));
    return NextResponse.json({
      error: t('api_key_not_configured', 'API key not configured')
    }, { status: 424 });
  }

  try {
    const res = await fetch(
      `https://public-api.tracker.gg/v2/fortnite/standard/profile/epic/${encodeURIComponent(epic || '')}`,
      { headers: { 'TRN-Api-Key': apiKey } }
    );
    // Antwortet tracker.gg mit einem Fehler, ist das "nicht erreichbar" - keine Nullen, die wie echte Werte aussehen (424 statt 5xx, siehe Anleitung).
    if (!res.ok) {
      return NextResponse.json({ error: `tracker.gg ${res.status}` }, { status: 424 });
    }
    const data = await res.json();
    const stats = data.data?.segments?.find((s: any) => s.type === 'overall')?.stats;
    if (!stats) {
      return NextResponse.json({ error: 'keine Werte' }, { status: 424 });
    }

    return NextResponse.json({
      points: stats.careerPR?.value ?? null,
      rank: stats.careerPR?.rank ?? null,
      eventsPlayed: stats.tournamentsPlayed?.value ?? null,
      cashWon: stats.earnings?.value ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'nicht erreichbar' }, { status: 424 });
  }
}
