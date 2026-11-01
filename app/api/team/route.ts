import { NextResponse } from 'next/server';
import { liesJson } from '@/lib/ablage';
import { liesOrgs } from '@/lib/orgs';
import { gesamtSummen, heimatRegionen } from '@/lib/szeneStats';
import { abgelegteAntwort } from '@/lib/antwortSpeicher';
import { spielerbildKlein } from '@/lib/spielerbildKlein';
import { lies as liesPr, LISTE as PR_LISTE } from '@/lib/powerRankings';

/*
 * Ein Team fuer fremde Seiten (31.10.2026): die eigene Webseite einer Organisation holt hier die Werte ihrer Spieler.
 *
 *   GET /api/team?org=clue-esports
 *   -> { ok: true, org: {...}, players: [...], at } | { ok: false, reason }
 *
 * Der Betreiber: zwei Geschaefte - CompHub als Datenquelle und Werbeflaeche, Team-Webseiten als Produkt; jede Team-Seite zeigt die echten
 * Stats ihrer Spieler und verlinkt auf das CompHub-Profil ("Powered by CompHub"). Zuordnung ueber die Epic-Konto-Id im Org-Kader
 * (Statistik > Orgs, gepflegt unter /org) - nie ueber Namen. Ohne Konto kommt der Spieler mit Namen und leeren Werten, nichts geschaetzt.
 *
 * Offen fuer jede Herkunft (CORS), nie 5xx (Lastverteiler).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SEITE = 'https://www.thecomphub.com';
const KOPF = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=1800',
};

interface Posten { datum: number | null; betrag: number; titel: string; windowId: string }

const voll = (pfad: string | null) => (pfad ? (pfad.startsWith('http') ? pfad : `${SEITE}${pfad}`) : null);
const runde = (n: number | null | undefined, stellen = 2) => (typeof n === 'number' && Number.isFinite(n) ? Number(n.toFixed(stellen)) : null);

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: KOPF });
}

export async function GET(request: Request) {
  const kennung = (new URL(request.url).searchParams.get('org') ?? '').trim().toLowerCase();
  if (!kennung) return NextResponse.json({ ok: false, reason: 'org fehlt (?org=<kennung>)' }, { status: 400, headers: KOPF });
  try {
    const orgs = await liesOrgs();
    const org = orgs.find((o) => o.id === kennung);
    if (!org) return NextResponse.json({ ok: false, reason: 'unbekannte Organisation' }, { status: 404, headers: KOPF });

    // Fiel eine Quelle aus, steht "unvollstaendig" in der Antwort - sonst saehe ein Ausfall wie "noch keine gewerteten Spiele" aus.
    let ausfall = false;
    const [summen, heimat, bilder, profile, verdienst, prStand] = await Promise.all([
      gesamtSummen().catch(() => { ausfall = true; return [] as Awaited<ReturnType<typeof gesamtSummen>>; }),
      heimatRegionen().catch(() => new Map<string, string>()),
      liesJson<Array<{ epicId?: string; datei?: string; echtesFoto?: boolean }>>('spielerbilder.json', []).catch(() => []),
      liesJson<Record<string, { name?: string; land?: string }>>('spieler-profile.json', {}).catch(() => ({} as Record<string, { name?: string; land?: string }>)),
      abgelegteAntwort<{ konten?: string[]; posten: Record<string, Posten[]> }>('orgs|verdienst|alle').catch(() => { ausfall = true; return null; }),
      liesPr(PR_LISTE).catch(() => null),
    ]);
    // Epics Power Rankings (weltweit, taeglich): fuer jeden Spieler mit Konto mindestens Rang und Punkte - auch ohne Finals im Archiv.
    const prVon = new Map(((prStand as unknown as { spieler?: Array<{ id: string; rank: number; wertung: number }> } | null)?.spieler ?? []).map((x) => [x.id, x]));
    const summeVon = new Map(summen.map((s) => [s.epicId, s]));
    const bildVon = new Map<string, string>();
    for (const b of bilder) if (b.epicId && b.datei && b.echtesFoto) bildVon.set(b.epicId, spielerbildKlein(b.datei));

    const players = org.spieler.map((sp) => {
      const id = sp.epicId;
      const s = id ? summeVon.get(id) : undefined;
      // Nur wenn das Konto im vorgerechneten Preisgeld schon vorkommt - ein frisch eingetragener Spieler hat bis zum naechsten Stundenlauf null, nicht 0.
      const bekannt = !!id && !!verdienst && (id in verdienst.posten || (verdienst.konten ?? []).includes(id));
      const posten = bekannt ? [...(verdienst!.posten[id!] ?? [])].sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0)) : null;
      const earnings = posten ? posten.reduce((a, p) => a + p.betrag, 0) : null;
      return {
        epicId: id,
        // Der Name, wie die Org ihn fuehrt (Kader) - nicht der wechselnde Epic-Name.
        name: sp.name || (id && profile[id]?.name) || '',
        role: sp.rolle,
        since: sp.seit,
        country: (id && profile[id]?.land) || null,
        homeRegion: (id && heimat.get(id)) || s?.regionen?.[0] || null,
        regions: s?.regionen ?? [],
        x: sp.x, twitch: sp.twitch,
        // Werte ueber das ganze Archiv (alle Saisons) - null, wenn das Konto keine gewerteten Spiele hat.
        events: s?.events ?? null, matches: s?.matches ?? null,
        elims: s?.elims ?? null, assists: s?.assists ?? null,
        damage: s ? Math.round(s.damage) : null, damageTaken: s ? Math.round(s.damageTaken) : null,
        heals: s ? Math.round(s.heals) : null, mats: s?.mats ?? null, builds: s?.builds ?? null,
        accuracy: runde(s?.genauigkeit, 1), elimsPerMatch: runde(s?.elimsProMatch), damagePerMatch: runde(s?.damageProMatch, 0),
        // Schaden ausgeteilt / erlitten - KEIN K/D (CompHub fuehrt kein K/D ueber das Archiv).
        damageRatio: runde(s?.quote),
        timeAliveSec: s ? Math.round(s.timeAlive) : null,
        powerRank: (id && prVon.get(id)?.rank) || null,
        powerPoints: (id && prVon.get(id)?.wertung) || null,
        // Preisgeld aller Jahre in USD aus den Ergebnissen, die CompHub kennt; null = noch nicht vorgerechnet.
        earnings,
        recentResults: (posten ?? []).slice(0, 10).map((p) => ({
          // Platz und Punkte fuehrt diese Liste nicht - nur Turnier, Tag und Preisgeld (lib/orgs, Posten).
          date: p.datum ? new Date(p.datum).toISOString().slice(0, 10) : null, event: p.titel, prize: p.betrag, windowId: p.windowId,
        })),
        photo: voll((id ? bildVon.get(id) : null) ?? (sp.bild ? `${sp.bild}?v=2` : null)),
        profileUrl: id ? `${SEITE}/statistics?spieler=${id}` : null,
      };
    });

    return NextResponse.json({
      ok: true,
      org: {
        slug: org.id, name: org.name, logo: voll(org.logo), banner: voll(org.banner),
        colors: { primary: org.farbe ?? null }, region: org.region, country: org.land,
        links: { x: org.x ? `https://x.com/${org.x}` : null, website: org.website, twitch: org.twitch, youtube: org.youtube, tiktok: org.tiktok, instagram: org.instagram },
        teamUrl: `${SEITE}/team/${org.id}`,
      },
      players,
      at: new Date().toISOString(),
      source: 'CompHub',
      ...(ausfall ? { unvollstaendig: true } : {}),
      // Eine unvollstaendige Antwort nicht fuer Minuten im Zwischenspeicher halten.
    }, { headers: ausfall ? { ...KOPF, 'Cache-Control': 'no-store' } : KOPF });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: `CompHub antwortet gerade nicht: ${(e as Error).message}` }, { status: 424, headers: KOPF });
  }
}
