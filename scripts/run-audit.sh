#!/bin/bash
# Daily Google Ads Audit — launched by launchd at 08:00 EET
# This wrapper sets up the environment for Node.js

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/spirosmaragkoudakis"

PROJECT_DIR="$HOME/google-ads-ai-agent"
LOG_FILE="$PROJECT_DIR/logs/audit.log"

mkdir -p "$PROJECT_DIR/logs"

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] run-audit.sh started" >> "$LOG_FILE"

cd "$PROJECT_DIR" || exit 1

/usr/local/bin/node scripts/daily-audit.mjs >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] run-audit.sh finished with exit code $EXIT_CODE" >> "$LOG_FILE"

exit $EXIT_CODE
