// Gueltigen Twitch-App-Token besorgen und im Speicher halten.
//
// Hintergrund: Twitch-App-Tokens laufen nach rund 60 Tagen ab. Ein fest in
// .env eingetragener Token funktioniert deshalb irgendwann nicht mehr - die
// Folge waren 401er und Streamer, die faelschlich als offline galten.
// Mit Client-ID und Client-Secret holt sich der Server selbst einen frischen
// und erneuert ihn automatisch, wenn Twitch ihn ablehnt.

interface TokenStand {
  token: string;
  bis: number;
  quelle: 'env' | 'geholt';
}

let stand: TokenStand | null = null;
let laufend: Promise<TokenStand | null> | null = null;

function clientId() { return process.env.TWITCH_CLIENT_ID || ''; }
function clientSecret() { return process.env.TWITCH_CLIENT_SECRET || ''; }

async function holeNeuenToken(): Promise<TokenStand | null> {
  const id = clientId(), secret = clientSecret();
  if (!id || !secret) return null;

  try {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: id,
        client_secret: secret,
        grant_type: 'client_credentials',
      }),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn('Twitch-Token konnte nicht geholt werden:', res.status);
      return null;
    }
    const d = await res.json() as { access_token: string; expires_in: number };
    // Etwas Sicherheitsabstand vor dem echten Ablauf.
    return {
      token: d.access_token,
      bis: Date.now() + Math.max(60, (d.expires_in ?? 3600) - 300) * 1000,
      quelle: 'geholt',
    };
  } catch (e) {
    console.warn('Twitch-Token: Netzwerkfehler', (e as Error).message);
    return null;
  }
}

// Liefert einen Token oder null, wenn Twitch gar nicht eingerichtet ist.
export async function twitchToken(): Promise<string | null> {
  if (stand && Date.now() < stand.bis) return stand.token;

  // Der in .env hinterlegte Token wird zuerst versucht - falls er noch
  // gilt, spart das eine Anfrage. Bei 401 uebernimmt erneuern().
  const ausEnv = process.env.TWITCH_ACCESS_TOKEN;
  if (!stand && ausEnv) {
    stand = { token: ausEnv, bis: Date.now() + 60_000, quelle: 'env' };
    return stand.token;
  }

  if (laufend) return (await laufend)?.token ?? null;
  laufend = holeNeuenToken();
  stand = await laufend;
  laufend = null;
  return stand?.token ?? null;
}

// Nach einem 401 aufrufen: verwirft den alten Token und holt einen frischen.
export async function erneuereTwitchToken(): Promise<string | null> {
  stand = null;
  if (laufend) return (await laufend)?.token ?? null;
  laufend = holeNeuenToken();
  stand = await laufend;
  laufend = null;
  return stand?.token ?? null;
}

export function twitchEingerichtet(): boolean {
  return Boolean(clientId() && (clientSecret() || process.env.TWITCH_ACCESS_TOKEN));
}
