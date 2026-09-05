/**
 * Unter welchem Namen die gewaehlte Sprache im Cookie steht.
 *
 * Bewusst hier und nicht im SprachProvider: der traegt 'use client', und ein
 * Server-Bestandteil bekommt von dort nur die Komponente - eine Konstante
 * kommt als undefined an. Genau daran hing das Layout: es fragte
 * cookies().get(undefined), bekam nie eine Antwort und blieb fuer immer auf
 * Englisch, waehrend der Browser umschaltete. React meldete das als
 * Hydration-Abweichung.
 */
export const SPRACH_COOKIE = 'multihub_sprache';

// Deutsch und Englisch fuer die ganze Oberflaeche.
//
// Uebersetzt wird ueber den Quelltext selbst, nicht ueber erfundene
// Schluessel: im Code steht weiterhin `t('Spieler suchen …')` und nicht
// `t('spieler.suche.platzhalter')`. Das hat drei Vorteile, die bei
// vierhundert Textstellen zaehlen:
//
//   * Der Quelltext bleibt lesbar - man sieht beim Lesen, was auf dem
//     Bildschirm steht, ohne in einer Tabelle nachzuschlagen.
//   * Es gibt keine Schluessel, die man vergibt, verwechselt oder doppelt
//     belegt.
//   * Was hier fehlt, bleibt einfach stehen, wie es im Code steht. Eine
//     Luecke ist dann sichtbar und in einer Zeile behoben - statt dass
//     irgendwo ein roher Schluessel wie "spieler.suche" auftaucht.
//
// Namen von Spielern, Turnieren und Regionen werden nirgends uebersetzt.
// Sie gehen nicht durch diese Tabelle, sondern stehen als Daten in der
// Oberflaeche.

export type Sprache = 'de' | 'en';

export const SPRACHEN: Array<{ kennung: Sprache; kurz: string; name: string }> = [
  { kennung: 'de', kurz: 'DE', name: 'Deutsch' },
  { kennung: 'en', kurz: 'EN', name: 'English' },
];

/**
 * Deutsche Texte aus dem Quelltext, auf Englisch.
 *
 * Sortiert nach Bereichen, damit sich beim Nachtragen etwas finden laesst.
 */
