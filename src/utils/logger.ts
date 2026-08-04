import fs from 'node:fs/promises';
import { Dirent } from 'node:fs';
import path from 'node:path';
import winston from 'winston';
import TransportStream from 'winston-transport';

const LOG_DIR = process.env.LOG_DIR || 'logs';

/**
 * Keep the level order explicit so Winston can filter both the standard
 * levels and the application-specific `success` level consistently.
 */
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  success: 2,
  info: 3,
  http: 4,
  verbose: 5,
  debug: 6,
  silly: 7,
} as const;

export type LogLevel = keyof typeof LOG_LEVELS;

const configuredLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const LOG_LEVEL: LogLevel = Object.prototype.hasOwnProperty.call(LOG_LEVELS, configuredLevel)
  ? (configuredLevel as LogLevel)
  : 'info';

interface FileDetails {
  filePath: string;
  lineNumber: number;
}

export interface StructuredLogger {
  log(level: LogLevel, message: unknown, data?: unknown): void;
  error(message: unknown, data?: unknown): void;
  warn(message: unknown, data?: unknown): void;
  success(message: unknown, data?: unknown): void;
  info(message: unknown, data?: unknown): void;
  http(message: unknown, data?: unknown): void;
  verbose(message: unknown, data?: unknown): void;
  debug(message: unknown, data?: unknown): void;
  silly(message: unknown, data?: unknown): void;
}

const LOGGER_FILE = path.resolve(__filename);

/**
 * Convert values to JSON-safe data without allowing a circular object or an
 * Error instance to break logging while an application error is being handled.
 */
function serialize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.stack ? { stack: value.stack } : {}),
    };
  }

  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object' || value === null) return value;

  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => serialize(item, seen));

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, serialize(item, seen)])
  );
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(serialize(value)) ?? 'null';
  } catch {
    return '"[Unserializable data]"';
  }
}

/**
 * Find the first useful caller outside this logger module. Including this
 * location makes a log entry actionable without requiring a separate lookup.
 */
function getCallerFileDetails(): FileDetails {
  const stackLines = new Error().stack?.split('\n').slice(1) || [];

  for (const stackLine of stackLines) {
    // Stack frames usually look like `at method (file:line:column)`.
    const match = stackLine.match(/^\s*at\s+.*\((.+):(\d+):(\d+)\)$/)
      || stackLine.match(/^\s*at\s+(.+):(\d+):(\d+)$/);
    if (!match) continue;

    const [, rawFilePath, lineNumber] = match;
    const filePath = rawFilePath.replace(/^file:\/\//, '');
    if (path.resolve(filePath) === LOGGER_FILE || filePath.includes('node_modules')) continue;

    return {
      filePath: path.relative(process.cwd(), filePath).replace(/\\/g, '/') || filePath,
      lineNumber: Number(lineNumber),
    };
  }

  return { filePath: 'unknown', lineNumber: 0 };
}

function entryFormat() {
  return winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf((entry) => {
      const details = entry.fileDetails as FileDetails | undefined;
      const source = details
        ? `${details.filePath}:${details.lineNumber}`
        : 'unknown:0';

      // The payload stays valid JSON so log aggregators can parse it directly.
      const payload = {
        message: serialize(entry.message),
        data: serialize(entry.data ?? {}),
      };

      return `[${entry.timestamp}] [${String(entry.level).toUpperCase()}] (${source}) ${stringify(payload)}`;
    })
  );
}

function onlyLevel(level: LogLevel) {
  return winston.format((entry) => (entry.level === level ? entry : false))();
}

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const RETENTION_DAYS = 30;

