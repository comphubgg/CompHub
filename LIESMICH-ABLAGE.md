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

## Wo die Seite läuft (seit 11.10.2026): Netlify

Render hat den Arbeitsbereich wegen der 5-GB-Grenze des kostenlosen Tarifs gesperrt, ein Reset-Datum
gab es nicht. Die Seite läuft deshalb bei **Netlify** (Seite „thecomphub", Konto `comphubgg`, Tarif
Free: 300 Punkte im Monat, harte Grenze, kostet nie etwas, pausiert schlimmstenfalls).

- **Bereitstellen:** nur über den GitHub-Ablauf **„Netlify bereitstellen"** (Linux-Bau, Protokoll im
  Lauf sichtbar). Montags 03:30 UTC automatisch, sonst von Hand (`ziel=live` oder `entwurf`). Netlify
  baut **nicht** mehr von selbst bei jedem Push (`stop_builds`), weil jeder Bau 15 Punkte kostet.
- **Geheimnisse:** `NETLIFY_AUTH_TOKEN` und `NETLIFY_SITE_ID` als GitHub-Geheimnisse; die Einstellungen
  der Seite (Discord, Mail, Twitch, `DATEN_TOKEN` …) liegen bei Netlify unter Site configuration →
  Environment variables.
- **Server-Teil unter 250 MB:** `next.config.ts` schließt Replay-Paket und Datenordner aus
  (`outputFileTracingExcludes`) und nimmt die Laufzeit für Schnittstellen mit (`...Includes`).
- **Domain:** `www.thecomphub.com` ist die Hauptdomain, `thecomphub.com` leitet dorthin. Bei Cloudflare
  stehen beide Einträge als CNAME auf `thecomphub.netlify.app`, **Nur DNS** (grau). Mit orangem Proxy
  und SSL-Modus „Full" würde Cloudflare Bilder und Skripte zwischenspeichern und Netlify-Punkte sparen.
- **Geht dort nicht:** Replays auswerten, Videos als Datei hochladen, „Alles aktualisieren" (braucht
  `GITHUB_TOKEN` mit Recht „workflow" in den Netlify-Einstellungen).
- Render ist nicht mehr nötig. Der Schritt „Render Bescheid geben" im Ablauf `web-image.yml` scheitert
  seitdem mit 409 und ist ohne Folgen.
