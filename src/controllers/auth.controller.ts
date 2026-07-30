import { Response } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../types';
import * as authService from '../services/auth.service';

export const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().isLength({ min: 6 }),
];

export const registerValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').notEmpty().trim(),
  body('role').optional().isIn(['ADMIN', 'USER', 'MANAGER']),
];

export const publicRegisterValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').notEmpty().trim(),
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

export async function publicRegister(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { email, password, name } = req.body;
    const user = await authService.publicRegisterUser(email, password, name);
    res.status(201).json({ success: true, message: 'Account created', data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
}

export async function register(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { email, password, name, role } = req.body;
    const user = await authService.registerUser(email, password, name, role);
    res.status(201).json({ success: true, message: 'User registered', data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
}

export async function forgotPassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    await authService.forgotPassword(req.body.email);
    // Always return success to prevent email enumeration
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

export async function getUsers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const users = await authService.getAllUsers();
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

export async function updateRole(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = parseInt(req.params.id);
    const { role } = req.body;
    const user = await authService.updateUserRole(userId, role);
    res.json({ success: true, message: 'Role updated', data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
}

export async function toggleStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = parseInt(req.params.id);
    const user = await authService.toggleUserStatus(userId);
    res.json({ success: true, message: 'Status updated', data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
}
