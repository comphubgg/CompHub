import nodemailer, { type Transporter } from 'nodemailer';
import fs from 'fs';
import path from 'path';

/*
 * Mail verschicken.
 *
 * Lange ging das gar nicht: Cloudflare Email Routing kann Post nur
 * entgegennehmen und weiterleiten, nicht versenden. Deshalb stand im
 * Kontobereich jahrelang der Satz "der Versand ist noch nicht eingerichtet" -
 * und niemand konnte seine Adresse bestaetigen oder ein Passwort zuruecksetzen.
 *
 * Verschickt wird jetzt ueber das Gmail-Konto des Werkzeugs, mit einem
 * App-Passwort. Das ist ein zweites Passwort, das ausschliesslich Mail
 * verschicken darf und sich einzeln widerrufen laesst; das eigentliche
 * Kontopasswort bleibt aus dem Spiel.
 *
 * Der Absender ist das Gmail und nicht "no-reply@thecomphub.com". Unter
 * fremdem Namen zu schreiben laesst Google nicht zu, und ein gefaelschter
 * Absender landet ohnehin im Spam. Geantwortet wird an help@thecomphub.com -
 * das laeuft ueber Cloudflare in dasselbe Postfach.
 */

/** Ist der Versand ueberhaupt eingerichtet? */
export function versandDa(): boolean {
  return Boolean(process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS);
}

let versender: Transporter | null = null;

function hole() {
  if (versender) return versender;
  versender = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT ?? 465),
    // 465 spricht von der ersten Zeile an verschluesselt, 587 handelt es aus.
    secure: Number(process.env.MAIL_PORT ?? 465) === 465,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });
  return versender;
}

export interface Brief {
  an: string;
  betreff: string;
  /** Der Fliesstext. Aus ihm entsteht die einfache Fassung der Mail. */
  text: string;
  /** Ein Knopf am Ende - Beschriftung und Ziel. */
  knopf?: { titel: string; ziel: string };
  /*
   * Angaben als Tabelle - Absender, Thema, Zeitpunkt.
   *
   * Fuer Meldungen aus dem Werkzeug: wer sie im Postfach sieht, soll auf einen
   * Blick wissen, worum es geht und von wem, ohne den Fliesstext zu lesen.
   */
  angaben?: Array<{ was: string; wert: string }>;
  /** Ein Etikett oben, etwa das Thema einer Meldung. */
  etikett?: string;
  /** Der eigentliche Text der Meldung, abgesetzt vom Rest. */
  zitat?: string;
  /** Absender fuer die Antwort - ueberschreibt MAIL_ANTWORT. */
  antwortAn?: string;
  /*
   * Dateien, die mitgehen.
   *
   * Bei einer Meldung sind das die Bildschirmausschnitte. Sie stehen bewusst
   * als Anhang und nicht im Text: im Text muessten sie von einer Adresse
   * geladen werden, die nur Angemeldete sehen duerfen - dort erschiene beim
   * Betreiber ein leerer Rahmen. Als Anhang liegen sie im Postfach und sind
   * mit einem Klick da.
   */
  anhaenge?: Array<{ name: string; pfad: string }>;
}

/**
 * Wohin Meldungen aus dem Werkzeug gehen.
 *
 * Direkt ans Postfach und nicht ueber help@thecomphub.com: eine Mail, die
 * unterwegs weitergeleitet wird, verliert ihren Nachweis beim Absender und
 * landet bei Gmail regelmaessig im Spam. Der Umweg brachte hier nichts - der
 * Betreiber liest ohnehin dasselbe Postfach.
 */
export function betreiberAdresse(): string {
  return process.env.MAIL_BETREIBER || process.env.MAIL_USER || '';
}

