# BulkMailer — Backend

BulkMailer Backend is the authenticated REST API that powers campaign management, contact operations, scheduled delivery, and dashboard reporting for the BulkMailer platform.

It is built for reliable email workflows: campaign sends are persisted, delivery history is tracked, daily quotas are enforced, scheduled work is processed by a cron-driven scheduler, and database migrations run automatically when the production container starts.

## Features

- REST API built with Express 5 and TypeScript
- Prisma 7 with a MariaDB adapter and MySQL-compatible databases
- JWT access tokens with HttpOnly refresh-token cookies
- Secure authentication, password recovery, and session refresh
- Role-based authorization for administrative and campaign operations
- Campaign creation, scheduling, retry, assignment, deletion, and delivery tracking
- Contact creation, update, import, deduplication, pagination, and search
- CSV/XLSX uploads with a 10 MB file-size limit
- Global daily email quota, campaign daily limits, and configurable send modes
- Background scheduler for due campaigns
- Structured Winston logs with date-based rotation
- Dockerized production runtime with automatic migrations and health checks

## Tech Stack

- **Node.js 22+** and **TypeScript 7**
- **Express 5** — HTTP server and middleware pipeline
- **Prisma 7** — schema, migrations, and database access
- **MariaDB adapter** — MySQL/MariaDB connectivity
- **MySQL-compatible database** — persistent application data
- **JWT** — short-lived access-token authentication
- **HttpOnly cookies** — refresh-token storage
- **Nodemailer** — SMTP email delivery
- **node-cron** — scheduled campaign processing
- **Winston** — structured application and email logs
- **Multer** — in-memory multipart uploads
- **CSV Parse** and **ExcelJS** — contact import processing

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) `22.12` or newer
- npm `10` or newer
- MySQL or MariaDB with a reachable database
- SMTP credentials for sending email

### Install and configure

From the backend directory:

`bash
npm install
cp .env.example .env
`

On PowerShell:

`powershell
Copy-Item .env.example .env
`

Update the database, JWT, administrator, SMTP, and frontend values in [`.env`](.env).

### One-command setup

After configuring the database values in `.env`, run:

```bash
bash scripts/setup.sh
```

The script installs the locked dependencies, preserves an existing `.env`, and uses `.env.example` only as a starting template when `.env` is missing. It then generates the Prisma client, applies migrations, and runs the administrator seed. It is safe to rerun. Database credentials and a real `JWT_SECRET` are required because migrations connect to the database.

### Initialize the database

`bash
npm run prisma:generate
npm run prisma:migrate
`

The migration command applies pending migrations and runs the Prisma seed hook. The seed creates the administrator using `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME`; it does not overwrite an existing administrator. Use the forgot-password flow to change an existing password.

### Start the API

`bash
npm run dev
`

