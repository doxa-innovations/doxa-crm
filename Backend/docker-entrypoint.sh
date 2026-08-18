#!/usr/bin/env sh
set -e

# Migrations run before any role starts, and before an explicit command is
# honoured, so docker-compose's explicit `command:` values keep working.
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  alembic upgrade head
fi

# An explicit command (docker-compose `command:`, `docker run image sh`) wins.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

PROCESS_ROLE="${PROCESS_ROLE:-api}"

case "$PROCESS_ROLE" in
  api)
    exec uvicorn app.main:app \
      --host 0.0.0.0 \
      --port "${PORT:-8000}" \
      --proxy-headers \
      --forwarded-allow-ips='*'
    ;;
  worker)
    exec celery -A app.workers.celery_app.celery_app worker \
      --loglevel="${CELERY_LOG_LEVEL:-info}"
    ;;
  beat)
    exec celery -A app.workers.celery_app.celery_app beat \
      --loglevel="${CELERY_LOG_LEVEL:-info}" \
      --schedule /tmp/celerybeat-schedule
    ;;
  *)
    echo "Unknown PROCESS_ROLE: $PROCESS_ROLE (expected api, worker or beat)" >&2
    exit 1
    ;;
esac
