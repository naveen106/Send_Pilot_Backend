#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_DIR}"

printf '\n==============================================\n'
printf '      BulkMailer Backend Setup\n'
printf '==============================================\n\n'

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js 22.12+ is required." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm 10+ is required." >&2
  exit 1
fi

NODE_VERSION="$(node -p "process.versions.node")"
NODE_MAJOR="$(node -p "parseInt(process.versions.node.split('.')[0], 10)")"
if [ "${NODE_MAJOR}" -lt 22 ]; then
  echo "Error: Node.js ${NODE_VERSION} is too old. Use Node.js 22.12+." >&2
  exit 1
fi

echo "1/4 Preparing environment..."
if [ ! -f .env ]; then
  if [ ! -f .env.example ]; then
    echo "Error: .env.example is missing." >&2
    exit 1
  fi
  cp .env.example .env
  echo "Created .env from .env.example."
  echo "Update database, JWT, administrator, and SMTP values before rerunning this script."
else
  echo ".env already exists; keeping the current configuration."
fi

if ! grep -Eq '^DATABASE_URL=.+' .env; then
  if grep -Eq '^(DB_HOST|DB_NAME|DB_USER|DB_PASSWORD|DB_PORT)=(your host|your db name|your username|your password|your port)$' .env; then
    echo "Error: .env still contains placeholder database values." >&2
    echo "Configure .env, then rerun: bash scripts/setup.sh" >&2
    exit 1
  fi
fi

if grep -Eq '^JWT_SECRET=(replace_with_a_long_random_secret|)$' .env; then
  echo "Error: JWT_SECRET must be replaced with a long random value." >&2
  exit 1
fi

echo "2/4 Installing locked dependencies..."
npm ci

echo "3/4 Generating Prisma client..."
npm run prisma:generate

echo "4/4 Applying database migrations and seeding the administrator..."
npm run prisma:migrate

printf '\n==============================================\n'
printf ' Backend setup completed successfully.\n'
printf ' Start the API with: npm run dev\n'
printf ' Health check: http://localhost:5000/health\n'
printf '==============================================\n\n'
