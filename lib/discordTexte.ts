/*
 * Die Texte, die der Bot auf dem Discord-Server ablegt.
 *
 * Sie stehen hier und nicht im Aufbau-Code, weil sie das eigentliche sind,
 * was der Betreiber bestellt hat: "dann machst Du mir eine perfekte
 * Beschreibung fuer ein Welcome fuer die VIP selber ... dann eine perfekte
 * Welcome Nachricht fuer die VIP Manager beziehungsweise eine Anleitung, was
 * sie als VIP Manager auf meiner Website machen koennen oder machen sollen,
 * was ihre Aufgabe ist."
 *
 * Englisch ist die Hauptsprache - "Du kannst das alles auf Englisch machen
 * ... Englisch ist so das Wichtigste". Deutsch liegt daneben und kommt ueber
 * einen Knopf unter der Nachricht: Discord kann einen Text nicht auf Klick
 * austauschen, ohne ihn fuer alle zu aendern, deshalb bekommt der Klickende
 * eine nur fuer ihn sichtbare Fassung.
 *
 * Was hier steht, muss stimmen. Es beschreibt nichts, was es im Werkzeug
 * nicht gibt - ein Leitfaden, der Funktionen verspricht, kostet den
 * Betreiber genau die Nachfragen, die er sich damit ersparen wollte.
 */

export type Sprache = 'en' | 'de';

/**
 * Wer den Kanal sehen darf.
 *
 * Der Betreiber wollte die Leitfaeden getrennt: "beim VIP Guide kann der
 * Kanal gesperrt sein, viel nur VIPs. Und dann bei Manager Guide kann der
 * Account gesperrt sein fuer nur Manager. Welcome fuer jeden."
 */
export type Sichtbar = 'alle' | 'vip' | 'manager';

export interface Beitrag {
  /** Kanalname ohne #. */
  kanal: string;
  /** Wer ihn sehen darf. */
  sichtbar: Sichtbar;
  /** Worum es in dem Kanal geht - steht in der Kanalbeschreibung. */
  thema: string;
  /** Die Ueberschrift der Nachricht, je Sprache. */
  titel: Record<Sprache, string>;
  /** Der Text, je Sprache. Markdown, wie Discord es versteht. */
  text: Record<Sprache, string>;
}

/** Das Blau der Startseite - Sky 500. */
export const FARBE = 0x0ea5e9;

const WILLKOMMEN: Beitrag = {
  kanal: 'welcome',
  sichtbar: 'alle',
  thema: 'What CompHub is and how to get started',
  titel: {
    en: 'Welcome to CompHub',
    de: 'Willkommen bei CompHub',
  },
  text: {
    en: [
      'CompHub is a tool for competitive Fortnite: live cup leaderboards, '
      + 'match history with match IDs, prize pools, player and team stats, '
      + 'power rankings, a multiview for several streams at once — and stream '
      + 'overlays you can drop straight into OBS.',
      '',
      '**Website** — https://thecomphub.com',
      '',
      '__Who this server is for__',
      'It is the back office for the streamers and creators who use CompHub. '
      + 'Everyone with access has their own private channel here. That channel '
      + 'holds exactly one message: the access key that is currently valid.',
      '',
      '__How to sign in__',
      '1. Open https://www.thecomphub.com/anmelden/vip',
      '2. Type the **name** of your access (the channel is named after it) '
      + 'and the **key** from your channel.',
      '3. That is it — no e-mail, no password. The key is compared character '
      + 'by character, so upper and lower case matter.',
      '',
      '__Your key__',
      'Treat it like a password. It is the only thing between your name and '
      + 'your overlays. Whenever a new key is generated, the old message in '
      + 'your channel is deleted and a new one takes its place — so the key '
      + 'you see there is always the valid one. It is hidden behind a grey '
      + 'bar; click it to reveal. That way it stays off screen while you are '
      + 'live.',
      '',
      '__Need something?__',
      'Open a ticket in the support channel. Anything is fair game: a bug, a '
      + 'missing number, an overlay that should look different, a page only '
      + 'for you. Not everything is possible and nothing is instant, but you '
      + 'will always get a straight yes or no.',
    ].join('\n'),
    de: [
      'CompHub ist ein Werkzeug für kompetitives Fortnite: Leaderboards '
      + 'laufender Cups, Matchverlauf mit Match-IDs, Preispools, Spieler- und '
      + 'Teamstatistiken, Power Rankings, ein Multiview für mehrere Streams '
      + 'gleichzeitig — und Overlays, die direkt in OBS laufen.',
      '',
      '**Webseite** — https://thecomphub.com',
      '',
      '__Für wen dieser Server ist__',
      'Er ist der Maschinenraum für die Streamer und Creator, die CompHub '
      + 'benutzen. Jeder mit Zugang hat hier seinen eigenen, privaten Kanal. '
      + 'Darin steht genau eine Nachricht: der Schlüssel, der gerade gilt.',
      '',
      '__So meldest du dich an__',
      '1. Öffne https://www.thecomphub.com/anmelden/vip',
      '2. Tippe den **Namen** deines Zugangs (der Kanal ist danach benannt) '
      + 'und den **Schlüssel** aus deinem Kanal.',
      '3. Das ist alles — keine E-Mail, kein Passwort. Verglichen wird Zeichen '
      + 'für Zeichen, Groß- und Kleinschreibung zählt also mit.',
      '',
      '__Dein Schlüssel__',
      'Behandle ihn wie ein Passwort. Er ist das Einzige zwischen deinem Namen '
      + 'und deinen Overlays. Sobald ein neuer erzeugt wird, verschwindet die '
      + 'alte Nachricht in deinem Kanal und eine neue nimmt ihren Platz ein — '
      + 'was dort steht, ist immer der gültige Schlüssel. Er liegt hinter '
      + 'einem grauen Balken; zum Aufdecken draufklicken. So bleibt er beim '
      + 'Streamen aus dem Bild.',
      '',
      '__Du brauchst etwas?__',
      'Eröffne ein Ticket im Support-Kanal. Alles ist erlaubt: ein Fehler, '
      + 'eine fehlende Zahl, ein Overlay, das anders aussehen soll, eine Seite '
      + 'nur für dich. Nicht alles geht und nichts geht sofort, aber du '
      + 'bekommst immer ein klares Ja oder Nein.',
    ].join('\n'),
  },
};

