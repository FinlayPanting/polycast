#!/usr/bin/env bash
# Starts a throwaway local Postgres 16 on port 54329 for the server's database tests.
# Usage: source scripts/test-db.sh   (exports PG_TEST_URL), then pnpm check
set -euo pipefail
PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
if [ -z "${PGBIN:-}" ]; then
  (apt-get update -qq && apt-get install -y -qq postgresql >/dev/null) || { echo "Postgres not available; database tests will be skipped"; return 0 2>/dev/null || exit 0; }
  PGBIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
fi
id pgtest >/dev/null 2>&1 || useradd -m pgtest
mkdir -p /tmp/pgdata && chown pgtest /tmp/pgdata
if [ ! -f /tmp/pgdata/db/PG_VERSION ]; then
  su pgtest -c "$PGBIN/initdb -D /tmp/pgdata/db -U postgres --auth=trust" >/dev/null
fi
su pgtest -c "$PGBIN/pg_ctl -D /tmp/pgdata/db -o '-p 54329 -k /tmp' -l /tmp/pgdata/log status" >/dev/null 2>&1 \
  || su pgtest -c "$PGBIN/pg_ctl -D /tmp/pgdata/db -o '-p 54329 -k /tmp' -l /tmp/pgdata/log -w start" >/dev/null
export PG_TEST_URL=postgres://postgres@localhost:54329/postgres
echo "Test database ready: $PG_TEST_URL"
