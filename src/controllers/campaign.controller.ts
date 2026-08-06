import { Response } from 'express';
import { body } from 'express-validator';
import { AuthRequest, SendMode } from '../types';
import * as campaignService from '../services/campaign.service';
import { getErrorMessage, getPagination, sendError, sendSuccess } from '../utils/http';

// ─── Validation ───────────────────────────────────────────────────────────────

/** express-validator rules applied to campaign create/update requests. */
export const campaignValidation = [
  body('name').notEmpty().trim(),
  body('subject').notEmpty().trim(),
  body('htmlContent').notEmpty(),
  body('recipients').customSanitizer((v) => (Array.isArray(v) ? v : v ? [v] : [])),
  // Campaigns may be created empty and populated later through contact assignment.
  body('recipients').isArray().withMessage('Recipients must be an array'),
  body('recipients.*').isEmail().withMessage('Each recipient must be a valid email'),
];

// ─── Controllers ──────────────────────────────────────────────────────────────

/** Creates a new campaign and kicks off sending (or schedules it). */
export async function create(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, subject, htmlContent, scheduledAt, sendMode } = req.body;
    const dailyLimit = req.body.dailyLimit === undefined ? undefined : Number(req.body.dailyLimit);
    const recipients: string[] = req.body['recipients'] ?? [];
    const files = (req.files as Express.Multer.File[]) ?? [];

    const attachments = files.map((f) => ({
      filename: f.originalname,
      content: f.buffer.toString('base64'),
      contentType: f.mimetype,
    }));

    const campaign = await campaignService.createCampaign({
      name, subject, htmlContent,
      recipients,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      sendMode: sendMode || 'immediate',
      dailyLimit,
      createdBy: req.user!.userId,
      attachments,
    });

    sendSuccess(res, campaign, 'Campaign created', 201);
  } catch (error) {
    sendError(res, 400, getErrorMessage(error));
  }
}

/** Returns a paginated list of campaigns. */
export async function getAll(req: AuthRequest, res: Response): Promise<void> {
  const { page, limit } = getPagination(req.query, 10);
  // Keep search optional so existing campaign-list consumers retain the same
  // endpoint behavior when no search term is supplied.
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
  const result = await campaignService.getCampaigns(page, limit, search);
  sendSuccess(res, result);
}

/** Returns a single campaign by ID. */
export async function getOne(req: AuthRequest, res: Response): Promise<void> {
  const campaign = await campaignService.getCampaignById(parseInt(req.params.id));
  if (!campaign) { sendError(res, 404, 'Not found'); return; }
  sendSuccess(res, campaign);
}

/**
 * Triggers an immediate send for a campaign.
 * Shared by both the /send and /retry routes — the intent differs but the action is identical.
 */
export async function sendNow(req: AuthRequest, res: Response): Promise<void> {
  try {
    const requestedMode = req.body?.sendMode as SendMode | undefined;
    const requestedLimit = req.body?.dailyLimit === undefined ? undefined : Number(req.body.dailyLimit);
    const retryFailed = req.body?.retryFailed === true;
    const scheduledAt = req.body?.scheduledAt ? new Date(req.body.scheduledAt) : undefined;
    const result = await campaignService.sendCampaignNow(parseInt(req.params.id), requestedMode, scheduledAt, requestedLimit, retryFailed);
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, 400, getErrorMessage(error));
  }
}

/** Retries only recipients with recorded failures. */
export async function retry(req: AuthRequest, res: Response): Promise<void> {
  req.body = { ...(req.body ?? {}), retryFailed: true };
  return sendNow(req, res);
}

/**
 * Queues contacts for one or more existing campaigns.
 * Body: { campaignIds: number[], emails: string[] }
 */
export async function assign(req: AuthRequest, res: Response): Promise<void> {
  try {
    const campaignIds: number[] = req.body.campaignIds;
    const emails: string[] = req.body.emails;

    if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
      sendError(res, 400, 'Select at least one campaign');
      return;
    }
    if (!Array.isArray(emails) || emails.length === 0) {
      sendError(res, 400, 'Select at least one contact');
      return;
    }

    const result = await campaignService.assignContactsToCampaigns(campaignIds, emails);
    sendSuccess(res, result, 'Contacts assigned to campaigns');
  } catch (error) {
    sendError(res, 400, getErrorMessage(error));
  }
}

/** Deletes a single campaign by ID. */
export async function remove(req: AuthRequest, res: Response): Promise<void> {
  try {
    await campaignService.deleteCampaign(parseInt(req.params.id));
    sendSuccess(res, undefined, 'Campaign deleted');
  } catch (error) {
    sendError(res, 400, getErrorMessage(error));
  }
}

/** Deletes multiple campaigns by ID array provided in request body. */
export async function bulkRemove(req: AuthRequest, res: Response): Promise<void> {
  try {
    const ids: number[] = req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      sendError(res, 400, 'No ids provided');
      return;
    }
    const result = await campaignService.bulkDeleteCampaigns(ids);
    sendSuccess(res, result);
  } catch (error) {
    sendError(res, 400, getErrorMessage(error));
  }
}

