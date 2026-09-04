import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { kontoAus, nachId } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach, rechteVon } from '@/lib/vipZugaenge';
import {
  alle, sichtbarFuer, antworte, markiereGelesen,
  ganzerVerlauf, ungelesen, letzteZeit, type Meldung,
} from '@/lib/kontakt';
import { fuehreAus } from '@/lib/chatBefehle';

/*
 * Das Gespraech zu einer Meldung.
 *
 * Aus dem Kontaktformular war bisher eine Einbahnstrasse: jemand schrieb,
 * der Betreiber las, und geantwortet wurde per Mail - wenn ueberhaupt. Der
 * Betreiber wollte das im Werkzeug haben: "dass ich ja auch im Tool selber
 * zurueckantworten kann und es dann eine Art Live-Chat gibt".
 *
 * Deshalb sind die Meldungen jetzt Gespraeche. Beide Seiten schreiben in
 * denselben Verlauf, beide sehen, was ungelesen ist.
 *
 *   GET            -> die eigenen Gespraeche (der Betreiber: alle)
 *   GET ?zahl=1    -> nur die Zahl der ungelesenen Nachrichten
 *   POST {id,text} -> antworten
 *   PATCH {id}     -> als gelesen markieren
 *
 * Wer nur die Zahl braucht, soll nicht den ganzen Verlauf uebertragen
 * muessen: das Chatsymbol fragt im Takt nach, und die Antwort darauf ist
 * eine Zahl.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOKIE = 'streamer_dashboard_konto';

interface Wer {
  id: string;
  name: string;
  /** Der Betreiber sieht alle Gespraeche und antwortet als "betreiber". */
  admin: boolean;
}

/**
 * Wer da fragt.
 *
 * Dasselbe Muster wie in der Kontenverwaltung: das Konto mit der Adminrolle,
 * dazu der alte VIP-Weg - solange das Konto des Betreibers nur darueber
 * besteht, kaeme er sonst an seinen eigenen Posteingang nicht heran.
 */
async function werFragt(): Promise<Wer | null> {
  const laden = await cookies();

  const id = kontoAus(laden.get(COOKIE)?.value);
  if (id) {
    const konto = await nachId(id);
    if (konto && !konto.gesperrt) {
      return { id: konto.id, name: konto.name ?? '', admin: konto.rolle === 'admin' };
    }
  }

  const vipWert = laden.get('streamer_dashboard_auth')?.value;
  if (vipWert) {
    if (istBetreiber(vipWert)) return { id: 'betreiber', name: 'CompHub', admin: true };
    const name = vipAus(vipWert);
    if (name && rechteVon(await zugangNach(name)).rolle === 'admin') {
      return { id: `vip:${name}`, name, admin: true };
    }
  }

  return null;
}

/** Nur, was die Gegenseite sehen darf. Notizen bleiben beim Betreiber. */
function fuerAnsicht(m: Meldung, admin: boolean) {
  return {
    id: m.id,
    zeit: m.zeit,
    thema: m.thema,
    eigenesThema: m.eigenesThema,
    erledigt: m.erledigt,
    vonName: m.vonName,
    // Die Adresse braucht nur der Betreiber, um notfalls doch zu mailen.
    vonEmail: admin ? m.vonEmail : '',
    verlauf: ganzerVerlauf(m),
    zuletzt: letzteZeit(m),
    ungelesen: ungelesen(m, admin ? 'betreiber' : 'nutzer'),
  };
}

export async function GET(request: Request) {
  const wer = await werFragt();
  if (!wer) return NextResponse.json({ fehler: 'nicht angemeldet' }, { status: 401 });

  const meldungen = wer.admin ? await alle() : await sichtbarFuer(wer.id);
  const seite = wer.admin ? 'betreiber' : 'nutzer';
  const zahl = meldungen.reduce((n, m) => n + ungelesen(m, seite), 0);

  if (new URL(request.url).searchParams.get('zahl') === '1') {
    return NextResponse.json({ ok: true, ungelesen: zahl, admin: wer.admin });
  }

  return NextResponse.json({
    ok: true,
    admin: wer.admin,
    ungelesen: zahl,
    gespraeche: meldungen
      .sort((a, b) => letzteZeit(b) - letzteZeit(a))
      .map((m) => fuerAnsicht(m, wer.admin)),
  });
}

