import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { kontoAus, nachId, alleKonten } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach, rechteVon, alleZugaenge } from '@/lib/vipZugaenge';
import {
  alle, sichtbarFuer, antworte, markiereGelesen, lege, setzeTeilnehmer, aendere,
  ganzerVerlauf, ungelesen, letzteZeit, type Meldung,
} from '@/lib/kontakt';
import { fuehreAus } from '@/lib/chatBefehle';
import { alleChatNutzer, nameNormal } from '@/lib/chatNutzer';

/*
 * Das Gespraech zu einer Meldung.
 *
 * Aus dem Kontaktformular war bisher eine Einbahnstrasse: jemand schrieb,
 * der Betreiber las, und geantwortet wurde per Mail - wenn ueberhaupt. Der
 * Betreiber wollte das im Werkzeug haben: "dass ich ja auch im Tool selber
 * zurueckantworten kann und es dann eine Art Live-Chat gibt".
 *
 * Deshalb sind die Meldungen jetzt Gespraeche. Beide Seiten schreiben in
 * denselben Verlauf, beide sehen, was ungelesen ist, und der Betreiber kann
 * weitere Leute dazuholen.
 *
 *   GET                          -> die eigenen Gespraeche (Betreiber: alle)
 *   GET ?zahl=1                  -> nur die Zahl der ungelesenen Nachrichten
 *   GET ?nutzer=<suche>          -> Konten suchen (nur Betreiber)
 *   POST {id,text,bilder}        -> antworten
 *   POST {neu,teilnehmer,titel}  -> Gruppe anlegen (nur Betreiber)
 *   POST {id,verlassen,grund}    -> aus einer Gruppe austreten
 *   PATCH {id}                   -> als gelesen markieren
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

  /*
   * Der alte VIP-Weg.
   *
   * Es gibt zwei getrennte Nutzerlisten: die Konten (konten.json) und die
   * VIP-Zugaenge (vip-users.json) aus der Zeit davor. Hier kamen bisher nur
   * Betreiber und Admins durch - ein gewoehnlicher VIP hatte gar keinen Chat,
   * obwohl er im Werkzeug angemeldet war. Jetzt kommt jeder gueltige Zugang
   * herein; die Kennung "vip:<name>" haelt ihn von den Konten getrennt.
   */
  const vipWert = laden.get('streamer_dashboard_auth')?.value;
  if (vipWert) {
    if (istBetreiber(vipWert)) return { id: 'betreiber', name: 'CompHub', admin: true };
    const name = vipAus(vipWert);
    if (name) {
      const zugang = await zugangNach(name);
      if (zugang) {
        return {
          id: `vip:${name}`,
          name,
          admin: rechteVon(zugang).rolle === 'admin',
        };
      }
    }
  }

  return null;
}

/**
 * Nur, was die Gegenseite sehen darf. Notizen bleiben beim Betreiber.
 *
 * Die Teilnehmer kommen als Namen heraus, nicht als Konto-Ids: oben im
 * Gespraech soll stehen, mit wem man spricht, und eine Zeichenkette aus
 * zweiunddreissig Zeichen sagt niemandem etwas.
 */
function fuerAnsicht(
  m: Meldung, admin: boolean, ich: string, namen: Map<string, KontoKurz>,
) {
  const teilnehmer = (m.teilnehmer ?? []).map((id) => ({
    id, name: namen.get(id)?.name || id,
  }));
  const absender = namen.get(m.vonId);
  return {
    id: m.id,
    zeit: m.zeit,
    thema: m.thema,
    eigenesThema: m.eigenesThema,
    erledigt: m.erledigt,
    vonName: m.vonName,
    /* Fuer die Sortierung beim Betreiber - VIPs stehen oben. */
    vonVip: Boolean(absender?.vip) || absender?.rolle === 'pro',
    vonRolle: absender?.rolle ?? null,
    vonBestaetigt: Boolean(absender?.bestaetigt),
    // Die Adresse braucht nur der Betreiber, um notfalls doch zu mailen.
    vonEmail: admin ? m.vonEmail : '',
    teilnehmer,
    /** Eine Gruppe ist es ab dem ersten Dazugeholten. */
    gruppe: teilnehmer.length > 0,
    /*
     * Austreten darf nur, wer dazugeholt wurde.
     *
     * Wer das Gespraech begonnen hat, kann es nicht verlassen - es waere sonst
     * herrenlos, und seine eigene Meldung stuende ohne Absender da. Der
     * Betreiber auch nicht: er ist die Gegenstelle, ohne ihn gibt es kein
     * Gespraech mehr.
     */
    darfVerlassen: !admin && (m.teilnehmer ?? []).includes(ich),
    /*
     * Schreiben darf nur, solange offen ist.
     *
     * Ein geschlossenes Gespraech ist abgelegt, nicht geloescht: der Verlauf
     * bleibt lesbar - auch fuer den, der es begonnen hat -, aber niemand
     * schreibt mehr hinein. Wer doch noch etwas braucht, stellt eine Anfrage;
     * darueber entscheidet der Betreiber, nicht der Fragende.
     */
    darfSchreiben: admin || !m.erledigt,
    verlauf: ganzerVerlauf(m),
    zuletzt: letzteZeit(m),
    ungelesen: ungelesen(m, admin ? 'betreiber' : 'nutzer'),
  };
}

