#!/usr/bin/env bash
# Diagnose (15.11.2026, Zweig exakt-mats-strecke): Replays und Epics Werte je Match in einen Entwurfs-Release legen, damit der Leser lokal
# beliebig oft darueber laufen kann (die Artefakte der Laeufe sind von aussen nicht abrufbar). Ein Entwurf ist nur fuer Schreibberechtigte sichtbar;
# der Release wird nach der Diagnose geloescht.
#   MS_MATCHES="id1,id2" MS_EPIC="event|window|seiten;event|window|seiten" bash scripts/ms-holen.sh
set -u
REL=diag-ms-roh
gh release view "$REL" >/dev/null 2>&1 || gh release create "$REL" --draft --title "Diagnose Mats/Strecke (Entwurf)" --notes "Nur Diagnose, wird geloescht." >/dev/null
if [ "${MS_EPIC:-}" = "schluessel" ]; then node scripts/diag-epic-schluessel.mjs EU,NAC 2>&1 | grep SCHLUESSEL | cut -c1-3000; for f in /tmp/epic-schluessel.json /tmp/katalog-EU.json; do gzip -f $f; gh release upload "$REL" $f.gz --clobber; done; exit 0; fi
if [ "${MS_EPIC:-}" = "alt" ]; then
  : > /tmp/alt.tsv
  for TAG in daten-spieltage daten-spieltage-s42 daten-spieltage-alt daten-spieltage-s43; do
    gh api "repos/$GITHUB_REPOSITORY/releases/tags/$TAG" --jq '.assets[] | select(.name|test("_EU\\.json$")) | "\(.id)"' 2>/dev/null | while read ID; do
      gh api -H "Accept: application/octet-stream" "repos/$GITHUB_REPOSITORY/releases/assets/$ID" 2>/dev/null | head -c 600 | grep -oE '"(eventId|windowId)": *"[^"]+"' | sed -E 's/.*: *"([^"]+)"/\1/' | paste -sd '\t' >> /tmp/alt.tsv
    done
  done
  wc -l /tmp/alt.tsv
  node scripts/diag-epic-alt.mjs /tmp/alt.tsv 2>&1 | grep ALT
  gzip -f /tmp/epic-alt.json; gh release upload "$REL" /tmp/epic-alt.json.gz --clobber; exit 0
fi
IFS=';' read -ra EP <<< "${MS_EPIC:-}"
for e in "${EP[@]}"; do
  [ -z "$e" ] && continue
  IFS='|' read -r EV WI SE <<< "$e"
  node scripts/diag-epic-sitzungen.mjs "$EV" "$WI" "/tmp/epic__$WI.json" "${SE:-5}" 2>&1 | grep EPIC | cut -c1-600
  [ -s "/tmp/epic__$WI.json" ] && gzip -f "/tmp/epic__$WI.json" && gh release upload "$REL" "/tmp/epic__$WI.json.gz" --clobber && echo "HOCH epic__$WI.json.gz"
done
IFS=',' read -ra M <<< "${MS_MATCHES:-}"
for m in "${M[@]}"; do
  { [ -z "$m" ] || [ "$m" = "-" ]; } && continue
  for v in 1 2 3; do
    node -e "const { downloadReplay } = require('fortnite-serverreplay-downloader'); (async () => { const b = await downloadReplay({ matchId: process.argv[1], dataCount: 100000, checkpointCount: 0, eventCount: 100000 }); require('fs').writeFileSync(process.argv[2], b); console.log('geladen', process.argv[1], b.length); })().catch((e) => { console.log('FEHLER', process.argv[1], e.message); process.exit(1); });" "$m" "/tmp/$m.replay" && break
    sleep 10
  done
  [ -s "/tmp/$m.replay" ] && gh release upload "$REL" "/tmp/$m.replay" --clobber && echo "HOCH $m.replay"
  rm -f "/tmp/$m.replay"
done
