import { NextResponse } from 'next/server';
import { liesJson, schreibJson } from '@/lib/ablage';

/*
 * Der Eingang fuer den Foto-Befehl (tools/fotos-sammeln.js, Knopf "Alle an CompHub senden"; Betreiber, 31.10.2026: "am besten, dass ich sie nicht mal
 * downloaden muss, mein Speicher wird knapp"). Der Befehl schickt von einer fremden Seite aus nur Namen und Bild-Adressen - keine Bilder. Geholt,
 * zugeschnitten und eingebaut wird spaeter von Hand (scripts/fotos-eingang-holen.mjs), nach einer Vorher/Nachher-Uebersicht fuer den Betreiber.
 *
 * Offen fuer jede Herkunft (CORS), weil der Befehl auf fremden Seiten laeuft. Deshalb streng begrenzt: nur Text, hoechstens 20.000 Eintraege je Sendung, kurze Namen,
 * http(s)-Adressen; gespeichert wird eine einzige Datei, nichts wird beim Empfang heruntergeladen oder angezeigt.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DATEI = 'fotos-eingang.json';
const KOPF = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

interface Eintrag { name: string; url: string; quelle: string; vorhanden: boolean; zeit: string }

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: KOPF });
}

export async function POST(request: Request) {
  let roh: unknown;
  try { roh = await request.json(); } catch { return NextResponse.json({ ok: false, fehler: 'kein JSON' }, { status: 400, headers: KOPF }); }
  const j = roh as { quelle?: unknown; eintraege?: unknown };
  const quelle = String(j.quelle ?? '').slice(0, 120);
  // 20.000 statt 6000 (31.10.2026: EU Competitive schickte 7237, 1237 fielen weg).
  const liste = Array.isArray(j.eintraege) ? j.eintraege.slice(0, 20000) : [];
  const zeit = new Date().toISOString();
  const neu: Eintrag[] = [];
  for (const e of liste as Array<{ name?: unknown; url?: unknown; vorhanden?: unknown }>) {
    const name = String(e?.name ?? '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 40);
    const url = String(e?.url ?? '').slice(0, 600);
    if (!name || !/^https?:\/\//i.test(url)) continue;
    neu.push({ name, url, quelle, vorhanden: e?.vorhanden === true, zeit });
  }
  if (!neu.length) return NextResponse.json({ ok: false, fehler: 'keine gueltigen Eintraege' }, { status: 400, headers: KOPF });
  // Zusammenfuehren nach Adresse - ein zweiter Durchlauf derselben Seite ersetzt die Namen, statt alles doppelt abzulegen.
  const alt = await liesJson<Eintrag[]>(DATEI, []).catch(() => [] as Eintrag[]);
  const nachUrl = new Map(alt.map((e) => [e.url, e]));
  for (const e of neu) nachUrl.set(e.url, e);
  const alle = [...nachUrl.values()].slice(-40000);
  try {
    await schreibJson(DATEI, alle);
  } catch {
    return NextResponse.json({ ok: false, fehler: 'Ablage antwortet nicht - gleich nochmal senden' }, { status: 200, headers: KOPF });
  }
  return NextResponse.json({ ok: true, empfangen: neu.length, gesamt: alle.length }, { headers: KOPF });
}
