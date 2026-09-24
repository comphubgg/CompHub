import crypto from 'crypto';
import { NextRequest, NextResponse, after } from 'next/server';
import {
  wechsleSchluessel, setzeSchluessel, zugangNach,
} from '@/lib/vipZugaenge';
import {
  beitragEinbettung, gemerkterKanal, schickeSchluessel,
  ticketOeffnen, ticketSchliessen,
  zugangFormular, zugangAnfrage, zugangEntscheiden, darfEntscheiden,
  anfrageAusNachricht, zugangChat, zugangNachricht, zugangLoeschen,
  type KnopfNachricht,
} from '@/lib/discord';

/*
 * Knopfdruecke aus Discord.
 *
 * Discord liefert jeden Klick auf einen Knopf als HTTP-Anfrage an eine
 * Adresse, die in der Anwendung hinterlegt ist ("Interactions Endpoint URL").
 * Diese Route ist diese Adresse. Sie beantwortet drei Dinge:
 *
 *   - den Anklopfversuch (Typ 1), mit dem Discord prueft, ob hier etwas
 *     antwortet,
 *   - den Knopf "Auf Deutsch lesen" unter den Aushaengen,
 *   - den Knopf "Generate a new key" unter einer Schluesselnachricht.
 *
 * ------------------------------------------------------------ Echtheit
 *
 * Die Adresse ist oeffentlich, jeder kann sie aufrufen. Massgeblich ist
 * deshalb allein die Unterschrift: Discord unterschreibt jede Anfrage mit
 * seinem Ed25519-Schluessel, und ohne gueltige Unterschrift wird hier nichts
 * getan. Ohne den oeffentlichen Schluessel in DISCORD_PUBLIC_KEY kann nichts
 * geprueft werden - dann lehnt diese Route jede Anfrage ab, und die Knoepfe
 * erscheinen gar nicht erst (siehe knoepfeMoeglich in lib/discord.ts).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Wie alt eine Anfrage sein darf, bevor sie als Wiedereinspielung gilt. */
const HOECHSTENS_ALT_MS = 5 * 60 * 1000;

/**
 * Den rohen Schluessel in eine Form bringen, die Node versteht.
 *
 * Discord nennt den oeffentlichen Schluessel als zweiunddreissig Bytes in
 * Hex. Node will ihn als SPKI; der Vorsatz davor ist fuer Ed25519 immer
 * derselbe und sagt nichts weiter als "was folgt, ist ein Ed25519-Schluessel".
 */
function alsSchluessel(hex: string) {
  const roh = Buffer.from(hex, 'hex');
  if (roh.length !== 32) throw new Error('Der öffentliche Schlüssel ist keine 32 Bytes.');
  const vorsatz = Buffer.from('302a300506032b6570032100', 'hex');
  return crypto.createPublicKey({
    key: Buffer.concat([vorsatz, roh]), format: 'der', type: 'spki',
  });
}

