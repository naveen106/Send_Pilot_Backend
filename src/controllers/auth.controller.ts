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
    await authService.forgotPassword(req.body.email);
    sendSuccess(res, undefined, 'If that email exists, a reset link has been sent.');
  } catch (error) {
    sendError(res, 500, getErrorMessage(error));
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
