import { t } from "@/app/lib/i18n";
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || '';
const TWITCH_ACCESS_TOKEN = process.env.TWITCH_ACCESS_TOKEN || '';

export async function POST(req: Request) {
  try {
    const { usernames } = await req.json();

    if (!usernames || usernames.length === 0) {
      return Response.json({ error: t('no_usernames_provided', 'No usernames provided') }, { status: 400 });
    }

    // Wenn keine Credentials, return Fallback (alle offline)
    if (!TWITCH_ACCESS_TOKEN || !TWITCH_CLIENT_ID) {
      console.warn(t('twitch_api_credentials_not_configured', '⚠️ Twitch API credentials not configured'));
      const fallback: { [key: string]: boolean } = {};
      usernames.forEach((username: string) => {
        fallback[username.toLowerCase()] = false;
      });
      return Response.json(fallback);
    }

    const result: { [key: string]: boolean } = {};

    // Twitch API limitiert auf 100 pro Request - mache mehrere Requests
    const chunks = [];
    for (let i = 0; i < usernames.length; i += 100) {
      chunks.push(usernames.slice(i, i + 100));
    }

    for (const chunk of chunks) {
      const params = new URLSearchParams();
      chunk.forEach((username: string) => {
        params.append('user_login', username.toLowerCase());
      });

      try {
        const response = await fetch(`https://api.twitch.tv/helix/streams?${params}&first=100`, {
          headers: {
            'Client-ID': TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${TWITCH_ACCESS_TOKEN}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          const liveUsers = new Set(data.data.map((stream: any) => stream.user_login));
          
          chunk.forEach((username: string) => {
            result[username.toLowerCase()] = liveUsers.has(username.toLowerCase());
          });
        }
      } catch (e) {
        console.error(t('twitch_api_chunk_error', 'Twitch API chunk error:'), e);
      }
    }

    // Fallback für alle die nicht abgefragt wurden
    usernames.forEach((username: string) => {
      if (!(username.toLowerCase() in result)) {
        result[username.toLowerCase()] = false;
      }
    });

    return Response.json(result);
  } catch (error) {
    console.error(t('error_in_twitch_route', 'Error in twitch route:'), error);
    return Response.json({ error: t('internal_server_error', 'Internal server error') }, { status: 500 });
  }
}
