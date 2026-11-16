import type { Metadata } from 'next';
import RechtsSeite, { type RechtsText } from '@/app/components/RechtsSeite';

/*
 * Die Nutzungsbedingungen.
 *
 * Epic Games fragt bei der Anbindung neben der Datenschutzerklaerung auch nach den Nutzungsbedingungen. Sie sind
 * bewusst kurz und beschreiben, wie die Seite gedacht ist: Statistik zum Ansehen, ein Konto fuer persoenliche
 * Funktionen, VIP- und Pro-Bereiche mit eigenen Regeln.
 */

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: 'The rules for using CompHub.',
};

const KONTAKT = 'contact@thecomphub.com';

const EN: RechtsText = {
  titel: 'Terms of Use',
  stand: 'Last updated: 16 November 2026',
  einleitung:
    'These terms apply to CompHub (thecomphub.com). By using the site or creating an account you agree to them. How we '
    + 'handle personal data is described in the Privacy Policy.',
  abschnitte: [
    {
      titel: 'What CompHub is',
      absaetze: [
        'CompHub is a free, independent project that shows statistics, tournaments, tier lists and streams of competitive '
        + 'Fortnite. It is not affiliated with, endorsed by or sponsored by Epic Games. Fortnite and Epic Games are '
        + 'trademarks of Epic Games, Inc.; all other marks belong to their owners.',
      ],
    },
    {
      titel: 'Accounts',
      liste: [
        'You need an account only for personal features. You must give correct details and keep your sign-in safe.',
        'You are responsible for what happens under your account.',
        'Connecting your Epic Games account is optional. It must be your own account.',
        'We may block or delete accounts that break these terms or are used to harm the site or others.',
      ],
    },
    {
      titel: 'VIP, pro and manager access',
      absaetze: [
        'VIP, pro and manager access is granted by the operator, can be limited in time and can be withdrawn. Pros decide '
        + 'themselves who may watch their POV. Content that a pro shares is only for the viewers they approved: do not '
        + 'record, copy, re-stream or pass it on without the pro\'s permission.',
      ],
    },
    {
      titel: 'Rules',
      absaetze: ['Do not:'],
      liste: [
        'break, overload or probe the site or its servers, or try to access data or areas that are not meant for you',
        'use automated tools to collect large amounts of data from the site',
        'harass others, post unlawful content, or pretend to be someone else',
        'share or sell access that was given to you personally',
        'copy, scrape, mirror or republish our statistics, rankings, ratings, maps or other content in bulk, or use them to build or feed another site, app, database or AI model',
        'reverse engineer, decompile or copy the site\'s code, design, layout or our internal interfaces (APIs), or embed our pages in frames',
        'remove or hide our name, watermarks or the credit to a source shown on a map, image or export',
      ],
    },
    {
      titel: 'Our content and data',
      absaetze: [
        'The site, its code, design, texts, graphics, logos, videos, the selection and arrangement of the data and all statistics, '
        + 'ratings, rankings, predictions and maps we calculate are owned by CompHub or its licensors and are protected by '
        + 'copyright and database rights. Using the site gives you no rights to them beyond viewing them for your personal, '
        + 'non-commercial use.',
        'You may share single screenshots, images or exports for personal or editorial use (for example in a social media post) '
        + 'as long as CompHub stays visible as the source and nothing is changed to mislead. Any other use, in particular '
        + 'commercial use or systematic copying, needs our prior written permission.',
        'Content from third parties (for example map shapes or images) belongs to its owners and is credited where it is used.',
      ],
    },
    {
      titel: 'Content you send',
      absaetze: [
        'What you write or upload (messages, pictures, tier lists, settings) stays yours. You allow us to store and show it as '
        + 'needed to run the feature you used. We may remove content that breaks these terms.',
      ],
    },
    {
      titel: 'Accuracy of the statistics',
      absaetze: [
        'Statistics come from Epic Games, replays and community sources and can be incomplete or contain errors. Where a value '
        + 'is not available for a tournament, the site says so. We give no guarantee that the data is correct, complete or '
        + 'always available.',
      ],
    },
    {
      titel: 'Availability and liability',
      absaetze: [
        'The site is provided as it is and may change, be interrupted or be shut down at any time. We are not liable for '
        + 'damages from using the site, except where the law does not allow us to exclude liability (for example for intent, '
        + 'injury to life, body or health).',
      ],
    },
    {
      titel: 'Changes',
      absaetze: [
        'We may update these terms. The date at the top shows the current version. If you keep using the site after a change, '
        + 'you accept the new version.',
      ],
    },
    {
      titel: 'Contact',
      absaetze: [`Questions about these terms: ${KONTAKT}.`],
    },
  ],
};

