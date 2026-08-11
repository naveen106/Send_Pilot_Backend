import { Response } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../types';
import * as authService from '../services/auth.service';
import { getErrorMessage, sendError, sendSuccess } from '../utils/http';

export const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().isLength({ min: 6 }),
];

export async function login(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser(email, password);
    sendSuccess(res, result, 'Login successful');
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
