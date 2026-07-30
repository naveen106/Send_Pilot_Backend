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
| `DATABASE_URL` | MySQL connection string | `mysql://root:password@localhost:3306/bulk_email_sender` |
| `PORT` | Server port | `5000` |
| `NODE_ENV` | Environment | `development` |
| `JWT_SECRET` | Secret key for signing JWTs | — |
| `JWT_EXPIRES_IN` | JWT expiry duration | `7d` |
| `SMTP_HOST` | SMTP server host | — |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_SECURE` | Use TLS | `false` |
| `SMTP_USER` | SMTP username / sender email | — |
| `SMTP_PASS` | SMTP password / app password | — |
| `DAILY_EMAIL_LIMIT` | Max emails sent per day | `500` |
| `BATCH_SIZE` | Emails per batch | `10` |
| `RANDOM_DELAY_MIN` | Min delay between emails (ms) | `1000` |
| `RANDOM_DELAY_MAX` | Max delay between emails (ms) | `3000` |
| `SCHEDULER_ENABLED` | Enable cron scheduler | `true` |
| `FRONTEND_URL` | Frontend URL for password reset links | `http://localhost:3000` |
| `LOG_LEVEL` | Winston log level | `info` |
| `LOG_DIR` | Directory for log files | `logs` |

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
│   └── seed.ts            # Database seeder
├── src/
│   ├── config/
│   │   ├── database.ts    # Prisma client + connection validation
│   │   └── smtp.ts        # Nodemailer transporter factory
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── campaign.controller.ts
│   │   ├── contact.controller.ts
│   │   ├── logs.controller.ts
│   │   └── smtp.controller.ts
│   ├── middleware/
│   │   ├── auth.ts        # JWT authenticate + authorize guards
│   │   ├── logging.ts     # Request logger + global error handler
│   │   └── validation.ts  # express-validator result handler
│   ├── routes/
│   │   └── index.ts       # All route definitions
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── campaign.service.ts
│   │   ├── contact.service.ts
│   │   ├── email.service.ts   # Batch sending with daily limit & retry
│   │   └── scheduler.service.ts # node-cron scheduled campaign runner
│   ├── types/
│   │   └── index.ts       # Shared TypeScript types
│   ├── utils/
│   │   └── logger.ts      # Winston loggers (app, api, email, smtp, scheduler)
│   ├── app.ts             # Express app setup
│   └── index.ts           # Entry point
├── logs/                  # Auto-generated daily rotating log files
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

### Contacts
| Method | Path | Access |
|---|---|---|
| `GET` | `/api/contacts` | Authenticated |
| `POST` | `/api/contacts` | ADMIN, MANAGER |
| `PUT` | `/api/contacts/:id` | ADMIN, MANAGER |
| `DELETE` | `/api/contacts/:id` | ADMIN |
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
| `ADMIN` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `MANAGER` | ✅ (no delete) | ✅ (no delete) | ❌ | ❌ | ❌ | ❌ |
| `USER` | Read only | Read only | ❌ | ❌ | ❌ | ❌ |

---

## Logging

Log files are written to the `logs/` directory with daily rotation (max 30 days, 20 MB per file):

| File | Content |
|---|---|
| `app-YYYY-MM-DD.log` | All application logs |
| `error-YYYY-MM-DD.log` | Error-level logs only |
| `warn-YYYY-MM-DD.log` | Warn-level logs only |
| `api-YYYY-MM-DD.log` | HTTP request logs |
| `email-sending-YYYY-MM-DD.log` | Email send/fail events |
| `smtp-YYYY-MM-DD.log` | SMTP connection events |
| `scheduler-YYYY-MM-DD.log` | Scheduler tick events |
