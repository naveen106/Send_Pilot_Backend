#!/bin/sh
set -e

# The database must be reachable before migrations can be applied.
npm run prisma:migrate
exec npm start
