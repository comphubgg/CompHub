#!/usr/bin/env bash
# Diagnose (15.11.2026, Zweig exakt-mats-strecke): Replays und Epics Werte je Match in einen Entwurfs-Release legen, damit der Leser lokal
# beliebig oft darueber laufen kann (die Artefakte der Laeufe sind von aussen nicht abrufbar). Ein Entwurf ist nur fuer Schreibberechtigte sichtbar;
# der Release wird nach der Diagnose geloescht.
#   MS_MATCHES="id1,id2" MS_EPIC="event|window|seiten;event|window|seiten" bash scripts/ms-holen.sh
set -u
REL=diag-ms-roh
gh release view "$REL" >/dev/null 2>&1 || gh release create "$REL" --draft --title "Diagnose Mats/Strecke (Entwurf)" --notes "Nur Diagnose, wird geloescht." >/dev/null
IFS=';' read -ra EP <<< "${MS_EPIC:-}"
for e in "${EP[@]}"; do
  [ -z "$e" ] && continue
  IFS='|' read -r EV WI SE <<< "$e"
  node scripts/diag-epic-sitzungen.mjs "$EV" "$WI" "/tmp/epic__$WI.json" "${SE:-5}" 2>&1 | grep EPIC | cut -c1-600
  [ -s "/tmp/epic__$WI.json" ] && gzip -f "/tmp/epic__$WI.json" && gh release upload "$REL" "/tmp/epic__$WI.json.gz" --clobber && echo "HOCH epic__$WI.json.gz"
done
IFS=',' read -ra M <<< "${MS_MATCHES:-}"
for m in "${M[@]}"; do
  [ -z "$m" ] && continue
  for v in 1 2 3; do
    node -e "const { downloadReplay } = require('fortnite-serverreplay-downloader'); (async () => { const b = await downloadReplay({ matchId: process.argv[1], dataCount: 100000, checkpointCount: 0, eventCount: 100000 }); require('fs').writeFileSync(process.argv[2], b); console.log('geladen', process.argv[1], b.length); })().catch((e) => { console.log('FEHLER', process.argv[1], e.message); process.exit(1); });" "$m" "/tmp/$m.replay" && break
    sleep 10
  done
  [ -s "/tmp/$m.replay" ] && gh release upload "$REL" "/tmp/$m.replay" --clobber && echo "HOCH $m.replay"
  rm -f "/tmp/$m.replay"
done
