# CompHub betreiben — die fünf Knöpfe

Alles, was der Betrieb braucht, liegt als Datei zum Doppelklicken im
Hauptordner. Kein Befehl zum Abtippen, keine Reihenfolge zum Merken.

| Datei | wofür | wo |
|---|---|---|
| `aktualisieren.bat` | neuen Stand holen, bauen, live schalten | Laptop |
| `laptop-start.bat` | einmalige Einrichtung | Laptop |
| `immer-an.bat` | Rechner läuft durch, Deckel zu | Laptop |
| `uebernehmen.bat` | Domain zeigt auf diesen Rechner | Laptop |
| `hier-stoppen.bat` | dieser Rechner liefert nicht mehr aus | PC |

## Der Alltag

Wenn am Werkzeug etwas geändert wurde, ist es **ein** Doppelklick auf dem
Laptop:

    aktualisieren.bat

Das Skript sichert deine Daten, holt den neuen Stand, legt die Daten zurück,
baut, startet Webserver und Tunnel neu — und misst zum Schluss von außen nach,
ob `thecomphub.com` wirklich antwortet. Es meldet nicht „fertig", wenn es nicht
fertig ist.

Auf dem PC ist danach nichts mehr zu tun.

## Der Umzug auf den Laptop, einmalig

1. `git clone https://github.com/comphubgg/CompHub.git C:\CompHub`
2. Vom PC nach `C:\CompHub\` kopieren: `.env.local` und den Ordner `data`
   (ohne `replays`)
3. `laptop-start.bat` — richtet Tunnel, Pakete und Wächter ein
4. `immer-an.bat` — kein Schlafmodus, Deckel zuklappen tut nichts
5. `uebernehmen.bat` — die Domain zeigt danach hierher
6. Auf dem **PC**: `hier-stoppen.bat`

Danach kann der PC aus.

## Was 24/7 wirklich braucht

- **Am Strom.** Im Akkubetrieb schläft der Laptop weiter — das ist Absicht.
- **Offen stehend, nicht in einer Kiste.** Zugeklappt ja, eingesperrt nein:
  ein Laptop bläst seine Wärme seitlich aus, in einer Kiste staut sie sich, er
  drosselt und schaltet im schlimmsten Fall ab.
- **Nur ein Rechner gleichzeitig.** CompHub legt seine Daten in Dateien im
  eigenen Ordner ab. Liefen PC und Laptop parallel, landete jede Anfrage
  zufällig bei einem von beiden — mit unterschiedlichem Stand.

## Wenn etwas klemmt

Der Wächter (`scripts/dauerbetrieb.ps1`) sieht alle zwei Minuten nach und
startet Webserver und Tunnel neu, falls einer fehlt. Er läuft ab dem
Hochfahren, ohne Anmeldung.

Was er getan hat, steht in `dauerbetrieb.log`. Fehler des Webservers stehen in
`server-fehler.log`, die des Tunnels in `tunnel.log`.
