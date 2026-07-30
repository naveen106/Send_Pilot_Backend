import nodemailer from 'nodemailer';
import { SmtpConfig } from '../types';

export function getSmtpConfig(): SmtpConfig {
  return {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  };
}

export function createTransporter(config?: SmtpConfig) {
  const smtp = config || getSmtpConfig();
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    tls: { rejectUnauthorized: false },
  });
}

export async function testSmtpConnection(config?: SmtpConfig): Promise<boolean> {
  try {
    const transporter = createTransporter(config);
    await transporter.verify();
    return true;
  } catch {
    return false;
  }
}
