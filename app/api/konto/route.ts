import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  aendern, anlegen, emailTaugt, ipGesperrt, kontoAus, loesche, merkeAnmeldung, nachName,
  merkeIp, nachEmail, nachId, oeffentlich, passwortStimmt, passwortTaugt,
  setzePasswort, SITZUNG_TAGE, sitzungFuer, vipBestaetigen,
  neuerBestaetigungsschluessel, eroeffneRuecksetzung, setzePasswortMitSchluessel,
} from '@/lib/konten';
import { sendeMail } from '@/lib/mail';
import { ueberHttps } from '@/lib/vipCookie';

// Registrieren, anmelden, abmelden - und wer gerade angemeldet ist.
//
//   GET                                    -> das eigene Konto oder null
//   POST { was: 'registrieren', … }        -> Konto anlegen und anmelden
//   POST { was: 'anmelden', … }            -> anmelden
//   POST { was: 'abmelden' }               -> Sitzung beenden
//   POST { was: 'aendern', … }             -> Name, Socials, Epic-Konto, Bild
//   POST { was: 'passwort', … }            -> Passwort setzen oder aendern
//   POST { was: 'loeschen', email }        -> Konto endgueltig entfernen
//
// Zwei Regeln, die der Nutzer ausdruecklich wollte:
//
//   - Wer sich anmeldet, ohne registriert zu sein, bekommt das klar gesagt
//     und wird zur Registrierung geschickt. Kein stilles Anlegen im
//     Hintergrund.
//   - Wer sich registriert, ist danach angemeldet. Ein zweites Formular
//     direkt nach dem ersten waere eine Schikane.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOKIE = 'streamer_dashboard_konto';

/**
 * Unter welcher Adresse das Werkzeug gerade erreicht wurde.
 *
 * Fuer die Links in den Mails. Fest eingetragen waere falsch: derselbe Server
 * antwortet unter thecomphub.com, unter localhost und auf dem Laptop, und ein
 * Link, der ins Leere fuehrt, ist schlimmer als gar keine Mail.
 */
function wurzel(request: Request): string {
  const host = request.headers.get('x-forwarded-host')
    || request.headers.get('host') || 'thecomphub.com';
  const daheim = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
  const schema = request.headers.get('x-forwarded-proto')?.split(',')[0].trim()
    || (daheim ? 'http' : 'https');
  return `${schema}://${host}`;
}

/** Die Mail, mit der jemand seine Adresse bestaetigt. */
async function schickeBestaetigung(
  request: Request, an: string, name: string, schluessel: string,
): Promise<boolean> {
  return sendeMail({
    an,
    betreff: 'Bestätige deine Adresse',
    text: `Hallo ${name || 'du'},\n\nein Klick, und dein Konto trägt den Haken. `
      + 'Der bringt dir keinen anderen Zugang, aber deine Meldungen im Support '
      + 'landen weiter oben — und wir wissen, dass wir dich erreichen können.',
    knopf: {
      titel: 'Adresse bestätigen',
      ziel: `${wurzel(request)}/api/konto/bestaetigen?schluessel=${schluessel}`,
    },
  });
}

/**
 * Der Anschluss der Anfrage.
 *
 * Hinter einem Tunnel oder Vermittler steht die echte Adresse im Kopf
 * "x-forwarded-for"; direkt am eigenen Rechner gibt es sie nicht, dann
 * bleibt das Feld leer und die Sperre greift nur ueber das Konto.
 */
function anschluss(request: Request): string {
  const kopf = request.headers.get('x-forwarded-for')
    ?? request.headers.get('x-real-ip') ?? '';
  return kopf.split(',')[0].trim();
}

async function setzeSitzung(
  antwort: NextResponse, kontoId: string, request?: Request,
) {
  antwort.cookies.set(COOKIE, sitzungFuer(kontoId), {
    httpOnly: true,
    sameSite: 'lax',
    /*
     * "secure" nur ueber HTTPS.
     *
     * Es hing am Betriebsmodus - und damit war die Anmeldung weg, sobald
     * jemand ueber die LAN-Adresse oder aus dem Fensterprogramm kam: beides
     * laeuft ueber http, und ein secure-Cookie nimmt der Browser dort nicht
     * an. Jetzt entscheidet die Verbindung selbst.
     */
    secure: request ? ueberHttps(request) : false,
    path: '/',
    maxAge: SITZUNG_TAGE * 24 * 3600,
  });
}

