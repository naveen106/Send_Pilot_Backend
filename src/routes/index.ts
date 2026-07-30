import { Router } from 'express';
import multer from 'multer';
import { body } from 'express-validator';
import { authenticate, authorize } from '../middleware/auth';
import { validate } from '../middleware/validation';

import * as authCtrl from '../controllers/auth.controller';
import * as campaignCtrl from '../controllers/campaign.controller';
import * as contactCtrl from '../controllers/contact.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Auth ────────────────────────────────────────────────────────────────────
router.post('/auth/login', authCtrl.loginValidation, validate, authCtrl.login);
router.post('/auth/forgot-password', body('email').isEmail().normalizeEmail(), validate, authCtrl.forgotPassword);
router.post('/auth/reset-password', body('token').notEmpty(), body('password').isLength({ min: 6 }), validate, authCtrl.resetPassword);
router.get('/auth/me', authenticate, authCtrl.getMe);

// ─── Dashboard ───────────────────────────────────────────────────────────────
router.get('/dashboard', authenticate, campaignCtrl.getDashboard);

// ─── Campaigns ───────────────────────────────────────────────────────────────
router.get('/campaigns', authenticate, campaignCtrl.getAll);
router.post('/campaigns', authenticate, authorize('ADMIN', 'MANAGER'), campaignCtrl.campaignValidation, validate, campaignCtrl.create);
router.get('/campaigns/:id', authenticate, campaignCtrl.getOne);
router.post('/campaigns/:id/send', authenticate, authorize('ADMIN', 'MANAGER'), campaignCtrl.sendNow);
router.post('/campaigns/:id/retry', authenticate, authorize('ADMIN', 'MANAGER'), campaignCtrl.retry);
router.delete('/campaigns/:id', authenticate, authorize('ADMIN'), campaignCtrl.remove);

// ─── Contacts ────────────────────────────────────────────────────────────────
router.get('/contacts', authenticate, contactCtrl.getAll);
router.post('/contacts', authenticate, authorize('ADMIN', 'MANAGER'), contactCtrl.add);
router.put('/contacts/:id', authenticate, authorize('ADMIN', 'MANAGER'), contactCtrl.update);
router.delete('/contacts/:id', authenticate, authorize('ADMIN'), contactCtrl.remove);
router.post('/contacts/import', authenticate, authorize('ADMIN', 'MANAGER'), upload.single('file'), contactCtrl.importContacts);
router.post('/contacts/deduplicate', authenticate, authorize('ADMIN'), contactCtrl.deduplicate);

export default router;
