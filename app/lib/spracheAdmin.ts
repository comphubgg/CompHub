// Uebersetzungen, die nur im Admin-Bereich (/admin) vorkommen.
//
// Diese Tabelle steht bewusst nicht in sprache.ts: Sie betrifft nur den
// Betreiber, wuerde aber sonst bei jedem Besucher mitgeladen. Geladen wird sie
// ueber app/admin/AdminRahmen.tsx; dort wird sie beim Laden des Moduls in die
// Nachschlagetabelle eingetragen (ergaenzeEnglisch) - auf dem Server wie im
// Browser vor dem ersten Zeichnen, also ohne Hydration-Abweichung.
//
// Texte, die auch ausserhalb von /admin gebraucht werden, bleiben in
// sprache.ts.

export const ADMIN_AUF_ENGLISCH: Record<string, string> = {
  'Zwei Namen mit &, Komma oder Schrägstrich trennen. Ein einzelner Name ergibt ein Solo.':
    'Separate two names with &, a comma or a slash. A single name makes a solo.',
  'Etwas kaputt, fehlt oder besser zu machen? Schreib es dem Betreiber':
    'Something broken, missing or worth improving? Tell the operator',
  'Jede offene Seite meldet sich einmal pro Minute. Wer zwei Minuten lang nichts von sich hören lässt, gilt als weg — ein geschlossener Browser wird also binnen zwei Minuten rot. Wer sich abmeldet, verschwindet sofort.':
    'Every open page checks in once a minute. Anyone silent for two minutes '
    + 'counts as gone — so a closed browser turns red within two minutes. '
    + 'Signing out takes effect immediately.',
  'zu den Admin-Werkzeugen': 'to the admin tools',
  'Gerade niemand.': 'Nobody right now.',
  'Noch niemand aufgezeichnet. Die Liste füllt sich, sobald sich jemand anmeldet oder eine Seite öffnet — rückwirkend gibt es nichts, vorher wurde das nicht festgehalten.':
    'Nobody recorded yet. The list fills up as soon as someone signs in or '
    + 'opens a page — there is nothing retroactive, this was not recorded '
    + 'before.',
  '„Gerade da“ heißt: in den letzten fünf Minuten war eine Seite offen. Wer den Tab schließt, meldet sich nicht ab — mehr lässt sich darüber nicht sagen.':
    '“Here right now” means a page was open in the last five '
    + 'minutes. Closing a tab does not sign anyone out — nothing more can '
    + 'honestly be said about it.',
  'Trag die Browser-Quelle in OBS mit der doppelten Breite und Höhe ein und zieh sie in der Szene auf 50 % — dann wird nichts hochgerechnet und alles ist scharf.':
    'Enter the browser source in OBS at double the width and height and scale it to 50 % in the scene — then nothing is upscaled and everything is sharp.',
  'Unscharf in OBS? Zieh die Quelle in der Szene nie größer, als sie eingetragen ist. Mit „Schärfe: Doppelt“ wird alles doppelt so groß gezeichnet — Quelle doppelt so groß eintragen, in der Szene auf 50 %.':
    'Blurry in OBS? Never scale the source up in the scene beyond the size it is entered at. With "Sharpness: Double" everything is drawn twice as large — enter the source twice as large and scale it to 50 % in the scene.',
  'Größe der Bilder':
    'Photo size',
  'Eine Zeile, frei geschrieben — mit Balken oder ohne. Was hier steht, steht im Stream.':
    'One line, written freely — with a bar or without. What stands here stands on stream.',
  'Diese Adresse bleibt gleich. Was du hier änderst und übernimmst, ist im Stream nach wenigen Sekunden zu sehen.':
    'This address stays the same. Whatever you change and apply here shows up on stream within seconds.',
  'Erst speichern — dann bekommst du eine Adresse, die bei jeder späteren Änderung gleich bleibt.':
    'Save first — then you get an address that stays the same through every later change.',
  'Noch kein Verlauf — er beginnt mit der nächsten Sitzung.':
    'No history yet — it starts with the next session.',
  'Spieler-Banner (Globals 2026)':
    'Player banner (Globals 2026)',
  'Custom overlay (Globals 2026)':
    'Custom overlay (Globals 2026)',
  'Leaderboard im Aussehen der Global Championship':
    'Leaderboard in the look of the Global Championship',
  'Zwei Spieler mit Foto, in den Farben des Turniers':
    'Two players with photos, in the colours of the tournament',
  'Freier Stand - 1v1s, 4v4s, alles mit eigenem Titel':
    'Free scoreboard — 1v1s, 4v4s, with your own title',
  'Die Adminrolle schließt diesen Bereich ein':
    'The admin role includes this area',
  'Scrims der Community-Server — Leaderboards, Sessions und Statistiken, direkt auf CompHub.':
    'Community server scrims — leaderboards, sessions and statistics, right here on CompHub.',
  'Übungsrunden der Community-Server — Leaderboard, Sessions und Statistiken.':
    'Practice rounds run by the community servers — leaderboard, sessions and statistics.',
  'Alle Scrims':
    'All scrims',
  'Zu diesem Scrim liegt noch keine Bestenliste vor.':
    'There is no leaderboard for this scrim yet.',
  'Orte an':
    'Places on',
  'Orte aus':
    'Places off',
  'Team-Eliminierungen aus Epics Bestenlisten: die Eliminierungen des ganzen Teams je Spieltag, für jedes Mitglied gezählt; erfasst sind je Spieltag die besten 500 Teams':
    'Team eliminations from Epic\'s leaderboards: the whole team\'s eliminations per match day, counted for every member; each match day covers the top 500 teams',
  'Bis (optional)':
    'Until (optional)',
  'Kein Cup verknüpft':
    'No cup linked',
  'Zu den Profilen':
    'To the profiles',
  'Bilder eines Spielers ohne Event':
    'Pictures of a player without an event',
  'Für das allgemeine Archiv erst einen Spieler wählen.':
    'Choose a player first for the general archive.',
  'Die Ablage antwortet gerade nicht. Die Konten sind da, nur gerade nicht lesbar.':
    'The storage is not responding right now. The accounts are there, just not readable at the moment.',
  'Archiv pflegen':
    'Manage archive',
  'Noch nichts im Archiv.':
    'Nothing in the archive yet.',
  'Zu diesem Event liegt noch nichts vor.':
    'Nothing here for this event yet.',
  'Zurück zu den Events':
    'Back to the events',
  'Beitrag auf X öffnen':
    'Open post on X',
  'Profile in der Statistik':
    'Profiles in the statistics',
  'Öffentliche Seite':
    'Public page',
  'Beschreibung (optional)':
    'Description (optional)',
  'Erst ein Event anlegen.':
    'Create an event first.',
  'Spieler, die auf den nächsten Fotos und Videos zu sehen sind':
    'Players seen on the next photos and videos',
  'YouTube, Twitch und TikTok werden eingebettet, X als Link.':
    'YouTube, Twitch and TikTok are embedded, X as a link.',
  'Noch keine Fotos oder Videos in diesem Event.':
    'No photos or videos in this event yet.',
  'In ein anderes Event verschieben':
    'Move to another event',
  'Dieses Event wirklich entfernen?':
    'Really remove this event?',
  'ganzes Kapitel':
    'whole chapter',
  'Ganzes Kapitel':
    'Whole chapter',
  'Einstellen, speichern, dann liegt es auf dem Bild.':
    'Adjust, save, and it sits on the picture.',
  'Szene löschen':
    'Delete scene',
  'Speichert von selbst':
    'Saves by itself',
  'Noch nicht eingerichtet':
    'Not set up yet',
  'Auf das Bild legen':
    'Put on the picture',
  'Online-Cups aus der gepflegten Preisgeldtabelle (EU) und LAN-Events aus veröffentlichten Tabellen, je Person.':
    'Online cups from the maintained prize table (EU) and LAN events from published tables, per player.',
  'Links oben die drei Striche: von dort kommen Team card, Standings, Cup timer, Offspawn, Custom text und Qual line auf das Bild. Ziehen zum Verschieben, die Ecke zum Vergrößern.':
    'Top left, the three lines: from there Team card, Standings, Cup timer, Offspawn, Custom text and Qual line come onto the picture. Drag to move, the corner to resize.',
  'Nach vorn':
    'Bring to front',
  'Cam':
    'Cam',
  'Nur hier sichtbar, nicht in OBS: wo Cam, Gameplay und Werbung liegen.':
    'Only visible here, not in OBS: where cam, gameplay and ads sit.',
  'Noch keins gespeichert.':
    'None saved yet.',
  'Neues anlegen':
    'Create new',
  'Neue Szene':
    'New scene',
  'Meine Szenen':
    'My scenes',
  'Konnte nicht speichern':
    'Could not save',
  'Meine Szene':
    'My scene',
  'Ohne Aufstellung: die Plätze stehen nur in der tiefen Auswertung, und die läuft nur dort, wo der Leser liegt (eigener Rechner, Laufrechner), nicht auf der Webseite.':
    'No lineup: placements only come from the deep parse, which runs only where the reader is installed (your machine, the runner), not on the website.',
  'alle 10 Sekunden':
    'every 10 seconds',
  'noch kein Protokoll':
    'no log yet',
  'Durchgänge':
    'passes',
  'letzter Durchgang':
    'last pass',
  'Sammler wartet':
    'Collector idle',
  'Sammler läuft':
    'Collector running',
  'Gezählt nach Saisons (ein Kapitel beginnt Ende November des Vorjahres): 2024 = Chapter 5 Season 3 und 4, 2025 = Chapter 6, 2026 = Chapter 7. Das Archiv kennt zu älteren Spieltagen kein Datum.':
    'Counted by seasons (a chapter starts in late November of the previous year): 2024 = Chapter 5 Season 3 and 4, 2025 = Chapter 6, 2026 = Chapter 7. The archive has no dates for older match days.',
  'Online-Cups: abgeleitet aus Platz beziehungsweise Punkten und der gepflegten Preisgeldtabelle (nur EU gepflegt). LAN-Events: je Person aus veröffentlichten Tabellen (Esports Charts, Esports Earnings). Was hier fehlt, ist nicht hinterlegt, nicht null.':
    'Online cups: derived from placement or points and the maintained prize table (EU only). LAN events: per player from published tables (Esports Charts, Esports Earnings). Anything missing here is not recorded, not zero.',
  'Je Spieler aus den eigenen Replays und den Finals der Szene-Quelle, nur Heimatregion. Neben der Zahl: Finals · Opens.':
    'Per player from our own replays and the finals of the scene source, home region only. Next to the number: Finals · Opens.',
  'Preisgeld nur, wo eine Preisgeldtabelle gepflegt ist':
    'Earnings only where a prize money table is maintained',
  'Gezählt nach Saisons: Chapter 7 Season 1 bis 4 (die erste Saison beginnt Ende November des Vorjahres). Das Archiv kennt zu älteren Spieltagen kein Datum.':
    'Counted by seasons: Chapter 7 Season 1 to 4 (the first season starts in late November of the previous year). The archive has no dates for older match days.',
  'Abgeleitet aus Platz beziehungsweise Punkten und der gepflegten Preisgeldtabelle, je Person':
    'Derived from placement or points and the maintained prize money table, per player',
  'Twitch-Name eingeben, Enter — kommt in die Multiview':
    'type a Twitch name, press Enter — it joins the multiview',
  'Kein Kanal gefunden':
    'No channel found',
  'Enter nimmt den Namen trotzdem':
    'Enter adds the name anyway',
  'Unscharf in OBS? Zieh die Quelle in der Szene nie größer, als sie eingetragen ist — stell lieber hier die Schriftgröße höher.':
    'Blurry in OBS? Never scale the source up in the scene beyond the size it is entered at — raise the font size here instead.',
  'Spieler suchen — für Name und Bild':
    'search a player — for name and photo',
  'Bild entfernen':
    'remove photo',
  'Zwei Teams, ein Stand von Hand. Epic weiß davon nichts — was hier steht, steht im Stream.':
    'Two teams, a score by hand. Epic knows nothing about it; what stands here stands on stream.',
  'In einen Zugang wechseln':
    'Switch into an access',
  'zurück zu den Admin-Werkzeugen':
    'back to the admin tools',
  'Ein Klick, und du siehst, was dieser Zugang sieht — seine Overlays, seine Rechte. Zurück geht es nur über eine neue Anmeldung; ein Cookie, das deine Adminrechte heimlich mitführt, wäre ein zweiter Schlüssel zur Verwaltung.':
    'One click and you see what this access sees: its overlays, its rights. Getting back needs a fresh sign-in; a cookie quietly carrying your admin rights along would be a second key to the administration.',
  'Nur für Admins.':
    'Admins only.',
  'Cup — nach Datum geordnet':
    'Cup — sorted by date',
  'Als Manager wählst du den Spieltag, um den es gerade geht: was läuft, was heute schon lief, und was gleich anfängt — in Europa ab 15 Minuten vorher, in den anderen Regionen ab zwei Stunden vorher.':
    'As a manager you pick the match day that is actually on: what is running, what ran earlier today, and what is about to start — in Europe from 15 minutes before, in the other regions from two hours before.',
  'Gerade läuft kein Spieltag und keiner fängt gleich an. Sobald einer ansteht, erscheint er hier von selbst.':
    'No match day is running and none is about to start. As soon as one comes up it appears here on its own.',
  'Dieser Spieltag hat schon angefangen — deshalb bleibt die Vorschau leer. Genau so verhält sich der Timer auch im Stream: er verschwindet, sobald der Cup läuft.':
    'This match day has already started, which is why the preview stays empty. The timer behaves the same way on stream: it disappears once the cup is running.',
  'Gespeichert werden Duo und Aussehen, nicht der Spieltag. Die Adresse zeigt immer auf den laufenden Spieltag deiner Region, also steht sie beim nächsten Turnier noch richtig.':
    'What gets saved is the duo and the look, not the match day. The address always points at the running match day of your region, so it still works at the next tournament.',
  'du findest es oben unter „Deine Overlays“.':
    'you find it above under "Your overlays".',
  'Die Adresse oben in das Feld „URL“ einfügen, Breite und Höhe nach Geschmack, OK.':
    'Paste the address above into the "URL" field, set width and height to taste, OK.',
  'Diese Adresse bleibt gültig. Änderst du hier später etwas und speicherst, ist es im Stream nach wenigen Sekunden zu sehen — die Browser-Quelle musst du nicht anfassen.':
    'This address stays valid. If you change something here later and save, it shows up on stream within seconds; you do not have to touch the browser source.',
  'Gerade läuft kein Cup. Mit „mehr anzeigen“ siehst du auch die übrigen Regionen, die kommenden Tage sowie Ranked, Reload, Mobile und Arenas.':
    'No cup is running right now. With "show more" you also see the other regions, the coming days, and Ranked, Reload, Mobile and Arenas.',
  'Ein Countdown bis zum Start des Spieltags. Sobald der Cup läuft, verschwindet er von selbst.':
    'A countdown to the start of the match day. As soon as the cup is live it disappears on its own.',
  'Null Stunden heißt: immer sichtbar. Sonst bleibt der Timer verborgen, bis es so weit ist — ein Countdown über zwei Tage ist keine Information, sondern eine Uhr im Bild.':
    'Zero hours means always visible. Otherwise the timer stays hidden until it is close: a countdown over two days is not information, it is a clock on screen.',
  'andere Cups anzeigen':
    'show other cups',
  'nur die üblichen':
    'only the usual ones',
  'In diesen Tagen läuft kein passender Cup. Mit „andere Cups anzeigen“ siehst du auch Ranked, Reload, Mobile und Arenas.':
    'No matching cup in these days. With "show other cups" you also see Ranked, Reload, Mobile and Arenas.',
  'Wer sich damit anmelden darf':
    'Who may sign in with it',
  'Namen, durch Komma oder Zeile getrennt':
    'names, separated by comma or line',
  'Beim Anmelden gibt jeder nach Name und Schlüssel noch seinen eigenen Namen an. Steht er nicht hier, kommt er nicht hinein — auch mit richtigem Schlüssel nicht. So sperrst du einen Einzelnen aus, ohne den anderen den Schlüssel zu wechseln.':
    'When signing in, each person gives their own name after the access name and key. If it is not listed here, they do not get in — not even with the right key. That is how you lock out one person without changing the key for everyone else.',
  'Ohne Namen kommt niemand hinein.':
    'Without names nobody gets in.',
  'Schlüssel neu schreiben':
    'Rewrite keys',
  'Räumt jeden Schlüsselkanal leer und schreibt den gültigen Schlüssel neu hinein — vom Bot, mit Knopf darunter. Die Schlüssel selbst bleiben unverändert, niemand wird ausgesperrt.':
    'Clears every key channel and writes the valid key into it again — from the bot, with the button below. The keys themselves stay unchanged, nobody is locked out.',
  'Dieser Name ist für diesen Zugang nicht eingetragen.':
    'That name is not registered for this access.',
  'Mehrere Leute teilen ihn sich. Gib den Namen an, unter dem du eingetragen bist — er steht danach neben jedem Overlay, das du anlegst oder änderst.':
    'Several people share it. Give the name you are registered under — it then shows next to every overlay you create or change.',
  'Der Zugang heißt dann':
    'The access will then be called',
  'Ein Zugang, den sich mehrere Leute teilen: sie betreuen damit die Overlays eines Streamers und sonst nichts. Der Name ergibt sich aus dem Streamer, der Schlüssel landet in Discord unter „Manager Access Keys“. Beim Anmelden gibt jeder zusätzlich seinen eigenen Namen an — so steht neben jedem Overlay, wer es angelegt hat.':
    'An access several people share: they look after one streamer’s overlays and nothing else. The name follows from the streamer, the key lands in Discord under “Manager Access Keys”. When signing in, each person also gives their own name — so every overlay says who created it.',
  'Streamer, dessen Overlays betreut werden':
    'streamer whose overlays are looked after',
  'Mehrere Leute teilen ihn sich — sag kurz, wer du bist, damit neben jedem Overlay steht, wer es angelegt oder geändert hat.':
    'Several people share it — say who you are, so every overlay shows who created or changed it.',
  'Zwei bis vierundzwanzig Zeichen, keine Sonderzeichen.':
    'Two to twenty-four characters, no special characters.',
  'Cup — nach Wichtigkeit geordnet':
    'Cup — sorted by importance',
  'mehr — auch Ranked, Reload, Mobile und Arenas':
    'more — including Ranked, Reload, Mobile and Arenas',
  'In diesen Tagen läuft kein passender Cup. Die Auswahl füllt sich von selbst, sobald einer ansteht — das Overlay in OBS musst du dafür nicht anfassen.':
    'No matching cup in these days. The list fills itself as soon as one comes up — you do not have to touch the overlay in OBS for that.',
  'Discord einrichten':
    'Set up Discord',
  'Legt die Kategorien, Kanäle und Berechtigungen an und stellt die Aushänge neu. Vorhandene Nachrichten im Willkommenskanal werden dabei entfernt.':
    'Creates the categories, channels and permissions and puts the notices '
    + 'up again. Existing messages in the welcome channel are removed in the '
    + 'process.',
  'Der Aufbau ließ sich nicht ausführen.':
    'The setup could not be run.',
  'wird eingerichtet …':
    'setting up …',
  'Legt die Support-Kategorie an, schiebt den vorhandenen Support-Kanal hinein und stellt drei schreibgeschützte Aushänge auf: Willkommen, VIP-Leitfaden und Manager-Leitfaden — auf Englisch, mit einem Knopf für die deutsche Fassung. Die Schlüsselkanäle bleiben unberührt.':
    'Creates the Support category, moves the existing support channel into '
    + 'it and puts up three read-only notices: welcome, VIP guide and manager '
    + 'guide — in English, with a button for the German version. The key '
    + 'channels are left untouched.',
  'Nichts zu tun.':
    'Nothing to do.',
  'Ohne DISCORD_PUBLIC_KEY gibt es keine Knöpfe — weder für Deutsch noch für den Schlüsselwechsel. Sie erscheinen, sobald der Schlüssel hinterlegt und die Interactions-URL eingetragen ist.':
    'Without DISCORD_PUBLIC_KEY there are no buttons — neither for German '
    + 'nor for changing the key. They appear as soon as the key is stored and '
    + 'the interactions URL is entered.',
  'In diesen Zugang wechseln':
    'Switch into this access',
  'Zum Zurückkehren musst du dich neu anmelden.':
    'To get back you will have to sign in again.',
  'Wechsel nicht möglich':
    'Cannot switch',
  'Manager für':
    'Manager for',
  'hineinsehen':
    'view as',
  'Verwaltet die Overlays von':
    'Manages the overlays of',
  'leer lassen für einen normalen VIP-Zugang':
    'leave empty for a normal VIP access',
  'Steht hier ein Name, wird daraus ein Manager-Zugang: mehrere Leute teilen ihn sich, sehen und bearbeiten die Overlays dieses Streamers und sonst nichts. Sein Schlüssel landet in Discord unter „Manager Access Keys“, in einem Kanal je Streamer.':
    'With a name here this becomes a manager access: several people share '
    + 'it, see and edit that streamer’s overlays and nothing else. Its key '
    + 'goes to Discord under “Manager Access Keys”, one channel per streamer.',
  'Schaden, Trefferquote und Material veröffentlicht Epic nicht. Für diesen Cup liegen sie auch nicht aus der Szene-Quelle vor. Deine eigenen Werte bekommst du trotzdem: einmal meine-werte-holen.bat starten — dann liest das Werkzeug die Replays, die Fortnite auf deinem Rechner ablegt.':
    'Epic does not publish damage, accuracy or materials, and the scene '
    + 'source has nothing for this cup either. You can still get your own: '
    + 'run meine-werte-holen.bat once — the tool then reads the replays '
    + 'Fortnite stores on your PC.',
  'Zu diesem Spieltag veröffentlicht Epic keine Punktetabelle — ohne sie lässt sich der Verlauf nicht aufteilen.': 'Epic publishes no scoring table for this match day — without it the points cannot be split up.',
  'Schaden, Trefferquote und Material veröffentlicht Epic nicht. Sie kommen aus einer Szene-Quelle, die ein bis zwei Tage später erscheint und nicht jeden Cup abdeckt — alles darüber steht trotzdem, es kommt aus Epics Bestenliste.': 'Epic does not publish damage, accuracy or materials. They come from a scene source that appears one to two days later and does not cover every cup — everything above it is there regardless, from Epic’s leaderboard.',
  'Deine Werte': 'Your Stats',
  'kein Mitspieler': 'no team-mate',
  'Bauteile gesetzt': 'Builds Placed',
  'Lebenszeit je Runde': 'Avg Time Alive',
  'Zu diesem Spieltag liegen keine Einzelwerte vor. Schaden, Trefferquote und Material veröffentlicht Epic nicht — sie kommen aus einer Szene-Quelle, die ein bis zwei Tage später erscheint und nicht jeden Cup abdeckt.': 'No individual stats for this match day. Epic does not publish damage, accuracy or materials — they come from a scene source that appears one to two days later and does not cover every cup.',
  'Wähle oben dein Konto — dann stehen hier deine Werte und die deines Mitspielers nebeneinander.': 'Pick your account above — then your stats and your team-mate’s appear side by side.',
  'Diese Einzelwerte veröffentlicht Epic nicht. Sie stammen aus der Szene-Quelle, die dieses Werkzeug spiegelt.': 'Epic does not publish these individual stats. They come from the scene source this tool mirrors.',
  'Plätze — zu ihnen hat Epic keinen Eintrag geliefert, obwohl das ganze Feld geladen ist. Die Match-ID oben ist vollständig.':
    'places — Epic delivered no record for them, even though the whole '
    + 'field is loaded. The match ID above is complete.',
  'Hier stehen nur die Teams dieser Lobby, die im Tagesranking unter den ersten zehntausend liegen — weiter hinten platzierte gibt Epic nicht heraus. Die Match-ID oben ist vollständig.':
    'Only the teams of this lobby that rank inside the day’s first ten '
    + 'thousand places are listed — Epic does not hand out those placed '
    + 'further down. The match ID above is complete.',
  'In dieser Saison gibt es noch keine weiteren Spieltage — die Quelle liefert sie ein bis zwei Tage nach jedem Cup.':
    'No further match days in this season yet — the source publishes them '
    + 'one to two days after each cup.',
  'Erlaubt sind Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich. Umlaute gehen, Sonderzeichen wie @ oder / nicht.':
    'Letters, digits, dot, hyphen and underscore are allowed. Accents and '
    + 'umlauts are fine; symbols like @ or / are not.',
  'Discord: kein Bot-Token auf diesem Rechner hinterlegt.':
    'Discord: no bot token configured on this machine.',
  'Discord: der Kanal ließ sich nicht finden oder anlegen.':
    'Discord: the channel could not be found or created.',
  'Discord hat die Nachricht abgelehnt — meist fehlt dem Bot im Kanal das Recht, dort zu schreiben.':
    'Discord rejected the message — usually the bot lacks permission to '
    + 'write in that channel.',
  'Der alte Schlüssel gilt danach nicht mehr. Leer lassen für einen zufälligen — oder einen eigenen eintippen, dann gilt er genau so, mit Groß- und Kleinschreibung.':
    'The old key stops working afterwards. Leave empty for a random one — '
    + 'or type your own, which is then used exactly as written, upper and lower '
    + 'case included.',
  'Anfang des Schlüssels': 'Start of the key',
  'Ganzer Schlüssel von Hand': 'Whole key by hand',
  'gilt genau so, wie du ihn tippst': 'used exactly as you type it',
  'Beim Anmelden wird Zeichen für Zeichen verglichen — Groß- und Kleinschreibung zählt also mit.':
    'Signing in compares character by character, so upper and lower case matter.',
  'Darf den Schlüssel selbst wechseln': 'May change their own key',
  'In den Discord-Kanal des VIPs gelegt — der alte Schlüssel dort ist weg.':
    'Posted to the VIP’s Discord channel — the old key there is gone.',
  'Dieses Konto ist gesperrt. Eine neue Anmeldung mit derselben Adresse ist nicht möglich — wende dich an den Betreiber.':
    'This account is blocked. Signing up again with the same address is not '
    + 'possible — please contact the operator.',
  'Ordner ausblenden': 'Hide folders',
  'Admin Tools': 'Admin Tools',
  ['Du darfst alles — jedes Werkzeug hier ist offen, und du brauchst dafür '
    + 'keinen VIP-Schlüssel.']:
    'You may do everything — every tool here is open, and you do not need a '
    + 'VIP key for it.',
  ['Du darfst genau die Werkzeuge, die dir freigegeben wurden. Die anderen '
    + 'stehen grau da, damit du siehst, was es sonst noch gibt.']:
    'You may use exactly the tools you were granted. The others stay greyed '
    + 'out so you can see what else exists.',
  'Was soll es werden?': 'What should it be?',
  'Cup & Spieltag': 'Cup & match day',
  'Ein roter Punkt heißt: läuft gerade.': 'A red dot means: running right now.',
  'Ein Name, eine Kennzahl oder eine Platzzahl — Enter drückt ab.':
    'A name, a stat or a number of places — Enter fires it.',
  'ältere Spieltage anzeigen': 'show older match days',
  'Für diesen Spieltag liegen keine Einzelwerte vor':
    'No per-player values exist for this match day',
  'Spitzenwert je Kennzahl': 'Top value per stat',
  'Einzelwerte von': 'Per-player values from',
  'Kennzahlen im Beitrag': 'Stats in the post',
  'weitere Kennzahlen': 'more stats',
  'filtern …': 'filter …',
  'Das breite Bild hinter dem Logo auf der Seite der Organisation.': 'The wide image behind the logo on the organization page.',
  'kein Banner': 'no banner',
  'Banner hochladen': 'Upload banner',
  'Banner von X übernehmen': 'Take banner from X',
  'Banner entfernen': 'Remove banner',
  'Erst das X-Konto eintragen': 'Enter the X account first',
  'Content Creator ohne Epic-Konto: Namen tippen …': 'Content creator without an Epic account: type a name …',
  'Bilderarchiv': 'Player Pictures',
  'Gespielt am': 'Played at',
  'An Elims beteiligt': 'Involved in elims',
  'älter als 31 Tage, nicht mehr holbar': 'older than 31 days, no longer available',
  "Das Konto sieht danach die Seite Team und pflegt den Kader dieser Organisation.":
    "The account will then see the Team page and manage this organisation's roster.",
  "Auf der Karte ziehen, um ein Rechteck zu zeichnen.":
    "Drag on the map to draw a rectangle.",
  "Keine Form gewählt":
    "No shape selected",
  "Von der Form nehmen":
    "Remove from shape",
  "Eine Zeile pro Team, die Namen mit & getrennt. Jeder Name wird im Archiv gesucht: gibt es genau einen Treffer, kommen Flagge und Konto dazu.":
    "One line per team, names separated by &. Each name is looked up in the archive: if there is exactly one match, flag and account are added.",
  "Alle löschen":
    "Delete all",
  "Noch keine Teams.":
    "No teams yet.",
  "Team löschen":
    "Delete team",
  "Platz, Punkte, Victory Royales und Eliminierungen je Team - alles von Hand. Teams legst du im Reiter „Teams“ an.":
    "Place, points, Victory Royales and eliminations per team - all entered by hand. Teams are created in the “Teams” tab.",
  "Plätze nach Punkten vergeben":
    "Assign places by points",
  "Plätze löschen":
    "Clear places",
  "Noch keine Teams - lege sie zuerst im Reiter „Teams“ an.":
    "No teams yet - create them first in the “Teams” tab.",
  "Bild der Kachel (Adresse)":
    "Tile image (URL)",
  "Epics Bestenliste und Teams zeigen, solange hier keine eigenen Teams stehen.":
    "Show Epic's leaderboard and teams as long as no custom teams are entered here.",
  "Sobald du das erste eigene Team anlegst, gilt nur noch, was du eingetragen hast.":
    "As soon as you add the first custom team, only what you entered counts.",
  "Event löschen":
    "Delete event",
  "Diese Karte ist gerade versteckt.":
    "This map is currently hidden.",
  "Zur öffentlichen Übersicht":
    "To the public overview",
  "Ein Event anlegen. Danach öffnest du es mit „Bearbeiten“ und zeichnest Formen, Teams und Leaderboard ein.":
    "Create an event. Then open it with “Edit” and draw in shapes, teams and the leaderboard.",
  "Kartenbild für alle hier setzen":
    "Set map image for all shown here",
  "Eine Insel auswählen - sie gilt danach für alle angezeigten Karten. Einzelne änderst du später im Editor.":
    "Pick an island - it then applies to all maps shown. You can change individual ones later in the editor.",
  "Hier steht noch nichts. Mit „Event anlegen“ kommt die erste Karte dazu.":
    "Nothing here yet. “Create event” adds the first map.",
  "Zu diesem Spieltag gibt es keine Karte.":
    "There is no map for this match day.",
  "Kopieren hat nicht geklappt - bitte herunterladen.":
    "Copying failed - please download instead.",
  "Das Plakat lässt sich gerade nicht zeichnen.":
    "The poster can't be drawn right now.",
  "Kopieren hat nicht geklappt.":
    "Copying failed.",
  "Name tippen — ohne Eingabe der Erste":
    "Type a name — leave empty for first place",
  "Jedes Game der Finals und LANs aus Epics Server-Replays: die Zonen, jede Elim und jeder Knock mit Ort und Zeit, die Teams. Der Server liest neue Games stündlich aus und bewahrt sie auf, auch wenn Epic das Replay nach 31 Tagen löscht.":
    "Every game of the finals and LANs from Epic's server replays: the zones, every elim and every knock with place and time, the teams. The server reads new games every hour and keeps them, even after Epic deletes the replay after 31 days.",
  "Noch keine Games ausgewertet. Der stündliche Lauf liest die Replays der Finals und LANs der letzten 31 Tage nach und nach aus.":
    "No games analysed yet. The hourly run works through the replays of the finals and LANs from the last 31 days.",
  "Weiße Ringe: die Zonen des Games, je später desto kräftiger. ✖ Elim, ● Knock - in der Farbe des Teams, das ihn geholt hat (Top 8 farbig). Zeigen mit der Maus nennt Zeit, Täter, Opfer und Abstand.":
    "White rings: the zones of the game, stronger the later they are. ✖ elim, ● knock - in the colour of the team that got it (top 8 in colour). Hovering shows time, attacker, victim and distance.",
};
