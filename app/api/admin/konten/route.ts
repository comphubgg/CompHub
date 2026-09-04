import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  aendern, alleKonten, kontoAus, nachId, setzeRechte, setzeSperre,
  loesche, setzeBestaetigt } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach, rechteVon } from '@/lib/vipZugaenge';
import { ALLE_BEREICHE } from '@/lib/rechte';
import { verankereProfi } from '@/lib/profiVerankern';

// Die Kontoverwaltung.
//
//   GET                                  -> alle Konten
//   POST { id, rolle, vipTage }          -> Rechte setzen
//
// Was hier herauskommt, enthaelt **keine** privaten Daten: keine
// E-Mail-Adresse, kein Passwort, keine Social-Konten. Der Admin soll Rechte
// vergeben koennen, nicht in fremden Postfaechern lesen. Zum Wiedererkennen
// reichen Name und Konto-Id - und die Id sieht jeder Nutzer auch bei sich
// selbst, damit er sie weitergeben kann.
//
// Wer darf das? Nur wer selbst Admin ist. Geprueft wird ueber zwei Wege,
// weil es zwei Zugaenge gibt: die Rolle am CompHub-Konto und der alte
// VIP-Schluessel des Admins.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KONTO_COOKIE = 'streamer_dashboard_konto';
const VIP_COOKIE = 'streamer_dashboard_auth';

/**
 * Ist der Anfragende Admin?
 *
 * Der VIP-Weg zaehlt mit, solange das Konto des Betreibers nur darueber
 * besteht - sonst koennte er seine eigene Verwaltung nicht oeffnen.
 */
async function istAdmin(): Promise<boolean> {
  const laden = await cookies();

  const id = kontoAus(laden.get(KONTO_COOKIE)?.value);
  if (id) {
    const k = await nachId(id);
    if (k?.rolle === 'admin') return true;
  }

  /*
   * Der alte Zugang - mit gepruefter Unterschrift.
   *
   * Ein blosser Textvergleich waere hier ein Loch gewesen: der Name steht
   * im Cookie, und ein Cookie schreibt sich jeder selbst.
   */
  // Der Betreiber selbst - oder ein Zugang, dem die Adminrolle
  // gegeben wurde. Beides zaehlt gleich.
  const vipName = vipAus(laden.get(VIP_COOKIE)?.value);
  if (!vipName) return false;
  if (istBetreiber(laden.get(VIP_COOKIE)?.value)) return true;
  return rechteVon(await zugangNach(vipName)).rolle === 'admin';
}

export async function GET() {
  if (!await istAdmin()) {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }
  const konten = await alleKonten();
  return NextResponse.json({ ok: true, konten });
}

