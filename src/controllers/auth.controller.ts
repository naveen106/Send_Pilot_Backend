import { Response } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../types';
import * as authService from '../services/auth.service';
import { getErrorMessage, sendError, sendSuccess } from '../utils/http';
import { clearRefreshTokenCookie, getRefreshToken, setRefreshTokenCookie } from '../utils/refresh-cookie';

export const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().isLength({ min: 6 }),
];

export async function login(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser(email, password);
    setRefreshTokenCookie(res, result.refreshToken);
    const { refreshToken: _refreshToken, ...safeResult } = result;
    sendSuccess(res, safeResult, 'Login successful');
  } catch (error) {
    sendError(res, 401, getErrorMessage(error));
  }
}

export async function forgotPassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userFound = await authService.forgotPassword(req.body.email);
    if (!userFound) {
      sendError(res, 404, "User not found, so we can't reset the password.");
      return;
    }
    sendSuccess(res, undefined, 'Reset link sent successfully.');
  } catch (error) {
    // Keep provider details in server logs while returning a clear response.
    sendError(res, 500, 'Server error: we could not send the reset email. Please try again later.');
  }
}

export async function refresh(req: AuthRequest, res: Response): Promise<void> {
  try {
    const refreshToken = getRefreshToken(req);
    if (!refreshToken) {
      sendError(res, 401, 'Refresh token is required');
      return;
    }
    const result = await authService.refreshAccessToken(refreshToken);
    setRefreshTokenCookie(res, result.refreshToken);
    sendSuccess(res, { token: result.accessToken }, 'Token refreshed');
  } catch (error) {
    sendError(res, 401, getErrorMessage(error));
  }
}

export async function logout(req: AuthRequest, res: Response): Promise<void> {
  const refreshToken = getRefreshToken(req);
  if (refreshToken) await authService.logout(refreshToken);
  clearRefreshTokenCookie(res);
  sendSuccess(res, undefined, 'Logged out');
}

export async function resetPassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    await authService.resetPassword(req.body.token, req.body.password);
    sendSuccess(res, undefined, 'Password updated successfully');
  } catch (error) {
    sendError(res, 400, getErrorMessage(error));
  }
}

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  sendSuccess(res, req.user);
}
