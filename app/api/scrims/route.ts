import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import {
  server, turniere, bestenliste, matches, yuniteDa,
  KeinPremium, NichtFreigegeben, YuniteFehlt,
} from '@/lib/yunite';
import { NOBLE_SERVER, nobleSitzungen, nobleLeaderboard } from '@/lib/noble';
import { scrimVerzeichnis, scrimSession } from '@/lib/scrimArchiv';
import { poyoHeute, poyoLobby } from '@/lib/poyo';

// Die Scrims der Community-Server - siehe lib/yunite.
//
//   GET /api/scrims                          -> die freigeschalteten Server
//   GET /api/scrims?server=<guildId>         -> dessen Scrims und Turniere
//   GET /api/scrims?server=…&turnier=<id>    -> Bestenliste und Runden
//   GET /api/scrims?quelle=noble             -> Nobles Server mit Sessions
//   GET /api/scrims?quelle=noble&turnier=<id> -> ein Noble-Leaderboard
//   GET /api/scrims?quelle=archiv            -> alle gesammelten Sessions
//   GET /api/scrims?quelle=archiv&turnier=<id> -> eine davon mit Leaderboard
//
// Noble kommt nicht ueber Yunite, sondern offen von nobleprac.com (siehe
// lib/noble) - dort braucht es weder Premium noch einen Schluessel.
//
// Vorerst nur fuer den Betreiber: die Seite dazu steht fuer Besucher hinter
// einem Vorhang ("Something Big Is Coming"), und was dort nicht zu sehen
// ist, soll auch ueber die Adresse nicht herauskommen. Geschrieben wird
// hier nichts; das Archiv baut scripts/scrims-holen.mjs.

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

  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ error: 'noch-nicht-offen' }, { status: 403 });
  }

  /*
   * Das Archiv (scripts/scrims-holen.mjs): Noble und Poyo, stuendlich
   * gesammelt und am Release abgelegt. Ohne turnier das Verzeichnis aller
   * Sessions, mit turnier deren Leaderboard.
   */
  if (searchParams.get('quelle') === 'archiv') {
    try {
      if (turnierId) {
        const s = await scrimSession(turnierId);
        return s ? NextResponse.json(s) : NextResponse.json({ error: 'nicht-im-archiv' }, { status: 404 });
      }
      const v = await scrimVerzeichnis();
      // Kein Verzeichnis ist kein "leer": die Seite sagt dann, dass es fehlt.
      return v ? NextResponse.json(v) : NextResponse.json({ error: 'kein-archiv' }, { status: 503 });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
  }

  /*
   * Poyo live: was heute ansteht oder laeuft (fuer "Upcoming"), und eine
   * Lobby, die das Archiv noch nicht hat - siehe lib/poyo.
   */
  if (searchParams.get('quelle') === 'poyo-heute') {
    const ids = (searchParams.get('server') ?? '').split(',').map((x) => x.trim())
      .filter((x) => /^\d{5,25}$/.test(x)).slice(0, 12);
    return NextResponse.json(await poyoHeute(ids));
  }
  if (searchParams.get('quelle') === 'poyo') {
    if (!/^\d{5,25}$/.test(guildId) || !/^[0-9a-f]{24}$/i.test(turnierId)) {
      return NextResponse.json({ error: 'unbekannt' }, { status: 400 });
    }
    try {
      const l = await poyoLobby(guildId, turnierId);
      return l ? NextResponse.json(l) : NextResponse.json({ nichtDa: true, teams: [], runden: [] });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
  }

  if (searchParams.get('quelle') === 'noble') {
    try {
      if (turnierId) return NextResponse.json(await nobleLeaderboard(turnierId));
      const serien = await Promise.all(NOBLE_SERVER.map(async (s) => {
        try {
          return { ...s, sitzungen: s.inaktiv ? [] : await nobleSitzungen(s.guildId) };
        } catch {
          // Ein Server, der nicht antwortet, steht ohne Sessions da - und
          // sagt es, statt wie "leer" auszusehen.
          return { ...s, sitzungen: [], fehler: true };
        }
      }));
      return NextResponse.json({ serien });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
  }

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