const DE: RechtsText = {
  titel: 'Nutzungsbedingungen',
  stand: 'Stand: 16. November 2026',
  einleitung:
    'Diese Bedingungen gelten für CompHub (thecomphub.com). Mit der Nutzung der Seite oder der Anlage eines Kontos stimmst du '
    + 'ihnen zu. Wie wir mit personenbezogenen Daten umgehen, steht in der Datenschutzerklärung.',
  abschnitte: [
    {
      titel: 'Was CompHub ist',
      absaetze: [
        'CompHub ist ein kostenloses, unabhängiges Projekt, das Statistiken, Turniere, Tierlisten und Streams der '
        + 'kompetitiven Fortnite-Szene zeigt. Es ist nicht mit Epic Games verbunden und wird weder von Epic Games unterstützt '
        + 'noch gesponsert. Fortnite und Epic Games sind Marken von Epic Games, Inc.; alle übrigen Marken gehören ihren Inhabern.',
      ],
    },
    {
      titel: 'Konten',
      liste: [
        'Ein Konto brauchst du nur für persönliche Funktionen. Du musst richtige Angaben machen und deine Anmeldung schützen.',
        'Du bist für das verantwortlich, was unter deinem Konto geschieht.',
        'Die Verbindung deines Epic-Games-Kontos ist freiwillig. Es muss dein eigenes Konto sein.',
        'Wir dürfen Konten sperren oder löschen, die gegen diese Bedingungen verstoßen oder genutzt werden, um der Seite oder anderen zu schaden.',
      ],
    },
    {
      titel: 'VIP-, Pro- und Manager-Zugang',
      absaetze: [
        'VIP-, Pro- und Manager-Zugang vergibt der Betreiber; er kann befristet sein und wieder entzogen werden. Pros '
        + 'entscheiden selbst, wer ihr POV sehen darf. Was ein Pro teilt, ist nur für die Zuschauer bestimmt, die er '
        + 'freigegeben hat: Nimm es nicht auf, kopiere es nicht, streame es nicht weiter und gib es nicht ohne Erlaubnis des '
        + 'Pros weiter.',
      ],
    },
    {
      titel: 'Regeln',
      absaetze: ['Bitte nicht:'],
      liste: [
        'die Seite oder ihre Server stören, überlasten oder ausspähen oder auf Daten und Bereiche zugreifen, die nicht für dich bestimmt sind',
        'automatisierte Werkzeuge nutzen, um große Datenmengen von der Seite abzuziehen',
        'andere belästigen, rechtswidrige Inhalte veröffentlichen oder sich als jemand anderes ausgeben',
        'Zugänge weitergeben oder verkaufen, die dir persönlich gegeben wurden',
        'unsere Statistiken, Ranglisten, Ratings, Karten oder andere Inhalte in größerem Umfang kopieren, auslesen (Scraping), spiegeln oder neu veröffentlichen oder damit eine andere Seite, App, Datenbank oder ein KI-Modell aufbauen oder füttern',
        'den Code, das Design, das Layout oder unsere internen Schnittstellen (APIs) nachbauen, zurückentwickeln oder kopieren oder unsere Seiten in Frames einbetten',
        'unseren Namen, Wasserzeichen oder die Quellenangabe auf einer Karte, einem Bild oder Export entfernen oder verdecken',
      ],
    },
    {
      titel: 'Unsere Inhalte und Daten',
      absaetze: [
        'Die Seite, ihr Code, Design, Texte, Grafiken, Logos, Videos, die Auswahl und Anordnung der Daten sowie alle von uns '
        + 'berechneten Statistiken, Ratings, Ranglisten, Vorhersagen und Karten gehören CompHub oder seinen Lizenzgebern und sind '
        + 'durch Urheberrecht und Datenbankschutzrecht geschützt. Die Nutzung der Seite gibt dir daran keine Rechte außer dem '
        + 'Ansehen für den persönlichen, nicht kommerziellen Gebrauch.',
        'Einzelne Screenshots, Bilder oder Exporte darfst du für persönliche oder redaktionelle Zwecke teilen (etwa in einem '
        + 'Social-Media-Post), solange CompHub als Quelle sichtbar bleibt und nichts irreführend verändert wird. Jede andere '
        + 'Nutzung, besonders kommerzielle Nutzung oder systematisches Kopieren, braucht unsere vorherige schriftliche Erlaubnis.',
        'Inhalte Dritter (zum Beispiel Kartenformen oder Bilder) gehören ihren Inhabern und werden dort genannt, wo sie verwendet werden.',
      ],
    },
    {
      titel: 'Inhalte, die du sendest',
      absaetze: [
        'Was du schreibst oder hochlädst (Nachrichten, Bilder, Tierlisten, Einstellungen), bleibt deins. Du erlaubst uns, es zu '
        + 'speichern und anzuzeigen, soweit es für die genutzte Funktion nötig ist. Inhalte, die gegen diese Bedingungen '
        + 'verstoßen, dürfen wir entfernen.',
      ],
    },
    {
      titel: 'Richtigkeit der Statistik',
      absaetze: [
        'Die Statistiken stammen von Epic Games, aus Replays und aus Community-Quellen und können unvollständig sein oder '
        + 'Fehler enthalten. Fehlt ein Wert zu einem Turnier, sagt die Seite das. Wir gewährleisten nicht, dass die Daten '
        + 'richtig, vollständig oder immer verfügbar sind.',
      ],
    },
    {
      titel: 'Verfügbarkeit und Haftung',
      absaetze: [
        'Die Seite wird so bereitgestellt, wie sie ist, und kann sich ändern, unterbrochen oder jederzeit eingestellt werden. '
        + 'Wir haften nicht für Schäden aus der Nutzung der Seite, außer wo das Gesetz den Ausschluss nicht zulässt (etwa bei '
        + 'Vorsatz oder Verletzung von Leben, Körper oder Gesundheit).',
      ],
    },
    {
      titel: 'Änderungen',
      absaetze: [
        'Wir dürfen diese Bedingungen ändern. Das Datum oben zeigt die aktuelle Fassung. Nutzt du die Seite nach einer '
        + 'Änderung weiter, gilt die neue Fassung.',
      ],
    },
    {
      titel: 'Kontakt',
      absaetze: [`Fragen zu diesen Bedingungen: ${KONTAKT}.`],
    },
  ],
};

export default function Nutzungsbedingungen() {
  return (
    <RechtsSeite de={DE} en={EN}
      anderer={{ pfad: '/privacy', de: 'Datenschutzerklärung →', en: 'Privacy Policy →' }} />
  );
}
