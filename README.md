# CompHub

Statistiken, Turniere und Streams für kompetitives Fortnite — an einem Ort.

Zehn Saisons, sieben Regionen, aus dem Chapter-5-Archiv bis zu den Matches
von gestern. Alle Zahlen stammen aus echten Quellen: Epics Turnier-API und
den eigenen Server-Replays. Es wird nichts geschätzt und nichts erfunden;
was eine Quelle nicht liefert, bleibt leer.

## Was drin ist

| Bereich | Was er kann |
|---|---|
| **Statistiken** | Werte je Spieler und Saison, Regionen, Vergleich zweier Spieler |
| **Turniere** | Kalender aller Regionen, Leaderboards, Endstände |
| **Rankings** | Epics weltweite Power Rankings, täglich erneuert |
| **Streams** | Streamwände mit Kachelansicht, eigene Ordner |
| **Tierlist** | Spieler und Duos einsortieren, als Bild speichern |
| **Overlays** | Einblendungen für OBS, frei gestaltbar |
| **Karten** | Turnierkarten mit Landepunkten |
| **Beiträge** | Statistik-Posts aus echten Turnierdaten |

## Woher die Zahlen kommen

- **Epic Games** — Turnierkalender, Leaderboards, Platzierungen, Mitspieler.
  Über die offizielle Schnittstelle.
- **Server-Replays** — Eliminierungen, Knocks und die verwendete Waffe je
  Match, selbst ausgewertet. Epic hält Replays 31 Tage; älteres lässt sich
  nicht nachholen.
- **eucompetitive.com** — die gespiegelten Einzelwerte je Spieltag.

Nicht mit Epic Games verbunden.

## Selbst betreiben

```bash
npm install
npm run schnell
```

`npm run schnell` baut die fertige Fassung und startet sie auf
`localhost:3000`. Der Entwicklungsmodus (`npm run dev`) ist deutlich
langsamer, weil er jede Seite beim ersten Aufruf übersetzt.

Zugangsdaten gehören in `.env.local` — die Datei ist bewusst nicht
versioniert. Gebraucht werden Epic (Turnierdaten), Twitch und Discord
(Anmeldung, Live-Status) und Google (Anmeldung).

## Als Fensterprogramm

```bash
npm run exe
```

Baut eine `.exe`, die den Server im Inneren startet und CompHub in einem
eigenen Fenster öffnet — ohne Browser, ohne Terminal. Das Kreuz schließt nur
das Fenster; der Server läuft im Infobereich weiter, damit die Overlays in
OBS nicht ausgehen.

`npm run exe-klein` baut dieselbe Datei ohne das Archiv (~40 statt ~354 MB);
der Ordner `data` gehört dann daneben.

## Was von selbst läuft

- **Daten** — stündlich über GitHub Actions: neue Spieltage, Platzierungen,
  Weltrangliste, Replays. Ein gelaufener Cup steht danach von allein unter
  Turnieren.
- **Programm** — eine neue Fassung entsteht, sobald eine Marke gesetzt wird
  (`git tag v1.2.3 && git push --tags`). Installierte Programme holen sie
  sich beim nächsten Start selbst.

## Sprachen

Englisch ist die Hauptsprache, Deutsch liegt hinter dem Schalter unten
rechts. Beide Fassungen sind vollständig.
