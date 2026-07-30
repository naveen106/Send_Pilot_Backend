import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { validateDatabaseConnection } from './config/database';
import { ensureAdminExists } from './services/auth.service';
import logger from './utils/logger';

const PORT = parseInt(process.env.PORT || '5000');

async function bootstrap() {
  await validateDatabaseConnection();
  await ensureAdminExists();

  app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
