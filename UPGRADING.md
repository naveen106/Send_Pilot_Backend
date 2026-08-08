# Upgrade guide

## Supported toolchain

- Node.js 24.18.0
- npm 10 or newer
- MySQL 8 or newer

## Routine verification

```bash
npm ci
npm run check
npm run prisma:generate
```

For production database changes, review the SQL migration and deploy it with
`npm run prisma:migrate`.

## Upgrade procedure

1. Change one dependency or Docker version at a time.
2. Run `npm install` and commit the updated lockfile.
3. Run `npm run check` and `npm audit`.
4. Review Prisma migrations before production deployment.
5. Build and run the Docker image against a staging database.

Keep the Node version in `package.json`, Dockerfile, and local development aligned.
