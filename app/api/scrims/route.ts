import { NextResponse } from 'next/server';
import {
  server, turniere, bestenliste, matches, yuniteDa,
  KeinPremium, NichtFreigegeben, YuniteFehlt,
} from '@/lib/yunite';

// Die Scrims der Community-Server - siehe lib/yunite.
//
//   GET /api/scrims                          -> die freigeschalteten Server
//   GET /api/scrims?server=<guildId>         -> dessen Scrims und Turniere
//   GET /api/scrims?server=…&turnier=<id>    -> Bestenliste und Runden
//
// Oeffentlich lesbar: was hier steht, zeigt die Seite ohnehin jedem
// Besucher. Geschrieben wird nichts - Yunites Regeln verbieten, die Daten
// dauerhaft abzulegen.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

/** Ein Fehler, den die Oberflaeche in einen Satz uebersetzen kann. */
function fehler(e: unknown) {
  if (e instanceof KeinPremium) {
    return NextResponse.json({ error: 'kein-premium', guildId: e.guildId }, { status: 200 });
  }
  if (e instanceof NichtFreigegeben) {
    return NextResponse.json({ error: 'nicht-freigegeben', guildId: e.guildId }, { status: 200 });
  }
  if (e instanceof YuniteFehlt) {
    return NextResponse.json({ error: 'nicht-eingerichtet' }, { status: 200 });
  }
  return NextResponse.json({ error: (e as Error).message }, { status: 500 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const guildId = (searchParams.get('server') ?? '').trim();
  const turnierId = (searchParams.get('turnier') ?? '').trim();

  if (!yuniteDa()) {
    return NextResponse.json({ eingerichtet: false, server: [] });
  }

  try {
    if (!guildId) {
      return NextResponse.json({ eingerichtet: true, server: await server() });
    }

    if (!turnierId) {
      const { turniere: liste, gesamt } = await turniere(guildId);
      return NextResponse.json({ eingerichtet: true, guildId, turniere: liste, gesamt });
    }

    const { turniere: liste } = await turniere(guildId);
    const turnier = liste.find((t) => t.id === turnierId) ?? null;
    const live = Boolean(turnier?.live);
    const [teams, runden] = await Promise.all([
      bestenliste(guildId, turnierId, live),
      matches(guildId, turnierId, live),
    ]);
    return NextResponse.json({ eingerichtet: true, guildId, turnier, teams, runden });
  } catch (e) {
    return fehler(e);
  }
}
