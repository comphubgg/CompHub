# Aufspielen ohne Ausfall (blau/gruen) - einmal auf dem Server einrichten

Bisher ersetzt jedes Aufspielen den einzigen Container der Seite. Gemessen am 18.11.2026: nach jedem Start steht die Seite rund 35 Sekunden
ganz still, danach ist sie einige Minuten langsam. Neu laufen zwei Farben der Seite (`web-blau`, `web-gruen`) hinter einem kleinen Proxy (Caddy
auf Port 3100, dort, wo der Tunnel die Seite sucht). Ein neues Image startet in der freien Farbe, waermt sich auf, und erst dann schaltet der
Proxy um. Die alte Farbe wird danach angehalten.

Was dafuer im Repo liegt: `deploy/server-compose-web.yml` (Proxy und die zwei Farben), `deploy/comphub-update.sh` (das neue Update),
`deploy/blau-gruen-einrichten.sh` (stellt den Server einmal um). Solange niemand die Schritte unten ausfuehrt, aendert sich auf dem Server nichts.

## Einrichten (etwa 15 Minuten, die Seite bleibt dabei erreichbar)

1. **Windows-Taste** druecken, `PowerShell` tippen, **Enter**.
2. Eintippen und **Enter**:
   ```
   ssh root@169.58.181.149
   ```
   Fragt er "Are you sure you want to continue connecting", `yes` tippen und **Enter**. Dann das Server-Passwort eingeben (beim Tippen ist
   nichts zu sehen, das ist normal) und **Enter**.
3. Diese Zeile kopieren, in PowerShell mit **Rechtsklick** einfuegen, **Enter**:
   ```
   curl -fsSL https://raw.githubusercontent.com/comphubgg/CompHub/main/deploy/blau-gruen-einrichten.sh | bash
   ```
   Es muss `OK: Update-Skript umgestellt.` erscheinen.
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

## Wenn etwas nicht stimmt: Rueckweg zum alten Stand

Wie oben einloggen (Schritte 1 und 2), dann diese drei Zeilen einzeln einfuegen, jeweils **Enter**:
```
cp /usr/local/bin/comphub-update.alt /usr/local/bin/comphub-update
docker compose -p comphubweb -f /opt/comphub/web/docker-compose.yml down
cd /opt/comphub && docker compose up -d web
```
Danach laeuft die Seite wieder als ein Container wie vorher. Screenshot schicken, `exit`.

## Was das Skript genau tut (fuer Fragen)

- Jede Minute: `deploy/server-compose.yml` holen und alle Dienste starten wie bisher - ausser `web`.
- Hat das Image `comphub-web:latest` sich geaendert: die freie Farbe damit starten (Port 3101 oder 3102), warten, bis `/api/stand` dort
  `"warm"` meldet (das Aufwaermen nach dem Start, hoechstens 8 Minuten), die meistbesuchten Seiten einmal aufrufen, dann den Proxy umstellen
  (`caddy reload`, laufende Anfragen laufen zu Ende), 30 s warten und die alte Farbe anhalten. Antwortet die neue Farbe gar nicht, bleibt alles
  bei der alten.
- Beide Farben teilen sich die letzten guten Antworten (`/opt/comphub/web-zuletzt`), damit die neue Farbe sie vom ersten Aufruf an hat.
- Protokoll: `/var/log/comphub-update.log`.
