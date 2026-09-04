import { NextRequest, NextResponse } from 'next/server';
import { t } from '@/app/lib/i18n';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q');
  const sortBy = request.nextUrl.searchParams.get('sortBy') || 'followers';
  const liveOnly = request.nextUrl.searchParams.get('liveOnly') === 'true';

  if (!query || query.length < 2) {
    return NextResponse.json({ channels: [] });
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const accessToken = process.env.TWITCH_ACCESS_TOKEN;

  if (!clientId || !accessToken) {
    console.error(t('missing_twitch_api_credentials', 'Missing Twitch API credentials'));
    return NextResponse.json({ error: t('api_credentials_not_configured', 'API credentials not configured') }, { status: 500 });
  }

  try {
    // Search for channels
    const searchResponse = await fetch(
      `https://api.twitch.tv/helix/search/channels?query=${encodeURIComponent(query)}&first=50`,
      {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!searchResponse.ok) {
      console.error(t('search_api_error', 'Search API error:'), searchResponse.status, searchResponse.statusText);
      return NextResponse.json({ channels: [] });
    }

    const searchData = await searchResponse.json();
    const channelList = searchData.data || [];

    if (!channelList.length) {
      return NextResponse.json({ channels: [] });
    }

    // Get channel names for live status check
    const channelNames = channelList.map((c: any) => c.name);

    // Check live status
    const liveQuery = channelNames.map((n: string) => `user_login=${encodeURIComponent(n)}`).join('&');
    const streamsResponse = await fetch(
      `https://api.twitch.tv/helix/streams?${liveQuery}&first=100`,
      {
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!streamsResponse.ok) {
      console.error(t('streams_api_error', 'Streams API error:'), streamsResponse.status);
      return NextResponse.json({ channels: [] });
    }

    const streamsData = await streamsResponse.json();
    const liveMap: Record<string, { isLive: boolean; viewers: number }> = {};

    // Build live status map
    (streamsData.data || []).forEach((stream: any) => {
      liveMap[stream.user_login.toLowerCase()] = {
        isLive: true,
        viewers: stream.viewer_count || 0
      };
    });

    // Mark offline channels
    channelNames.forEach((name: string) => {
      if (!liveMap[name.toLowerCase()]) {
        liveMap[name.toLowerCase()] = { isLive: false, viewers: 0 };
      }
    });

    // Format response
    const channels = channelList
      .filter((c: any) => c && c.display_name)
      .slice(0, 20)
      .map((c: any) => {
        const liveInfo = liveMap[c.name.toLowerCase()] || { isLive: false, viewers: 0 };
        return {
          twitch: c.display_name,
          epic: c.display_name,
          twitter: c.display_name,
          followers: c.follower_count || 0,
          game: c.game_name || 'Unknown',
          isLive: liveInfo.isLive,
          viewers: liveInfo.viewers
        };
      });

    // Apply filters
    let filtered = channels;
    if (liveOnly) {
      filtered = filtered.filter((c: any) => c.isLive);
    }

    // Sort
    if (sortBy === 'followers') {
      filtered.sort((a: any, b: any) => b.followers - a.followers);
    }

    return NextResponse.json({ channels: filtered });
  } catch (error) {
    console.error(t('search_error', 'Search error:'), error);
    return NextResponse.json({ channels: [] });
  }
}