import { NextResponse } from 'next/server';
import { t } from '@/app/lib/i18n';

const FORTNITE_API_BASE = 'https://fortnite-api.com';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url, 'http://localhost');
  const keyFormat = searchParams.get('keyFormat') || 'hex';

  try {
    const url = new URL(`${FORTNITE_API_BASE}/v2/aes`);
    url.searchParams.set('keyFormat', keyFormat);

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      const bodyText = await response.text();
      console.error('Fortnite AES API error', response.status, bodyText);
      return NextResponse.json(
        { error: t('fortnite_aes_api_error', 'Failed to fetch Fortnite AES key'), status: response.status, details: bodyText },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Fortnite AES fetch failed', error);
    return NextResponse.json(
      { error: t('fortnite_aes_fetch_failed', 'Failed to fetch Fortnite AES key') },
      { status: 500 }
    );
  }
}