/**
 * Eine Mail im Aussehen des Werkzeugs.
 *
 * Bewusst schlicht gehalten: Postfaecher zeigen HTML sehr unterschiedlich an,
 * und was in einem Browser gut aussieht, faellt in Outlook auseinander. Ein
 * dunkler Kasten, eine Ueberschrift, ein Absatz, ein Knopf - mehr traegt
 * ueberall.
 */
/*
 * Das Zeichen im Kopf der Mail.
 *
 * Es hing als Verweis auf thecomphub.com und blieb deshalb leer: die Datei
 * ist zwar erreichbar (geprueft, 200), aber Postfaecher laden entfernte
 * Bilder standardmaessig nicht - bei einem unbekannten Absender schon gar
 * nicht. Im Posteingang stand also ein leerer Rahmen, wo das Logo sein
 * sollte.
 *
 * Deshalb reist es jetzt als eingebetteter Anhang mit und wird ueber
 * "cid:" angesprochen. Das zeigt jedes Programm ohne Rueckfrage, weil
 * nichts nachgeladen werden muss.
 *
 * Genommen wird die 96-Pixel-Fassung: sie wiegt 5,6 KB statt 195, und
 * angezeigt werden ohnehin 34 Pixel - auf einem feinen Bildschirm also
 * knapp das Dreifache und damit scharf.
 */
const ZEICHEN_DATEI = 'public/social/comphub-profilbild-dunkel-probe-96.png';
const ZEICHEN_ID = 'comphub-zeichen';

/** Das Zeichen als Anhang - oder nichts, wenn die Datei fehlt. */
function zeichenAnhang(): { filename: string; path: string; cid: string;
  contentDisposition: 'inline' } | null {
  try {
    const pfad = path.join(process.cwd(), ZEICHEN_DATEI);
    if (!fs.existsSync(pfad)) return null;
    return {
      filename: 'comphub.png', path: pfad, cid: ZEICHEN_ID,
      contentDisposition: 'inline',
    };
  } catch { return null; }
}