const VIP_LEITFADEN: Beitrag = {
  kanal: 'vip-guide',
  sichtbar: 'vip',
  thema: 'What a VIP access can do on thecomphub.com',
  titel: {
    en: 'VIP guide — what your access can do',
    de: 'VIP-Leitfaden — was dein Zugang kann',
  },
  text: {
    en: [
      'Sign in at https://www.thecomphub.com/anmelden/vip with your name and the key '
      + 'from your channel. Everything below is then one click away.',
      '',
      '**Overlays** — browser sources for OBS',
      'Three kinds: a **team map** (your draw, shape by shape), **standings** '
      + '(a live table that pages through the top places) and '
      + '**qualification** (who is through and who is on the edge). Build one, '
      + 'copy its URL, add it in OBS as a *Browser Source* — done. It '
      + 'refreshes itself every few seconds, so you never have to swap the URL '
      + 'again, not even when you change the overlay mid-stream. Your saved '
      + 'overlays stay under "My Overlays": rename, change the cup, copy the '
      + 'URL, delete.',
      '',
      '**Events** — every cup, every region',
      'Leaderboard with up to ten thousand places, the full match list with '
      + 'the **match ID** of every round, prize pool and points, player and '
      + 'team stats. Pick a day, pick a region, search a name.',
      '',
      '**Multiview** — several streams side by side, with the chats.',
      '',
      '**Rankings** — the worldwide ranking, by region and season.',
      '',
      '**Tierlist** — sort players into tiers. Yours is private: it belongs '
      + 'to your access and nobody else sees it, not even an admin.',
      '',
      '**Contact & chat archive** — write to the operator from inside the '
      + 'tool; every conversation stays readable afterwards.',
      '',
      '__What you can ask for__',
      'Anything. A number that is missing, a cup that should be in the list, '
      + 'an overlay in your own colours, a stats page only for you, something '
      + 'that should change for everybody. Juanito builds it on request — he '
      + 'will do his best, it simply takes its time, and where something '
      + 'really is not possible you get a clear no instead of a workaround.',
      '',
      '__Your key__',
      'One message in your channel, always the valid one. If you were given '
      + 'the right to change it yourself, there is a button under it. If not, '
      + 'ask in support and you get a new one.',
      '',
      '__Managers__',
      'If several people help you with your overlays during a stream, you can '
      + 'get a shared **manager access**. It reaches your overlays and nothing '
      + 'else — not your tierlist, not your account. Ask for it in support.',
    ].join('\n'),
    de: [
      'Melde dich unter https://www.thecomphub.com/anmelden/vip mit deinem Namen und '
      + 'dem Schlüssel aus deinem Kanal an. Alles hier ist danach ein Klick '
      + 'entfernt.',
      '',
      '**Overlays** — Browserquellen für OBS',
      'Drei Arten: eine **Team-Karte** (deine Einteilung, Form für Form), '
      + '**Standings** (eine laufende Tabelle, die sich durch die Plätze '
      + 'blättert) und **Qualification** (wer durch ist und wer wackelt). '
      + 'Eine bauen, die URL kopieren, in OBS als *Browserquelle* einfügen — '
      + 'fertig. Sie lädt sich von selbst alle paar Sekunden nach; du musst '
      + 'die URL also nie wieder tauschen, auch nicht, wenn du das Overlay '
      + 'mitten im Stream änderst. Deine gespeicherten Overlays stehen unter '
      + '„My Overlays": umbenennen, Cup wechseln, URL kopieren, löschen.',
      '',
      '**Events** — jeder Cup, jede Region',
      'Leaderboard mit bis zu zehntausend Plätzen, die vollständige Matchliste '
      + 'mit der **Match-ID** jeder Runde, Preispool und Punkte, Spieler- und '
      + 'Teamstatistiken. Tag wählen, Region wählen, Namen suchen.',
      '',
      '**Multiview** — mehrere Streams nebeneinander, samt Chats.',
      '',
      '**Rankings** — die weltweite Bestenliste, nach Region und Saison.',
      '',
      '**Tierlist** — Spieler einsortieren. Deine ist privat: sie gehört '
      + 'deinem Zugang, und niemand sonst sieht sie, auch kein Admin.',
      '',
      '**Kontakt & Chatarchiv** — schreib dem Betreiber direkt aus dem '
      + 'Werkzeug; jedes Gespräch bleibt danach lesbar.',
      '',
      '__Was du anfragen kannst__',
      'Alles. Eine Zahl, die fehlt, ein Cup, der in die Liste gehört, ein '
      + 'Overlay in deinen Farben, eine Statistikseite nur für dich, etwas, '
      + 'das sich für alle ändern soll. Juanito baut das auf Anfrage — er gibt '
      + 'sein Bestes, es braucht einfach seine Zeit, und wo etwas wirklich '
      + 'nicht geht, bekommst du ein klares Nein statt einer Notlösung.',
      '',
      '__Dein Schlüssel__',
      'Eine Nachricht in deinem Kanal, immer die gültige. Wenn du das Recht '
      + 'hast, ihn selbst zu wechseln, steht ein Knopf darunter. Wenn nicht, '
      + 'frag im Support, dann bekommst du einen neuen.',
      '',
      '__Manager__',
      'Wenn mehrere Leute dir im Stream bei den Overlays helfen, kannst du '
      + 'einen gemeinsamen **Manager-Zugang** bekommen. Der kommt an deine '
      + 'Overlays und an nichts anderes — nicht an deine Tierlist, nicht an '
      + 'dein Konto. Frag im Support danach.',
    ].join('\n'),
  },
};

