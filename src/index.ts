import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { validateDatabaseConnection } from './config/database';
import { validateEnvironment } from './config/env';
import { ensureAdminExists } from './services/auth.service';
import { startScheduler } from './services/scheduler.service';
import logger from './utils/logger';

const PORT = parseInt(process.env.PORT || '5000');

async function bootstrap() {
  validateEnvironment();
  await validateDatabaseConnection();
  await ensureAdminExists();
  startScheduler();

  app.listen(PORT, () => {
    logger.success(`Server running on http://localhost:${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