const AUF_ENGLISCH: Record<string, string> = {
  // ------------------------------------------------------------ Allgemein
  'Speichern': 'Save',
  'Gespeichert': 'Saved',
  'gespeichert': 'saved',
  'speichert …': 'saving …',
  'nicht gespeichert': 'not saved',
  'ging nicht': 'did not work',
  'Abstand zwischen Bild und Text': 'Gap between photo and text',
  'Mehrere Duos in einem Overlay': 'Several duos in one overlay',
  'Kontakt': 'Contact',
  'Support': 'Support',
  'Etwas geht nicht': 'Something is broken',
  'Report': 'Report',
  'Jemand oder etwas melden': 'Report someone or something',
  'Hilfe': 'Help',
  'Ich komme nicht weiter': 'I am stuck',
  'Idee': 'Idea',
  'Ein Vorschlag': 'A suggestion',
  'Anderes': 'Something else',
  'Betreff selbst schreiben': 'Write your own subject',
  'Worum geht es?': 'What is it about?',
  'In ein paar Worten': 'In a few words',
  'Beschreibung': 'Description',
  'Was ist passiert, und was hättest du erwartet?':
    'What happened, and what did you expect?',
  '(Strg+V fügt einen Screenshot ein)': '(Ctrl+V pastes a screenshot)',
  'Datei wählen': 'Choose file',
  'Kein Bild — ein Screenshot hilft oft mehr als drei Sätze.':
    'No image — a screenshot often says more than three sentences.',
  'Ein Bild ist zu groß — höchstens 5 MB.': 'One image is too large — 5 MB at most.',
  'Bitte beschreibe kurz, worum es geht.': 'Please describe briefly what this is about.',
  'Bitte schreib dazu, worum es geht.': 'Please add what this is about.',
  'Das ging nicht.': 'That did not work.',
  'Keine Verbindung zum Server.': 'No connection to the server.',
  'wird gesendet …': 'sending …',
  'Senden': 'Send',
  'Geht direkt an den Betreiber.': 'Goes straight to the operator.',
  'Angekommen': 'Received',
  ['Danke — die Meldung liegt jetzt beim Betreiber. Auf Antwort wartest du an der Adresse deines Kontos.']:
    'Thanks — your message is with the operator now. A reply will reach the address on your account.',
  'Noch etwas schreiben': 'Write something else',
  'Zum Schreiben brauchst du ein Konto — damit wir dir antworten können.':
    'You need an account to write — so we can reply to you.',
  'Etwas geht nicht, fehlt oder ließe sich besser machen? Schreib es hier auf.':
    'Something broken, missing, or worth improving? Write it down here.',
  ['Etwas geht nicht, fehlt oder ließe sich besser machen? Schreib es dem Betreiber — mit Screenshot, wenn du magst.']:
    'Something broken, missing, or worth improving? Tell the operator — with a screenshot if you like.',
  'Schreiben': 'Write',
  'Notiz für dich': 'Note to self',
  'wieder öffnen': 'reopen',
  'erledigt': 'done',
  'offen': 'open',
  'Nichts Offenes.': 'Nothing open.',
  'Noch keine Meldungen.': 'No messages yet.',
  'Dieser Bereich ist dem Betreiber vorbehalten.': 'This area is for the operator only.',
  'support': 'support',
  'report': 'report',
  'hilfe': 'help',
  'idee': 'idea',
  'anderes': 'other',
  'bestätigen': 'confirm',
  ['Es wird keine Bestätigungsmail verschickt — als Admin bestätigst du die Adresse selbst.']:
    'No confirmation mail is sent — as admin you confirm the address yourself.',
  'Fremde Karte einfügen (Strg+V)': 'Paste another map (Ctrl+V)',
  'Tage alt': 'days old',
  'Neue Turnierkarte': 'New tournament map',
  'Vorlage weg': 'Remove',
  'Vorlage liegt darunter — zeichne deine Formen darüber.':
    'The reference sits underneath — draw your shapes on top of it.',
  'Turnierkarte': 'Tournament map',
  'Kartenbild': 'Map image',
  'Schrift': 'Text',
  'Zweiter Hintergrund': 'Second background',
  'Von Platz': 'From rank',
  'Dieses Duo dazunehmen': 'Add this duo',
  'von oben': 'from above',
  'Sekunden je Duo': 'Seconds per duo',
  ['Noch keins dazugenommen — das Banner zeigt nur das Duo von oben. Nimm weitere dazu, dann wechselt es der Reihe nach durch.']:
    'None added yet — the banner only shows the duo from above. Add more and it cycles through them.',
  ['läuft gerade. Die Einzelwerte kommen erst, wenn der Cup zu Ende ist — Platz und Punkte stehen so lange unter Events.']:
    'is running right now. The detailed stats only arrive once the cup has ended — placement and points are under Events until then.',
  ['ist zu Ende, die Einzelwerte fehlen aber noch. Die Quelle veröffentlicht sie ein bis zwei Tage später; danach steht der Cup hier von selbst.']:
    'has ended, but the detailed stats are still missing. The source publishes them one to two days later; after that the cup shows up here on its own.',
  'Das Bild ließ sich nicht auslesen.': 'The image could not be read.',
  'Abbrechen': 'Cancel',
  'Schließen': 'Close',
  'Löschen': 'Delete',
  'löschen': 'delete',
  'entfernen': 'remove',
  'leeren': 'clear',
  'Zurücksetzen': 'Reset',
  'Wird geladen …': 'Loading …',
  'Lädt …': 'Loading …',
  'Laden …': 'Loading …',
  'Alle': 'All',
  'alle': 'all',
  'Alle anzeigen →': 'View all →',
  'Keine': 'None',
  'Suchen': 'Search',
  'Spieler suchen …': 'Search player …',
  'Turnier suchen …': 'Search tournament …',
  'Name': 'Name',
  'Anzeigename': 'Display name',
  'Region': 'Region',
  'Regionen': 'Regions',
  'Saison': 'Season',
  'Saisons': 'Seasons',
  'Spieler': 'Players',
  'Spieltag': 'match day',
  'Spieltage': 'match days',
  'Matches': 'matches',
  'Turnier': 'Tournament',
  'Turniere': 'Tournaments',
  'Pflege': 'Edit',
  'Los': 'Go',
  'Mehr': 'More',
  'Weniger': 'Less',
  'Zurück': 'Back',
  'Weiter': 'Next',
  'ja': 'yes',
  'nein': 'no',
  'und': 'and',
  'oder': 'or',
  'von': 'of',
  'bis': 'to',
  'ab': 'from',
  'je': 'per',
  'gegen': 'versus',

  // ------------------------------------------------------------ Statistik
  'Statistiken': 'Statistics',
  'Übersicht': 'Overview',
  'Vergleich': 'Compare',
  'Bilder': 'Photos',
  'Leistung': 'Performance',
  'Alle Werte': 'All values',
  'Werte': 'Values',
  'Eliminierungen': 'Eliminations',
  'Elims': 'Elims',
  'Elims je Match': 'Elims per match',
  'Schaden': 'Damage',
  'Schaden je Match': 'Damage per match',
  'Schaden erlitten': 'Damage taken',
  'Schadensquote': 'Damage ratio',
  'Quote': 'Ratio',
  'Treffer': 'Hits',
  'Trefferquote': 'Accuracy',
  'Schüsse': 'Shots fired',
  'Kopftreffer': 'Headshots',
  'Assists': 'Assists',
  'Wiederbelebungen': 'Reboots & revives',
  'Material': 'Mats farmed',
  'Bauteile': 'Builds placed',
  'Heilung': 'Healing',
  'Sturmschaden': 'Storm damage',
  'Fallschaden': 'Fall damage',
  'Strecke': 'Distance',
  'Zeit am Leben': 'Time alive',
  'Genauigkeit': 'Accuracy',
  'Stärkefelder': 'Performance',
  'Stärkenprofil': 'Strength profile',
  'Feuerkraft': 'Firepower',
  'Aufbau': 'Utility',
  'Überleben': 'Survival',
  'Auszeichnungen': 'Achievements',
  'FNCS-Titel': 'FNCS titles',
  'FNCS-Sieger': 'FNCS winner',
  'FNCS-Siege': 'FNCS wins',
  'FNCS Grand Finals': 'FNCS Grand Finals',
  'Grand Finals': 'Grand Finals',
  'Top 10 im Finale': 'Top 10 in finals',
  'Bester Spieltag': 'Best match day',
  'Höchster Schaden': 'Most damage',
  'Längster Spieltag': 'Longest match day',
  'Tagesbester': 'Day winner',
  'Beste Spieltage': 'Best match days',
  'nach Eliminierungen': 'by eliminations',
  'Die letzten drei Turniere': 'Last 3 tournaments',
  'Alle Turniere': 'All tournaments',
  'Zusammenfassung': 'Summary',
  'Eliminierungen je Spieltag': 'Eliminations per match day',
  'Durchschnitt': 'Average',
  'Schnitt': 'Average',
  'Bester': 'Best',
  'Schwächster': 'Worst',
  'Kopf an Kopf': 'Head to head',
  'Selbst vergleichen →': 'Compare yourself →',
  'Spielerprofile': 'Player profiles',
  'Power Ranking': 'Power ranking',
  'Alle Ranglisten →': 'Full rankings →',
  'PR-Wertung': 'PR score',
  'Plätze': 'Places',
  'Art': 'Type',
  'Zeigen': 'Show',
  'Zeitraum': 'Period',
  'In diesem Zeitraum ist dieser Spieler nicht angetreten.':
    'This player did not compete in this period.',
  'Länder': 'Countries',
  'Mehr laden': 'Load more',
  'Alle zeigen': 'Show all',
  'Name suchen — oder DE, FR, GB': 'Search name — or DE, FR, GB',
  ['Klein geschrieben sucht im Namen, groß geschrieben nach Ländern: '
    + 'DE,FR,GB']:
    'Lower case searches the name, upper case filters by country: DE,FR,GB',
  'Alle Saisons': 'All time',
  'Nur': 'Only',
  'hinterlegt': 'linked',
  'ändern': 'change',
  'Schlüssel zeigen': 'show key',
  'nur Epic': 'Epic only',

  // Die Werteleiste im Spielerprofil. Diese Zeilen werden zusammengesetzt
  // und gehen deshalb an <T> vorbei - sie brauchen eigene Schluessel.
  'besser als {n} %': 'better than {n} %',
  'von {n} in {region}': 'of {n} in {region}',
  'von {n} Spielern': 'of {n} players',
  'je Match': 'per match',
  '{n} Titel': '{n} titles',
  'ausgeteilt zu erlitten': 'dealt to taken',

  // Die Partnerleiste auf der Startseite und ihre Verwaltung.
  'Im Einsatz': 'In use',
  'Streamer und Creator, die CompHub nutzen':
    'Streamers and creators using CompHub',
  'zurück': 'back',
  'weiter': 'next',
  'VIPs': 'VIPs',
  'Wer auf der Startseite gezeigt wird': 'Who is shown on the home page',
  'auf der Startseite': 'on the home page',
  'Auf der Startseite': 'On the home page',
  ['Wer hier steht, erscheint unten auf der Startseite — mit Bild, Namen und '
    + 'den Konten, die du hinterlegst: Twitch, X oder TikTok, einzeln oder '
    + 'zusammen. Das ist eine eigene Auswahl: ein VIP bleibt VIP, auch wenn er '
    + 'hier nicht steht, und wer hier heraus fällt, verliert nichts.']:
    'Whoever is listed here appears at the bottom of the home page — with a '
    + 'photo, a name and whichever handles you add: Twitch, X or TikTok, one '
    + 'or all. This is a separate selection: a VIP stays a VIP even when not '
    + 'listed here, and dropping off loses nothing.',
  ['Noch niemand ausgewählt — der Bereich erscheint dann gar nicht erst auf '
    + 'der Startseite.']:
    'Nobody picked yet — the section then does not appear on the home page at '
    + 'all.',
  'Bild wählen oder austauschen': 'Pick or replace the photo',
  'Angezeigter Name': 'Displayed name',
  'Twitch-Konto — leer lassen für keins': 'Twitch handle — leave empty for none',
  'Twitch-Konto': 'Twitch handle',
  'nach vorn': 'move up',
  'nach hinten': 'move down',
  'sichtbar': 'visible',
  'ausgeblendet': 'hidden',
  'Kanal öffnen': 'Open the channel',
  'Von der Startseite nehmen? Der VIP-Zugang bleibt davon unberührt.':
    'Remove from the home page? The VIP access itself is not affected.',
  'von der Startseite genommen': 'removed from the home page',
  'auf die Startseite gestellt': 'added to the home page',
  'Bild gesetzt': 'photo set',
  'lädt hoch …': 'uploading …',
  'verschoben': 'moved',
  'Alle VIP-Zugänge': 'All VIP accesses',
  ['Ein Klick stellt jemanden auf die Startseite. Bild und Twitch-Konto '
    + 'trägst du danach oben ein.']:
    'One click puts someone on the home page. Photo and Twitch handle are '
    + 'filled in above afterwards.',
  'Namen suchen …': 'Search names …',
  'Niemand mehr übrig — alle VIP-Zugänge stehen schon oben.':
    'Nobody left — every VIP access is already listed above.',
  'Jemand ohne Zugang': 'Someone without an account',
  ['Ein Kooperationspartner braucht kein Konto im Werkzeug, um auf der '
    + 'Startseite zu stehen.']:
    'A partner does not need an account in the tool to appear on the home page.',
  'hinzufügen': 'add',
  'Du willst auch einen VIP-Zugang?': 'Want a VIP access of your own?',
  'X / Twitter': 'X / Twitter',
  'TikTok': 'TikTok',
  'X-Konto': 'X handle',
  'Leer lassen, wenn es nicht auf die Karte soll':
    'Leave empty to keep it off the card',
  'TikTok-Konto': 'TikTok handle',
  'gespeichert — ohne @-Konto': 'saved — without an @ handle',
  'Speichern — die Eingabetaste tut dasselbe': 'Save — the Enter key does the same',
  ['Aus dem eigenen Replay dieses Spieltags gezählt — Epic gibt '
    + 'Eliminierungen nur je Team heraus. Schaden, Material und Bauteile '
    + 'stehen im Replay nicht.']:
    'Counted from our own replay of this match day — Epic only publishes '
    + 'eliminations per team. Damage, mats and builds are not in the replay.',
  'Die Eliminierungen kommen aus dem eigenen Replay.':
    'The eliminations come from our own replay.',
  'Spielverlauf': 'Match history',
  'Stand nach Runde {n}': 'standings after game {n}',
  'läuft gerade': 'live now',
  'wie gezählt': 'as counted',
  'sind': 'are',
  'ist': 'is',
  'Werte werden geladen …': 'Loading values …',
  'Nichts gefunden.': 'Nothing found.',
  'Keine Daten.': 'No data.',
  'Kein Spieler gefunden für „{q}“.': 'No player found for “{q}”.',
  'mit Bild · {n}': 'with photo · {n}',
  'ohne Bild · {n}': 'without photo · {n}',
  'alle · {n}': 'all · {n}',
  'Saison {n}': 'Season {n}',
  'Qualifizieren sich': 'Qualifying',
  'Top': 'Top',
  'qualifizieren sich für das Finale': 'qualify for the finals',
  'qualifizieren sich': 'qualify',
  'ab {n} Matches': 'from {n} matches',
  // Die Beitragsvorlage ohne Cup.
  'Own list': 'Own list',
  'Freier Titel, Spieler von Hand': 'Free title, players by hand',
  'Überschrift': 'Headline',
  'z. B. „Who is the most UNDERRATED player right now?“ oder „EU“':
    'e.g. “Who is the most UNDERRATED player right now?” or “EU”',
  'Nummeriert (1., 2., 3.) — sonst Punkte':
    'Numbered (1., 2., 3.) — bullets otherwise',
  'Ausgewählt': 'Selected',
  'alle entfernen': 'clear all',
  'kein Foto': 'no photo',
  'Ohne Foto — kommt nicht ins Bild': 'No photo — will not appear in the image',
  'nach oben': 'move up',
  'nach unten': 'move down',
  'Rechts jemanden anklicken.': 'Pick someone on the right.',
  'oder nach einem Namen suchen …': 'or search for a name …',
  'alle erfassten Spieltage': 'all recorded match days',
  'nur große Finale': 'big finals only',
  'alle Spieltage': 'all match days',
  'Zeigt Performance Cups, Division-1-Finale, FNCS Grand Finals und EWC':
    'Shows Performance Cups, Division 1 finals, FNCS Grand Finals and EWC',
  'Zeigt jeden Spieltag, auch Cash Cups und Division 2 bis 5':
    'Shows every match day, including cash cups and divisions 2 to 5',
  'entfernt': 'removed',
  'Dieses Konto endgültig entfernen? Das lässt sich nicht rückgängig machen.':
    'Remove this account for good? This cannot be undone.',

  // Die schaltbaren Bereiche.
  'Sections': 'Sections',
  'Bereiche': 'sections',
  'Bereiche auf Standby oder Offline stellen':
    'Set sections to standby or offline',
  'Online': 'Online',
  'Standby': 'Standby',
  'Offline': 'Offline',
  'für alle sichtbar und nutzbar': 'visible and usable for everyone',
  'sichtbar, aber gesperrt — mit Hinweis': 'visible but locked — with a notice',
  'für alle außer dir ausgeblendet': 'hidden from everyone but you',
  'Was auf der Sperrseite steht': 'What the locked page says',
  'oder ein eigener Text': 'or your own wording',
  'Überschrift — leer lassen für die Auswahl oben':
    'Headline — leave empty to use the choice above',
  'Text darunter — leer lassen für die Auswahl oben':
    'Text below — leave empty to use the choice above',
  'Sperrseite ansehen': 'Preview the locked page',
  ['Als Admin siehst du dort den Bereich selbst — die Sperrseite zeigt sich '
    + 'nur den anderen.']:
    'As an admin you see the section itself — the locked page only shows for '
    + 'everyone else.',
  ['Du selbst kommst in jeden Bereich, egal was hier steht — auch in einen, '
    + 'der auf Offline steht. Genau dafür ist es gedacht: in Ruhe '
    + 'weiterbauen, während ihn sonst niemand sieht.']:
    'You reach every section no matter what it says here — including one set '
    + 'to offline. That is the point: keep building in peace while nobody '
    + 'else sees it.',
  'Diese Seite ist dem Admin vorbehalten.': 'This page is for admins only.',
  'zum Verwaltungsbereich': 'to the admin area',
  'Standby — nur für dich sichtbar nutzbar':
    'Standby — only you can still use it',
  'Offline — nur du siehst das hier': 'Offline — only you see this',

  // Die Sperrseite selbst.
  'in Bearbeitung': 'being reworked',
  'nicht verfügbar': 'unavailable',
  'Weiter geht es hier': 'Carry on here',
  '{bereich} ist gerade nicht verfügbar.': '{bereich} is not available right now.',
  ['Dieser Bereich ist momentan nicht Teil der Seite. Er kommt wieder — in '
    + 'der Zwischenzeit findest du alles Übrige oben in der Leiste.']:
    'This section is currently not part of the site. It will be back — in '
    + 'the meantime everything else is up in the bar.',
  'Wird überarbeitet': 'Being reworked',
  '{bereich} wird gerade überarbeitet.': '{bereich} is being reworked.',
  ['Diese Section befindet sich momentan in Bearbeitung. Der Administrator '
    + 'arbeitet gerade an Updates und Verbesserungen. Schau bald wieder '
    + 'vorbei!']:
    'This section is currently being worked on. The administrator is busy '
    + 'with updates and improvements. Check back soon!',
  'Kommt bald': 'Coming soon',
  '{bereich} kommt bald.': '{bereich} is coming soon.',
  ['An dieser Section wird gerade gebaut. Sie geht in Kürze online — es '
    + 'lohnt sich, später noch einmal vorbeizuschauen.']:
    'This section is being built right now. It goes live shortly — worth '
    + 'looking in again later.',
  'Kurze Wartung': 'Brief maintenance',
  '{bereich} ist kurz in Wartung.': '{bereich} is briefly down for maintenance.',
  ['Hier werden gerade Daten erneuert. Das dauert meist nur ein paar '
    + 'Minuten, danach steht wieder alles zur Verfügung.']:
    'Data is being refreshed here. That usually takes a few minutes, after '
    + 'which everything is back.',
  'Quelle antwortet nicht': 'Source not responding',
  '{bereich} ist gerade nicht erreichbar.': '{bereich} cannot be reached right now.',
  ['Eine Datenquelle antwortet im Moment nicht. Lieber nichts zeigen als '
    + 'falsche Zahlen — sobald sie wieder da ist, geht es hier weiter.']:
    'A data source is not answering at the moment. Better nothing than wrong '
    + 'numbers — as soon as it is back, this continues.',
  ['Platz und Punkte von Epic — Schaden, Material und Bauteile kommen '
    + 'nach.']:
    'Placement and points from Epic — damage, mats and builds follow later.',
  ['Diesen Zugang endgültig entfernen? Er kann sich dann nicht mehr anmelden.']:
    'Remove this access for good? They will no longer be able to sign in.',
  ['Ein Name genügt — keine E-Mail, keine Bestätigung. Der Schlüssel wird erzeugt und erscheint genau einmal. Angemeldet wird sich damit unter „VIP“ auf der Anmeldeseite.']:
    'A name is enough — no email, no confirmation. The key is generated and shown exactly once. It is used under “VIP” on the sign-in page.',

  // VIP-Zugaenge
  'VIP-Zugang anlegen': 'Create a VIP access',
  ['Ein Name genügt — keine E-Mail, keine Bestätigung. Der Schlüssel wird erzeugt und erscheint genau einmal. Angemeldet wird sich damit unter „VIP" auf der Anmeldeseite.']:
    'A name is enough — no email, no confirmation. The key is generated and shown exactly once. It is used under "VIP" on the sign-in page.',
  'anlegen': 'create',
  'Schlüssel für': 'Key for',
  'er erscheint nur dieses eine Mal.': 'it appears this one time only.',
  'notiert, ausblenden': 'noted, hide it',
  'stilllegen': 'disable',
  'wieder freigeben': 'enable again',
  'neuer Schlüssel': 'new key',
  'Drei bis vierundzwanzig Zeichen, ohne Leerzeichen.': 'Three to twenty-four characters, no spaces.',
  'Diesen Namen gibt es schon.': 'That name already exists.',

  // Profirolle
  'Pro': 'Pro',
  'trägt sich selbst auf den Karten ein': 'places themselves on the maps',
  'darf die angehakten Bereiche': 'may use the ticked areas',
  'Sein Epic-Konto': 'Their Epic account',
  'Spielername …': 'Player name …',
  'Ohne Epic-Konto kann er sich nirgends eintragen.': 'Without an Epic account they cannot place themselves anywhere.',
  'Das dürfen nur Profispieler.': 'Only pro players may do that.',
  'Zu diesem Konto ist kein Epic-Konto hinterlegt.': 'No Epic account is linked to this account.',
  'Du stehst nicht im Feld dieses Cups.': 'You are not in the field of this cup.',
  'Diese Karte ist gesperrt.': 'This map is locked.',
  'Diesen Spot gibt es nicht.': 'That spot does not exist.',

  // Manager-Bereiche
  'Welche Bereiche': 'Which areas',
  'Turnierkarten bauen und Landepunkte setzen': 'Build tournament maps and set landing spots',
  'Turnier-Replays nachsehen und auswerten': 'Review and process tournament replays',
  'Flaggen, Namen und @-Konten pflegen': 'Maintain flags, names and @ accounts',

  // VIP-Geschenk
  'Du hast VIP bekommen': 'You have been given VIP',
  ['Overlays, eigene Ordner, Turnierfilter und der Vergleich sind jetzt frei.']:
    'Overlays, your own folders, tournament filters and the comparison are now unlocked.',
  'Alles klar': 'Got it',

  // Sperren
  'gesperrt': 'blocked',
  'freigeben': 'unblock',
  'sperren': 'block',
  'freigegeben': 'unblocked',
  'Grund für die Sperre (nur du siehst ihn):': 'Reason for the block (only you see it):',
  'Dieses Konto ist gesperrt.': 'This account is blocked.',
  'Von diesem Anschluss lässt sich kein Konto anlegen.': 'No account can be created from this connection.',
  /*
   * Die Antworten der Kontoverwaltung.
   *
   * Sie entstehen auf dem Server und kamen deshalb bisher immer auf Deutsch
   * an - auch bei jemandem, der die Seite auf Englisch liest. Wer gesperrt
   * war, bekam einen deutschen Satz vorgesetzt und wusste nicht, was los ist.
   * Uebersetzt wird jetzt beim Anzeigen, und dafuer muessen die Saetze hier
   * stehen.
   */
  'Bitte zuerst anmelden.': 'Please sign in first.',
  /* Das Gespraech mit dem Betreiber - siehe app/components/ChatFenster.tsx. */
  'Nachrichten': 'Messages',
  'Noch keine Nachrichten.': 'No messages yet.',
  'ausblenden': 'hide',
  'Symbol ausblenden': 'Hide icon',
  'Symbol einblenden': 'Show icon',
  'Nachrichten öffnen': 'Open messages',
  /* Gruppen im Chat - siehe app/components/ChatFenster.tsx. */
  /* Fusszeile und Kontaktformular. */
  'Feedback': 'Feedback',
  ['Wie es sich anfühlt']: 'How it feels to use',
  ['Formular im Werkzeug →']: 'Form inside the tool →',
  ['Nicht mit Epic Games verbunden. Alle Marken gehören ihren Inhabern.']:
    'Not affiliated with Epic Games. All trademarks belong to their owners.',
  ['Statistiken, Turniere und Streams der kompetitiven Fortnite-Szene — an einem Ort, aus einem Archiv.']:
    'Stats, tournaments and streams from competitive Fortnite — in one place, from one archive.',
  /* Anmeldung und abgeschlossene Gespraeche. */
  ['E-Mail-Adresse oder Name']: 'Email address or name',
  'Passwort anzeigen': 'Show password',
  'Passwort verbergen': 'Hide password',
  'Anfrage senden': 'Send request',
  ['Warum soll es wieder geöffnet werden?']: 'Why should it be reopened?',
  ['Dieses Gespräch ist abgeschlossen. Du kannst es nachlesen und eine Anfrage stellen, es wieder zu öffnen.']:
    'This conversation is closed. You can read it and ask for it to be reopened.',
  ['Dieses Gespräch ist abgeschlossen.']: 'This conversation is closed.',
  ['Dieses Gespräch ist offen — schreib einfach.']: 'This conversation is open — just write.',
  ['Diesen Namen kennt niemand hier. Versuch es mit deiner E-Mail-Adresse.']:
    'Nobody here goes by that name. Try your email address instead.',
  'Chatarchiv': 'Chat archive',
  ['Alle Gespräche, auch die abgeschlossenen']: 'Every conversation, closed ones included',
  /* Bestaetigung und Passwort zuruecksetzen. */
  'Passwort vergessen?': 'Forgot your password?',
  'Passwort vergessen': 'Forgot your password',
  'Neues Passwort setzen': 'Set a new password',
  'Link schicken': 'Send link',
  ['Wähl ein neues Passwort. Danach bist du gleich angemeldet.']:
    'Choose a new password. You will be signed in right afterwards.',
  ['Gib deine E-Mail-Adresse oder deinen Namen an — wir schicken dir einen Link. Er gilt eine Stunde.']:
    'Enter your email address or your name — we will send you a link. It is valid for one hour.',
  ['Wenn es zu dieser Angabe ein Konto gibt, ist die Mail unterwegs.']:
    'If there is an account for this, the mail is on its way.',
  ['Dieser Link gilt nicht mehr. Fordere einen neuen an.']:
    'This link is no longer valid. Request a new one.',
  ['Dieser Link ist abgelaufen. Fordere einen neuen an.']:
    'This link has expired. Request a new one.',
  ['Wir haben dir eine Mail geschickt — ein Klick darin, und du hast den Haken.']:
    'We sent you a mail — one click in it and you have the check mark.',
  ['Die Bestätigungsmail ging gerade nicht raus. Du kannst sie später unter „Mein Konto“ erneut anfordern.']:
    'The confirmation mail did not go out just now. You can request it again under “My account”.',
  ['Die Mail ist unterwegs.']: 'The mail is on its way.',
  ['Der Versand klemmt gerade. Versuch es in ein paar Minuten noch einmal.']:
    'Sending is stuck right now. Try again in a few minutes.',
  ['Adresse bestätigt']: 'Address confirmed',
  ['Adresse nicht bestätigt']: 'Address not confirmed',
  ['Bestätigungsmail schicken']: 'Send confirmation mail',
  ['Deine Adresse ist schon bestätigt.']: 'Your address is already confirmed.',
  ['E-Mail für Rückfragen']: 'Email for follow-up questions',
  '(freiwillig)': '(optional)',
  ['damit dich eine Antwort auch per Mail erreicht']: 'so a reply can reach you by mail too',
  ['Auf diesem Rechner ist kein Mailversand eingerichtet — es fehlt die Datei .env.local.']:
    'No mail sending is set up on this machine — the file .env.local is missing.',
  ['Zu dieser Adresse gibt es schon ein Konto. Bitte anmelden.']:
    'There is already an account for this address. Please sign in.',
  ['Dieses Konto wurde über einen Anmeldedienst angelegt — melde dich darüber an, oder setz dir über „Passwort vergessen“ eines.']:
    'This account was created through a sign-in service — sign in that way, or set yourself a password via “Forgot your password”.',
  'Neue Gruppe': 'New group',
  'verlassen': 'leave',
  'Verlassen': 'Leave',
  'Gruppe anlegen': 'Create group',
  'wird angelegt …': 'creating…',
  ['eine Person — es wird ein Einzelgespräch']: 'one person — this will be a one-to-one chat',
  ['ab zwei Personen wird es eine Gruppe']: 'from two people up it becomes a group',
  ['Dieses Gespräch wirklich verlassen?']: 'Really leave this conversation?',
  ['Du siehst es danach nicht mehr. Der Betreiber kann dich wieder hinzufügen.']:
    'You will not see it afterwards. The operator can add you again.',
  ['Grund (Spam, erledigt, …) — bleibt im Gespräch stehen']:
    'Reason (spam, done, …) — stays in the conversation',
  ['Antwort schreiben — /hilfe zeigt die Befehle']:
    'Write a reply — /hilfe lists the commands',
  ['Bild anhängen (Strg+V geht auch)']: 'Attach an image (Ctrl+V works too)',
  ['Alle Gespräche mit dem Betreiber — auch die älteren.']:
    'Every conversation with the operator — older ones included.',
  ['Das Chatsymbol am linken Bildschirmrand. Ausgeblendet bleiben deine Nachrichten erhalten — du siehst nur den Knopf nicht mehr.']:
    'The chat icon on the left edge of the screen. Hidden, your messages stay — you just no longer see the button.',
  ['Symbol am Rand ausblenden — zurück unter „Mein Konto“']:
    'Hide the icon on the edge — bring it back under “My account”',
  'Antwort schreiben …': 'Write a reply…',
  'sendet …': 'sending…',
  'Bitte schreib etwas.': 'Please write something.',
  'Passwort stimmt nicht.': 'That password is not correct.',
  'Zu dieser Adresse gibt es kein Konto. Bitte erst registrieren.':
    'There is no account for this address. Please sign up first.',
  'Dieses Konto wurde über einen Anmeldedienst angelegt. Bitte darüber anmelden.':
    'This account was created through a sign-in service. Please sign in that way.',
  'Diese E-Mail-Adresse sieht nicht gültig aus.':
    'That email address does not look valid.',
  'Das Epic-Konto wird vom Betreiber zugewiesen.':
    'The Epic account is assigned by the operator.',
  'Die eingegebene Adresse stimmt nicht mit dem Konto überein.':
    'The address you entered does not match the account.',
  'Das Bild ist zu groß — bitte ein kleineres wählen.':
    'That image is too large — please choose a smaller one.',
  'Das war kein Bild.': 'That was not an image.',
  'Das hat nicht geklappt.': 'That did not work.',
  'nicht angemeldet': 'not signed in',
  'nicht gefunden': 'not found',
  'unbekannte Anfrage': 'unknown request',
  ['Hier stehen keine privaten Daten — keine Adressen, keine Social-Konten. Wer etwas beantragt, nennt dir seine Konto-Id; die sieht er bei sich selbst unter „Account“.']:
    'No private data here — no addresses, no social accounts. Anyone requesting something tells you their account id; they see it under “Account” themselves.',
  'Rollen und VIP vergeben': 'Grant roles and VIP',

  // Kontoverwaltung
  'Konten': 'Accounts',
  'angelegt': 'registered',
  'zur Verwaltung': 'to the admin area',
  ['Hier stehen keine privaten Daten — keine Adressen, keine Social-Konten. Wer etwas beantragt, nennt dir seine Konto-Id; die sieht er bei sich selbst unter „Account".']:
    'No private data here — no addresses, no social accounts. Anyone requesting something tells you their account id; they see it under "Account" themselves.',
  'Nach Name oder Konto-Id suchen …': 'Search by name or account id …',
  'Kein Konto passt zur Suche.': 'No account matches that search.',
  'Noch hat sich niemand registriert.': 'Nobody has registered yet.',
  'Rolle': 'Role',
  'Nutzer': 'User',
  'Manager': 'Manager',
  'Admin': 'Admin',
  'darf nichts verwalten': 'cannot manage anything',
  'darf Karten anlegen und bearbeiten': 'may create and edit maps',
  'darf alles': 'may do everything',
  'kein VIP': 'no VIP',
  '7 Tage': '7 days',
  '30 Tage': '30 days',
  '90 Tage': '90 days',
  'ohne Ende': 'no end date',
  'läuft bis': 'runs until',
  'Meine Konto-Id': 'My account id',
  ['Die nennst du, wenn du VIP oder andere Rechte anfragst. Sie verrät nichts über dich — sie benennt nur dein Konto.']:
    'Give this when you request VIP or other rights. It reveals nothing about you — it just names your account.',
  'Werte werden geholt …': 'Fetching the values …',

  // Ladeanzeige und Einzelwerte
  ['Die Zahlen kommen gleich — der Rest der Seite steht schon.']:
    'The numbers are on their way — the rest of the page is already here.',
  ['Epic gibt nur Teamwerte heraus. Die Zahlen je Spieler stehen im Archiv — dieser Spieltag liegt dort nicht.']:
    'Epic only hands out team values. The per-player numbers live in the archive — this session is not in it.',
  'Wert': 'Stat',
  'Eliminations': 'Eliminations',
  'Damage': 'Damage',
  'Damage Taken': 'Damage taken',
  'Headshots': 'Headshots',
  'Accuracy': 'Accuracy',
  'Mats Farmed': 'Mats farmed',
  'Builds Placed': 'Builds placed',
  'Time Alive': 'Time alive',

  // Suche bei Epic
  'Direkt bei Epic suchen': 'Search Epic directly',
  ['Das Archiv kennt nur die Profiszene. Wer dort fehlt, steht trotzdem im Leaderboard seines Cups — such ihn hier. Ein Cup zur Zeit, weil Epic die Bestenlisten je Turnier führt.']:
    'The archive only knows the pro scene. Anyone missing there is still in the leaderboard of their cup — search for them here. One cup at a time, because Epic keeps leaderboards per tournament.',
  'Nicht im Archiv — such ihn unten direkt bei Epic.': 'Not in the archive — search Epic directly below.',
  '— Cup wählen —': '— pick a cup —',
  'Im Cup suchen': 'Search this cup',
  'sucht …': 'searching …',
  ['Epic lässt keinen Direktabruf zu — die Bestenliste wird Seite für Seite durchsucht. Das dauert einen Moment.']:
    'Epic allows no direct lookup — the leaderboard is searched page by page. This takes a moment.',
  'Dieser Spieler war in diesem Cup nicht dabei.': 'This player did not take part in this cup.',
  ['Nicht gefunden — der Cup ist zu groß, um ihn ganz zu durchsuchen.']:
    'Not found — this cup is too large to search all the way through.',
  'Epic hat nicht geantwortet.': 'Epic did not answer.',
  'Runden': 'Rounds',

  // VIP-Abschnitt der Startseite
  'VIP-Zugang': 'VIP access',
  'Wie man VIP wird': 'How to become a VIP',
  ['Der VIP-Zugang schaltet die Overlays frei, eigene Ordner auf der Streamseite, die Filter im Turnierkalender und den Vergleich in den Statistiken. Er wird vergeben, nicht gekauft.']:
    'VIP access unlocks the overlays, your own folders on the streams page, the filters in the tournament calendar and the comparison in the statistics. It is granted, not bought.',
  'Reichweite': 'Reach',
  ['Du solltest auf Twitch, X oder YouTube ein Publikum haben — wie groß, entscheide ich im Einzelfall.']:
    'You should have an audience on Twitch, X or YouTube — how big is something I decide case by case.',
  'Sichtbarkeit': 'Visibility',
  ['Zeig CompHub bei deinen Zuschauern. Ein Overlay im Stream oder ein Beitrag reicht schon.']:
    'Show CompHub to your viewers. An overlay in your stream or one post is enough.',
  'Anfrage': 'Request',
  ['Schreib mir persönlich auf X. Ich antworte selbst, es gibt kein Formular und keine Warteliste.']:
    'Write to me personally on X. I answer myself — there is no form and no waiting list.',
  'Zugang anfragen': 'Request access',

  // Konto als VIP
  'Verwaltung': 'Admin',
  ['Dein Name kommt aus dem VIP-Zugang und wird dort vergeben — hier lässt er sich nicht ändern. Das Profilbild schon.']:
    'Your name comes from VIP access and is assigned there — it cannot be changed here. The profile picture can.',
  ['Du bist über den VIP-Schlüssel angemeldet, hast aber kein CompHub-Konto. Werte ansehen geht, Speichern noch nicht — dafür legst du dir eines an, mit derselben Adresse.']:
    'You are signed in with the VIP key but have no CompHub account. Viewing works, saving does not yet — create one with the same address for that.',
  ['Diese Seite ist dem Adminkonto vorbehalten.']:
    'This page is reserved for the admin account.',

  // Zugangsstufen
  'Nur für VIPs': 'VIPs only',
  ['Die Overlays sind Teil des VIP-Zugangs. Er wird vergeben, nicht freigeschaltet — mit einem gewöhnlichen Konto sind sie nicht zugänglich.']:
    'The overlays are part of VIP access. It is granted, not unlocked — an ordinary account cannot reach them.',
  'Zur Anmeldung': 'To the sign-in page',
  ['Eigene Ordner anlegen gehört zum VIP-Zugang. Spieler hinzufügen kannst du mit deinem Konto trotzdem.']:
    'Creating your own folders is part of VIP access. You can still add players with your account.',
  'Ordner anlegen geht nur angemeldet.': 'Creating folders requires signing in.',
  ['Bei mehreren gewählten Ordnern lässt sich nichts hinzufügen.']:
    'Nothing can be added while several folders are selected.',
  ['Angemeldet kannst du hier Spieler hinzufügen und entfernen.']:
    'Signed in, you can add and remove players here.',
  'Spielername — etwa Vico': 'Player name — Vico, say',
  'Bitte einen Spieler aus der Liste wählen.': 'Please pick a player from the list.',
  'Kein Spieler dieses Namens im Archiv.': 'No player by that name in the archive.',

  // Die eigene Kontoseite
  'My stats': 'My stats',
  'Socials': 'Socials',
  'Account': 'Account',
  'Privacy': 'Privacy',
  'Epic-Konto': 'Epic account',
  ['Trag eine Epic-Konto-Id ein — deine eigene oder eine fremde — und du siehst die Werte aus dem Turnierarchiv. Darunter lässt sich ein einzelner Cup auswählen. Deine eigene Id findest du, indem du dich auf der Statistikseite suchst.']:
    'Enter an Epic account id — your own or anyone else\'s — and you get the values from the tournament archive. Below that you can pick a single cup. You find your own id by searching for yourself on the statistics page.',
  'Werte holen': 'Load values',
  'alle Cups': 'all cups',
  'Zu diesem Konto liegt im Archiv nichts vor.': 'There is nothing in the archive for this account.',
  'Die Werte ließen sich nicht laden.': 'The values could not be loaded.',
  ['Über die Spieltage dieses Cups gerechnet. Material und Bauteile liefert die Quelle nur als Gesamtsumme.']:
    'Summed over this cup\'s sessions. The source only reports materials and builds as an overall total.',
  ['Nur an deinem eigenen Konto — im Werkzeug selbst werden keine fremden Social-Konten ausgestellt.']:
    'Only on your own account — the tool itself never displays anyone else\'s social accounts.',
  'Profilbild': 'Profile picture',
  ['Wird auf 256 Pixel verkleinert und quadratisch zugeschnitten.']:
    'Scaled down to 256 pixels and cropped square.',
  'Bild wählen': 'Choose an image',
  'Passwort ändern': 'Change password',
  'Passwort setzen': 'Set a password',
  'Zum Ändern muss das bisherige Passwort stimmen.': 'Changing it requires your current password.',
  ['Dieses Konto wurde über einen Anmeldedienst angelegt und hat noch kein Passwort. Du bist über den Dienst ausgewiesen, deshalb kannst du hier eines setzen — danach geht beides.']:
    'This account was created through a sign-in service and has no password yet. You are identified through that service, so you can set one here — afterwards both ways work.',
  'bisheriges Passwort': 'current password',
  'neues Passwort — mindestens acht Zeichen': 'new password — at least eight characters',
  'Passwort speichern': 'Save password',
  'Passwort geändert': 'Password changed',
  'Verknüpfte Dienste': 'Linked services',
  'keine — nur E-Mail und Passwort': 'none — email and password only',
  'Konto löschen': 'Delete account',
  ['Das ist endgültig — es gibt keinen Papierkorb. Tipp zur Bestätigung deine E-Mail-Adresse ab.']:
    'This is final — there is no bin. Type your email address to confirm.',
  'endgültig löschen': 'delete for good',
  'nicht gelöscht': 'not deleted',

  // Bedienung der Kacheln
  ['Keine Kachel ausgewählt. Mit dem Plus in der Streamerliste welche hinzufügen.']:
    'No tiles picked. Add some with the plus in the streamer list.',
  'Wieder alle laufenden zeigen': 'Show everyone who is live again',
  'Dieser Stream hat den Ton': 'This stream has the sound',
  'Ton auf diesen Stream legen': 'Put the sound on this stream',
  'Diesen Stream neu laden': 'Reload this stream',
  'Diese Kachel entfernen': 'Remove this tile',

  // VIP-Zugang
  'Benutzername': 'Username',
  'verbergen': 'hide',
  'zeigen': 'show',
  'Schlüssel vergessen? Melde dich bei': 'Lost your key? Get in touch with',
  'Anmeldung fehlgeschlagen. Bitte die Angaben prüfen.': 'Sign-in failed. Please check your details.',
  ['Anmeldung fehlgeschlagen. Bitte die Verbindung prüfen.']:
    'Sign-in failed. Please check your connection.',
  'In die Kachelansicht nehmen': 'Add to the multi view',
  'Aus der Kachelansicht nehmen': 'Remove from the multi view',

  // Vergleichsliste der Spieltage
  'Schnitt Elims': 'Avg. elims',
  'Meiste Elims': 'Most elims',
  'Wenigste Elims': 'Fewest elims',

  // Konto und VIP-Zugang
  'VIP': 'VIP',
  ['Der VIP-Zugang ist etwas anderes als ein CompHub-Konto: er wird vergeben, nicht angelegt. Wer keinen Schlüssel hat, registriert sich links.']:
    'VIP access is not the same as a CompHub account: it is granted, not created. Without a key, register on the left.',

  // Kachelansicht der Streams
  'Multi view': 'Multi view',
  'Single view': 'Single view',
  'Alle laufenden Streams nebeneinander zeigen': 'Show every running stream side by side',
  'Sound': 'Sound',
  'muted': 'muted',
  ['{n} weitere senden gerade — in der Liste ausblenden, um sie hier zu tauschen.']:
    '{n} more are live — hide some in the list to swap them in here.',
  'Ohne Namen': 'No name',
  'Land wählen': 'Pick a country',

  // Werkzeugleiste der Karten
  'Ortsnamen': 'Place names',
  'Vollbild': 'Full screen',
  'Vollbild verlassen': 'Leave full screen',
  'Spielernamen anzeigen': 'Show player names',
  'Karte sperren': 'Lock the map',
  'Karte entsperren': 'Unlock the map',
  'Alle Spieler entfernen (Formen bleiben)': 'Remove all players (the shapes stay)',
  'Freie Form zeichnen': 'Draw a free shape',
  'Rechteck zeichnen': 'Draw a rectangle',
  'Als Bild speichern': 'Save as an image',
  'Teams': 'Teams',
  ['{a} Teams geladen, {b} Spieler mit Bild.']:
    '{a} teams loaded, {b} players with a photo.',

  // Zeitangaben, Wertungen und Turnierfilter
  'gerade eben': 'just now',
  'vor {n} Minuten': '{n} minutes ago',
  'vor {n} Stunde': '{n} hour ago',
  'vor {n} Stunden': '{n} hours ago',
  'vor {n} Tag': '{n} day ago',
  'vor {n} Tagen': '{n} days ago',
  'in {n} Min.': 'in {n} min',
  'in {n} Std.': 'in {n} h',
  'in {n} Tagen': 'in {n} days',
  'heute': 'today',
  'gestern': 'yesterday',
  'läuft': 'live',
  'beendet': 'finished',
  '{n} weitere unter „Alle“': '{n} more under “All”',
  'Alle {n} anzeigen': 'Show all {n}',
  'Stand': 'as of',
  'Ranglisten': 'Rankings',
  'Streams': 'Streams',
  'Schlechteste Schadensquote': 'Worst damage ratio',
  'Meiste Assists': 'Most assists',
  'Meistes Material': 'Most materials',
  'Beste Trefferquote': 'Best accuracy',
  'Meiste Wiederbelebungen': 'Most revives',
  'Meiste Matches': 'Most matches',
  'Sonstige': 'Other',

  // Meldungen aus mehrteiligen Texten
  ['Neue Karte — Bild wählen, Formen setzen, dann speichern']:
    'New map — pick an image, set the shapes, then save',
  ['Karte aus dieser Prognose genommen — noch nicht gespeichert']:
    'Map removed from this prediction — not saved yet',
  ['Gelöscht — was auf dem Schirm steht, ist noch da, aber nicht gesichert']:
    'Deleted — what is on screen is still there, but not stored',
  ['Geladen — auf „Feld laden“ klicken, um die Teams zu holen']:
    'Loaded — click “Load field” to fetch the teams',
  ['Nicht gespeichert — beim nächsten Tippen versuche ich es erneut.']:
    'Not saved — I will try again on your next keystroke.',

  // Statusmeldungen - erscheinen erst nach einer Aktion
  'Alle Spieler entfernt, Formen bleiben': 'All players removed, the shapes stay',
  'Beim Ablegen kam kein Team an': 'No team arrived on drop',
  'Bild gespeichert': 'Image saved',
  'Bild wird hochgeladen…': 'Uploading the image…',
  'Umschalten fehlgeschlagen': 'Could not switch',
  'Archiv nicht lesbar': 'Archive cannot be read',
  'fehlgeschlagen': 'failed',
  'Bild konnte nicht gelesen werden.': 'The image could not be read.',
  ['Bitte den Text unten markieren und mit Strg+C kopieren.']:
    'Please select the text below and copy it with Ctrl+C.',
  'Erst einen Spieler wählen.': 'Pick a player first.',
  'Farben aus dem Trikot übernommen.': 'Colours taken from the jersey.',
  'Im Bild waren keine kräftigen Farben zu finden.': 'No strong colours were found in the image.',
  ['Kopiert. In OBS: Quelle hinzufügen → Browser → URL einfügen.']:
    'Copied. In OBS: add a source → Browser → paste the URL.',
  ['Der Browser gibt die Zwischenablage nicht frei — bitte das Bild speichern.']:
    'The browser will not release the clipboard — please save the image instead.',
  'Vorschlag nicht abrufbar.': 'The suggestion could not be fetched.',
  'Dort ist keine Form — zieh das Team auf einen Spot': 'There is no shape there — drag the team onto a spot',
  'Erst Spieltage anhaken': 'Tick some sessions first',
  'Erst einen Cup wählen': 'Pick a cup first',
  'Form entfernt — noch nicht gespeichert': 'Shape removed — not saved yet',
  'Gelöscht': 'Deleted',
  'Löschen fehlgeschlagen': 'Could not delete',
  'Neue Form — noch nicht gespeichert': 'New shape — not saved yet',
  'Nichts zu speichern': 'Nothing to save',
  'Speichern fehlgeschlagen': 'Could not save',
  'Umbenennen fehlgeschlagen': 'Could not rename',
  'Nicht angemeldet': 'Not signed in',
  'Zu diesem Cup liegen keine Daten mehr vor.': 'There is no data left for this cup.',

  // Ueberschriften und Kartentitel
  'Reihenfolge': 'Order',
  'Spots': 'spots',
  'verteilt': 'placed',
  'Turnier-Replays': 'Tournament replays',

  // Was der Durchgang im Browser noch deutsch vorfand
  ['Nur laufende und vergangene Cups, denn zu einem kommenden gibt es noch kein Teilnehmerfeld.']:
    'Only running and past cups — an upcoming one has no field yet.',
  'Weiter bis Platz': 'Advancing down to place',
  'lädt…': 'loading…',
  'Feld laden': 'Load field',
  'Formen': 'Shapes',
  'Karte': 'Map',
  'Feld': 'Field',
  'gesetzt': 'placed',
  'Herauszoomen': 'Zoom out',
  'Bild': 'Image',
  'Titel': 'Title',
  'Ansicht zurücksetzen — wieder mittig, ohne Zoom': 'Reset the view — centred again, no zoom',
  ['Wer wo landet. Ortsnamen und Breitbild lassen sich rechts umschalten.']:
    'Who lands where. Place names and the wide view can be toggled on the right.',
  'Noch keine Teams geladen.': 'No teams loaded yet.',
  'Noch keine Teams eingetragen.': 'No teams placed yet.',
  'Hineinzoomen': 'Zoom in',
  'Punkte': 'Points',
  'Spiele': 'Games',
  'Siege': 'Wins',
  'Schaden erhalten': 'Damage taken',
  'Überlebenszeit': 'Time alive',
  'Ø Punkte': 'Avg. points',
  'Ø Elims': 'Avg. elims',
  'Ø Überlebenszeit': 'Avg. time alive',
  'Bester Platz': 'Best place',
  'lädt …': 'loading …',
  'nicht ladbar': 'cannot be loaded',
  'Wie weit suchen — bis Platz': 'How far to search — down to place',
  'Kein Schlüssel hinterlegt': 'No key stored',
  'Beitrag erstellen': 'Create a post',
  ['Cup wählen, Vorlage wählen — Text und Grafik entstehen aus den Turnierdaten von Epic.']:
    'Pick a cup, pick a template — text and graphic are built from Epic\'s tournament data.',
  'Daten laden': 'Load data',
  ['FNCS, Cash Cups und Finals — Endstand und Qualifikation']:
    'FNCS, Cash Cups and finals — final standings and qualification',

  // Hinweiszeilen in Prognosen, Karten und Beitraegen
  'Dieser Cup hat noch keinen gelaufenen Spieltag.': 'This cup has not had a session yet.',
  ['Zu diesem Kartenbild sind noch keine Formen gezeichnet.']:
    'No shapes have been drawn on this map image yet.',
  'Spieltage anhaken und auf „Feld laden“ klicken.': 'Tick the sessions and click “Load field”.',
  'Übrige Plätze': 'Remaining places',
  'Noch kein Feld geladen.': 'No field loaded yet.',
  'Gruppe oder Karte': 'Group or map',
  'frei': 'free text',
  ['Cup wählen, Spieltage anhaken, Feld laden — dann die Reihenfolge setzen.']:
    'Pick a cup, tick the sessions, load the field — then set the order.',
  'Gespeichert und öffentlich sichtbar': 'Saved and publicly visible',
  'Eventseite öffnen': 'Open the event page',
  'Gespeichert — aber noch nicht öffentlich': 'Saved — but not public yet',
  'Plätze im Beitrag': 'Places in the post',
  'Kurzbefehl — Enter drückt ab': 'Shortcut — Enter fires it',
  'Plätze wie': 'Places such as',
  'und jeder Name': 'and any name',

  // Hinweistexte der Werkzeugleisten
  'Alles, was das Kurzbefehl-Feld versteht': 'Everything the shortcut field understands',
  'Beitrag schreiben oder links einen Baustein wählen…': 'Write a post, or pick a building block on the left…',
  ['Die Formen zusätzlich für jede künftige Karte übernehmen']:
    'Also keep these shapes for every future map',
  'Die eingetragenen Teams ein- und ausblenden': 'Show or hide the teams that have been placed',
  ['Diese Karte aus der Prognose nehmen — das Kartenbild bleibt erhalten']:
    'Remove this map from the prediction — the map image is kept',
  'Diese Prognose endgültig entfernen': 'Delete this prediction for good',
  'Dieses Turnier meldet den Wert nicht': 'This tournament does not report that value',
  ['Eine weitere Karte für denselben Spieltag — gleiche Reihenfolge']:
    'Another map for the same session — same order',
  'Eine weitere Prognose zu diesem Cup anlegen': 'Add another prediction for this cup',
  'Flaggen dieses Teams von Hand setzen': 'Set this team\'s flags by hand',
  'Formen verschieben und ihre Ecken versetzen': 'Move shapes and drag their corners',
  ['Formen, Karte und Zuordnung in dieser Prognose festhalten']:
    'Save shapes, map and assignment in this prediction',
  ['Freie Form: Ecken klicken, am ersten Punkt schließen']:
    'Free shape: click the corners, close at the first point',
  'Ganze Karte': 'Whole map',
  'Gruppe oder Karte (frei)': 'Group or map (free text)',
  'Klick entfernt das Team von dieser Form': 'Click removes the team from this shape',
  'Name der Karte': 'Map name',
  'Namen der Karte ändern': 'Rename the map',
  'Nur die besten N übernehmen': 'Take only the top N',
  'Ortsnamen auf der Karte ein- und ausblenden': 'Show or hide the place names on the map',
  'Rechteck aufziehen': 'Drag a rectangle',
  ['Region — nur nötig, wenn das Land nicht eindeutig ist (etwa NAC/NAW)']:
    'Region — only needed when the country is ambiguous (NAC/NAW, say)',
  'Solo-Cup — jeder Eintrag ist ein Spieler': 'Solo cup — every entry is one player',
  'Spieler, Land oder Region suchen…': 'Search by player, country or region…',
  'Titel und Gruppe ändern': 'Change title and group',
  'Werte je Team, direkt von Epic': 'Per-team values, straight from Epic',
  ['Wie der Spieler wirklich heisst - gilt dann ueberall']:
    'The player\'s real name — used everywhere from then on',
  'Zurück in die Liste': 'Back to the list',
  'Doppelklick zum Umbenennen': 'Double-click to rename',
  ['Wie viele Teams geladen werden. Für eine Finalkarte zählt nur, wer weitergekommen ist.']:
    'How many teams are loaded. For a finals map only those who advanced count.',

  // Overlay-Einstellungen
  'Akzent': 'Accent',
  'Zweitfarbe': 'Secondary colour',
  'Hintergrund': 'Background',
  'Verlauf nach': 'Gradient to',
  'Nebentext': 'Muted text',
  'Form': 'Shape',
  'Rundung': 'Corner radius',
  'Schräge': 'Slant',
  'Innenabstand': 'Padding',
  'Größe': 'Size',
  'Animationen': 'Animations',
  'Org-Logos zeigen': 'Show org logos',
  'Aktualisierung': 'Refresh',
  'Abgerundet': 'Rounded',
  'Schräg rechts — die Zacke': 'Slanted right — the notch',
  'Schräg links': 'Slanted left',
  'Parallelogramm': 'Parallelogram',
  'Pfeil nach rechts': 'Arrow to the right',
  'Etikett — Spitze links': 'Tag — point on the left',
  'Ecke gekappt': 'Corner cut',
  'Zwei Ecken gekappt': 'Two corners cut',
  'Fortschrittsbalken zeigen': 'Show progress bar',
  'Nicht mit Epic Games verbunden.': 'Not affiliated with Epic Games.',

  // Nachtrag: was auf Englisch deutsch blieb
  'Ausblenden': 'Hide',
  'Fehler': 'Error',
  'Ja, ausblenden': 'Yes, hide',
  'Spieler zuordnen': 'Assign players',
  'Wirklich aus allen Listen nehmen?': 'Really remove from every list?',
  'Zeitpunkt': 'Time',
  'Turnierstatistik': 'Tournament stats',
  'schließen': 'close',

  // Konto und Anmeldung
  'Anmelden': 'Sign in',
  'Registrieren': 'Register',
  'Konto anlegen': 'Create account',
  'E-Mail-Adresse': 'Email address',
  'Passwort': 'Password',
  'Passwort — mindestens acht Zeichen': 'Password — at least eight characters',
  'einen Moment …': 'one moment …',
  'Registrieren mit': 'Register with',
  'Anmelden mit': 'Sign in with',
  'nicht eingerichtet': 'not configured',
  'In .env.local fehlen die Zugangsdaten': 'Credentials are missing in .env.local',
  'zur Startseite': 'to the home page',
  ['Ohne Konto ist alles zu sehen. Angemeldet bleiben deine Streamwände, Ordner und Tierlists erhalten.']:
    'Everything is visible without an account. Signed in, your stream walls, folders and tier lists are kept.',
  'Mein Konto': 'My account',
  'abmelden': 'sign out',
  'Konto': 'Account',
  'nicht bestätigt': 'not confirmed',
  'Meine Socials': 'My socials',
  'Mein Epic-Konto': 'My Epic account',
  '32 Zeichen aus 0-9 und a-f': '32 characters from 0-9 and a-f',
  ['Trägst du deine Epic-Konto-Id ein, stehen hier deine eigenen Werte aus dem Turnierarchiv — dieselben wie in jedem Spielerprofil. Über die Statistikseite findest du sie, indem du dich dort suchst.']:
    'Enter your Epic account ID and your own figures from the tournament archive appear here — the same ones as in any player profile. Find it by searching for yourself on the statistics page.',
  'Statistiken, Turniere und Streams an einem Ort.': 'Stats, tournaments and streams in one place.',
  ['Zehn Saisons, sieben Regionen — vom Chapter-5-Archiv bis zum Spieltag von gestern.']:
    'Ten seasons, seven regions — from the Chapter 5 archive to yesterday’s matches.',
  'Mit Umschalt anklicken, um mehrere zu verbinden': 'Shift-click to combine several',
  'verbunden': 'combined',

  // Startseite
  'Jedes Turnier. Jeder Spieltag. Jeder Spieler.': 'Every tournament. Every match day. Every player.',
  ['Von Chapter 5 bis heute — Statistiken, Ranglisten und Streams an einem Ort.']:
    'From Chapter 5 to today — stats, rankings and streams in one place.',
  'Statistiken ansehen': 'View stats',
  'Streams öffnen': 'Open streams',
  'Spieltage im Archiv': 'Match days archived',
  'Saisons erfasst': 'Seasons covered',
  'Matches ausgewertet': 'Matches processed',
  ['Live aus dem eigenen Archiv — keine geschätzten Zahlen.']:
    'Live from our own archive — no estimated figures.',
  'Was hier drin steckt': 'What is in here',
  'Sechs Bereiche, eine Datengrundlage.': 'Six areas, one set of data.',
  'öffnen': 'open',
  ['Jeder Spieler, jeder Spieltag, jede Kennzahl — Schaden, Material, Bauteile, Trefferquote. Mit Verlauf über alle Chapter.']:
    'Every player, every match day, every metric — damage, materials, builds, accuracy. With a history across all chapters.',
  ['Der komplette Kalender aller Regionen: was läuft, was kommt, was vorbei ist — mit Endstand und Qualifikation.']:
    'The full calendar for every region: what is live, what is next, what is over — with standings and qualification.',
  ['Epics weltweite Power Rankings, täglich erneuert, mit dem Unterschied zur Vorwoche.']:
    'Epic’s global Power Rankings, refreshed daily, with the change from last week.',
  ['Eigene Tierlists bauen und teilen — Spieler ziehen, Stufen benennen, als Bild speichern.']:
    'Build and share your own tier lists — drag players, name the tiers, save as an image.',
  ['Mehrere Twitch-Streams nebeneinander, in eigenen Ordnern, mit Live-Anzeige und gemeinsamem Chat.']:
    'Several Twitch streams side by side, in your own folders, with live status and a shared chat.',
  ['Einblendungen für den eigenen Stream — aus denselben Turnierdaten gespeist, ohne Abtippen.']:
    'Overlays for your own stream — fed from the same tournament data, with no retyping.',
  'Woher die Zahlen kommen': 'Where the numbers come from',
  ['Turnierkalender, Bestenlisten, Platzierungen und Mitspieler — direkt aus der offiziellen Schnittstelle.']:
    'Tournament calendar, leaderboards, placements and teammates — straight from the official API.',
  ['Die Einzelwerte je Spieler: Schaden, Material, Bauteile, Treffer. Ohne sie gäbe es diese Tiefe nicht.']:
    'The per-player values: damage, materials, builds, hits. Without them this depth would not exist.',
  ['Eliminierungen, Knocks und Waffe je Match — selbst ausgewertet, aus Epics eigenen Server-Replays.']:
    'Eliminations, knocks and weapon per match — processed by us, from Epic’s own server replays.',
  ['Fehlt eine Zahl bei der Quelle, bleibt sie hier leer — statt geschätzt zu werden.']:
    'If a figure is missing at the source it stays empty here — rather than being estimated.',
  'Mit Konto mehr': 'More with an account',
  ['Ohne Anmeldung ist alles zu sehen. Angemeldet bleiben deine Streamwände, Ordner und Tierlists erhalten — auf jedem Gerät.']:
    'Everything is visible without signing in. Signed in, your stream walls, folders and tier lists are kept — on every device.',
  'Loslegen': 'Get started',
  'Mit Twitch anmelden': 'Sign in with Twitch',
  ['Nicht mit Epic Games verbunden. Turnierdaten von Epic Games und eucompetitive.com.']:
    'Not affiliated with Epic Games. Tournament data from Epic Games and eucompetitive.com.',

  // Player Center, zweite Runde
  'mit Foto': 'with photo',
  'ohne Foto': 'no photo',
  'selbst eingetragen': 'set by me',

  // Bildvorrat
  'Bildvorrat': 'Image library',
  'Logos und Grafiken ablegen': 'Store logos and graphics',
  'png, jpg, webp, gif, svg — bis 20 MB je Datei':
    'png, jpg, webp, gif, svg — up to 20 MB per file',
  'Dateien hierher ziehen oder klicken': 'Drop files here or click',
  'wird hochgeladen …': 'uploading …',
  'Ziel': 'Target',
  'Erst einen Ordner wählen oder benennen.': 'Pick or name a folder first.',
  'Dieser Ordner ist leer.': 'This folder is empty.',
  'Links einen Ordner wählen.': 'Pick a folder on the left.',
  ['Noch kein Ordner. Unten einen Namen eintragen und Dateien hineinziehen.']:
    'No folder yet. Type a name below and drop files in.',
  'neuer Ordner, z. B. EWC 2026': 'new folder, e.g. EWC 2026',
  'neuer Ordner, z. B. Peterbot': 'new folder, e.g. Peterbot',
  'abgelegt': 'stored',
  'endgültig löschen?': 'delete for good?',

  // Overlay-Banner
  'oder die Besten dieses Spieltags zeigen': 'or show the top of this match day',
  'Namen eintippen und suchen.': 'Type a name and search.',
  ['Spieler suchen — auch Platz 12 000']:
    'Search a player — rank 12,000 too',
  'gespielt': 'played',
  ['Nicht dabei — dieser Spieler steht in diesem Spieltag nicht in der Liste.']:
    'Not there — this player does not appear in this match day.',
  'Meine Vorlagen': 'My presets',
  ['Gespeichert werden Duo und Aussehen — nicht der Cup. Die Adresse zeigt immer auf den aktuellen Spieltag deiner Region.']:
    'What gets saved is the duo and the look — not the cup. The address always points at the current match day of your region.',
  'Name der Vorlage': 'Preset name',
  'Adresse': 'Address',
  'laden': 'load',
  'Vorlage löschen': 'Delete preset',
  'Noch nichts gespeichert.': 'Nothing saved yet.',
  ['Ein Banner für deinen Stream — Cup wählen, Duo wählen, fertig.']:
    'A banner for your stream — pick a cup, pick a duo, done.',
  'Cup und Spieltag': 'Cup and match day',
  'Cup suchen — auch vergangene': 'Search a cup — past ones too',
  'Epic-Anmeldung': 'Epic sign-in',
  'Kein Spieltag gefunden.': 'No match day found.',
  'weniger zeigen': 'show fewer',
  'weitere zeigen': 'more',
  'Duo': 'Duo',
  ['Spieler dieses Spieltags laden']:
    'Load the players of this match day',
  'Niemand gefunden.': 'Nobody found.',
  'Aussehen': 'Look',
  'Wie deckend die Mitte ist': 'How solid the middle is',
  'Höhe': 'Height',
  ['Adresse kopiert — in OBS als Browser-Quelle einfügen.']:
    'Address copied — add it in OBS as a browser source.',
  ['Bitte den Text markieren und mit Strg+C kopieren.']:
    'Please select the text and copy it with Ctrl+C.',
  'Bestenliste als zweites Overlay': 'Leaderboard as a second overlay',
  ['Die ganze Tabelle des Spieltags — als eigene Browser-Quelle, die du in OBS ein- und ausblendest.']:
    'The full table of the match day — as its own browser source that you show and hide in OBS.',
  'Nacht': 'Night',
  'Kohle': 'Charcoal',
  'Eis': 'Ice',
  'Glut': 'Ember',
  'Rein': 'Clean',

  // Mein Turnierweg
  'Spieler nachschlagen': 'Look up a player',
  'zuletzt': 'recent',
  ['Tipp einen Spielernamen und wähle ihn aus der Liste — danach stehen seine Werte aus dem Turnierarchiv da. Wen du einmal gewählt hast, findest du unter dem Feld wieder.']:
    'Type a player name and pick it from the list — then their values from the tournament archive show up. Whoever you picked once, you find again below the field.',
  'Platzierung': 'Placement',
  'Mein Turnierweg': 'My tournament run',
  ['Dein eigenes Abschneiden, Runde für Runde — aus Epics Bestenliste.']:
    "How you did, round by round — straight from Epic's leaderboard.",
  ['Sobald der Betreiber dir dein Epic-Konto zugewiesen hat, steht hier dein eigener Turnierweg.']:
    'Once the operator has assigned your Epic account, your own tournament run shows up here.',
  '— Turnier wählen —': '— pick a tournament —',
  ['Wähle ein Turnier — danach steht hier jede Runde, in der du angetreten bist.']:
    'Pick a tournament — then every round you played shows up here.',
  'nicht dabei': 'did not play',
  'Ergebnis': 'Result',
  'Kampf': 'Combat',
  'Material und Wege': 'Materials',
  'Beste Platzierung': 'Best place',
  'Punkte je Spiel': 'Points / match',
  'Platz im Schnitt': 'Avg. placement',
  'Eliminierungen je Spiel': 'Elims / match',
  'Schaden ausgeteilt': 'Damage dealt',
  'Zeit am Leben je Spiel': 'Alive / match',
  'Geheilt': 'Health healed',
  'Schild aufgebaut': 'Shield gained',
  'Material gefarmt': 'Materials farmed',
  'Material verbaut': 'Materials used',
  'Truhen geöffnet': 'Chests opened',
  'Spiel für Spiel': 'Match by match',
  'Spiel': 'Match',
  ['Zu diesem Cup führt Epic nur Platz, Punkte und Spiele — Schaden, Material und Heilung bleiben dort leer.']:
    'For this cup Epic only reports rank, points and matches — damage, materials and healing stay empty there.',
  ['Epic bucht je Duo, nicht je Person — diese Zahlen gelten für euch beide zusammen.']:
    'Epic records per duo, not per person — these numbers cover both of you together.',
  ['In diesem Turnier steht dein Konto in keiner Runde.']:
    'Your account does not appear in any round of this tournament.',

  // Turnierkarte: das eigene Duo
  'zum Event': 'to the event',
  'zu': 'to',
  'Breitbild': 'Wide view',
  'Breitbild verlassen': 'Leave wide view',
  'Dein Team': 'Your Team',
  'Von der Karte nehmen': 'Take off the map',
  'Kein Team gefunden für': 'No team found for',
  'Auf der Karte zeigen': 'Show on the map',
  'Nicht gespeichert': 'Not saved',
  'Dein Platz ist gespeichert': 'Your spot is saved',
  'Du stehst nicht mehr auf der Karte': 'You are no longer on the map',
  'Die Karte ist gesperrt — zum Verteilen erst das Schloss öffnen.':
    'The map is locked — open the lock before placing anyone.',
  'Nur Ansicht — zum Verteilen oben auf „Diese Karte bearbeiten“ klicken.':
    'View only — click “Edit this map” above to place teams.',
  'Suche leeren': 'Clear search',
  'automatisch': 'automatic',

  // Anmeldedienste
  'Anmeldedienste': 'Sign-in services',
  'Twitch, Discord und Google einrichten': 'Set up Twitch, Discord and Google',
  'Client-Id und Secret einfügen — ohne Datei und ohne Neustart.':
    'Paste client ID and secret — no file, no restart.',
  'eingetragen': 'entered here',
  'aus .env.local': 'from .env.local',
  'Eintrag löschen': 'remove entry',
  'Holen bei': 'Get it at',
  'dort als Rückruf eintragen:': 'register this callback there:',
  'Nichts zu zeigen.': 'Nothing to show.',

  // Player Center
  'Player Center': 'Player Center',
  'Flaggen und @-Konten pflegen': 'Maintain flags and @ handles',
  ['Flagge und @-Konto hängen an der Konto-ID, nicht am Namen — ein '
    + 'Namenswechsel ändert nichts.']:
    'Flag and @ handle are tied to the account ID, not the name — a name '
    + 'change makes no difference.',
  'Name, alter Name oder Konto-ID': 'Name, old name or account ID',
  'Flagge': 'Flag',
  '@-Konto': '@ handle',
  'ohne @': 'without @',
  'bearbeiten': 'edit',
  'abbrechen': 'cancel',
  'weitere anzeigen': 'show more',
  'aus der Szene-Quelle — noch nicht bestätigt':
    'from the scene source — not confirmed yet',
  'von Hand gepflegt': 'maintained by hand',
  'Dieser Bereich ist dem Adminkonto vorbehalten.':
    'This area is reserved for the admin account.',

  // Turniergrafik auf Epics Vorlage
  'Turniergrafik': 'Tournament graphic',
  'Titel — leer: Champions bzw. der Platz': 'Title — empty: Champions or the placement',
  ['Die Schrift lädt noch — die Grafik nutzt solange eine Ersatzschrift.']:
    'The font is still loading — the graphic uses a fallback for now.',

  // Zuordnungsliste im Beitrags-Panel
  'Spieler suchen — auch alte Namen und @-Konten':
    'Search players — old names and @ handles too',
  'zurücksetzen': 'reset',
  'ohne Profil': 'no profile',
  'ohne Flagge': 'no flag',
  'ohne @-Konto': 'no @ handle',
  'gepflegt': 'maintained',
  'Niemand passt dazu.': 'Nobody matches.',

  // Fotomosaik im Beitrags-Panel
  'Spielerbild': 'Player image',
  'Bild kopieren': 'Copy image',
  'kopiert': 'copied',
  'speichern': 'save',
  'Bild wird gebaut …': 'Building image …',
  'Zu diesen Spielern liegen keine Fotos vor.':
    'No photos available for these players.',

  // Replay-Verwaltung
  'Replay-Verwaltung': 'Replay management',
  'Replays': 'Replays',
  'Turnier-Replays nachsehen': 'Inspect tournament replays',
  'Zurück zum Dashboard': 'Back to the dashboard',
  'Einzelnes Match prüfen': 'Check a single match',
  'Match-ID (32 Zeichen)': 'Match ID (32 characters)',
  'Replay auswerten': 'Process replay',
  'Wird geprüft …': 'Checking …',
  'Eingesammelte Turniere': 'Collected tournaments',
  'Spieler gefunden': 'Players found',
  'Knocks': 'Knocks',
  'Ausgeschaltet': 'Eliminated',
  'Match-ID': 'Match ID',
  'Zustand': 'Status',
  'Ereignisse': 'Events',
  'Auswerter': 'Parser',
  ['Aus den Server-Replays kommen Eliminierungen, Knocks, Waffe und Zeitpunkt '
    + '— und wer wen ausgeschaltet hat. Schaden, Kopftreffer, Material und '
    + 'Bauteile stehen im Netzwerk-Stream, den der offene Parser nicht mehr '
    + 'lesen kann; die bleiben Sache der Szene-Quelle.']:
    'Server replays give eliminations, knocks, weapon and timing — and who '
    + 'eliminated whom. Damage, headshots, materials and builds live in the '
    + 'network stream, which the open-source parser can no longer read; those '
    + 'stay with the scene source.',
  ['Epic hält ein Replay 31 Tage vor. Was in dieser Zeit nicht geholt wird, '
    + 'ist danach für immer fort — deshalb sammelt das Werkzeug planmäßig von '
    + 'selbst und nicht auf Knopfdruck.']:
    'Epic keeps a replay for 31 days. Whatever is not fetched within that '
    + 'window is gone for good — which is why the tool collects on a schedule '
    + 'by itself rather than on a button press.',
  ['Noch nichts eingesammelt. Der planmäßige Lauf holt die Turniere der '
    + 'letzten 31 Tage.']:
    'Nothing collected yet. The scheduled run fetches the tournaments of the '
    + 'last 31 days.',
  ['Epic hält Replays 31 Tage vor. Zu diesem Match gibt es keines (mehr) — '
    + 'das ist kein Fehler.']:
    'Epic keeps replays for 31 days. There is no replay for this match — that '
    + 'is not an error.',
  'nur Platzierung': 'placement only',
  ['Zu diesem Spieltag hat die Statistikquelle noch nichts veröffentlicht. '
    + 'Platz, Matches und Mitspieler stammen aus Epics Bestenliste — '
    + 'Einzelwerte gibt Epic nicht heraus.']:
    'The stats source has not published this match day yet. Placement, matches '
    + 'and teammates come from Epic’s leaderboard — Epic does not provide '
    + 'per-player values.',
  ['In der Heimatregion ist dieser Spieler hier nicht angetreten — seine '
    + 'Spieltage in anderen Regionen stehen unter „Turniere“.']:
    'This player did not compete in their home region here — their match days '
    + 'in other regions are listed under "Tournaments".',
  'Regionaler Rang': 'Regional ranking',
  'Globaler Rang': 'Global ranking',
  'Vergleich über alle erfassten Spieltage':
    'Compared across all recorded match days',
  'Letzte 5': 'Last 5',
  'Letzte 10': 'Last 10',
  'Letzte 20': 'Last 20',
  'Division': 'Division',
  'Performance': 'Performance',
  'FNCS Finals': 'FNCS Grands',
  'FNCS Major': 'FNCS Majors',
  'Reload': 'Reload',
  'Kacheln': 'Tiles',
  'Liste': 'List',
  'Noch niemand gewählt': 'Nobody selected yet',
  'Zwei Spieler wählen, um sie zu vergleichen.':
    'Pick two players to compare them.',
  'Keine Spieltage dieser Art.': 'No match days of this type.',
  'Meiste Eliminierungen': 'Most eliminations',
  'Meister Schaden': 'Most damage dealt',
  'Meiste Treffer': 'Most hits to players',
  'Meiste Kopftreffer': 'Most headshots',
  'Meiste Bauteile': 'Most builds placed',
  'Beste Schadensquote': 'Best damage ratio',
  'Letzte Turniere': 'Latest tournaments',
  'Bestenlisten der Saison': 'Season stats leaders',
  'Bestenlisten dieses Spieltags': 'Leaders of this match day',
  'mit Bild': 'with photo',
  'ohne Bild': 'without photo',
  'Epics weltweite Liste': "Epic's global list",
  'Deutsch': 'German',
  'Englisch': 'English',
  'Sprache': 'Language',

  // --------------------------------------------------- Startseite, Kopf
  'Ordnerliste anzeigen': 'Show folder list',
  'Twitter-Handle bearbeiten': 'Edit Twitter handle',
  'kein Handle': 'no handle',

  // -------------------------------------------------------------- Events
  'Epic ist noch nicht verbunden': 'Epic is not connected yet',
  'global': 'global',
  'Aktuell & kommend': 'Current & upcoming',
  'Standard': 'Standard',
  'Vergangen': 'Past',
  'Was gerade läuft und als Nächstes ansteht':
    'What is running now and what comes next',
  'Reload, Cash Cups, Finals, Opens und Division Cups — auch vergangene':
    'Reload, Cash Cups, Finals, Opens and Division Cups — past ones too',
  'Was schon gelaufen ist, aus dem eigenen Archiv':
    'What has already been played, from our own archive',
  'Jedes Turnier — auch Ranked, Mobile und Skin-Cups':
    'Every tournament — including Ranked, Mobile and skin cups',

  // ---------------------------------------------------------- Ranglisten
  'Globale Bestenliste': 'Global leaderboard',
  'Platz': 'Rank',
  'Veränderung': 'Change',
  'Zeilen': 'Rows',
  'Zu Seite': 'Go to page',
  'Die weltweite Rangliste von Epic — zehntausend Plätze, täglich erneuert.':
    "Epic's global ranking — ten thousand places, refreshed daily.",

  // ----------------------------------- Satzstuecke rund um eine Zahl
  // Diese Stuecke stehen im Quelltext neben einem Ausdruck, etwa
  // `Bestenlisten der Saison {saisonTitel}`. Uebersetzt wird jedes Stueck
  // fuer sich; die Wortstellung geht in beiden Sprachen auf.
  '· alle Regionen': '· all regions',
  'Alle Zahlen aus der Saison': 'All numbers from season',
  '. Oben umschalten vergleicht dieselben beiden in einer anderen Saison.':
    '. Switching above compares the same two in another season.',
  'Rang je Match unter': 'Rank per match among',
  'Spielern mit mindestens zehn Matches, über alle erfassten Spieltage':
    'players with at least ten matches, across all recorded match days',
  'besser als': 'better than',
  'Prozent des Feldes': 'percent of the field',
  'höchstens': 'at most',
  'mindestens': 'at least',
  'Spieltage, ältester links': 'match days, oldest on the left',
  'in der Saison': 'in season',
  'nicht angetreten.': 'did not compete.',
  'Zu diesem Spieltag liegen': 'For this match day there are',
  'keine Einzelwerte vor.': 'no individual values.',
  'Meister Schaden erlitten': 'Most damage taken',
  'nach Eliminierungen über alle erfassten Spieltage, ab 20 Matches':
    'by eliminations across all recorded match days, from 20 matches',
  ['Spieltage, an denen niemand mehr Eliminierungen hatte — gezählt '
    + 'über alle']:
    'Match days on which nobody had more eliminations — counted across all',
  ['Treffer im eigenen Archiv. Bei Gleichstand zählt es für alle, '
    + 'die oben stehen.']:
    'entries in our own archive. On a tie it counts for everyone at the top.',
  'gezeigt — weiter unten wird es ohnehin unwichtig.':
    'shown — further down it stops mattering anyway.',
  'Trat an als': 'Competed as',
  'weiteren': 'more',
  'weitere': 'more',

  // -------------------------------------------------------------- Events
  'Alle Cups mit Leaderboard — direkt von Epic.':
    'Every cup with a leaderboard — straight from Epic.',
  'Im Archiv liegen': 'The archive holds',
  'Turniere an': 'tournaments on',
  'Tagen.': 'days.',
  'Spieltage.': 'match days.',
  'Keine Cups in dieser Auswahl.': 'No cups in this selection.',
  'mit Finale': 'with finals',
  'Alle Regionen': 'All regions',
  'Unter „Alle“ stehen auch Ranked-, Mobile- und Skin-Cups.':
    'Under “All” you also find Ranked, Mobile and skin cups.',
  'Einmalig ausführen:': 'Run once:',
  'weitere unter „Alle“': 'more under “All”',
  // Preisgeld-Abschnitt auf der Eventseite.
  'Für diesen Spieltag wieder eine Karte anbieten':
    'Offer a map for this match day again',
  // Beitrag uebernehmen (Admin-Werkzeug).
  'Beitrag übernehmen': 'Import a post',
  'Text holen': 'Fetch text',
  'holt …': 'fetching …',
  'Eigenes Bild': 'Own image',
  'Übernommen von': 'Imported from',
  'der Text steht jetzt im Feld unten': 'the text is now in the field below',
  'In neuem Tab öffnen': 'Open in a new tab',
  'Entfernen': 'Remove',
  'je Person': 'per player',
  'eigene Angabe': 'own figures',
  'Wertung': 'Scoring',
  'Sieg': 'Victory Royale',
  'je Elimination': 'Per elimination',
  'Treffer im ganzen Bestand': 'matches across everything',
  'Keine Bestenliste — dieses Turnier wird auf einer LAN gespielt.':
    'No leaderboard — this tournament is played on LAN.',
  'Spielerbilder': 'Player images',
  'als PNG speichern': 'save as PNG',
  'baut …': 'building …',
  'Wähle unten Spieler aus — daraus entsteht hier dasselbe Bild mit deinen Leuten.': 'Pick players below - the same image is built here with your people.',
  'Unterschätzte vorschlagen': 'Suggest underrated',
  'Meiste Elims je Match': 'Most elims per match',
  'nichts gefunden': 'nothing found',
  'etwa': 'about',
  'Preisgeld': 'Prize Pool',
  'je Region': 'per region',
  'beste': 'top',
  'Gegenstände': 'Items',
  '← Alle Events': '← All events',
  'Zurück zur Übersicht': 'Back to the overview',
  'Keine Matchdaten.': 'No match data.',
  'Werte je': 'Values per',
  'Ø Platz': 'Avg. place',
  ', direkt von Epic — nur was dieses Turnier mitschickt':
    ', straight from Epic — only what this tournament sends along',
  'Angeboten wird nur, was als Datei vorliegt —':
    'Only what exists as a file is offered —',
  'Doppelklick setzt die Flaggen': 'Double-click sets the flags',
  ['Flaggen. Leer heißt: Herkunft nicht bekannt, dann steht dort der '
    + 'Globus.']:
    'flags. Empty means the origin is unknown, then the globe is shown.',
  ['Gemeinsames Leaderboard über alle Regionen — dieses Turnier '
    + 'wird nicht regional getrennt gewertet.']:
    'One shared leaderboard across all regions — this tournament is not '
    + 'scored per region.',
  'Kürzel suchen — de, ro, us …':
    'Search codes — de, ro, us …',
  'Öffentlich ausblenden — die Karte bleibt erhalten':
    'Hide publicly — the map is kept',

  // -------------------------------------------------------------- Karten
  'Fortnite-Karte': 'Fortnite map',
  'Fortnite-Karte vom': 'Fortnite map of',
  'Karte gesperrt': 'Map locked',
  'Karten zu diesem Spieltag:': 'Maps for this match day:',
  'Eigene Karten:': 'Own maps:',
  'Name der neuen Karte': 'Name of the new map',
  'Namen und Flaggen bearbeiten': 'Edit names and flags',
  'Name + Name': 'Name + name',
  'Nur die besten': 'Only the best',
  'Aus der Form entfernen': 'Remove from the shape',
  'Form löschen': 'Delete shape',
  'Eigene Farbe für diese Form': 'Own colour for this shape',
  'Farbe': 'Colour',
  'ohne eigene Farbe: schwarz bei einem, rot bei zwei Teams':
    'without an own colour: black for one team, red for two',
  'Doppelklick auf eine Form, um sie zu bearbeiten':
    'Double-click a shape to edit it',
  'Punkte setzen — zum Schließen den ersten Punkt anklicken':
    'Place points — click the first point to close the shape',
  'Team aus der Liste auf die Form ziehen.':
    'Drag a team from the list onto the shape.',
  'Ausgeblendete Karten bleiben hier stehen — nichts geht verloren.':
    'Hidden maps stay here — nothing is lost.',
  'kein Cup passt zur Suche': 'no cup matches the search',
  'suchen — Name, Datum, Art': 'search — name, date, type',
  '× · zurücksetzen': '× · reset',
  'Übernehmen': 'Apply',
  '— auswählen —': '— select —',
  '← Zurück': '← Back',

  // ------------------------------------------------------------ Overlays
  'Overlays für OBS': 'Overlays for OBS',
  'Ein Spieler oder Duo': 'One player or duo',
  'Alle Werte eines Teams': 'Every value of one team',
  'Die vordersten Plätze': 'The leading places',
  'Zeigt reihum jeden': 'Shows everyone in turn',
  'Angezeigte Werte': 'Shown values',
  'Liste und Bilder': 'List and photos',
  'Farben, Form, Größe': 'Colours, shape, size',
  'URL für OBS': 'URL for OBS',
  'Spieler aus dem Cup': 'Players from the cup',
  'Optik': 'Appearance',
  '1 · Was soll ins Bild?': '1 · What goes on screen?',
  '2 · Welcher Cup?': '2 · Which cup?',
  '3 · Feineinstellung': '3 · Fine tuning',
  'Vorschau': 'Preview',
  'Banner': 'Banner',
  'Detail-Panel': 'Detail panel',
  'Leaderboard': 'Leaderboard',
  'Rotation': 'Rotation',
  'Formen bleiben je Kartenbild gespeichert, Spieler startest du jedes Mal neu.':
    'Shapes are kept per map image; players start over every time.',
  'erst benennen, dann Datei wählen': 'name it first, then pick the file',
  'Oben einen Cup und Spieltag wählen.':
    'Pick a cup and match day above.',
  ['Live-Daten direkt von Epic. Einstellen, Vorschau prüfen, URL in OBS '
    + 'einfügen.']:
    'Live data straight from Epic. Configure, check the preview, paste the '
    + 'URL into OBS.',
  'Farben vom Spielerbild übernehmen': 'Take colours from the player photo',
  'Name eintippen oder unten aus dem Cup wählen':
    'Type a name or pick one from the cup below',
  ['Nur Spieltage von heute und früher — zu einem Cup, der erst '
    + 'nächste Woche läuft, gibt es noch keine Zahlen.']:
    'Only match days from today and earlier — a cup that runs next week '
    + 'has no numbers yet.',
  ['Ohne Auswahl kommen automatisch alle Spieler dran, für die ein Bild '
    + 'hinterlegt ist.']:
    'With no selection every player who has a photo takes a turn.',
  'Spieler — jeder einzeln': 'Players — each on their own',
  'Team — Partner kommt nicht nochmal einzeln':
    'Team — the partner does not appear again separately',
  'alle Teams': 'all teams',
  'nur mit Bild': 'only with photo',
  'nur ohne Bild': 'only without photo',
  'nur wenn beide ein Bild haben': 'only when both have a photo',
  'nur überblenden': 'cross-fade only',
  'nach oben schieben': 'slide up',
  'zur Seite schieben': 'slide sideways',
  'Mögliche Werte:': 'Possible values:',
  'Einmalig im Projektordner ausführen:': 'Run once in the project folder:',
  ', Org-Logos nach': ', org logos into',
  ['. Der Dateiname muss im Spielernamen vorkommen. Freigestellte PNGs wirken '
    + 'am besten.']:
    '. The file name has to appear in the player name. Cut-out PNGs work best.',
  '— aus —': '— off —',

  // --------------------------------------------------------------- Admin
  'Beiträge': 'Posts',
  'Dashboard': 'Dashboard',
  'Verstanden': 'Got it',
  'Profil': 'Profile',
  'Schnellzugriff': 'Quick access',

  // ----------------------------------------- Warum ein Anmeldedienst abbrach
  'Der Anmeldedienst hat abgebrochen. Meist fehlt dort der Rückweg zu dieser Adresse.':
    'The sign-in service aborted. Usually the callback URL for this address is '
    + 'missing over there.',
  'Der Anmeldevorgang war abgelaufen. Bitte noch einmal versuchen.':
    'The sign-in attempt had expired. Please try again.',
  'Der Anmeldedienst hat den Code nicht angenommen. Client-ID, Secret oder der eingetragene Rückweg passen nicht.':
    'The sign-in service rejected the code. Client ID, secret or the registered '
    + 'callback URL do not match.',
  'Der Anmeldedienst gab kein Profil heraus.':
    'The sign-in service returned no profile.',
  'Dieses Konto hat dort keine bestätigte Adresse — damit lässt sich hier keines anlegen.':
    'That account has no confirmed address there, so no account can be created here.',
  'Der Anmeldedienst hat keine Adresse mitgeschickt.':
    'The sign-in service sent no address along.',
  'Das Konto ließ sich nicht anlegen.': 'The account could not be created.',
  'Da ist etwas schiefgegangen.': 'Something went wrong.',
  'Die Anmeldung hat nicht geklappt.': 'Signing in did not work.',
  'Du bleibst auf diesem Gerät angemeldet, bis du das tust.':
    'You stay signed in on this device until you do.',

  // ------------------------------------------------- Nutzungszahlen unten
  'Nutzung': 'Usage',
  'Tage': 'days',
  'Konten insgesamt': 'Accounts in total',
  'VIP-Konten': 'VIP accounts',
  'VIP-Zugangsschlüssel': 'VIP access keys',
  'Die Zahlen ließen sich nicht laden.': 'The figures could not be loaded.',
  'Besucher': 'Visitors',
  'Browser, die an dem Tag da waren': 'Browsers that were here that day',
  'Seitenaufrufe': 'Page views',
  'Jede geöffnete Seite einzeln': 'Every opened page counted on its own',
  'Neue Konten': 'New accounts',
  'An dem Tag registriert': 'Registered that day',
  'VIP vergeben': 'VIP granted',
  'Konten und Zugangsschlüssel zusammen': 'Accounts and access keys together',
  'im Zeitraum': 'in this period',
  'Höchstwert': 'Peak',
  'wurde damals noch nicht gezählt': 'was not being counted back then',
  'Dafür liegt noch nichts vor — die Zählung beginnt jetzt.':
    'Nothing on record for this yet — counting starts now.',
  'Schraffiert: davor wurde das nicht festgehalten. Erfasst seit':
    'Hatched: not recorded before that. Tracked since',
  'Davon zum ersten Mal hier': 'First time here among them',
  'Bei Konten wird die Vergabe erst ab jetzt festgehalten; ältere Balken zeigen nur die Zugangsschlüssel.':
    'For accounts, the grant is only recorded from now on; older bars show '
    + 'access keys only.',
  'Gezählt werden Browser, nicht Menschen: wer Handy und Rechner benutzt, zählt zweimal, wer seine Daten löscht, gilt danach als neu. Deine eigenen Aufrufe als Admin zählen nicht mit.':
    'Browsers are counted, not people: anyone using a phone and a computer '
    + 'counts twice, and anyone who clears their data counts as new afterwards. '
    + 'Your own visits as an admin are not counted.',
  'Admin-Werkzeuge': 'Admin tools',
  'Twitch-Kanal': 'Twitch channel',
  'Anzeigen': 'Show',
  'Verbergen': 'Hide',
  'Kopieren': 'Copy',
  'Zugangsschlüssel kopiert.': 'Access key copied.',
  'Kopieren fehlgeschlagen.': 'Copying failed.',
  'Multiview': 'Multiview',
  'Streams nebeneinander': 'Streams side by side',
  'Weltweite Bestenliste': 'Global leaderboard',
  'Turnierkarten bauen': 'Build tournament maps',
  'Statistik-Posts erstellen': 'Create stats posts',
  'Vorhersagen zeichnen': 'Draw predictions',
  'Abmelden': 'Sign out',
  'Tierlist': 'Tierlist',
  'Prognosen': 'Predictions',
  'Vorhersagen für Cups': 'Predictions for cups',
  'Turnierkarten zeichnen': 'Draw tournament maps',
  'Beiträge für X': 'Posts for X',
  'Karten': 'Maps',
  'Cups und Leaderboards': 'Cups and leaderboards',
  'Einblendungen für den Stream': 'Overlays for the stream',
  'Spieler einsortieren': 'Sort players',
  'Zugangsschlüssel': 'Access key',
  'sichtbar nur für dich': 'visible only to you',
  ['Diese Seite nicht im Stream zeigen — der Zugangsschlüssel steht '
    + 'hier.']:
    'Do not show this page on stream — the access key is on it.',
  ['Änderungen werden von selbst gespeichert und gelten bei jeder '
    + 'Anmeldung.']:
    'Changes are saved on their own and apply at every sign-in.',
  'Chat ist aus.': 'Chat is off.',
  'Chat wird geladen …': 'Loading chat …',
  'Trag oben deinen Twitch-Kanal ein, dann steht der Chat hier.':
    'Enter your Twitch channel above and the chat appears here.',
  '— für den Chat unten': '— for the chat below',
  '— vom Konto': '— from the account',

  // ------------------------------------------------------------ Kleinkram
  'Du wirst jetzt zurück zum Tool geleitet.':
    'You are being sent back to the tool now.',
  'Name und Flagge ändern': 'Change name and flag',
  'Login erfolgreich': 'Sign-in successful',
  'Erneut versuchen': 'Try again',

  // ------------------------------------------- Statistik, laengere Saetze
  'Datum': 'Date',
  'Gesamt': 'Total',
  'TOP': 'TOP',
  'Treffer %': 'Accuracy %',
  'Mitspieler': 'Teammates',
  'Die stärksten der Saison': 'The season’s strongest',
  'über alle erfassten Spieltage': 'across all recorded match days',
  'aus den Daten gezählt, nicht vergeben': 'counted from the data, not awarded',
  'jede Achse am jeweils höheren Wert gemessen':
    'each axis scaled to the higher of the two values',
  'Netzdiagramm der beiden Spieler': 'Radar chart of both players',
  'Platzierungen laut Quelle': 'Placements according to the source',
  '← Zurück zu den Turnieren': '← Back to tournaments',
  'Zu diesem Spieler liegen keine Vergleichswerte vor.':
    'No comparison values are available for this player.',
  'Zu diesem Spieltag liegen keine Einzelwerte vor.':
    'No individual values are available for this match day.',
  'Oben eine andere Saison wählen oder jemand anderen suchen.':
    'Pick another season above, or search for someone else.',
  'Hier sind alle Spieler der Saison wählbar, nicht nur die mit Foto.':
    'Every player of the season can be picked here, not only those with a photo.',
  // Ein Schluessel in eckigen Klammern, weil er ueber mehrere Zeilen geht -
  // als gewoehnlicher Schluessel liesse er sich nicht umbrechen.
  ['Saison und Platz stammen aus der offenen Spielerliste. Die Werte daneben '
    + 'kommen aus dem eigenen Archiv und gibt es nur ab CH7 S1 — ältere Titel '
    + 'bleiben deshalb leer. Ein Rating und die Mitspieler stehen in keiner '
    + 'der beiden Quellen.']:
    'Season and placement come from the open player list. The values beside '
    + 'them come from our own archive, which starts at CH7 S1 — older titles '
    + 'therefore stay empty. A rating and the teammates are in neither source.',

  // Die Cup-Seite. Der Nutzer hatte auf Englisch gestellt und las dort
  // trotzdem Punkte, Siege, Beginn, Ende und "Tag 1" - diese Woerter
  // standen fest im Text und fehlten hier.
  'Tag': 'Day',
  'Runde': 'Round',
  'Finale': 'Finals',
  'Beginn': 'Start',
  'Ende': 'End',
  'unbegrenzt': 'unlimited',
  'Karten zu diesem Spieltag': 'Maps for this match day',
  'Alle anzeigen': 'Show all',

  // Admin Tools im Dashboard.
  'Admin Tools': 'Admin Tools',
  'Deine Rolle': 'Your role',
  'Werkzeuge': 'Tools',
  'nicht freigegeben': 'not granted',
  'zur Übersicht der Verwaltung': 'to the admin overview',
  ['Du darfst alles — jedes Werkzeug hier ist offen, und du brauchst dafür '
    + 'keinen VIP-Schlüssel.']:
    'You may do everything — every tool here is open, and you do not need a '
    + 'VIP key for it.',
  ['Du darfst genau die Werkzeuge, die dir freigegeben wurden. Die anderen '
    + 'stehen grau da, damit du siehst, was es sonst noch gibt.']:
    'You may use exactly the tools you were granted. The others stay greyed '
    + 'out so you can see what else exists.',
  'Kontoverwaltung': 'Account management',
  'Rollen vergeben, VIP befristen, Konten sperren':
    'Assign roles, time-limit VIP, block accounts',
  'Namen umbenennen, Flaggen und Stufen pflegen':
    'Rename players, maintain flags and tiers',
  'Einblendungen für den Stream bauen': 'Build stream overlays',

  // Die gemeinsame Kontoliste.
  'Schlüssel': 'Key',
};

