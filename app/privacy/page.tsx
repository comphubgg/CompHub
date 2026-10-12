import type { Metadata } from 'next';
import RechtsSeite, { type RechtsText } from '@/app/components/RechtsSeite';

/*
 * Die Datenschutzerklaerung.
 *
 * Der Betreiber (12.10.2026): Epic Games verlangt fuer die Anbindung eine Adresse der Datenschutzerklaerung. Der
 * Text beschreibt, was das Werkzeug tatsaechlich speichert und wohin es Daten gibt - nicht mehr und nicht weniger.
 * Wer etwas Neues speichert (ein neuer Anmeldedienst, ein neues Feld am Konto), ergaenzt ihn hier mit.
 */

export const metadata: Metadata = {
  title: 'Privacy Policy — CompHub',
  description: 'What CompHub stores about you, why, and how to have it deleted.',
};

const KONTAKT = 'contact@thecomphub.com';

const EN: RechtsText = {
  titel: 'Privacy Policy',
  stand: 'Last updated: 12 October 2026',
  einleitung:
    'CompHub (thecomphub.com) shows statistics, tournaments and streams of competitive Fortnite. This page explains which '
    + 'personal data we process, for what purpose, who receives it and which rights you have. Most of the site works without '
    + 'an account. Data is only collected where described below.',
  abschnitte: [
    {
      titel: 'Who is responsible',
      absaetze: [
        `The operator of CompHub is responsible for the processing described here. You reach the operator at ${KONTAKT} `
        + 'or through the contact form on the site (/contact). Questions about your data, deletion requests and objections '
        + 'go to the same address.',
      ],
    },
    {
      titel: 'Visiting the site',
      absaetze: [
        'When you open a page, the server necessarily receives technical data such as your IP address, the page requested and '
        + 'your browser type. It is used to deliver the page and to protect the service against abuse and is not combined with '
        + 'other data to build a profile of you.',
        'We count visits to see how much the site is used. For this a cookie with a random value is set; no name or e-mail '
        + 'address is attached to it. The operator\'s own visits are not counted. For signed-in accounts the site additionally '
        + 'notes that the account is currently active, so that an administrator can see who is online.',
      ],
    },
    {
      titel: 'Your account',
      absaetze: ['You can use the site without an account. If you create one, we store:'],
      liste: [
        'e-mail address and display name',
        'your password as a salted scrypt hash (we never store the password itself) — not if you only sign in through another service',
        'the ID of each sign-in service you linked (Twitch, Discord, Google, Epic Games)',
        'optional details you add yourself: profile picture, social media names, your Epic account ID',
        'the role and rights of the account (for example VIP, pro, manager), and when VIP was granted',
        'settings you save with the account, such as banner templates and the players you looked up last',
        'up to five recent IP addresses of the account; they are only used to keep blocked accounts from returning',
      ],
    },
    {
      titel: 'Signing in with Twitch, Discord, Google or Epic Games',
      absaetze: [
        'If you sign in or link an account through one of these services, the service tells us your account ID, your name and — '
        + 'for Twitch, Discord and Google — your e-mail address and avatar. We do not receive your password for that service.',
        'Epic Games: when you press “Connect with Epic Games”, Epic asks you to approve the connection. We request only the '
        + '“basic profile” permission, which gives us your Epic account ID and display name. We use the Epic account ID to find '
        + 'your own results in the statistics (for example “My stats” and “My team”) and to show your team highlighted in '
        + 'tournament tables. You can disconnect it in your account settings at any time; you can also revoke the permission in '
        + 'your Epic Games account.',
      ],
    },
    {
      titel: 'Competitive data from Epic Games',
      absaetze: [
        'The statistics on the site are built from public tournament results of Epic Games (leaderboards, match results, '
        + 'replays of competitive matches) and from community sources. They contain the in-game names and Epic account IDs of '
        + 'players who took part in public tournaments. We show them to report on the competitive scene. If you are such a '
        + 'player and want your name changed or removed, write to us and we will act on it.',
      ],
    },
    {
      titel: 'Contact form, support and messages',
      absaetze: [
        'When you write to us through the contact form or the account chat, we store your message, the e-mail address you give '
        + 'for the reply, any pictures you attach and your account name. Messages are forwarded to the operator\'s private '
        + 'Discord channels so that they can be answered. Requests for VIP or manager access are handled the same way, '
        + 'including through the CompHub Discord bot.',
      ],
    },
    {
      titel: 'Pro POV streams',
      absaetze: [
        'Pros can share their screen with approved viewers. The picture and sound are relayed live through our server to the '
        + 'viewers the pro approved and are not recorded or stored. The pro\'s approval list is stored. Viewers who are '
        + 'not approved cannot watch.',
      ],
    },
    {
      titel: 'Discord server and bot',
      absaetze: [
        'The CompHub bot posts announcements and handles requests on Discord servers it has been invited to. If a pro turns '
        + 'on announcements for a server, a message that the pro is live is posted there. The bot sees which voice channel a '
        + 'linked account is in so the site can show “live on Discord”. Discord\'s own privacy policy applies to everything on '
        + 'Discord.',
      ],
    },
    {
      titel: 'Cookies and local storage',
      liste: [
        'Sign-in cookies (needed to keep you signed in; valid for up to 30 days)',
        'Short-lived cookies during sign-in with an external service (to protect against forged sign-ins)',
        'A visit-counter cookie with a random value',
        'Browser storage for your own preferences, such as language and Multiview settings. It stays on your device.',
      ],
      absaetze: ['We do not use advertising or third-party tracking cookies.'],
    },
    {
      titel: 'Who receives data',
      absaetze: [
        'We use service providers to run the site. They only get the data they need for their task:',
      ],
      liste: [
        'Cloudflare — delivers the site and protects it against attacks (sees IP addresses and requests)',
        'GitHub — stores the source code and the data archive that the statistics are built from',
        'Supabase — database and file storage for content that users and the operator write on the site',
        'Discord — notifications, support and the bot',
        'Google (Gmail) — sending e-mails from the site, such as confirmations and replies',
        'Twitch, Discord, Google and Epic Games — only if you sign in or link an account with them',
      ],
    },
    {
      titel: 'Legal basis',
      absaetze: [
        'Account, sign-in, messages and requested features: performance of the service you ask for (Art. 6(1)(b) GDPR). '
        + 'Counting visits, protection against abuse, blocking accounts, publishing competitive statistics: our legitimate '
        + 'interest in running and protecting the site (Art. 6(1)(f) GDPR). Optional connections such as Epic Games: your '
        + 'consent (Art. 6(1)(a) GDPR), which you can withdraw at any time.',
        'Some providers are based outside the European Economic Area, for example in the USA. Where this is the case, '
        + 'transfers rely on the provider\'s standard contractual clauses or an adequacy decision.',
      ],
    },
    {
      titel: 'How long we keep data',
      absaetze: [
        'Account data stays until you delete the account. Messages are kept as long as needed to answer them and to '
        + 'document support. IP addresses on an account are limited to the last five. Visit counts contain no personal data. '
        + 'Competitive statistics stay as part of the tournament archive.',
      ],
    },
    {
      titel: 'Your rights',
      absaetze: [
        'You have the right to access, correction, deletion, restriction of processing, data portability and objection, and '
        + 'the right to withdraw consent. You can delete your account yourself on the account page, or write to '
        + `${KONTAKT} and we will do it. You also have the right to complain to a data protection authority.`,
      ],
    },
    {
      titel: 'Children',
      absaetze: [
        'The site is not aimed at children under 13. If you believe a child has created an account, write to us and we will '
        + 'delete it.',
      ],
    },
    {
      titel: 'Changes',
      absaetze: [
        'If the site changes in a way that affects your data, we update this page and the date at the top.',
      ],
    },
    {
      titel: 'Not affiliated with Epic Games',
      absaetze: [
        'CompHub is an independent project. It is not affiliated with, endorsed by or sponsored by Epic Games. Fortnite and '
        + 'Epic Games are trademarks of Epic Games, Inc.',
      ],
    },
  ],
};

