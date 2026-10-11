# Wo die Daten liegen (seit 11.10.2026)

Alles, was Nutzer und Betreiber auf der Seite schreiben (Konten, Tierlists, Overlays,
Karten, Prognosen, Profile, Fotos), liegt in einem **privaten GitHub-Archiv**:
`comphubgg/comphub-daten`. Es ersetzt Supabase, dessen kostenloses Datenvolumen zweimal
aufgebraucht war (22.9. und 3.10.) und die ganze Seite lahmgelegt hat. Das Archiv hat kein
Datenvolumen-Limit, kostet nichts und braucht kein weiteres Konto.

Alles, was ein Lauf ausrechnet (Akten, Antworten, Replays, Statistik), liegt weiter am
**Release** `daten*` des öffentlichen Projekts (`lib/ablageGithub.ts`).

## So ist es verdrahtet

| Teil | Datei |
|---|---|
| Speicher auf dem Server | `lib/ablageGitDaten.ts` |
| Auswahl des Speichers | `lib/ablage.ts`, `waehle()` |
| Abgleich Platte ↔ Archiv für die Läufe | `scripts/daten-sync.mjs` |
| Vorwärmen und Leeren beim Start/Beenden | `instrumentation.node.ts` |

**Eingeschaltet** wird das Archiv auf dem Server mit **einer** Einstellung:
`DATEN_TOKEN` (ein GitHub-Schlüssel mit Zugriff auf das Archiv). Dann gilt es, egal was bei
`COMPHUB_ABLAGE` steht. Ohne `DATEN_TOKEN` verhält sich alles wie vorher (Supabase).
`DATEN_REPO` nennt ein anderes Archiv, `DATEN_PRAEFIX` legt alles in einen Unterordner (zum
Ausprobieren).

Die GitHub-Läufe brauchen nichts Neues: sie lesen `GITHUB_TOKEN` aus dem Geheimnis
`ENV_LOCAL`.

## Eigenheiten

- Lesen aus dem Arbeitsspeicher, eine Minute frisch, danach Nachfrage mit ETag (kostet kein
  Kontingent). Antwortet GitHub nicht, kommt der letzte bekannte Stand.
- Schreiben sofort und der Aufrufer wartet; Zähler (`besuche.json`, `anwesenheit*`) alle zwei
  Minuten. Wird eine Datei binnen 10 Sekunden mehrfach geschrieben, zählt der letzte Stand.
- `antworten/…` (der Cup-Katalog, alle fünf Minuten neu) bleibt im Arbeitsspeicher.
- Läufe schreiben nur, was sie selbst geändert haben, und nur, wenn das Archiv sich seit dem
  Herunterladen nicht bewegt hat (`.sync-basis.json`). Sonst „KONFLIKT", nicht überschrieben.
- Videos als Datei hochladen geht nicht mehr (kein Direktweg zum Archiv): als Link anhängen.

## Wenn etwas klemmt

`/api/ablage-pruefung` zeigt Archiv, Zahl der Dateien im Speicher und den letzten Fehler.
Rate-Limit von GitHub: 5000 Anfragen pro Stunde; „nicht geändert"-Antworten zählen nicht.
