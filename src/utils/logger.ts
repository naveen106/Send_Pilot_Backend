import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const LOG_DIR = process.env.LOG_DIR || 'logs';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, stack, context }) => {
  const ctx = context ? ` [${context}]` : '';
  return `${timestamp}${ctx} [${level.toUpperCase()}]: ${stack || message}`;
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
    // Console
    new winston.transports.Console({
      format: combine(colorize(), timestamp({ format: 'HH:mm:ss' }), logFormat),
    }),
    // All logs
    new DailyRotateFile(dailyRotateOptions('app')),
    // Error only
    new DailyRotateFile(dailyRotateOptions('error', 'error')),
    // Warn only
    new DailyRotateFile(dailyRotateOptions('warn', 'warn')),
  ],
});

export const smtpLogger = winston.createLogger({
  level: 'debug',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
  transports: [
    new DailyRotateFile({ ...dailyRotateOptions('smtp'), level: 'debug' }),
  ],
});

export const emailLogger = winston.createLogger({
  level: 'debug',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
  transports: [
    new DailyRotateFile({ ...dailyRotateOptions('email-sending'), level: 'debug' }),
  ],
});

export const schedulerLogger = winston.createLogger({
  level: 'debug',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
  transports: [
    new DailyRotateFile({ ...dailyRotateOptions('scheduler'), level: 'debug' }),
  ],
});

export const apiLogger = winston.createLogger({
  level: 'info',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
  transports: [
    new DailyRotateFile({ ...dailyRotateOptions('api'), level: 'info' }),
  ],
});

export default logger;
