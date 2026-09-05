import { NextResponse } from 'next/server';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';
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
    /*
     * Die angegebene Adresse geht vor.
     *
     * Sie ist freiwillig und darf von der des Kontos abweichen - wer aus
     * einem gemeinsam genutzten Konto schreibt, will die Antwort woanders.
     * Und die alten VIP-Zugaenge haben gar keine, dort ist sie die einzige.
     */
    vonEmail: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(k.email ?? '').trim())
      ? String(k.email).trim()
      : (konto.email ?? ''),
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
  /*
   * Englisch, wie jede verschickte Mail - auch die an den Betreiber selbst.
   * Zwei Sprachen im selben Postfach waeren nur Durcheinander.
   */
  const themenName: Record<string, string> = {
    support: 'Support', report: 'Report', feedback: 'Feedback',
    hilfe: 'Help', idee: 'Idea', anderes: 'Other',
  };
  const betreff = m.eigenesThema || themenName[m.thema] || 'Message';
  void sendeMail({
    an: betreiberAdresse(),
    antwortAn: m.vonEmail || undefined,
    betreff: `${betreff} — ${m.vonName || 'someone'}`,
    etikett: themenName[m.thema] || m.thema,
    text: 'A new message came in through the contact form.',
    angaben: [
      { was: 'From', wert: m.vonName || '—' },
      { was: 'Address', wert: m.vonEmail || '—' },
      { was: 'Topic', wert: themenName[m.thema] || m.thema },
      ...(m.eigenesThema ? [{ was: 'Subject', wert: m.eigenesThema }] : []),
      { was: 'Images', wert: m.bilder.length ? String(m.bilder.length) : 'none' },
      // Britisches Datumsformat statt des deutschen - dieselbe Ueberlegung
      // wie beim Rest der Mail.
      { was: 'Received', wert: new Date(m.zeit).toLocaleString('en-GB') },
    ],
    zitat: m.text,
    /*
     * Der Knopf fuehrt in genau dieses Gespraech, nicht in die Liste.
     *
     * Wer aus dem Postfach kommt, hat eine bestimmte Meldung vor Augen. In
     * einer Liste muesste er sie erst wiederfinden - bei zwei Meldungen geht
     * das, bei zwanzig nicht mehr.
     */
    knopf: {
      titel: 'Open in the tool',
      ziel: `https://thecomphub.com/nachrichten?gespraech=${m.id}`,
    },
    /*
     * Die Bildschirmausschnitte gehen mit.
     *
     * Als Anhang und nicht im Text: im Text muessten sie von einer Adresse
     * geladen werden, die nur der Betreiber sehen darf - im Postfach erschiene
     * dort ein leerer Rahmen. Im Anhang liegen sie und sind mit einem Klick da.
     */
    anhaenge: m.bilder.map((b, i) => ({
      name: `bild-${i + 1}${b.slice(b.lastIndexOf('.'))}`,
      pfad: path.join(DATEN_ORT, 'kontakt-bilder', b),
    })),
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