function unterschriftStimmt(roh: string, signatur: string, zeit: string): boolean {
  const oeffentlich = process.env.DISCORD_PUBLIC_KEY;
  if (!oeffentlich || !signatur || !zeit) return false;
  try {
    return crypto.verify(
      null, Buffer.from(zeit + roh, 'utf8'),
      alsSchluessel(oeffentlich), Buffer.from(signatur, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Ist der Endpunkt bereit?
 *
 * Ein Aufruf ohne Unterschrift wird - richtigerweise - immer abgewiesen, auch
 * wenn alles eingerichtet ist. Damit laesst sich von aussen nicht
 * unterscheiden, ob der oeffentliche Schluessel fehlt oder ob bloss niemand
 * unterschrieben hat. Genau diese Frage beantwortet dieser Weg, und sonst
 * keine: er sagt ja oder nein und nennt den Schluessel nicht.
 *
 * Im Browser aufrufbar: https://www.thecomphub.com/api/discord/interaktion
 */
export async function GET() {
  return NextResponse.json({
    bereit: Boolean(process.env.DISCORD_PUBLIC_KEY),
    hinweis: process.env.DISCORD_PUBLIC_KEY
      ? 'Der öffentliche Schlüssel liegt vor. Discord kann die Adresse jetzt prüfen.'
      : 'DISCORD_PUBLIC_KEY fehlt in dieser Umgebung — Discord wird die Adresse abweisen.',
  });
}

/** Eine Antwort, die nur der sieht, der gedrueckt hat. */
const nurFuerIhn = (text: string) => NextResponse.json({
  type: 4, data: { content: text, flags: 64 },
});

export async function POST(request: NextRequest) {
  /*
   * Der Text der Anfrage, unveraendert.
   *
   * Unterschrieben ist genau diese Zeichenfolge. Erst durch JSON.parse und
   * dann wieder zurueck ergibt sich eine andere - und die Pruefung schlaege
   * immer fehl.
   */
  const roh = await request.text();
  const signatur = request.headers.get('x-signature-ed25519') ?? '';
  const zeit = request.headers.get('x-signature-timestamp') ?? '';

  if (!unterschriftStimmt(roh, signatur, zeit)) {
    return new NextResponse('invalid request signature', { status: 401 });
  }
  const sekunden = Number(zeit);
  if (!Number.isFinite(sekunden)
    || Math.abs(Date.now() - sekunden * 1000) > HOECHSTENS_ALT_MS) {
    return new NextResponse('stale request', { status: 401 });
  }

  let d: {
    type?: number;
    application_id?: string;
    token?: string;
    channel_id?: string;
    /*
     * Wer gedrueckt hat.
     *
     * In einem Server steht die Person unter "member", in einer
     * Direktnachricht unter "user" - unsere Knoepfe stehen nur in Kanaelen,
     * aber beides zu lesen kostet nichts.
     */
    member?: { user?: { id?: string; username?: string; global_name?: string }; roles?: string[] };
    /** Die Nachricht, an der der Knopf haengt (auch beim Eingabefenster dazu). */
    message?: KnopfNachricht;
    user?: { id?: string; username?: string; global_name?: string };
    data?: {
      custom_id?: string;
      /*
       * Was in einem Eingabefenster stand.
       *
       * Discord schachtelt es doppelt: eine Zeile je Reihe, darin die
       * einzelnen Felder. Wir haben genau ein Feld, also genuegt das erste.
       */
      components?: Array<{ components?: Array<{ custom_id?: string; value?: string }> }>;
      /** Was in einer Auswahlliste angeklickt wurde. */
      values?: string[];
    };
  };
  try {
    d = JSON.parse(roh);
  } catch {
    return new NextResponse('bad body', { status: 400 });
  }

  // Typ 1: Discord klopft nur an.
  if (d.type === 1) return NextResponse.json({ type: 1 });

  // Typ 3 ist ein Knopf, Typ 5 ein abgeschicktes Eingabefenster.
  if (d.type !== 3 && d.type !== 5) return NextResponse.json({ type: 1 });

  const id = String(d.data?.custom_id ?? '');
  const nutzer = d.member?.user ?? d.user;

  /** Alle Felder eines abgeschickten Eingabefensters, nach custom_id. */
  const felderAus = (): Record<string, string> => {
    const raus: Record<string, string> = {};
    for (const zeile of d.data?.components ?? []) {
      for (const f of zeile.components ?? []) if (f.custom_id) raus[f.custom_id] = String(f.value ?? '');
    }
    return raus;
  };
  /** Die verzoegerte Antwort nachtragen - Discord gibt nur drei Sekunden. */
  const melde = async (text: string) => {
    if (!d.application_id || !d.token) return;
    await fetch(
      `https://discord.com/api/v10/webhooks/${d.application_id}/${d.token}/messages/@original`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text }) });
  };
  /*
   * Eine Arbeit nach der Antwort - und immer mit Rueckmeldung.
   *
   * Scheiterte etwas (etwa weil die Ablage nicht antwortet), blieb in Discord
   * vorher ewig "denkt nach ..." stehen. Jetzt steht dort, was los ist.
   */
  const danach = (arbeit: () => Promise<string>) => after(async () => {
    try {
      await melde(await arbeit());
    } catch (e) {
      console.error('[discord] Knopf gescheitert:', (e as Error).message);
      await melde('Storage is not answering right now - nothing was changed. Please try again in a minute.');
    }
  });
  /** Die Anfrage, wie sie in der Nachricht mit dem Knopf steht. */
  const ausNachricht = anfrageAusNachricht(d.message);

  /* ---------------------------------------------------- Get Access */
  // Der Knopf im Aushang: das Eingabefenster oeffnen.
  if (id === 'zugang:anfragen:vip' || id === 'zugang:anfragen:manager') {
    if (!nutzer?.id) return nurFuerIhn('I could not tell who pressed that.');
    return NextResponse.json(zugangFormular(id.endsWith('manager') ? 'manager' : 'vip'));
  }
  // Das ausgefuellte Fenster: ablegen und dem Admin zeigen.
  if (id.startsWith('zugang:formular:')) {
    if (!nutzer?.id) return nurFuerIhn('I could not tell who sent that.');
    const art = id.endsWith('manager') ? 'manager' : 'vip';
    const felder = felderAus();
    const wer = nutzer.global_name || nutzer.username || nutzer.id;
    after(async () => {
      const erg = await zugangAnfrage({ nutzerId: nutzer.id as string, nutzerName: wer, art, felder });
      await melde(erg.ok
        ? 'Thanks - your request is in. You get a direct message as soon as Juanito has decided.'
        : erg.grund === 'schon-offen' ? 'You already have an open request. Please wait for the answer.'
          : erg.grund === 'name' ? 'Please give a name with at least three letters or digits.'
            : 'That did not work. Please write to Juanito directly.');
    });
    return NextResponse.json({ type: 5, data: { flags: 64 } });
  }
  // Accept - nur der Admin.
  if (id.startsWith('zugang:ok:')) {
    if (!(await darfEntscheiden(nutzer, d.member?.roles ?? []))) return nurFuerIhn('Only the admin can decide this.');
    const anfrageId = id.slice('zugang:ok:'.length);
    const von = nutzer?.global_name || nutzer?.username || 'admin';
    danach(async () => (await zugangEntscheiden(anfrageId, true, von, '', ausNachricht)).text);
    return NextResponse.json({ type: 5, data: { flags: 64 } });
  }
  // Decline - erst der Grund (Fenster), dann die Entscheidung.
  if (id.startsWith('zugang:nein:')) {
    if (!(await darfEntscheiden(nutzer, d.member?.roles ?? []))) return nurFuerIhn('Only the admin can decide this.');
    const anfrageId = id.slice('zugang:nein:'.length);
    if (d.type === 3) {
      return NextResponse.json({
        type: 9,
        data: {
          custom_id: `zugang:nein:${anfrageId}`,
          title: 'Decline - why?',
          components: [{
            type: 1,
            components: [{ type: 4, custom_id: 'grund', label: 'Reason (the person gets it as a DM)', style: 2, min_length: 3, max_length: 600, required: true }],
          }],
        },
      });
    }
    const grund = felderAus().grund?.trim() || 'No reason given.';
    const von = nutzer?.global_name || nutzer?.username || 'admin';
    danach(async () => (await zugangEntscheiden(anfrageId, false, von, grund, ausNachricht)).text);
    return NextResponse.json({ type: 5, data: { flags: 64 } });
  }

  /*
   * Chat, Nachricht als CompHub, Zugang loeschen - nur der Admin.
   *
   * Der Betreiber (24.9.2026) wollte unter jeder Anfrage mit der Person
   * reden koennen - in einem Ticket-Chat oder als CompHub -, und einen
   * vergebenen Zugang mit Begruendung wieder wegnehmen.
   */
  if (id.startsWith('zugang:chat:')) {
    if (!(await darfEntscheiden(nutzer, d.member?.roles ?? []))) return nurFuerIhn('Only the admin can do this.');
    const anfrageId = id.slice('zugang:chat:'.length);
    danach(async () => (await zugangChat(anfrageId, ausNachricht)).text);
    return NextResponse.json({ type: 5, data: { flags: 64 } });
  }
  if (id.startsWith('zugang:dm:')) {
    if (!(await darfEntscheiden(nutzer, d.member?.roles ?? []))) return nurFuerIhn('Only the admin can do this.');
    const anfrageId = id.slice('zugang:dm:'.length);
    if (d.type === 3) {
      return NextResponse.json({
        type: 9,
        data: {
          custom_id: `zugang:dm:${anfrageId}`,
          title: 'Message as CompHub',
          components: [{
            type: 1,
            components: [{ type: 4, custom_id: 'text', label: 'Your message (sent by the CompHub bot)', style: 2, min_length: 2, max_length: 1800, required: true }],
          }],
        },
      });
    }
    const text = felderAus().text?.trim() ?? '';
    if (!text) return nurFuerIhn('The message was empty.');
    danach(async () => (await zugangNachricht(anfrageId, text, ausNachricht)).text);
    return NextResponse.json({ type: 5, data: { flags: 64 } });
  }
  if (id.startsWith('zugang:weg:')) {
    if (!(await darfEntscheiden(nutzer, d.member?.roles ?? []))) return nurFuerIhn('Only the admin can do this.');
    const anfrageId = id.slice('zugang:weg:'.length);
    if (d.type === 3) {
      return NextResponse.json({
        type: 9,
        data: {
          custom_id: `zugang:weg:${anfrageId}`,
          title: 'Delete this access - why?',
          components: [{
            type: 1,
            components: [{ type: 4, custom_id: 'grund', label: 'Reason (the person gets it as a DM)', style: 2, min_length: 3, max_length: 600, required: true }],
          }],
        },
      });
    }
    const grund = felderAus().grund?.trim() || 'No reason given.';
    const von = nutzer?.global_name || nutzer?.username || 'admin';
    danach(async () => (await zugangLoeschen(anfrageId, grund, von, ausNachricht)).text);
    return NextResponse.json({ type: 5, data: { flags: 64 } });
  }

  /* ------------------------------------------------------- Tickets */
  if (id === 'ticket:auf' || id.startsWith('ticket:art')) {
    if (!nutzer?.id) return nurFuerIhn('I could not tell who pressed that.');
    const wer = nutzer.global_name || nutzer.username || nutzer.id;
    const art = String(d.data?.values?.[0] ?? 'sonst');
    // Aus welchem Panel der Druck kam - die beiden fuehren zu verschiedenen
    // Kanaelen und verschiedenen Listen.
    const fuerManager = id.endsWith(':manager');

    /*
     * Erst antworten, dann den Kanal bauen.
     *
     * Einen Kanal anzulegen und die Begruessung hineinzuschreiben dauert
     * laenger als die drei Sekunden, die Discord zugesteht.
     */
    after(async () => {
      const melde = async (text: string) => {
        if (!d.application_id || !d.token) return;
        await fetch(
          `https://discord.com/api/v10/webhooks/${d.application_id}/${d.token}/messages/@original`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: text }),
          });
      };
      const erg = await ticketOeffnen(
        nutzer.id as string, wer, art, fuerManager);
      await melde(erg.ok && erg.kanal
        ? (erg.schonDa
          ? `You already have a ticket open: <#${erg.kanal}>`
          : `Your ticket is open: <#${erg.kanal}>`)
        : 'That did not work. Please write to Juanito directly.');
    });

    return NextResponse.json({ type: 5, data: { flags: 64 } });
  }

  if (id === 'ticket:zu') {
    if (!d.channel_id) return nurFuerIhn('I could not tell which ticket that is.');
    const kanal = d.channel_id;
    after(async () => {
      await ticketSchliessen(kanal);
    });
    /*
     * Eine sichtbare Antwort waere hier verkehrt: der Kanal, in dem sie
     * stuende, ist gleich weg. Also nur die Eingangsbestaetigung.
     */
    return NextResponse.json({ type: 5, data: { flags: 64 } });
  }

  /* ------------------------------------------------- Deutsch lesen */
  if (id.startsWith('sprache:')) {
    const [, sprache, schluessel] = id.split(':');
    const einbettung = beitragEinbettung(
      schluessel, sprache === 'de' ? 'de' : 'en');
    if (!einbettung) return nurFuerIhn('Diesen Text gibt es nicht mehr.');
    return NextResponse.json({
      type: 4, data: { embeds: [einbettung], flags: 64 },
    });
  }

  /* ------------------------------------------- Eigener Schluessel */
  if (id.startsWith('eigenerschluessel:')) {
    const name = id.slice('eigenerschluessel:'.length);

    const eigener = await gemerkterKanal(name, 'vip');
    if (!eigener || eigener !== d.channel_id) {
      return nurFuerIhn('This button does not belong to this channel.');
    }
    const zugang = await zugangNach(name);
    if (!zugang) return nurFuerIhn('This access no longer exists.');
    if (!zugang.darfSchluessel) {
      return nurFuerIhn(
        'You are not allowed to choose your own key — ask in support.');
    }

    /*
     * Erst der Knopf, dann das Fenster, dann die Eingabe.
     *
     * Auf den Knopf (Typ 3) antworten wir mit einem Eingabefenster; was
     * darin steht, kommt als eigene Anfrage (Typ 5) zurueck. Der Schluessel
     * geht dabei nie durch den Kanal - nur der Druckende sieht das Fenster.
     */
    if (d.type === 3) {
      return NextResponse.json({
        type: 9,
        data: {
          custom_id: `eigenerschluessel:${name}`,
          title: 'Your own access key',
          components: [{
            type: 1,
            components: [{
              type: 4,
              custom_id: 'wert',
              label: 'New key',
              style: 1,
              min_length: 6,
              max_length: 40,
              required: true,
              placeholder: 'letters, digits, dot, dash, underscore',
            }],
          }],
        },
      });
    }

    const wert = String(
      d.data?.components?.[0]?.components?.[0]?.value ?? '').trim();

    after(async () => {
      const melde = async (text: string) => {
        if (!d.application_id || !d.token) return;
        await fetch(
          `https://discord.com/api/v10/webhooks/${d.application_id}/${d.token}/messages/@original`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: text }),
          });
      };

      const erg = await setzeSchluessel(name, wert);
      if (!erg.ok || !erg.schluessel) {
        await melde(
          erg.grund === 'vergeben'
            ? 'Somebody else already uses that key. Please pick another one.'
            : erg.grund === 'nicht erlaubt'
              ? 'You are not allowed to choose your own key — ask in support.'
              : erg.grund === 'stillgelegt'
                ? 'This access is suspended.'
                /*
                 * Bei einem untauglichen Schluessel steht der Grund schon
                 * fertig da - er kommt aus derselben Pruefung, die auch das
                 * Werkzeug benutzt, und nennt genau das, was nicht stimmt.
                 */
                : erg.grund ?? 'That did not work. Please ask in support.');
        return;
      }

      const hin = await schickeSchluessel(name, erg.schluessel, 'vip', true, true);
      await melde(hin.ok
        ? 'Done — the message above now shows your own key.'
        : 'The key was set, but the message could not be replaced. Ask in support.');
    });

    return NextResponse.json({ type: 5, data: { flags: 64 } });
  }

  /* --------------------------------------------- Neuen Schluessel */
  if (id.startsWith('schluessel:')) {
    const name = id.slice('schluessel:'.length);

    /*
     * Gedrueckt werden darf nur im eigenen Kanal.
     *
     * Der Kanal eines Zugangs ist privat - wer ihn sieht, ist der Zugang
     * selbst oder ein Admin. Diese Pruefung haelt den Fall ab, dass jemand
     * die Kennung eines Knopfes abschreibt und ihn aus einem anderen Kanal
     * auslöst.
     */
    const eigener = await gemerkterKanal(name, 'vip');
    if (!eigener || eigener !== d.channel_id) {
      return nurFuerIhn('This button does not belong to this channel.');
    }

    const zugang = await zugangNach(name);
    if (!zugang) return nurFuerIhn('This access no longer exists.');

    /*
     * Erst antworten, dann arbeiten.
     *
     * Discord gibt drei Sekunden, und der Wechsel braucht laenger: Datei
     * lesen, schreiben, die alte Nachricht loeschen, die neue schicken. Also
     * geht sofort ein "einen Moment" hinaus, und der Rest laeuft danach - die
     * Antwort wird anschliessend ueber den Nachrichtenhaken ergaenzt.
     */
    after(async () => {
      const melde = async (text: string) => {
        if (!d.application_id || !d.token) return;
        await fetch(
          `https://discord.com/api/v10/webhooks/${d.application_id}/${d.token}/messages/@original`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: text }),
          });
      };

      const erg = await wechsleSchluessel(name, { ausDiscord: true });
      if (!erg.ok || !erg.schluessel) {
        await melde(
          erg.grund === 'nicht erlaubt'
            ? 'You are not allowed to change this key yourself — ask in support.'
            : erg.grund === 'manager'
              ? 'A manager key can only be changed by the operator: several '
                + 'people share it, and a new key would lock the others out.'
              : erg.grund === 'stillgelegt'
                ? 'This access is suspended.'
                : 'That did not work. Please ask in support.');
        return;
      }

      const hin = await schickeSchluessel(
        name, erg.schluessel, 'vip', true, Boolean(zugang.darfSchluessel));
      await melde(hin.ok
        ? 'Done — your new key is in the message above. The old one no longer works.'
        : 'The key was changed, but the message could not be replaced. Ask in support.');
    });

    return NextResponse.json({ type: 5, data: { flags: 64 } });
  }

  return nurFuerIhn('Unknown button.');
}
