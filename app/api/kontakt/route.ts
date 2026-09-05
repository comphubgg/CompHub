import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { kontoAus, nachId } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach, rechteVon } from '@/lib/vipZugaenge';
import { alle, lege, aendere, entferne } from '@/lib/kontakt';
import { sendeMail, betreiberAdresse } from '@/lib/mail';

/*
 * Das Kontaktformular.
 *
 *   POST   - eine Meldung abgeben (jedes angemeldete Konto)
 *   GET    - alle Meldungen lesen (nur der Betreiber)
 *   PATCH  - erledigt setzen oder eine Notiz schreiben (nur der Betreiber)
 *   DELETE - eine Meldung entfernen (nur der Betreiber)
 *
 * Abgeben darf jeder Angemeldete, nicht nur VIPs: wer ein Konto hat, soll
 * einen Fehler melden koennen, ohne vorher freigeschaltet zu sein. Gerade
 * die Meldungen von Leuten ohne Rechte sind die, die man hoeren will.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOKIE = 'streamer_dashboard_konto';

/** Das angemeldete Konto, oder null. */
async function angemeldet() {
  const id = kontoAus((await cookies()).get(COOKIE)?.value);
  if (!id) return null;
  const konto = await nachId(id);
  if (!konto || konto.gesperrt) return null;
  return konto;
}

/**
 * Wer die Meldungen lesen darf.
 *
 * Dasselbe Muster wie in der Kontenverwaltung: das Konto mit der Adminrolle,
 * dazu der alte VIP-Weg - solange das Konto des Betreibers nur darueber
 * besteht, kaeme er sonst an seinen eigenen Posteingang nicht heran.
 */
async function darfLesen(): Promise<boolean> {
  const konto = await angemeldet();
  if (konto?.rolle === 'admin') return true;

  const laden = await cookies();
  const vipWert = laden.get('streamer_dashboard_auth')?.value;
  if (!vipWert) return false;
  if (istBetreiber(vipWert)) return true;
  const name = vipAus(vipWert);
  if (!name) return false;
  return rechteVon(await zugangNach(name)).rolle === 'admin';
}

export async function GET() {
  if (!await darfLesen()) {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }
  return NextResponse.json({ meldungen: await alle() });
}

export async function POST(request: Request) {
  const konto = await angemeldet();
  if (!konto) {
    return NextResponse.json(
      { fehler: 'Bitte zuerst anmelden.' }, { status: 401 });
  }

  const k = await request.json().catch(() => ({}));
  const text = String(k.text ?? '').trim();
  if (text.length < 10) {
    return NextResponse.json(
      { fehler: 'Bitte beschreibe kurz, worum es geht.' }, { status: 400 });
  }

  const m = await lege({
    thema: String(k.thema ?? 'anderes'),
    eigenesThema: String(k.eigenesThema ?? ''),
    text,
    bilder: Array.isArray(k.bilder) ? k.bilder : [],
    vonId: konto.id,
    vonName: konto.name ?? '',
    vonEmail: konto.email ?? '',
  });

  /*
   * Der Betreiber bekommt Bescheid.
   *
   * Die Meldung liegt im Werkzeug und bleibt dort - das war und ist richtig,
   * die Bilder gehoeren zum Vorgang. Aber wer nicht taeglich hineinsieht,
   * bemerkt sie tagelang nicht. Deshalb eine Mail mit allem Wesentlichen:
   * Thema, Absender, Text. Antworten geht direkt an den Absender, weil
   * antwortAn auf seine Adresse steht - ein Klick auf Antworten im Postfach
   * erreicht ihn, ohne dass jemand eine Adresse heraussuchen muss.
   */
  const themenName: Record<string, string> = {
    support: 'Support', report: 'Report', feedback: 'Feedback',
    hilfe: 'Hilfe', idee: 'Idee', anderes: 'Anderes',
  };
  const betreff = m.eigenesThema || themenName[m.thema] || 'Meldung';
  void sendeMail({
    an: betreiberAdresse(),
    antwortAn: m.vonEmail || undefined,
    betreff: `${betreff} — ${m.vonName || 'jemand'}`,
    etikett: themenName[m.thema] || m.thema,
    text: 'Es ist eine neue Meldung über das Kontaktformular eingegangen.',
    angaben: [
      { was: 'Von', wert: m.vonName || '—' },
      { was: 'Adresse', wert: m.vonEmail || '—' },
      { was: 'Thema', wert: themenName[m.thema] || m.thema },
      ...(m.eigenesThema ? [{ was: 'Betreff', wert: m.eigenesThema }] : []),
      { was: 'Bilder', wert: m.bilder.length ? String(m.bilder.length) : 'keine' },
      { was: 'Eingegangen', wert: new Date(m.zeit).toLocaleString('de-DE') },
    ],
    zitat: m.text,
    knopf: { titel: 'Im Werkzeug öffnen', ziel: 'https://thecomphub.com/nachrichten' },
  });

  return NextResponse.json({ ok: true, id: m.id, bilder: m.bilder.length });
}

export async function PATCH(request: Request) {
  if (!await darfLesen()) {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }
  const k = await request.json().catch(() => ({}));
  const id = String(k.id ?? '').trim();
  if (!id) return NextResponse.json({ fehler: 'keine Id' }, { status: 400 });

  const m = await aendere(id, {
    erledigt: k.erledigt === undefined ? undefined : Boolean(k.erledigt),
    notiz: k.notiz === undefined ? undefined : String(k.notiz),
  });
  if (!m) return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });
  return NextResponse.json({ ok: true, meldungen: await alle() });
}

export async function DELETE(request: Request) {
  if (!await darfLesen()) {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }
  const k = await request.json().catch(() => ({}));
  const id = String(k.id ?? '').trim();
  if (!await entferne(id)) {
    return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, meldungen: await alle() });
}
