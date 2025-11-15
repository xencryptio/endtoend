#!/bin/sh
# wait-for-db.sh - Wait for PostgreSQL to be ready

set -e

host="$1"
shift
cmd="$@"

echo "Waiting for PostgreSQL at $host:5432..."

max_retries=30
retry_count=0

until pg_isready -h "$host" -p "5432" -U "scanuser" > /dev/null 2>&1; do
  retry_count=$((retry_count + 1))
  
  if [ $retry_count -ge $max_retries ]; then
    echo "Postgres is unavailable - sleeping (attempt $retry_count/$max_retries)"
    sleep 2
  fi
  
  if [ $retry_count -ge $max_retries ]; then
    echo "ERROR: PostgreSQL did not become ready after $max_retries attempts"
    exit 1
  fi
done

echo "Postgres is up - executing command"
exec $cmd