# Backend Setup

This guide prepares the BulkMailer API for local development.

## Prerequisites

- Node.js 22.12 or newer
- npm 10 or newer
- A reachable MySQL or MariaDB database
- SMTP credentials for email delivery

## Setup

From the backend repository root:

~~~bash
bash scripts/setup.sh
~~~

The script:

1. Uses the existing .env when it is present.
2. Copies .env.example to .env only when .env does not exist.
3. Installs dependencies with npm ci.
4. Generates the Prisma client.
5. Applies database migrations.
6. Seeds the administrator account when it does not exist.

Before running the script, make sure [.env](../.env) contains real database, JWT, administrator, and SMTP values. [.env.example](../.env.example) is only a configuration template.

If the script is not executable on Linux or macOS:

~~~bash
chmod +x scripts/setup.sh
bash scripts/setup.sh
~~~

## Manual setup

~~~bash
npm ci
npm run prisma:generate
npm run prisma:migrate
npm run check
~~~

The project is ready when the migration and build commands complete successfully.

