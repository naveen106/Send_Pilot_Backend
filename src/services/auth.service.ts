import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../config/database';
import { createTransporter } from '../config/smtp';
import logger from '../utils/logger';
import { JwtPayload, Role } from '../types';
import { getJwtSecret } from '../config/env';

export async function ensureAdminExists(): Promise<void> {
  const email = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
  if (!email) {
    logger.warn('ADMIN_EMAIL (or SMTP_USER) not set — skipping admin auto-creation');
    return;
  }

  const resetPassword = process.env.ADMIN_RESET_PASSWORD === 'true';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (!resetPassword) {
      logger.info(`Admin account already exists: ${email}`);
      return;
    }

    const password = crypto.randomBytes(18).toString('base64url');
    const hashed = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: existing.id },
      data: { password: hashed, role: 'ADMIN', isActive: true, resetToken: null, resetTokenExpiry: null },
    });

    logger.warn(`Admin password reset for ${email}. Change it after first login.`);
    logger.warn(`ADMIN LOGIN — email: ${email} | password: ${password}`);
    return;
  }

  // Never use a placeholder/configured password for runtime auto-creation.
  // Generate it here so the value printed to the console is the real login password.
  const password = crypto.randomBytes(18).toString('base64url');
  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { email, password: hashed, name: 'Admin', role: 'ADMIN' },
  });

  logger.success('Admin account created', { email });
  logger.warn(`ADMIN LOGIN — email: ${email} | password: ${password}`);
  logger.warn('Change the admin password after the first login');
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    logger.warn(`Failed login attempt for email: ${email}`);
    throw new Error('Invalid credentials');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    logger.warn(`Wrong password for email: ${email}`);
    throw new Error('Invalid credentials');
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const payload: JwtPayload = { userId: user.id, email: user.email, role: user.role as Role };
  const token = jwt.sign(payload, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  } as jwt.SignOptions);

  logger.info(`User logged in: ${email} [${user.role}]`);
  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, lastLoginAt: user.lastLoginAt },
  };
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return;

  const token = crypto.randomBytes(32).toString('hex');
  const expiry = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken: token, resetTokenExpiry: expiry },
  });

  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
  const transporter = createTransporter();

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: email,
    subject: 'Password Reset Request',
    html: `
      <p>Hi ${user.name},</p>
      <p>Click the link below to reset your password. This link expires in 1 hour.</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>If you didn't request this, ignore this email.</p>
    `,
  });

  logger.info(`Password reset email sent to: ${email}`);
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { resetToken: token } });

  if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
    throw new Error('Invalid or expired reset token');
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, resetToken: null, resetTokenExpiry: null },
  });

  logger.info(`Password reset for: ${user.email}`);
}
