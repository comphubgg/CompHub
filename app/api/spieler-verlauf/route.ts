import { NextResponse } from 'next/server';
import { kontoVerlauf, namenSuchen, type VerlaufTag } from '@/lib/spielerVerlauf';
import { cupNameAusKennung, rundenName } from '@/lib/rundenName';
import { saisonName } from '@/lib/szeneStats';

/*
 * Turnierverlauf und Spielersuche fuer jedes Konto aus unseren Bestenlisten (lib/spielerVerlauf, gerechnet von scripts/spieler-verlauf.mjs).
 *
 *   GET ?id=<epicId>        -> Name, alte Namen, Power Ranking, Region, zuletzt gesehen und jede Zeile (Spieltag, Platz, Punkte, Mitspieler, Preisgeld, Quali-Grenze)
 *   GET ?q=<name>           -> bis zu acht Namen fuer die Vorschlaege (auch alte Namen und ein spaeteres Wort im Namen)
 *   GET ?q=<name>&epic=1    -> dazu, wenn der Index den Namen nicht kennt: Epics Namensdienst (genauer Epic-Name -> Konto)
 *
 * Je Anfrage wird genau ein Stueck des Index gelesen (rund 100 KB gepackt) - nie alles. Was Epic nicht in den ersten 10.000 einer Liste fuehrt, steht
 * hier nicht (ausser beim eigenen Konto der Laeufe); die Seite sagt das dazu.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ACCOUNT = 'https://account-public-service-prod.ol.epicgames.com';
const ID = /^[0-9a-f]{32}$/;

/** Epics Namensdienst: genauer Anzeigename -> Konto. Ohne Anmeldung oder bei einem Fehler null. */
async function epicKonto(name: string): Promise<{ id: string; name: string } | null> {
  try {
    const { getToken } = await import('@/lib/epicCups');
    const { token } = await getToken();
    const r = await fetch(`${ACCOUNT}/account/api/public/account/displayName/${encodeURIComponent(name)}`,
      { headers: { Authorization: token }, signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!r.ok) return null;
    const k = await r.json() as { id?: string; displayName?: string };
    return k.id ? { id: k.id.toLowerCase(), name: k.displayName ?? name } : null;
  } catch { return null; }
}

/** Epics Name zu einem Konto, das der Index nicht kennt. */
async function epicName(id: string): Promise<string | null> {
  try {
    const { getToken, loeseNamenAuf } = await import('@/lib/epicCups');
    const { token } = await getToken();
    const n = (await loeseNamenAuf([id], token))[id];
    return n && n !== id.slice(0, 8) ? n : null;
  } catch { return null; }
}

const json = (d: unknown, sekunden = 60) => NextResponse.json(d, {
  headers: { 'Cache-Control': `public, max-age=${sekunden}, s-maxage=${sekunden * 5}` },
});

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const q = (p.get('q') ?? '').trim();
  const roh = (p.get('id') ?? '').trim().replace(/-/g, '').toLowerCase();

  if (q && !roh) {
    if (ID.test(q.replace(/-/g, '').toLowerCase())) {
      const id = q.replace(/-/g, '').toLowerCase();
      const { konto } = await kontoVerlauf(id).catch(() => ({ konto: null }));
      return json({ ok: true, treffer: [{ epicId: id, name: konto?.n ?? id.slice(0, 8), events: konto?.z.length ?? 0, region: '' }] });
    }
    let treffer = await namenSuchen(q).catch(() => null);
    if (treffer === null) return json({ ok: false, treffer: [], fehler: 'Der Index ist gerade nicht erreichbar.' }, 10);
    if (p.get('epic') === '1' && !treffer.some((x) => x.name.toLowerCase() === q.toLowerCase())) {
      const k = await epicKonto(q);
      if (k && !treffer.some((x) => x.epicId === k.id)) {
        const { konto } = await kontoVerlauf(k.id).catch(() => ({ konto: null }));
        treffer = [{ epicId: k.id, name: k.name, events: konto?.z.length ?? 0, region: '', ...(konto ? {} : { ohneVerlauf: true }) }, ...treffer];
      }
    }
    return json({ ok: true, treffer });
  }

  if (!ID.test(roh)) return NextResponse.json({ ok: false, fehler: 'id oder q fehlt.' }, { status: 400 });
  let ergebnis;
  try { ergebnis = await kontoVerlauf(roh); } catch { ergebnis = { stand: null, konto: null }; }
  const { stand, konto } = ergebnis;
  if (!stand) return json({ ok: false, epicId: roh, fehler: 'Der Index ist gerade nicht erreichbar.' }, 10);
  const aktuelleSaison = stand.tage.reduce((a, t) => (t.d > a.d ? t : a), stand.tage[0])?.s ?? '';

  if (!konto) {
    return json({ ok: true, epicId: roh, name: await epicName(roh), zeilen: [], prTop: stand.prTop, aktuelleSaison, stand: stand.erstellt });
  }

  const zeilen = konto.z.map(([d, platz, punkte, matches, preis, mit, zusatz]) => {
    const t: VerlaufTag | undefined = stand.tage[d];
    if (!t) return null;
    return {
      w: t.w, event: t.e,
      titel: t.t || cupNameAusKennung(t.w) || t.w,
      runde: rundenName(t.w, false),
      region: t.r, saison: t.s, modus: t.m, zb: !!t.zb, ranked: !!t.rk, finale: !!t.fi,
      datum: t.d || null, teams: t.n, gekuerzt: !!t.g,
      platz, punkte, matches, preis: preis || 0,
      cut: t.q ?? null, cutPunkte: t.qp ?? null,
      mitspieler: mit.map((id) => ({ id, name: konto.m?.[id] ?? null })),
      // Hinter dem Ende unserer Liste (Epic gibt diesen Platz nur fuer das eigene Konto heraus).
      ...(zusatz ? { ausserhalb: true } : {}),
    };
  }).filter(<T,>(x: T | null): x is T => x !== null);

  const zaehlung = new Map<string, number>();
  for (const z of zeilen.slice(0, 30)) if (z.region) zaehlung.set(z.region, (zaehlung.get(z.region) ?? 0) + 1);
  const saisonNamen: Record<string, string> = {};
  for (const z of zeilen) saisonNamen[z.saison] ??= saisonName(z.saison);

  return json({
    ok: true, epicId: roh, name: konto.n ?? (await epicName(roh)), alteNamen: konto.a ?? [],
    pr: konto.pr ? { platz: konto.pr[0], punkte: konto.pr[1] } : null, prTop: stand.prTop,
    region: [...zaehlung].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
    zuletzt: zeilen[0]?.datum ?? null,
    aktuelleSaison, saisonNamen, stand: stand.erstellt,
    zeilen,
  });
}
