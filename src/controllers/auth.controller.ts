import { Response } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../types';
import * as authService from '../services/auth.service';

export const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().isLength({ min: 6 }),
];

export async function login(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    const result = await authService.loginUser(email, password);
    res.json({ success: true, message: 'Login successful', data: result });
  } catch (error) {
    res.status(401).json({ success: false, message: (error as Error).message });
  }
}

export async function forgotPassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    await authService.forgotPassword(req.body.email);
    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

export async function resetPassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    await authService.resetPassword(req.body.token, req.body.password);
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
}

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  res.json({ success: true, data: req.user });
}