/**
 * Englische Texte aus dem Quelltext, auf Deutsch.
 *
 * Ein paar Stellen sind im Code englisch gehalten - sie brauchen den Weg in
 * die andere Richtung, damit im deutschen Modus wirklich alles deutsch ist.
 */
const AUF_DEUTSCH: Record<string, string> = {
  'Close': 'Schließen',
  ['Guest mode active: editing is disabled. Log in to manage your own folders.']:
    'Gastmodus: Bearbeiten ist gesperrt. Melde dich an, um eigene Ordner zu verwalten.',
  'Sign in': 'Anmelden',
  ['Note: Login is restricted to selected users. You can use the dashboard '
    + 'only if I have enabled your access.']:
    'Hinweis: Die Anmeldung ist auf ausgewählte Nutzer beschränkt. Das '
    + 'Dashboard lässt sich nur benutzen, wenn ich den Zugang freigeschaltet habe.',

  // Nachtrag: was auf Deutsch englisch blieb
  'Discord:': 'Discord:',
  'Kills': 'Kills',
  'Reset': 'Zurücksetzen',
  'Twitter:': 'Twitter:',
  ['Note: Login is restricted to selected users. You can use the dashboard only if you have been granted access.']:
    'Hinweis: Die Anmeldung ist auf ausgewählte Nutzer beschränkt. Das Dashboard lässt sich nur mit freigeschaltetem Zugang benutzen.',
  '• Add custom streamers (manually selectable)': '• Eigene Streamer hinzufügen (frei wählbar)',
  '• Fully integrated pro players (NA & EU)': '• Profispieler vollständig eingebunden (NA und EU)',
  '• Live stream status and Twitch data': '• Live-Status und Twitch-Daten',
  '• Match statistics in real-time': '• Matchstatistiken in Echtzeit',
  '• Overview of all tournaments and leaderboards': '• Übersicht aller Turniere und Bestenlisten',
  '• Player overview and leaderboards': '• Spielerübersicht und Bestenlisten',
  'Loading…': 'Lädt …',
  'Loading...': 'Lädt …',
  'Save': 'Speichern',
  'Cancel': 'Abbrechen',
  'Search': 'Suchen',
  'Home': 'Start',
  'Events': 'Turniere',
  'Rankings': 'Ranglisten',
  'Overlays': 'Overlays',
  'Finish tour': 'Rundgang beenden',
  'Skip': 'Überspringen',
  'Next': 'Weiter',
  'Back': 'Zurück',
  'Live': 'Live',
  'Try again': 'Erneut versuchen',
  'What this does': 'Was das Werkzeug macht',
  'No access?': 'Kein Zugang?',
  'Contact': 'Kontakt',
  'VIP Login': 'VIP-Anmeldung',
  'Logout': 'Abmelden',

  // ---------------------------------------------------------- Startseite
  'Streamer Dashboard': 'Streamer-Übersicht',
  'My folders': 'Meine Ordner',
  'Folder name': 'Ordnername',
  'Edit folder name': 'Ordnernamen ändern',
  '+ New folder name...': '+ Neuer Ordnername …',
  'Folder / streamer search...': 'Ordner oder Streamer suchen …',
  'Add streamer': 'Streamer hinzufügen',
  'Create': 'Anlegen',
  'Remove': 'Entfernen',
  'Previous': 'Zurück',
  'Toggle chat': 'Chat ein- und ausblenden',
  'No chat loaded': 'Kein Chat geladen',
  'No stream selected': 'Kein Stream gewählt',
  'Looking for streamers...': 'Suche nach Streamern …',
  'Offline': 'Offline',
  'LIVE': 'LIVE',
  'Live!': 'Live!',
  'Dashboard tour': 'Rundgang',
  'Preview tour active': 'Rundgang läuft',
  'Preview mode enabled': 'Vorschau eingeschaltet',
  'Preview tour ended': 'Rundgang beendet',
  'Streamer add/remove disabled':
    'Streamer hinzufügen und entfernen ist gesperrt',
  'Folder creation is disabled in guest mode. Log in to manage folders.':
    'Im Gastmodus lassen sich keine Ordner anlegen. Zum Verwalten bitte anmelden.',
  ['Guest mode active: editing and multiview are disabled. '
    + 'Log in to unlock VIP features.']:
    'Gastmodus: Bearbeiten und Multiview sind gesperrt. '
    + 'Zum Freischalten bitte anmelden.',
  ['This preview is read-only. All dashboard controls are disabled '
    + 'while the tour is open.']:
    'Diese Vorschau ist nur zum Ansehen. Während des Rundgangs sind alle '
    + 'Bedienelemente gesperrt.',
  ['This tour guides you through the dashboard only. User interaction is '
    + 'limited until the tour is finished.']:
    'Der Rundgang führt nur durch die Übersicht. Bis er beendet ist, lässt '
    + 'sich nichts bedienen.',

  // ---------------------------------------------------------- Ranglisten
  'Power Rankings': 'Power Rankings',
  'Go to VIP benefits': 'Zu den VIP-Vorteilen',
  ['Power rankings preview is only available during the guided dashboard '
    + 'tour. Please log in to continue.']:
    'Die Vorschau der Power Rankings gibt es nur während des Rundgangs. '
    + 'Zum Weitermachen bitte anmelden.',
  ['This ranking preview is read-only. You can browse scores and use '
    + 'filters, but no account changes are made.']:
    'Diese Vorschau ist nur zum Ansehen: Werte und Filter lassen sich '
    + 'benutzen, am Konto ändert sich nichts.',

  // --------------------------------------------------------- Kleinkram
  'Fortnite Events': 'Fortnite-Turniere',
  'We are switching pages. Please wait a moment.':
    'Die Seite wird gewechselt. Einen Augenblick bitte.',
  'Leaderboard cache': 'Zwischenspeicher der Bestenliste',
  'Updating…': 'Wird erneuert …',
  'Will load once…': 'Wird einmal geladen …',
  'idle': 'ruht',
};

/**
 * Einen Text in die gewaehlte Sprache bringen.
 *
 * Was nicht in der Tabelle steht, kommt unveraendert zurueck - eine fehlende
 * Uebersetzung faellt dann als deutsches Wort im englischen Modus auf und
 * laesst sich hier in einer Zeile nachtragen.
 */
export function uebersetze(text: string, sprache: Sprache): string {
  if (!text) return text;
  return (sprache === 'en' ? AUF_ENGLISCH[text] : AUF_DEUTSCH[text]) ?? text;
}

/** Wie viele Texte die Tabelle kennt - fuer eine schnelle Kontrolle. */
export const UMFANG = {
  englisch: Object.keys(AUF_ENGLISCH).length,
  deutsch: Object.keys(AUF_DEUTSCH).length,
};
