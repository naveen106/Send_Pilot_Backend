FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
COPY src ./src

# Prisma generation only needs a syntactically valid URL; the real URL is
# supplied at runtime through the container environment.
ENV DATABASE_URL=mysql://build:build@localhost:3306/bulk_email_sender
RUN npm run prisma:generate && npm run build

FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN mkdir -p /app/logs && chmod +x /app/docker-entrypoint.sh

USER node
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
