import { NextResponse } from 'next/server';
import { fncsEreignisse, type FncsEreignis } from '@/lib/fncsEreignisse';
import { CDN_FRIST } from '@/lib/antwortSpeicher';
import { ueberdauernd } from '@/lib/ueberdauernd';
import { liesJson } from '@/lib/ablage';
import { spielerbildKlein } from '@/lib/spielerbildKlein';
import { kernname } from '@/lib/homoglyph';
import { antwortMitAktuellenFotos } from '@/lib/aktuelleFotos';

/*
 * Die Endspiele der FNCS fuer die FNCS-Seite (siehe lib/fncsEreignisse): ein Eintrag je Event mit Vorschaubild, Datum, LAN-Vermerk
 * und den ersten drei Plaetzen samt Flaggen. Kein Konto noetig.
 *
 * Seit 30.10.2026 (neue FNCS-Seite mit Siegertreppchen) traegt jeder Spieler der Spitze auch sein Foto, wenn das Player Center eines hat -
 * die Platzierungen kennen nur Namen, also ueber Profilname, Fotoname und Epic-Name.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const schluessel = (n: string) => kernname(n).toLowerCase().replace(/[^a-z0-9]/g, '');

async function fotosNachName(): Promise<Map<string, string>> {
  const [profile, bilder, epic] = await Promise.all([
    liesJson<Record<string, { anzeige?: string; name?: string }>>('spieler-profile.json', {}),
    liesJson<Array<{ datei: string; epicId: string; name?: string; turniername?: string; echtesFoto?: boolean }>>('spielerbilder.json', []),
    liesJson<Record<string, string>>('epic-namen.json', {}),
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
  for (const [id, n] of Object.entries(epic)) setze(n, id.toLowerCase());
  return raus;
}

/*
 * Die Fotos je Name fuenf Minuten gemerkt, danach sofort der alte Stand und der neue im Hintergrund (16.11.2026, Betreiber: "/fncs laedt zu
 * langsam"): vorher las jeder Aufruf drei Dateien neu (Profile, Fotos, Namen), bevor die fertige Liste herausging.
 */
let fotoVorrat: { zeit: number; karte: Map<string, string> } | null = null;
let fotoLauf: Promise<Map<string, string>> | null = null;
async function fotosGemerkt(): Promise<Map<string, string>> {
  const neu = () => (fotoLauf ??= fotosNachName()
    .then((karte) => { fotoVorrat = { zeit: Date.now(), karte }; return karte; })
    .finally(() => { fotoLauf = null; }));
  if (fotoVorrat && Date.now() - fotoVorrat.zeit < 5 * 60_000) return fotoVorrat.karte;
  if (fotoVorrat) { void neu().catch(() => { /* der alte Stand bleibt */ }); return fotoVorrat.karte; }
  return neu();
}

async function holeGET() {
  try {
    // Die letzte gute Liste sofort - auch ohne den PC daheim (lib/ueberdauernd, 29.10.2026). Liste und Fotos zugleich.
    const [roh, fotos] = await Promise.all([
      ueberdauernd('fncs-ereignisse-v4', 30 * 60_000, 7 * 864e5, () => fncsEreignisse()),
      fotosGemerkt().catch(() => new Map<string, string>()),
    ]);
    const ereignisse = (roh as FncsEreignis[]).map((e) => ({
      ...e,
      spitze: e.spitze.map((p) => ({ ...p, spieler: p.spieler.map((s) => ({ ...s, bild: fotos.get(schluessel(s.name)) ?? null })) })),
    }));
    return NextResponse.json({ ok: true, ereignisse }, { headers: { 'Cache-Control': CDN_FRIST } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 424, headers: { 'Cache-Control': 'no-store' } });
  }
}

/** Jede Antwort mit den Spielerfotos von jetzt, nicht von der Rechnung (lib/aktuelleFotos). */
export async function GET() {
  return antwortMitAktuellenFotos(await holeGET());
}