/** Was ueber ein Konto im Chat gebraucht wird. */
interface KontoKurz {
  name: string; vip: boolean; rolle: string | null;
  /** Adresse bestaetigt - der blaue Haken. */
  bestaetigt: boolean;
}

/**
 * Konto-Id zu Name und Rang, einmal je Anfrage.
 *
 * Der Rang kommt mit, weil der Betreiber seine Liste danach ordnen wollte:
 * "alle VIPs kommen immer nach oben, alle anderen sind unten". Ohne ihn
 * muesste die Oberflaeche fuer jedes Gespraech einzeln nachfragen.
 */
async function namensBuch(): Promise<Map<string, KontoKurz>> {
  const buch = new Map<string, KontoKurz>();

  for (const k of await alleKonten()) {
    buch.set(k.id, {
      name: k.name || k.id,
      vip: Boolean(k.vip),
      rolle: k.rolle ?? null,
      bestaetigt: Boolean(k.bestaetigt),
    });
  }

  // Und die Zugaenge aus dem alten System, unter derselben Kennung, mit der
  // sie im Gespraech stehen.
  for (const z of await alleZugaenge()) {
    buch.set(`vip:${z.username}`, {
      name: z.username,
      vip: true,
      rolle: rechteVon(z).rolle ?? null,
      // Ein VIP-Zugang wurde vom Betreiber von Hand angelegt - eine Adresse
      // zu bestaetigen gibt es dort nicht, und noetig ist es auch nicht.
      bestaetigt: true,
    });
  }

  return buch;
}

export async function GET(request: Request) {
  const wer = await werFragt();
  if (!wer) return NextResponse.json({ fehler: 'nicht angemeldet' }, { status: 401 });

  const p = new URL(request.url).searchParams;

  /*
   * Konten suchen - fuer den Knopf, mit dem eine Gruppe entsteht.
   *
   * Nur der Betreiber: eine Liste aller Konten ist nichts, was ein
   * gewoehnlicher Nutzer bekommen soll, auch nicht als blosse Namen.
   */
  if (p.has('nutzer')) {
    if (!wer.admin) return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
    const suche = (p.get('nutzer') ?? '').trim().toLowerCase();

    /*
     * Beide Listen zusammen - Konten und alte Zugangsschluessel.
     *
     * Zusammengestellt wird das in lib/chatNutzer.ts, und zwar genau einmal:
     * derselbe Vorrat beantwortet dieses Vorschlagsfenster und den Befehl
     * "/add" darunter. Vorher waren es zwei Listen, und die kleinere kannte
     * ausgerechnet die Leute nicht, die die groessere gerade vorgeschlagen
     * hatte.
     */
    const gefunden = (await alleChatNutzer())
      .filter((k) => !suche || k.name.toLowerCase().includes(nameNormal(suche)))
      .slice(0, 30);
    return NextResponse.json({ ok: true, nutzer: gefunden });
  }

  const meldungen = wer.admin ? await alle() : await sichtbarFuer(wer.id);
  const seite = wer.admin ? 'betreiber' : 'nutzer';
  const zahl = meldungen.reduce((n, m) => n + ungelesen(m, seite), 0);

  if (p.get('zahl') === '1') {
    return NextResponse.json({ ok: true, ungelesen: zahl, admin: wer.admin });
  }

  const namen = await namensBuch();
  return NextResponse.json({
    ok: true,
    admin: wer.admin,
    ungelesen: zahl,
    gespraeche: meldungen
      .sort((a, b) => letzteZeit(b) - letzteZeit(a))
      .map((m) => fuerAnsicht(m, wer.admin, wer.id, namen)),
  });
}

