#!/usr/bin/env bash
# Richtet CompHub auf einem frischen Ubuntu-Server ein (Contabo VPS, 14.11.2026).
#
# Vorher vom PC des Betreibers kopiert (scp) nach /root:
#   /root/.env.local          - Zugaenge (Supabase, Discord, ...), wie auf dem PC
#   /root/.cloudflared/       - Tunnel-Einstellungen (config.yml + <id>.json)
#
# Danach laeuft:
#   comphub-web   Docker-Image ghcr.io/comphubgg/comphub-web:latest auf Port 3100
#   cloudflared   derselbe Tunnel wie auf dem PC -> thecomphub.com
#   Auto-Update   jede Minute: neues Image vorhanden? -> neu starten
# Mehrfach ausfuehrbar.
set -euo pipefail
D=/opt/comphub
mkdir -p "$D" /etc/cloudflared

echo "== Pakete"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl ufw fail2ban >/dev/null
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh >/dev/null; fi
systemctl enable --now docker fail2ban >/dev/null

echo "== Firewall (nur SSH offen; die Seite laeuft ueber den Tunnel)"
ufw allow OpenSSH >/dev/null
ufw --force enable >/dev/null

echo "== Zugaenge"
[ -f /root/.env.local ] || { echo "FEHLT: /root/.env.local (vom PC kopieren)"; exit 1; }
# Docker liest Anfuehrungszeichen woertlich - entfernen, Kommentare/Leerzeilen weg.
sed -e 's/\r$//' -e '/^\s*#/d' -e '/^\s*$/d' -e 's/^export //' \
    -e "s/^\([A-Za-z_][A-Za-z0-9_]*\)=\"\(.*\)\"$/\1=\2/" \
    -e "s/^\([A-Za-z_][A-Za-z0-9_]*\)='\(.*\)'$/\1=\2/" /root/.env.local > "$D/web.env"
chmod 600 "$D/web.env"

echo "== Tunnel"
[ -f /root/.cloudflared/config.yml ] || { echo "FEHLT: /root/.cloudflared/config.yml (vom PC kopieren)"; exit 1; }
cp /root/.cloudflared/*.json /etc/cloudflared/ 2>/dev/null || true
# Windows-Pfad der Zugangsdatei auf den Server-Pfad umbiegen, Port bleibt 3100.
sed -e 's/\r$//' -e 's#^\(\s*credentials-file:\s*\).*[\\/]\([^\\/]*\.json\)\s*$#\1/etc/cloudflared/\2#' \
    /root/.cloudflared/config.yml > /etc/cloudflared/config.yml
grep -E "tunnel:|credentials-file:|service:" /etc/cloudflared/config.yml || true

cat > "$D/docker-compose.yml" <<'EOF'
services:
  web:
    image: ghcr.io/comphubgg/comphub-web:latest
    restart: always
    env_file: web.env
    environment:
      COMPHUB_ABLAGE: supabase
      COMPHUB_KEIN_HINTERGRUND: "1"
      NODE_OPTIONS: --max-old-space-size=6144
    ports:
      - "127.0.0.1:3100:10000"
  tunnel:
    image: cloudflare/cloudflared:latest
    restart: always
    network_mode: host
    user: root
    volumes:
      - /etc/cloudflared:/etc/cloudflared:ro
    command: tunnel --no-autoupdate --config /etc/cloudflared/config.yml run
EOF

echo "== Starten"
cd "$D"
docker compose pull -q
docker compose up -d

echo "== Auto-Update (jede Minute)"
cat > /usr/local/bin/comphub-update <<'EOF'
#!/bin/sh
cd /opt/comphub && docker compose pull -q web && docker compose up -d web >/dev/null 2>&1 && docker image prune -f >/dev/null 2>&1
EOF
chmod +x /usr/local/bin/comphub-update
echo '* * * * * root /usr/local/bin/comphub-update >> /var/log/comphub-update.log 2>&1' > /etc/cron.d/comphub-update

echo "== Pruefen"
for i in $(seq 1 30); do
  c=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/ || true)
  [ "$c" = "200" ] && break; sleep 3
done
echo "Seite lokal: HTTP $c"
docker compose ps
docker compose logs --tail 8 tunnel
echo "FERTIG"
