# BulkMailer — Backend

A REST API for bulk email campaign management built with Node.js, Express, TypeScript, Prisma, and MySQL.

---

## Tech Stack

- **Node.js** + **TypeScript**
- **Express** — HTTP server
- **Prisma** — ORM
- **MySQL** — database
- **JWT** — authentication
- **Nodemailer** — email sending
- **node-cron** — campaign scheduler
- **Winston** — logging with daily log rotation
- **Multer** — file uploads (CSV/XLSX contact import)

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm v9 or higher
- MySQL v8 or higher

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/monkhaihq/bulk-email-sender-be.git
cd backend

# 2. Install dependencies
npm install
```

---

## Environment Variables

Copy the example and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|---|---|---|
| `ADMIN_EMAIL` | Initial admin account email | — |
| `ADMIN_PASSWORD` | Initial admin account password | — |
| `ADMIN_NAME` | Initial admin display name | `Admin` |
| `DB_HOST` | MySQL/Aiven host | `localhost` |
| `DB_PORT` | MySQL/Aiven port | `3306` |
| `DB_NAME` | Application database name | `bulk_email_sender` |
| `DB_USER` | Database username | `root` |
| `DB_PASSWORD` | Database password | — |
| `DB_SSL_MODE` | MySQL SSL mode | `REQUIRED` |
| `DATABASE_URL` | Optional full connection string override | Generated from the database parts above |
| `PORT` | Server port | `5000` |
| `NODE_ENV` | Environment | `development` |
| `JWT_SECRET` | Secret key for signing JWTs | — |
| `JWT_EXPIRES_IN` | JWT expiry duration | `7d` |
| `SMTP_HOST` | SMTP server host | — |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_SECURE` | Use TLS | `false` |
| `SMTP_USER` | SMTP username / sender email | — |
| `SMTP_PASS` | SMTP password / app password | — |
| `SCHEDULER_ENABLED` | Enable cron scheduler | `true` |
| `FRONTEND_URL` | Frontend URL for password reset links | `http://localhost:3000` |
| `LOG_LEVEL` | Winston log level | `info` |
| `LOG_DIR` | Directory for log files | `logs` |

Email delivery limits, batch size, and interval delays are maintained in
`src/config/app.config.ts` because they are application defaults rather than
secrets or deployment-specific settings.

---

## Database Setup

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations — automatically seeds the admin account on first run
npm run prisma:migrate

# (Optional) Open Prisma Studio
npm run prisma:studio
```

> The admin account is created from `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME` in your `.env`. The seed runs automatically after every migration via Prisma's seed hook. It uses `upsert`, so re-running is safe.

To add more users after setup, log in as admin and register them via the Users page.

---

## Running Locally

```bash
npm run dev
```

Server will be available at `http://localhost:5000`.

Health check: `GET http://localhost:5000/health`

---

## Building for Production

```bash
npm run build
npm start
```

---

## Project Structure

```
backend/
├── prisma/
│   ├── migrations/        # Prisma migration files
│   ├── schema.prisma      # Database schema
│   └── seed.ts            # Database seeder (upserts admin account)
├── src/
│   ├── config/
│   │   ├── database.ts    # PrismaClient singleton + validateDatabaseConnection()
│   │   └── smtp.ts        # getSmtpConfig(), createTransporter(), testSmtpConnection()
│   ├── controllers/       # Thin HTTP layer — parse req, call service, send res
│   │   ├── auth.controller.ts
│   │   ├── campaign.controller.ts
│   │   ├── contact.controller.ts
│   │   ├── logs.controller.ts
│   │   └── smtp.controller.ts
│   ├── middleware/
│   │   ├── auth.ts        # authenticate() (JWT verify) + authorize(...roles) (role guard)
│   │   ├── logging.ts     # requestLogger (finish-event timing) + errorHandler (500 fallback)
│   │   └── validation.ts  # validate() — runs express-validator result check
│   ├── routes/
│   │   └── index.ts       # All route definitions; multer upload configured here
│   ├── services/          # Business logic; only layer that touches Prisma
│   │   ├── auth.service.ts        # loginUser, forgotPassword, resetPassword, ensureAdminExists
│   │   ├── campaign.service.ts    # createCampaign, getCampaigns, sendCampaignNow, getDashboardStats
│   │   ├── contact.service.ts     # importContacts (CSV/XLSX), getContacts, addContact, removeDuplicates
│   │   ├── email.service.ts       # sendCampaign() — batch/interval send with daily limit enforcement
│   │   └── scheduler.service.ts   # node-cron every-minute tick; triggers due SCHEDULED campaigns
│   ├── types/
│   │   └── index.ts       # Shared TS types: Role, JwtPayload, AuthRequest, SmtpConfig, ApiResponse
│   ├── utils/
│   │   ├── helpers.ts     # Pure utilities: parseJsonArray, randomDelay, sleep, sanitizeLog
│   │   └── logger.ts      # Structured date-folder logger + named emailLogger
│   ├── app.ts             # Express setup: CORS, JSON body, requestLogger, routes, errorHandler
│   └── index.ts           # Bootstrap: DB connect → ensureAdminExists → startScheduler → listen
├── logs/                  # Auto-generated date-folder log files
├── .env                   # Environment variables (not committed)
├── package.json
├── tsconfig.json
└── tsconfig.seed.json
```

