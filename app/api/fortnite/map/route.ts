import { NextResponse } from 'next/server';
import { t } from '@/app/lib/i18n';

const FORTNITE_API_BASE = 'https://fortnite-api.com';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url, 'http://localhost');
  const language = searchParams.get('language') || 'en';

  try {
    const url = new URL(`${FORTNITE_API_BASE}/v1/map`);
    url.searchParams.set('language', language);

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      const bodyText = await response.text();
      console.error('Fortnite map API error', response.status, bodyText);
      return NextResponse.json(
        { error: t('fortnite_map_api_error', 'Failed to fetch Fortnite map data'), status: response.status, details: bodyText },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Fortnite map fetch failed', error);
    return NextResponse.json(
      { error: t('fortnite_map_fetch_failed', 'Failed to fetch Fortnite map data') },
      { status: 500 }
    );
  }
}
