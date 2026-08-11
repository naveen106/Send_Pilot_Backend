import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import prisma from '../config/database';
import { getJwtSecret } from '../config/env';
import { JwtPayload, Role } from '../types';

type TokenUser = {
  id: number;
  email: string;
  role: Role;
  tokenVersion: number;
};

const REFRESH_TOKEN_LIFETIME_MS = 1000 * 60 * 60 * 24 * 30;

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Creates a short-lived, user-revocable access token. */
export function issueAccessToken(user: TokenUser): string {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
  };

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  } as jwt.SignOptions);
}

/**
 * Reads current authorization data from the database. This prevents stale
 * roles, email addresses, and account status from being trusted from a JWT.
 */
export async function getCurrentTokenUser(payload: JwtPayload): Promise<JwtPayload | null> {
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, role: true, isActive: true, tokenVersion: true },
  });

  if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
    role: user.role as Role,
    tokenVersion: user.tokenVersion,
  };
}

/** Revokes every access token currently issued for the user. */
export async function revokeUserTokens(userId: number): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } }),
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}

/** Creates a random refresh token and stores only its hash. */
export async function issueRefreshToken(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashRefreshToken(token),
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS),
    },
  });
  return token;
}

/**
 * Rotates a refresh token. Reusing a revoked token revokes every session for
 * that user, which protects against refresh-token theft and replay.
 */
export async function rotateRefreshToken(token: string): Promise<{ accessToken: string; refreshToken: string }> {
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
    include: { user: true },
  });

  if (!stored || stored.expiresAt <= new Date()) {
    throw new Error('Invalid or expired refresh token');
  }

  if (stored.revokedAt) {
    await revokeUserTokens(stored.userId);
    throw new Error('Refresh token reuse detected');
  }

  if (!stored.user.isActive) {
    throw new Error('Account is inactive');
  }

  const refreshToken = crypto.randomBytes(32).toString('base64url');
  const accessToken = issueAccessToken({
    id: stored.user.id,
    email: stored.user.email,
    role: stored.user.role,
    tokenVersion: stored.user.tokenVersion,
  });

  const rotated = await prisma.$transaction(async (transaction) => {
    // The conditional update makes rotation one-time-use even if two requests
    // try to refresh the same token at the same time.
    const revoked = await transaction.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) return false;

    await transaction.refreshToken.create({
      data: {
        tokenHash: hashRefreshToken(refreshToken),
        userId: stored.userId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS),
      },
    });
    return true;
  });

  if (!rotated) {
    await revokeUserTokens(stored.userId);
    throw new Error('Refresh token reuse detected');
  }

  return { accessToken, refreshToken };
}
