import { NextResponse } from 'next/server';
import { t } from "@/app/lib/i18n";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url, 'http://localhost');
  const epic = searchParams.get('epic');
  const apiKey = process.env.TRACKER_API_KEY;

  if (!apiKey) {
    console.error(t('missing_trackerapikey', 'Missing TRACKER_API_KEY'));
    return NextResponse.json({ 
      points: 0, 
      rank: 'N/A', 
      eventsPlayed: 0, 
      cashWon: 0,
      error: t('api_key_not_configured', 'API key not configured')
    }, { status: 500 });
  }

  try {
    const res = await fetch(
      `https://public-api.tracker.gg/v2/fortnite/standard/profile/epic/${encodeURIComponent(epic || '')}`,
      { headers: { 'TRN-Api-Key': apiKey } }
    );
    const data = await res.json();
    
    // Daten extrahieren
    const stats = data.data?.segments?.find((s: any) => s.type === 'overall')?.stats;

    return NextResponse.json({
      points: stats?.careerPR?.value || 0,
      rank: stats?.careerPR?.rank || 'N/A',
      eventsPlayed: stats?.tournamentsPlayed?.value || 0,
      cashWon: stats?.earnings?.value || 0
    });
  } catch (error) {
    return NextResponse.json({ points: 0, rank: 'N/A', eventsPlayed: 0, cashWon: 0 });
  }
}