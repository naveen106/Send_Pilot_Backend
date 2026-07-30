import { Response } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../types';
import * as campaignService from '../services/campaign.service';

export const campaignValidation = [
  body('name').notEmpty().trim(),
  body('subject').notEmpty().trim(),
  body('htmlContent').notEmpty(),
  body('recipients').customSanitizer((v) => (Array.isArray(v) ? v : v ? [v] : [])),
  body('recipients').isArray({ min: 1 }).withMessage('At least one recipient is required'),
  body('recipients.*').isEmail().withMessage('Each recipient must be a valid email'),
];

export async function create(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, subject, htmlContent, scheduledAt, sendMode } = req.body;
    const recipients: string[] = req.body['recipients'] ?? [];
    const files = (req.files as Express.Multer.File[]) ?? [];
    const attachments = files.map((f) => ({
      filename: f.originalname,
      content: f.buffer.toString('base64'),
      contentType: f.mimetype,
    }));
    const campaign = await campaignService.createCampaign({
      name, subject, htmlContent,
      recipients: recipients as string[],
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      sendMode: sendMode || 'immediate',
      createdBy: req.user!.userId,
      attachments,
    });
    res.status(201).json({ success: true, message: 'Campaign created', data: campaign });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
}

export async function getAll(req: AuthRequest, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const result = await campaignService.getCampaigns(page, limit);
  res.json({ success: true, data: result });
}

export async function getOne(req: AuthRequest, res: Response): Promise<void> {
  const campaign = await campaignService.getCampaignById(parseInt(req.params.id));
  if (!campaign) { res.status(404).json({ success: false, message: 'Not found' }); return; }
  res.json({ success: true, data: campaign });
}

export async function sendNow(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await campaignService.sendCampaignNow(parseInt(req.params.id));
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
}

export async function retry(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await campaignService.sendCampaignNow(parseInt(req.params.id));
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
}

export async function remove(req: AuthRequest, res: Response): Promise<void> {
  try {
    await campaignService.deleteCampaign(parseInt(req.params.id));
    res.json({ success: true, message: 'Campaign deleted' });
  } catch (error) {
    res.status(400).json({ success: false, message: (error as Error).message });
  }
}

export async function getDashboard(_req: AuthRequest, res: Response): Promise<void> {
  const stats = await campaignService.getDashboardStats();
  res.json({ success: true, data: stats });
}