export async function POST(request: Request) {
  const wer = await werFragt();
  if (!wer) return NextResponse.json({ fehler: 'nicht angemeldet' }, { status: 401 });

  const k = await request.json().catch(() => ({}));

  /* ------------------------------------------------- Eine Gruppe anlegen */

  if (k.neu === true) {
    if (!wer.admin) return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });

    const ids: string[] = (Array.isArray(k.teilnehmer) ? k.teilnehmer : [])
      .map((x: unknown) => String(x)).filter(Boolean);
    if (!ids.length) {
      return NextResponse.json(
        { fehler: 'Bitte wähle mindestens eine Person.' }, { status: 400 });
    }

    const namen = await namensBuch();
    const [erster, ...weitere] = ids;
    const titel = String(k.titel ?? '').trim().slice(0, 120)
      || (ids.length > 1
        ? `Group: ${ids.map((i) => namen.get(i)?.name ?? i).join(', ')}`
        : `Message to ${namen.get(erster)?.name ?? erster}`);

    /*
     * Der erste Gewaehlte ist der Absender, die anderen kommen dazu.
     *
     * Ein Gespraech gehoert immer jemandem - daran haengen die Rechte, und
     * ein herrenloses waere ein Sonderfall, den jede Stelle mitdenken
     * muesste. Fuer eine Gruppe macht es keinen Unterschied: alle Teilnehmer
     * sehen und schreiben dasselbe.
     */
    const m = await lege({
      thema: 'anderes',
      eigenesThema: titel,
      text: String(k.text ?? '').trim() || 'CompHub started this conversation.',
      bilder: [],
      vonId: erster,
      vonName: namen.get(erster)?.name ?? '',
      vonEmail: '',
    });
    if (weitere.length) await setzeTeilnehmer(m.id, weitere);

    const frisch = (await alle()).find((x) => x.id === m.id) ?? m;
    return NextResponse.json({
      ok: true,
      neu: true,
      gespraech: fuerAnsicht(frisch, true, wer.id, namen),
    });
  }

  const id = String(k.id ?? '').trim();
  if (!id) return NextResponse.json({ fehler: 'keine Id' }, { status: 400 });

  /*
   * Fremde Gespraeche gehen niemanden etwas an.
   *
   * Ohne diese Pruefung koennte jeder Angemeldete mit einer geratenen Id in
   * ein fremdes Gespraech schreiben - und die Meldungen enthalten
   * Bildschirmausschnitte, auf denen mehr steht, als der Absender zeigen
   * wollte.
   */
  const sichtbar = wer.admin ? await alle() : await sichtbarFuer(wer.id);
  const meldung = sichtbar.find((m) => m.id === id);
  if (!meldung) return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });

  /* ---------------------------------------------- Eine Gruppe verlassen */

  if (k.verlassen === true) {
    if (!(meldung.teilnehmer ?? []).includes(wer.id)) {
      return NextResponse.json(
        { fehler: 'Nur wer dazugeholt wurde, kann wieder austreten.' }, { status: 400 });
    }
    const grund = String(k.grund ?? '').trim().slice(0, 500);

    /*
     * Der Grund bleibt im Gespraech stehen.
     *
     * Anders als bei den Befehlen des Betreibers gehoert er dorthin: er ist
     * eine Nachricht an die anderen. Ohne ihn stuende jemand irgendwann
     * nicht mehr in der Gruppe, und niemand wuesste, warum.
     */
    await antworte({
      id, von: 'nutzer', name: wer.name,
      text: grund
        ? `${wer.name} left the conversation: ${grund}`
        : `${wer.name} left the conversation.`,
    });
    await setzeTeilnehmer(id, (meldung.teilnehmer ?? []).filter((x) => x !== wer.id));

    return NextResponse.json({ ok: true, verlassen: true });
  }

  /* ------------------------------------------------------------ Antworten */

  const text = String(k.text ?? '').trim();
  if (!text) {
    return NextResponse.json({ fehler: 'Bitte schreib etwas.' }, { status: 400 });
  }

  /*
   * Eine Anfrage, ein geschlossenes Gespraech wieder aufzumachen.
   *
   * Sie geht auch dann durch, wenn sonst niemand mehr schreiben darf - das
   * ist ihr Sinn. Geoeffnet wird dabei nichts: der Betreiber sieht sie als
   * ungelesene Nachricht und entscheidet selbst.
   */
  if (k.anfrage === true && !wer.admin) {
    if (!meldung.erledigt) {
      return NextResponse.json(
        { fehler: 'Dieses Gespräch ist offen — schreib einfach.' }, { status: 400 });
    }
    await antworte({
      id, von: 'nutzer', name: wer.name,
      text: `Request to reopen: ${text}`,
    });
    // antworte() setzt erledigt zurueck - hier soll es geschlossen bleiben,
    // bis der Betreiber entscheidet.
    await aendere(id, { erledigt: true });
    return NextResponse.json({ ok: true, anfrage: true });
  }

  if (!wer.admin && meldung.erledigt) {
    return NextResponse.json(
      { fehler: 'Dieses Gespräch ist abgeschlossen.' }, { status: 403 });
  }

  /*
   * Befehle - nur fuer den Betreiber.
   *
   * Ein Schraegstrich am Zeilenanfang ist auch ein zulaessiger Satzanfang,
   * deshalb entscheidet nicht dieses Modul, sondern fuehreAus: was es nicht
   * kennt, geht unveraendert als Nachricht hinaus.
   */
  if (wer.admin) {
    const ergebnis = await fuehreAus(id, text);
    if (!ergebnis.keinBefehl) {
      /*
       * Nichts davon landet im Verlauf.
       *
       * Der Betreiber wollte das so: "dass nur ich als Admin das sehe und
       * die das im Chatverlauf eigentlich nicht sehen koennen." Das ist auch
       * schluessiger - ein Befehl ist Bedienung des Werkzeugs, keine
       * Nachricht an den Gegenueber.
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

  return NextResponse.json({
    ok: true,
    gespraech: fuerAnsicht(m, wer.admin, wer.id, await namensBuch()),
  });
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
