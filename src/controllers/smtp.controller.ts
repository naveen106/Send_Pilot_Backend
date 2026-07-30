import { Response } from 'express';
import { AuthRequest } from '../types';
import { testSmtpConnection, getSmtpConfig } from '../config/smtp';
import { smtpLogger } from '../utils/logger';

export async function getConfig(_req: AuthRequest, res: Response): Promise<void> {
  const config = getSmtpConfig();
  res.json({
    success: true,
    data: {
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user,
      passConfigured: !!config.pass,
    },
  });
}

export async function testConnection(req: AuthRequest, res: Response): Promise<void> {
  try {
    const config = req.body.host ? req.body : undefined;
    const ok = await testSmtpConnection(config);
    smtpLogger.info(`SMTP test by ${req.user?.email}: ${ok ? 'success' : 'failed'}`);
    res.json({ success: ok, message: ok ? 'SMTP connection successful' : 'SMTP connection failed' });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}
