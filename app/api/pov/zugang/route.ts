import { NextResponse } from 'next/server';
import { wer } from '@/lib/pov';
import { zugangVon } from '@/lib/povVip';

/*
 * Fuer das Dashboard eines Pros, der ueber eine Einladung kam (lib/povVip): sein Chef (der einladende VIP) und seine Anmeldedaten - Name und das erzeugte
 * Passwort, damit er sich auch im Windows-Programm oder auf einem anderen Geraet anmelden kann. Nur fuer ihn selbst.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const ich = await wer();
  if (!ich.idents.length) return NextResponse.json({ ok: false }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json({ ok: true, zugang: await zugangVon(ich) }, { headers: { 'Cache-Control': 'no-store' } });
}
