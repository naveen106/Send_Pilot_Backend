import { Request } from 'express';

export type Role = 'ADMIN' | 'USER' | 'MANAGER';

export interface JwtPayload {
  userId: number;
  email: string;
  role: Role;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export interface PaginationQuery {
  page?: string;
  limit?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

/** Campaign send strategies — controls how emails are dispatched. */
export const SEND_MODES = {
  IMMEDIATE: 'immediate',
  SCHEDULED: 'scheduled',
  INTERVAL: 'interval',
} as const;

export type SendMode = typeof SEND_MODES[keyof typeof SEND_MODES];

/** A file attachment stored as base64 content alongside its metadata. */
export interface MailAttachment {
  filename: string;
  content: string;      // base64-encoded file content
  contentType: string;
}
