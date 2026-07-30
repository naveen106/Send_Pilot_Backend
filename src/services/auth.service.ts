import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../config/database';
import { createTransporter } from '../config/smtp';
import logger from '../utils/logger';
import { JwtPayload, Role } from '../types';

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
  const token = jwt.sign(payload, process.env.JWT_SECRET || 'secret', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  } as jwt.SignOptions);

  logger.info(`User logged in: ${email} [${user.role}]`);
  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, lastLoginAt: user.lastLoginAt },
  };
}

/** Public self-registration — always creates USER role. */
export async function publicRegisterUser(email: string, password: string, name: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('Email already registered');

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, password: hashed, name, role: 'USER' },
  });

  logger.info(`New user self-registered: ${email}`);
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/** Admin-only registration — can assign any role. */
export async function registerUser(email: string, password: string, name: string, role: Role = 'USER') {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('Email already registered');

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { email, password: hashed, name, role } });

  logger.info(`New user registered: ${email} [${role}]`);
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  // Always respond the same way to avoid email enumeration
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

export async function getAllUsers() {
  return prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
  });
}

export async function updateUserRole(userId: number, role: Role) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, email: true, name: true, role: true },
  });
  logger.info(`User ${user.email} role updated to ${role}`);
  return user;
}

export async function toggleUserStatus(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive: !user.isActive },
    select: { id: true, email: true, isActive: true },
  });
  logger.info(`User ${updated.email} status set to ${updated.isActive ? 'active' : 'inactive'}`);
  return updated;
}
