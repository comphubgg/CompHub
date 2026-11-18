#!/bin/bash
# Das Update des Servers, jede Minute (cron -> /usr/local/bin/comphub-update holt diese Datei von GitHub und fuehrt sie aus).
#
# Wie bisher: deploy/server-compose.yml holen, Images ziehen, alle Dienste starten - nur "web" nicht mehr. Die Seite laeuft jetzt in zwei Farben
# hinter einem Proxy (deploy/server-compose-web.yml): ein neues Image startet in der freien Farbe, wird aufgewaermt und bekommt erst dann die
# Besucher; die alte Farbe wird danach angehalten. Vorher ersetzte jedes Aufspielen den einzigen Container - rund 30 s stand die Seite ganz
# (nach dem Start 35 s Ereignisschleife am Stueck, gemessen 18.11.2026), danach minutenlang langsam.
#
# Protokoll: /var/log/comphub-update.log. Anleitung: deploy/WECHSEL-OHNE-AUSFALL.md.
set -u
D=/opt/comphub
cd "$D" || exit 0
RAW=https://raw.githubusercontent.com/comphubgg/CompHub/main
BILD=ghcr.io/comphubgg/comphub-web:latest
log() { echo "$(date -u +%FT%TZ) $*"; }

[ -f update.lock ] && [ $(( $(date +%s) - $(stat -c %Y update.lock) )) -lt 1200 ] && exit 0
touch update.lock
trap 'rm -f update.lock compose.neu web/compose.neu' EXIT

# 1. Die Compose-Dateien (nur gueltige uebernehmen)
curl -fsSL "$RAW/deploy/server-compose.yml" -o compose.neu \
  && [ -s compose.neu ] && docker compose -f compose.neu config -q 2>/dev/null && mv compose.neu docker-compose.yml
mkdir -p web web-zuletzt
curl -fsSL "$RAW/deploy/server-compose-web.yml" -o web/compose.neu \
  && [ -s web/compose.neu ] && docker compose -p comphubweb -f web/compose.neu config -q 2>/dev/null && mv web/compose.neu web/docker-compose.yml
[ -f web/docker-compose.yml ] || { log "web/docker-compose.yml fehlt - Abbruch"; exit 1; }
WEB="docker compose -p comphubweb -f web/docker-compose.yml"

# 2. Alles ausser der alten "web" wie bisher
docker compose pull -q >/dev/null 2>&1
$WEB pull -q >/dev/null 2>&1
DIENSTE=$(docker compose config --services | grep -vx web | tr '\n' ' ')
docker compose up -d --remove-orphans $DIENSTE 2>&1 | grep -v "Running\|up-to-date" || true

# 3. Die Seite: blau/gruen
port() { [ "$1" = blau ] && echo 3101 || echo 3102; }
anderer() { [ "$1" = blau ] && echo gruen || echo blau; }
container() { docker ps -q --filter "label=com.docker.compose.project=comphubweb" --filter "label=com.docker.compose.service=web-$1" | head -1; }
caddyfile() {
  cat > web/Caddyfile.neu <<EOF
{
	admin 127.0.0.1:2019
	auto_https off
}
http://:3100 {
	bind 127.0.0.1
	reverse_proxy 127.0.0.1:$(port "$1") {
		flush_interval -1
	}
}
EOF
  mv web/Caddyfile.neu web/Caddyfile
}

NEU=$(docker image inspect -f '{{.Id}}' "$BILD" 2>/dev/null)
AKTIV=$(cat web/aktiv 2>/dev/null || true)
if [ -n "$AKTIV" ] && [ -n "$(container "$AKTIV")" ] && [ "$(docker inspect -f '{{.Image}}' "$(container "$AKTIV")")" = "$NEU" ]; then
  # Nichts Neues. Nur sicherstellen, dass der Proxy laeuft (z. B. nach einem Neustart des Rechners).
  [ -f web/Caddyfile ] || caddyfile "$AKTIV"
  $WEB up -d proxy 2>&1 | grep -v "Running\|up-to-date" || true
  docker image prune -f >/dev/null 2>&1
  exit 0
fi

ZIEL=$( [ -n "$AKTIV" ] && anderer "$AKTIV" || echo blau )
P=$(port "$ZIEL")
log "Neues Image ${NEU:7:12} -> web-$ZIEL (Port $P), aktiv bisher: ${AKTIV:-alte web}"
$WEB up -d --no-deps --force-recreate "web-$ZIEL" 2>&1 | tail -2

# Warten, bis die neue Farbe antwortet und ihr Aufwaermen (instrumentation-node.ts) durch ist - hoechstens 8 Minuten.
bereit=0
for i in $(seq 1 96); do
  sleep 5
  s=$(curl -s -m 10 "http://127.0.0.1:$P/api/stand" || true)
  if echo "$s" | grep -q '"warm":[0-9]'; then bereit=2; break; fi
  echo "$s" | grep -q '"stand"' && bereit=1
done
if [ "$bereit" = 0 ]; then
  log "web-$ZIEL antwortet nicht - bleibt bei ${AKTIV:-alte web}"
  $WEB stop -t 10 "web-$ZIEL" >/dev/null 2>&1
  exit 1
fi
[ "$bereit" = 1 ] && log "web-$ZIEL antwortet, Aufwaermen nach 8 min nicht fertig - wechsle trotzdem"
# Die meistbesuchten Seiten einmal rendern (die APIs hat das Aufwaermen schon geholt).
for s in / /statistics /fncs /tournament-maps /globals-solos /power-rankings; do
  curl -s -o /dev/null -m 60 "http://127.0.0.1:$P$s" || true
done

# Umschalten
caddyfile "$ZIEL"
if docker compose ps -q web 2>/dev/null | grep -q .; then
  # Einmalig: die alte "web" belegt Port 3100 - weg damit, dann der Proxy (ein bis zwei Sekunden Luecke, nur bei diesem ersten Mal).
  log "Umstieg: alte web wird entfernt, Proxy startet"
  docker compose rm -sf web >/dev/null 2>&1
fi
PROXY=$(docker ps -q --filter "label=com.docker.compose.project=comphubweb" --filter "label=com.docker.compose.service=proxy" | head -1)
if [ -n "$PROXY" ]; then
  docker exec "$PROXY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 \
    || { log "caddy reload gescheitert - Proxy neu"; $WEB up -d --force-recreate proxy 2>&1 | tail -1; }
else
  $WEB up -d proxy 2>&1 | tail -1
fi
echo "$ZIEL" > web/aktiv
c=$(curl -s -o /dev/null -w '%{http_code}' -m 20 http://127.0.0.1:3100/api/ping || true)
log "Proxy -> web-$ZIEL (Probe ueber 3100: HTTP $c)"

# Die alte Farbe: laufende Anfragen zu Ende lassen, dann anhalten (bleibt als angehaltener Container fuer einen Rueckweg liegen).
if [ -n "$AKTIV" ] && [ "$AKTIV" != "$ZIEL" ]; then
  sleep 30
  $WEB stop -t 30 "web-$AKTIV" >/dev/null 2>&1
  log "web-$AKTIV angehalten"
fi
docker image prune -f >/dev/null 2>&1
