import { NextResponse } from 'next/server';
import { holeDienst } from '@/lib/dienstZugaenge';

// Welche Anmeldedienste tatsaechlich eingerichtet sind.
//
// In .env.local stehen fuer Twitch und Discord Platzhalter
// ("REDACTED_TWITCH_CLIENT_ID"). Ein Knopf "Mit Twitch anmelden" fuehrt damit
// auf eine Fehlerseite von Twitch - {"status":400,"message":"invalid client"}.
// Das ist schlimmer als kein Knopf: der Nutzer glaubt, es liege an ihm.
//
// Deshalb sagt diese Auskunft, was wirklich geht. Die Anmeldeseite zeigt
// alles Uebrige ausgegraut mit dem Hinweis, was fehlt - so ist der Weg
// dorthin dokumentiert und niemand rennt ins Leere.
//
// Verraten wird nichts: nur ob ein Wert gesetzt ist, nie der Wert selbst.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Ein Platzhalter ist so gut wie nicht gesetzt. */
function echt(wert: string | undefined): boolean {
  if (!wert) return false;
  const w = wert.trim();
  if (!w) return false;
  return !/^(REDACTED|your_|YOUR_|xxx|changeme)/i.test(w);
}

export async function GET() {
  // Nicht mehr nur die Umgebung: was im Werkzeug eingetragen wurde, zaehlt
  // genauso - sonst stuende ein frisch eingefuegter Schluessel als "nicht
  // eingerichtet" da, bis jemand den Server neu startet.
  const [tw, dc, go] = await Promise.all([
    holeDienst('twitch'), holeDienst('discord'), holeDienst('google'),
  ]);
  const dienste = {
    twitch: tw.woher !== 'fehlt',
    discord: dc.woher !== 'fehlt',
    google: go.woher !== 'fehlt',
    // E-Mail und Passwort brauchen niemanden von aussen - das laeuft immer.
    email: true,
  };

  return NextResponse.json({
    dienste,
    /** Wo die fehlenden Zugangsdaten herkommen - fuer den Hinweis am Knopf. */
    woher: {
      twitch: 'dev.twitch.tv/console/apps',
      discord: 'discord.com/developers/applications',
      google: 'console.cloud.google.com/apis/credentials',
    },
  });
}
