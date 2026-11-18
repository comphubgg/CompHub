#!/bin/bash
# Installiert das Update fuer "blau/gruen" (deploy/comphub-update.sh) und die Compose-Datei der Seite (deploy/server-compose-web.yml) als FESTE lokale
# Kopien - auf einen Commit festgelegt und per sha256 geprueft. Der Minutentakt fuehrt danach nur diese lokale Kopie aus und holt kein Skript mehr
# von GitHub: ein Push auf main wird nicht ungeprueft zu Code, der als root laeuft.
#
# Aufruf (die genaue Zeile mit Commit und Pruefsumme steht in deploy/WECHSEL-OHNE-AUSFALL.md):
#   bash blau-gruen-einrichten.sh <40-stelliger Commit>
# Erneut ausfuehren = Update-Skript erneuern (neue Zeile mit neuem Commit). Mehrfach ausfuehrbar.
set -euo pipefail

# Die Pruefsummen der beiden Dateien im selben Commit wie dieses Skript.
H_UPDATE=63be0526b1ada0ae3e5eb78045227a0399575de178a52f6079f81d8db7a1a969
H_WEB=59f69913cccf19668fd2ffecf2bf484f7d4a7d01f807e31e791e0353ec38d46d

SHA="${1:-}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "FEHLER: bitte den 40-stelligen Commit angeben (siehe deploy/WECHSEL-OHNE-AUSFALL.md)"; exit 1; }
QUELLE="https://raw.githubusercontent.com/comphubgg/CompHub/$SHA/deploy"
LIB=/usr/local/lib/comphub
D=/opt/comphub
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

hole() { # <Datei> <erwartete sha256>
  curl -fsSL "$QUELLE/$1" -o "$TMP/$1"
  echo "$2  $TMP/$1" | sha256sum -c --quiet - || { echo "FEHLER: Pruefsumme von $1 stimmt nicht - nichts geaendert"; exit 1; }
}
hole comphub-update.sh "$H_UPDATE"
hole server-compose-web.yml "$H_WEB"
bash -n "$TMP/comphub-update.sh"

# Ab hier wird installiert (erst alles geprueft, dann geschrieben).
install -d -m 755 "$LIB" "$D/web"
install -m 755 "$TMP/comphub-update.sh" "$LIB/comphub-update.sh"
install -m 644 "$TMP/server-compose-web.yml" "$D/web/docker-compose.yml"
echo "$SHA" > "$LIB/STAND"

ZIEL=/usr/local/bin/comphub-update
# Das alte Update-Skript einmal aufheben (Rueckweg).
if [ ! -f "$ZIEL.alt" ] && ! grep -q "$LIB/comphub-update.sh" "$ZIEL" 2>/dev/null; then cp "$ZIEL" "$ZIEL.alt"; fi
cat > "$ZIEL.neu" <<'SKRIPT'
#!/bin/sh
# Fuehrt nur die feste lokale Kopie aus (installiert von deploy/blau-gruen-einrichten.sh, Stand in /usr/local/lib/comphub/STAND).
# Kein Download von Skripten. Das alte Update-Skript liegt unter /usr/local/bin/comphub-update.alt.
exec bash /usr/local/lib/comphub/comphub-update.sh
SKRIPT
chmod 755 "$ZIEL.neu"
mv "$ZIEL.neu" "$ZIEL"
echo "OK: Update-Skript installiert (Stand ${SHA:0:12}). Die Umstellung der Seite laeuft mit dem naechsten Minutentakt (bis zu 10 Minuten)."
echo "Zusehen:  tail -f /var/log/comphub-update.log   (beenden mit Strg+C)"
