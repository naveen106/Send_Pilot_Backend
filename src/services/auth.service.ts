import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../config/database';
import { createTransporter } from '../config/smtp';
import logger from '../utils/logger';
import { issueAccessToken, issueRefreshToken, revokeUserTokens, rotateRefreshToken } from './auth-token.service';

export async function ensureAdminExists(): Promise<void> {
  const email = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
  if (!email) {
    logger.warn('ADMIN_EMAIL (or SMTP_USER) not set — skipping admin auto-creation');
    return;
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists){
      logger.info(`Admin account already exists: ${email}`);
      return;
  }
  else
      logger.info(`Admin account does not exist, you won't be able to log in until an admin is created. Provide ADMIN_EMAIL and ADMIN_PASSWORD in the .env file to create an admin account automatically.`);

  //if admin doesn't exist, create a new one using the info in env file.
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    logger.warn('ADMIN_PASSWORD not set — skipping admin auto-creation');
    return;
  }

  // const password = crypto.randomBytes(18).toString('base64url');
  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { email, password: hashed, name: 'Admin', role: 'ADMIN' },
  });
  logger.success('Admin account created', { email });
  
  // logger.warn(`ADMIN LOGIN — email: ${email} | password: ${password}`);
  // logger.warn('Change the admin password after the first login');
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

  const token = issueAccessToken({
    id: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
  });

  logger.info(`User logged in: ${email} [${user.role}]`);
  return {
    token,
    refreshToken: await issueRefreshToken(user.id),
    user: { id: user.id, email: user.email, name: user.name, role: user.role, lastLoginAt: user.lastLoginAt },
  };
}

export async function forgotPassword(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return false; //user not found or inactive, but don't reveal this to the client for security reasons.

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
  return true; //user exists
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { resetToken: token } });

  if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
    throw new Error('Invalid or expired reset token');
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashed,
      resetToken: null,
      resetTokenExpiry: null,
      // Keep the password change and token revocation in one database write.
      tokenVersion: { increment: 1 },
    },
  });
  await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });

  logger.info(`Password reset for: ${user.email}`);
}

export async function refreshAccessToken(refreshToken: string) {
  return rotateRefreshToken(refreshToken);
}

export async function logout(refreshToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