function bauHtml(b: Brief, mitZeichen: boolean): string {
  /*
   * Der Kopf der Mail.
   *
   * Der Name steht daneben als Schrift und nicht als Teil des Bildes: faellt
   * das Zeichen doch einmal aus, steht dort immer noch "COMPHUB" statt eines
   * leeren Kastens.
   */
  const banner = `
    <tr><td style="padding:0;">
      <div style="background:#0b0b0e;border-bottom:1px solid #18181b;
                  padding:22px 32px;text-align:left;">
        ${mitZeichen ? `<img src="cid:${ZEICHEN_ID}"
             width="34" height="34" alt="CompHub"
             style="vertical-align:middle;border-radius:8px;" />` : ''}
        <span style="vertical-align:middle;margin-left:10px;font-size:17px;
                     font-weight:800;letter-spacing:-0.5px;">
          <span style="color:#0ea5e9;">COMP</span><span style="color:#f4f4f5;">HUB</span>
        </span>
      </div>
    </td></tr>`;

  const etikett = b.etikett ? `
    <tr><td style="padding:22px 32px 0 32px;">
      <span style="display:inline-block;background:rgba(14,165,233,0.14);
                   border:1px solid rgba(14,165,233,0.4);color:#7dd3fc;
                   font-size:11px;font-weight:700;letter-spacing:1px;
                   text-transform:uppercase;padding:5px 11px;border-radius:999px;">
        ${b.etikett}</span>
    </td></tr>` : '';

  const angaben = b.angaben?.length ? `
    <tr><td style="padding:18px 32px 0 32px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"
             width="100%" style="border:1px solid #27272a;border-radius:12px;
                                 overflow:hidden;">
        ${b.angaben.map((z, i) => `
          <tr style="background:${i % 2 ? '#0e0e12' : '#111116'};">
            <td style="padding:10px 14px;color:#71717a;font-size:12px;
                       width:34%;white-space:nowrap;">${z.was}</td>
            <td style="padding:10px 14px;color:#e4e4e7;font-size:13px;
                       font-weight:600;">${z.wert}</td>
          </tr>`).join('')}
      </table>
    </td></tr>` : '';

  const zitat = b.zitat ? `
    <tr><td style="padding:18px 32px 0 32px;">
      <div style="border-left:3px solid #0ea5e9;background:#0e0e12;
                  padding:14px 16px;border-radius:0 10px 10px 0;
                  color:#d4d4d8;font-size:14px;line-height:1.7;
                  white-space:pre-wrap;">${b.zitat}</div>
    </td></tr>` : '';

  const knopf = b.knopf ? `
    <tr><td style="padding:24px 32px 8px 32px;">
      <a href="${b.knopf.ziel}"
         style="display:inline-block;background:#0ea5e9;color:#ffffff;
                text-decoration:none;font-weight:600;font-size:14px;
                padding:12px 24px;border-radius:10px;">${b.knopf.titel}</a>
    </td></tr>
    <tr><td style="padding:0 32px 8px 32px;color:#71717a;font-size:11px;
                   line-height:1.6;">
      Wenn der Knopf nicht geht, diese Adresse in den Browser kopieren:<br>
      <span style="color:#38bdf8;word-break:break-all;">${b.knopf.ziel}</span>
    </td></tr>` : '';

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#09090b;
                   font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"
         style="max-width:520px;margin:0 auto;background:#0c0c0f;
                border:1px solid #27272a;border-radius:16px;">
    ${banner}
    ${etikett}
    <tr><td style="padding:18px 32px 0 32px;color:#f4f4f5;font-size:17px;
                   font-weight:700;line-height:1.4;">${b.betreff}</td></tr>
    <tr><td style="padding:10px 32px 0 32px;color:#a1a1aa;font-size:14px;
                   line-height:1.7;">${b.text.replace(/\n/g, '<br>')}</td></tr>
    ${angaben}
    ${zitat}
    ${knopf}
    <tr><td style="padding:24px 32px 28px 32px;border-top:1px solid #18181b;
                   color:#52525b;font-size:11px;line-height:1.6;">
      This message is from CompHub. Replies go to
      ${process.env.MAIL_ANTWORT || 'help@thecomphub.com'}.<br>
      If it means nothing to you, just ignore it — then someone mistyped
      their address.
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Verschicken.
 *
 * Wirft nie. Eine fehlgeschlagene Mail darf keine Registrierung platzen
 * lassen: das Konto ist angelegt, die Bestaetigung kann man erneut anfordern.
 * Zurueck kommt nur, ob es geklappt hat - der Aufrufer entscheidet, was er
 * dem Nutzer sagt.
 */
export async function sendeMail(b: Brief): Promise<boolean> {
  if (!versandDa()) return false;
  const zeichen = zeichenAnhang();
  try {
    await hole().sendMail({
      from: process.env.MAIL_VON || process.env.MAIL_USER,
      replyTo: b.antwortAn || process.env.MAIL_ANTWORT || undefined,
      to: b.an,
      subject: b.betreff,
      text: b.knopf ? `${b.text}\n\n${b.knopf.titel}: ${b.knopf.ziel}` : b.text,
      html: bauHtml(b, Boolean(zeichen)),
      /*
       * Das Zeichen zuerst, dann die mitgeschickten Bilder. Der Anhang des
       * Zeichens traegt eine Content-Id und wird deshalb im Text angezeigt
       * statt unten als Datei angehaengt.
       */
      attachments: [
        ...(zeichen ? [zeichen] : []),
        ...(b.anhaenge?.map((a) => ({ filename: a.name, path: a.pfad })) ?? []),
      ],
    });
    return true;
  } catch (e) {
    // Nur in die Serverausgabe, nicht zum Nutzer: die Meldung eines
    // Postamtes nennt manchmal Kontodaten.
    console.error('[mail] Versand fehlgeschlagen:', (e as Error).message);
    return false;
  }
}
