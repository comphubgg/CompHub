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
  title: 'Terms of Use — CompHub',
  description: 'The rules for using CompHub.',
};

const KONTAKT = 'contact@thecomphub.com';

const EN: RechtsText = {
  titel: 'Terms of Use',
  stand: 'Last updated: 12 October 2026',
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
  stand: 'Stand: 12. Oktober 2026',
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