const DE: RechtsText = {
  titel: 'Datenschutzerklärung',
  stand: 'Stand: 12. Oktober 2026',
  einleitung:
    'CompHub (thecomphub.com) zeigt Statistiken, Turniere und Streams der kompetitiven Fortnite-Szene. Diese Seite erklärt, '
    + 'welche personenbezogenen Daten wir verarbeiten, wofür, wer sie erhält und welche Rechte du hast. Das meiste auf der '
    + 'Seite funktioniert ohne Konto. Daten fallen nur dort an, wo es unten beschrieben ist.',
  abschnitte: [
    {
      titel: 'Wer verantwortlich ist',
      absaetze: [
        `Verantwortlich für die hier beschriebene Verarbeitung ist der Betreiber von CompHub. Du erreichst ihn unter ${KONTAKT} `
        + 'oder über das Kontaktformular der Seite (/contact). Fragen zu deinen Daten, Löschwünsche und Widersprüche gehen an '
        + 'dieselbe Adresse.',
      ],
    },
    {
      titel: 'Besuch der Seite',
      absaetze: [
        'Beim Aufruf einer Seite erhält der Server zwangsläufig technische Daten wie deine IP-Adresse, die angeforderte Seite '
        + 'und deinen Browsertyp. Sie dienen dazu, die Seite auszuliefern und den Dienst vor Missbrauch zu schützen; sie werden '
        + 'nicht zu einem Profil über dich verknüpft.',
        'Wir zählen Besuche, um zu sehen, wie stark die Seite genutzt wird. Dafür wird ein Cookie mit einem Zufallswert gesetzt; '
        + 'Name oder E-Mail-Adresse hängen nicht daran. Die eigenen Aufrufe des Betreibers werden nicht mitgezählt. Bei '
        + 'angemeldeten Konten wird außerdem vermerkt, dass das Konto gerade aktiv ist, damit ein Administrator sehen kann, wer '
        + 'online ist.',
      ],
    },
    {
      titel: 'Dein Konto',
      absaetze: ['Du kannst die Seite ohne Konto nutzen. Wenn du eines anlegst, speichern wir:'],
      liste: [
        'E-Mail-Adresse und Anzeigename',
        'dein Passwort als gesalzenen scrypt-Hash (das Passwort selbst speichern wir nie) — entfällt, wenn du dich nur über einen anderen Dienst anmeldest',
        'die Kennung jedes verknüpften Anmeldedienstes (Twitch, Discord, Google, Epic Games)',
        'freiwillige Angaben: Profilbild, Social-Media-Namen, deine Epic-Konto-ID',
        'Rolle und Rechte des Kontos (zum Beispiel VIP, Pro, Manager) und wann VIP vergeben wurde',
        'Einstellungen, die du am Konto speicherst, etwa Banner-Vorlagen und zuletzt nachgeschlagene Spieler',
        'bis zu fünf zuletzt genutzte IP-Adressen des Kontos; sie dienen nur dazu, dass gesperrte Konten nicht zurückkehren',
      ],
    },
    {
      titel: 'Anmeldung über Twitch, Discord, Google oder Epic Games',
      absaetze: [
        'Meldest du dich über einen dieser Dienste an oder verknüpfst ihn, teilt uns der Dienst deine Konto-Kennung, deinen '
        + 'Namen und — bei Twitch, Discord und Google — deine E-Mail-Adresse und dein Profilbild mit. Dein Passwort für diesen '
        + 'Dienst erhalten wir nicht.',
        'Epic Games: Drückst du „Mit Epic Games verbinden“, bittet dich Epic um deine Zustimmung. Wir fragen nur die '
        + 'Berechtigung „Basisprofil“ an; sie liefert uns deine Epic-Konto-ID und deinen Anzeigenamen. Die Epic-Konto-ID nutzen '
        + 'wir, um deine eigenen Ergebnisse in der Statistik zu finden („Meine Stats“, „Mein Team“) und dein Team in '
        + 'Turniertabellen hervorzuheben. Du kannst die Verbindung jederzeit in den Kontoeinstellungen lösen und die '
        + 'Berechtigung auch in deinem Epic-Games-Konto widerrufen.',
      ],
    },
    {
      titel: 'Wettkampfdaten von Epic Games',
      absaetze: [
        'Die Statistiken der Seite entstehen aus öffentlichen Turnierergebnissen von Epic Games (Bestenlisten, '
        + 'Matchergebnisse, Replays von Wettkampfspielen) und aus Community-Quellen. Sie enthalten die Ingame-Namen und '
        + 'Epic-Konto-IDs von Spielern, die an öffentlichen Turnieren teilgenommen haben. Wir zeigen sie, um über die '
        + 'Wettkampfszene zu berichten. Bist du so ein Spieler und möchtest, dass dein Name geändert oder entfernt wird, '
        + 'schreib uns — wir kümmern uns darum.',
      ],
    },
    {
      titel: 'Kontaktformular, Support und Nachrichten',
      absaetze: [
        'Schreibst du uns über das Kontaktformular oder den Chat im Konto, speichern wir deine Nachricht, die E-Mail-Adresse '
        + 'für die Antwort, angehängte Bilder und deinen Kontonamen. Nachrichten werden an private Discord-Kanäle des Betreibers '
        + 'weitergeleitet, damit sie beantwortet werden können. Anfragen für VIP- oder Manager-Zugang laufen genauso, auch über '
        + 'den CompHub-Discord-Bot.',
      ],
    },
    {
      titel: 'Pro-POV-Streams',
      absaetze: [
        'Pros können ihren Bildschirm für freigegebene Zuschauer teilen. Bild und Ton laufen live über unseren Server zu den '
        + 'Zuschauern, die der Pro freigegeben hat, und werden weder aufgezeichnet noch gespeichert. Die Freigabeliste des Pros '
        + 'wird gespeichert. Nicht freigegebene Zuschauer können nicht zusehen.',
      ],
    },
    {
      titel: 'Discord-Server und Bot',
      absaetze: [
        'Der CompHub-Bot veröffentlicht Meldungen und bearbeitet Anfragen auf Discord-Servern, auf die er eingeladen wurde. '
        + 'Schaltet ein Pro Ankündigungen für einen Server ein, erscheint dort eine Meldung, dass der Pro live ist. Der Bot sieht, '
        + 'in welchem Sprachkanal ein verknüpftes Konto sitzt, damit die Seite „Live auf Discord“ anzeigen kann. Für alles auf '
        + 'Discord gilt die Datenschutzerklärung von Discord.',
      ],
    },
    {
      titel: 'Cookies und lokaler Speicher',
      liste: [
        'Anmelde-Cookies (damit du angemeldet bleibst; bis zu 30 Tage gültig)',
        'Kurzlebige Cookies während der Anmeldung über einen externen Dienst (Schutz vor gefälschten Anmeldungen)',
        'Ein Besuchszähler-Cookie mit Zufallswert',
        'Browser-Speicher für deine eigenen Einstellungen, etwa Sprache und Multiview. Er bleibt auf deinem Gerät.',
      ],
      absaetze: ['Werbe- oder Tracking-Cookies von Dritten setzen wir nicht ein.'],
    },
    {
      titel: 'Wer Daten erhält',
      absaetze: [
        'Für den Betrieb nutzen wir Dienstleister. Sie erhalten nur die Daten, die sie für ihre Aufgabe brauchen:',
      ],
      liste: [
        'Cloudflare — liefert die Seite aus und schützt sie vor Angriffen (sieht IP-Adressen und Anfragen)',
        'GitHub — speichert den Quellcode und das Datenarchiv, aus dem die Statistik entsteht',
        'Supabase — Datenbank und Dateiablage für Inhalte, die Nutzer und Betreiber auf der Seite schreiben',
        'Discord — Benachrichtigungen, Support und der Bot',
        'Google (Gmail) — Versand von E-Mails der Seite, etwa Bestätigungen und Antworten',
        'Twitch, Discord, Google und Epic Games — nur, wenn du dich damit anmeldest oder ein Konto verknüpfst',
      ],
    },
    {
      titel: 'Rechtsgrundlagen',
      absaetze: [
        'Konto, Anmeldung, Nachrichten und gewünschte Funktionen: Erfüllung des von dir gewünschten Dienstes '
        + '(Art. 6 Abs. 1 lit. b DSGVO). Besuchszählung, Schutz vor Missbrauch, Sperren von Konten, Veröffentlichung von '
        + 'Wettkampfstatistik: unser berechtigtes Interesse am Betrieb und Schutz der Seite (Art. 6 Abs. 1 lit. f DSGVO). '
        + 'Freiwillige Verbindungen wie Epic Games: deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die du jederzeit '
        + 'widerrufen kannst.',
        'Einige Anbieter sitzen außerhalb des Europäischen Wirtschaftsraums, etwa in den USA. Dann stützt sich die '
        + 'Übermittlung auf Standardvertragsklauseln des Anbieters oder einen Angemessenheitsbeschluss.',
      ],
    },
    {
      titel: 'Wie lange wir Daten aufbewahren',
      absaetze: [
        'Kontodaten bleiben, bis du das Konto löschst. Nachrichten bleiben so lange, wie es für die Antwort und die '
        + 'Dokumentation des Supports nötig ist. IP-Adressen am Konto sind auf die letzten fünf begrenzt. Besuchszahlen '
        + 'enthalten keine personenbezogenen Daten. Wettkampfstatistik bleibt als Teil des Turnierarchivs.',
      ],
    },
    {
      titel: 'Deine Rechte',
      absaetze: [
        'Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und '
        + 'Widerspruch sowie das Recht, eine Einwilligung zu widerrufen. Dein Konto kannst du selbst auf der Kontoseite '
        + `löschen oder an ${KONTAKT} schreiben, dann erledigen wir es. Außerdem kannst du dich bei einer `
        + 'Datenschutzaufsichtsbehörde beschweren.',
      ],
    },
    {
      titel: 'Kinder',
      absaetze: [
        'Die Seite richtet sich nicht an Kinder unter 13 Jahren. Glaubst du, dass ein Kind ein Konto angelegt hat, schreib uns; '
        + 'wir löschen es.',
      ],
    },
    {
      titel: 'Änderungen',
      absaetze: [
        'Ändert sich die Seite so, dass es deine Daten betrifft, aktualisieren wir diese Seite und das Datum oben.',
      ],
    },
    {
      titel: 'Keine Verbindung zu Epic Games',
      absaetze: [
        'CompHub ist ein unabhängiges Projekt. Es ist nicht mit Epic Games verbunden und wird weder von Epic Games '
        + 'unterstützt noch gesponsert. Fortnite und Epic Games sind Marken von Epic Games, Inc.',
      ],
    },
  ],
};

export default function Datenschutz() {
  return (
    <RechtsSeite de={DE} en={EN}
      anderer={{ pfad: '/terms', de: 'Nutzungsbedingungen →', en: 'Terms of Use →' }} />
  );
}