const MANAGER_LEITFADEN: Beitrag = {
  kanal: 'manager-guide',
  sichtbar: 'manager',
  thema: 'What a VIP manager does — and what not',
  titel: {
    en: 'Manager guide — your job in one page',
    de: 'Manager-Leitfaden — deine Aufgabe auf einer Seite',
  },
  text: {
    en: [
      'You hold a **manager access**. It does not belong to you, it belongs '
      + 'to a streamer: several people share one access and look after that '
      + 'streamer\'s overlays.',
      '',
      '__Signing in__',
      'Same door as everyone else: https://www.thecomphub.com/anmelden/vip with the '
      + 'manager name and the key from this channel. You land on the '
      + 'dashboard, and under Overlays you see the streamer\'s saved overlays '
      + '— not your own, his. That is the point.',
      '',
      '__What you do__',
      '• Add players to an overlay and take them out again.',
      '• Create a new overlay for the cup that is running.',
      '• Rename one, point it at a different cup, copy its URL, delete it.',
      '• Give every overlay you create a **title** and a **date**. Under the '
      + 'title you then see the cup and the date of the cup, so anyone can '
      + 'tell at a glance which overlay belongs to which day.',
      '',
      '__Why you do not have to send him anything__',
      'An overlay that is already live in OBS picks up your change on its '
      + 'own, within about five seconds. No new URL, no reload, no message in '
      + 'his DMs — you edit, it updates on stream. Only a brand new overlay '
      + 'needs its URL copied over once.',
      '',
      '__What you cannot do__',
      '• Nothing outside the overlays. No tierlist, no account settings, no '
      + 'admin tools — the access simply does not reach them.',
      '• You cannot change this key. Several people share it, and a new key '
      + 'would lock the others out in the middle of a stream. If it has to '
      + 'change, Juanito does it and the new one appears in this channel.',
      '',
      '__House rules__',
      'Everything you save belongs to the streamer and stays visible to him. '
      + 'Do not delete an overlay that is live unless he asked you to. When '
      + 'in doubt, build a new one next to it — it costs nothing.',
      '',
      '__Stuck, or something missing?__',
      'Open a ticket in the support channel. Requests are welcome: a column '
      + 'that should be there, an overlay that should look different, '
      + 'anything. It gets built if it can be built, and you get a straight '
      + 'answer if it cannot.',
    ].join('\n'),
    de: [
      'Du hast einen **Manager-Zugang**. Er gehört nicht dir, er gehört einem '
      + 'Streamer: mehrere Leute teilen sich einen Zugang und betreuen damit '
      + 'dessen Overlays.',
      '',
      '__Anmelden__',
      'Dieselbe Tür wie bei allen: https://www.thecomphub.com/anmelden/vip mit dem '
      + 'Managernamen und dem Schlüssel aus diesem Kanal. Du landest auf dem '
      + 'Dashboard, und unter Overlays stehen die gespeicherten Overlays des '
      + 'Streamers — nicht deine, seine. Genau das ist der Sinn.',
      '',
      '__Was du tust__',
      '• Spieler in ein Overlay aufnehmen und wieder herausnehmen.',
      '• Ein neues Overlay für den laufenden Cup anlegen.',
      '• Eines umbenennen, auf einen anderen Cup stellen, die URL kopieren, '
      + 'löschen.',
      '• Gib jedem Overlay, das du anlegst, einen **Titel** und ein **Datum**. '
      + 'Unter dem Titel steht dann der Cup samt Cup-Datum, damit jeder auf '
      + 'einen Blick sieht, welches Overlay zu welchem Tag gehört.',
      '',
      '__Warum du ihm nichts schicken musst__',
      'Ein Overlay, das in OBS schon läuft, übernimmt deine Änderung von '
      + 'selbst, innerhalb von etwa fünf Sekunden. Keine neue URL, kein '
      + 'Neuladen, keine Nachricht in seine DMs — du änderst, es ändert sich '
      + 'im Stream. Nur bei einem ganz neuen Overlay muss die URL einmal '
      + 'hinüber.',
      '',
      '__Was du nicht kannst__',
      '• Nichts außerhalb der Overlays. Keine Tierlist, keine '
      + 'Kontoeinstellungen, keine Adminwerkzeuge — der Zugang reicht da '
      + 'nicht hin.',
      '• Du kannst diesen Schlüssel nicht wechseln. Mehrere teilen ihn sich, '
      + 'und ein neuer würde die anderen mitten im Stream aussperren. Muss er '
      + 'gewechselt werden, macht Juanito das, und der neue erscheint in '
      + 'diesem Kanal.',
      '',
      '__Hausregeln__',
      'Alles, was du speicherst, gehört dem Streamer und bleibt für ihn '
      + 'sichtbar. Lösche kein Overlay, das gerade läuft, solange er nicht '
      + 'darum gebeten hat. Im Zweifel baue ein neues daneben — das kostet '
      + 'nichts.',
      '',
      '__Du kommst nicht weiter, oder etwas fehlt?__',
      'Eröffne ein Ticket im Support-Kanal. Anfragen sind willkommen: eine '
      + 'Spalte, die fehlt, ein Overlay, das anders aussehen soll, egal was. '
      + 'Es wird gebaut, wenn es sich bauen lässt, und du bekommst eine klare '
      + 'Antwort, wenn nicht.',
    ].join('\n'),
  },
};

/**
 * Die Beitraege in der Reihenfolge, in der sie im Kanalbaum stehen sollen.
 *
 * Der Schluessel ist gleichzeitig der Merkname in der Ablage und der Wert im
 * Knopf unter der Nachricht - er darf sich deshalb nicht mehr aendern, sonst
 * zeigen die Knoepfe alter Nachrichten ins Leere.
 */
export const BEITRAEGE: Record<string, Beitrag> = {
  welcome: WILLKOMMEN,
  'vip-guide': VIP_LEITFADEN,
  'manager-guide': MANAGER_LEITFADEN,
};
