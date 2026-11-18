# Aufspielen ohne Ausfall (blau/gruen) - einmal auf dem Server einrichten

Bisher ersetzt jedes Aufspielen den einzigen Container der Seite. Gemessen am 18.11.2026: nach jedem Start steht die Seite rund 35 Sekunden
ganz still, danach ist sie einige Minuten langsam. Neu laufen zwei Farben der Seite (`web-blau`, `web-gruen`) hinter einem kleinen Proxy (Caddy
auf Port 3100, dort, wo der Tunnel die Seite sucht). Ein neues Image startet in der freien Farbe, waermt sich auf, und erst dann schaltet der
Proxy um. Die alte Farbe wird danach angehalten.

Was dafuer im Repo liegt: `deploy/server-compose-web.yml` (Proxy und die zwei Farben), `deploy/comphub-update.sh` (das neue Update),
`deploy/blau-gruen-einrichten.sh` (installiert beides). Solange niemand die Schritte unten ausfuehrt, aendert sich auf dem Server nichts.

**Sicherheit:** Das Update-Skript und die Compose-Datei der Seite werden **einmal** von einem festen Commit geholt, per Pruefsumme (sha256)
geprueft und als feste Kopie auf dem Server abgelegt. Der Minutentakt fuehrt nur diese Kopie aus und holt kein Skript von GitHub. Ein Push auf
main aendert das Update-Skript also **nicht** - erst wenn jemand die Einrichtung mit einem neuen Commit erneut ausfuehrt (siehe unten).

Festgelegter Stand:

| | |
|---|---|
| Commit | `2a5594c89584b7298a83e9a31fbce425c4e1ed9b` |
| sha256 `deploy/blau-gruen-einrichten.sh` | `e41b45b6b8e8738dd7ff5aaa2c80e4d11f9c8e65924560a06e32d74b3d43e52e` |
| sha256 `deploy/comphub-update.sh` (prueft das Skript selbst) | `63be0526b1ada0ae3e5eb78045227a0399575de178a52f6079f81d8db7a1a969` |
| sha256 `deploy/server-compose-web.yml` (prueft das Skript selbst) | `59f69913cccf19668fd2ffecf2bf484f7d4a7d01f807e31e791e0353ec38d46d` |

## Einrichten (etwa 15 Minuten, die Seite bleibt dabei erreichbar)

1. **Windows-Taste** druecken, `PowerShell` tippen, **Enter**.
2. Eintippen und **Enter**:
   ```
   ssh root@169.58.181.149
   ```
   Fragt er "Are you sure you want to continue connecting", `yes` tippen und **Enter**. Dann das Server-Passwort eingeben (beim Tippen ist
   nichts zu sehen, das ist normal) und **Enter**.
3. Diese **eine** lange Zeile ganz kopieren, in PowerShell mit **Rechtsklick** einfuegen, **Enter**:
   ```
   curl -fsSL -o /root/blau-gruen.sh https://raw.githubusercontent.com/comphubgg/CompHub/2a5594c89584b7298a83e9a31fbce425c4e1ed9b/deploy/blau-gruen-einrichten.sh && echo "e41b45b6b8e8738dd7ff5aaa2c80e4d11f9c8e65924560a06e32d74b3d43e52e  /root/blau-gruen.sh" | sha256sum -c && bash /root/blau-gruen.sh 2a5594c89584b7298a83e9a31fbce425c4e1ed9b
   ```
   Es muessen zwei Zeilen erscheinen:
   - `/root/blau-gruen.sh: OK`
   - `OK: Update-Skript installiert (Stand 2a5594c89584). ...`

   Steht dort stattdessen `FAILED` oder `FEHLER`: **nicht weitermachen**, Screenshot schicken. Es wurde dann nichts geaendert.
4. Zusehen, wie die Seite umzieht:
   ```
   tail -f /var/log/comphub-update.log
   ```
   Nach 1 bis 10 Minuten erscheinen nacheinander:
   - `Neues Image ... -> web-blau (Port 3101), aktiv bisher: alte web`
   - `Umstieg: alte web wird entfernt, Proxy startet`
   - `Proxy -> web-blau (Probe ueber 3100: HTTP 200)`

   Steht dort `HTTP 200`: fertig. Mit **Strg+C** das Zusehen beenden.
5. Pruefen:
   ```
   docker ps --format "table {{.Names}}\t{{.Status}}"
   ```
   Es muessen `comphubweb-proxy-1` und `comphubweb-web-blau-1` mit "Up" dabei sein, `comphub-web-1` nicht mehr.
   **Screenshot** von diesem Fenster machen und schicken.
6. `exit` tippen, **Enter**. Fertig.

Ab jetzt laeuft jedes Aufspielen so: `Neues Image ... -> web-gruen`, ein paar Minuten spaeter `Proxy -> web-gruen`, 30 s danach
`web-blau angehalten` - beim naechsten Mal umgekehrt.

## Das Update-Skript spaeter erneuern

Aendert sich `deploy/comphub-update.sh` oder `deploy/server-compose-web.yml`, bekommt der Betreiber eine **neue** Zeile wie in Schritt 3 (mit
neuem Commit und neuer Pruefsumme; sie steht dann auch hier). Einloggen wie in Schritt 1 und 2, die neue Zeile einfuegen, **Enter**, auf die
beiden `OK`-Zeilen achten, `exit`. Welcher Stand gerade installiert ist: `cat /usr/local/lib/comphub/STAND`.

## Wenn etwas nicht stimmt: Rueckweg zum alten Stand

Wie oben einloggen (Schritte 1 und 2), dann diese drei Zeilen einzeln einfuegen, jeweils **Enter**:
```
cp /usr/local/bin/comphub-update.alt /usr/local/bin/comphub-update
docker compose -p comphubweb -f /opt/comphub/web/docker-compose.yml down
cd /opt/comphub && docker compose up -d web
```
Danach laeuft die Seite wieder als ein Container wie vorher. Screenshot schicken, `exit`.

## Was das Skript genau tut (fuer Fragen)

- Einrichtung (`deploy/blau-gruen-einrichten.sh <Commit>`): holt `comphub-update.sh` und `server-compose-web.yml` von genau diesem Commit,
  vergleicht beide mit den fest eingetragenen Pruefsummen (bei Abweichung Abbruch, nichts geaendert) und legt sie ab:
  `/usr/local/lib/comphub/comphub-update.sh`, `/opt/comphub/web/docker-compose.yml`. `/usr/local/bin/comphub-update` (vom cron jede Minute
  aufgerufen) fuehrt nur noch die lokale Kopie aus. Das alte Update-Skript bleibt als `/usr/local/bin/comphub-update.alt` liegen.
- Jede Minute: `deploy/server-compose.yml` holen und alle Dienste starten - ausser `web` - genau wie das alte Update-Skript. Diese eine Datei
  kommt weiterhin von main (unveraendert gegenueber vorher).
- Hat das Image `comphub-web:latest` sich geaendert: die freie Farbe damit starten (Port 3101 oder 3102), warten, bis `/api/stand` dort
  `"warm"` meldet (das Aufwaermen nach dem Start, hoechstens 8 Minuten), die meistbesuchten Seiten einmal aufrufen, dann den Proxy umstellen
  (`caddy reload`, laufende Anfragen laufen zu Ende), 30 s warten und die alte Farbe anhalten. Antwortet die neue Farbe gar nicht, bleibt alles
  bei der alten.
- Beide Farben teilen sich die letzten guten Antworten (`/opt/comphub/web-zuletzt`), damit die neue Farbe sie vom ersten Aufruf an hat.
- Protokoll: `/var/log/comphub-update.log`.
