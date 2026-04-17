#!/bin/bash
# Prabu-Siliwangi Health Monitor
# Add to crontab: */5 * * * * /app/prabu-siliwangi/scripts/monitor.sh

set -e

ALERT_EMAIL="your-email@example.com"
HEALTH_URL="http://localhost:8787/health"
LOG_FILE="/app/prabu-siliwangi/logs/health.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> $LOG_FILE
}

# Check Rust Engine
if curl -sf $HEALTH_URL > /dev/null; then
    log "OK: Rust Copy Engine is healthy"
else
    log "ERROR: Rust Copy Engine is down!"
    # Restart service
    cd /app/prabu-siliwangi
    docker-compose restart rust-copy-engine
    log "RESTARTED: Rust Copy Engine"
fi

# Check memory usage
MEM_USAGE=$(free | grep Mem | awk '{printf("%.0f", $3/$2 * 100)}')
if [ "$MEM_USAGE" -gt 90 ]; then
    log "WARNING: Memory usage is ${MEM_USAGE}%"
fi

# Check disk usage
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 90 ]; then
    log "WARNING: Disk usage is ${DISK_USAGE}%"
fi

# Clean up old logs (keep last 7 days)
find /app/prabu-siliwangi/logs -name "*.log" -mtime +7 -delete
