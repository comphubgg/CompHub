import { NextResponse } from 'next/server';

// Einen fremden Beitrag von X/Twitter auslesen.
//
// X selbst gibt seine Beitraege nur noch ueber eine kostenpflichtige
// Schnittstelle mit Schluessel heraus. FixTweet (fxtwitter.com) spiegelt
// oeffentliche Beitraege dagegen als offenes JSON - ohne Konto, ohne
// Schluessel, ohne Kosten. Genau das braucht dieses Werkzeug: den Text und
// die Bilder eines Beitrags, damit sie sich von Hand weiterverwenden lassen.
//
// Bewusst nur oeffentliche Beitraege und nur Lesen. Was hier herauskommt,
// ist dasselbe, was jeder im Browser sieht.
//
//   ?url=https://x.com/jemand/status/123…
//
// Bleibt der Dienst stumm, kommt ein klarer Fehler zurueck - kein halb
// gefuellter Beitrag, bei dem hinterher niemand weiss, was fehlt.

export const revalidate = 0;

/** Aus jeder Schreibweise die Beitrags-Nummer herausholen. */
function beitragsNummer(roh: string): string | null {
  const t = (roh ?? '').trim();
  // Blanke Zahl reicht auch.
  if (/^\d{5,25}$/.test(t)) return t;
  const m = t.match(/(?:twitter|x|fxtwitter|vxtwitter)\.com\/[^/]+\/status(?:es)?\/(\d{5,25})/i);
  return m ? m[1] : null;
}

interface FxMedia { type?: string; url?: string }
interface FxTweet {
  text?: string; created_at?: string; url?: string;
  author?: { name?: string; screen_name?: string; avatar_url?: string };
  media?: { photos?: FxMedia[]; videos?: FxMedia[] };
}

export async function GET(request: Request) {
  const roh = new URL(request.url).searchParams.get('url') ?? '';
  const nummer = beitragsNummer(roh);
  if (!nummer) {
    return NextResponse.json(
      { error: 'Das sieht nicht nach einem Link zu einem Beitrag aus.' },
      { status: 400 });
  }

  let antwort: Response;
  try {
    antwort = await fetch(`https://api.fxtwitter.com/i/status/${nummer}`,
      { headers: { 'User-Agent': 'CompHub/1.0' }, cache: 'no-store' });
  } catch (e) {
    return NextResponse.json(
      { error: `Der Dienst antwortet nicht: ${(e as Error).message}` },
      { status: 502 });
  }
  if (!antwort.ok) {
    return NextResponse.json(
      { error: `Beitrag nicht lesbar (HTTP ${antwort.status}) — geloescht, `
        + 'privat oder gesperrt?' },
      { status: antwort.status === 404 ? 404 : 502 });
  }

  const d = await antwort.json() as { tweet?: FxTweet };
  const tw = d.tweet;
  if (!tw) {
    return NextResponse.json({ error: 'Der Dienst lieferte keinen Beitrag.' },
      { status: 502 });
  }

  const bilder = (tw.media?.photos ?? [])
    .map((m) => m.url).filter((x): x is string => Boolean(x));
  const videos = (tw.media?.videos ?? [])
    .map((m) => m.url).filter((x): x is string => Boolean(x));

  return NextResponse.json({
    text: tw.text ?? '',
    autor: tw.author?.name ?? null,
    konto: tw.author?.screen_name ?? null,
    datum: tw.created_at ?? null,
    url: tw.url ?? `https://x.com/i/status/${nummer}`,
    bilder, videos,
    quelle: 'fxtwitter.com',
  });
}