---

## API Endpoints

### Auth
| Method | Path | Access |
|---|---|---|
| `POST` | `/api/auth/login` | Public |
| `POST` | `/api/auth/signup` | Public |
| `POST` | `/api/auth/forgot-password` | Public |
| `POST` | `/api/auth/reset-password` | Public |
| `POST` | `/api/auth/register` | ADMIN |
| `GET` | `/api/auth/me` | Authenticated |

### Users
| Method | Path | Access |
|---|---|---|
| `GET` | `/api/users` | ADMIN |
| `PATCH` | `/api/users/:id/role` | ADMIN |
| `PATCH` | `/api/users/:id/toggle` | ADMIN |

### Campaigns
| Method | Path | Access |
|---|---|---|
| `GET` | `/api/campaigns` | Authenticated |
| `POST` | `/api/campaigns` | ADMIN, MANAGER |
| `GET` | `/api/campaigns/:id` | Authenticated |
| `POST` | `/api/campaigns/:id/send` | ADMIN, MANAGER |
| `POST` | `/api/campaigns/:id/retry` | ADMIN, MANAGER |
| `DELETE` | `/api/campaigns/:id` | ADMIN |
| `DELETE` | `/api/campaigns` | ADMIN (bulk) |

### Contacts
| Method | Path | Access |
|---|---|---|
| `GET` | `/api/contacts` | Authenticated |
| `POST` | `/api/contacts` | ADMIN, MANAGER |
| `PUT` | `/api/contacts/:id` | ADMIN, MANAGER |
| `DELETE` | `/api/contacts/:id` | ADMIN |
| `DELETE` | `/api/contacts` | ADMIN (bulk) |
| `POST` | `/api/contacts/import` | ADMIN, MANAGER |
| `POST` | `/api/contacts/deduplicate` | ADMIN |

### SMTP
| Method | Path | Access |
|---|---|---|
| `GET` | `/api/smtp/config` | ADMIN |
| `POST` | `/api/smtp/test` | ADMIN |

### Logs & Scheduler
| Method | Path | Access |
|---|---|---|
| `GET` | `/api/logs` | ADMIN |
| `GET` | `/api/scheduler` | ADMIN |
| `POST` | `/api/scheduler/toggle` | ADMIN |
| `GET` | `/api/dashboard` | Authenticated |

---

## Roles & Permissions

| Role | Campaigns | Contacts | Users | SMTP | Logs | Scheduler |
|---|---|---|---|---|---|---|
| `ADMIN` | ✅ full | ✅ full | ✅ | ✅ | ✅ | ✅ |
| `MANAGER` | ✅ no delete | ✅ no delete | ❌ | ❌ | ❌ | ❌ |
| `USER` | Read only | Read only | ❌ | ❌ | ❌ | ❌ |

---

## Logging

Log files are written to date-specific folders with daily rotation (30 days, 20 MB per file):

```text
logs/
└── 2026-08-04/
    ├── app.log
    ├── debug.log
    ├── error.log
    ├── email-sending.log
    ├── info.log
    ├── success.log
    └── warn.log
```

Every entry uses the same structured format, including the timestamp, level, source
location, message, and additional data:

```text
[2026-08-04 10:30:13] [SUCCESS] (src/index.ts:18) {"message":"Server running on http://localhost:5000","data":{}}
```

Set `LOG_LEVEL=debug` when debug entries are needed. Supported levels are `error`,
`warn`, `success`, `info`, `http`, `verbose`, `debug`, and `silly`.

| File | Content |
|---|---|
| `YYYY-MM-DD/app.log` | All application logs |
| `YYYY-MM-DD/<level>.log` | Entries for one exact level, including `success`, `debug`, and `error` |
| `YYYY-MM-DD/email-sending.log` | Email send/fail events |
