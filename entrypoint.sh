#!/usr/bin/env bash
set -euo pipefail

# If CRON_INTERVAL (seconds) is set, run scraper periodically; otherwise run once.
SCRAPER_ARGS=${SCRAPER_ARGS:-"--headless --region EU --pageSize 50 --top 10000"}
CRON_INTERVAL=${CRON_INTERVAL:-}

cd /app

if [ -z "${CRON_INTERVAL}" ]; then
  echo "Running scraper once: python fortnite_rankings_scraper.py ${SCRAPER_ARGS}"
  python fortnite_rankings_scraper.py ${SCRAPER_ARGS}
  exit $?
else
  echo "Running scraper in loop every ${CRON_INTERVAL}s"
  while true; do
    python fortnite_rankings_scraper.py ${SCRAPER_ARGS} || true
    sleep ${CRON_INTERVAL}
  done
fi
