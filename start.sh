#!/bin/sh
# 等待 PostgreSQL 就緒後再執行 prisma db push 和啟動 server
# Zeabur 上 DB 服務可能比 app 晚啟動，需要重試

MAX_RETRIES=15
RETRY_INTERVAL=3
ATTEMPT=0

echo "Waiting for database to be ready..."

while [ $ATTEMPT -lt $MAX_RETRIES ]; do
  ATTEMPT=$((ATTEMPT + 1))
  echo "Attempt $ATTEMPT/$MAX_RETRIES: Running prisma db push..."

  npx prisma db push --skip-generate 2>&1

  if [ $? -eq 0 ]; then
    echo "Database is ready! Starting server..."
    exec node server.js
  fi

  echo "Database not ready yet, retrying in ${RETRY_INTERVAL}s..."
  sleep $RETRY_INTERVAL
done

echo "ERROR: Could not connect to database after $MAX_RETRIES attempts. Exiting."
exit 1