export async function POST(request: Request) {
  const wer = await werFragt();
  if (!wer) return NextResponse.json({ fehler: 'nicht angemeldet' }, { status: 401 });

  const k = await request.json().catch(() => ({}));
  const id = String(k.id ?? '').trim();
  const text = String(k.text ?? '').trim();
  if (!id || !text) {
    return NextResponse.json({ fehler: 'Bitte schreib etwas.' }, { status: 400 });
  }

  /*
   * Fremde Gespraeche gehen niemanden etwas an.
   *
   * Ohne diese Pruefung koennte jeder Angemeldete mit einer geratenen Id in
   * ein fremdes Gespraech schreiben - und die Meldungen enthalten
   * Bildschirmausschnitte, auf denen mehr steht, als der Absender zeigen
   * wollte.
   */
  if (!wer.admin) {
    const meine = await sichtbarFuer(wer.id);
    if (!meine.some((m) => m.id === id)) {
      return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });
    }
  }

  /*
   * Befehle - nur fuer den Betreiber.
   *
   * Ein Schraegstrich am Zeilenanfang ist auch ein zulaessiger Satzanfang,
   * deshalb entscheidet nicht dieses Modul, sondern fuehreAus: was es nicht
   * kennt, geht unveraendert als Nachricht hinaus.
   *
   * Fuer alle anderen gibt es das gar nicht erst. Wer als Nutzer "/close"
   * schreibt, meint das als Satz - und duerfte ein Gespraech ohnehin nicht
   * schliessen.
   */
  if (wer.admin) {
    const ergebnis = await fuehreAus(id, text);
    if (!ergebnis.keinBefehl) {
      /*
       * Nichts davon landet im Verlauf.
       *
       * Erst stand die Wirkung eines Befehls als Nachricht im Gespraech -
       * "Gespraech geschlossen", "X ist jetzt dabei". Der Betreiber wollte
       * das nicht: "dass nur ich als Admin das sehe und die das im
       * Chatverlauf eigentlich nicht sehen koennen." Das ist auch
       * schluessiger - ein Befehl ist Bedienung des Werkzeugs, keine
       * Nachricht an den Gegenueber.
       *
       * Die Rueckmeldung geht deshalb vollstaendig an den Betreiber und
       * nirgendwo sonst hin.
       */
      const zusammen = [ergebnis.imVerlauf, ergebnis.hinweis]
        .filter(Boolean).join('\n\n');
      return NextResponse.json({
        ok: true,
        befehl: true,
        hinweis: zusammen || null,
        neuLaden: Boolean(ergebnis.neuLaden),
        gespraech: null,
      });
    }
  }

  const m = await antworte({
    id,
    von: wer.admin ? 'betreiber' : 'nutzer',
    name: wer.admin ? 'CompHub' : wer.name,
    text,
    bilder: Array.isArray(k.bilder) ? k.bilder : [],
  });
  if (!m) return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });

  return NextResponse.json({ ok: true, gespraech: fuerAnsicht(m, wer.admin) });
}

export async function PATCH(request: Request) {
  const wer = await werFragt();
  if (!wer) return NextResponse.json({ fehler: 'nicht angemeldet' }, { status: 401 });

  const k = await request.json().catch(() => ({}));
  const id = String(k.id ?? '').trim();
  if (!id) return NextResponse.json({ fehler: 'keine Id' }, { status: 400 });

  if (!wer.admin) {
    const meine = await sichtbarFuer(wer.id);
    if (!meine.some((m) => m.id === id)) {
      return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });
    }
  }

  await markiereGelesen(id, wer.admin ? 'betreiber' : 'nutzer');
  return NextResponse.json({ ok: true });
}
