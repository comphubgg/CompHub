/*
 * Die Fehlerseiten der Seite (Betreiber, 14.10.2026): fuer jeden Fehler eine eigene Seite mit dem Logo, einer Entschuldigung und der
 * Einladung in den Discord - statt der schwarzen Standardseite von Next. Hier stehen die Texte je Code; angezeigt werden sie von
 * app/components/FehlerSeite. Die Texte sind deutsch geschrieben und laufen wie alles andere durch die Uebersetzung.
 */

export interface FehlerArt { titel: string; text: string }

export const FEHLER: Record<number, FehlerArt> = {
  400: { titel: 'Das haben wir nicht verstanden', text: 'Die Anfrage war unvollständig oder fehlerhaft. Lade die Seite neu oder starte noch einmal von der Startseite.' },
  401: { titel: 'Bitte melde dich an', text: 'Diese Seite ist nur für angemeldete Konten. Melde dich an und versuche es noch einmal.' },
  403: { titel: 'Hier kommst du nicht rein', text: 'Dieser Bereich ist für andere Konten gedacht — zum Beispiel nur für VIPs, Teams oder den Admin. Glaubst du, das ist ein Fehler, schreib uns im Discord.' },
  404: { titel: 'Diese Seite gibt es nicht', text: 'Der Link ist vielleicht veraltet oder hat einen Tippfehler. Es liegt nicht an dir.' },
  405: { titel: 'So geht das nicht', text: 'Diese Adresse nimmt diese Art von Anfrage nicht an. Öffne die Seite einfach über die Navigation.' },
  408: { titel: 'Das hat zu lange gedauert', text: 'Die Verbindung war zu langsam, und die Anfrage ist abgelaufen. Versuche es noch einmal.' },
  410: { titel: 'Diese Seite ist weg', text: 'Es gab sie einmal, aber wir haben sie entfernt.' },
  413: { titel: 'Das ist zu groß', text: 'Die Datei oder Eingabe ist größer, als wir annehmen können. Versuche es mit einer kleineren.' },
  429: { titel: 'Etwas zu schnell', text: 'Du hast in kurzer Zeit sehr viele Anfragen geschickt. Warte einen Moment und versuche es dann noch einmal.' },
  500: { titel: 'Bei uns ist etwas schiefgelaufen', text: 'Das ist unser Fehler, nicht deiner. Wir bekommen die Meldung automatisch und kümmern uns darum. Versuche es gleich noch einmal.' },
  502: { titel: 'Die Verbindung ist abgebrochen', text: 'Ein Dienst hinter der Seite hat gerade nicht geantwortet. Meist ist das nach wenigen Minuten wieder vorbei.' },
  503: { titel: 'Wir sind gleich wieder da', text: 'Die Seite wird gerade gewartet oder ist überlastet. Versuche es in ein paar Minuten noch einmal.' },
  504: { titel: 'Die Antwort kam nicht rechtzeitig', text: 'Ein Dienst hat zu lange gebraucht. Versuche es noch einmal.' },
};

/** Alle Codes, fuer die es eine eigene Seite gibt. */
export const FEHLER_CODES = Object.keys(FEHLER).map(Number);
