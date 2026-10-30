import { NextResponse } from 'next/server';
import path from 'path';
import { fncsEreignisse, type FncsEreignis } from '@/lib/fncsEreignisse';
import { CDN_FRIST } from '@/lib/antwortSpeicher';
import { ueberdauernd } from '@/lib/ueberdauernd';
import { liesJson } from '@/lib/ablage';
import { spielerbildKlein } from '@/lib/spielerbildKlein';
import { kernname } from '@/lib/homoglyph';

/*
 * Die Endspiele der FNCS fuer die FNCS-Seite (siehe lib/fncsEreignisse): ein Eintrag je Event mit Vorschaubild, Datum, LAN-Vermerk
 * und den ersten drei Plaetzen samt Flaggen. Kein Konto noetig.
 *
 * Seit 30.10.2026 (neue FNCS-Seite mit Siegertreppchen) traegt jeder Spieler der Spitze auch sein Foto, wenn das Player Center eines hat -
 * die Platzierungen kennen nur Namen, also ueber Profilname, Fotoname und Szene-Liste.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const schluessel = (n: string) => kernname(n).toLowerCase().replace(/[^a-z0-9]/g, '');

async function fotosNachName(): Promise<Map<string, string>> {
  const [profile, bilder, szene] = await Promise.all([
    liesJson<Record<string, { anzeige?: string; name?: string }>>('spieler-profile.json', {}),
    liesJson<Array<{ datei: string; epicId: string; name?: string; turniername?: string; echtesFoto?: boolean }>>('spielerbilder.json', []),
    liesJson<Array<{ ID?: string; NAME?: string }>>(path.join('szene-quelle', 'spielerliste.json'), []),
  ]);
  const bildVon = new Map<string, string>();
  for (const b of bilder) if (b.epicId && b.echtesFoto) bildVon.set(b.epicId, spielerbildKlein(b.datei));
  const raus = new Map<string, string>();
  const setze = (name: string | undefined, id: string) => {
    const bild = bildVon.get(id);
    const k = name ? schluessel(name) : '';
    if (bild && k.length >= 2 && !raus.has(k)) raus.set(k, bild);
  };
  for (const [id, p] of Object.entries(profile)) { setze(p.anzeige, id); setze(p.name, id); }
  for (const b of bilder) { setze(b.name, b.epicId); setze(b.turniername, b.epicId); }
  for (const s of szene) if (s.ID) setze(s.NAME, s.ID);
  return raus;
}

export async function GET() {
  try {
    // Die letzte gute Liste sofort - auch ohne den PC daheim (lib/ueberdauernd, 29.10.2026).
    const roh = await ueberdauernd('fncs-ereignisse-v2', 30 * 60_000, 7 * 864e5, () => fncsEreignisse());
    const fotos = await fotosNachName().catch(() => new Map<string, string>());
    const ereignisse = (roh as FncsEreignis[]).map((e) => ({
      ...e,
      spitze: e.spitze.map((p) => ({ ...p, spieler: p.spieler.map((s) => ({ ...s, bild: fotos.get(schluessel(s.name)) ?? null })) })),
    }));
    return NextResponse.json({ ok: true, ereignisse }, { headers: { 'Cache-Control': CDN_FRIST } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 424, headers: { 'Cache-Control': 'no-store' } });
  }
}
