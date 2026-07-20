#!/bin/sh
set -eu

cd /app

if [ ! -f package.json ]; then
  echo "WorkBase source is missing from /app. Clone the repository into the mounted folder."
  exit 1
fi

echo "Installing locked dependencies..."
npm ci

echo "Building WorkBase..."
npm run build

echo "Starting WorkBase on port ${PORT:-3000}..."
exec npm start