function getDateFolder(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Winston's DailyRotateFile intentionally treats filenames as basenames, so
 * it cannot create `%DATE%/debug.log`. This transport keeps the same daily
 * rotation and retention behavior while placing each level in a date folder.
 */
class DateFolderTransport extends TransportStream {
  private readonly fileName: string;
  private readonly fileStates = new Map<string, { path: string; size: number; index: number }>();
  private cleanupDate = '';
  private pendingWrites = Promise.resolve();

  constructor(fileName: string, options: TransportStream.TransportStreamOptions) {
    super(options);
    this.fileName = fileName;
  }

  log(info: any, callback: () => void): void {
    const line = `${info[Symbol.for('message')] || String(info.message)}\n`;

    // Serialize writes so size checks remain accurate under concurrent sends.
    this.pendingWrites = this.pendingWrites
      .then(() => this.writeEntry(line))
      .catch((error: unknown) => {
        this.emit('error', error);
      });

    callback();
  }

  private async writeEntry(line: string): Promise<void> {
    const dateFolder = getDateFolder();
    const folderPath = path.join(LOG_DIR, dateFolder);
    await fs.mkdir(folderPath, { recursive: true });
    await this.removeExpiredFolders(dateFolder);

    const filePath = await this.getAvailableFilePath(folderPath, dateFolder, line);
    await fs.appendFile(filePath, line, 'utf8');

    const state = this.fileStates.get(`${dateFolder}/${this.fileName}`);
    if (state) state.size += Buffer.byteLength(line, 'utf8');
  }

  private async getAvailableFilePath(
    folderPath: string,
    dateFolder: string,
    line: string
  ): Promise<string> {
    const key = `${dateFolder}/${this.fileName}`;
    let state = this.fileStates.get(key);

    if (!state) {
      const filePath = path.join(folderPath, `${this.fileName}.log`);
      state = { path: filePath, size: await this.getFileSize(filePath), index: 0 };
    }

    const lineSize = Buffer.byteLength(line, 'utf8');
    if (state.size > 0 && state.size + lineSize > MAX_FILE_SIZE_BYTES) {
      state.index += 1;
      state.path = path.join(folderPath, `${this.fileName}.${state.index}.log`);
      state.size = await this.getFileSize(state.path);
    }

    this.fileStates.set(key, state);
    return state.path;
  }

  private async getFileSize(filePath: string): Promise<number> {
    try {
      return (await fs.stat(filePath)).size;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw error;
    }
  }

  private async removeExpiredFolders(currentDate: string): Promise<void> {
    if (this.cleanupDate === currentDate) return;
    this.cleanupDate = currentDate;

    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

    let entries: Dirent[];
    try {
      entries = await fs.readdir(LOG_DIR, { withFileTypes: true });
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }

    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
        .filter((entry) => new Date(`${entry.name}T00:00:00`).getTime() < cutoff.getTime())
        .map((entry) => fs.rm(path.join(LOG_DIR, entry.name), { recursive: true, force: true }))
    );
  }
}

/** Create one exact-level file inside the current date folder. */
function levelTransports() {
  return (Object.keys(LOG_LEVELS) as LogLevel[]).map((level) =>
    new DateFolderTransport(level, {
      format: winston.format.combine(onlyLevel(level), entryFormat()),
    })
  );
}

function createLogger(level: string, transports: winston.transport[]) {
  const instance = winston.createLogger({
    levels: LOG_LEVELS,
    level,
    transports,
  });

  const write = (logLevel: LogLevel, message: unknown, data?: unknown): void => {
    instance.log({
      level: logLevel,
      message: typeof message === 'string' ? message : stringify(message),
      data: data ?? {},
      fileDetails: getCallerFileDetails(),
    });
  };

  return {
    log: write,
    error: (message: unknown, data?: unknown) => write('error', message, data),
    warn: (message: unknown, data?: unknown) => write('warn', message, data),
    success: (message: unknown, data?: unknown) => write('success', message, data),
    info: (message: unknown, data?: unknown) => write('info', message, data),
    http: (message: unknown, data?: unknown) => write('http', message, data),
    verbose: (message: unknown, data?: unknown) => write('verbose', message, data),
    debug: (message: unknown, data?: unknown) => write('debug', message, data),
    silly: (message: unknown, data?: unknown) => write('silly', message, data),
  } satisfies StructuredLogger;
}

const logger = createLogger(LOG_LEVEL, [
  new winston.transports.Console({ format: entryFormat() }),
  new DateFolderTransport('app', { format: entryFormat() }),
  ...levelTransports(),
]);

/** Email events use the same structured format but remain in their own file. */
export const emailLogger = createLogger(LOG_LEVEL, [
  new DateFolderTransport('email-sending', { format: entryFormat() }),
]);

export default logger;
