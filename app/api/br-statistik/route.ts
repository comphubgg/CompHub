import { t } from "@/app/lib/i18n";
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url, 'http://localhost');
  const playerName = searchParams.get('playerName');

  if (!playerName) {
    return Response.json({ error: t('playername_required', 'playerName required') }, { status: 400 });
  }

  // Nutze FortniteAPI.io endpoint
  const BASE_URL = 'https://fortnite-api.com/v2/stats/br/v2';
  const API_KEY = ''; // Keine API Key nötig für fortnite-api.com

  try {
    const url = new URL(BASE_URL);
    url.searchParams.set('name', playerName);
    url.searchParams.set('accountType', 'pc');

    const response = await fetch(url.toString());

    if (!response.ok) {
      const bodyText = await response.text();
      console.error(`API error: ${response.status}`, bodyText);
      return Response.json(
        { error: `API error: ${response.status}`, playerName, details: bodyText },
        { status: 200 }
      );
    }

    const data = await response.json();

    // Parse verschiedene API-Formate
    let stats: any = null;

    // Format 1: fortnite-api.com/v2/stats
    if (data.account) {
      stats = {
        playerName: data.account.name,
        level: data.account.level || 0,
        points: 0,
        rank: data.battlePass?.level || 0,
        topX: 0,
        kills: data.stats?.all?.kills || 0,
        kd: data.stats?.all?.kd || 0,
        matches: data.stats?.all?.matches || 0,
        wins: data.stats?.all?.wins || 0,
        winRate: data.stats?.all?.winRate || 0,
        lastUpdate: new Date().toISOString()
      };
    }
    // Format 2: fortniteapi.io
    else if (data.global_stats) {
      stats = {
        playerName: playerName,
        level: data.level || 0,
        points: 0,
        rank: data.global_stats.rank || 0,
        topX: 0,
        kills: data.global_stats.kills || 0,
        kd: data.global_stats.kd || 0,
        matches: data.global_stats.matches || 0,
        wins: data.global_stats.wins || 0,
        winRate: data.global_stats.winrate || 0,
        lastUpdate: new Date().toISOString()
      };
    }
    // Format 3: Fallback
    else {
      stats = {
        playerName: playerName,
        level: 0,
        points: 0,
        rank: 0,
        topX: 0,
        kills: 0,
        kd: 0,
        matches: 0,
        wins: 0,
        winRate: 0,
        lastUpdate: new Date().toISOString(),
        rawData: data
      };
    }

    return Response.json(stats);
  } catch (error) {
    console.error(t('tracker_api_error', 'Tracker API error:'), error);
    return Response.json(
      { error: t('failed_to_fetch_tracker_data', 'Failed to fetch tracker data') },
      { status: 500 }
    );
  }
}