export async function GET() {
  const wert = (await cookies()).get(COOKIE)?.value;
  const id = kontoAus(wert);
  if (!id) return NextResponse.json({ angemeldet: false, konto: null });

  const konto = await nachId(id);
  if (!konto) return NextResponse.json({ angemeldet: false, konto: null });

  /*
   * Ein gesperrtes Konto gilt als abgemeldet - und zwar hier, an der
   * Auskunft, ueber die jede Seite fragt. So wirkt die Sperre ueberall
   * gleichzeitig, statt an jeder Stelle einzeln nachgetragen zu werden.
   */
  if (konto.gesperrt) {
    return NextResponse.json({
      angemeldet: false, konto: null, gesperrt: true,
    });
  }

  return NextResponse.json({ angemeldet: true, konto: oeffentlich(konto) });
}

export async function POST(request: Request) {
  const koerper = await request.json().catch(() => ({}));
  const was = String(koerper.was ?? '');

  /*
   * Ein gesperrter Anschluss darf sich nicht sofort ein neues Konto
   * anlegen. Das haelt niemanden auf Dauer auf - eine andere Leitung, ein
   * Mobilfunknetz, und er ist wieder da -, aber es macht den Weg zurueck
   * unbequem genug.
   */
  if (was === 'registrieren' && await ipGesperrt(anschluss(request))) {
    return NextResponse.json(
      { fehler: 'Von diesem Anschluss lässt sich kein Konto anlegen.' },
      { status: 403 });
  }

  /* ------------------------------------------------------------ abmelden */
  if (was === 'abmelden') {
    const antwort = NextResponse.json({ ok: true });
    antwort.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
    return antwort;
  }

  /* -------------------------------------------------------- registrieren */
  if (was === 'registrieren') {
    const email = String(koerper.email ?? '').trim();
    const passwort = String(koerper.passwort ?? '');
    const name = String(koerper.name ?? '').trim();

    if (!emailTaugt(email)) {
      return NextResponse.json(
        { fehler: 'Diese E-Mail-Adresse sieht nicht gültig aus.' }, { status: 400 });
    }
    const schwach = passwortTaugt(passwort);
    if (schwach) return NextResponse.json({ fehler: schwach }, { status: 400 });

    const ergebnis = await anlegen({ email, name, passwort });
    if ('fehler' in ergebnis) {
      return NextResponse.json({ fehler: ergebnis.fehler }, { status: 409 });
    }

    /*
     * Die Bestaetigung geht raus, aber sie haelt nichts auf.
     *
     * Wer sich registriert, ist angemeldet und kann sofort loslegen - auch
     * wenn die Mail im Spam landet oder der Versand gerade klemmt. Der Haken
     * ist eine Auszeichnung, keine Schranke.
     */
    let hinweis: string | null = null;
    if (!ergebnis.konto.bestaetigt && ergebnis.konto.bestaetigung) {
      const ging = await schickeBestaetigung(
        request, ergebnis.konto.email, ergebnis.konto.name,
        ergebnis.konto.bestaetigung);
      hinweis = ging
        ? 'Wir haben dir eine Mail geschickt — ein Klick darin, und du hast den Haken.'
        : 'Die Bestätigungsmail ging gerade nicht raus. Du kannst sie später '
          + 'unter „Mein Konto" erneut anfordern.';
    }

    const antwort = NextResponse.json({
      ok: true, konto: oeffentlich(ergebnis.konto), hinweis,
    });
    await setzeSitzung(antwort, ergebnis.konto.id);
    return antwort;
  }

  /* --------------------------------------------- Bestaetigung noch einmal */
  if (was === 'bestaetigung-neu') {
    const id = kontoAus((await cookies()).get(COOKIE)?.value);
    if (!id) return NextResponse.json({ fehler: 'nicht angemeldet' }, { status: 401 });
    const konto = await nachId(id);
    if (!konto) return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });
    if (konto.bestaetigt) return NextResponse.json({ ok: true, schon: true });

    const schluessel = await neuerBestaetigungsschluessel(id);
    if (!schluessel) return NextResponse.json({ ok: true, schon: true });
    const ging = await schickeBestaetigung(
      request, konto.email, konto.name, schluessel);
    return NextResponse.json({
      ok: ging,
      hinweis: ging
        ? 'Die Mail ist unterwegs.'
        : 'Der Versand klemmt gerade. Versuch es in ein paar Minuten noch einmal.',
    });
  }

  /* ------------------------------------------------ Passwort zuruecksetzen */
  if (was === 'reset-anfordern') {
    const wen = String(koerper.email ?? '').trim();
    const konto = wen.includes('@') ? await nachEmail(wen) : await nachName(wen);

    /*
     * Immer dieselbe Antwort, ob es das Konto gibt oder nicht.
     *
     * Anders als beim Anmelden - dort ist "kein Konto" eine Hilfe, hier waere
     * es eine Auskunft an jeden, der Adressen durchprobiert. Wer sein eigenes
     * Konto sucht, bekommt die Mail; wer fremde sucht, erfaehrt nichts.
     */
    if (konto) {
      const schluessel = await eroeffneRuecksetzung(konto.id);
      if (schluessel) {
        await sendeMail({
          an: konto.email,
          betreff: 'Neues Passwort setzen',
          text: `Hallo ${konto.name || 'du'},\n\njemand - hoffentlich du - möchte `
            + 'das Passwort für dieses Konto neu setzen. Der Link gilt eine Stunde.\n\n'
            + 'Warst du das nicht, brauchst du nichts zu tun. Ohne den Link '
            + 'ändert sich nichts.',
          knopf: {
            titel: 'Neues Passwort setzen',
            ziel: `${wurzel(request)}/passwort?schluessel=${schluessel}`,
          },
        });
      }
    }
    return NextResponse.json({
      ok: true,
      hinweis: 'Wenn es zu dieser Angabe ein Konto gibt, ist die Mail unterwegs.',
    });
  }

  if (was === 'reset-setzen') {
    const schluessel = String(koerper.schluessel ?? '').trim();
    const passwort = String(koerper.passwort ?? '');
    const ergebnis = await setzePasswortMitSchluessel(schluessel, passwort);
    if ('fehler' in ergebnis) {
      return NextResponse.json({ fehler: ergebnis.fehler }, { status: 400 });
    }
    const antwort = NextResponse.json({ ok: true, konto: oeffentlich(ergebnis.konto) });
    await setzeSitzung(antwort, ergebnis.konto.id);
    return antwort;
  }

  /* ------------------------------------------------------------ anmelden */
  if (was === 'anmelden') {
    const email = String(koerper.email ?? '').trim();
    const passwort = String(koerper.passwort ?? '');

    /*
     * Adresse oder Name - beides geht.
     *
     * Wer sich ein Konto anlegt, merkt sich seinen Namen; die Adresse tippt
     * er seltener. Ein Eingabefeld, das nur eines von beidem annimmt, sperrt
     * ihn aus, obwohl er alles richtig gemacht hat. Ein Klammeraffe im Text
     * entscheidet, wonach gesucht wird.
     */
    const konto = email.includes('@')
      ? await nachEmail(email)
      : (await nachName(email)) ?? await nachEmail(email);
    if (!konto) {
      // Ausdruecklich benannt statt verschleiert: der Nutzer wollte, dass
      // klar dasteht, wenn es kein Konto gibt. Das verraet zwar, welche
      // Adressen registriert sind - fuer ein Werkzeug dieser Groesse ist
      // die verstaendliche Meldung das Wichtigere.
      return NextResponse.json({
        fehler: email.includes('@')
          ? 'Zu dieser Adresse gibt es kein Konto. Bitte erst registrieren.'
          : 'Diesen Namen kennt niemand hier. Versuch es mit deiner E-Mail-Adresse.',
        keinKonto: true,
      }, { status: 404 });
    }
    if (!konto.passwort) {
      return NextResponse.json({
        fehler: 'Dieses Konto wurde über einen Anmeldedienst angelegt. '
          + 'Bitte darüber anmelden.',
      }, { status: 400 });
    }
    if (!passwortStimmt(passwort, konto.passwort)) {
      return NextResponse.json({ fehler: 'Passwort stimmt nicht.' }, { status: 401 });
    }
    if (konto.gesperrt) {
      return NextResponse.json(
        { fehler: 'Dieses Konto ist gesperrt.' }, { status: 403 });
    }

    await merkeAnmeldung(konto.id);
    await merkeIp(konto.id, anschluss(request));
    const antwort = NextResponse.json({ ok: true, konto: oeffentlich(konto) });
    await setzeSitzung(antwort, konto.id, request);
    return antwort;
  }

  /* -------------------------------------------------------------- aendern */
  if (was === 'aendern') {
    const id = kontoAus((await cookies()).get(COOKIE)?.value);
    if (!id) return NextResponse.json({ fehler: 'nicht angemeldet' }, { status: 401 });

    const aenderung: Record<string, unknown> = {};
    if (typeof koerper.name === 'string') {
      aenderung.name = koerper.name.trim().slice(0, 40);
    }
    if (koerper.socials && typeof koerper.socials === 'object') {
      // Nur die bekannten Felder, und nur als kurze Zeichenketten - hier
      // landet sonst, was immer jemand hineinschreibt.
      const erlaubt = ['twitch', 'x', 'youtube', 'tiktok', 'discord'];
      const socials: Record<string, string> = {};
      for (const [k, v] of Object.entries(koerper.socials as Record<string, unknown>)) {
        if (erlaubt.includes(k) && typeof v === 'string' && v.trim()) {
          socials[k] = v.trim().replace(/^@/, '').slice(0, 60);
        }
      }
      aenderung.socials = socials;
    }
    /*
     * Die Verknuepfung zum Epic-Konto vergibt der Betreiber, nicht der Spieler.
     *
     * Vorher konnte sich jeder eine beliebige Konto-Id eintragen - also auch
     * die eines bekannten Spielers, und haette damit dessen Zahlen als eigene
     * gezeigt und sich auf einer Turnierkarte an dessen Stelle setzen koennen.
     * Vergeben wird sie deshalb nur ueber die Kontoverwaltung.
     */
    if (typeof koerper.epicId === 'string') {
      return NextResponse.json(
        { fehler: 'Das Epic-Konto wird vom Betreiber zugewiesen.' },
        { status: 403 });
    }

    /* Gespeicherte Banner-Vorlagen - hoechstens zwanzig. */
    if (Array.isArray(koerper.bannerVorlagen)) {
      aenderung.bannerVorlagen = (koerper.bannerVorlagen as Array<unknown>)
        .flatMap((e) => {
          const x = e as Record<string, unknown>;
          const txt = (v: unknown, max: number) =>
            (typeof v === 'string' ? v.trim().slice(0, max) : '');
          const zahl = (v: unknown, min: number, max: number, weich: number) => {
            const n = Number(v);
            return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : weich;
          };
          const id = txt(x.id, 40);
          const titel = txt(x.titel, 60);
          if (!id || !titel) return [];
          const ids = Array.isArray(x.ids)
            ? (x.ids as unknown[]).flatMap((v) => {
              const s2 = txt(v, 32).toLowerCase();
              return /^[0-9a-f]{32}$/.test(s2) ? [s2] : [];
            }).slice(0, 2) : [];
          const namen = Array.isArray(x.namen)
            ? (x.namen as unknown[]).map((v) => txt(v, 40)).slice(0, 2) : [];
          return [{
            id, titel, region: txt(x.region, 8).toUpperCase() || 'EU',
            ids, namen,
            vorlage: txt(x.vorlage, 20) || 'nacht',
            klar: zahl(x.klar, 0, 100, 92),
            hoehe: zahl(x.hoehe, 60, 220, 108),
          }];
        })
        .slice(0, 20);
    }

    /* Zuletzt nachgeschlagene Spieler - hoechstens acht, neueste zuerst. */
    if (Array.isArray(koerper.spielerVerlauf)) {
      const gesehen = new Set<string>();
      aenderung.spielerVerlauf = (koerper.spielerVerlauf as Array<unknown>)
        .flatMap((e) => {
          const x = e as { id?: unknown; name?: unknown };
          const id = typeof x.id === 'string' ? x.id.trim().toLowerCase() : '';
          const name = typeof x.name === 'string' ? x.name.trim().slice(0, 60) : '';
          if (!/^[0-9a-f]{32}$/.test(id) || !name || gesehen.has(id)) return [];
          gesehen.add(id);
          return [{ id, name }];
        })
        .slice(0, 8);
    }
    if (typeof koerper.bild === 'string' || koerper.bild === null) {
      /*
       * Das Bild kommt als data:-Adresse herein, im Browser schon auf 256
       * Pixel verkleinert. Zwei Schranken: nur Bilddaten, und hoechstens
       * 300 KB. Ohne die erste liesse sich beliebiger Inhalt als Bild
       * hinterlegen, ohne die zweite waechst die Kontodatei ungebremst.
       */
      const bild = koerper.bild === null ? '' : String(koerper.bild);
      if (bild && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(bild)) {
        return NextResponse.json(
          { fehler: 'Das war kein Bild.' }, { status: 400 });
      }
      if (bild.length > 300_000) {
        return NextResponse.json(
          { fehler: 'Das Bild ist zu groß — bitte ein kleineres wählen.' },
          { status: 400 });
      }
      aenderung.bild = bild || undefined;
    }

    const konto = await aendern(id, aenderung);
    if (!konto) return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });
    return NextResponse.json({ ok: true, konto: oeffentlich(konto) });
  }

  /* --------------------------------------------------------- vip gesehen */
  if (was === 'vipGesehen') {
    const id = kontoAus((await cookies()).get(COOKIE)?.value);
    if (!id) return NextResponse.json({ fehler: 'nicht angemeldet' }, { status: 401 });
    await vipBestaetigen(id);
    return NextResponse.json({ ok: true });
  }

  /* ------------------------------------------------------------- passwort */
  if (was === 'passwort') {
    const id = kontoAus((await cookies()).get(COOKIE)?.value);
    if (!id) return NextResponse.json({ fehler: 'nicht angemeldet' }, { status: 401 });

    const ergebnis = await setzePasswort(
      id, String(koerper.neu ?? ''),
      typeof koerper.alt === 'string' ? koerper.alt : undefined);
    if ('fehler' in ergebnis) {
      return NextResponse.json({ fehler: ergebnis.fehler }, { status: 400 });
    }
    const konto = await nachId(id);
    return NextResponse.json({ ok: true, konto: konto ? oeffentlich(konto) : null });
  }

  /* ------------------------------------------------------------- loeschen */
  if (was === 'loeschen') {
    const id = kontoAus((await cookies()).get(COOKIE)?.value);
    if (!id) return NextResponse.json({ fehler: 'nicht angemeldet' }, { status: 401 });

    const konto = await nachId(id);
    if (!konto) return NextResponse.json({ fehler: 'nicht gefunden' }, { status: 404 });

    /*
     * Die eigene Adresse muss abgetippt werden. Es gibt keinen Papierkorb -
     * ein versehentlicher Klick waere unumkehrbar, und ein blosses
     * "Wirklich?" klickt sich zu leicht weg.
     */
    const getippt = String(koerper.email ?? '').trim().toLowerCase();
    if (getippt !== konto.email) {
      return NextResponse.json(
        { fehler: 'Die eingegebene Adresse stimmt nicht mit dem Konto überein.' },
        { status: 400 });
    }

    await loesche(id);
    const antwort = NextResponse.json({ ok: true });
    antwort.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
    return antwort;
  }

  return NextResponse.json({ fehler: 'unbekannte Anfrage' }, { status: 400 });
}
