import nodemailer, { type Transporter } from 'nodemailer';

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
}

/**
 * Eine Mail im Aussehen des Werkzeugs.
 *
 * Bewusst schlicht gehalten: Postfaecher zeigen HTML sehr unterschiedlich an,
 * und was in einem Browser gut aussieht, faellt in Outlook auseinander. Ein
 * dunkler Kasten, eine Ueberschrift, ein Absatz, ein Knopf - mehr traegt
 * ueberall.
 */
function bauHtml(b: Brief): string {
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
    <tr><td style="padding:28px 32px 0 32px;">
      <span style="font-size:18px;font-weight:800;letter-spacing:-0.5px;">
        <span style="color:#0ea5e9;">COMP</span><span style="color:#f4f4f5;">HUB</span>
      </span>
    </td></tr>
    <tr><td style="padding:20px 32px 0 32px;color:#e4e4e7;font-size:15px;
                   font-weight:600;">${b.betreff}</td></tr>
    <tr><td style="padding:10px 32px 0 32px;color:#a1a1aa;font-size:14px;
                   line-height:1.7;">${b.text.replace(/\n/g, '<br>')}</td></tr>
    ${knopf}
    <tr><td style="padding:24px 32px 28px 32px;border-top:1px solid #18181b;
                   color:#52525b;font-size:11px;line-height:1.6;">
      Diese Nachricht kommt von CompHub. Antworten gehen an
      ${process.env.MAIL_ANTWORT || 'help@thecomphub.com'}.<br>
      Wenn du damit nichts anfangen kannst, ignorier sie einfach — dann hat
      jemand deine Adresse falsch eingetippt.
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
  try {
    await hole().sendMail({
      from: process.env.MAIL_VON || process.env.MAIL_USER,
      replyTo: process.env.MAIL_ANTWORT || undefined,
      to: b.an,
      subject: b.betreff,
      text: b.knopf ? `${b.text}\n\n${b.knopf.titel}: ${b.knopf.ziel}` : b.text,
      html: bauHtml(b),
    });
    return true;
  } catch (e) {
    // Nur in die Serverausgabe, nicht zum Nutzer: die Meldung eines
    // Postamtes nennt manchmal Kontodaten.
    console.error('[mail] Versand fehlgeschlagen:', (e as Error).message);
    return false;
  }
}
