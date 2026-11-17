import { NextResponse } from 'next/server';
import { anschlussAus } from '@/lib/fehlversuche';
import { gebremst, liesAwards, liesStimmen, phaseVon, stimmeEintragen, stimmtAb } from '@/lib/awards';
import { awardsSichtbar, waehlerEpicId } from '@/lib/awardsZugang';

/*
 * Die Community-Abstimmung der Awards (lib/awards).
 *
 *   GET  -> { angemeldet, meine: { kategorie: nominierter } }   nur die eigenen Stimmen - fremde Stimmen und Zahlen gibt es hier nie
 *   POST { kategorie, nominierter } -> { ok } | { ok: false, error }
 *
 * Abstimmen darf nur ein bei Epic bestaetigtes Konto (lib/awardsZugang waehlerEpicId), nur waehrend der Abstimmungs-Phase, nur in Kategorien mit
 * Community-Abstimmung, eine Stimme je Epic-Konto und Kategorie (endgueltig). Gebremst je Anschluss und Konto. Solange die Awards nicht oeffentlich
 * sind, gibt es diese Adresse nur fuer den Admin.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NEIN = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };
const nein = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status, headers: NEIN });

export async function GET() {
  if (!await awardsSichtbar()) return nein('Not found', 404);
  const epicId = await waehlerEpicId();
  if (!epicId) return NextResponse.json({ ok: true, angemeldet: false, meine: {} }, { headers: NEIN });
  try {
    const s = await liesStimmen();
    const meine: Record<string, string> = {};
    for (const [k, wer] of Object.entries(s)) if (wer[epicId]) meine[k] = wer[epicId];
    return NextResponse.json({ ok: true, angemeldet: true, meine }, { headers: NEIN });
  } catch {
    return nein('Votes are unavailable right now.', 424);
  }
}

export async function POST(request: Request) {
  if (!await awardsSichtbar()) return nein('Not found', 404);
  const epicId = await waehlerEpicId();
  if (!epicId) return nein('Sign in with Epic Games to vote.', 401);
  if (gebremst(anschlussAus(request), epicId)) return nein('Too many requests - please try again in a few minutes.');
  const roh = await request.text();
  if (roh.length > 2_000) return nein('Invalid request.');
  let k: { kategorie?: unknown; nominierter?: unknown };
  try { k = JSON.parse(roh); } catch { return nein('Invalid request.'); }
  try {
    const awards = await liesAwards();
    const kat = awards.kategorien.find((x) => x.id === k.kategorie);
    if (!kat || !stimmtAb(kat)) return nein('This category has no community vote.');
    if (!kat.nominierte.some((n) => n.id === k.nominierter)) return nein('Unknown nominee.');
    if (phaseVon(awards) !== 'abstimmung') return nein('Voting is not open.');
    const r = await stimmeEintragen(kat.id, epicId, k.nominierter as string);
    if (r === 'schon') return nein('You have already voted in this category.', 409);
    return NextResponse.json({ ok: true }, { headers: NEIN });
  } catch {
    return nein('Your vote could not be saved - please try again.', 424);
  }
}