The API runs at [http://localhost:5000](http://localhost:5000).

Health check: [http://localhost:5000/health](http://localhost:5000/health)

## Available Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Starts the development server with automatic TypeScript reloads. |
| `npm run build` | Compiles TypeScript into [`dist/`](dist/). |
| `npm run check` | Runs the production TypeScript build as a validation check. |
| `npm start` | Starts the compiled server from [`dist/index.js`](dist/index.js). |
| `npm run prisma:generate` | Generates the Prisma client. |
| `npm run prisma:migrate` | Applies committed migrations in deployment environments and runs the seed hook. |
| `npm run prisma:migrate:dev` | Creates and applies a development migration. |
| `npm run prisma:migrate:resolve` | Resolves a migration state manually. |
| `npm run prisma:studio` | Opens Prisma Studio for database inspection. |
| `npm run seed` | Runs the administrator seed script directly. |

## Configuration

Environment variables are read from [`.env.example`](.env.example). Copy it to [`.env`](.env). The application accepts either a complete `DATABASE_URL` or the individual database connection variables below.

| Variable | Purpose | Example or default |
| --- | --- | --- |
| `DATABASE_URL` | Optional complete database connection string. | Generated when omitted |
| `DB_HOST` | Database hostname. | — |
| `DB_PORT` | Database port. | `3306` |
| `DB_NAME` | Database name. | — |
| `DB_USER` | Database username. | — |
| `DB_PASSWORD` | Database password. | — |
| `DB_SSL_MODE` | Database TLS mode. | `REQUIRED` |
| `DB_CA_PATH` | Optional path to a database CA certificate used for TLS verification. | Unset |
| `PRISMA_CONNECTION_LIMIT` | Prisma connection pool size. | `3` |
| `PRISMA_POOL_TIMEOUT` | Pool acquisition timeout in seconds. | `30` |
| `PORT` | HTTP server port. | `5000` |
| `NODE_ENV` | Runtime environment. | `development` |
| `JWT_SECRET` | Long, random signing secret. | Required |
| `JWT_EXPIRES_IN` | Access-token lifetime. | `15m` |
| `ADMIN_EMAIL` | Bootstrap administrator email. | Required |
| `ADMIN_PASSWORD` | Bootstrap administrator password. | Required |
| `ADMIN_NAME` | Bootstrap administrator display name. | — |
| `SMTP_HOST` | SMTP server hostname. | Required for email |
| `SMTP_PORT` | SMTP server port. | `587` |
| `SMTP_SECURE` | Enables SMTP secure mode. | `false` |
| `SMTP_TLS_REJECT_UNAUTHORIZED` | Controls SMTP certificate verification. | `true` |
| `SMTP_USER` | SMTP username and sender address. | Required for email |
| `SMTP_PASS` | SMTP password or app password. | Required for email |
| `MAX_DAILY_EMAILS` | Global rolling 24-hour send quota. | `200` |
| `SCHEDULER_ENABLED` | Enables scheduled campaign processing. | `true` |
| `FRONTEND_URL` | Allowed CORS origin and reset-link base URL. | `http://localhost:3000` |
| `LOG_LEVEL` | Minimum log level to write. | `info` |
| `LOG_DIR` | Log output directory. | `logs` |

The service rejects startup when database configuration or `JWT_SECRET` is missing or uses a placeholder value.

## Project Structure

<pre>
backend/
├── prisma/                   # Database
├── src/                      # Application
│   ├── config/               # Configuration
│   ├── controllers/          # HTTP handlers
│   ├── middleware/           # Auth and validation
│   ├── routes/               # API routes
│   ├── services/             # Business logic
│   ├── types/                # TypeScript types
│   ├── utils/                # Shared utilities
│   ├── app.ts                # Express setup
│   └── index.ts              # Server startup
├── docs/                     # Setup, run, and usage guides
│   ├── setup.md              # Installation and database setup
│   ├── run.md                # Start, stop, and check commands
│   └── Usage.md              # Short API usage guide
├── scripts/setup.sh          # Local setup automation
├── Dockerfile                # Production image
├── docker-entrypoint.sh      # Startup migrations
├── prisma.config.ts          # Prisma configuration
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
└── .env.example              # Environment template
</pre>

Important paths:

- [`docs/setup.md`](docs/setup.md) — complete local setup guide
- [`docs/run.md`](docs/run.md) — start, stop, Docker, and health-check instructions
- [`docs/Usage.md`](docs/Usage.md) — short backend usage guide
- [`src/routes/index.ts`](src/routes/index.ts) — current API route definitions
- [`src/services/`](src/services/) — campaign, contact, auth, email, and scheduler workflows
- [`src/config/database-url.ts`](src/config/database-url.ts) — database URL construction and pool settings
- [`src/middleware/auth.ts`](src/middleware/auth.ts) — JWT authentication and role authorization
- [`prisma/schema.prisma`](prisma/schema.prisma) — database model
- [`prisma/migrations/`](prisma/migrations/) — committed schema history
- [`Dockerfile`](Dockerfile) — production build and runtime definition

## API Overview

All application routes are mounted under `/api`.

### Authentication

| Method | Endpoint | Access |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Public |
| `POST` | `/api/auth/refresh` | Refresh cookie |
| `POST` | `/api/auth/logout` | Refresh cookie |
| `POST` | `/api/auth/forgot-password` | Public |
| `POST` | `/api/auth/reset-password` | Public |
| `GET` | `/api/auth/me` | Authenticated |

### Dashboard

| Method | Endpoint | Access |
| --- | --- | --- |
| `GET` | `/api/dashboard` | Authenticated |

### Campaigns

| Method | Endpoint | Access |
| --- | --- | --- |
| `GET` | `/api/campaigns` | Authenticated |
| `POST` | `/api/campaigns` | Admin or manager |
| `POST` | `/api/campaigns/assign` | Admin or manager |
| `GET` | `/api/campaigns/:id` | Authenticated |
| `POST` | `/api/campaigns/:id/send` | Admin or manager |
| `POST` | `/api/campaigns/:id/retry` | Admin or manager |
| `DELETE` | `/api/campaigns/:id` | Admin |
| `DELETE` | `/api/campaigns` | Admin |

### Contacts

| Method | Endpoint | Access |
| --- | --- | --- |
| `GET` | `/api/contacts` | Authenticated |
| `POST` | `/api/contacts` | Admin or manager |
| `PUT` | `/api/contacts/:id` | Admin or manager |
| `DELETE` | `/api/contacts/:id` | Admin |
| `DELETE` | `/api/contacts` | Admin |
| `POST` | `/api/contacts/import` | Admin or manager |
| `POST` | `/api/contacts/deduplicate` | Admin |

## Roles and Authorization

Authorization is enforced by backend middleware, not only by the frontend.

| Role | Capabilities |
| --- | --- |
| `ADMIN` | Full campaign and contact management, including deletion and deduplication |
| `MANAGER` | Create, send, retry, assign campaigns and manage contacts without destructive admin actions |
| `USER` | Authenticated read access where supported |

Access tokens are short-lived. Refresh tokens are stored in HttpOnly cookies and rotated by the refresh flow. Configure `FRONTEND_URL` so credentialed CORS and password-reset links work correctly.

## Docker

Build the production image from the backend directory:

`bash
docker build -t bulkmailer-backend .
`

Run it with database and SMTP configuration:

`bash
docker run --rm -p 5000:5000 --env-file .env bulkmailer-backend
`

The container:

1. Installs production dependencies.
2. Generates Prisma client artifacts during the build.
3. Runs `prisma migrate deploy` on startup.
4. Starts the compiled API.
5. Reports healthy when `/health` responds successfully.

The database must be reachable from the container. With Docker Desktop, `localhost` inside the container refers to the container itself; use `host.docker.internal` for a database running on the host.

## Logging

Logs are written under the directory configured by `LOG_DIR` (default: [`logs/`](logs/)).

Supported levels include `error`, `warn`, `success`, `info`, `http`, `verbose`, `debug`, and `silly`. Email delivery events are written to a dedicated email-sending log, while application logs are organized by date and level.

Do not commit logs or environment files. Both are excluded by [`.gitignore`](.gitignore).

## Development Notes

- Run `npm run check` before opening a pull request.
- Create development migrations with `npm run prisma:migrate:dev`.
- Keep database access inside [`src/services/`](src/services/).
- Keep request parsing and response formatting inside [`src/controllers/`](src/controllers/).
- Store secrets only in [`.env`](.env), never in source code or committed configuration.
- Update [`UPGRADING.md`](UPGRADING.md) when a change requires migration or deployment action.

## License

This project is private and intended for internal use.
