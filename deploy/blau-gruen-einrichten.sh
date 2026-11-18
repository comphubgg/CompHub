#!/bin/bash
# Einmalig auf dem Server: das Update-Skript auf "blau/gruen" umstellen (deploy/comphub-update.sh, Anleitung deploy/WECHSEL-OHNE-AUSFALL.md).
# Aufruf:  curl -fsSL https://raw.githubusercontent.com/comphubgg/CompHub/main/deploy/blau-gruen-einrichten.sh | bash
set -euo pipefail
ZIEL=/usr/local/bin/comphub-update
[ -f "$ZIEL.alt" ] || cp "$ZIEL" "$ZIEL.alt"
cat > "$ZIEL.neu" <<'EOF'
#!/bin/sh
# Holt das eigentliche Update-Skript jede Minute von GitHub (deploy/comphub-update.sh) - Aenderungen daran kommen so mit einem Push.
# Das alte Skript liegt unter /usr/local/bin/comphub-update.alt (Rueckweg: deploy/WECHSEL-OHNE-AUSFALL.md).
curl -fsSL https://raw.githubusercontent.com/comphubgg/CompHub/main/deploy/comphub-update.sh -o /usr/local/bin/comphub-update.sh.neu \
  && bash -n /usr/local/bin/comphub-update.sh.neu && mv /usr/local/bin/comphub-update.sh.neu /usr/local/bin/comphub-update.sh
exec bash /usr/local/bin/comphub-update.sh
EOF
chmod +x "$ZIEL.neu"
mv "$ZIEL.neu" "$ZIEL"
echo "OK: Update-Skript umgestellt. Die Umstellung der Seite laeuft mit dem naechsten Minutentakt (bis zu 10 Minuten)."
echo "Zusehen:  tail -f /var/log/comphub-update.log   (beenden mit Strg+C)"
