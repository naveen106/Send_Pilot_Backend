import { Router } from 'express';
import multer from 'multer';
import { body } from 'express-validator';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validation';

import * as authCtrl from '../controllers/auth.controller';
import * as campaignCtrl from '../controllers/campaign.controller';
import * as contactCtrl from '../controllers/contact.controller';
import * as smtpCtrl from '../controllers/smtp.controller';
import * as logsCtrl from '../controllers/logs.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Auth ────────────────────────────────────────────────────────────────────
router.post('/auth/login', authCtrl.loginValidation, validate, authCtrl.login);
router.post('/auth/signup', authCtrl.publicRegisterValidation, validate, authCtrl.publicRegister);
router.post('/auth/forgot-password', body('email').isEmail().normalizeEmail(), validate, authCtrl.forgotPassword);
router.post('/auth/reset-password', body('token').notEmpty(), body('password').isLength({ min: 6 }), validate, authCtrl.resetPassword);
router.post('/auth/register', authenticate, authorize('ADMIN'), authCtrl.registerValidation, validate, authCtrl.register);
router.get('/auth/me', authenticate, authCtrl.getMe);

// ─── User Management (Admin only) ────────────────────────────────────────────
router.get('/users', authenticate, authorize('ADMIN'), authCtrl.getUsers);
router.patch('/users/:id/role', authenticate, authorize('ADMIN'), authCtrl.updateRole);
router.patch('/users/:id/toggle', authenticate, authorize('ADMIN'), authCtrl.toggleStatus);

// ─── Dashboard ───────────────────────────────────────────────────────────────
router.get('/dashboard', authenticate, campaignCtrl.getDashboard);

// ─── Campaigns ───────────────────────────────────────────────────────────────
router.get('/campaigns', authenticate, campaignCtrl.getAll);
router.post('/campaigns', authenticate, authorize('ADMIN', 'MANAGER'), campaignCtrl.campaignValidation, validate, campaignCtrl.create);
router.get('/campaigns/:id', authenticate, campaignCtrl.getOne);
router.post('/campaigns/:id/send', authenticate, authorize('ADMIN', 'MANAGER'), campaignCtrl.sendNow);
router.post('/campaigns/:id/retry', authenticate, authorize('ADMIN', 'MANAGER'), campaignCtrl.retry);

// ─── Contacts ────────────────────────────────────────────────────────────────
router.get('/contacts', authenticate, contactCtrl.getAll);
router.post('/contacts', authenticate, authorize('ADMIN', 'MANAGER'), contactCtrl.add);
router.put('/contacts/:id', authenticate, authorize('ADMIN', 'MANAGER'), contactCtrl.update);
router.delete('/contacts/:id', authenticate, authorize('ADMIN'), contactCtrl.remove);
router.post('/contacts/import', authenticate, authorize('ADMIN', 'MANAGER'), upload.single('file'), contactCtrl.importContacts);
router.post('/contacts/deduplicate', authenticate, authorize('ADMIN'), contactCtrl.deduplicate);

// ─── SMTP ─────────────────────────────────────────────────────────────────────
router.get('/smtp/config', authenticate, authorize('ADMIN'), smtpCtrl.getConfig);
router.post('/smtp/test', authenticate, authorize('ADMIN'), smtpCtrl.testConnection);

// ─── Logs & Scheduler ────────────────────────────────────────────────────────
router.get('/logs', authenticate, authorize('ADMIN'), logsCtrl.getLogs);
router.get('/scheduler', authenticate, authorize('ADMIN'), logsCtrl.getSchedulerInfo);
router.post('/scheduler/toggle', authenticate, authorize('ADMIN'), logsCtrl.toggleScheduler);

export default router;