export async function POST(request: Request) {
  if (!await istAdmin()) {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }

  const koerper = await request.json().catch(() => ({}));
  const id = String(koerper.id ?? '').trim();
  if (!id) return NextResponse.json({ fehler: 'keine Id' }, { status: 400 });

  const roh = koerper.rolle;
  if (roh !== null && roh !== 'admin' && roh !== 'manager' && roh !== 'pro') {
    return NextResponse.json({ fehler: 'unbekannte Rolle' }, { status: 400 });
  }

  /*
   * Ein Profi ohne Epic-Konto waere sinnlos: die Karte erkennt ihn ueber die
   * Konto-Id in ihrer Teamliste wieder. Ohne sie koennte er sich nirgends
   * eintragen, und die Rolle waere nur ein Etikett.
   */
  if (typeof koerper.epicId === 'string') {
    const epic = koerper.epicId.trim().toLowerCase();
    if (epic && !/^[0-9a-f]{32}$/.test(epic)) {
      return NextResponse.json(
        { fehler: 'Eine Epic-Konto-Id sind 32 Zeichen aus 0-9 und a-f.' },
        { status: 400 });
    }
    await aendern(id, { epicId: epic || undefined });
    /*
     * Und die Id gleich als feste Kennung verankern.
     *
     * Ohne das haengt die Zuordnung weiter am Namen - und den aendert ein
     * Profi, wann er will. Ist noch kein Profil zu dieser Id da, entsteht
     * eines mit dem heutigen Namen als Anzeigenamen; ein vorhandenes wird
     * nie angeruehrt.
     */
    if (epic) await verankereProfi(epic);
  }

  /*
   * Die VIP-Dauer in Tagen. null nimmt das VIP weg, 0 gibt es ohne Ende,
   * alles andere ist eine Frist. Mehr als zwei Jahre lehne ich ab - eine
   * vertippte Zahl soll nicht zu einem Zugang bis 2140 fuehren.
   */
  const tage = koerper.vipTage;
  if (tage !== null && (typeof tage !== 'number' || tage < 0 || tage > 730)) {
    return NextResponse.json(
      { fehler: 'Die Dauer muss zwischen 0 und 730 Tagen liegen.' },
      { status: 400 });
  }

  /*
   * Die angehakten Bereiche - nur bekannte Schluessel, damit sich nichts
   * Erfundenes in die Datei schreibt.
   */
  const bereiche = Array.isArray(koerper.bereiche)
    ? (koerper.bereiche as unknown[])
      .map((x) => String(x))
      .filter((x) => (ALLE_BEREICHE as string[]).includes(x))
    : undefined;

  const konto = await setzeRechte(id, roh, tage, bereiche);
  if (!konto) return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });

  return NextResponse.json({ ok: true, konten: await alleKonten() });
}

/** Sperren und Freigeben - eigener Weg, damit es nicht mit den Rechten
 *  versehentlich zusammen umgestellt wird. */
export async function PATCH(request: Request) {
  if (!await istAdmin()) {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }
  const koerper = await request.json().catch(() => ({}));
  const id = String(koerper.id ?? '').trim();
  if (!id) return NextResponse.json({ fehler: 'keine Id' }, { status: 400 });

  /*
   * Zwei Dinge ueber denselben Weg: sperren und bestaetigen.
   *
   * "bestaetigt" kommt nur mit, wenn es ausdruecklich gemeint ist - sonst
   * setzte jedes Sperren nebenbei die Bestaetigung zurueck.
   */
  let konto = null;
  if (koerper.bestaetigt !== undefined) {
    konto = await setzeBestaetigt(id, Boolean(koerper.bestaetigt));
  } else {
    konto = await setzeSperre(
      id, Boolean(koerper.gesperrt), String(koerper.grund ?? ''));
  }
  if (!konto) return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });

  return NextResponse.json({ ok: true, konten: await alleKonten() });
}


/**
 * Ein Konto endgueltig entfernen.
 *
 * Der Betreiber wollte gesperrte Konten nach einer Weile auch loswerden
 * koennen - eine Sperre ist ein Zustand, kein Abschluss. Bisher liess sich
 * nur ein VIP-Zugang entfernen, und der auch nur in einem eingeklappten
 * Abschnitt, den er nicht gefunden hat.
 *
 * Das eigene Konto bleibt aussen vor: wer sich selbst entfernt, kommt in
 * die Verwaltung nicht mehr hinein, und niemand kann ihn zurueckholen.
 */
export async function DELETE(request: Request) {
  if (!await istAdmin()) {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }
  const id = (new URL(request.url).searchParams.get('id') ?? '').trim();
  if (!id) return NextResponse.json({ fehler: 'keine Id' }, { status: 400 });

  const laden = await cookies();
  const eigene = kontoAus(laden.get(KONTO_COOKIE)?.value);
  if (eigene && eigene === id) {
    return NextResponse.json(
      { fehler: 'Das eigene Konto lässt sich hier nicht entfernen.' },
      { status: 400 });
  }

  if (!await loesche(id)) {
    return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, konten: await alleKonten() });
}
