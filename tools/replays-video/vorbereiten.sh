#!/usr/bin/env bash
# Die echten Seitenaufnahmen (Workflow "Seite aufnehmen", Release "medien") holen und fuer die Szene aufbereiten.
#   tools/replays-video/vorbereiten.sh <medien-ordner> [name=replays-aufnahme] [formate="quer hoch"]
# Ergebnis je Format: <ordner>/<format>/f/000000.jpg ... (30 Bilder/s aus seite.mp4), wand/ (Standbilder fuer den Hintergrund), marken.json (+ bilderAus, standbilder).
set -euo pipefail
ZIEL=$(realpath -m "$1"); NAME=${2:-replays-aufnahme}; FORMATE=${3:-quer hoch}
mkdir -p "$ZIEL"
for F in $FORMATE; do
  TAR="$ZIEL/$NAME-$F.tar"
  ID=$(gh api repos/comphubgg/CompHub/releases/tags/medien --jq ".assets[]|select(.name==\"$NAME-$F.tar\")|.id")
  [ -n "$ID" ] || { echo "kein $NAME-$F.tar im Release medien"; exit 1; }
  gh api -H "Accept: application/octet-stream" "repos/comphubgg/CompHub/releases/assets/$ID" > "$TAR"
  rm -rf "$ZIEL/$F" "$ZIEL/roh-$F"; mkdir -p "$ZIEL/roh-$F"
  tar -xf "$TAR" -C "$ZIEL/roh-$F"
  QUELLE="$ZIEL/roh-$F/aufnahme-$F"
  mkdir -p "$ZIEL/$F/f" "$ZIEL/$F/wand"
  ffmpeg -v error -i "$QUELLE/seite.mp4" -start_number 0 -q:v 2 "$ZIEL/$F/f/%06d.jpg"
  cp "$QUELLE"/standbilder/* "$ZIEL/$F/wand/"
  N=$(ls "$ZIEL/$F/f" | wc -l)
  python3 -I - "$QUELLE/marken.json" "$ZIEL/$F/marken.json" "$N" "$ZIEL/$F/wand" <<'EOF'
import json, os, sys
m = json.load(open(sys.argv[1])); m["bilderAus"] = int(sys.argv[3])
m["standbilder"] = sorted(os.listdir(sys.argv[4]))
json.dump(m, open(sys.argv[2], "w"), indent=1)
EOF
  cp "$QUELLE/auswahl.json" "$ZIEL/$F/" 2>/dev/null || true
  echo "$F: $N Bilder"
done
