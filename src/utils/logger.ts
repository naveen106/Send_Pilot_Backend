import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const LOG_DIR = process.env.LOG_DIR || 'logs';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${stack || message}`;
});

const dailyRotateOptions = (filename: string, level?: string) => ({
  dirname: LOG_DIR,
  filename: `${filename}-%DATE%.log`,
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  ...(level ? { level } : {}),
});

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat),
    }),
    new DailyRotateFile(dailyRotateOptions('app')),
    new DailyRotateFile(dailyRotateOptions('error', 'error')),
  ],
});

export const emailLogger = winston.createLogger({
  level: 'debug',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
  transports: [
    new DailyRotateFile({ ...dailyRotateOptions('email-sending'), level: 'debug' }),
  ],
});

export default logger;
